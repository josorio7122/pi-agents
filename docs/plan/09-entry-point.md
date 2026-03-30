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

  let sessionId = "";

  // 1. Discover agents on session start
  pi.on("session_start", async (_event, ctx) => {
    sessionId = crypto.randomUUID();

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

### Smoke test (uses faux provider)
- Extension function executes without throwing
- After simulated `session_start`, agents are discoverable
- Tool is registered with correct name ("agent")
- Command is registered with correct name ("agents")
- Session ID generated and unique per session_start
- Conversation path resolved with session ID

### Integration considerations
- Full integration test requires Pi SDK — may need to be manual or use `createAgentSession` test harness
- Unit tests for wiring logic (discovery → tool registration → command) can use mocks

## Commit
`feat: extension entry point — wire discovery, tool, and command`

---

## Integration Test (`scripts/test-agent.ts`)

A standalone script for testing agents during development. Not a vitest test — a dev tool that hits a real LLM.

### Usage
```bash
npx tsx scripts/test-agent.ts .pi/agents/backend-dev.md "List the key files in this project"
```

### What It Does
1. Parse the agent `.md` file
2. Validate all 7 frontmatter blocks
3. Assemble the full system prompt (read skills, knowledge, empty conversation log)
4. Create a session via SDK (`createAgentSession` + `SessionManager.inMemory()`)
5. Run the task
6. Print: output, metrics (tokens, cost, turns, tools called)
7. Dispose session

### Design
```typescript
// scripts/test-agent.ts
// Pure orchestration — reads args, calls functions, prints results.

const [agentPath, task] = process.argv.slice(2);
// ... validate args
// ... parseAgentFile → validateAgent → assembleSystemPrompt → createAgentSession → prompt
// ... print output + metrics
```

Uses the same functions as the extension — no separate code path. If the script works, the extension works.

### Gated Integration Tests

For CI, add optional integration tests gated behind `RUN_INTEGRATION=true`:

```typescript
import { describe, it, expect } from "vitest";

describe.skipIf(!process.env.RUN_INTEGRATION)("integration", () => {
  it("runs a test agent end-to-end", async () => {
    // Uses anthropic/claude-haiku-4-5 (cheapest)
    // Verifies: discovery → assembly → session → prompt → output
  });

  it("agent updates project knowledge after task", async () => {
    // 1. Create agent with mental-model skill + empty project knowledge file
    // 2. Run agent on a task that requires reading files
    // 3. Verify project knowledge file was modified (size > 0 or content changed)
    // Self-enhancement is purely prompt-driven:
    //   - The mental-model.md skill instructs the agent to update
    //   - The agent uses the write tool to update the YAML
    //   - No hooks, no automation — just a well-written skill
  });

  it("agent updates general knowledge after task", async () => {
    // Same as above but for general knowledge file
    // Verifies the agent generalizes learnings
  });
});
```

Cost: ~$0.001 per test run (haiku, short prompt).

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
