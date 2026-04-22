# Simplify pi-agents frontmatter + skills progressive disclosure — design

**Status:** approved for implementation
**Date:** 2026-04-21
**Target:** pi-agents (still v0.1.0 — pre-release churn), pi-superpowers follow-up

## Goal

Two coupled simplifications landing together:

1. **Strip pi-agents' frontmatter to the minimum.** Remove `domain` and `knowledge` blocks. These are filesystem-access constraints that get in the way more than they help. A dispatched agent should be trusted with the same tool capabilities as the parent pi session — no softer-than-parent sandbox.
2. **Switch skill delivery to pi's native progressive disclosure.** Stop eager-inlining skill bodies. Pass absolute skill paths to pi via `DefaultResourceLoader`, let pi inject the agentskills.io-spec XML manifest into the system prompt, and let the agent `read` bodies on demand. Load skills from BOTH pi's default discovery (parent session's configured skill locations) AND the agent's own `skills:` list.

These two changes are bundled because they both break the frontmatter schema, both target the same minor version, and both shrink pi-agents' surface area.

## Motivation

**Today pi-agents' 7-block frontmatter carries weight it shouldn't:**

- `domain` is a per-agent filesystem ACL. At dispatch time, every `read`/`write`/`edit`/`bash` call runs through `src/domain/checker.ts` before execution. In practice:
  - Agents run in the same process as the parent pi session, with the same tools, so the ACL isn't a real security boundary — it's a soft convention.
  - Global pi-superpowers installs put vendor skills outside the user's cwd, so the default `path: "."` domain rejects skill reads.
  - The complexity (~400 LOC across schema / checker / scoped-tools / tests) buys very little over "just use the tools you were given."

- `knowledge` creates two markdown stub files per agent per session (`<agent>-project.md`, `<agent>-general.md`) under `sessionDir/superpowers/`. They're never auto-populated. pi-superpowers' agent-config-builder has to create them, manage them, and enforce write permissions. Net effect: file I/O overhead and cognitive complexity for a feature no shipped agent uses.

- `skills` today requires `{path, when}` objects with `minItems: 1`; pi-agents eagerly loads every skill body and inlines it into the system prompt. pi-superpowers exploits this at `src/subagents/agent-config-builder.ts:84` to attach all 14 Superpowers skills to every dispatch, costing ~25–30k input tokens per invocation regardless of need.

**pi itself already ships the right pattern for skills.** From `node_modules/@mariozechner/pi-coding-agent/docs/skills.md:64-71`:

> 1. At startup, pi scans skill locations and extracts names and descriptions
> 2. The system prompt includes available skills in XML format per the [specification](https://agentskills.io/integrate-skills)
> 3. When a task matches, the agent uses `read` to load the full SKILL.md
> 4. The agent follows the instructions, using relative paths to reference scripts and assets
>
> This is progressive disclosure: only descriptions are always in context, full instructions load on-demand.

pi exposes `loadSkills()`, `formatSkillsForPrompt()`, and a `ResourceLoader` interface with a `getSkills()` method. `createAgentSession` already takes a `resourceLoader` — pi-agents just needs to hand it one with the right options.

**Stripping domain + knowledge unlocks the skill change** — the "global install breaks skill reads" concern disappears entirely, because without domain there's nothing to reject the read.

## Non-goals

- Changing how the main pi session discovers skills (already correct per pi's docs).
- Adding a new tool. The agent's existing `read` tool suffices for skill body loading.
- Preserving the current 7-block schema. This is a deliberate, documented simplification.
- Replacing domain/knowledge with a different sandboxing story. If fine-grained ACL or per-agent knowledge files matter later, they can return as separate, orthogonal subsystems — not in core pi-agents.
- Bumping pi-agents past v0.1.0. Nothing is released publicly yet; patch-level iteration is fine within 0.1.x.

## Architecture

### The new minimal frontmatter

Before (7 blocks):
```yaml
name: ...           # Identity
description: ...
model: ...
role: worker|lead|orchestrator
color: "#..."
icon: "..."
domain:             # REMOVED
  - path: ...
    read: ...
tools: [...]        # Capabilities
skills:             # Capabilities — reshape
  - path: ...
    when: ...
knowledge:          # REMOVED
  project: ...
  general: ...
reports: ...        # Optional — kept as-is
conversation:
  path: ...
```

After (4 required + 3 optional):
```yaml
name: ...             # Identity — required
description: ...      #   required
color: "#..."         #   required
icon: "..."           #   required

model: inherit        # Optional — absent or "inherit" = take parent session's model
tools: [...]          # Optional — absent = use pi's active default
skills: [...]         # Optional — absent = inherit parent's skill discovery;
                      #            present (even empty) = use only what's declared
```

Gone: `domain`, `knowledge`, `role`, `reports`, `conversation`.

- **`model`** optional with `inherit` sentinel.
- **`tools`** optional. Absent → pi's active default `["read", "bash", "edit", "write"]`. Present → use the declared array as-is.
- **`skills`** optional with **override-or-inherit** semantics. Absent → `noSkills: false` in the ResourceLoader (pi's default discovery finds whatever the user has in `~/.pi/agent/skills/`, `.pi/skills/`, etc.). Present → `additionalSkillPaths: agent.skills, noSkills: true` (ONLY what's declared; `skills: []` means no skills at all). This matches how `tools` works and gives consumers a clean way to isolate dispatched agents from the user's ambient skills.
- **`role`** removed — it only drove `validateRoleTools` (forbidden-tool rules per role), which contradicts the "trust the agent" direction.
- **`reports`** removed — no shipped agent uses it; agents that want to emit structured output can write to any path via the `write` tool.
- **`conversation`** removed — it was just a path template. pi-agents now computes the per-agent log path internally from `sessionDir`, agent `name`, and session id.

### Skill loading — pi's native path, additive

```
Agent frontmatter: skills: [/abs/path/a, /abs/path/b]
                   │
                   ▼
pi-agents builds ResourceLoader:
  new DefaultResourceLoader({
    cwd, agentDir: getAgentDir(),
    additionalSkillPaths: fm.skills,   // agent's curated paths
    includeDefaults: true,              // ALSO scan parent defaults:
                                        //   ~/.pi/agent/skills/
                                        //   .pi/skills/ (project)
                                        //   package.json "pi.skills"
                                        //   settings.json "skills"
    systemPrompt: assembledSystemPrompt,
  })
                   │
                   ▼
pi's getSkills() returns union of default-discovered + agent-declared
                   │
                   ▼
pi's buildSystemPrompt (dist/core/system-prompt.js:20-37) composes:
  [pi-agents' assembled prompt]
  [append-system-prompt]
  [project context files]
  <skills>                              ← formatSkillsForPrompt(skills)
    <skill>
      <name>...</name>
      <description>...</description>
      <path>/abs/...</path>
    </skill>
    ...
  </skills>
  Current date: ...
  Current working directory: ...
                   │
                   ▼
Agent sees XML manifest; uses `read` on demand to fetch full bodies
```

**Additive, not substitutive:** `includeDefaults: true` (the default) means the dispatched agent sees everything the parent pi session sees in its skill locations, PLUS anything the agent declares explicitly. This is the CC mental model — "skills are ambient; agents can add more."

### Model inheritance

An agent's `model` field is now optional:

- `model: "anthropic/claude-sonnet-4-6"` — pin to this specific model.
- `model: "inherit"` or field omitted — use whatever model is active in the parent pi session at dispatch time.

Rationale: agents shouldn't hard-code model choice unless they genuinely need specific capability. For most dispatched work, the user's currently-selected model in the parent session is the right answer — same cost profile, same capability level, no surprises when the user deliberately switches models.

If the parent session has no active model (rare — e.g., `--no-session` before any prompt has resolved a model), pi-agents throws a clear error at dispatch time rather than silently falling back.

### Validation path

`buildSystemPrompt` only injects skills XML if:
```js
const customPromptHasRead = !selectedTools || selectedTools.includes("read");
if (customPromptHasRead && skills.length > 0) {
    prompt += formatSkillsForPrompt(skills);
}
```

Hard constraint: an agent whose `tools:` lacks `read` silently loses skills. pi-agents must validate upfront.

## Changes

### pi-agents (breaking)

**1. Schema — `src/schema/frontmatter.ts`:**

Remove `DomainEntrySchema`, remove `KnowledgeFileSchema`. `AgentFrontmatterSchema` becomes:

```ts
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

  // Tools — optional; absent → pi's active default ["read", "bash", "edit", "write"].
  tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),

  // Skills — optional; absent → inherit parent's default discovery;
  //                    present (even empty) → use ONLY these paths.
  skills: Type.Optional(Type.Array(Type.String({ pattern: "^/" }), { minItems: 0 })),
});
```

Rationale:
- Skills are absolute paths (enforced at schema level — no hidden "resolved against what?" semantics).
- Optional `tools` + `skills` + `model` gives the pattern "declare what you want to override, inherit the rest." Consistent across all three capability fields.
- `skills: []` is meaningful: "this agent gets no skills at all" (explicit opt-out). `skills` absent means "inherit whatever the parent configured."
- `domain`, `knowledge`, `role`, `reports`, `conversation` all removed. An agent file containing any of them produces a validation error ("unknown key").

**2. Cross-field validation — `src/schema/frontmatter.ts` (move + simplify):**

The entire `src/schema/validation.ts` file gets deleted (only `validateRoleTools` lived there, and role is gone). Add one new check — co-locate it with the schema in `src/schema/frontmatter.ts` as `validateFrontmatter(fm)`:

```ts
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

The check runs against `effectiveTools` (post-default-fallback), so `tools: undefined` + `skills: [...]` correctly gets `read` from the default and passes.

**3. Exhaustive dead-code deletion.**

After the schema shrinks, everything that only exists to support a removed field MUST go. **Zero dead code tolerance.**

**Files deleted in full:**

`src/domain/` (entire directory — 13 files):
- `checker.ts` + `checker.test.ts` — path-ACL enforcement, the whole reason domain existed.
- `scoped-tools.ts` + `scoped-tools.test.ts` — `buildDomainWithKnowledge`, wraps built-ins with ACL checks.
- `knowledge-tools.ts` + `knowledge-tools.test.ts` — `read-knowledge`, `write-knowledge`, `edit-knowledge` custom tools. Unreachable without `knowledge:` frontmatter.
- `conversation-tool.ts` + `conversation-tool.test.ts` — `read-conversation` custom tool. Dispatched agents get message history through pi's native session, not a bespoke read tool; the internal per-agent log is for the DISPATCHER to replay, not for the agent to read.
- `submit-tool.ts` + `submit-tool.test.ts` — the "emit a report artifact" tool. Dead without `reports:`.
- `max-lines.ts` + `max-lines.test.ts` — enforces `knowledge[*].max-lines`. Dead with knowledge.
- `types.ts` — `DomainEntry`, `ScopedTool`, etc.

`src/common/skills.ts` + `src/common/skills.test.ts` — `loadSkillContents`. No caller after skill-loading moves to pi.

`src/invocation/tool-wrapper.ts` + `src/invocation/tool-wrapper.test.ts` — `wrapWithDomainCheck`, `createToolForAgent`, `dispatchBuiltinTool`. The entire file exists to bolt domain checks and the knowledge/conversation custom tools onto the built-in tools. Without domain + knowledge + conversation-tool + submit-tool, the file is dead.

`src/invocation/session-knowledge-e2e.test.ts` — e2e test for the knowledge subsystem.

`src/schema/validation.ts` has only `validateRoleTools`; the whole file goes. (The new "skills requires read" check moves to `src/schema/frontmatter.ts` or a renamed validator module — see item 5 below.)

`src/schema/validation.test.ts` — covers only `validateRoleTools`. Deleted with the module.

**Exports pruned from `src/api.ts`:**

Remove these lines:
```ts
export { loadSkillContents } from "./common/skills.js";                    // dead
export { checkDomain } from "./domain/checker.js";                         // dead
export { enforceMaxLines } from "./domain/max-lines.js";                   // dead
export { buildDomainWithKnowledge } from "./domain/scoped-tools.js";       // dead
export { createToolForAgent, dispatchBuiltinTool, wrapWithDomainCheck }    // dead
  from "./invocation/tool-wrapper.js";
export { validateRoleTools } from "./schema/validation.js";                // dead
```

Audit `resolveConversationPath` from `./common/paths.js` (line 10) — it resolved the `conversation.path` template. Check for remaining callers post-cleanup; if none, delete from `common/paths.ts` and `common/paths.test.ts` and drop from api.ts. Likely dead.

**Module-level deletions inside surviving files:**

In `src/prompt/assembly.ts`:
- `renderKnowledgeSection` function — dead.
- `renderReportsSection` function — dead.
- `renderSkillsSection` function — dead (pi handles skills XML).
- `KNOWLEDGE_BLOCK`, `SKILLS_BLOCK`, `DOMAIN_BLOCK` entries from the variables map — dead.
- `skillContents` from `AssemblyContext` — dead.

In `src/schema/frontmatter.ts`:
- `DomainEntrySchema`, `SkillSchema` (the old `{path, when}` object), `KnowledgeFileSchema` — dead.

In `src/discovery/validator.ts` (if it calls `validateRoleTools` or `checkDomain`) — remove those calls and their diagnostic cases. Audit and simplify.

In `src/invocation/session.ts`:
- `loadSkillContents(fm.skills)` call — dead.
- Any `wrapWithDomainCheck` or `buildDomainWithKnowledge` calls — dead.
- Any code that reads `fm.domain`, `fm.knowledge`, `fm.role`, `fm.reports`, `fm.conversation` — dead.

In `src/tool/agent-tool-execute.ts` and `src/tool/agent-tool.ts` — audit for references to removed frontmatter fields (reports tool name surfacing, etc.) and delete.

**Automated sweep (required — part of the implementation, not optional):**

After the deletions above, run these from the pi-agents root and expect zero matches in `src/` (excluding the spec itself):

```bash
grep -rn "domain\|Domain" src/                                   # expect: 0
grep -rn "knowledge\|Knowledge" src/                             # expect: 0
grep -rn "reports\b\|Reports\b" src/                             # expect: 0
grep -rn "conversation:" src/                                    # expect: 0 (the frontmatter key)
grep -rn "validateRoleTools\|FORBIDDEN_TOOLS_BY_ROLE" src/       # expect: 0
grep -rn "loadSkillContents\|SkillContent\b" src/                # expect: 0
grep -rn "role:\s*\"worker\"\|role:\s*\"lead\"" src/             # expect: 0
grep -rn "wrapWithDomainCheck\|buildDomainWithKnowledge" src/    # expect: 0
grep -rn "read-knowledge\|write-knowledge\|read-conversation"    # expect: 0
  src/
```

Biome's `noUnusedImports` / `noUnusedVariables` catch the rest. If it flags anything → delete, don't silence.

**4. Internal conversation-log path — `src/invocation/session.ts`:**

Today the conversation-log path came from `fm.conversation.path` via `{{SESSION_ID}}` substitution. Replace with an internal helper in `src/invocation/`:

```ts
export function agentConversationLogPath(
  sessionDir: string,
  agentName: string,
  sessionId: string,
): string {
  return join(sessionDir, "agents", `${agentName}-${sessionId}.jsonl`);
}
```

Directory is created on first write. Consumers (pi-superpowers TUI, etc.) that need to read the log use the helper exported from `src/api.ts`.

**5. Simplify session construction — `src/invocation/session.ts`:**

Replace the existing minimal `resourceLoader` object literal with `DefaultResourceLoader` configured per the override-or-inherit semantics:

```ts
import { DefaultResourceLoader, getAgentDir } from "@mariozechner/pi-coding-agent";

// pi's active default tool set, per dist/core/sdk.js:139.
const PI_DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

// Effective tools: declared list if present, otherwise pi's default.
const effectiveTools = fm.tools ?? PI_DEFAULT_TOOLS;

// Skill loader config: presence of the field drives override semantics.
const skillLoaderOpts = fm.skills !== undefined
  ? { additionalSkillPaths: [...fm.skills], noSkills: true }   // declared → use ONLY these
  : { noSkills: false };                                        // absent → pi's defaults

const resourceLoader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
  ...skillLoaderOpts,
  noExtensions: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  systemPrompt: assembledSystemPrompt,
});

const { session } = await createAgentSession({
  cwd,
  model: resolveModel(fm.model, ctx),    // see model-resolution below
  tools: effectiveTools,
  customTools: allCustomTools,
  sessionManager,
  settingsManager,
  modelRegistry,
  resourceLoader,
});
```

Remove the `loadSkillContents(fm.skills)` call. pi handles skill loading from here.

**5a. Model resolution — new helper in `src/invocation/`:**

```ts
// Resolves the effective model for a dispatched agent.
// - Undefined or "inherit" in frontmatter → parent session's current model from ctx.
// - Explicit "provider/name" → use that, after format validation.
// - Parent context lacks a model (rare — --no-session before first prompt) → throw with
//   a clear error so the dispatcher surfaces it, rather than silently picking a default.
export function resolveModel(
  fmModel: string | undefined,
  ctx: { currentModel?: Model },
): Model {
  if (fmModel && fmModel !== "inherit") {
    // Parse "provider/name" → Model via modelRegistry.
    return parseModelId(fmModel);
  }
  const inherited = ctx.currentModel;
  if (!inherited) {
    throw new Error(
      `agent declares 'model: inherit' (or omits model) but no model is active in the parent session. ` +
      `Select a model with /model or start pi with --model provider/name.`,
    );
  }
  return inherited;
}
```

The parent's current model is available on `ExtensionContext` (pi exposes this via the tool-execute ctx). If it's not exposed explicitly today, that's the one pi-agents change we'd need to coordinate upstream; otherwise we derive it from `modelRegistry` + some "active model" signal. Implementation detail for the plan.

**6. Delete `src/common/skills.ts`.** `loadSkillContents` has no remaining caller. Remove the export from `src/api.ts`.

**7. Prompt assembly — `src/prompt/assembly.ts`:**

Covered under item 3 above. Summary for cross-reference:

- Delete `renderSkillsSection`, `renderKnowledgeSection`, `renderReportsSection`.
- Remove `KNOWLEDGE_BLOCK`, `SKILLS_BLOCK`, `DOMAIN_BLOCK` from the variable substitution map.
- Drop `skillContents` from `AssemblyContext`.
- Keep `renderSharedContextSection` (still relevant).
- Keep `resolveVariables` (agents can still use `{{SESSION_ID}}` and similar in their bodies).

`src/prompt/assembly.test.ts` and `src/prompt/assembly-context.test.ts` lose a lot of fixture weight; rewrite to the minimal shape.

**8. Documentation:**

- **New file: `docs/skills.md`** — describes:
  - Progressive disclosure: only descriptions in the system prompt, bodies loaded via `read`.
  - The `skills: [absolutePath, ...]` frontmatter shape.
  - **`read`-tool requirement** — called out explicitly with the validation error message quoted verbatim.
  - Note that pi-agents adds agent-declared paths on top of whatever pi's default discovery finds.
  - Link to https://agentskills.io/specification as the source of truth for SKILL.md format.
  - Link to https://agentskills.io/integrate-skills for the XML injection format.

- **Update `docs/architecture.md`:**
  - Remove the `Domain (src/domain/)` and `Schema → knowledge` sections from the pipeline diagram and descriptions.
  - Remove any `conversation` / `reports` / `role` references.
  - Add a "Skills" section pointing to `docs/skills.md`.
  - Update the 7-block references throughout — the frontmatter is now a flat 6+1-field shape, not a block-structured layout.

- **Update `docs/agent-example.md`:**
  - Rewrite to the new minimal shape — no `domain`, `knowledge`, `role`, `reports`, `conversation` blocks.
  - `skills:` uses bare absolute paths; show at least two entries demonstrating the shape.
  - **Keep `read` explicitly in `tools:`** — use pi's active default (`read`, `bash`, `edit`, `write`) as the starting set, adding `grep`/`find`/`ls` as the example agent needs them. Add a short sentence below the example noting `read` is required whenever `skills` is non-empty.
  - Include a "pi tool reference" note listing the full universe from pi source (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`) with the cite `pi-coding-agent dist/core/tools/index.js:17`.

