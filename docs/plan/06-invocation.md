# Part 6: Agent Invocation (SDK)

## Goal
Create an `AgentSession` per agent using the Pi SDK. Track metrics (tokens, cost, turns, tools). Manage the conversation log (append-only writes). This is the runtime core.

## Dependencies
- Part 2 (schema)
- Part 4 (prompt assembly)
- Part 5 (domain-scoped tools)

## Files

### `src/invocation/metrics.ts`
Pure accumulator: receives events, tracks tokens/cost/turns/tools.

### `src/invocation/metrics.test.ts`
Test metric accumulation from mock events.

### `src/invocation/conversation-log.ts`
Append-only log file management: read, append, ensure exists.

### `src/invocation/conversation-log.test.ts`
Test append, read, creation, format.

### `src/invocation/session.ts`
The main function: creates a `createAgentSession`, runs a prompt, tracks metrics, writes to conversation log.

### `src/invocation/session.test.ts`
Integration-style tests with the SDK (in-memory session, mock resource loader).

## Design

### Metrics Tracker (Pure)
```typescript
// Immutable snapshot — returned from tracker, never mutated by consumers
type AgentMetrics = Readonly<{
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  toolCalls: ReadonlyArray<Readonly<{ name: string; args: Record<string, unknown> }>>;
  durationMs: number;
}>;

// Factory function with closure — no class. Internal state is mutable,
// but the public API only returns immutable snapshots.
function createMetricsTracker(): {
  readonly handle: (event: AgentSessionEvent) => void;
  readonly snapshot: () => AgentMetrics;
}
```

Handles these events:
- `turn_end` → increment turns
- `message_end` (assistant) → accumulate tokens + cost from `usage`
- `tool_execution_start` → push to toolCalls array

### Conversation Log (I/O)
```typescript
type ConversationEntry = Readonly<{
  ts: string;
  from: string;
  to: string;
  message: string;
  type?: string;
}>;

function ensureLogExists(logPath: string): void
// Creates file + parent dirs if missing.

function appendToLog(logPath: string, entry: ConversationEntry): void
// JSON.stringify(entry) + "\n" → appendFileSync

function readLog(logPath: string): string
// Returns full file content as string. Empty string if file doesn't exist.
```

### Agent Session Runner
```typescript
type RunAgentParams = Readonly<{
  agentConfig: AgentConfig;
  task: string;
  sessionDir: string;
  conversationLogPath: string;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  signal?: AbortSignal;
  onUpdate?: (metrics: AgentMetrics) => void;
}>;

type RunAgentResult = Readonly<{
  output: string;
  metrics: AgentMetrics;
  error?: string;
}>;

// The one impure function — orchestrates I/O. Everything it calls is pure or a Pi SDK call.
async function runAgent(params: RunAgentParams): Promise<RunAgentResult>
```

Steps:
1. Read conversation log from disk
2. Read skill files, project knowledge, general knowledge (all via `expandPath`)
3. Assemble system prompt — pure function (Part 4)
4. Create domain-scoped tools with implicit knowledge paths (Part 5)
5. Resolve model: `parseModelId(frontmatter.model)` → `getModel(provider, id)`
6. Create `ResourceLoader` with assembled system prompt
7. `createAgentSession({ model, tools, resourceLoader, sessionManager: inMemory, ... })`
8. Subscribe to events → metrics tracker + `onUpdate` callback
9. **Append user task to conversation log:** `{ from: "user", to: agent.name, message: task }`
10. `await session.prompt(task)`
11. Extract final output from last assistant message
12. **Append agent response to conversation log:** `{ from: agent.name, to: "user", message: output }`
13. `session.dispose()`
14. Return `{ output, metrics }`

### Model Resolution
The frontmatter `model` field uses `provider/model-id` format (e.g., `anthropic/claude-sonnet-4-6`).

```typescript
// Uses parseModelId from Part 2 schema
const { provider, modelId } = parseModelId(agentConfig.frontmatter.model);
const model = getModel(provider, modelId);
if (!model) throw new Error(`Model not found: ${agentConfig.frontmatter.model}`);
```

Direct mapping to Pi's `getModel(provider, id)`. No guessing, no scanning.

## Tests

### Metrics
- No events → zero metrics
- Two `turn_end` events → turns = 2
- `message_end` with usage → tokens accumulated
- Multiple `tool_execution_start` → all recorded

### Conversation log
- Append to non-existent file → file created + entry written
- Append to existing file → entry added at end
- Read empty file → empty string
- Read file with 3 entries → all 3 lines returned
- Entry format → valid JSONL (one JSON per line, newline terminated)

### Session runner (uses faux provider — no real LLM)
```typescript
import { registerFauxProvider, fauxText, fauxAssistantMessage } from "@mariozechner/pi-ai";

// Setup: register faux provider with canned responses
const faux = registerFauxProvider();
faux.setResponses([
  fauxAssistantMessage(fauxText("Agent completed the task.")),
]);
// Use faux.getModel() as the model
```
- Valid agent config + task → returns output + metrics
- Agent with domain-restricted tools → tools correctly scoped
- Abort signal → session aborted cleanly
- Conversation log contains BOTH user task AND agent response after run
- Faux provider → no API calls, fast, free, deterministic

## Commit
`feat: agent invocation — SDK session, metrics tracking, conversation log`
