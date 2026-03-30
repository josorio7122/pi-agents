# Part 9: Extension Entry Point

## Goal
Wire everything together into the Pi extension entry point. Discovery on load, tool registration, command registration, event handling.

## Dependencies
- All previous parts

## Files

### `src/index.ts`
The extension default export. Minimal glue — delegates to feature modules.

### `src/index.test.ts`
Smoke test: extension loads without errors, registers expected tools and commands.

## Design

### Extension Lifecycle

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let agents: AgentConfig[] = [];

  // 1. Discover agents on session start
  pi.on("session_start", async (_event, ctx) => {
    const result = discoverAgents({
      projectDir: path.join(ctx.cwd, ".pi", "agents"),
      userDir: path.join(getAgentDir(), "agents"),
    });

    agents = result.agents;

    // Report diagnostics
    for (const d of result.diagnostics) {
      ctx.ui.notify(`[pi-agents] ${d.level}: ${d.filePath} — ${d.message}`, d.level === "error" ? "error" : "warning");
    }

    // Bootstrap knowledge files
    await bootstrapKnowledge(agents);

    // Register the agent tool (now that we know what agents exist)
    registerAgentTool({ pi, agents, ctx });

    // Notify
    if (agents.length > 0) {
      ctx.ui.notify(`[pi-agents] ${agents.length} agent(s) loaded`, "info");
    }
  });

  // 2. Register /agents command
  registerAgentsCommand({ pi, getAgents: () => agents });
}
```

### Agent Tool Registration

The `agent` tool is registered inside `session_start` (not at load time) because:
1. We need `ctx` for `authStorage`, `modelRegistry`, `cwd`
2. We need discovered agents for `promptGuidelines`
3. `pi.registerTool()` works after startup (Pi supports dynamic tool registration)

```typescript
function registerAgentTool(params: {
  pi: ExtensionAPI;
  agents: readonly AgentConfig[];
  ctx: ExtensionContext;
}): void {
  const tool = createAgentTool({
    agents: params.agents,
    authStorage: params.ctx.modelRegistry,  // Access via ctx
    modelRegistry: params.ctx.modelRegistry,
    sessionDir: // resolved from ctx
    conversationLogPath: // resolved from agent conversation.path
  });

  params.pi.registerTool(tool);
}
```

### `/agents` Command

Registered at load time (commands don't need ctx to register, only to execute):

```typescript
function registerAgentsCommand(params: {
  pi: ExtensionAPI;
  getAgents: () => readonly AgentConfig[];
}): void {
  params.pi.registerCommand("agents", {
    description: "List available agents",
    handler: async (_args, ctx) => {
      const agents = params.getAgents();
      // ... format and display
    },
  });
}
```

Uses a getter (`getAgents`) so the command always shows the latest discovered agents (after `/reload`).

### Reload Support

When Pi fires `/reload`:
1. `session_start` fires again (Pi's reload behavior)
2. Discovery runs again → agents list refreshed
3. Tool re-registered with updated agents
4. `/agents` command automatically uses new list (via getter)

### Conversation Log Path Resolution

Each agent's `conversation.path` contains `{{SESSION_ID}}`. Resolved at invocation time:

```typescript
function resolveConversationPath(template: string, sessionId: string): string {
  return template.replace("{{SESSION_ID}}", sessionId);
}
```

Session ID is generated once per Pi session (UUID or hash).

### Agent List in System Prompt

The LLM needs to know what agents are available. Injected via `promptGuidelines` on the tool:

```typescript
promptGuidelines: [
  "Available agents:",
  ...agents.map(a => `- ${a.frontmatter.icon} ${a.frontmatter.name}: ${a.frontmatter.description}`),
]
```

This means the parent LLM sees all agents in its system prompt and can decide which to invoke.

## Tests

### Smoke test
- Extension function executes without throwing
- After simulated `session_start`, agents are discoverable
- Tool is registered with correct name ("agent")
- Command is registered with correct name ("agents")

### Integration considerations
- Full integration test requires Pi SDK — may need to be manual or use `createAgentSession` test harness
- Unit tests for wiring logic (discovery → tool registration → command) can use mocks

## Commit
`feat: extension entry point — wire discovery, tool, and command`

---

## Post-Implementation

### Manual Smoke Test Checklist
1. `pi -e ./src/index.ts` loads without errors
2. `/agents` shows discovered agents with icons and colors
3. LLM can call agent tool with `{ agent: "...", task: "..." }`
4. Agent runs, shows `thinking...`, then output with usage stats
5. Ctrl+O expands to show tool trace
6. Parallel mode works (2 agents concurrently)
7. Chain mode works (output flows via `{previous}`)
8. Domain violations show clear error message
9. Knowledge files created on first run
10. Knowledge files updated by agent after task
