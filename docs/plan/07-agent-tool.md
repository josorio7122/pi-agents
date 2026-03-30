# Part 7: Agent Tool Registration

## Goal
Register the `agent` tool that the LLM calls to invoke agents. Supports single, parallel, and chain modes. Uses the invocation layer (Part 6) for execution.

## Dependencies
- Part 3 (discovery — agent configs)
- Part 6 (invocation — `runAgent`)

## Files

### `src/tool/modes.ts`
Pure execution logic for single, parallel, and chain modes.

### `src/tool/modes.test.ts`
Test mode selection, parallel concurrency, chain `{previous}` substitution.

### `src/tool/agent-tool.ts`
The Pi tool definition: parameters, execute, prompt metadata.

### `src/tool/agent-tool.test.ts`
Test parameter validation, mode routing, error handling.

## Design

### Tool Parameters
```typescript
const AgentToolParams = Type.Object({
  // Single mode
  agent: Type.Optional(Type.String({ description: "Agent name to invoke" })),
  task: Type.Optional(Type.String({ description: "Task to perform" })),

  // Parallel mode
  tasks: Type.Optional(Type.Array(
    Type.Object({
      agent: Type.String(),
      task: Type.String(),
    })
  )),

  // Chain mode
  chain: Type.Optional(Type.Array(
    Type.Object({
      agent: Type.String(),
      task: Type.String(),  // May contain {previous} placeholder
    })
  )),
});
```

### Mode Detection (Pure)
```typescript
type AgentMode =
  | { mode: "single"; agent: string; task: string }
  | { mode: "parallel"; tasks: Array<{ agent: string; task: string }> }
  | { mode: "chain"; chain: Array<{ agent: string; task: string }> };

function detectMode(params: AgentToolInput): AgentMode | { error: string }
// Exactly one mode must be specified. Multiple or zero → error.
```

### Single Mode
```
1. Find agent config by name
2. runAgent({ agentConfig, task, ... })
3. Return output + metrics
```

### Parallel Mode
```
1. Find all agent configs by name
2. Run all concurrently with Promise.all (max 4 concurrent)
3. Collect all outputs + metrics
4. Return combined results
```

Concurrency limit: 4 simultaneous agents (same as pi-flow subagent).

### Chain Mode
```
1. For each step in sequence:
   a. Replace {previous} in task with output from prior step
   b. runAgent({ agentConfig, task, ... })
   c. If error → stop chain, report which step failed
2. Return final step output + all metrics
```

### Tool Registration
```typescript
function createAgentTool(params: {
  agents: readonly AgentConfig[];
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  sessionDir: string;
  conversationLogPath: string;
}): ToolDefinition
```

Returns a complete `ToolDefinition` with `name`, `parameters`, `execute`, `renderCall`, `renderResult`, `promptSnippet`, `promptGuidelines`.

### Prompt Integration
The LLM needs to know what agents are available. Injected via `promptGuidelines`:

```typescript
promptGuidelines: [
  "Use this tool to invoke specialized agents.",
  "Available agents:",
  ...agents.map(a => `  ${a.frontmatter.icon} ${a.frontmatter.name} — ${a.frontmatter.description}`),
  "For independent tasks, use parallel mode (tasks array).",
  "For dependent tasks, use chain mode with {previous} placeholder.",
]
```

## Tests

### Mode detection
- `{ agent, task }` → single
- `{ tasks: [...] }` → parallel
- `{ chain: [...] }` → chain
- `{ agent, task, tasks }` (multiple) → error
- `{}` (none) → error

### Single mode
- Valid agent name + task → calls runAgent, returns result
- Unknown agent name → error with available agents list

### Parallel mode
- 2 tasks → both run, both results returned
- Task with unknown agent → that task errors, others succeed
- Respects concurrency limit

### Chain mode
- 2-step chain → second step receives first's output via {previous}
- Step 1 fails → chain stops, reports step 1 failure
- No {previous} in task → runs normally (placeholder not required)

## Commit
`feat: agent tool — single, parallel, chain invocation modes`
