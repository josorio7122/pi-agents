# Extension Design — pi-agents

> The extension deploys agents. It discovers them, validates them, assembles their context, invokes them via the Pi SDK, records the conversation, and renders the UI.
> The agent `.md` file never changes. The extension is the glue.

---

## Scope

This extension handles **individual agent invocation**. It does NOT handle teams, delegation, or multi-agent orchestration — that's a future layer built on top of this.

What it does:
- Discover and validate agent `.md` files
- Expose a `/agents` command to list them
- Register an `agent` tool the LLM can call (single, parallel, chain)
- Invoke agents via the Pi SDK (`createAgentSession`)
- Enforce frontmatter constraints (domain, role-tool alignment)
- Manage the conversation log (append-only, extension is sole writer)
- Render real-time agent activity inline in tool output

---

## Architecture

```
pi-agents extension (index.ts)
│
├── Discovery (on session_start + /reload)
│   ├── Scan .pi/agents/*.md and ~/.pi/agent/agents/*.md
│   ├── Parse frontmatter (7 required blocks)
│   ├── Validate: all blocks present, role-tool alignment
│   ├── Create empty knowledge files if missing
│   └── Store agent configs in memory
│
├── /agents command
│   └── List all agents: icon + colored name + description
│
├── "agent" tool (registered via pi.registerTool)
│   ├── LLM calls it to invoke agents
│   ├── Modes: single | parallel | chain
│   ├── For each agent invocation:
│   │   ├── Assemble system prompt from all 7 blocks
│   │   ├── Create domain-scoped tools
│   │   ├── createAgentSession() with in-memory session
│   │   ├── Subscribe to events (track tokens, cost, turns, tools)
│   │   ├── Append to conversation log (extension writes, agent reads)
│   │   └── Stream updates to renderResult via onUpdate
│   └── Return final output + usage stats
│
└── Rendering
    ├── renderCall: agent header (icon + name + model)
    └── renderResult: "thinking..." → final output + stats
```

---

## Agent Discovery

### When

- On `session_start` event (extension load)
- On `/reload` (hot-reload)

### Where

| Location | Scope |
|----------|-------|
| `.pi/agents/*.md` | Project-local agents |
| `~/.pi/agent/agents/*.md` | User-global agents |

Project agents override global agents with the same `name`.

### Validation

Every agent must have all 7 blocks. The extension validates on discovery:

| Check | Failure |
|-------|---------|
| All 7 blocks present | Reject agent, notify user |
| `role` is `worker`, `lead`, or `orchestrator` | Reject |
| Worker has `delegate` in tools | Reject |
| Lead/orchestrator has `bash` or `edit` in tools | Reject |
| Knowledge paths are valid (project path relative, general path absolute) | Reject |
| Skill paths exist | Warn (non-fatal) |
| Conversation path contains `{{SESSION_ID}}` | Reject |

### Knowledge File Bootstrap

On discovery, for each agent:
1. Check if project knowledge file exists (`.pi/knowledge/{name}.yaml`)
2. If not, create an empty file
3. Check if general knowledge file exists (`~/.pi/agent/general/{name}.yaml`)
4. If not, create an empty file

This ensures the agent's first "read knowledge" action never fails.

---

## `/agents` Command

Registered via `pi.registerCommand()`. Lists all discovered agents.

### Display

```
 🔵  orchestrator     Coordinates the full team
 🟡  eng-lead         Translates requirements to plans
 💻  backend-dev      APIs, databases, infrastructure
 🔵  frontend-dev     UI components, client state
 🟠  qa-engineer      Test cases, regression, automation
 🟣  security-rev     Threat modeling, auth, OWASP
```

| Element | Source |
|---------|--------|
| Icon | `icon` field from Identity block |
| Agent name | `name` field, rendered in agent's `color` |
| Description | `description` field, truncated to fit |

### Implementation

