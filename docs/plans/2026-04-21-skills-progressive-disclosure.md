# Skills Progressive Disclosure + Frontmatter Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip pi-agents to a minimal 4-required + 3-optional frontmatter, remove the domain / knowledge / role / reports / conversation-log subsystems in full, and delegate skill loading to pi's native `DefaultResourceLoader` (progressive disclosure per the agentskills.io spec). Propagate through pi-superpowers as the consumer update.

**Architecture:** pi-agents' `runAgent` stops owning skill loading, domain ACLs, per-agent knowledge files, and a conversation-log transcript. It hands pi a `DefaultResourceLoader` with `additionalSkillPaths` + `noSkills: true` when the agent declares `skills:`, or `noSkills: false` when absent. Pi injects the `<skills>` XML manifest after pi-agents' assembled prompt; the agent's own `read` tool fetches bodies on demand. ~1800 LOC (including tests) are deleted along the way.

**Tech Stack:** TypeScript (NodeNext, verbatimModuleSyntax), `@sinclair/typebox` schemas validated via `Value.Check`, vitest tests co-located `foo.ts` → `foo.test.ts`, biome for lint + format, `@mariozechner/pi-coding-agent` as the peer.

**Spec:** [`docs/specs/2026-04-21-skills-progressive-disclosure-design.md`](../specs/2026-04-21-skills-progressive-disclosure-design.md)

**Repo convention:** conventional commits, no `Co-Authored-By` trailers, `npm run check` must pass before commit.

**Coordination:** pi-agents lands first on its `main` (squash via admin bypass on branch protection, as set up earlier). Then pi-superpowers bumps its lockfile and lands the consumer changes. Both repos stay on `0.1.0` — pre-release.

---

## Phase 1 — Foundation: new schema + new validator

### Task 1: Replace `AgentFrontmatterSchema` with the minimal shape and add `validateFrontmatter`

Write the new schema first, write a co-located validator function, rewrite the test fixtures, see the old tests fail (because the shape changed), then fix test fixtures. This is the only "TDD-ish" task because the rest of the work is deletion.

**Files:**
- Modify: `src/schema/frontmatter.ts`
- Modify: `src/schema/frontmatter.test.ts`

- [ ] **Step 1: Replace `src/schema/frontmatter.ts` content**

Write this exactly:

```ts
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

// Pi's active default tool set.
// Source: @mariozechner/pi-coding-agent dist/core/sdk.js:139,
//         dist/core/system-prompt.js:48, dist/core/agent-session.js:1887.
export const PI_DEFAULT_TOOLS: readonly string[] = ["read", "bash", "edit", "write"];

export const AgentFrontmatterSchema = Type.Object({
  // Identity — required
  name: Type.String({ minLength: 1 }),
  description: Type.String({ minLength: 1 }),
  color: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  icon: Type.String({ minLength: 1 }),

  // Model — optional; absent / "inherit" → parent session's model; else "provider/name" pins.
  model: Type.Optional(
    Type.Union([Type.Literal("inherit"), Type.String({ pattern: "^.+/.+$" })]),
  ),

  // Tools — optional; absent → pi's active default.
  tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),

  // Skills — optional; absent → inherit parent's default discovery;
  //                    present (even empty) → use ONLY these paths.
  skills: Type.Optional(Type.Array(Type.String({ pattern: "^/" }), { minItems: 0 })),
});

export type AgentFrontmatter = Readonly<Static<typeof AgentFrontmatterSchema>>;

export function validateFrontmatter(fm: AgentFrontmatter): string[] {
  const errors: string[] = [];
  const effectiveTools = fm.tools ?? PI_DEFAULT_TOOLS;
  const hasSkills = fm.skills !== undefined && fm.skills.length > 0;
  if (hasSkills && !effectiveTools.includes("read")) {
    errors.push(
      `Agent '${fm.name}' declares skills but has no 'read' tool. ` +
      `pi requires the 'read' tool for skill body loading (progressive disclosure). ` +
      `Add 'read' to tools or remove skills.`,
    );
  }
  return errors;
}
```

- [ ] **Step 2: Replace `src/schema/frontmatter.test.ts` content**

Write this exactly:

```ts
import { describe, expect, it } from "vitest";
import { AgentFrontmatterSchema, PI_DEFAULT_TOOLS, validateFrontmatter } from "./frontmatter.js";
import { safeParse } from "./parse.js";

const validMinimal = {
  name: "scout",
  description: "Fast codebase recon.",
  color: "#36f9f6",
  icon: "🔍",
};

describe("AgentFrontmatterSchema", () => {
  it("accepts minimal required fields", () => {
    const result = safeParse(AgentFrontmatterSchema, validMinimal);
    expect(result.success).toBe(true);
  });

  it("accepts model: inherit", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, model: "inherit" });
    expect(result.success).toBe(true);
  });

  it("accepts model as provider/name", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, model: "anthropic/claude-sonnet-4-6" });
    expect(result.success).toBe(true);
  });

  it("rejects model with bad format", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, model: "bogus" });
    expect(result.success).toBe(false);
  });

  it("accepts tools when declared", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, tools: ["read", "bash"] });
    expect(result.success).toBe(true);
  });

  it("accepts tools absent (inherits default)", () => {
    const result = safeParse(AgentFrontmatterSchema, validMinimal);
    expect(result.success).toBe(true);
  });

  it("rejects tools: [] (minItems 1 when field declared)", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, tools: [] });
    expect(result.success).toBe(false);
  });

  it("accepts skills absent", () => {
    const result = safeParse(AgentFrontmatterSchema, validMinimal);
    expect(result.success).toBe(true);
  });

  it("accepts skills: [] (explicit opt-out)", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, skills: [] });
    expect(result.success).toBe(true);
  });

  it("accepts skills with absolute paths", () => {
    const result = safeParse(AgentFrontmatterSchema, {
      ...validMinimal,
      skills: ["/abs/path/to/skill/SKILL.md"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects skills with relative paths", () => {
    const result = safeParse(AgentFrontmatterSchema, {
      ...validMinimal,
      skills: ["./skill.md"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects removed 'domain' key", () => {
    const result = safeParse(AgentFrontmatterSchema, {
      ...validMinimal,
      domain: [{ path: ".", read: true, write: false, delete: false }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects removed 'knowledge' key", () => {
    const result = safeParse(AgentFrontmatterSchema, {
      ...validMinimal,
      knowledge: { project: {}, general: {} },
    });
    expect(result.success).toBe(false);
  });

  it("rejects removed 'role' key", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, role: "worker" });
    expect(result.success).toBe(false);
  });

  it("rejects removed 'reports' key", () => {
    const result = safeParse(AgentFrontmatterSchema, {
      ...validMinimal,
      reports: { path: "/foo", updatable: true },
    });
    expect(result.success).toBe(false);
  });

  it("rejects removed 'conversation' key", () => {
    const result = safeParse(AgentFrontmatterSchema, {
      ...validMinimal,
      conversation: { path: "/foo/{{SESSION_ID}}.jsonl" },
    });
    expect(result.success).toBe(false);
  });
});

describe("validateFrontmatter", () => {
  it("returns [] when skills absent", () => {
    expect(validateFrontmatter(validMinimal as never)).toEqual([]);
  });

  it("returns [] when skills declared with default tools (default includes read)", () => {
    expect(
      validateFrontmatter({
        ...validMinimal,
        skills: ["/abs/skill/SKILL.md"],
      } as never),
    ).toEqual([]);
  });

  it("returns error when skills declared and tools omits read", () => {
    const errors = validateFrontmatter({
      ...validMinimal,
      tools: ["bash"],
      skills: ["/abs/skill/SKILL.md"],
    } as never);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("declares skills but has no 'read' tool");
  });

  it("returns [] for empty skills list (opt-out)", () => {
    expect(
      validateFrontmatter({
        ...validMinimal,
        tools: ["bash"],
        skills: [],
      } as never),
    ).toEqual([]);
  });

  it("exposes pi-default tool list for consumers", () => {
    expect(PI_DEFAULT_TOOLS).toEqual(["read", "bash", "edit", "write"]);
  });
});
```

