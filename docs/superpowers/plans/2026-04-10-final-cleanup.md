# Final Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all remaining code quality issues across pi-agents and pi-teams: 200-line violations, duplicate types, dead exports, test helper duplication, and minor code smells.

**Architecture:** Quick, targeted refactors — no behavior changes. Split oversized files by extracting cohesive chunks. Unify duplicate types. Remove dead exports. Extract shared test helpers. Each task is independent.

**Tech Stack:** TypeScript (ESM-only), Vitest, Biome

**Repos:**
- `pi-agents` -> `/Users/josorio/Code/pi-agents`
- `pi-teams` -> `/Users/josorio/Code/pi-teams`

**Ordering:** Tasks 1-6 change pi-agents. Tasks 7-9 change pi-teams. Task 10 is final verification.

---

## File Structure

### pi-agents changes (Tasks 1-6)

| File | Action | Purpose |
|------|--------|---------|
| `src/tool/render-types.ts` | **Create** | Extract types + helpers from render.ts |
| `src/tool/render.ts` | **Modify** | Import from render-types.ts, drop below 200 lines |
| `src/tool/agent-tool-execute.ts` | **Modify** | Import from render-types.ts |
| `src/invocation/build-tools.ts` | **Create** | Extract tool-building logic from session.ts |
| `src/invocation/session.ts` | **Modify** | Import from build-tools.ts, drop below 200 lines |
| `src/domain/types.ts` | **Create** | Shared `DomainEntry` type |
| `src/domain/checker.ts` | **Modify** | Import DomainEntry from types.ts |
| `src/domain/scoped-tools.ts` | **Modify** | Import DomainEntry from types.ts |
| `src/tool/format.ts` | **Modify** | Unexport `formatToolCall` |
| `src/common/spinner.ts` | **Modify** | Unexport `SPINNER_FRAMES` |
| `src/tool/modes.ts` | **Modify** | Extract `CANCELLED_RESULT` constant |

### pi-teams changes (Tasks 7-9)

| File | Action | Purpose |
|------|--------|---------|
| `src/test-helpers.ts` | **Create** | Shared `stubConfig` for all tests |
| `src/delegate/create-delegate-tool.test.ts` | **Modify** | Import stub, extract parallel scope test |
| `src/delegate/scope-isolation.test.ts` | **Create** | Extracted parallel scope test |
| `src/delegate/targets.test.ts` | **Modify** | Import stub |
| `src/graph/builder.test.ts` | **Modify** | Import stub |
| `src/tui/render.test.ts` | **Modify** | Import stub |
| `src/e2e/helpers.ts` | **Modify** | Add shared `setupBaseProject` |
| `src/e2e/delegation-chain.test.ts` | **Modify** | Use shared setup |
| `src/e2e/nested-delegation.test.ts` | **Modify** | Use shared setup |
| `src/e2e/parallel-delegation.test.ts` | **Modify** | Use shared setup |

---

## Task 1: Split render.ts — extract types to render-types.ts

**Repo:** pi-agents
**Files:**
- Create: `src/tool/render-types.ts`
- Modify: `src/tool/render.ts`
- Modify: `src/tool/agent-tool-execute.ts`
- Modify: `src/api.ts` (if needed)

`render.ts` is 231 lines. Extract `RenderTheme`, `AgentResultEntry`, `AgentResultDetails`, `toResultEntry`, `runningEntry`, and the private types `AgentDisplay`/`FindAgent` to a new file.

- [ ] **Step 1: Create render-types.ts**

Create `src/tool/render-types.ts`:

```typescript
import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import type { AgentMetrics } from "../invocation/metrics.js";
import type { RunAgentResult } from "./modes.js";

export type RenderTheme = Readonly<{
  fg: (color: ThemeColor, text: string) => string;
  bold: (text: string) => string;
}>;

export type AgentDisplay = Readonly<{ icon: string; name: string; color: string; model: string }>;
export type FindAgent = (name: string) => AgentDisplay | undefined;

export type AgentResultEntry = Readonly<{
  agent: string;
  status: "running" | "done" | "error";
  metrics?: AgentMetrics;
  error?: string;
  step?: number;
  output?: string;
}>;

export type AgentResultDetails = Readonly<{
  mode: "single" | "parallel" | "chain";
  results: ReadonlyArray<AgentResultEntry>;
}>;

export function toResultEntry(params: {
  readonly agentName: string;
  readonly result: RunAgentResult;
  readonly step?: number;
}): AgentResultEntry {
  const { agentName, result, step } = params;
  const status: AgentResultEntry["status"] = result.error ? "error" : "done";
  const base = { agent: agentName, status, metrics: result.metrics, output: result.output };
  return { ...base, ...(result.error ? { error: result.error } : {}), ...(step !== undefined ? { step } : {}) };
}

export function runningEntry(params: { readonly agentName: string; readonly step?: number }): AgentResultEntry {
  return { agent: params.agentName, status: "running", ...(params.step !== undefined ? { step: params.step } : {}) };
}
```

