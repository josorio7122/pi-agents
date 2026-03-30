# Plan Review — Gaps Found & Fixes

Full lifecycle trace revealed 7 gaps. Each fix is assigned to an existing part.

---

## Gap 1: Knowledge Files Not in Domain → Agent Can't Write to Them

**Problem:** The agent spec says "knowledge files are implicitly accessible" (Block 2 rules). But the domain-scoped tools in Part 5 check the `domain` array from frontmatter. If `~/.pi/agent/general/backend-dev.yaml` isn't in the domain list, the `write` tool will block it.

**Impact:** Self-enhancement is broken. The agent can't update its own knowledge.

**Fix → Part 5 (domain-tools):**
When creating scoped tools, automatically inject knowledge file paths as writable domains:

```typescript
function createScopedTools(params: {
  cwd: string;
  tools: readonly string[];
  domain: readonly DomainEntry[];
  knowledgePaths: readonly string[];  // ← ADD: project + general knowledge paths
}): ToolDefinition[]

// Before checking domain, add implicit entries:
// { path: projectKnowledgePath, read: true, write: true, delete: false }
// { path: generalKnowledgePath, read: true, write: true, delete: false }
```

**Test to add → Part 5:**
- Agent writes to project knowledge path → allowed (even if not in domain)
- Agent writes to general knowledge path → allowed (even if not in domain)
- Agent writes to random path not in domain → blocked

---

## Gap 2: `expandPath` Called When — Not Explicit

**Problem:** `expandPath` for `~` is defined in Part 2 but never explicitly called in later parts. The `~` in `~/.pi/agent/general/...` would be passed raw to `fs.readFile` which would fail.

**Impact:** General knowledge files never found on disk.

**Fix → Multiple parts:**
- **Part 3 (bootstrap):** `expandPath` on general knowledge path before creating file
- **Part 4 (assembly):** `expandPath` on general knowledge path before reading content
- **Part 5 (domain-tools):** `expandPath` on knowledge paths before adding to domain
- **Part 6 (invocation):** `expandPath` on general knowledge path in `runAgent`

**Rule:** Every function that touches a path from the frontmatter must call `expandPath` first. Add this as a note to Part 2.

---

## Gap 3: User Task Not Written to Conversation Log

**Problem:** Part 6 step 10 writes the agent's response to the conversation log. But the user's task (what was delegated to the agent) is never written. The log would show only agent responses, not what they were asked.

**Impact:** Conversation log is incomplete. Future agents reading the log see answers without questions.

**Fix → Part 6 (invocation):**
Before invoking the agent, append the task:

```
Step 1.5 (new): appendToLog(logPath, {
  ts: now, from: "user", to: agentConfig.name, message: task
});
```

After the agent completes:
```
Step 10: appendToLog(logPath, {
  ts: now, from: agentConfig.name, to: "user", message: output
});
```

**Test to add → Part 6:**
- After runAgent, conversation log has BOTH entries (user task + agent response)
- Entries are in chronological order

---

## Gap 4: Faux Provider for Testing — Not in Plan

**Problem:** Parts 6, 7, and 9 need to test `createAgentSession` + `session.prompt()` but can't hit a real LLM in unit tests. The plan says "mock resource loader" and "gated integration tests" but doesn't mention Pi's built-in `registerFauxProvider`.

**Impact:** Can't test the invocation/modes/entry-point pipeline without paying for API calls.

**Fix → Part 6, 7, 9:**
Use Pi's `registerFauxProvider` from `@mariozechner/pi-ai`:

```typescript
import { registerFauxProvider, fauxText, fauxAssistantMessage } from "@mariozechner/pi-ai";

// In test setup:
const faux = registerFauxProvider();
faux.setResponses([
  fauxAssistantMessage(fauxText("Agent output here")),
]);

// Use faux.getModel() as the model for createAgentSession
const { session } = await createAgentSession({
  model: faux.getModel(),
  // ...
});

await session.prompt("Test task");
// Agent responds with "Agent output here" — no API call
```