**9. Tests:**

Assertions for the new behavior:

- `src/schema/frontmatter.test.ts` — rewrite fixtures to minimal shape; assert `domain`, `knowledge`, `role`, `reports`, `conversation` keys are rejected; assert `skills` (when present) with relative paths rejected; assert `skills: []` accepted (explicit opt-out); assert `skills` absent accepted (inherit); assert `tools` absent accepted (pi-default); assert `tools: []` rejected (`minItems: 1` on the inner array when the field is declared); assert `model` absent accepted (inherit); assert `model: "inherit"` accepted; assert explicit `provider/name` accepted; assert `model: "bad-format"` rejected.
- `src/schema/frontmatter.test.ts` — add `validateFrontmatter` cases: skills declared + no read tool → error; skills declared + tools absent → NO error (default pulls in `read`); no skills + no read tool → NO error.
- `src/prompt/assembly.test.ts` and `assembly-context.test.ts` — rewrite fixtures; assert assembled prompt no longer contains `## Skills`, `## Knowledge Files`, or `## Reports`; assert `SESSION_ID` still substitutes in body text.
- `src/invocation/session.test.ts` — assert `fm.skills: [path]` builds a resourceLoader with `additionalSkillPaths: [path]` and `noSkills: true`; assert `fm.skills: undefined` builds a resourceLoader with `noSkills: false`; assert `fm.tools: undefined` effective-tools equals pi's default; assert the internal conversation-log path follows the `<sessionDir>/agents/<name>-<sessionId>.jsonl` shape.
- `src/invocation/resolve-model.test.ts` (new) — assert `undefined` → inherited; assert `"inherit"` → inherited; assert `"provider/name"` → pinned; assert inheritance with no parent model throws the documented error.