```typescript
pi.registerCommand("agents", {
  description: "List available agents",
  handler: async (_args, ctx) => {
    const lines = agents.map(a =>
      `${a.icon}  ${theme.fg(a.color, a.name.padEnd(18))} ${a.description}`
    );
    ctx.ui.notify(lines.join("\n"), "info");
  },
});
```

---

## `agent` Tool

The core tool the LLM calls to invoke agents.

### Parameters

```typescript
const AgentToolParams = Type.Object({
  // Single mode
  agent: Type.Optional(Type.String({ description: "Agent name to invoke" })),
  task: Type.Optional(Type.String({ description: "Task to delegate" })),

  // Parallel mode
  tasks: Type.Optional(Type.Array(
    Type.Object({
      agent: Type.String({ description: "Agent name" }),
      task: Type.String({ description: "Task" }),
    }),
    { description: "Array of {agent, task} for parallel execution" }
  )),

  // Chain mode
  chain: Type.Optional(Type.Array(
    Type.Object({
      agent: Type.String({ description: "Agent name" }),
      task: Type.String({ description: "Task with optional {previous} placeholder" }),
    }),
    { description: "Array of {agent, task} for sequential execution" }
  )),
});
```

### Modes

| Mode | Input | Behavior |
|------|-------|----------|
| **Single** | `{ agent, task }` | One agent, one task, await completion |
| **Parallel** | `{ tasks: [...] }` | Multiple agents concurrently, await all |
| **Chain** | `{ chain: [...] }` | Sequential — output of N becomes `{previous}` in N+1 |

### Prompt Snippet

```typescript
pi.registerTool({
  name: "agent",
  label: "Agent",
  description: "Invoke a specialized agent to perform a task",
  promptSnippet: "Invoke specialized agents (single, parallel, or chain mode)",
  promptGuidelines: [
    "Use this tool to delegate tasks to specialized agents.",
    "Available agents are listed in the system context.",
    "For independent tasks, use parallel mode.",
    "For dependent tasks, use chain mode with {previous} placeholder.",
  ],
  // ...
});
```

---

## Agent Invocation (SDK)

### Per-Agent Session Creation

For each agent invocation, the extension:

#### 1. Assemble the System Prompt

```
┌─────────────────────────────────────────────────────────┐
│  Assembled System Prompt                                 │
│                                                          │
│  1. System prompt body (Block 7 — markdown below ---)    │
│  2. Skill contents (Block 4 — each .md file appended)    │
│  3. Domain rules (Block 2 — injected as {{DOMAIN_BLOCK}})│
│  4. Knowledge config (Block 5 — injected as              │
│     {{KNOWLEDGE_BLOCK}})                                 │
│  5. Project knowledge content (read from .yaml file)     │
│  6. General knowledge content (read from .yaml file)     │
│  7. Conversation log (full text of conversation.jsonl    │
│     — injected as {{CONVERSATION_LOG}})                      │
│  8. {{SESSION_DIR}} resolved to actual path              │
│                                                          │
│  All {{VARIABLES}} resolved before the LLM call.         │
└─────────────────────────────────────────────────────────┘
```

#### 2. Create Domain-Scoped Tools

The extension builds tools that respect the agent's domain:

```
For each tool in agent's capabilities (Block 3):
  If tool accesses files (read, write, edit, grep, find, ls):
    Wrap with domain check from Block 2
    Tool only operates within permitted paths
  If tool is bash:
    Pass through (domain applies to file tools, not shell)
  If tool is delegate:
    Not registered (pi-agents scope — no delegation)
```

Implementation: use Pi's tool factory functions (`createReadTool`, etc.) and wrap `execute` with domain validation.

#### 3. Create the Agent Session

```typescript
const { session: agentSession } = await createAgentSession({
  model: agentModel,                          // From Block 1
  tools: domainScopedTools,                   // From Block 2 + 3
  cwd,                                        // Project working directory
  sessionManager: SessionManager.inMemory(),  // Isolated context
  settingsManager: SettingsManager.inMemory({
    compaction: { enabled: false },
  }),
  resourceLoader: {
    getSystemPrompt: () => assembledPrompt,   // From step 1
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  },
  modelRegistry,                              // From ctx.modelRegistry
});
```