- [ ] **Step 3: Run schema tests — many existing callers will fail to compile**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: errors from files that reference `fm.domain`, `fm.knowledge`, `fm.role`, `fm.reports`, `fm.conversation`. That's the point — subsequent tasks fix those sites. DO NOT fix them here.

Run: `npx vitest run src/schema/frontmatter.test.ts`

Expected: PASS (new tests run against new schema).

- [ ] **Step 4: Commit**

```bash
git add src/schema/frontmatter.ts src/schema/frontmatter.test.ts
git commit -m "refactor(schema)!: minimal frontmatter — drop domain/knowledge/role/reports/conversation"
```

The repo is intentionally broken at this commit. Phase 2 and beyond restore it.

---

## Phase 2 — Session reconstruction

### Task 2: Add `resolveModel` helper with inheritance + tests

**Files:**
- Create: `src/invocation/resolve-model.ts`
- Create: `src/invocation/resolve-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/invocation/resolve-model.test.ts`:

```ts
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { resolveModel } from "./resolve-model.js";

const fakeModel = { provider: "anthropic", id: "claude-sonnet-4-6" } as unknown as Model<Api>;

const registry = {
  find: (provider: string, id: string) =>
    provider === "anthropic" && id === "claude-sonnet-4-6" ? fakeModel : undefined,
} as unknown as ModelRegistry;

describe("resolveModel", () => {
  it("returns inherited model when fm.model is undefined", () => {
    const result = resolveModel({ fmModel: undefined, inherited: fakeModel, registry });
    expect(result).toBe(fakeModel);
  });

  it("returns inherited model when fm.model is 'inherit'", () => {
    const result = resolveModel({ fmModel: "inherit", inherited: fakeModel, registry });
    expect(result).toBe(fakeModel);
  });

  it("resolves explicit provider/name via registry", () => {
    const result = resolveModel({ fmModel: "anthropic/claude-sonnet-4-6", inherited: undefined, registry });
    expect(result).toBe(fakeModel);
  });

  it("throws with a clear message when inherit requested but no parent model", () => {
    expect(() => resolveModel({ fmModel: "inherit", inherited: undefined, registry })).toThrowError(
      /no model is active in the parent session/,
    );
    expect(() => resolveModel({ fmModel: undefined, inherited: undefined, registry })).toThrowError(
      /no model is active in the parent session/,
    );
  });

  it("throws when explicit model is not in registry", () => {
    expect(() => resolveModel({ fmModel: "unknown/xyz", inherited: undefined, registry })).toThrowError(
      /Model not found: unknown\/xyz/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/invocation/resolve-model.test.ts`
Expected: FAIL — file `resolve-model.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/invocation/resolve-model.ts`:

```ts
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { parseModelId } from "../common/model.js";

export function resolveModel(params: {
  readonly fmModel: string | undefined;
  readonly inherited: Model<Api> | undefined;
  readonly registry: ModelRegistry;
}): Model<Api> {
  const { fmModel, inherited, registry } = params;

  // Inherit path: undefined or "inherit" → parent session's model.
  if (fmModel === undefined || fmModel === "inherit") {
    if (!inherited) {
      throw new Error(
        `agent declares 'model: inherit' (or omits model) but no model is active in the parent session. ` +
        `Select a model with /model or start pi with --model provider/name.`,
      );
    }
    return inherited;
  }

  // Pinned path: explicit "provider/name".
  const { provider, modelId } = parseModelId(fmModel);
  const model = registry.find(provider, modelId);
  if (!model) {
    throw new Error(`Model not found: ${fmModel}`);
  }
  return model;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/invocation/resolve-model.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/invocation/resolve-model.ts src/invocation/resolve-model.test.ts
git commit -m "feat(invocation): add resolveModel with parent-session inheritance"
```

---

### Task 3: Rewrite `src/invocation/session.ts` to use `DefaultResourceLoader` and drop log-writing

This is the surgical centerpiece. The current `runAgent` does skill loading, domain building, log writing, session dumping. After this task it does only: assemble prompt → build resourceLoader → create session → stream → return output.

**Files:**
- Modify: `src/invocation/session.ts`
- Modify: `src/invocation/session-helpers.ts`
- Modify: `src/invocation/session-test-helpers.ts`
- Modify: `src/invocation/session.test.ts`

- [ ] **Step 1: Update `src/invocation/session-helpers.ts` — drop `conversationLogPath` from `RunAgentParams`**

Read the current file first:

```bash
cat src/invocation/session-helpers.ts
```

Remove the `conversationLogPath: string` field from `RunAgentParams` and any helper that references it. Drop the `caller` field too — it was only written into the conversation log. Keep `extractAssistantOutput` and any other non-log helpers intact.

Your `RunAgentParams` should look roughly like this (exact shape depends on what the file has — match all OTHER fields; just delete `conversationLogPath` and `caller`):

```ts
export type RunAgentParams = Readonly<{
  agentConfig: AgentConfig;
  task: string;
  cwd: string;
  sessionDir: string;
  modelRegistry: ModelRegistry;
  modelOverride?: Model<Api>;
  inheritedModel?: Model<Api>;     // NEW — parent session's current model for inheritance
  signal?: AbortSignal;
  onUpdate?: (metrics: AgentMetrics) => void;
  extraVariables?: Readonly<Record<string, string>>;
  customTools?: ReadonlyArray<unknown>;
  sharedContext?: ReadonlyArray<Readonly<{ path: string; content: string }>>;
}>;
```

- [ ] **Step 2: Update `src/invocation/session-test-helpers.ts` — drop log params from fixtures**

Remove any `conversationLogPath` and `caller` fields from helper factories that build `RunAgentParams`. Add `inheritedModel` if tests need to exercise inheritance — default `undefined`.

- [ ] **Step 3: Rewrite `src/invocation/session.ts`**

Replace the file with:

```ts
import type { Api, Model } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { discoverContextFiles } from "../common/context-files.js";
import type { AssemblyContext } from "../prompt/assembly.js";
import { assembleSystemPrompt } from "../prompt/assembly.js";
import { buildAgentTools } from "./build-tools.js";
import { createMetricsTracker } from "./metrics.js";
import { resolveModel } from "./resolve-model.js";
import type { RunAgentParams, RunAgentResult } from "./session-helpers.js";
import { extractAssistantOutput } from "./session-helpers.js";

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const {
    agentConfig,
    task,
    cwd,
    sessionDir,
    modelRegistry,
    modelOverride,
    inheritedModel,
    signal,
    onUpdate,
    extraVariables,
    customTools,
    sharedContext,
  } = params;
  const fm = agentConfig.frontmatter;

  // Auto-discover shared context files if not provided
  const sharedContextContents = sharedContext ?? (await discoverContextFiles({ cwd }));

  // Assemble system prompt (pure). Pi injects skill XML after this.
  const assemblyCtx: AssemblyContext = {
    agentConfig,
    sessionDir,
    ...(extraVariables ? { extraVariables } : {}),
    ...(sharedContextContents.length > 0 ? { sharedContextContents } : {}),
  };
  const systemPrompt = assembleSystemPrompt(assemblyCtx);

  // Resolve model: explicit override > frontmatter (or inherit) > error.
  let model: Model<Api>;
  try {
    model = modelOverride ?? resolveModel({ fmModel: fm.model, inherited: inheritedModel, registry: modelRegistry });
  } catch (err) {
    return { output: "", metrics: createMetricsTracker().snapshot(), error: String(err) };
  }

  // Build the tools the agent will have access to. `fm.tools` optional → pi's active default.
  const { builtinTools, customTools: builtCustomTools } = buildAgentTools({
    tools: fm.tools,
    cwd,
  });
  const allCustomTools = [...builtinTools, ...builtCustomTools, ...(customTools ?? [])];
  const activeToolNames = allCustomTools.map((t) => t.name);

  // Skill loader config. Absent → inherit parent defaults. Present (even []) → override.
  const skillLoaderOpts = fm.skills !== undefined
    ? { additionalSkillPaths: [...fm.skills], noSkills: true }
    : { noSkills: false as const };

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    systemPrompt,
    ...skillLoaderOpts,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });

  const { session } = await createAgentSession({
    cwd,
    model,
    tools: activeToolNames,
    customTools: allCustomTools,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
    modelRegistry,
    resourceLoader,
  });

  // Track metrics
  const tracker = createMetricsTracker();
  session.subscribe((event) => {
    tracker.handle(event);
    onUpdate?.(tracker.snapshot());
  });

  // Run the agent
  if (signal?.aborted) {
    session.dispose();
    return { output: "", metrics: tracker.snapshot(), error: "Agent execution cancelled" };
  }

  const abortHandler = () => {
    session.abort().catch(() => {});
  };
  signal?.addEventListener("abort", abortHandler);

  try {
    await session.prompt(task);
  } catch (err) {
    const error = signal?.aborted ? "Agent execution cancelled" : String(err);
    return { output: "", metrics: tracker.snapshot(), error };
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }

  let output = "";
  try {
    output = extractAssistantOutput(session.messages);
  } finally {
    session.dispose();
  }

  return { output, metrics: tracker.snapshot() };
}
```