Deletions:

- **Delete file outright:** `src/schema/validation.ts`, `src/schema/validation.test.ts`.
- **Delete directory:** `src/domain/` (all 13 files).
- **Delete file outright:** `src/common/skills.ts`, `src/common/skills.test.ts`.
- **Delete file outright:** `src/invocation/tool-wrapper.ts`, `src/invocation/tool-wrapper.test.ts`.
- **Delete file outright:** `src/invocation/session-knowledge-e2e.test.ts`.
- Prune `src/prompt/assembly.test.ts` / `assembly-context.test.ts` of knowledge/reports/old-skills-format test cases.

Expected test count delta: meaningfully negative (300+ → probably ~220-240 tests). `npm run check` LOC delta for `src/`: roughly -1500 lines including tests, -600 lines excluding.

### pi-superpowers (consumer update)

**1. Agent config builder — `src/subagents/agent-config-builder.ts`:**

Full simplification:

```ts
import { vendorSkillsDir } from "../common/paths.js";
import type { VendorSkill } from "../skills/scan.js";
import type { AgentFrontmatterLike } from "./frontmatter.js";

export type PiAgentConfig = {
  frontmatter: {
    name: string;
    description: string;
    model?: string;       // optional — pi-agents inherits from parent when absent
    color: string;
    icon: string;
    tools: string[];
    skills: string[];     // absolute paths
  };
  systemPrompt: string;
  filePath: string;
  source: "project" | "user";
};

// Matches pi's active default tool set.
// Source: @mariozechner/pi-coding-agent dist/core/sdk.js:139,
//         dist/core/system-prompt.js:48, dist/core/agent-session.js:1887.
// Full universe of pi tools is ["read", "bash", "edit", "write", "grep", "find", "ls"]
// (dist/core/tools/index.js:17 — `allToolNames`); agents declare grep/find/ls
// explicitly in their own frontmatter when needed.
const DEFAULT_TOOLS = ["read", "bash", "edit", "write"];

function resolveSkillsForAgent(
  upstream: AgentFrontmatterLike,
  all: readonly VendorSkill[],
): string[] {
  const declared = upstream.skills;
  if (!declared || declared.length === 0) return all.map((s) => s.path);
  const byName = new Map(all.map((s) => [s.name, s.path]));
  return declared
    .map((name) => byName.get(name))
    .filter((p): p is string => p !== undefined);
}

// Model resolution: honor SUPERPOWERS_AGENT_MODEL env override; otherwise pass
// the upstream value through (including undefined / "inherit") so pi-agents can
// resolve to the parent session's current model at dispatch time.
function resolveModel(upstream: string | undefined): string | undefined {
  const override = process.env.SUPERPOWERS_AGENT_MODEL;
  if (override) {
    if (!/^.+\/.+$/.test(override)) {
      throw new Error(`invalid SUPERPOWERS_AGENT_MODEL '${override}' — expected 'provider/model' format`);
    }
    return override;
  }
  return upstream;   // undefined and "inherit" pass through to pi-agents
}

export function buildAgentConfig(
  upstream: AgentFrontmatterLike,
  ctx: BuildCtx,
): PiAgentConfig {
  const tools = upstream.tools && upstream.tools.length > 0 ? upstream.tools : DEFAULT_TOOLS;
  const model = resolveModel(upstream.model);

  return {
    frontmatter: {
      name: upstream.name,
      description: upstream.description ?? upstream.name,
      ...(model !== undefined ? { model } : {}),   // omit to inherit
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

Note that `buildAgentConfig` is now synchronous — the only async work was `ensureStubFile` for knowledge stubs, which is gone.

Deletions:
- `ensureStubFile` function and the two `await ensureStubFile(...)` calls for `<agent>-project.md` / `<agent>-general.md`.
- `domain:` block construction.
- `knowledge:` block construction.
- `role: "worker"` field.
- `PINNED_DEFAULT_MODEL` constant — no longer needed. pi-agents handles inheritance.
- Imports for `mkdir`, `writeFile`, `dirname`, `fileExists`.

The old `DEFAULT_TOOLS = ["read", "write", "edit", "bash", "grep", "glob"]` is wrong on two counts:
- `glob` is not a pi tool (not in `allToolNames`); it was carried over from Claude Code. Agents calling `glob` would hit "unknown tool" at runtime.
- Including `grep` puts pi-superpowers ahead of pi's own default active set, which surprises anyone who reads pi docs and then reads this.

The new `DEFAULT_TOOLS = ["read", "bash", "edit", "write"]` matches pi's active default verbatim. Superpowers agents that need `grep`/`find`/`ls` (e.g., code-reviewer for pattern search) declare them explicitly in their own upstream frontmatter.

The resulting file drops from ~108 LOC to ~55 LOC. Upstream agents declaring `model: inherit` or omitting model now actually inherit — previously pi-superpowers replaced those with a pinned fallback.

**2. Agent frontmatter extension — `src/subagents/frontmatter.ts`:**

Add optional `skills?: string[]` to `AgentFrontmatterLike`, parsed from upstream YAML. Used by name (e.g., `["brainstorming", "test-driven-development"]`). Unknown names produce a warning diagnostic from the caller but don't fail registration.

**3. Built-in agent — `src/subagents/builtin-agents.ts`:** no change. `general-purpose` continues to get all vendor skills (default behavior when `upstream.skills` is absent).

**4. Cleanup elsewhere:**

- `.gitignore` entry for `superpowers/` — pi-superpowers no longer creates per-agent `.md` stubs under `sessionDir/superpowers/`. The per-agent conversation logs are now owned by pi-agents and live under `sessionDir/agents/` (not `sessionDir/superpowers/`). Add `agents/` to `.gitignore`; the `superpowers/` line can be removed.
- `src/common/paths.ts` — no change; `vendorSkillsDir()` still relevant.
- `src/index.ts` — `buildAllAgentConfigs` may become synchronous; audit call sites and simplify.

**5. Tests:**

- `src/subagents/agent-config-builder.test.ts`:
  - Rewrite to match new minimal config shape.
  - Assert absolute paths in `skills`.
  - Assert `upstream.skills = ["brainstorming"]` narrows output to that one path.
  - Assert missing/empty `upstream.skills` defaults to all vendor skills.
  - Remove knowledge-stub creation tests.
  - Remove domain assertion tests.
- `src/subagents/frontmatter.test.ts` — add cases for parsing `skills: [name1, name2]` and for absence.

### Coordination

Because both repos are at v0.1.0 and unreleased, we can iterate without strict versioning discipline:

1. Land pi-agents changes on `main` (squash; admin bypass on branch protection if needed for the final push).
2. In pi-superpowers, bump lockfile to pick up new pi-agents HEAD: `npm install pi-agents@github:josorio7122/pi-agents`.
3. Land pi-superpowers changes.
4. Verify with `PI_BIN=$(which pi) npm run test:e2e` against pi-superpowers — a dispatched agent should receive XML skill manifest and be able to fetch bodies via `read`.

No tags yet. Tag both repos when the combined change has been exercised end-to-end.

## Risks and mitigations

**1. Model discipline on progressive disclosure.** A dispatched model might ignore the manifest and not `read` the skills it needs. For capable models this is unlikely — pi's main session works the same way today. For cheaper models, quality may degrade on tasks that would've benefited from inlined skills. Mitigation: the XML format is the exact standard pi uses for the main session; Superpowers' `using-superpowers` skill already trains the model to treat skill discovery as mandatory; same signal in both surfaces.

**2. Loss of voluntary sandbox.** Without `domain`, a misbehaving dispatched agent can `read`/`write`/`delete` anywhere the tool allows. Since pi-agents runs subagents in-process with the same tool capabilities, this was always a soft restriction — not a security boundary. If a real sandbox matters later, reintroduce it as a wrapper layer (e.g., a `scopedTools()` helper shipped separately) rather than in core pi-agents.

**3. Loss of per-agent knowledge files.** Agents that wrote to their knowledge files previously lose that feature. No shipped agent does — the files have always been empty stubs. If persistent per-agent memory becomes a real need, reintroduce it orthogonally.

**4. `includeDefaults: true` surfaces unintended skills.** A user with `~/.pi/agent/skills/my-private-skill/` would see it in every dispatched agent's manifest. This matches pi's main-session behavior exactly — user's global skills are intended to be available everywhere — so this is consistent, not a regression.

**5. Version skew.** Any pi-agents consumer with old agent files containing `domain:` or `knowledge:` will fail schema validation. Acceptable at v0.1.0 — nothing released publicly yet. pi-teams-catalog or other private consumers migrate in the same cycle.

## Success criteria

- pi-agents schema accepts the minimal frontmatter; rejects `domain`, `knowledge`, `role`, `reports`, `conversation` keys with a clear error.
- `src/domain/` directory deleted (13 files); `src/common/skills.ts` deleted; `src/invocation/tool-wrapper.ts` deleted; `src/schema/validation.ts` deleted.
- Automated grep sweep (see §Changes item 3) returns zero matches for domain, knowledge, role, reports, conversation-as-frontmatter, validateRoleTools, loadSkillContents, and related dead symbols.
- pi-agents `npm run check` passes; test count drops meaningfully (~20%+).
- Dispatched agent's system prompt contains `<skills>` XML (when skills present), not a `## Skills` or `## Knowledge Files` section. When `skills: []` (explicit opt-out), no skills section at all.
- With `skills` absent, dispatched agent inherits parent session's skill discovery (user's `~/.pi/agent/skills/`, etc.). With `skills` present, ONLY those paths surface.
- With `tools` absent, dispatched agent gets pi's active default (`read`, `bash`, `edit`, `write`).
- With `model` absent or `"inherit"`, dispatched agent runs on the parent session's current model.
- Input-token usage on a no-skill-needed dispatch drops by 25–30k.
- Agent still successfully uses skills when needed — evidenced by `read` tool-calls to `/abs/.../SKILL.md` paths during e2e.
- `docs/skills.md` documents progressive disclosure, override-or-inherit, and the `read`-tool requirement.
- `docs/agent-example.md` shows the minimal frontmatter with pi's default tools and a note about the skills dependency.
- Biome's `noUnusedImports` / `noUnusedVariables` produce zero warnings after the deletion sweep.

## References

- Agent Skills standard: https://agentskills.io/specification
- XML injection format: https://agentskills.io/integrate-skills
- pi docs: `node_modules/@mariozechner/pi-coding-agent/docs/skills.md`
- pi SDK skills module: `node_modules/@mariozechner/pi-coding-agent/dist/core/skills.d.ts`
- pi ResourceLoader: `node_modules/@mariozechner/pi-coding-agent/dist/core/resource-loader.d.ts`
- pi system-prompt composition: `node_modules/@mariozechner/pi-coding-agent/dist/core/system-prompt.js:20-37`
- Agent example shape (current, pre-change): `docs/agent-example.md`
