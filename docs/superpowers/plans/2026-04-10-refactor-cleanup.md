# pi-agents Refactor & Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix rule violations (200-line limit, duplicate types, discriminated unions), eliminate dead code, and clean up code smells across pi-agents.

**Architecture:** Each task is a self-contained refactor that doesn't change external behavior. Type unification tasks come first (since later tasks depend on the canonical type locations). File splits come second. Minor cleanups last.

**Tech Stack:** TypeScript (ESM-only), Vitest, Biome, Zod

**Repo:** `/Users/josorio/Code/pi-agents`

---

## File Structure

### Types unification (Tasks 1-3)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/invocation/session-helpers.ts` | **Modify** | Keep as canonical `RunAgentResult` location |
| `src/tool/modes.ts` | **Modify** | Import `RunAgentResult` from session-helpers instead of redefining |
| `src/invocation/conversation-log.ts` | **Modify** | Import `ConversationEntry` from schema instead of redefining |
| `src/common/tool-types.ts` | **Create** | Shared `ExecutableTool` interface |
| `src/common/tool-types.test.ts` | N/A | Type-only module, no runtime test needed |
| `src/invocation/tool-wrapper.ts` | **Modify** | Import `ExecutableTool` from common |
| `src/domain/knowledge-tools.ts` | **Modify** | Import `ExecutableTool` from common |

### File split (Task 4)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/invocation/session-dump.ts` | **Create** | `dumpAgentSession` function extracted from session.ts |
| `src/invocation/session.ts` | **Modify** | Import and call dumpAgentSession from session-dump.ts |

### DRY / dead code (Tasks 5-6)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/tool/modes.ts` | **Modify** | `aggregateMetrics` delegates to `aggregateMetricsArray` |
| `src/api.ts` | **Modify** | Remove `SPINNER_FRAMES` from public API |

### Code smells (Tasks 7-9)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/invocation/session.ts` | **Modify** | Remove redundant variable, fix double timestamp |
| `src/domain/submit-tool.ts` | **Modify** | Use Zod parse instead of `as` cast |
| `src/index.ts` | **Modify** | Type `agents` as `ReadonlyArray<AgentConfig>` |

---

## Task 1: Unify RunAgentResult — import in modes.ts from session-helpers.ts

**Files:**
- Modify: `src/tool/modes.ts`
- Modify: `src/api.ts`

Both `modes.ts` and `session-helpers.ts` define identical `RunAgentResult`. Keep the one in `session-helpers.ts` (canonical) and import it in `modes.ts`.

- [ ] **Step 1: Run existing tests as baseline**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/tool/modes.test.ts`
Expected: PASS

- [ ] **Step 2: Replace local type with import in modes.ts**

In `src/tool/modes.ts`, replace lines 1-7:

```typescript
import type { AgentMetrics } from "../invocation/metrics.js";

export type RunAgentResult = Readonly<{
  output: string;
  metrics: AgentMetrics;
  error?: string;
}>;
```

With:

```typescript
import type { AgentMetrics } from "../invocation/metrics.js";
import type { RunAgentResult } from "../invocation/session-helpers.js";

export type { RunAgentResult };
```

- [ ] **Step 3: Update api.ts to export RunAgentResult from session-helpers**

In `src/api.ts`, change line 40:

```typescript
export type { ChainResult, RunAgentFn, RunAgentResult } from "./tool/modes.js";
```

To:

```typescript
export type { ChainResult, RunAgentFn } from "./tool/modes.js";
export type { RunAgentResult } from "./invocation/session-helpers.js";
```

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tool/modes.ts src/api.ts
git commit -m "refactor: unify RunAgentResult — canonical location in session-helpers"
```

---

## Task 2: Unify ConversationEntry — import from schema in conversation-log.ts

**Files:**
- Modify: `src/invocation/conversation-log.ts`

`conversation-log.ts` defines a local `ConversationEntry` type identical to `schema/conversation.ts`. Import instead of redefining.

- [ ] **Step 1: Run existing tests as baseline**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/invocation/conversation-log.test.ts`
Expected: PASS

- [ ] **Step 2: Replace local type with import**

In `src/invocation/conversation-log.ts`, replace lines 1-10:

```typescript
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type ConversationEntry = Readonly<{
  ts: string;
  from: string;
  to: string;
  message: string;
  type?: string;
}>;
```

With:

```typescript
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ConversationEntry } from "../schema/conversation.js";
```

- [ ] **Step 3: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/invocation/conversation-log.ts
git commit -m "refactor: import ConversationEntry from schema instead of redefining"
```

---

## Task 3: Unify tool interfaces — shared ExecutableTool type