- [ ] **Step 2: Update render.ts**

In `src/tool/render.ts`:
1. Remove the type definitions and helper functions that moved (lines 12-49)
2. Add imports from render-types:
```typescript
import type { AgentDisplay, AgentResultDetails, AgentResultEntry, FindAgent, RenderTheme } from "./render-types.js";
```
3. Re-export for backward compatibility:
```typescript
export type { AgentDisplay, AgentResultDetails, AgentResultEntry, FindAgent, RenderTheme };
export { runningEntry, toResultEntry } from "./render-types.js";
```

- [ ] **Step 3: Update agent-tool-execute.ts imports**

In `src/tool/agent-tool-execute.ts`, update imports to come from `render-types.js` instead of `render.js` for the types. Read the file first — it imports `AgentResultDetails`, `AgentResultEntry`, `runningEntry`, `toResultEntry` from `"./render.js"`. Change to `"./render-types.js"`.

- [ ] **Step 4: Verify render.ts is under 200 lines**

Run: `wc -l /Users/josorio/Code/pi-agents/src/tool/render.ts`
Expected: Under 200 lines.

- [ ] **Step 5: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tool/render-types.ts src/tool/render.ts src/tool/agent-tool-execute.ts
git commit -m "refactor: extract render types to render-types.ts (200-line limit)"
```

---

## Task 2: Split session.ts — extract tool building

**Repo:** pi-agents
**Files:**
- Create: `src/invocation/build-tools.ts`
- Modify: `src/invocation/session.ts`

`session.ts` is 212 lines. The tool-building section (lines 88-121) repeats the same `createToolForAgent` params 3 times. Extract to a helper.

- [ ] **Step 1: Create build-tools.ts**

Create `src/invocation/build-tools.ts`:

```typescript
import type { buildDomainWithKnowledge } from "../domain/scoped-tools.js";
import { createSubmitTool } from "../domain/submit-tool.js";
import { createToolForAgent } from "./tool-wrapper.js";

type ToolBuildParams = Readonly<{
  tools: ReadonlyArray<string>;
  cwd: string;
  domain: ReturnType<typeof buildDomainWithKnowledge>;
  conversationLogPath: string;
  agentName: string;
  knowledgeFiles: ReadonlyArray<Readonly<{ path: string; maxLines: number }>>;
  knowledgeEntries: ReadonlyArray<Readonly<{ path: string; updatable: boolean }>>;
}>;

export function buildAgentTools(params: ToolBuildParams) {
  const { tools, cwd, domain, conversationLogPath, agentName, knowledgeFiles, knowledgeEntries } = params;
  const shared = { cwd, domain, conversationLogPath, agentName, knowledgeFiles };

  const builtinTools = tools
    .map((t) => createToolForAgent({ name: t, ...shared }))
    .filter((t): t is NonNullable<typeof t> => t != null);

  const hasUpdatableKnowledge = knowledgeEntries.some((e) => e.updatable);
  const knowledgeToolNames = hasUpdatableKnowledge
    ? ["read-knowledge", "write-knowledge", "edit-knowledge"]
    : ["read-knowledge"];
  const knowledgeToolDefs = knowledgeToolNames
    .map((t) => createToolForAgent({ name: t, ...shared }))
    .filter((t): t is NonNullable<typeof t> => t != null);

  const conversationTool = createToolForAgent({ name: "read-conversation", ...shared });
  const conversationToolDefs = conversationTool ? [conversationTool] : [];

  const submitTool = createSubmitTool();

  return [...builtinTools, ...knowledgeToolDefs, ...conversationToolDefs, submitTool];
}
```

- [ ] **Step 2: Update session.ts**

In `src/invocation/session.ts`:
1. Add import: `import { buildAgentTools } from "./build-tools.js";`
2. Remove the `createSubmitTool` import (now in build-tools.ts)
3. Remove the `createToolForAgent` import (now in build-tools.ts)
4. Replace lines 88-124 (the entire tool-building section) with:

```typescript
  const allTools = buildAgentTools({
    tools: fm.tools,
    cwd,
    domain: fullDomain,
    conversationLogPath,
    agentName: fm.name,
    knowledgeFiles,
    knowledgeEntries,
  });