#### 4. Subscribe to Events

Track metrics in real-time for rendering:

```typescript
const metrics = {
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cost: 0,
  toolCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
};

agentSession.subscribe((event) => {
  switch (event.type) {
    case "turn_end":
      metrics.turns++;
      break;
    case "message_end":
      if (event.message.role === "assistant" && event.message.usage) {
        metrics.inputTokens += event.message.usage.input ?? 0;
        metrics.outputTokens += event.message.usage.output ?? 0;
        metrics.cost += event.message.usage.cost?.total ?? 0;
      }
      break;
    case "tool_execution_start":
      metrics.toolCalls.push({ name: event.toolName, args: event.args });
      break;
  }

  // Stream update to parent tool rendering
  emitUpdate();
});
```

#### 5. Run the Agent

```typescript
await agentSession.prompt(task);
```

#### 6. Append to Conversation Log

After the agent completes, the extension appends to `conversation.jsonl`:

```typescript
appendToLog(conversationPath, {
  ts: new Date().toISOString(),
  from: agentConfig.name,
  to: "user",  // or the requesting agent in future team mode
  message: agentFinalOutput,
});
```

#### 7. Cleanup

```typescript
agentSession.dispose();
```

---

## Conversation Log Management

### Lifecycle

```
1. Session starts → extension resolves {{SESSION_ID}} in conversation.path
2. Extension creates the file if it doesn't exist
3. User message → extension appends {from: "user", to: agent, message: ...}
4. Agent invoked → conversation log injected into agent's system prompt
5. Agent completes → extension appends {from: agent, to: "user", message: ...}
6. Next invocation → extension re-reads file, re-injects (latest content)
```

### Write Protocol

```typescript
function appendToLog(logPath: string, entry: ConversationEntry): void {
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(logPath, line);
}
```

Append-only. Never modify. Never delete. One writer (the extension).

### Entry Schema

```typescript
interface ConversationEntry {
  ts: string;       // ISO 8601
  from: string;     // Agent name, "user", or "system"
  to: string;       // Agent name, "user", or "system"
  message: string;  // Content
  type?: string;    // "delegate" | "system" (optional)
}
```

---

## Rendering

### Reference: How the Video Does It