**Files:**
- Create: `src/common/tool-types.ts`
- Modify: `src/invocation/tool-wrapper.ts`
- Modify: `src/domain/knowledge-tools.ts`

`WrappableTool` in tool-wrapper.ts and `ExecutableTool` in knowledge-tools.ts are structurally identical. Extract to a shared module.

- [ ] **Step 1: Create shared type module**

Create `src/common/tool-types.ts`:

```typescript
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import type { TSchema } from "@sinclair/typebox";

export interface ExecutableTool {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: TSchema;
  prepareArguments?: (args: unknown) => unknown;
  execute(
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown,
  ): Promise<AgentToolResult<unknown>>;
}
```

- [ ] **Step 2: Update tool-wrapper.ts**

In `src/invocation/tool-wrapper.ts`, remove the `WrappableTool` interface (lines 26-38) and add an import:

```typescript
import type { ExecutableTool } from "../common/tool-types.js";
```

Then replace all references to `WrappableTool` with `ExecutableTool` in the file. There should be one usage in the `wrapWithDomainCheck` function parameter type.

- [ ] **Step 3: Update knowledge-tools.ts**

In `src/domain/knowledge-tools.ts`, remove the `ExecutableTool` interface (lines 14-25) and add an import:

```typescript
import type { ExecutableTool } from "../common/tool-types.js";
```

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/common/tool-types.ts src/invocation/tool-wrapper.ts src/domain/knowledge-tools.ts
git commit -m "refactor: unify ExecutableTool interface into common/tool-types"
```

---

## Task 4: Split session.ts — extract dumpAgentSession

**Files:**
- Create: `src/invocation/session-dump.ts`
- Modify: `src/invocation/session.ts`

`session.ts` is 249 lines (limit is 200). Extract `dumpAgentSession` + `DumpParams` (33 lines) to a new file.

- [ ] **Step 1: Run existing tests as baseline**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/invocation/session.test.ts`
Expected: PASS

- [ ] **Step 2: Create session-dump.ts**

Create `src/invocation/session-dump.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type DumpParams = Readonly<{
  agentName: string;
  caller: string;
  task: string;
  messages: ReadonlyArray<unknown>;
  output: string;
  sessionDir: string;
}>;

export async function dumpAgentSession(params: DumpParams) {
  try {
    const agentDir = join(params.sessionDir, "agents");
    await mkdir(agentDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${ts}_${params.agentName}.jsonl`;
    const lines: string[] = [
      JSON.stringify({
        type: "agent_session",
        agent: params.agentName,
        caller: params.caller,
        task: params.task,
        timestamp: ts.replace(/-/g, ":").replace(/T/, "T"), // reuse same ts
        extractedOutput: params.output,
      }),
    ];
    for (const msg of params.messages) {
      lines.push(JSON.stringify({ type: "message", message: msg }));
    }
    await writeFile(join(agentDir, filename), lines.join("\n") + "\n");
  } catch {
    // Non-critical — don't fail the agent run if dump fails
  }
}
```

- [ ] **Step 3: Update session.ts to import dumpAgentSession**

In `src/invocation/session.ts`:

1. Add import at top: `import { dumpAgentSession } from "./session-dump.js";`
2. Delete the `DumpParams` type (lines 217-224) and `dumpAgentSession` function (lines 226-249)

- [ ] **Step 4: Verify session.ts is under 200 lines**

Run: `wc -l /Users/josorio/Code/pi-agents/src/invocation/session.ts`
Expected: Under 200 lines.

- [ ] **Step 5: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/invocation/session-dump.ts src/invocation/session.ts
git commit -m "refactor: extract dumpAgentSession to session-dump.ts (200-line limit)"
```

---

## Task 5: DRY — implement aggregateMetrics via aggregateMetricsArray

**Files:**
- Modify: `src/tool/modes.ts`

The imperative `aggregateMetrics` function duplicates the reduce logic in `aggregateMetricsArray`. Rewrite it as a one-liner delegation.

- [ ] **Step 1: Run existing tests as baseline**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/tool/modes.test.ts`
Expected: PASS

- [ ] **Step 2: Replace aggregateMetrics body**

In `src/tool/modes.ts`, find the `aggregateMetrics` function (currently an imperative loop) and replace it:

Current (approximately lines 157-173):
```typescript
export function aggregateMetrics(results: ReadonlyArray<RunAgentResult>): AgentMetrics {
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  for (const r of results) {
    turns += r.metrics.turns;
    inputTokens += r.metrics.inputTokens;
    outputTokens += r.metrics.outputTokens;
    cost += r.metrics.cost;
    toolCalls.push(...r.metrics.toolCalls);
  }

  return { turns, inputTokens, outputTokens, cost, toolCalls };
}
```

Replace with:
```typescript
export function aggregateMetrics(results: ReadonlyArray<RunAgentResult>): AgentMetrics {
  return aggregateMetricsArray(results.map((r) => r.metrics));
}
```

- [ ] **Step 3: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tool/modes.ts
git commit -m "refactor: implement aggregateMetrics via aggregateMetricsArray"
```