```

Then use `allTools` where the old code combined `[...builtinTools, ...knowledgeToolDefs, ...conversationToolDefs, submitTool]`.

- [ ] **Step 3: Verify session.ts is under 200 lines**

Run: `wc -l /Users/josorio/Code/pi-agents/src/invocation/session.ts`
Expected: Under 200 lines.

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/invocation/build-tools.ts src/invocation/session.ts
git commit -m "refactor: extract buildAgentTools from session.ts (200-line limit)"
```

---

## Task 3: Unify DomainEntry type

**Repo:** pi-agents
**Files:**
- Create: `src/domain/types.ts`
- Modify: `src/domain/checker.ts`
- Modify: `src/domain/scoped-tools.ts`

Both files define identical `DomainEntry` type. Extract to shared module.

- [ ] **Step 1: Create domain types module**

Create `src/domain/types.ts`:

```typescript
export type DomainEntry = Readonly<{
  path: string;
  read: boolean;
  write: boolean;
  delete: boolean;
}>;
```

- [ ] **Step 2: Update checker.ts**

In `src/domain/checker.ts`, remove the local `DomainEntry` type (lines 5-10) and add:
```typescript
import type { DomainEntry } from "./types.js";
```

- [ ] **Step 3: Update scoped-tools.ts**

In `src/domain/scoped-tools.ts`, remove the local `DomainEntry` type (lines 1-6) and add:
```typescript
import type { DomainEntry } from "./types.js";
```

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/domain/types.ts src/domain/checker.ts src/domain/scoped-tools.ts
git commit -m "refactor: unify DomainEntry type into domain/types.ts"
```

---

## Task 4: Remove dead exports

**Repo:** pi-agents
**Files:**
- Modify: `src/tool/format.ts`
- Modify: `src/common/spinner.ts`

- [ ] **Step 1: Unexport formatToolCall**

In `src/tool/format.ts`, change line 25:
```typescript
export function formatToolCall(name: string, args: Readonly<Record<string, unknown>>) {
```
To:
```typescript
function formatToolCall(name: string, args: Readonly<Record<string, unknown>>) {
```

- [ ] **Step 2: Unexport SPINNER_FRAMES**

In `src/common/spinner.ts`, change line 1:
```typescript
export const SPINNER_FRAMES: ReadonlyArray<string> = [
```
To:
```typescript
const SPINNER_FRAMES: ReadonlyArray<string> = [
```

- [ ] **Step 3: Update tests that import these**

Check if any test imports `formatToolCall` directly — if so, it tests internal behavior and the test should still work since vitest can import non-exported symbols... actually no, it can't. Read `src/tool/format.test.ts` to check. If `formatToolCall` is tested there, keep it exported but just remove it from `api.ts` (it's already not in api.ts so just leave it).

Similarly for `SPINNER_FRAMES` — read `src/common/spinner.test.ts` to check.

If tests import them, keep the exports but note they're internal-only (not in api.ts). The real issue was them being in api.ts — `SPINNER_FRAMES` was already removed from api.ts in a previous task. If `formatToolCall` was never in api.ts, skip this task.

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit (if changes were made)**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tool/format.ts src/common/spinner.ts
git commit -m "refactor: remove unused exports (formatToolCall, SPINNER_FRAMES)"
```

---

## Task 5: Extract CANCELLED_RESULT constant in modes.ts

**Repo:** pi-agents
**Files:**
- Modify: `src/tool/modes.ts`

The cancelled-result literal appears in both `executeParallel` and `executeChain`. Extract to a constant.

- [ ] **Step 1: Add constant**

In `src/tool/modes.ts`, add near the top (after imports):

```typescript
const CANCELLED_RESULT: RunAgentResult = {
  output: "",
  metrics: { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] },
  error: "Agent execution cancelled",
};
```

- [ ] **Step 2: Replace inline literals**

In `executeParallel`, replace the inline cancelled object (approximately lines 68-72) with `CANCELLED_RESULT`.

In `executeChain`, replace the inline cancelled object (approximately lines 115-119) with `CANCELLED_RESULT`.

- [ ] **Step 3: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tool/modes.ts
git commit -m "refactor: extract CANCELLED_RESULT constant in modes.ts"
```

---

## Task 6: Push pi-agents and reinstall in pi-teams

**Repo:** both

- [ ] **Step 1: Push pi-agents**

```bash
cd /Users/josorio/Code/pi-agents && git push
```

- [ ] **Step 2: Reinstall in pi-teams**

```bash
cd /Users/josorio/Code/pi-teams && npm install pi-agents@github:josorio7122/pi-agents
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/josorio/Code/pi-teams && npx tsc --noEmit`
Expected: Pass.

- [ ] **Step 4: Commit lock file**

```bash
cd /Users/josorio/Code/pi-teams
git add package-lock.json
git commit -m "chore: update pi-agents dependency"
```

---

## Task 7: Extract shared test helpers in pi-teams

**Repo:** pi-teams
**Files:**
- Create: `src/test-helpers.ts`
- Modify: `src/delegate/create-delegate-tool.test.ts`
- Modify: `src/delegate/targets.test.ts`
- Modify: `src/graph/builder.test.ts`
- Modify: `src/tui/render.test.ts`

4 test files define near-identical `stubConfig`/`stubAgent` helpers (~25 lines each). Extract to shared module.

- [ ] **Step 1: Create shared helper**

Read all 4 test files to find the most complete `stubConfig` version. Create `src/test-helpers.ts`:

```typescript
import type { AgentConfig } from "pi-agents";

export function stubConfig(name: string, overrides?: { readonly model?: string; readonly tools?: string[] }): AgentConfig {
  return {
    frontmatter: {
      name,
      description: `${name} agent`,
      model: overrides?.model ?? "anthropic/claude-sonnet-4-6",
      role: "worker",
      color: "#36f9f6",
      icon: "🔨",
      domain: [{ path: "src/", read: true, write: true, delete: false }],
      tools: overrides?.tools ?? ["read"],
      skills: [{ path: ".pi/skills/test.md", when: "Always" }],
      knowledge: {
        project: { path: ".pi/k/p/x.yaml", description: "P", updatable: true, "max-lines": 100 },
        general: { path: ".pi/k/g/x.yaml", description: "G", updatable: true, "max-lines": 100 },
      },
      conversation: { path: ".pi/sessions/x/conversation.jsonl" },
    },
    systemPrompt: `You are ${name}.`,
    filePath: `.pi/agents/${name}.md`,
    source: "project",
  };
}
```

- [ ] **Step 2: Update all 4 test files**

For each test file, add `import { stubConfig } from "../test-helpers.js";` (adjust path as needed) and delete the local helper function. Some files call it `stubAgent` — update call sites to use `stubConfig` or create an alias.

Read each file before editing to handle the specific function signature differences (e.g., `render.test.ts`'s `stubAgent` takes an optional `model` param, `create-delegate-tool.test.ts`'s takes optional `tools`).

- [ ] **Step 3: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/test-helpers.ts src/delegate/create-delegate-tool.test.ts src/delegate/targets.test.ts src/graph/builder.test.ts src/tui/render.test.ts
git commit -m "refactor: extract shared stubConfig test helper"
```

---

## Task 8: Split create-delegate-tool.test.ts — extract parallel scope test

**Repo:** pi-teams
**Files:**
- Create: `src/delegate/scope-isolation.test.ts`
- Modify: `src/delegate/create-delegate-tool.test.ts`

`create-delegate-tool.test.ts` is 374 lines. The parallel scope isolation test (starting at "parallel executions do not bleed events") is ~90 lines and is a self-contained scenario. Extract it.

- [ ] **Step 1: Read the test file**

Read `src/delegate/create-delegate-tool.test.ts` to identify the exact lines for the "parallel executions do not bleed events into each other's scope" test.

- [ ] **Step 2: Create scope-isolation.test.ts**

Move the entire `it("parallel executions do not bleed events...")` block into a new file `src/delegate/scope-isolation.test.ts`. Include all necessary imports and helper setup (`baseDeps`, `makeTarget`, `createDelegateTool`, `createFooterState`, etc).

Use `stubConfig` from `"../test-helpers.js"` (from Task 7) instead of the local helper.

- [ ] **Step 3: Remove from create-delegate-tool.test.ts**

Delete the extracted test from the original file.

- [ ] **Step 4: Verify line counts**

Run: `wc -l src/delegate/create-delegate-tool.test.ts`
Expected: Under 200 lines (was 374, removing ~100 lines).

- [ ] **Step 5: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/delegate/scope-isolation.test.ts src/delegate/create-delegate-tool.test.ts
git commit -m "refactor: extract parallel scope isolation test (200-line limit)"
```

---

## Task 9: DRY e2e setup functions

**Repo:** pi-teams
**Files:**
- Modify: `src/e2e/helpers.ts`
- Modify: `src/e2e/delegation-chain.test.ts`
- Modify: `src/e2e/nested-delegation.test.ts`
- Modify: `src/e2e/parallel-delegation.test.ts`

All 3 e2e tests have near-identical `setupProject` functions (~80-100 lines each) that create temp dirs, write agent markdown files, and skill files. Extract the shared boilerplate to `helpers.ts`.

- [ ] **Step 1: Read all 3 setup functions**

Read the setup function from each e2e test file to understand what differs. The common parts: creating temp dir, mkdir for `.pi/agents`, `.pi/teams`, `.pi/skills`, `.pi/knowledge/project`, `.pi/knowledge/general`, writing skill files, writing knowledge files. The different parts: which agents are created and what the teams.md content looks like.

- [ ] **Step 2: Add shared setup to helpers.ts**

In `src/e2e/helpers.ts`, add a `setupBaseProject` function that creates the common directory structure and writes shared files. It should accept a callback or config for the agent-specific parts.

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

export async function setupBaseProject(params: {
  readonly agents: ReadonlyArray<{ readonly name: string; readonly role: string; readonly tools: string; readonly body: string }>;
  readonly teamsMd: string;
}) {
  const dir = await mkdtemp(join(tmpdir(), "pi-teams-e2e-"));

  for (const d of [".pi/agents", ".pi/teams", ".pi/skills", ".pi/knowledge/project", ".pi/knowledge/general"]) {
    await mkdir(join(dir, d), { recursive: true });
  }

  // Write agent files
  for (const a of params.agents) {
    await writeFile(join(dir, ".pi/agents", `${a.name}.md`), agentMd(a));
  }

  // Write teams.md
  await writeFile(join(dir, ".pi/teams/teams.md"), params.teamsMd);

  // Write dummy skill and knowledge files
  await writeFile(join(dir, ".pi/skills/e2e.md"), "---\n---\nTest skill.");
  for (const a of params.agents) {
    await writeFile(join(dir, `.pi/knowledge/project/${a.name}.yaml`), "");
    await writeFile(join(dir, `.pi/knowledge/general/${a.name}.yaml`), "");
  }

  return dir;
}
```

- [ ] **Step 3: Update each e2e test**

Replace the local `setupProject` / `setupNestedProject` / `setupParallelProject` function in each test with a call to `setupBaseProject` + any test-specific additions (session dirs, output paths, etc).

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass (e2e tests may be skipped by default, unit tests pass).

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add src/e2e/helpers.ts src/e2e/delegation-chain.test.ts src/e2e/nested-delegation.test.ts src/e2e/parallel-delegation.test.ts
git commit -m "refactor: extract shared e2e project setup to helpers"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all pi-agents checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 2: Run all pi-teams checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 3: Verify no files over 200 lines**

```bash
find /Users/josorio/Code/pi-agents/src -name "*.ts" ! -name "*.test.ts" -exec wc -l {} + | awk '$1 > 200 {print}'
find /Users/josorio/Code/pi-teams/src -name "*.ts" ! -name "*.test.ts" -exec wc -l {} + | awk '$1 > 200 {print}'
```
Expected: No output (no source files over 200 lines).

- [ ] **Step 4: Push both repos**

```bash
cd /Users/josorio/Code/pi-agents && git push
cd /Users/josorio/Code/pi-teams && git push
```

---

## Summary

### pi-agents (5 tasks)
| Task | Change | Impact |
|------|--------|--------|
| 1 | Split render.ts -> render-types.ts | 231 -> ~190 lines |
| 2 | Split session.ts -> build-tools.ts | 212 -> ~175 lines |
| 3 | Unify DomainEntry type | Eliminate duplicate across 2 files |
| 4 | Remove dead exports | Clean public surface |
| 5 | Extract CANCELLED_RESULT | DRY in modes.ts |

### pi-teams (3 tasks)
| Task | Change | Impact |
|------|--------|--------|
| 7 | Extract shared stubConfig | Eliminate 4x duplicate ~25-line helpers |
| 8 | Split create-delegate-tool.test.ts | 374 -> ~280 lines |
| 9 | DRY e2e setup | Eliminate 3x duplicate ~80-line setup functions |