- [ ] **Step 4: Update `src/invocation/session.test.ts`**

Remove all references to `conversationLogPath`, `caller`, knowledge-log-writing assertions, and `dumpAgentSession`. Add assertions for:

```ts
// Inside the existing test suite, add:

it("configures DefaultResourceLoader with additionalSkillPaths when fm.skills declared", async () => {
  // Use a spy / fake on DefaultResourceLoader construction. The exact shape depends on how
  // existing tests mock createAgentSession. If they use vi.spyOn on the module, replicate;
  // if they use a fake session factory injected via params, add one here.
  // The assertion is: when fm.skills = ["/abs/a/SKILL.md"], the resourceLoader receives
  // additionalSkillPaths: ["/abs/a/SKILL.md"] and noSkills: true.
});

it("configures DefaultResourceLoader with noSkills: false when fm.skills absent", async () => {
  // fm.skills === undefined → noSkills: false (inherit parent defaults).
});

it("uses inherited model when fm.model === 'inherit'", async () => {
  // Call runAgent with inheritedModel set; assert the model reaches createAgentSession.
});

it("returns error when fm.model is 'inherit' and no inherited model", async () => {
  const result = await runAgent({ /* fm.model: undefined, inheritedModel: undefined */ });
  expect(result.error).toContain("no model is active in the parent session");
});
```

Replace any fixture that sets `fm.model = "anthropic/claude-haiku-3"` with either that same literal OR `fm.model = undefined` + `inheritedModel: fakeModel` to exercise the inherit path. Delete tests asserting log-file writes or `dumpAgentSession` invocations.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/invocation/session.test.ts`
Expected: PASS. If anything fails due to still-existing imports (e.g., `buildAgentTools` signature still takes `domain`), that's addressed in Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/invocation/session.ts src/invocation/session-helpers.ts \
  src/invocation/session-test-helpers.ts src/invocation/session.test.ts
git commit -m "refactor(invocation)!: use DefaultResourceLoader + resolveModel; drop log writing"
```

---

### Task 4: Simplify `src/invocation/build-tools.ts` — drop domain + knowledge + log params

**Files:**
- Modify: `src/invocation/build-tools.ts`

- [ ] **Step 1: Read current file and identify dead params**

```bash
cat src/invocation/build-tools.ts
```

Current `buildAgentTools` takes `tools`, `cwd`, `domain`, `conversationLogPath`, `agentName`, `knowledgeFiles`, `knowledgeEntries`. After this task it takes only `tools` (optional) and `cwd`.

- [ ] **Step 2: Rewrite `src/invocation/build-tools.ts`**

The file's job: given the list of tool names the agent is allowed to use, return pi's built-in tool definitions for those names. No domain wrapping, no knowledge/conversation/submit custom tools (those are deleted).

```ts
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { PI_DEFAULT_TOOLS } from "../schema/frontmatter.js";

// Map from tool name → factory. Matches pi's `allToolNames` set
// (dist/core/tools/index.js:17 — read, bash, edit, write, grep, find, ls).
const BUILTIN_FACTORIES: Readonly<Record<string, () => ToolDefinition>> = {
  read: createReadToolDefinition,
  bash: createBashToolDefinition,
  edit: createEditToolDefinition,
  write: createWriteToolDefinition,
  grep: createGrepToolDefinition,
  find: createFindToolDefinition,
  ls: createLsToolDefinition,
};

export function buildAgentTools(params: {
  readonly tools: readonly string[] | undefined;
  readonly cwd: string;
}): Readonly<{ builtinTools: ReadonlyArray<ToolDefinition>; customTools: ReadonlyArray<ToolDefinition> }> {
  const _cwd = params.cwd;      // currently unused; some factories may accept cwd in future
  const effective = params.tools ?? PI_DEFAULT_TOOLS;
  const builtinTools = effective
    .map((name) => BUILTIN_FACTORIES[name])
    .filter((factory): factory is () => ToolDefinition => factory !== undefined)
    .map((factory) => factory());
  return { builtinTools, customTools: [] };
}
```

NOTE ON FACTORY NAMES: pi exports `createReadToolDefinition` etc. per the pi-agents CHANGELOG entry ("tool factories switched from `createReadTool` etc. to `createReadToolDefinition`"). Verify the exact export names in `@mariozechner/pi-coding-agent` before committing. If pi doesn't export `createGrepToolDefinition`/`createFindToolDefinition`/`createLsToolDefinition`, drop them from `BUILTIN_FACTORIES` — the agent will still get them if pi's `allToolNames` mechanism handles them via the `tools: activeToolNames` allowlist. If pi expects us to pass built-ins via `customTools`, keep the factories; otherwise customTools stays `[]` and the `tools: activeToolNames` list does the selection.

- [ ] **Step 2a: Verify factory exports before committing**

```bash
grep -n "createReadToolDefinition\|createBashToolDefinition\|createGrepToolDefinition\|createFindToolDefinition\|createLsToolDefinition" node_modules/@mariozechner/pi-coding-agent/dist/index.d.ts
```

Adjust the `BUILTIN_FACTORIES` map to match reality. If any factory is missing, remove its entry and also remove that tool name from `PI_DEFAULT_TOOLS` only if the tool itself is unavailable. (pi's `allToolNames` may differ from what's exported for external construction — this is why verification is required.)

- [ ] **Step 3: Update or delete `src/invocation/build-tools.test.ts` if it exists**

```bash
ls src/invocation/build-tools.test.ts 2>&1
```

If it exists, rewrite it to the minimal behavior: given `tools: undefined` → default 4; given `tools: ["read", "grep"]` → 2; given `tools: ["unknown"]` → 0 matched. If it doesn't exist, skip.

- [ ] **Step 4: Run typecheck + tests**

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run src/invocation/ 2>&1 | tail -20
```

Expected: typecheck errors remain (for files still referencing deleted things like `domain/` — that's fine, later tasks). Invocation tests should pass.

- [ ] **Step 5: Commit**

```bash
git add src/invocation/build-tools.ts src/invocation/build-tools.test.ts 2>/dev/null || \
git add src/invocation/build-tools.ts
git commit -m "refactor(invocation): simplify buildAgentTools — drop domain/knowledge/log params"
```

---

## Phase 3 — createAgentTool simplification

### Task 5: Drop `conversationLogPath` from `createAgentTool` + propagate parent-session model

**Files:**
- Modify: `src/tool/agent-tool.ts`
- Modify: `src/tool/agent-tool.test.ts`
- Modify: `src/tool/agent-tool-execute.ts`
- Modify: `src/tool/agent-tool-execute.test.ts`

- [ ] **Step 1: Read `src/tool/agent-tool.ts` to confirm current shape**

```bash
cat src/tool/agent-tool.ts
```

- [ ] **Step 2: Rewrite `src/tool/agent-tool.ts`**

Remove `conversationLogPath` from the factory config and from every call to `runAgent`. Add a mechanism to pick up the parent session's current model. pi's `ExtensionContext` provides this — in pi's SDK the tool's execute callback receives `ctx` which exposes the calling session's model.

```ts
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ExtensionContext, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { flatten } from "../common/strings.js";
import type { AgentConfig } from "../discovery/validator.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { runAgent } from "../invocation/session.js";
import { executeAgentTool } from "./agent-tool-execute.js";
import { buildPromptGuidelines } from "./prompt-guidelines.js";
import { renderAgentCall, renderAgentResult } from "./render.js";
import type { AgentResultDetails } from "./render-types.js";

