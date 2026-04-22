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

After (5 required + 1 optional):
```yaml
name: ...           # Identity (unchanged)
description: ...
model: ...
role: worker|lead|orchestrator
color: "#..."
icon: "..."
tools: [...]        # Capabilities (unchanged)
skills:             # RESHAPED: bare absolute paths, minItems: 0
  - /abs/path/to/skill-a/SKILL.md
  - /abs/path/to/skill-b/SKILL.md
reports: ...        # Optional — unchanged
conversation:       # Unchanged
  path: ...
```

Domain and knowledge are gone. Skills is a `string[]` of absolute paths.

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
  // Identity
  name: Type.String({ minLength: 1 }),
  description: Type.String({ minLength: 1 }),
  model: Type.String({ pattern: "^.+/.+$" }),
  role: Type.Union([Type.Literal("worker"), Type.Literal("lead"), Type.Literal("orchestrator")]),
  color: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  icon: Type.String({ minLength: 1 }),
  // Capabilities
  tools: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  skills: Type.Array(Type.String({ pattern: "^/" }), { minItems: 0 }),
  // Reports (optional — agents that produce report artifacts)
  reports: Type.Optional(Type.Object({
    path: Type.String({ minLength: 1 }),
    updatable: Type.Boolean(),
  })),
  // Conversation log
  conversation: Type.Object({
    path: Type.String({ pattern: ".*\\{\\{SESSION_ID\\}\\}.*" }),
  }),
});
```

Rationale:
- Skills are absolute paths (enforced at schema level — no hidden "resolved against what?" semantics).
- `minItems: 0` — not every agent needs skills.
- `domain` and `knowledge` keys removed entirely. An agent file containing either produces a validation error ("unknown key").

**2. Cross-field validation — `src/schema/validation.ts`:**

Remove all domain-related validation. Add one new check: if `skills.length > 0 && !tools.includes("read")`, emit:
> Agent '<name>' declares skills but has no 'read' tool. pi requires the 'read' tool for skill body loading (progressive disclosure). Add 'read' to tools or remove skills.

**3. Delete domain subsystem:**

Remove entirely:
- `src/domain/` — `checker.ts`, `scoped-tools.ts`, `types.ts`, all tests.
- All imports of `DomainEntry`, `checkDomain`, `createScoped*Tool` from `src/invocation/`, `src/tool/`, `src/api.ts`.
- Any domain-wrapping logic in `src/invocation/session.ts` — tools pass through unwrapped.

**4. Delete knowledge subsystem touches:**

- Remove `renderKnowledgeSection` from `src/prompt/assembly.ts`.
- Remove `KNOWLEDGE_BLOCK` variable substitution.
- Remove `knowledge` references from `src/schema/validation.ts` cross-field checks.

**5. Simplify session construction — `src/invocation/session.ts`:**

Replace the existing minimal `resourceLoader` object literal with `DefaultResourceLoader`:

```ts
import { DefaultResourceLoader, getAgentDir } from "@mariozechner/pi-coding-agent";

// ...
const resourceLoader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
  additionalSkillPaths: [...fm.skills],   // agent's curated paths
  // includeDefaults: true is the default — parent's skill locations ALSO scanned
  noExtensions: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  systemPrompt: assembledSystemPrompt,
});

const { session } = await createAgentSession({
  cwd, model, tools: activeToolNames, customTools: allCustomTools,
  sessionManager, settingsManager, modelRegistry,
  resourceLoader,
});
```

Remove the `loadSkillContents(fm.skills)` call. pi handles skill loading from here.

**6. Delete `src/common/skills.ts`.** `loadSkillContents` has no remaining caller. Remove the export from `src/api.ts`.

**7. Prompt assembly — `src/prompt/assembly.ts`:**

Remove:
- `renderSkillsSection` function.
- `renderKnowledgeSection` function.
- `KNOWLEDGE_BLOCK`, `SKILLS_BLOCK`, `DOMAIN_BLOCK` variable substitutions.
- `skillContents` from `AssemblyContext`.

Keep:
- `renderSharedContextSection`, `renderReportsSection` (still relevant).
- `resolveVariables` (for `SESSION_ID` etc. in agent prompts).

The assembled system prompt gets shorter — pi's `buildSystemPrompt` adds skills XML and project context on top.

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
  - Add a "Skills" section pointing to `docs/skills.md`.
  - Update the 7-block references throughout to match the new minimal frontmatter.

- **Update `docs/agent-example.md`:**
  - Strip `domain:` and `knowledge:` blocks from the `scout.md` example.
  - Change `skills:` to bare absolute paths; show at least two entries demonstrating the shape.
  - **Keep `read` explicitly in `tools:`** — the example already has `tools: [read, grep, find, ls]`. Keep it; add a short sentence below the example noting `read` is required whenever `skills` is non-empty.
  - Include a "Basic pi tools" note listing the standard set (`read`, `write`, `edit`, `bash`, `grep`, `glob`, `find`, `ls`) so readers have a reference point.

**9. Tests:**

- `src/schema/frontmatter.test.ts` — rewrite fixtures to minimal shape; assert `domain` and `knowledge` keys are rejected; assert `skills: string[]` with relative paths rejected; assert `minItems: 0` for skills; assert `reports` stays optional.
- `src/schema/validation.test.ts` — remove domain/knowledge validation tests; add "skills require read tool" test.
- `src/prompt/assembly.test.ts` and `assembly-context.test.ts` — remove `skillContents` and knowledge-section tests; assert assembled prompt no longer contains `## Skills` or `## Knowledge Files`.
- `src/invocation/session.test.ts` — assert the resourceLoader passed to `createAgentSession` is a `DefaultResourceLoader` with `additionalSkillPaths` matching `fm.skills`; assert `includeDefaults` is truthy (so parent defaults flow through).
- **Delete entirely:** `src/domain/*.test.ts`, `src/common/skills.test.ts`.

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
    model: string;
    role: "worker" | "lead" | "orchestrator";
    color: string;
    icon: string;
    tools: string[];
    skills: string[];     // absolute paths
    conversation: { path: string };
  };
  systemPrompt: string;
  filePath: string;
  source: "project" | "user";
};