---

## Task 6: Remove SPINNER_FRAMES from public API

**Files:**
- Modify: `src/api.ts`

`SPINNER_FRAMES` is a rendering implementation detail — it shouldn't be in the public API. Only `spinnerFrame()` needs to be exported.

- [ ] **Step 1: Update api.ts**

In `src/api.ts`, change line 11:

```typescript
export { SPINNER_FRAMES, spinnerFrame } from "./common/spinner.js";
```

To:

```typescript
export { spinnerFrame } from "./common/spinner.js";
```

- [ ] **Step 2: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/api.ts
git commit -m "refactor: remove SPINNER_FRAMES from public API"
```

---

## Task 7: Clean up session.ts — remove redundant variable, fix double timestamp

**Files:**
- Modify: `src/invocation/session.ts`

Two small issues: (1) `const tools = builtinTools` is redundant, (2) double `new Date().toISOString()` in dumpAgentSession (already fixed in Task 4 extraction — verify).

- [ ] **Step 1: Run existing tests as baseline**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/invocation/session.test.ts`
Expected: PASS

- [ ] **Step 2: Remove redundant variable**

In `src/invocation/session.ts`, find:

```typescript
  const tools = builtinTools;
```

Delete that line. Then replace all references to `tools` (that referred to this variable) with `builtinTools` in the same file. There should be one reference where `tools` is passed to `createAgentSession`.

- [ ] **Step 3: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/invocation/session.ts
git commit -m "refactor: remove redundant tools variable alias in session.ts"
```

---

## Task 8: Fix unsafe cast in submit-tool.ts

**Files:**
- Modify: `src/domain/submit-tool.ts`

The `params as Readonly<{ response: string }>` cast on line 19 is unsafe. Since the tool has a TypeBox schema that defines `response: Type.String()`, the params will always match — but per AGENTS.md rules, we should validate at boundaries. Use the TypeBox schema to validate.

- [ ] **Step 1: Run existing tests as baseline**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/domain/submit-tool.test.ts`
Expected: PASS

- [ ] **Step 2: Replace unsafe cast with validation**

In `src/domain/submit-tool.ts`, replace lines 18-19:

```typescript
    async execute(_toolCallId: string, params: unknown) {
      const p = params as Readonly<{ response: string }>;
```

With:

```typescript
    async execute(_toolCallId: string, params: unknown) {
      const p = typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {};
      const response = typeof p.response === "string" ? p.response : "";
```

And update line 21 to use `response` directly:

```typescript
      return {
        content: [{ type: "text" as const, text: response }],
        details: undefined,
      };
```

- [ ] **Step 3: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/domain/submit-tool.ts
git commit -m "refactor: replace unsafe cast with runtime validation in submit-tool"
```

---

## Task 9: Type agents as ReadonlyArray in index.ts

**Files:**
- Modify: `src/index.ts`

Line 55: `let agents: AgentConfig[] = []` should be `let agents: ReadonlyArray<AgentConfig> = []` to prevent accidental mutation.

- [ ] **Step 1: Update type**

In `src/index.ts`, change line 55:

```typescript
  let agents: AgentConfig[] = [];
```

To:

```typescript
  let agents: ReadonlyArray<AgentConfig> = [];
```

- [ ] **Step 2: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass (if any call sites use mutable array methods, they'll flag — fix them by converting to functional alternatives).

- [ ] **Step 3: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/index.ts
git commit -m "refactor: type agents as ReadonlyArray in index.ts"
```

---

## Summary

| Task | Type | Impact |
|------|------|--------|
| 1 | Unify `RunAgentResult` | Eliminates duplicate type across 2 files |
| 2 | Unify `ConversationEntry` | Import from schema instead of local copy |
| 3 | Unify `ExecutableTool` | Eliminates duplicate interface across 2 files |
| 4 | Split session.ts | Gets under 200-line limit |
| 5 | DRY aggregateMetrics | One-liner instead of duplicated loop |
| 6 | Remove SPINNER_FRAMES from API | Cleaner public surface |
| 7 | Remove redundant variable | Code clarity |
| 8 | Fix unsafe cast | Zod-at-boundaries compliance |
| 9 | ReadonlyArray typing | Mutation prevention |
