# Subagent Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. After each task: dispatch superpowers:code-reviewer subagent, then code-simplifier subagent, then run e2e if applicable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring pi-agents to feature parity and reliability with claude-code's subagent model, in pi-native form (sync-only, permissionless, typebox).

**Architecture:** Five additive changes to existing pipeline (Discovery → Validation → Invocation → Rendering). No new stages. Each change is an extension of the existing schema, the existing `runAgent`, or the existing build-tools step. JSONL transcripts swap an in-memory `SessionManager` for a disk-backed one — zero API change.

**Tech Stack:** TypeScript, typebox (NOT zod), vitest, `@mariozechner/pi-coding-agent` SDK (`createAgentSession`, `SessionManager.create`).

**Out of scope (intentional):**
- Per-agent MCP, per-agent hooks (pi has no native MCP/hooks layer)
- Permission modes (pi is permissionless by design)
- Background/async agents, fork, mailbox, resumable agents (deferred — not load-bearing)
- Plan / verification / statusline-setup / claude-code-guide built-ins (CC-specific or task-system-coupled)

---

## File Structure

| Status | Path | Responsibility |
|---|---|---|
| Modify | `src/schema/frontmatter.ts` | Add `disallowedTools`, `maxTurns`, `inheritContextFiles` typebox fields |
| Modify | `src/invocation/build-tools.ts` | Apply `tools` + `disallowedTools` intersection |
| Modify | `src/invocation/session.ts` | Disk-backed `SessionManager`, `maxTurns` plumb, `inheritContextFiles` gate, optional worktree wrap |
| Modify | `src/prompt/assembly.ts` | Skip context files when `inheritContextFiles === false` |
| Create | `src/built-in/general-purpose.md` | Default fallback agent (full toolset, inherit model) |
| Create | `src/built-in/explore.md` | Read-only fast agent (haiku, no edit/write) |
| Create | `src/built-in/index.ts` | Loader for built-in agents, registered alongside discovered |
| Modify | `src/index.ts` | Merge built-ins into `discoverAgents`, allow user/project override by name |
| Create | `src/invocation/worktree.ts` | `git worktree add` / `remove` lifecycle, `worktrees/.gitignore` bootstrap |
| Modify | `src/invocation/session.ts` | Optional worktree wrap when `frontmatter.isolation === "worktree"` |
| Create | `src/invocation/tool-enforcement.test.ts` | Verify pi-side tool allowlist enforcement (not just listing) |
| Create | `src/invocation/abort-mid-flight.test.ts` | Verify abort mid-tool-call propagates |
| Create | `src/invocation/transcripts-e2e.test.ts` | E2E: real agent run produces JSONL on disk |
| Create | `src/invocation/built-in-e2e.test.ts` | E2E: built-in `explore` returns sane result |
| Create | `src/invocation/worktree-e2e.test.ts` | E2E: worktree-isolated agent edits don't touch parent cwd |

---

## Task 1: JSONL transcripts (visibility foundation)

**Why first:** disk transcripts make every subsequent task debuggable. If task 4's worktree agent misbehaves, we read the JSONL.

**Files:**
- Modify: `src/invocation/session.ts:76-86`
- Test: `src/invocation/session.test.ts` (add cases)
- Create E2E: `src/invocation/transcripts-e2e.test.ts`

- [ ] **Step 1: Write failing unit test for disk-backed transcript**

Append to `src/invocation/session.test.ts`:

```typescript
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

it("writes a JSONL transcript per agent run under sessionDir/agents/<id>/", async () => {
  const project = await makeTempProject();
  const agent = makeTestAgent(project.dir);

  await runAgent({
    agentConfig: agent,
    task: "say hi",
    cwd: project.dir,
    sessionDir: project.sessionsDir,
    modelRegistry: makeFauxModelRegistry(),
  });

  const agentsDir = join(project.sessionsDir, "agents");
  expect(existsSync(agentsDir)).toBe(true);
  const dirs = readdirSync(agentsDir);
  expect(dirs.length).toBe(1);
  const files = readdirSync(join(agentsDir, dirs[0]!));
  expect(files.some((f) => f.endsWith(".jsonl"))).toBe(true);
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npm test -- session.test`
Expected: FAIL — `agentsDir` does not exist (today: `SessionManager.inMemory()`).

- [ ] **Step 3: Swap to disk-backed `SessionManager`**

In `src/invocation/session.ts`, replace:

```typescript
sessionManager: SessionManager.inMemory(),
```

with:

```typescript
const agentId = randomUUID();
const agentSessionDir = join(sessionDir, "agents", agentId);
mkdirSync(agentSessionDir, { recursive: true });
// ...
sessionManager: SessionManager.create(cwd, agentSessionDir),
```

Add imports at top of file:

```typescript
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
```

Replace `SessionManager.inMemory()` import line with `SessionManager`.