const DEFAULT_TOOLS = ["read", "write", "edit", "bash", "grep", "glob"];
const PINNED_DEFAULT_MODEL = "openai-codex/gpt-5.4";
const MODEL_FORMAT = /^.+\/.+$/;

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

// resolveModel unchanged from current code.

export async function buildAgentConfig(
  upstream: AgentFrontmatterLike,
  ctx: BuildCtx,
): Promise<PiAgentConfig> {
  const superpowersDir = join(ctx.sessionDir, "superpowers");
  const tools = upstream.tools && upstream.tools.length > 0 ? upstream.tools : DEFAULT_TOOLS;
  const model = resolveModel(upstream.model);

  return {
    frontmatter: {
      name: upstream.name,
      description: upstream.description ?? upstream.name,
      model,
      role: "worker",
      color: "#f5a623",
      icon: "🦸",
      tools,
      skills: resolveSkillsForAgent(upstream, ctx.skills),
      conversation: {
        path: join(superpowersDir, `${upstream.name}-{{SESSION_ID}}.jsonl`),
      },
    },
    systemPrompt: upstream.body,
    filePath: `vendor/superpowers/agents/${upstream.name}.md`,
    source: "user",
  };
}
```

Deletions:
- `ensureStubFile` function and the two `await ensureStubFile(...)` calls for `<agent>-project.md` / `<agent>-general.md`.
- `domain:` block construction.
- `knowledge:` block construction.
- Imports for `mkdir`, `writeFile`, `dirname`, `fileExists`.

The resulting file drops from ~108 LOC to ~60 LOC.

**2. Agent frontmatter extension — `src/subagents/frontmatter.ts`:**

Add optional `skills?: string[]` to `AgentFrontmatterLike`, parsed from upstream YAML. Used by name (e.g., `["brainstorming", "test-driven-development"]`). Unknown names produce a warning diagnostic from the caller but don't fail registration.

**3. Built-in agent — `src/subagents/builtin-agents.ts`:** no change. `general-purpose` continues to get all vendor skills (default behavior when `upstream.skills` is absent).

**4. Cleanup elsewhere:**

- `.gitignore` entry for `superpowers/` can be narrowed — conversation logs still live under `sessionDir/superpowers/<agent>-<session>.jsonl`, so the entry is still needed. No change.
- `src/common/paths.ts` — no change; `vendorSkillsDir()` still relevant.

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

- pi-agents schema accepts the minimal frontmatter; rejects `domain`/`knowledge` keys with a clear error.
- `src/domain/` directory deleted; `src/common/skills.ts` deleted; LOC count visibly smaller.
- pi-agents `npm run check` passes; test count drops meaningfully as domain + knowledge tests disappear.
- Dispatched agent's system prompt contains `<skills>` XML, not a `## Skills` or `## Knowledge Files` section.
- Input-token usage on a no-skill-needed dispatch drops by 25–30k.
- Agent still successfully uses skills when needed — evidenced by `read` tool-calls to `/abs/.../SKILL.md` paths during e2e.
- `docs/skills.md` documents the flow and the `read`-tool requirement.
- `docs/agent-example.md` shows the minimal frontmatter with `read` in `tools:` and a note about the skills dependency.

## References

- Agent Skills standard: https://agentskills.io/specification
- XML injection format: https://agentskills.io/integrate-skills
- pi docs: `node_modules/@mariozechner/pi-coding-agent/docs/skills.md`
- pi SDK skills module: `node_modules/@mariozechner/pi-coding-agent/dist/core/skills.d.ts`
- pi ResourceLoader: `node_modules/@mariozechner/pi-coding-agent/dist/core/resource-loader.d.ts`
- pi system-prompt composition: `node_modules/@mariozechner/pi-coding-agent/dist/core/system-prompt.js:20-37`
- Agent example shape (current, pre-change): `docs/agent-example.md`