export function createAgentTool(params: {
  readonly agents: ReadonlyArray<AgentConfig>;
  readonly modelRegistry: ModelRegistry;
  readonly cwd: string;
  readonly sessionDir: string;
}) {
  const { agents, modelRegistry, cwd, sessionDir } = params;

  function findAgentConfig(name: string) {
    return agents.find((a) => a.frontmatter.name === name);
  }

  function findAgentDisplay(name: string) {
    const a = findAgentConfig(name);
    if (!a) return undefined;
    const { icon, name: n, color, model } = a.frontmatter;
    return { icon, name: n, color, model: model ?? "inherit" };
  }

  function makeRunAgent(agentConfig: AgentConfig, inheritedModel: Model<Api> | undefined, signal?: AbortSignal) {
    return async (p: { readonly task: string; readonly onMetrics?: (metrics: AgentMetrics) => void }) =>
      runAgent({
        agentConfig,
        task: p.task,
        cwd,
        sessionDir,
        modelRegistry,
        ...(inheritedModel ? { inheritedModel } : {}),
        ...(signal ? { signal } : {}),
        ...(p.onMetrics ? { onUpdate: p.onMetrics } : {}),
      });
  }

  return defineTool({
    name: "agent",
    label: "Agent",
    description: flatten(`
      Invoke a specialized agent to perform a task.
      Modes: single (agent+task), parallel (tasks array), chain (sequential with {previous}).
    `),
    promptSnippet: "Delegate tasks to specialized agents (single, parallel, or chain mode)",
    promptGuidelines: buildPromptGuidelines(agents),
    parameters: Type.Object({
      agent: Type.Optional(Type.String({ description: "Agent name (single mode)" })),
      task: Type.Optional(Type.String({ description: "Task to perform (single mode)" })),
      tasks: Type.Optional(
        Type.Array(Type.Object({ agent: Type.String(), task: Type.String() }), { description: "Parallel mode" }),
      ),
      chain: Type.Optional(
        Type.Array(Type.Object({ agent: Type.String(), task: Type.String() }), { description: "Chain mode" }),
      ),
    }),

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.execute (5 positional params)
    async execute(_toolCallId, toolParams, signal, onUpdate, ctx: ExtensionContext) {
      const emitProgress = (details: AgentResultDetails) => {
        onUpdate?.({ content: [{ type: "text" as const, text: "" }], details });
      };
      // Pull parent session's current model from the extension context, if available.
      // pi exposes this as ctx.model (may be undefined if no model selected yet).
      const inheritedModel = (ctx as { model?: Model<Api> }).model;
      return executeAgentTool({
        toolParams: toolParams as Record<string, unknown>,
        agents,
        findAgent: findAgentConfig,
        makeRunAgent: (cfg, s) => makeRunAgent(cfg, inheritedModel, s),
        emitProgress,
        signal,
      });
    },

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.renderCall (3 positional params)
    renderCall(args, theme, _context) {
      return renderAgentCall({ args: args as Record<string, unknown>, theme, findAgent: findAgentDisplay });
    },

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.renderResult (4 positional params)
    renderResult(result, _options, theme, _context) {
      return renderAgentResult({ result, theme, findAgent: findAgentDisplay });
    },
  });
}
```

NOTE ON `ctx.model`: verify by grepping pi's `ExtensionContext` type:
```bash
grep -n "model\b" node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts 2>&1 | head -10
```
If pi doesn't expose the current model on `ExtensionContext` directly, use `modelRegistry` with whatever "active model id" signal pi surfaces. If neither is available, fall back to: `inheritedModel` arrives from the caller of `createAgentTool` via a new optional `getInheritedModel?: () => Model<Api> | undefined` param, and the host (pi-superpowers) supplies it. Document the chosen path in the commit.

- [ ] **Step 3: Update `src/tool/agent-tool-execute.ts`**

If `executeAgentTool` currently calls `makeRunAgent(cfg)` with one argument, update it to call `makeRunAgent(cfg, signal)` (the `inheritedModel` is already bound into `makeRunAgent` in step 2).

```bash
grep -n "makeRunAgent" src/tool/agent-tool-execute.ts
```

Adjust call sites accordingly.

- [ ] **Step 4: Update `src/tool/agent-tool.test.ts` and `src/tool/agent-tool-execute.test.ts`**

Remove any fixture that passes `conversationLogPath` to `createAgentTool`. Add a test asserting that when `ctx.model` (or whatever inheritance source was chosen) is provided, the dispatched runAgent receives it as `inheritedModel`.

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/tool/ 2>&1 | tail -15
```

- [ ] **Step 6: Commit**

```bash
git add src/tool/agent-tool.ts src/tool/agent-tool.test.ts \
  src/tool/agent-tool-execute.ts src/tool/agent-tool-execute.test.ts
git commit -m "refactor(tool)!: drop conversationLogPath; propagate parent model for inheritance"
```

---

## Phase 4 — Prompt assembly simplification

### Task 6: Simplify `src/prompt/assembly.ts` — drop skills/knowledge/reports rendering

**Files:**
- Modify: `src/prompt/assembly.ts`
- Modify: `src/prompt/assembly.test.ts`
- Modify: `src/prompt/assembly-context.test.ts`

- [ ] **Step 1: Rewrite `src/prompt/assembly.ts`**

```ts
import type { AgentConfig } from "../discovery/validator.js";
import { resolveVariables } from "./variables.js";

export type AssemblyContext = Readonly<{
  agentConfig: AgentConfig;
  sessionDir: string;
  extraVariables?: Readonly<Record<string, string>>;
  sharedContextContents?: ReadonlyArray<Readonly<{ path: string; content: string }>>;
}>;

function section(title: string, body: string): string {
  if (!body) return "";
  return `\n\n---\n\n## ${title}\n${body}`;
}

function renderSharedContextSection(files: AssemblyContext["sharedContextContents"]): string {
  if (!files || files.length === 0) return "";
  const entries = files.map((f) => `\n### ${f.path}\n\n${f.content}\n`).join("");
  return section("Shared Context", entries);
}

export function assembleSystemPrompt(ctx: AssemblyContext): string {
  const { agentConfig, sessionDir, extraVariables, sharedContextContents } = ctx;

  const variables: Record<string, string> = {
    SESSION_DIR: sessionDir,
    ...extraVariables,
  };

  const body = resolveVariables(agentConfig.systemPrompt, variables);
  const sharedContext = renderSharedContextSection(sharedContextContents);

  return `${body}${sharedContext}`;
}
```

- [ ] **Step 2: Rewrite `src/prompt/assembly.test.ts`**

Remove all test cases that assert `## Skills`, `## Knowledge Files`, `## Reports`. Keep cases that assert:
- Body substitution of `SESSION_DIR` and custom `extraVariables` via `resolveVariables`.
- Shared context rendering when files provided.
- Empty string returned cleanly when nothing to render.

Example shape:

```ts
import { describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "./assembly.js";

const baseConfig = {
  frontmatter: {
    name: "scout", description: "test", color: "#ff0000", icon: "🔍",
  },
  systemPrompt: "Hello {{SESSION_DIR}}.",
  filePath: "/abs/scout.md",
  source: "project" as const,
};

const ctx = {
  agentConfig: baseConfig,
  sessionDir: "/tmp/session",
};

describe("assembleSystemPrompt", () => {
  it("substitutes SESSION_DIR in the body", () => {
    const out = assembleSystemPrompt(ctx);
    expect(out).toContain("Hello /tmp/session.");
  });

  it("renders shared context section when files provided", () => {
    const out = assembleSystemPrompt({
      ...ctx,
      sharedContextContents: [{ path: "/abs/CONTEXT.md", content: "shared" }],
    });
    expect(out).toContain("## Shared Context");
    expect(out).toContain("### /abs/CONTEXT.md");
    expect(out).toContain("shared");
  });

  it("omits shared context section when absent or empty", () => {
    const out = assembleSystemPrompt(ctx);
    expect(out).not.toContain("## Shared Context");
  });

  it("contains no '## Skills' section (pi injects skill XML downstream)", () => {
    const out = assembleSystemPrompt({
      ...ctx,
      agentConfig: {
        ...baseConfig,
        frontmatter: { ...baseConfig.frontmatter, skills: ["/abs/skill/SKILL.md"] } as never,
      },
    });
    expect(out).not.toContain("## Skills");
  });

  it("contains no '## Knowledge Files' or '## Reports'", () => {
    const out = assembleSystemPrompt(ctx);
    expect(out).not.toContain("## Knowledge Files");
    expect(out).not.toContain("## Reports");
  });
});
```

