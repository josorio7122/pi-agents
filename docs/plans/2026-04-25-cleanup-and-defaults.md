# Cleanup + Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. After each task: dispatch superpowers:code-reviewer subagent, then code-simplifier subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Built-in agents inherit parent model (no haiku pin); confirm + harden maxTurns extension-level enforcement; fix doc drift; deduplicate test mocks; remove dead code; mechanical simplifications.

**Architecture:** All changes are surgical. No new files (other than possibly extracted test helpers). No public API change. Six tasks ordered by independence.

**Tech Stack:** TypeScript, typebox (NOT zod), vitest.

**Out of scope:**
- Function decomposition of `runAgent` (deferred per simplifier — pre-emptive split without next feature)
- `executeXMode` consolidation (rejected by simplifier — readability cost)
- New features

---

## File Structure

| Status | Path | Responsibility |
|---|---|---|
| Modify | `src/built-in/explore.md` | Remove `model:` line so it inherits parent |
| Modify | `src/built-in/index.test.ts` | Update assertion: `explore.frontmatter.model` is undefined |
| Modify | `src/invocation/session.test.ts` | Add maxTurns throw-path regression test |
| Modify | `README.md` | Field count: "4 required + 7 optional" |
| Modify | `docs/architecture.md` | Replace Zod → typebox, fix file references, update field counts, drop stale knowledge-tools bullet |
| Modify | `src/invocation/session-test-helpers.ts` | Add `createFakeResourceLoader` factory + shared `fakeModel`/`fakeRegistry` constants |
| Modify | `src/invocation/session.test.ts` | Use shared helper |
| Modify | `src/invocation/abort-mid-flight.test.ts` | Use shared helper |
| Modify | `src/invocation/tool-enforcement.test.ts` | Use shared helper |
| Delete | `src/common/params.ts` | Orphan — `extractFilePath` has no callers |
| Delete | `src/common/params.test.ts` | Test for the orphan |
| Modify | `src/api.ts` | Remove `extractFilePath` re-export if present |
| Modify | `src/tool/modes.ts` | Drop dead-branch `candidates` thunk array; direct returns |
| Modify | `src/tool/render.ts` | Inline `extractSingleMode*` single-use helpers |

---

## Task 1: Built-in agents inherit parent model

**Files:**
- Modify: `src/built-in/explore.md`
- Modify: `src/built-in/index.test.ts`

- [ ] **Step 1: Update test to assert explore inherits model**

In `src/built-in/index.test.ts`, find the existing test for `explore` and ensure or add an assertion that `explore.frontmatter.model` is `undefined`:

```typescript
it("explore inherits parent model (no pin)", () => {
  const agents = loadBuiltInAgents();
  const explore = agents.find((a) => a.frontmatter.name === "explore");
  expect(explore?.frontmatter.model).toBeUndefined();
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- built-in`
Expected: FAIL — `explore.frontmatter.model === "anthropic/claude-haiku-4-5"`.

- [ ] **Step 3: Remove the `model:` line from `src/built-in/explore.md`**

Open `src/built-in/explore.md`. Delete the line `model: anthropic/claude-haiku-4-5`. The frontmatter block should retain `name`, `description`, `color`, `icon`, `tools`, `disallowedTools`, `inheritContextFiles` — `model` removed.

- [ ] **Step 4: Run — verify pass**

Run: `npm test -- built-in`
Expected: PASS, all 4 built-in tests green.

- [ ] **Step 5: Run full suite**