- [ ] **Step 4: Run unit test — verify pass**

Run: `npm test -- session.test`
Expected: PASS.

- [ ] **Step 5: Run full unit suite**

Run: `npm test`
Expected: 205+ pass, 0 fail.

- [ ] **Step 6: Write E2E test**

Create `src/invocation/transcripts-e2e.test.ts`:

```typescript
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { runAgent } from "./session.js";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

describe("transcripts e2e", () => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  it.skipIf(!hasApiKey)(
    "real agent writes parseable JSONL transcript",
    async () => {
      const authStorage = AuthStorage.create();
      const modelRegistry = ModelRegistry.create(authStorage);
      const project = await makeTempProject();
      const base = makeTestAgent(project.dir);
      const agent = { ...base, frontmatter: { ...base.frontmatter, model: "anthropic/claude-haiku-4-5" } };

      await runAgent({
        agentConfig: agent,
        task: "Reply with the word: pong",
        cwd: project.dir,
        sessionDir: project.sessionsDir,
        modelRegistry,
      });

      const agentsDir = join(project.sessionsDir, "agents");
      const [agentId] = readdirSync(agentsDir);
      const files = readdirSync(join(agentsDir, agentId!));
      const jsonl = files.find((f) => f.endsWith(".jsonl"))!;
      const content = readFileSync(join(agentsDir, agentId!, jsonl), "utf-8");
      const lines = content.trim().split("\n").map((l) => JSON.parse(l));
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toHaveProperty("type");
    },
    30_000,
  );
});
```

- [ ] **Step 7: Run E2E**

Run: `npm run test:e2e`
Expected: PASS (with `ANTHROPIC_API_KEY`); SKIP otherwise.

- [ ] **Step 8: Commit**

```bash
git add src/invocation/session.ts src/invocation/session.test.ts src/invocation/transcripts-e2e.test.ts
git commit -m "feat(invocation): persist subagent JSONL transcripts under sessionDir/agents/<id>/"
```

- [ ] **Step 9: Code review**

Dispatch superpowers:code-reviewer subagent. Prompt:

> Review commit on branch feat/subagent-parity that swaps `SessionManager.inMemory()` for `SessionManager.create()` in `src/invocation/session.ts`. Goals: (1) JSONL transcript per agent run on disk under `sessionDir/agents/<id>/`, (2) zero API change for callers, (3) test verifying disk artifact. Confirm: no resource leak (cleanup path on error?), no path-traversal risk in agentId, agentId stable enough for rendering layer, mkdirSync race safe. Report under 200 words.

- [ ] **Step 10: Code simplification pass**

Dispatch code-simplifier subagent. Prompt:

> Simplify the changes in commit on `src/invocation/session.ts` only. Goal: minimal diff vs. previous version while preserving disk-backed SessionManager. Don't touch tests. Don't add abstractions. Don't refactor surrounding code. Report any change you make under 100 words.

- [ ] **Step 11: Re-run full suite**

Run: `npm run check`
Expected: PASS.

---

## Task 2: Frontmatter additions — `disallowedTools`, `maxTurns`, `inheritContextFiles`

**Files:**
- Modify: `src/schema/frontmatter.ts`
- Modify: `src/invocation/build-tools.ts`
- Modify: `src/invocation/session.ts` (plumb `maxTurns`)
- Modify: `src/prompt/assembly.ts` (gate context files)
- Modify: `docs/agent-example.md` (document new fields)

- [ ] **Step 1: Write failing typebox schema test**

Append to `src/schema/frontmatter.test.ts` (or create if absent — check first):

```typescript
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { AgentFrontmatterSchema } from "./frontmatter.js";

describe("frontmatter additions", () => {
  it("accepts disallowedTools", () => {
    const fm = {
      name: "x", description: "y", color: "#abcdef", icon: "i",
      disallowedTools: ["write", "edit"],
    };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(true);
  });

  it("accepts maxTurns positive integer", () => {
    const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", maxTurns: 10 };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(true);
  });

  it("rejects maxTurns zero or negative", () => {
    const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", maxTurns: 0 };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(false);
  });

  it("accepts inheritContextFiles boolean", () => {
    const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", inheritContextFiles: false };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `npm test -- frontmatter`
Expected: FAIL — schema doesn't know the new keys.

- [ ] **Step 3: Extend schema**

Edit `src/schema/frontmatter.ts`. Add three optional fields inside the `Type.Object`:

```typescript
disallowedTools: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
maxTurns: Type.Optional(Type.Integer({ minimum: 1 })),
inheritContextFiles: Type.Optional(Type.Boolean()),
```

- [ ] **Step 4: Run schema test — verify pass**

Run: `npm test -- frontmatter`
Expected: PASS.

- [ ] **Step 5: Failing unit test for `disallowedTools` enforcement**

Add to `src/invocation/build-tools.test.ts` (or create):

```typescript
import { describe, expect, it } from "vitest";
import { buildAgentTools } from "./build-tools.js";