**Updates:**
- **Part 6 (session.test.ts):** Use faux provider for all invocation tests
- **Part 7 (modes.test.ts):** Use faux provider for single/parallel/chain tests
- **Part 9 (index.test.ts):** Use faux provider for smoke tests
- **Part 9 (integration tests):** Keep gated `RUN_INTEGRATION` tests for REAL LLM validation

---

## Gap 5: `runAgent` Not Injectable → Can't Unit Test Modes

**Problem:** Part 7 (modes.ts) calls `runAgent` directly. To test mode logic (parallel concurrency, chain `{previous}` substitution) without the SDK, we need to inject a fake `runAgent`.

**Impact:** Mode tests would require full SDK setup or be untestable.

**Fix → Part 7:**
Make mode functions accept `runAgent` as a parameter:

```typescript
type RunAgentFn = (params: RunAgentParams) => Promise<RunAgentResult>;

function executeSingle(params: {
  agent: AgentConfig;
  task: string;
  runAgent: RunAgentFn;
  // ...
}): Promise<RunAgentResult>

function executeParallel(params: {
  tasks: ReadonlyArray<{ agent: AgentConfig; task: string }>;
  runAgent: RunAgentFn;
  maxConcurrency: number;
  // ...
}): Promise<ReadonlyArray<RunAgentResult>>

function executeChain(params: {
  chain: ReadonlyArray<{ agent: AgentConfig; task: string }>;
  runAgent: RunAgentFn;
  // ...
}): Promise<RunAgentResult>
```

Tests inject a fake `runAgent` that returns canned results:

```typescript
const fakeRunAgent: RunAgentFn = async ({ task }) => ({
  output: `Done: ${task}`,
  metrics: emptyMetrics,
});
```

---

## Gap 6: Session ID — Where Does It Come From?

**Problem:** Part 9 mentions `resolveConversationPath(template, sessionId)` but doesn't define where `sessionId` originates.

**Impact:** `{{SESSION_ID}}` in conversation path never gets resolved.

**Fix → Part 9:**
Generate a unique session ID on `session_start`:

```typescript
pi.on("session_start", async (_event, ctx) => {
  const sessionId = crypto.randomUUID();
  // ... use sessionId when resolving conversation paths
});
```

Or derive from Pi's own session: `ctx.sessionManager.getSessionFile()` — but this might be undefined for in-memory sessions. UUID is safer.

**Test to add → Part 9:**
- Session ID is unique per session_start
- Conversation path is correctly resolved with session ID

---

## Gap 7: Output Truncation Not Addressed

**Problem:** Agent responses can be arbitrarily long. When returned to the parent LLM as tool output, large responses eat context. The extension-design.md lists this as an open question but the plan doesn't handle it.

**Impact:** Parent LLM context overflow on verbose agents.

**Fix → Part 7 (agent-tool.ts):**
Use Pi's truncation utilities on the output before returning:

```typescript
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";

// In tool execute, after getting agent output:
const truncation = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
});

const content = truncation.truncated
  ? `${truncation.content}\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines]`
  : output;
```

**Test to add → Part 7:**
- Short output → returned as-is
- Long output (>50KB) → truncated with note

---

## Summary: Fixes by Part

| Part | Fixes |
|------|-------|
| **Part 2** | Add note: always `expandPath` on frontmatter paths |
| **Part 5** | Inject knowledge paths as implicit writable domains + tests |
| **Part 6** | Write user task to conversation log + faux provider in tests |
| **Part 7** | Injectable `runAgent` for mode tests + output truncation + faux provider |
| **Part 9** | Session ID generation + faux provider for smoke tests |

## Updated Test Strategy

| Test Type | Tool | What | LLM? |
|-----------|------|------|:----:|
| **Unit** | vitest | Schema, variables, domain checker, metrics, formatting | ❌ No |
| **Integration (faux)** | vitest + faux provider | Full pipeline with fake LLM responses | ❌ No |
| **Integration (real)** | vitest + `RUN_INTEGRATION` | Real LLM, self-enhancement verification | ✅ Yes (haiku) |
| **Manual** | `scripts/test-agent.ts` | Dev tool, full agent test | ✅ Yes |
| **Smoke** | `pi -e ./src/index.ts` | Extension loads, `/agents` works | ❌ No |