Run: `npm run check`
Expected: 233/233 PASS, lint + typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/built-in/explore.md src/built-in/index.test.ts
git commit -m "feat(built-in): explore inherits parent model (drop haiku pin)"
```

- [ ] **Step 7: Code review**

Dispatch `superpowers:code-reviewer` subagent. Prompt:

> Review commit on branch `feat/cleanup-and-defaults` removing `model: anthropic/claude-haiku-4-5` from `src/built-in/explore.md`. Confirm: (1) `explore.frontmatter.model` is now undefined → inherits parent's session model, (2) `general-purpose` was already inheriting (verify), (3) no other built-in references the haiku pin, (4) test coverage updated. Under 150 words.

- [ ] **Step 8: Simplifier**

Skip — pure single-line removal, nothing to simplify.

---

## Task 2: maxTurns throw-path regression coverage

**Why:** Existing test covers the happy-path (`session.prompt` resolves cleanly after abort). The throw-path (`session.prompt` rejects when abort lands mid-turn) is uncovered. Both paths must surface the maxTurns error.

**Files:**
- Modify: `src/invocation/session.test.ts`

- [ ] **Step 1: Inspect existing maxTurns test**

Read `src/invocation/session.test.ts` and locate the existing test "returns a maxTurns error when the cap fires but session.prompt resolves cleanly". Note its mock-driver pattern (turn_end emit + clean prompt resolution).

- [ ] **Step 2: Write throw-path test**

Add a new test next to the existing maxTurns test:

```typescript
it("returns a maxTurns error when session.prompt() throws after abort", async () => {
  const project = await makeTempProject();
  const base = makeTestAgent(project.dir);
  const agent = withMaxTurns(base, 1);

  // Drive the mock so prompt() rejects when session.abort() is called
  // (simulates pi's prompt rejecting on cancellation mid-turn).
  setMockPromptBehavior("reject-on-abort");

  const result = await runAgent({
    agentConfig: agent,
    task: "noop",
    cwd: project.dir,
    sessionDir: project.sessionsDir,
    modelRegistry: fakeRegistry,
  });

  expect(result.error).toContain("maxTurns");
  expect(result.error).toContain("1");
});
```

The exact mock-driver shape depends on the existing test infra. The principle: when `session.abort()` is called from inside the maxTurns subscriber, make the test's mocked `prompt()` reject (instead of resolving cleanly). Verify the catch-block in `session.ts:169-179` produces the maxTurns error with priority over the generic error.

If the existing mock-driver doesn't support both modes, extend it minimally: add a flag (e.g. on `mockSession.promptMode = "reject-on-abort" | "resolve-clean"`) to switch between behaviors.

- [ ] **Step 3: Run — verify pass**

Run: `npm test -- session.test`
Expected: 234 tests pass (was 233; +1).

- [ ] **Step 4: Run full check**

Run: `npm run check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/invocation/session.test.ts
git commit -m "test(session): cover maxTurns error on session.prompt() throw path"
```

- [ ] **Step 6: Code review**

Dispatch `superpowers:code-reviewer` subagent. Prompt:

> Review commit on `feat/cleanup-and-defaults` adding a maxTurns throw-path regression test. Confirm: (1) test deterministically fails if `session.ts:169-179` catch-block prioritization regresses, (2) mock-driver extension is minimal and idempotent across tests, (3) no flake risk. Under 150 words.

---

## Task 3: Doc drift fix

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Read current README.md and docs/architecture.md**

Read both files end-to-end. Identify all stale references:
- `README.md:9` — "4 required + 3 optional" (should be 7 optional)
- `docs/architecture.md` — search for `Zod` (3 occurrences), replace with `typebox` and reference `@sinclair/typebox`
- `docs/architecture.md:25,29` — field counts
- `docs/architecture.md:30` — `src/schema/validation.ts` does not exist; rules live in `src/schema/frontmatter.ts:44-54`
- `docs/architecture.md:22` — references `src/discovery/parser.ts` — actual primary parser is `extract-frontmatter.ts` (`parser.ts` is a re-export shim)
- `docs/architecture.md:108` — "Knowledge tools are separate from generic write/edit" — knowledge subsystem doesn't exist; remove this bullet

- [ ] **Step 2: Update `README.md:9`**

Find: `Minimal frontmatter: 4 required fields + 3 optional.`
Replace with: `Minimal frontmatter: 4 required fields + 7 optional.`

- [ ] **Step 3: Update `docs/architecture.md` — typebox replacement**

Replace every occurrence of `Zod` with `typebox` (case-sensitive).
- Line 25: `Zod schemas` → `typebox schemas`
- Line 29: `Zod validation` → `typebox validation`
- Line 106: `Zod at boundaries` → `typebox at boundaries`

(Use `grep -n Zod docs/architecture.md` to confirm exact lines.)

- [ ] **Step 4: Update `docs/architecture.md` — field count**

Find: `4 required: name, description, color, icon; 3 optional: model, tools, skills`
Replace with: `4 required: name, description, color, icon; 7 optional: model, tools, skills, disallowedTools, maxTurns, inheritContextFiles, isolation`

- [ ] **Step 5: Update `docs/architecture.md` — file references**

Find the row `| \`validator.ts\` | Zod validation + cross-field checks (role-tool constraints) |` and update:
- Drop the `validation.ts` row entirely if present (file doesn't exist).
- Update `validator.ts` description to reference typebox + the actual location of cross-field checks (`frontmatter.ts:44-54`).
- Confirm `parser.ts` row reflects current state — if `extract-frontmatter.ts` is the primary parser, add it; mark `parser.ts` as a compat re-export.

- [ ] **Step 6: Drop stale knowledge-tools design-decision bullet**

In `docs/architecture.md` "Key Design Decisions" section, find: `Knowledge tools are separate from generic write/edit — prevents accidental writes outside knowledge scope`. Delete this bullet — no knowledge subsystem exists.

- [ ] **Step 7: Run check**

Run: `npm run check`
Expected: clean (docs don't affect lint/test).

- [ ] **Step 8: Commit**

```bash
git add README.md docs/architecture.md
git commit -m "docs: fix doc drift — typebox, field counts, file references"
```

- [ ] **Step 9: Code review**

Dispatch `superpowers:code-reviewer` subagent. Prompt:

> Review doc-drift commit on `feat/cleanup-and-defaults`. Confirm: (1) no remaining `Zod` references in `docs/`, (2) field count `4 required + 7 optional` matches `src/schema/frontmatter.ts`, (3) file references in architecture.md exist on disk, (4) no other stale claims about features that don't ship (knowledge subsystem, etc). Under 150 words.

---

## Task 4: Test infra extraction

**Files:**
- Modify: `src/invocation/session-test-helpers.ts`
- Modify: `src/invocation/session.test.ts`
- Modify: `src/invocation/abort-mid-flight.test.ts`
- Modify: `src/invocation/tool-enforcement.test.ts`

- [ ] **Step 1: Inspect duplication**

Read all three test files and identify what's duplicated:
- `FakeResourceLoader` class (~25 LOC each)
- `fakeModel` constant
- `fakeRegistry` constant

Compare the three copies. Note differences (one captures constructor opts, others don't). The shared form should support both via an optional callback param.

- [ ] **Step 2: Add shared helpers to `session-test-helpers.ts`**

Append:

```typescript
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";

export const fakeModel: Model<Api> = {
  // ... shape from existing copies
};

export const fakeRegistry: ModelRegistry = {
  // ... shape from existing copies
};

export function createFakeResourceLoader(opts?: {
  onConstruct?: (constructorOpts: unknown) => void;
}) {
  return class FakeResourceLoader {
    constructor(constructorOpts: unknown) {
      opts?.onConstruct?.(constructorOpts);
    }
    // ... seven stub methods from existing copies
  };
}
```

The exact shape of `fakeModel`/`fakeRegistry` is whatever the three existing copies use. Do NOT invent fields — copy verbatim.

- [ ] **Step 3: Replace duplicates in three test files**

In each of `session.test.ts`, `abort-mid-flight.test.ts`, `tool-enforcement.test.ts`:
- Remove the inline `FakeResourceLoader` class
- Remove the inline `fakeModel`/`fakeRegistry` constants
- Import from `./session-test-helpers.js`
- Use `createFakeResourceLoader()` (or with the constructor callback for `session.test.ts` if needed)

The `vi.mock(...)` calls at the top of each file MUST stay — vitest hoists them; they can't be moved into a helper. Inside the mock factory body, call the helper.

- [ ] **Step 4: Run — verify all tests still pass**

Run: `npm run check`
Expected: 234 tests pass (after Task 2's addition), no behavior change.

- [ ] **Step 5: Commit**

```bash
git add src/invocation/session-test-helpers.ts src/invocation/session.test.ts src/invocation/abort-mid-flight.test.ts src/invocation/tool-enforcement.test.ts
git commit -m "refactor(test): extract FakeResourceLoader + faux model/registry to shared helpers"
```

- [ ] **Step 6: Code review**

Dispatch `superpowers:code-reviewer` subagent. Prompt:

> Review test-helper extraction on `feat/cleanup-and-defaults`. Confirm: (1) zero behavior change — all 234 tests still pass with same assertions, (2) shared helpers in `session-test-helpers.ts` are the minimum API needed by all three call sites (no over-abstraction), (3) `vi.mock` hoisting still works correctly per file, (4) no leakage between test files (mock state isolated). Under 150 words.

- [ ] **Step 7: Simplifier**

Dispatch `code-simplifier:code-simplifier`. Prompt:

> Simplify only the new helpers in `src/invocation/session-test-helpers.ts`. Goal: smallest reasonable API for the three call sites. Don't merge unrelated helpers. Don't refactor existing `makeTempProject`/`makeTestAgent`. Report changes under 100 words.

---

## Task 5: Dead code removal

**Files:**
- Delete: `src/common/params.ts`
- Delete: `src/common/params.test.ts`
- Modify: `src/api.ts` (if `extractFilePath` is re-exported)

- [ ] **Step 1: Verify no in-source callers**

Run: `grep -rn "extractFilePath" /Users/josorio/Code/pi-agents/.worktrees/cleanup/src/ 2>&1 | grep -v "params.ts\|params.test.ts"`
Expected: empty output (no callers outside the file itself + its test).

- [ ] **Step 2: Check `src/api.ts` for re-export**

Read `src/api.ts`. If `extractFilePath` is exported, remove the export line.

- [ ] **Step 3: Delete the orphan files**

Run:
```bash
rm src/common/params.ts src/common/params.test.ts
```

- [ ] **Step 4: Run check**

Run: `npm run check`
Expected: clean. If lint complains about unused imports anywhere, fix.

- [ ] **Step 5: Commit**

```bash
git add -u src/common/params.ts src/common/params.test.ts src/api.ts
git commit -m "chore: remove orphan extractFilePath (no callers)"
```

(Use `git add -u` for the deletions; explicit add for `api.ts` if modified.)

- [ ] **Step 6: Code review**

Dispatch `superpowers:code-reviewer` subagent. Prompt:

> Review dead-code removal on `feat/cleanup-and-defaults`. Confirm: (1) no remaining call sites for `extractFilePath`, (2) `src/api.ts` no longer exports it, (3) no test file imports it, (4) lint/typecheck clean. Under 100 words.

---

## Task 6: Simplifications

**Files:**
- Modify: `src/tool/modes.ts`
- Modify: `src/tool/render.ts`

### Sub-task 6a: `detectMode` direct returns

- [ ] **Step 1: Read current `detectMode` in `src/tool/modes.ts:41-63`**

Note the `candidates` thunk-array pattern + the unreachable `if (!build)` check.

- [ ] **Step 2: Replace with direct returns**

Replace the function body with:

```typescript
export function detectMode(params: Record<string, unknown>): ModeOrError {
  const hasSingle = typeof params.agent === "string" && typeof params.task === "string";
  const hasParallel = Array.isArray(params.tasks) && params.tasks.length > 0;
  const hasChain = Array.isArray(params.chain) && params.chain.length > 0;

  const count = (hasSingle ? 1 : 0) + (hasParallel ? 1 : 0) + (hasChain ? 1 : 0);
  if (count === 0) {
    return { error: "No mode specified. Provide agent+task, tasks array, or chain array." };
  }
  if (count > 1) {
    return { error: "Multiple modes specified. Provide exactly one of: agent+task, tasks, or chain." };
  }

  if (hasSingle) return { mode: "single", agent: String(params.agent), task: String(params.task) };
  if (hasParallel) return { mode: "parallel", tasks: toTaskArray(params.tasks) };
  return { mode: "chain", chain: toTaskArray(params.chain) };
}
```

- [ ] **Step 3: Run — verify pass**

Run: `npm test -- modes`
Expected: existing detectMode tests still pass.

### Sub-task 6b: Inline `extractSingleMode*` helpers in `render.ts`

- [ ] **Step 4: Locate the helpers in `src/tool/render.ts`**

Find `extractSingleModeAgent` (around line 87-97) and `extractSingleModeTask` (around 130-131). Each is a single-line ternary helper used exactly once.

- [ ] **Step 5: Inline both helpers**

Replace the call sites with the ternary expressions directly. Delete the helper definitions.

- [ ] **Step 6: Run check**

Run: `npm run check`
Expected: 234 tests pass, lint clean.

- [ ] **Step 7: Commit (one commit covering both sub-tasks)**

```bash
git add src/tool/modes.ts src/tool/render.ts
git commit -m "refactor: simplify detectMode + inline single-use render helpers"
```

- [ ] **Step 8: Code review**

Dispatch `superpowers:code-reviewer` subagent. Prompt:

> Review simplification commit on `feat/cleanup-and-defaults`. Confirm: (1) `detectMode` semantics preserved — same error strings, same return shapes, (2) `render.ts` helper inlining doesn't lose readability, (3) no behavior change in any of 234 tests. Under 150 words.

- [ ] **Step 9: Simplifier**

Dispatch `code-simplifier:code-simplifier`. Prompt:

> Re-check `src/tool/modes.ts` and `src/tool/render.ts` after simplification commit. Look for any remaining redundancy this pass introduced (e.g. duplicated branch shapes). Don't introduce new abstractions. Report changes under 100 words.

---

## Final PR

- [ ] **Push branch and open PR**

```bash
git push -u origin feat/cleanup-and-defaults
gh pr create --title "chore: cleanup + built-in defaults inherit parent model" --body "$(cat <<'EOF'
## Summary
- Built-in `explore` agent inherits parent model (drop haiku pin)
- maxTurns throw-path regression test (extension-level enforcement remains, since pi has no native cap)
- Doc drift fix: typebox not Zod, field counts, file references
- Extract `FakeResourceLoader` + faux model/registry to shared helpers (~75 LOC dedup)
- Remove orphan `extractFilePath` (no callers)
- Simplify `detectMode` direct returns; inline single-use render helpers

## Test plan
- [ ] `npm run check` clean
- [ ] `npm run test:e2e` clean (skips without `ANTHROPIC_API_KEY`)
- [ ] Manual: spawn `explore` agent, verify it inherits parent's model
EOF
)"
```

---

## Self-review checklist

**Spec coverage:**
- [x] Built-ins inherit parent (Task 1)
- [x] maxTurns confirmation + throw-path coverage (Task 2)
- [x] Doc drift (Task 3)
- [x] Test infra extraction (Task 4)
- [x] Dead code (Task 5)
- [x] Simplifications (Task 6)
- [x] Per-task code review embedded
- [x] Per-task simplifier where applicable embedded
- [x] Single PR, multiple commits

**Placeholders:** none — every step has runnable code or precise diagnostic.

**Type consistency:** `RunAgentResult`, `AgentConfig`, mock helper signatures consistent across tasks.

**Reminders:**
- typebox only — never zod
- pi is permissionless — no permission flags
- sync-only — no async/background/fork