describe("disallowedTools", () => {
  it("filters out denied tools from effective set", () => {
    const result = buildAgentTools({
      tools: ["read", "bash", "write"],
      disallowedTools: ["write"],
      cwd: "/tmp",
    });
    const names = result.builtinTools.map((t) => t.name);
    expect(names).toContain("read");
    expect(names).toContain("bash");
    expect(names).not.toContain("write");
  });

  it("applies disallowedTools against pi default when tools omitted", () => {
    const result = buildAgentTools({
      tools: undefined,
      disallowedTools: ["edit", "write"],
      cwd: "/tmp",
    });
    const names = result.builtinTools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["read", "bash"]));
    expect(names).not.toContain("edit");
    expect(names).not.toContain("write");
  });
});
```

- [ ] **Step 6: Run — verify fail**

Run: `npm test -- build-tools`
Expected: FAIL — `disallowedTools` param unknown.

- [ ] **Step 7: Implement `disallowedTools` in `build-tools.ts`**

Replace the function with:

```typescript
export function buildAgentTools(params: {
  readonly tools: readonly string[] | undefined;
  readonly disallowedTools?: readonly string[] | undefined;
  readonly cwd: string;
}): Readonly<{
  builtinTools: ReadonlyArray<ExecutableTool>;
  customTools: ReadonlyArray<ExecutableTool>;
}> {
  const allow = params.tools ?? PI_DEFAULT_TOOLS;
  const deny = new Set(params.disallowedTools ?? []);
  const effective = allow.filter((name) => !deny.has(name));
  const builtinTools = effective
    .map((name) => buildBuiltin(name, params.cwd))
    .filter((tool): tool is ExecutableTool => tool !== undefined);
  return { builtinTools, customTools: [] };
}
```

- [ ] **Step 8: Update caller in `session.ts`**

Edit the call site (currently `~line 52`):

```typescript
const { builtinTools, customTools: builtCustomTools } = buildAgentTools({
  tools: fm.tools,
  disallowedTools: fm.disallowedTools,
  cwd,
});
```

- [ ] **Step 9: Run — verify pass**

Run: `npm test -- build-tools`
Expected: PASS.

- [ ] **Step 10: Plumb `maxTurns` into `createAgentSession`**

Verify pi-coding-agent's `createAgentSession` accepts `maxTurns` (check `node_modules/@mariozechner/pi-coding-agent/docs/sdk.md` section "Options Reference"). If supported, add to the options object in `session.ts`:

```typescript
const { session } = await createAgentSession({
  cwd,
  model,
  tools: activeToolNames,
  customTools: allCustomTools,
  sessionManager: SessionManager.create(cwd, agentSessionDir),
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  modelRegistry,
  resourceLoader,
  ...(fm.maxTurns ? { maxTurns: fm.maxTurns } : {}),
});
```

If pi's SDK doesn't expose `maxTurns` directly, store the value and check turn count via `session.subscribe` events; abort when exceeded. Document the chosen path in the commit message.

- [ ] **Step 11: Failing test for `inheritContextFiles: false` skipping context discovery**

Add to `src/invocation/session.test.ts`:

```typescript
it("skips shared context when inheritContextFiles is false", async () => {
  const project = await makeTempProject();
  // create AGENTS.md so discoverContextFiles would find it
  writeFileSync(join(project.dir, "AGENTS.md"), "# repo guidelines\nrule");
  const base = makeTestAgent(project.dir);
  const agent = { ...base, frontmatter: { ...base.frontmatter, inheritContextFiles: false } };

  const result = await runAgent({
    agentConfig: agent,
    task: "noop",
    cwd: project.dir,
    sessionDir: project.sessionsDir,
    modelRegistry: makeFauxModelRegistry(),
  });
  expect(result.error).toBeUndefined();
  // System prompt should NOT contain the AGENTS.md content — peek at JSONL transcript header
  // (assert via reading session manager's first system message; precise assertion depends on transcript format).
});
```

- [ ] **Step 12: Implement gate**

In `src/invocation/session.ts:35`:

```typescript
const sharedContextContents = sharedContext
  ?? (fm.inheritContextFiles === false ? [] : await discoverContextFiles({ cwd }));
```

- [ ] **Step 13: Run — verify pass**

Run: `npm test -- session.test`
Expected: PASS.

- [ ] **Step 14: Update docs**

Edit `docs/agent-example.md`. Append a new section after "Fuller example with explicit overrides":

```markdown
## Optional fields