- [ ] **Step 3: Update `src/prompt/assembly-context.test.ts`**

Remove any fixture that includes `skillContents`. Simplify to test variable-resolution paths only.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/prompt/ 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/prompt/assembly.ts src/prompt/assembly.test.ts src/prompt/assembly-context.test.ts
git commit -m "refactor(prompt): strip skills/knowledge/reports rendering (pi injects skills XML)"
```

---

## Phase 5 — Validator update

### Task 7: Simplify `src/discovery/validator.ts` — drop role/domain validation

**Files:**
- Modify: `src/discovery/validator.ts`
- Modify: `src/discovery/validator.test.ts`

- [ ] **Step 1: Read current validator**

```bash
cat src/discovery/validator.ts
```

- [ ] **Step 2: Update imports and validation logic**

Remove imports of `validateRoleTools` from `../schema/validation.js` (being deleted). Add import of `validateFrontmatter` from `../schema/frontmatter.js`. Replace any role/domain/knowledge cross-field validation with a single call to `validateFrontmatter`:

```ts
// Somewhere in the validator loop / function:
const fmErrors = validateFrontmatter(parsed.data);
for (const err of fmErrors) {
  diagnostics.push({ level: "error", filePath, message: err });
}
```

Remove any code that expands knowledge paths, checks domain integrity, or applies role-tool constraints.

- [ ] **Step 3: Update `src/discovery/validator.test.ts`**

Delete tests for: role-based forbidden tools, domain integrity, knowledge path checks, reports validation, conversation template checks. Add tests for:
- Valid minimal frontmatter passes.
- Agent declaring `skills` without `read` tool fails with the documented message.
- Agent with `skills: []` and no `read` tool passes (skills empty = no requirement).

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/discovery/ 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/discovery/validator.ts src/discovery/validator.test.ts
git commit -m "refactor(discovery): replace role/domain validation with validateFrontmatter"
```

---

## Phase 6 — File deletions

Each of these tasks deletes a coherent subsystem in one commit. Order matters — by this point all surviving code should have been edited to not reference the deleted files. If typecheck fails after a deletion, it's a missed reference in an earlier task.

### Task 8: Delete the domain subsystem

**Files:**
- Delete: entire `src/domain/` directory (13 files)

- [ ] **Step 1: Remove the directory**