From analysis of the [IndyDevDan video](https://www.youtube.com/watch?v=M30gp1315Y4):

1. **Agent header appears** — colored block with agent name + model
2. **`thinking...`** — generic indicator, inline, below the header
3. **No streaming text** — response appears all at once when done
4. **No tool traces visible** — tools are invisible during execution
5. **Parallel agents** — multiple headers stacked, each with `thinking...`, resolve independently
6. **No animations** — everything appears/disappears instantly

### Our Approach

Match the video's simplicity in the default (collapsed) view. Show details on expand (Ctrl+O).

#### `renderCall` — Agent Header

Appears when the LLM invokes the `agent` tool:

```
 💻  backend-dev (claude-sonnet-4-6)
```

```typescript
renderCall(args, theme, context) {
  const agent = findAgent(args.agent);
  const icon = agent?.icon ?? "●";
  const name = agent?.name ?? args.agent;
  const model = agent?.model ?? "";

  const text = `${icon}  ${theme.fg(agent?.color ?? "accent", theme.bold(name))}`;
  const modelText = model ? ` ${theme.fg("dim", `(${model})`)}` : "";

  return new Text(`${text}${modelText}`, 0, 0);
}
```

#### `renderResult` — While Running (Partial)

Shows `thinking...` while the agent is active:

```
 💻  backend-dev (claude-sonnet-4-6)
     thinking...
```

```typescript
renderResult(result, { isPartial }, theme, context) {
  if (isPartial) {
    return new Text(theme.fg("dim", "thinking..."), 0, 0);
  }
  // ...
}
```

#### `renderResult` — Completed (Collapsed)

Shows final output + usage stats on one line:

```
 💻  backend-dev (claude-sonnet-4-6)                      ↑45k ↓3.2k $0.034
     Implemented ComplementNB classifier. Created cnb_classifier.py
     with 4 passing tests.
```

```typescript
renderResult(result, { expanded }, theme, context) {
  const details = result.details as AgentResultDetails;
  const output = details.output;
  const usage = formatUsage(details.metrics);  // "↑45k ↓3.2k $0.034"

  let text = theme.fg("dim", usage);
  text += "\n" + output;

  if (!expanded && details.metrics.toolCalls.length > 0) {
    text += `\n${theme.fg("muted", `${details.metrics.toolCalls.length} tool calls (Ctrl+O to expand)`)}`;
  }

  // ... expanded view below
  return new Text(text, 0, 0);
}
```

#### `renderResult` — Completed (Expanded, Ctrl+O)

Shows full detail: task, tool trace, output, per-turn usage:

```
 💻  backend-dev (claude-sonnet-4-6)             3 turns ↑45k ↓3.2k $0.034
     ─── Task ───
     Implement ComplementNB in classifier.py
     ─── Tools (4 calls) ───
     → grep /ComplementNB/ in apps/
     → read apps/backend/classifier.py
     → write apps/backend/cnb_classifier.py (87 lines)
     → $ python -m pytest tests/test_cnb.py
     ─── Output ───
     Implemented ComplementNB classifier. Created cnb_classifier.py
     with 4 passing tests. Added TfidfVectorizer pipeline with
     complement naive bayes estimator.
```

```typescript
if (expanded) {
  const container = new Container();

  // Header with full stats
  container.addChild(new Text(
    theme.fg("dim", `${details.metrics.turns} turns ${formatUsage(details.metrics)}`),
    0, 0
  ));

  // Task
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
  container.addChild(new Text(theme.fg("dim", details.task), 0, 0));

  // Tool calls
  if (details.metrics.toolCalls.length > 0) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(
      theme.fg("muted", `─── Tools (${details.metrics.toolCalls.length} calls) ───`),
      0, 0
    ));
    for (const tc of details.metrics.toolCalls) {
      container.addChild(new Text(
        theme.fg("muted", "→ ") + formatToolCall(tc.name, tc.args, theme),
        0, 0
      ));
    }
  }

  // Final output
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
  container.addChild(new Markdown(details.output.trim(), 0, 0, mdTheme));

  return container;
}
```

#### Parallel Mode Rendering

Multiple agents shown stacked. Each resolves independently:

```
 💻  backend-dev (claude-sonnet-4-6)
     thinking...

 🔵  frontend-dev (claude-sonnet-4-6)
     thinking...
```

Then as each completes:

```
 💻  backend-dev (claude-sonnet-4-6)                      ↑45k ↓3.2k $0.034
     Implemented ComplementNB classifier...

 🔵  frontend-dev (claude-sonnet-4-6)
     thinking...
```

This uses the same `onUpdate` mechanism as the existing subagent extension — parallel tasks stream their status independently.

---

## Frontmatter: Identity Block Update

Add `color` and `icon` to Block 1:

```yaml
name: backend-dev
description: Builds APIs, databases, and infrastructure.
model: anthropic/claude-sonnet-4-6
role: worker
color: "#36f9f6"              # Hex color for TUI rendering
icon: "💻"                    # Emoji icon for TUI rendering
```

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `color` | string | ✅ | Hex color code for agent name in TUI |
| `icon` | string | ✅ | Emoji icon displayed before agent name |

These are now required as part of Block 1 (Identity). Every agent must be visually identifiable.

---

## Extension Entry Point Structure

```
pi-agents/
├── src/
│   ├── index.ts                    # Extension entry point (thin glue)
│   ├── schema/                     # Zod schemas + types (pure)
│   │   ├── frontmatter.ts          # Zod schemas for all 7 blocks
│   │   ├── validation.ts           # Cross-field: validateRoleTools
│   │   └── conversation.ts         # Log entry schema
│   ├── common/                     # Cross-cutting pure utilities
│   │   ├── paths.ts                # expandPath
│   │   └── model.ts                # parseModelId
│   ├── discovery/                  # Find + validate agent .md files
│   │   ├── parser.ts
│   │   ├── scanner.ts
│   │   ├── validator.ts
│   │   └── bootstrap.ts
│   ├── prompt/                     # System prompt assembly (pure)
│   │   ├── assembly.ts
│   │   └── variables.ts
│   ├── domain/                     # File-system boundary enforcement
│   │   ├── checker.ts
│   │   └── scoped-tools.ts
│   ├── invocation/                 # SDK session management
│   │   ├── session.ts
│   │   ├── metrics.ts
│   │   └── conversation-log.ts
│   ├── tool/                       # The "agent" tool + rendering
│   │   ├── agent-tool.ts
│   │   ├── modes.ts
│   │   ├── render.ts
│   │   └── format.ts
│   └── command/                    # /agents slash command
│       └── agents-command.ts
├── scripts/
│   └── test-agent.ts               # Dev tool: test an agent via SDK
├── docs/
├── package.json
└── README.md
```

---

## Data Flow — Complete Lifecycle

```
1. Pi starts
   └── session_start event fires
       └── Extension discovers .pi/agents/*.md
           ├── Parse frontmatter (7 blocks)
           ├── Validate all blocks
           ├── Bootstrap empty knowledge files
           └── Store agent configs in memory

2. User types a prompt
   └── LLM decides to invoke an agent
       └── Calls agent tool: { agent: "backend-dev", task: "..." }

3. Extension executes the tool
   ├── a. Find agent config by name
   ├── b. Read conversation log from disk
   ├── c. Read project knowledge file
   ├── d. Read general knowledge file
   ├── e. Read skill .md files
   ├── f. Resolve all {{VARIABLES}}
   ├── g. Assemble full system prompt
   ├── h. Create domain-scoped tools
   ├── i. createAgentSession({
   │       model, tools, resourceLoader, sessionManager: inMemory,
   │       modelRegistry
   │      })
   ├── j. Subscribe to events (track metrics)
   ├── k. session.prompt(task)
   │      └── Agent works (reads files, writes code, runs tests...)
   │          └── renderResult shows "thinking..." via onUpdate
   ├── l. Agent completes
   │      ├── Append agent response to conversation.jsonl
   │      └── Agent may have updated knowledge files (via write tool)
   ├── m. agentSession.dispose()
   └── n. Return result to parent LLM
           └── renderResult shows final output + usage stats

4. Parent LLM synthesizes agent output into its response to the user
```

---

## Design Decisions (Resolved)

1. **Agent descriptions in parent LLM prompt** — ✅ Via `promptGuidelines` on the agent tool. The parent LLM sees all agents listed in its system prompt.

2. **Conversation log scope** — ✅ One log per session. All agent invocations within a session share it. Extension always writes (user tasks, agent responses, domain violations). Agent sees it only if `{{CONVERSATION_LOG}}` is in its template.

3. **Knowledge file conflicts in parallel** — ✅ Same agent invoked twice: both read a snapshot at boot (safe), writes serialized via `withFileMutationQueue` (last write wins, no corruption). Different agents have different knowledge files — no conflict.

4. **Model resolution** — ✅ Frontmatter uses `provider/model-id` format (e.g., `anthropic/claude-sonnet-4-6`). Split on `/` → `getModel(provider, id)`.

5. **Agent output truncation** — ✅ Pi's `truncateHead` applied to agent output before returning to parent LLM. Max 50KB / 2000 lines.