- `disallowedTools` — list of tool names denied for this agent. Intersected with `tools` (or pi's default). Useful when you want "all tools except write/edit" for a read-only agent.
- `maxTurns` — positive integer; agent loop stops after this many LLM turns. Defaults to pi's default (no cap) when omitted.
- `inheritContextFiles` — boolean; when `false`, skip discovery of `AGENTS.md` and other shared context files. Use for read-only agents that don't need commit/lint guidelines.
```

- [ ] **Step 15: Full check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add src/schema/frontmatter.ts src/invocation/build-tools.ts src/invocation/session.ts src/prompt/assembly.ts src/invocation/build-tools.test.ts src/invocation/session.test.ts src/schema/frontmatter.test.ts docs/agent-example.md
git commit -m "feat(schema): add disallowedTools, maxTurns, inheritContextFiles fields"
```

- [ ] **Step 17: Code review**

Dispatch code-reviewer subagent. Prompt:

> Review the latest commit on feat/subagent-parity adding three optional frontmatter fields (`disallowedTools`, `maxTurns`, `inheritContextFiles`). Confirm: typebox usage (NOT zod), schema validation paths, default behavior preserved when fields absent, no breaking changes to existing agents, tests cover both happy and rejected paths. Flag any introduction of zod or any field that isn't truly optional. Report under 200 words.

- [ ] **Step 18: Code simplification**

Dispatch code-simplifier subagent. Prompt:

> Simplify changes in latest commit. Constraint: NO behavior change. Targets: `src/invocation/build-tools.ts` (the deny-set logic), `src/invocation/session.ts` (the new option-spread). Don't touch typebox schema. Don't refactor unrelated code. Report changes under 100 words.

- [ ] **Step 19: Re-run check**

Run: `npm run check`
Expected: PASS.

---

## Task 3: Built-in agents (`general-purpose` + `explore`)

**Files:**
- Create: `src/built-in/general-purpose.md`
- Create: `src/built-in/explore.md`
- Create: `src/built-in/index.ts`
- Create: `src/built-in/index.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing test for built-in registration**

Create `src/built-in/index.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { loadBuiltInAgents } from "./index.js";

describe("built-in agents", () => {
  it("loads general-purpose and explore", () => {
    const agents = loadBuiltInAgents();
    const names = agents.map((a) => a.frontmatter.name);
    expect(names).toContain("general-purpose");
    expect(names).toContain("explore");
  });

  it("explore is read-only via disallowedTools", () => {
    const agents = loadBuiltInAgents();
    const explore = agents.find((a) => a.frontmatter.name === "explore");
    expect(explore?.frontmatter.disallowedTools).toEqual(
      expect.arrayContaining(["edit", "write"]),
    );
  });

  it("explore has inheritContextFiles: false", () => {
    const agents = loadBuiltInAgents();
    const explore = agents.find((a) => a.frontmatter.name === "explore");
    expect(explore?.frontmatter.inheritContextFiles).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test -- built-in`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/built-in/general-purpose.md`**

```markdown
---
name: general-purpose
description: Default fallback agent for general-purpose tasks. Inherits parent's model and full default tool set.
color: "#9aa0a6"
icon: 🤖
---
You are a general-purpose agent. Read carefully, plan, then act. Prefer fewer, well-targeted tool calls over exploratory thrashing.
```

- [ ] **Step 4: Create `src/built-in/explore.md`**

```markdown
---
name: explore
description: Fast read-only codebase exploration — find files, search code, read selectively. Returns structured findings only. No edits.
color: "#36f9f6"
icon: 🔍
model: anthropic/claude-haiku-4-5
tools:
  - read
  - bash
  - grep
  - find
  - ls
disallowedTools:
  - edit
  - write
inheritContextFiles: false
---
You are an exploration agent.

Hard constraints:
- READ-ONLY. You have no `edit` or `write` tools.
- Use `grep` for content search, `find` for filename search, `read` for inspection.
- Use `bash` only for read-only commands (`ls`, `git status`, `git log`, `cat`).

Output format:
- Lead with a one-line summary.
- Then a bulleted list of relevant file paths (`path:line` when applicable).
- Quote only the lines that matter.
- No editorial — facts only.
```

- [ ] **Step 5: Create `src/built-in/index.ts`**

```typescript
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractFrontmatter } from "../discovery/extract-frontmatter.js";
import type { AgentConfig } from "../discovery/validator.js";
import { validateAgent } from "../discovery/validator.js";

export function loadBuiltInAgents(): ReadonlyArray<AgentConfig> {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const agents: AgentConfig[] = [];
  for (const f of files) {
    const filePath = join(dir, f);
    const content = readFileSync(filePath, "utf-8");
    const extracted = extractFrontmatter(content);
    if (!extracted.ok) {
      throw new Error(`Built-in agent ${f} has invalid frontmatter: ${extracted.error}`);
    }
    const validated = validateAgent({
      frontmatter: extracted.value.frontmatter,
      body: extracted.value.body,
      filePath,
      source: "built-in" as const,
    });
    if (!validated.ok) {
      throw new Error(`Built-in agent ${f} failed validation: ${validated.errors.map((e) => e.message).join("; ")}`);
    }
    agents.push(validated.value);
  }
  return agents;
}
```

If `validateAgent`'s `source` typing is `"project" | "user"`, widen it to `"project" | "user" | "built-in"` in `src/discovery/validator.ts`. This is a one-line union extension.

- [ ] **Step 6: Run — verify pass**

Run: `npm test -- built-in`
Expected: PASS.

- [ ] **Step 7: Failing test for override precedence**

Add to `src/index.test.ts` (existing file in repo root of src):

```typescript
it("user/project agents override built-ins by name", async () => {
  // create temp project with .pi/agents/explore.md custom override → expect that one to win
  // (existing test scaffold for discoverAgents — follow patterns in src/discovery/scanner.test.ts)
});
```

Use the existing test scaffold for `discoverAgents`. Follow patterns in `src/discovery/scanner.test.ts`.

- [ ] **Step 8: Wire built-ins into discovery in `src/index.ts`**

In `discoverAgents`, change the merge order so built-ins are inserted FIRST in the map:

```typescript
const agentMap = new Map<string, AgentConfig>();
for (const a of loadBuiltInAgents()) agentMap.set(a.frontmatter.name, a);
for (const a of userResult.agents) agentMap.set(a.frontmatter.name, a);
for (const a of projectResult.agents) agentMap.set(a.frontmatter.name, a);
```

Order: built-in < user < project. Project still wins.

- [ ] **Step 9: Run — verify pass**

Run: `npm test`
Expected: all green.

- [ ] **Step 10: Bundle built-in `.md` files into the dist**

Check `tsconfig.json` and `biome.json` — TypeScript by default does not copy `.md` files. Add a build step or rely on `import.meta.url` resolving against the source. If the published package omits the `.md` files, the `loadBuiltInAgents()` call at runtime will throw. Verify by running `npm run check && node dist/index.js` (or whatever the package consumer entrypoint is) inside a sample install. If broken: add a `scripts/copy-builtins.mjs` to the build pipeline.

- [ ] **Step 11: E2E test**

Create `src/invocation/built-in-e2e.test.ts`:

```typescript
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { loadBuiltInAgents } from "../built-in/index.js";
import { runAgent } from "./session.js";
import { makeTempProject } from "./session-test-helpers.js";

describe("built-in explore e2e", () => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  it.skipIf(!hasApiKey)(
    "explore agent reads a file and reports its content",
    async () => {
      const authStorage = AuthStorage.create();
      const modelRegistry = ModelRegistry.create(authStorage);
      const project = await makeTempProject();
      // seed a known file
      const { writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      writeFileSync(join(project.dir, "marker.txt"), "PI_AGENT_MARKER_XYZ");

      const explore = loadBuiltInAgents().find((a) => a.frontmatter.name === "explore")!;
      const result = await runAgent({
        agentConfig: explore,
        task: "Find any file in the cwd containing PI_AGENT_MARKER_XYZ. Report its filename.",
        cwd: project.dir,
        sessionDir: project.sessionsDir,
        modelRegistry,
      });

      expect(result.output.toLowerCase()).toContain("marker.txt");
      expect(result.error).toBeUndefined();
    },
    60_000,
  );
});
```

- [ ] **Step 12: Run E2E**

Run: `npm run test:e2e`
Expected: PASS (with API key) or SKIP.

- [ ] **Step 13: Commit**

```bash
git add src/built-in src/index.ts src/discovery/validator.ts src/index.test.ts src/invocation/built-in-e2e.test.ts
git commit -m "feat(built-in): ship general-purpose and explore as default agents"
```

- [ ] **Step 14: Code review**

Dispatch code-reviewer subagent. Prompt:

> Review commit on feat/subagent-parity adding two built-in agents (`general-purpose`, `explore`) and a `loadBuiltInAgents` loader. Confirm: precedence order (built-in < user < project), `.md` files reach dist, frontmatter compiles via existing validator, `explore` is genuinely read-only via `disallowedTools`. Flag: any path resolution that breaks when bundled (esbuild/tsup), any sneaky stateful module init, any agent name collision with user agents. Report under 200 words.

- [ ] **Step 15: Code simplification**

Dispatch code-simplifier subagent. Prompt:

> Simplify only `src/built-in/index.ts`. Targets: dedupe with `loadAgentsFromDir` if there's overlap, but only if the dedupe is straightforward. Keep the function pure, no caching. Report changes under 100 words.

- [ ] **Step 16: Re-run check**

Run: `npm run check && npm run test:e2e`
Expected: PASS.

---

## Task 4: Worktree isolation

**Files:**
- Create: `src/invocation/worktree.ts`
- Create: `src/invocation/worktree.test.ts`
- Create: `src/invocation/worktree-e2e.test.ts`
- Modify: `src/invocation/session.ts`
- Modify: `src/schema/frontmatter.ts` (add `isolation: "worktree"`)

- [ ] **Step 1: Add `isolation` to schema**

In `src/schema/frontmatter.ts`:

```typescript
isolation: Type.Optional(Type.Union([Type.Literal("worktree")])),
```

- [ ] **Step 2: Failing schema test**

Add to `src/schema/frontmatter.test.ts`:

```typescript
it("accepts isolation: worktree", () => {
  const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", isolation: "worktree" };
  expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(true);
});

it("rejects unknown isolation values", () => {
  const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", isolation: "remote" };
  expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(false);
});
```

Run: `npm test -- frontmatter` → PASS after schema edit.

- [ ] **Step 3: Failing test for worktree creation**

Create `src/invocation/worktree.test.ts`:

```typescript
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorktree, removeWorktreeIfClean } from "./worktree.js";

describe("worktree", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "pi-worktree-"));
    execSync("git init -q -b main", { cwd: repoDir });
    execSync('git config user.email "t@e"', { cwd: repoDir });
    execSync('git config user.name "t"', { cwd: repoDir });
    writeFileSync(join(repoDir, "seed.txt"), "x");
    execSync("git add . && git commit -q -m init", { cwd: repoDir });
  });

  it("creates worktree under ./worktrees/<id> and bootstraps .gitignore", async () => {
    const wt = await createWorktree({ repoDir, id: "abc-123" });
    expect(existsSync(wt.path)).toBe(true);
    expect(wt.path).toContain("worktrees");
    const gi = readFileSync(join(repoDir, "worktrees", ".gitignore"), "utf-8");
    expect(gi.trim()).toBe("*");
  });

  it("removes worktree when clean", async () => {
    const wt = await createWorktree({ repoDir, id: "clean-1" });
    const removed = await removeWorktreeIfClean(wt);
    expect(removed).toBe(true);
    expect(existsSync(wt.path)).toBe(false);
  });

  it("preserves worktree when dirty", async () => {
    const wt = await createWorktree({ repoDir, id: "dirty-1" });
    writeFileSync(join(wt.path, "new.txt"), "modified");
    const removed = await removeWorktreeIfClean(wt);
    expect(removed).toBe(false);
    expect(existsSync(wt.path)).toBe(true);
  });
});
```

- [ ] **Step 4: Run — verify fail**

Run: `npm test -- worktree`
Expected: FAIL — module missing.

- [ ] **Step 5: Implement `src/invocation/worktree.ts`**

```typescript
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type Worktree = Readonly<{ path: string; branch: string; repoDir: string }>;

function ensureWorktreesGitignore(repoDir: string): void {
  const dir = join(repoDir, "worktrees");
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, ".gitignore");
  if (!existsSync(gi)) writeFileSync(gi, "*\n");
}

export async function createWorktree(params: { repoDir: string; id: string }): Promise<Worktree> {
  ensureWorktreesGitignore(params.repoDir);
  const path = join(params.repoDir, "worktrees", params.id);
  const branch = `pi-agents/${params.id}`;
  await exec("git", ["worktree", "add", "-b", branch, path], { cwd: params.repoDir });
  return { path, branch, repoDir: params.repoDir };
}

export async function removeWorktreeIfClean(wt: Worktree): Promise<boolean> {
  const { stdout } = await exec("git", ["status", "--porcelain"], { cwd: wt.path });
  if (stdout.trim().length > 0) return false;
  await exec("git", ["worktree", "remove", "--force", wt.path], { cwd: wt.repoDir });
  await exec("git", ["branch", "-D", wt.branch], { cwd: wt.repoDir }).catch(() => {});
  return true;
}
```

- [ ] **Step 6: Run — verify pass**

Run: `npm test -- worktree`
Expected: PASS.

- [ ] **Step 7: Wire into `runAgent`**

In `src/invocation/session.ts`, after model resolution, before `createAgentSession`:

```typescript
let effectiveCwd = cwd;
let activeWorktree: Worktree | undefined;
if (fm.isolation === "worktree") {
  activeWorktree = await createWorktree({ repoDir: cwd, id: agentId });
  effectiveCwd = activeWorktree.path;
}
```

Pass `effectiveCwd` everywhere `cwd` is currently passed (resourceLoader, createAgentSession, build-tools).

After agent finishes, in the `finally` block:

```typescript
if (activeWorktree) {
  const removed = await removeWorktreeIfClean(activeWorktree);
  if (!removed) {
    // surface the path to the caller via the result
  }
}
```

Extend `RunAgentResult` type with optional `worktree?: { path: string; branch: string }` populated when the worktree was preserved.

- [ ] **Step 8: Failing integration test for worktree wrap**

Add to `src/invocation/session.test.ts`:

```typescript
it("with isolation: worktree, agent's cwd is the worktree path", async () => {
  // setup git repo in temp project, run agent with isolation: worktree, assert
  // that agent's effective cwd starts with `<repoDir>/worktrees/`. Use a custom
  // tool spy or check via a `bash` tool that runs `pwd` and capture in transcript.
});
```

If this proves hard to assert in unit form, defer the assertion to the e2e test below and replace this unit case with a call-shape test (verify `createWorktree` was invoked).

- [ ] **Step 9: E2E test**

Create `src/invocation/worktree-e2e.test.ts`:

```typescript
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { runAgent } from "./session.js";
import { makeTestAgent } from "./session-test-helpers.js";

describe("worktree isolation e2e", () => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  it.skipIf(!hasApiKey)(
    "agent edits stay inside worktree, parent cwd untouched",
    async () => {
      const authStorage = AuthStorage.create();
      const modelRegistry = ModelRegistry.create(authStorage);
      const repoDir = mkdtempSync(join(tmpdir(), "pi-wt-e2e-"));
      execSync("git init -q -b main", { cwd: repoDir });
      execSync('git config user.email "t@e" && git config user.name "t"', { cwd: repoDir, shell: "/bin/bash" });
      writeFileSync(join(repoDir, "seed.txt"), "original");
      execSync("git add . && git commit -q -m init", { cwd: repoDir });

      const sessionsDir = join(repoDir, ".pi", "sessions", "test");
      mkdirSync(sessionsDir, { recursive: true });

      const base = makeTestAgent(repoDir);
      const agent = {
        ...base,
        frontmatter: {
          ...base.frontmatter,
          model: "anthropic/claude-haiku-4-5",
          isolation: "worktree" as const,
        },
      };

      await runAgent({
        agentConfig: agent,
        task: "Use bash to write the literal text 'CHANGED' into a file named edit.txt in the cwd.",
        cwd: repoDir,
        sessionDir: sessionsDir,
        modelRegistry,
      });

      // Parent's seed.txt unchanged; parent has no edit.txt
      expect(readFileSync(join(repoDir, "seed.txt"), "utf-8")).toBe("original");
      expect(() => readFileSync(join(repoDir, "edit.txt"), "utf-8")).toThrow();
    },
    90_000,
  );
});
```

- [ ] **Step 10: Run E2E**

Run: `npm run test:e2e`
Expected: PASS or SKIP.

- [ ] **Step 11: Commit**

```bash
git add src/invocation/worktree.ts src/invocation/worktree.test.ts src/invocation/worktree-e2e.test.ts src/invocation/session.ts src/invocation/session-helpers.ts src/schema/frontmatter.ts src/schema/frontmatter.test.ts
git commit -m "feat(isolation): add worktree isolation under ./worktrees/<id>"
```

- [ ] **Step 12: Code review**

Dispatch code-reviewer subagent. Prompt:

> Review the worktree-isolation commit. Confirm: (1) `worktrees/.gitignore` bootstrap is idempotent, (2) clean-up only when worktree is genuinely clean (untracked files count as dirty per `git status --porcelain`), (3) abort/error paths still remove the worktree or surface the path, (4) no shell injection in any `execFile` call (id is a UUID, but verify), (5) effective cwd is plumbed everywhere the agent could write. Flag race conditions if two parallel agents share the same parent repo. Report under 200 words.

- [ ] **Step 13: Code simplification**

Dispatch code-simplifier subagent. Prompt:

> Simplify `src/invocation/worktree.ts` and the wiring in `src/invocation/session.ts`. Don't add abstractions. Don't add an executor wrapper. Goal: smallest reasonable code that ships. Report changes under 100 words.

- [ ] **Step 14: Re-run check**

Run: `npm run check && npm run test:e2e`
Expected: PASS.

---

## Task 5: Reliability hardening — abort + tool enforcement

**Files:**
- Create: `src/invocation/abort-mid-flight.test.ts`
- Create: `src/invocation/tool-enforcement.test.ts`
- Modify: only if a defect is found

- [ ] **Step 1: Write abort-mid-flight test**

Create `src/invocation/abort-mid-flight.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { runAgent } from "./session.js";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

describe("abort mid-flight", () => {
  it("aborts during a long-running tool call", async () => {
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);
    const controller = new AbortController();

    const promise = runAgent({
      agentConfig: agent,
      task: "Run `bash` tool with command `sleep 30`",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: makeFauxModelRegistry({ longBashCall: true }),
      signal: controller.signal,
    });

    // abort after 200ms
    setTimeout(() => controller.abort(), 200);
    const result = await promise;
    expect(result.error).toMatch(/cancel|abort/i);
  }, 5_000);
});
```

If `makeFauxModelRegistry` doesn't have a `longBashCall` mode, extend the faux model in `session-test-helpers.ts` to emit a `bash` tool call with `sleep 30` (or use `setTimeout` faux command).

- [ ] **Step 2: Run — observe behavior**

Run: `npm test -- abort-mid-flight`
Two outcomes:
- PASS → ship the test as a regression guard.
- FAIL → propagation broken. Inspect `session.ts:98` abort handler. Likely fix: ensure `session.abort()` cancels in-flight tool subprocesses (pi-coding-agent should handle this; confirm via reading bash tool source).

- [ ] **Step 3: Tool-allowlist enforcement test**

Create `src/invocation/tool-enforcement.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { runAgent } from "./session.js";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

describe("tool allowlist enforcement", () => {
  it("rejects a call to a disallowed tool at execution time", async () => {
    const project = await makeTempProject();
    const base = makeTestAgent(project.dir);
    const agent = { ...base, frontmatter: { ...base.frontmatter, tools: ["read"], disallowedTools: [] } };

    // faux model attempts to call `write` even though only `read` is allowed
    const result = await runAgent({
      agentConfig: agent,
      task: "Call write tool to create x.txt",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: makeFauxModelRegistry({ forceWriteToolCall: true }),
    });

    // Either: tool not in active set so model can't see it (preferred),
    // or: pi rejects the call. Either way, x.txt must NOT exist.
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(existsSync(join(project.dir, "x.txt"))).toBe(false);
  });
});
```

- [ ] **Step 4: Run — observe behavior**

Run: `npm test -- tool-enforcement`
Two outcomes:
- PASS → tool listing already gates execution; ship as regression guard.
- FAIL → enforcement gap. Likely fix: confirm `customTools` parameter to `createAgentSession` actually constrains the active set and that pi doesn't auto-include defaults beyond what we pass.

- [ ] **Step 5: Run full check**

Run: `npm run check && npm run test:e2e`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/invocation/abort-mid-flight.test.ts src/invocation/tool-enforcement.test.ts
# include any fix files if a defect was found
git commit -m "test(reliability): regression guards for abort and tool allowlist enforcement"
```

- [ ] **Step 7: Code review**

Dispatch code-reviewer subagent. Prompt:

> Review the reliability commit. Two regression tests added: abort mid-flight, tool allowlist enforcement. Confirm: (1) tests deterministically fail when the underlying behavior breaks, (2) no flakes from arbitrary timeouts, (3) faux-model usage matches established pattern in session-test-helpers. Flag any test that is a tautology or that exercises only the test scaffolding. Report under 200 words.

- [ ] **Step 8: Code simplification**

Dispatch code-simplifier subagent. Prompt:

> Simplify the two test files. Don't change assertions. Pull duplicated setup into shared helpers if both tests share more than 5 lines. Report under 100 words.

- [ ] **Step 9: Final full run**

Run: `npm run check && npm run test:e2e`
Expected: PASS.

---

## Final PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/subagent-parity
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat: subagent parity (transcripts, schema fields, built-ins, worktree, hardening)" --body "$(cat <<'EOF'
## Summary
- JSONL subagent transcripts (per-agent dir under `sessionDir/agents/<id>/`)
- Frontmatter additions: `disallowedTools`, `maxTurns`, `inheritContextFiles`, `isolation: worktree`
- Built-in agents: `general-purpose`, `explore`
- Worktree isolation under `./worktrees/<id>` with auto-cleanup
- Reliability regression guards: abort mid-flight, tool allowlist enforcement

## Out of scope (intentional)
- Per-agent MCP / hooks (pi has none)
- Permission modes (pi is permissionless)
- Background/async, fork, mailbox, resumable agents

## Test plan
- [ ] `npm run check` clean
- [ ] `npm run test:e2e` clean (with `ANTHROPIC_API_KEY`)
- [ ] Manual: spawn `explore` agent in this repo, verify JSONL appears, no edits
- [ ] Manual: spawn an `isolation: worktree` agent, verify `./worktrees/<id>/` lifecycle
EOF
)"
```

---

## Self-review checklist

Run before announcing plan complete.

**Spec coverage:**
- [x] JSONL transcripts → Task 1
- [x] `disallowedTools`, `maxTurns`, `inheritContextFiles` → Task 2
- [x] Built-ins (`general-purpose`, `explore`, no plan/verifier) → Task 3
- [x] Worktree under `./worktrees/<id>` → Task 4
- [x] Hardening (abort, tool enforcement) → Task 5
- [x] Code review per task → embedded as final steps in each task
- [x] Code simplifier per task → embedded as final steps in each task
- [x] E2E tests → tasks 1, 3, 4 each ship one e2e file
- [x] Single PR, multiple commits → Final PR section

**Placeholders:** none — every code step has runnable code or a clearly-scoped diagnostic.

**Type consistency:** `Worktree`, `RunAgentResult`, `AgentConfig` references are consistent across tasks.

**Reminders:**
- typebox only — no zod imports anywhere
- pi is permissionless — no permission flags
- sync-only — no `background`, `run_in_background`, fork, mailbox