```bash
git rm -r src/domain/
ls src/domain/ 2>&1 | head -3   # expect: "No such file or directory"
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors. If any file still imports from `../domain/*`, that's a regression in an earlier task — fix the straggling import (delete it) and proceed.

- [ ] **Step 3: Run tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all pass. Test count should drop by the domain tests (~50+).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete src/domain/ (ACL + knowledge + conversation-tool + submit-tool — all dead)"
```

---

### Task 9: Delete conversation-log + session-dump + knowledge-e2e

**Files:**
- Delete: `src/invocation/conversation-log.ts`, `src/invocation/conversation-log.test.ts`
- Delete: `src/invocation/session-dump.ts`
- Delete: `src/invocation/session-knowledge-e2e.test.ts`
- Delete: `src/schema/conversation.ts`, `src/schema/conversation.test.ts`

- [ ] **Step 1: Remove the files**

```bash
git rm src/invocation/conversation-log.ts src/invocation/conversation-log.test.ts \
       src/invocation/session-dump.ts \
       src/invocation/session-knowledge-e2e.test.ts \
       src/schema/conversation.ts src/schema/conversation.test.ts
```

- [ ] **Step 2: Typecheck + tests**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -10
```

Expected: 0 errors, all pass.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete conversation-log + session-dump + conversation schema"
```

---

### Task 10: Delete `src/common/skills.ts`, `src/invocation/tool-wrapper.ts`, `src/schema/validation.ts`

**Files:**
- Delete: `src/common/skills.ts`, `src/common/skills.test.ts`
- Delete: `src/invocation/tool-wrapper.ts`, `src/invocation/tool-wrapper.test.ts`
- Delete: `src/schema/validation.ts`, `src/schema/validation.test.ts`

- [ ] **Step 1: Remove the files**

```bash
git rm src/common/skills.ts src/common/skills.test.ts \
       src/invocation/tool-wrapper.ts src/invocation/tool-wrapper.test.ts \
       src/schema/validation.ts src/schema/validation.test.ts
```

- [ ] **Step 2: Typecheck + tests**

```bash
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -10
```

Expected: 0 errors, all pass.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete loadSkillContents + tool-wrapper + validateRoleTools"
```

---

### Task 11: Prune `resolveConversationPath` from `src/common/paths.ts`

**Files:**
- Modify: `src/common/paths.ts`
- Modify: `src/common/paths.test.ts`

- [ ] **Step 1: Read the file**

```bash
cat src/common/paths.ts
```

- [ ] **Step 2: Remove the `resolveConversationPath` function and any `{{SESSION_ID}}` expansion helpers**

Keep `expandPath`, `vendorSkillsDir()` (if present), and any other path utilities. Delete only what was specific to the conversation template.

- [ ] **Step 3: Update `src/common/paths.test.ts`** — delete the `resolveConversationPath` test block.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/common/ 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/common/paths.ts src/common/paths.test.ts
git commit -m "chore(common): prune resolveConversationPath (dead after conversation removal)"
```

---

## Phase 7 — API surface + final pi-agents verification

### Task 12: Prune `src/api.ts` exports

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Rewrite `src/api.ts`**

Write this exactly:

```ts
// Public API for pi-agents
// Curated surface for consumers (e.g. pi-teams). Not a barrel — only intentional exports.

// biome-ignore-start lint/performance/noBarrelFile: api.ts is the designated public surface
export { colorize } from "./common/color.js";
export type { ContextFile } from "./common/context-files.js";
export { discoverContextFiles } from "./common/context-files.js";
// Common utilities
export { readFileSafe } from "./common/fs.js";
export { parseModelId } from "./common/model.js";
export { expandPath } from "./common/paths.js";
export { ANIMATION_FRAME_MS, spinnerFrame, workingDots } from "./common/spinner.js";
export { flatten } from "./common/strings.js";
export { isRecord } from "./common/type-guards.js";
// Discovery
export { extractFrontmatter } from "./discovery/extract-frontmatter.js";
export { parseAgentFile } from "./discovery/parser.js";
export { scanForAgentFiles } from "./discovery/scanner.js";
export type { AgentConfig, DiscoveryDiagnostic } from "./discovery/validator.js";
export { validateAgent } from "./discovery/validator.js";
// Invocation
export type { AgentMetrics } from "./invocation/metrics.js";
export { createMetricsTracker, sumMetrics } from "./invocation/metrics.js";
export { resolveModel } from "./invocation/resolve-model.js";
export { runAgent } from "./invocation/session.js";
export type { RunAgentParams, RunAgentResult } from "./invocation/session-helpers.js";
// Prompt
export type { AssemblyContext } from "./prompt/assembly.js";
export { assembleSystemPrompt } from "./prompt/assembly.js";
export { resolveVariables } from "./prompt/variables.js";
// Schema
export type { AgentFrontmatter } from "./schema/frontmatter.js";
export { AgentFrontmatterSchema, PI_DEFAULT_TOOLS, validateFrontmatter } from "./schema/frontmatter.js";
// Agent tool factory
export { createAgentTool } from "./tool/agent-tool.js";
// Formatting
export { formatTokens, formatUsageStats } from "./tool/format.js";
export type { ChainResult, RunAgentFn } from "./tool/modes.js";
// Execution modes
export {
  aggregateMetricsArray,
  collectAgentNames,
  detectMode,
  executeChain,
  executeParallel,
} from "./tool/modes.js";
// Rendering
export type { RenderTheme } from "./tool/render-types.js";
// TUI components
export { BorderedBox } from "./tui/bordered-box.js";
export { renderConversation } from "./tui/conversation.js";
export { buildFinalEvents, buildPartialEvents } from "./tui/render-events.js";
export type { AgentStatus, ConversationEvent } from "./tui/types.js";
// biome-ignore-end lint/performance/noBarrelFile: api.ts is the designated public surface
```

- [ ] **Step 2: Typecheck + test run**

```bash
npx tsc --noEmit
npx vitest run 2>&1 | tail -5
```

Both: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/api.ts
git commit -m "chore(api): prune dead exports after schema + feature-removal sweep"
```

---

### Task 13: Automated dead-code sweep

**Files:** none modified — audit only. Any matches → fix, then re-run.

- [ ] **Step 1: Run all grep gates**

```bash
cd /Users/josorio/Code/pi-agents
grep -rn "domain\|Domain" src/                                         # 0
grep -rn "knowledge\|Knowledge" src/                                   # 0
grep -rn "reports\b\|Reports\b" src/                                   # 0
grep -rn "conversation:" src/                                          # 0
grep -rn "conversationLog\|ConversationEntry\|ConversationLogPath" src/ # 0
grep -rn "appendToLog\|ensureLogExists\|readLog\b" src/                # 0
grep -rn "dumpAgentSession" src/                                       # 0
grep -rn "validateRoleTools\|FORBIDDEN_TOOLS_BY_ROLE" src/             # 0
grep -rn "loadSkillContents\|SkillContent\b" src/                      # 0
grep -rn 'role:\s*"worker"\|role:\s*"lead"' src/                       # 0
grep -rn "wrapWithDomainCheck\|buildDomainWithKnowledge" src/          # 0
grep -rn "read-knowledge\|write-knowledge\|read-conversation" src/     # 0
grep -rn "resolveConversationPath" src/                                # 0
```

If any return matches, fix in the same commit as this task (the match is a bug — a missed edit in an earlier task).

- [ ] **Step 2: Biome + typecheck + full test run**

```bash
npm run check
```

Expected: exit 0 — lint, blank-lines, typecheck, tests, parity (if wired) all pass.

- [ ] **Step 3: Commit (if fixes were needed)**

```bash
git add <whatever-was-fixed>
git commit -m "chore: mop up stragglers from frontmatter simplification"
```

If no fixes were needed, skip this step.

---

### Task 14: Update `src/index.ts` (pi-agents test harness / demo)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read the file**

```bash
cat src/index.ts
```

- [ ] **Step 2: Remove `conversationLogPath` from any `createAgentTool(...)` call; adapt any sample agent config to the minimal shape**

If `src/index.ts` is a demo/test harness that constructs example agent configs, rewrite those configs to the minimal frontmatter. Drop `domain`, `knowledge`, `role`, `reports`, `conversation` fields. Drop `conversationLogPath` from `createAgentTool`.

- [ ] **Step 3: `npm run check`**

```bash
npm run check
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "chore(index): update demo harness to minimal frontmatter"
```

---

## Phase 8 — Documentation (pi-agents)

### Task 15: Write `docs/skills.md`

**Files:**
- Create: `docs/skills.md`

- [ ] **Step 1: Create the file**

Write this to `docs/skills.md`:

```markdown
# Skills

pi-agents delegates skill loading to pi's native progressive-disclosure system. Skills are not eagerly inlined into the dispatched agent's system prompt — only a manifest (name + description + path) is surfaced, and the agent fetches full bodies with its own `read` tool on demand.

## Frontmatter

```yaml
skills:
  - /abs/path/to/skill-a/SKILL.md
  - /abs/path/to/skill-b/SKILL.md
```

All paths must be absolute (`/...`). Relative paths are rejected at schema validation.

The field is **optional** with override-or-inherit semantics:

- **Absent** — the dispatched agent inherits pi's default skill discovery (user's `~/.pi/agent/skills/`, project `.pi/skills/`, `package.json` `pi.skills` entries, settings, etc.).
- **Present, non-empty** — the agent sees ONLY those paths. pi's default discovery is skipped for this dispatch.
- **Present, empty (`skills: []`)** — explicit opt-out. The agent gets no skills at all.

## The `read`-tool requirement

The agent must have `read` in its `tools:` list (or omit `tools:` to inherit pi's default `["read", "bash", "edit", "write"]`, which includes `read`). If skills are declared and `read` is not in the effective tool list, `validateFrontmatter` produces:

> Agent '<name>' declares skills but has no 'read' tool. pi requires the 'read' tool for skill body loading (progressive disclosure). Add 'read' to tools or remove skills.

## How pi composes the system prompt

pi-agents supplies the agent's assembled system prompt to pi via `DefaultResourceLoader(systemPrompt, ...)`. pi's `buildSystemPrompt` (in `@mariozechner/pi-coding-agent`) then composes:

```
[pi-agents' assembled prompt]
[pi's append-system-prompt, if any]
[project context files, if any]
<skills>
  <skill>
    <name>skill-name</name>
    <description>skill description</description>
    <path>/abs/path/to/SKILL.md</path>
  </skill>
  ...
</skills>
Current date: YYYY-MM-DD
Current working directory: /path/to/cwd
```

See:

- https://agentskills.io/specification — SKILL.md format (source of truth).
- https://agentskills.io/integrate-skills — XML injection format used by pi.
- `node_modules/@mariozechner/pi-coding-agent/docs/skills.md` — pi's skill documentation.

## Example

An agent that gets exactly two skills, overriding the user's global discovery:

```yaml
---
name: reviewer
description: Reviews code against standards.
color: "#f5a623"
icon: 🔍
skills:
  - /usr/local/share/pi-teams/skills/code-style/SKILL.md
  - /usr/local/share/pi-teams/skills/test-coverage/SKILL.md
---
You are a code reviewer.
```

Tools default to pi's set (`read`, `bash`, `edit`, `write`). `read` covers the skill-loading requirement.

An agent that inherits everything the user has configured globally:

```yaml
---
name: helper
description: General-purpose helper.
color: "#36f9f6"
icon: 🛠
---
You are a helper.
```

No `skills:` → inherits. No `tools:` → pi's default. No `model:` → inherits parent session's current model.
```

- [ ] **Step 2: Commit**

```bash
git add docs/skills.md
git commit -m "docs: add skills.md — progressive disclosure, read-tool requirement, override/inherit"
```

---

### Task 16: Rewrite `docs/agent-example.md`

**Files:**
- Modify: `docs/agent-example.md`

- [ ] **Step 1: Overwrite the example**

Write this to `docs/agent-example.md`:

```markdown
# Agent Example

A minimal agent definition showing the required fields plus optional ones. For richer scenarios, see `docs/skills.md` for skill authoring and https://agentskills.io/specification for the SKILL.md format.

## Minimal agent file: `scout.md`

```yaml
---
name: scout
description: Fast codebase recon — reads files, finds patterns, returns structured findings.
color: "#36f9f6"
icon: 🔍
---
You are a scout. Your job is to read files and report findings.
```

Everything else is optional. This agent:

- Runs on whatever model is active in the parent pi session (no `model:` → inherit).
- Uses pi's active default tool set: `read`, `bash`, `edit`, `write` (no `tools:` → default).
- Inherits pi's skill discovery from the user's own configured locations (no `skills:` → inherit).

## Fuller example with explicit overrides

```yaml
---
name: scout-plus
description: Scout with grep, pinned to Haiku for speed, and curated skills.
model: anthropic/claude-haiku-4-5
color: "#36f9f6"
icon: 🔍
tools:
  - read
  - bash
  - grep
  - find
  - ls
skills:
  - /abs/path/to/skills/pattern-matching/SKILL.md
  - /abs/path/to/skills/structured-output/SKILL.md
---
You are a scout. Your job is to read files and report findings.
Prefer grep over bash for pattern search.
```

This agent:

- Pins to `anthropic/claude-haiku-4-5` (overrides inheritance).
- Declares its own tool list (note `read` must be included when `skills` is declared).
- Sees ONLY the two listed skill files — user's global skills are not surfaced.

## pi tool reference

pi's full tool universe (from `@mariozechner/pi-coding-agent dist/core/tools/index.js:17`):

| Tool | Purpose |
|------|---------|
| `read` | Read a file — **required** when `skills` is declared. |
| `bash` | Run shell commands. |
| `edit` | Modify a file. |
| `write` | Create or overwrite a file. |
| `grep` | Content search (ripgrep-backed). |
| `find` | Pattern-based file search. |
| `ls` | Directory listing. |

When `tools:` is omitted, the agent receives pi's active default set: `["read", "bash", "edit", "write"]`.

## Schema reference

See `src/schema/frontmatter.ts` for the authoritative schema. Required: `name`, `description`, `color`, `icon`. Optional: `model`, `tools`, `skills`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/agent-example.md
git commit -m "docs: rewrite agent example to minimal frontmatter"
```

---

### Task 17: Update `docs/architecture.md`

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Read current file**

```bash
cat docs/architecture.md | head -60
```

- [ ] **Step 2: Rewrite the stale sections**

Delete every mention of:
- `Domain (src/domain/)` as a pipeline stage.
- `Schema → knowledge`, `Schema → reports`, `Schema → conversation`, `Schema → role`.
- The 7-block pipeline diagram.

Replace the pipeline description with:

```
Discovery → Validation → Invocation → Rendering

Discovery scans `.pi/agents/` and `~/.pi/agents/` for `.md` files and parses frontmatter.
Validation applies the minimal 4-required + 3-optional schema (see docs/agent-example.md)
and checks the skills-requires-read rule. Invocation assembles the system prompt, builds
the `DefaultResourceLoader` (which handles skill discovery + XML injection per pi's own
pattern), and runs the dispatched agent via `createAgentSession`. Rendering produces
bordered-box TUI output.
```

Remove any code table listing files under `src/domain/`. Add a table entry pointing to `docs/skills.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs(architecture): drop domain/knowledge/reports sections, point to skills.md"
```

---

### Task 18: Push pi-agents and verify CI

**Files:** none — push verification only.

- [ ] **Step 1: Final local check**

```bash
npm run check
```

Expected: exit 0.

- [ ] **Step 2: Push**

```bash
git push origin main
```

If branch protection rejects due to missing status check, this is expected (admin bypass). CI will run on the pushed commit.

- [ ] **Step 3: Wait for CI**

```bash
gh run list --repo josorio7122/pi-agents --limit 2 --json headSha,status,conclusion,name
```

Loop until the top run is `{ status: "completed", conclusion: "success" }`. If it fails, read the logs with `gh run view <id> --log-failed` and fix in a follow-up task.

---

## Phase 9 — pi-superpowers consumer

### Task 19: Bump pi-superpowers lockfile to the new pi-agents HEAD

**Files:**
- Modify: `pi-superpowers/package-lock.json`

- [ ] **Step 1: Switch directories and force re-resolution**

```bash
cd /Users/josorio/Code/pi-superpowers
npm install pi-agents@github:josorio7122/pi-agents
```

- [ ] **Step 2: Verify the new SHA is the pi-agents HEAD**

```bash
jq -r '.packages."node_modules/pi-agents".resolved' package-lock.json
# expected: git+ssh://git@github.com/josorio7122/pi-agents.git#<latest-sha>
git -C /Users/josorio/Code/pi-agents rev-parse main
# must match the SHA above (minus the URL prefix)
```

- [ ] **Step 3: Note current `npm run check` status (expect failure)**

```bash
npm run check 2>&1 | tail -15
```

Expected: typecheck / tests fail because pi-superpowers' `agent-config-builder.ts` still emits the old shape (`domain`, `knowledge`, etc.) that pi-agents now rejects. The next tasks fix that.

- [ ] **Step 4: Commit the lockfile bump on its own**

```bash
git add package-lock.json package.json
git commit -m "chore(deps): bump pi-agents to HEAD (skills progressive disclosure)"
```

Don't push yet — tree is broken. Push happens after Task 23.

---

### Task 20: Add `skills` field to `AgentFrontmatterLike` in pi-superpowers

**Files:**
- Modify: `pi-superpowers/src/subagents/frontmatter.ts`
- Modify: `pi-superpowers/src/subagents/frontmatter.test.ts`

- [ ] **Step 1: Read current frontmatter parsing**

```bash
cd /Users/josorio/Code/pi-superpowers
cat src/subagents/frontmatter.ts
```

- [ ] **Step 2: Add optional `skills?: string[]` to `AgentFrontmatterLike`**

Locate the `AgentFrontmatterLike` type (the output shape of `parseAgentMarkdown`). Add an optional `skills?: readonly string[]` field. Ensure the YAML parser exposes this when present in the agent file. Keep `undefined` when absent.

- [ ] **Step 3: Add tests**

In `src/subagents/frontmatter.test.ts` add cases:

```ts
it("parses skills: [brainstorming, tdd] into a string array", () => {
  const parsed = parseAgentMarkdown(`---
name: x
description: y
skills:
  - brainstorming
  - test-driven-development
---
body`);
  expect(parsed.skills).toEqual(["brainstorming", "test-driven-development"]);
});

it("returns undefined skills when field is absent", () => {
  const parsed = parseAgentMarkdown(`---
name: x
description: y
---
body`);
  expect(parsed.skills).toBeUndefined();
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/subagents/frontmatter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/subagents/frontmatter.ts src/subagents/frontmatter.test.ts
git commit -m "feat(subagents): parse optional skills: list from upstream agent frontmatter"
```

---

### Task 21: Rewrite `pi-superpowers/src/subagents/agent-config-builder.ts` to the minimal shape

**Files:**
- Modify: `pi-superpowers/src/subagents/agent-config-builder.ts`
- Modify: `pi-superpowers/src/subagents/agent-config-builder.test.ts`

- [ ] **Step 1: Overwrite `src/subagents/agent-config-builder.ts`**

```ts
import type { VendorSkill } from "../skills/scan.js";
import type { AgentFrontmatterLike } from "./frontmatter.js";

export type PiAgentConfig = {
  frontmatter: {
    name: string;
    description: string;
    model?: string;
    color: string;
    icon: string;
    tools: string[];
    skills: string[];
  };
  systemPrompt: string;
  filePath: string;
  source: "project" | "user";
};

export type BuildCtx = {
  sessionDir: string;
  skills: ReadonlyArray<VendorSkill>;
};

// Pi's active default tool set — match @mariozechner/pi-coding-agent dist/core/sdk.js:139.
const DEFAULT_TOOLS: readonly string[] = ["read", "bash", "edit", "write"];

// SUPERPOWERS_AGENT_MODEL env var override for testing/config. Otherwise pass upstream
// value through (including undefined / "inherit") so pi-agents can resolve to the parent
// session's current model at dispatch time.
function resolveModel(upstream: string | undefined): string | undefined {
  const override = process.env.SUPERPOWERS_AGENT_MODEL;
  if (override) {
    if (!/^.+\/.+$/.test(override)) {
      throw new Error(`invalid SUPERPOWERS_AGENT_MODEL '${override}' — expected 'provider/model' format`);
    }
    return override;
  }
  return upstream;
}

// If upstream declares `skills:` (by name), filter to that subset; otherwise default to
// all available vendor skills. Unknown names silently skipped (TODO: warn in caller).
function resolveSkillsForAgent(upstream: AgentFrontmatterLike, all: readonly VendorSkill[]): string[] {
  const declared = upstream.skills;
  if (!declared || declared.length === 0) return all.map((s) => s.path);
  const byName = new Map(all.map((s) => [s.name, s.path]));
  return declared.map((name) => byName.get(name)).filter((p): p is string => p !== undefined);
}

export function buildAgentConfig(upstream: AgentFrontmatterLike, ctx: BuildCtx): PiAgentConfig {
  const tools = upstream.tools && upstream.tools.length > 0 ? [...upstream.tools] : [...DEFAULT_TOOLS];
  const model = resolveModel(upstream.model);

  return {
    frontmatter: {
      name: upstream.name,
      description: upstream.description ?? upstream.name,
      ...(model !== undefined ? { model } : {}),
      color: "#f5a623",
      icon: "🦸",
      tools,
      skills: resolveSkillsForAgent(upstream, ctx.skills),
    },
    systemPrompt: upstream.body,
    filePath: `vendor/superpowers/agents/${upstream.name}.md`,
    source: "user",
  };
}
```

- [ ] **Step 2: Rewrite `src/subagents/agent-config-builder.test.ts`**

Rewrite to cover:
- Minimal upstream → produces minimal config with all vendor skills.
- `upstream.skills = ["brainstorming"]` → filtered to just that vendor skill's path.
- `upstream.skills = ["unknown-name"]` → produces `skills: []` (unknown silently dropped).
- `upstream.skills` absent → produces all vendor skills.
- `upstream.tools = ["read", "grep"]` → used as-is.
- `upstream.tools` absent → default `["read", "bash", "edit", "write"]`.
- `upstream.model = "inherit"` → `model: "inherit"` passed through.
- `upstream.model` absent → `model` field omitted from output.
- `SUPERPOWERS_AGENT_MODEL` env override honored.
- `SUPERPOWERS_AGENT_MODEL` with bad format throws.
- No `domain`, `knowledge`, `role`, `reports`, `conversation`, `conversation.path` fields in output.
- Skills are absolute paths (match the paths from the fake VendorSkill input).

Use a helper to stub VendorSkill entries:

```ts
const fakeSkills: VendorSkill[] = [
  { name: "brainstorming", path: "/abs/skills/brainstorming/SKILL.md", description: "Explore ideas" },
  { name: "test-driven-development", path: "/abs/skills/tdd/SKILL.md", description: "TDD" },
];
const ctx = { sessionDir: "/tmp/s", skills: fakeSkills };
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/subagents/
```

- [ ] **Step 4: Commit**

```bash
git add src/subagents/agent-config-builder.ts src/subagents/agent-config-builder.test.ts
git commit -m "refactor(subagents)!: minimal config — drop domain/knowledge/conversation/role"
```

---

### Task 22: Update `pi-superpowers/src/index.ts` — drop `conversationLogPath` and simplify

**Files:**
- Modify: `pi-superpowers/src/index.ts`
- Modify: `pi-superpowers/.gitignore`

- [ ] **Step 1: Read the file**

```bash
cat src/index.ts
```

- [ ] **Step 2: Edit `src/index.ts` — drop `conversationLogPath` from `createAgentTool(...)` and drop any knowledge-stub creation**

The `createAgentTool` call currently contains:

```ts
createAgentTool({
  agents: configs,
  modelRegistry: anyCtx.modelRegistry as never,
  cwd: anyCtx.cwd,
  sessionDir,
  conversationLogPath: join(sessionDir, "superpowers", "dispatch.jsonl"),
})
```

Remove the `conversationLogPath` line. If `buildAllAgentConfigs` is now synchronous (no more `ensureStubFile`), consider whether the surrounding `await`/`async` chain can be simplified; keep the async signature on the handler if pi still expects one.

Audit the rest of `src/index.ts` for any reference to `sessionDir/superpowers/`, `sessionDir/agents/`, or `dispatch.jsonl` — delete.

- [ ] **Step 3: Clean `.gitignore`**

```bash
cat .gitignore
```

Remove the `superpowers/` entry (pi-superpowers no longer writes there). Keep `vendor/superpowers.staging/` — that's staging for upstream syncs. Keep `.pi/`. Keep `coverage/`, `.vitest-cache/`, `node_modules/`, `dist/`, `*.log`, `.DS_Store`, `.worktrees/`, `worktrees/`.

- [ ] **Step 4: Run full check**

```bash
npm run check
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts .gitignore
git commit -m "refactor(index): drop conversationLogPath from createAgentTool; clean .gitignore"
```

---

### Task 23: Push pi-superpowers and verify CI

**Files:** none — push verification only.

- [ ] **Step 1: Final local check**

```bash
cd /Users/josorio/Code/pi-superpowers
npm run check
```

Expected: exit 0.

- [ ] **Step 2: Push**

```bash
git push origin main
```

- [ ] **Step 3: Wait for CI**

```bash
gh run list --repo josorio7122/pi-superpowers --limit 2 --json headSha,status,conclusion,name
```

Loop until the top run reports `conclusion: "success"`.

---

## Phase 10 — End-to-end verification

### Task 24: E2E smoke test — dispatched agent receives XML skill manifest and reads skill bodies

**Files:** none modified. This is a live-binary run against a real pi.

- [ ] **Step 1: Ensure PI_BIN is set**

```bash
cd /Users/josorio/Code/pi-superpowers
which pi
export PI_BIN=$(which pi)
echo $PI_BIN
```

If pi is not installed locally, install or build it, then retry. Skip the rest of this task only if pi binary is genuinely unavailable — note the skip in the commit message of the final cleanup commit.

- [ ] **Step 2: Run the fast e2e lane**

```bash
npm run test:e2e 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 3: Manual dispatch check**

Start an interactive pi session loading pi-superpowers and dispatch a test agent:

```bash
pi -e ./src/index.ts
# In the interactive session:
> Please use the agent tool to dispatch code-reviewer with task "list the files in this directory and report"
```

Expected observations:

1. The dispatched agent's system prompt contains `<skills>` XML (not `## Skills`). This isn't directly visible to the user, but the agent should behave as if it knows about skills.
2. If the agent calls `read` on a `vendor/superpowers/skills/.../SKILL.md` path, that read succeeds (no "domain violation" — domain is gone).
3. The dispatched agent runs on the user's currently-active model (inherited).
4. No files are created under `<sessionDir>/superpowers/` or `<sessionDir>/agents/` during the dispatch.
5. `ls $(pi session-dir)` should show only pi's own session files, nothing from pi-superpowers.

If any of the above fails, open the captured transcript and file an issue; don't retry-in-place.

- [ ] **Step 4: No commit needed** — this is a verification task.

---

## Self-review

Ran after writing:

**Spec coverage:** Every §Changes item in the spec maps to a task:
- Schema change → Task 1.
- `validateFrontmatter` → Task 1 (co-located, not a separate file).
- Domain deletion → Task 8.
- Knowledge subsystem → tasks 6 (assembly prune), 8 (domain delete).
- Tool-wrapper deletion → Task 10.
- Conversation-log deletion → Task 9.
- Session-dump deletion → Task 9.
- Skills contents + reports loader removal → Tasks 6, 10.
- Internal conversation-log path **not** reintroduced → explicitly noted in Task 3 (`runAgent` body has no `appendToLog` or path helper).
- `resolveModel` helper → Task 2.
- DefaultResourceLoader integration → Task 3.
- createAgentTool `conversationLogPath` drop → Task 5.
- Validator update → Task 7.
- api.ts pruning → Task 12.
- Automated grep sweep → Task 13.
- Documentation (`skills.md`, `agent-example.md`, `architecture.md`) → Tasks 15, 16, 17.
- pi-superpowers consumer: `AgentFrontmatterLike.skills` → Task 20; agent-config-builder → Task 21; index.ts + .gitignore → Task 22.
- Coordination (pi-agents first, then pi-superpowers) → Task 18 (pi-agents push) gates Task 19+.

**Placeholder scan:** No "TBD" / "implement later" / "similar to Task N" / "add appropriate X". Spots that depend on real-file inspection (`bash check for factory exports` in Task 4) are flagged explicitly with a specific `grep` to run before proceeding; this is NOT a placeholder, it's a verification step that can't be frozen at plan-authoring time.

**Type consistency:**
- `RunAgentParams`: adds `inheritedModel?: Model<Api>`, drops `conversationLogPath`, drops `caller`. Consistent across Tasks 3, 5.
- `createAgentTool` config: drops `conversationLogPath`, keeps `agents`, `modelRegistry`, `cwd`, `sessionDir`. Consistent across Tasks 5, 22.
- `PiAgentConfig` (pi-superpowers): drops `domain`, `knowledge`, `reports`, `conversation`, `role`; `model` becomes optional. Consistent in Task 21.
- `AgentFrontmatter` (pi-agents): 4 required + 3 optional. Consistent across Tasks 1, 6, 12.
- `validateFrontmatter(fm: AgentFrontmatter): string[]` signature consistent across Tasks 1, 7.
- `resolveModel({ fmModel, inherited, registry }): Model<Api>` signature consistent across Tasks 2, 3.

All checks pass.
