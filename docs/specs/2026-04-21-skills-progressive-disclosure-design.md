# Skills progressive disclosure — design

**Status:** approved for implementation
**Date:** 2026-04-21
**Target:** pi-agents v0.2.0 (breaking) + pi-superpowers follow-up

## Goal

Replace pi-agents' eager skill inlining with pi's native progressive-disclosure pattern. Each dispatched agent's system prompt surfaces only skill descriptions (as XML, per [agentskills.io](https://agentskills.io/specification)); full skill bodies load on demand via the agent's `read` tool.

## Motivation

Today `pi-agents/src/invocation/session.ts:42` calls `loadSkillContents(fm.skills)` unconditionally, and `src/prompt/assembly.ts:22-26` inlines every skill body into the dispatched agent's system prompt. pi-superpowers exploits this at `src/subagents/agent-config-builder.ts:84` to attach all 14 Superpowers skills to every dispatch, costing ~25–30k input tokens per invocation — regardless of whether the agent needs any of them.

pi itself already ships the right pattern. From `node_modules/@mariozechner/pi-coding-agent/docs/skills.md:64-71`:

> 1. At startup, pi scans skill locations and extracts names and descriptions
> 2. The system prompt includes available skills in XML format per the [specification](https://agentskills.io/integrate-skills)
> 3. When a task matches, the agent uses `read` to load the full SKILL.md
> 4. The agent follows the instructions, using relative paths to reference scripts and assets
>
> This is progressive disclosure: only descriptions are always in context, full instructions load on-demand.

pi exposes `loadSkills()`, `formatSkillsForPrompt()`, and a `ResourceLoader` interface with a `getSkills()` method. `createAgentSession` already consumes this — pi-agents is *already* passing a `resourceLoader` into it — but pi-agents currently provides an empty skill list and rolls its own inlining. Switching to the pi-native path removes code, cuts tokens, and aligns with the [Agent Skills standard](https://agentskills.io/specification) upstream skill authors target.

## Non-goals

- Changing what skills pi-superpowers ships or how it syncs from upstream.
- Adding a new tool (`load_skill`, etc.). The agent's existing `read` tool is sufficient.
- Altering knowledge, reports, domain, or any other frontmatter block.
- Changing how the main pi session discovers skills (already correct).

## Architecture

### Data flow (new)

```
vendor/superpowers/skills/<slug>/SKILL.md  ─┐
                                            │  pi's own loadSkills() scans + validates
pi-superpowers scanVendorSkills()           │  (agentskills.io spec)
  └─ returns absolute paths                 │
         │                                  ▼
         ▼                          ┌───────────────────┐
  pi-superpowers                    │  Skill[] objects  │
  agent-config-builder              │  (name, desc,     │
  assembles PiAgentConfig           │   filePath)       │
  with skills: string[]             └──┬────────────────┘
         │                              │ formatSkillsForPrompt(skills)
         ▼                              ▼
  pi-agents createAgentSession   ──►  XML block per spec:
  builds ResourceLoader                <skills><skill>...</skill></skills>
  with additionalSkillPaths              │
  and noSkills: true                     │  pi's buildSystemPrompt
         │                                │  appends XML AFTER customPrompt
         ▼                                ▼
  Dispatched agent's system prompt:
    [pi-agents' 7-block assembled prompt]
    [project context files]
    <skills>
      <skill><name>brainstorming</name><description>...</description><path>/abs/...</path></skill>
      ... (one per skill the agent is allowed)
    </skills>
    Current date: ...
    Current working directory: ...

  Agent reads manifest → uses `read` tool on demand → gets full body
```

### Validation path

`buildSystemPrompt` in pi (`dist/core/system-prompt.js:33`) only injects skills XML if:
```js
const customPromptHasRead = !selectedTools || selectedTools.includes("read");
if (customPromptHasRead && skills.length > 0) {
    prompt += formatSkillsForPrompt(skills);
}
```

This is a **hard constraint**: an agent that declares skills but lacks `read` silently loses them. pi-agents must validate this upfront and emit a clear error at `validateAgent` time.

## Changes

### pi-agents (breaking)

**1. Schema — `src/schema/frontmatter.ts`:**

Before:
```ts
const SkillSchema = Type.Object({
  path: Type.String({ minLength: 1 }),
  when: Type.String({ minLength: 1 }),
});
// ...
skills: Type.Array(SkillSchema, { minItems: 1 }),
```

After:
```ts
skills: Type.Array(
  Type.String({ pattern: "^/" }),   // absolute paths only
  { minItems: 0 }                    // empty list valid — an agent may use no skills
),
```

Rationale:
- **Absolute paths only.** Declared in schema so violations fail at `validateAgent`, not runtime. No hidden "resolved against what?" semantics.
- **`minItems: 0`.** Not every agent needs skills. Cheap classifier subagents should be able to declare none.
- **Drop `SkillSchema` object entirely.** `name` and `description` live in each skill's own SKILL.md frontmatter (single source of truth per agentskills.io spec). `when` disappears — the skill's own `description` plays that role.

**2. Cross-field validation — `src/schema/validation.ts`:**

Add a check: if `frontmatter.skills.length > 0` and `frontmatter.tools` does not include `"read"`, emit a validation error:
> Agent '<name>' declares skills but has no 'read' tool. pi requires the 'read' tool for skill body loading (progressive disclosure). Add 'read' to tools or remove skills.

**3. Session construction — `src/invocation/session.ts`:**

Before (conceptually):
```ts
const skillContents = await loadSkillContents(fm.skills);
const systemPrompt = assembleSystemPrompt({ agentConfig, sessionDir, skillContents });
const { session } = await createAgentSession({
  resourceLoader: /* minimal — getSkills returns [] */,
  // ...
});
```

After:
```ts
const systemPrompt = assembleSystemPrompt({ agentConfig, sessionDir });
  // ^ no skillContents param; pi handles skill injection downstream

const resourceLoader = new DefaultResourceLoader({
  cwd,
  agentDir: getAgentDir(),
  additionalSkillPaths: fm.skills,   // agent's curated absolute paths
  noSkills: true,                     // don't also scan default locations
  noExtensions: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  systemPrompt,                       // pi-agents' assembled 7-block prompt
});

const { session } = await createAgentSession({
  cwd, model, tools: activeToolNames, customTools: allCustomTools,
  sessionManager, settingsManager, modelRegistry,
  resourceLoader,
});
```

`DefaultResourceLoader` is exported from `@mariozechner/pi-coding-agent`. With `noSkills: true`, it ignores `~/.pi/agent/skills/`, `.pi/skills/`, package entries, and settings; it only loads the paths we explicitly list.

**4. Prompt assembly — `src/prompt/assembly.ts`:**

Remove:
- `renderSkillsSection` function (lines 22-26).
- `SKILLS_BLOCK` variable from the substitution map (line 57).
- `skillContents` from `AssemblyContext`.
- The `skills` slot in the return string (line 67).

The `## Skills` section goes away entirely. pi's `buildSystemPrompt` handles skill injection after the custom prompt, so we stop duplicating the surface.

**5. Delete `src/common/skills.ts`.** `loadSkillContents` has no remaining caller. Remove the export from `src/api.ts`.

**6. Documentation — `docs/architecture.md` + new `docs/skills.md`:**

Add a new `docs/skills.md` page describing:
- How pi-agents surfaces skills to dispatched agents (progressive disclosure via pi's native machinery).
- The `skills: [absolutePath, ...]` frontmatter shape.
- **The `read`-tool requirement** — called out explicitly, with the error message from validation step 2 quoted.
- Link to [agentskills.io/specification](https://agentskills.io/specification) as the source of truth for SKILL.md format.

Update `docs/architecture.md` to remove references to the deleted inlining code path and link to `docs/skills.md`.

**7. Example frontmatter — `docs/agent-example.md`:**

Update the `scout.md` example to:
- Use absolute paths (or a placeholder `/abs/path/to/...` so readers see the shape).
- Drop the `{path, when}` object form in favor of bare path strings.
- **Keep `read` explicitly in `tools:`** — the example currently has `tools: [read, grep, find, ls]`. Keep `read` first and add a brief inline comment noting it's required when `skills` is non-empty.
- Add a short paragraph below the example explaining that skill bodies are loaded on demand via `read`, not inlined.

**8. Tests:**

- `src/schema/frontmatter.test.ts` — new shape (`skills: string[]`); assert relative paths reject.
- `src/schema/validation.test.ts` — assert `skills > 0 && !tools.includes("read")` fails with the documented message.
- `src/invocation/session.test.ts` — assert `resourceLoader.getSkills()` returns the paths the agent declared and nothing else (via `noSkills: true`).
- `src/prompt/assembly.test.ts` — remove skill-content test cases; assert the assembled prompt no longer contains a `## Skills` heading.
- `src/prompt/assembly-context.test.ts` — drop `skillContents` from test fixture.
- Delete `src/common/skills.test.ts`.

### pi-superpowers (consumer update)

**1. Agent config builder — `src/subagents/agent-config-builder.ts`:**

Before:
```ts
skills: ctx.skills.map((s) => ({ path: s.path, when: s.description || "always" }))
```

After:
```ts
skills: resolveSkillsForAgent(upstream, ctx.skills)
// where:
function resolveSkillsForAgent(upstream: AgentFrontmatterLike, all: VendorSkill[]): string[] {
  // If upstream declares skills: in its own frontmatter, filter to that subset (by name).
  // Otherwise, default to all available skills.
  const declared = upstream.skills as readonly string[] | undefined;
  if (!declared || declared.length === 0) return all.map((s) => s.path);
  const byName = new Map(all.map((s) => [s.name, s.path]));
  return declared
    .map((name) => byName.get(name))
    .filter((p): p is string => p !== undefined);
}
```

Paths are already absolute — `scanVendorSkills` builds them via `join(skillsDir, entry, "SKILL.md")` where `skillsDir` resolves through `vendorSkillsDir()` which returns an absolute path.

**2. Agent frontmatter extension — `src/subagents/frontmatter.ts`:**

Extend `AgentFrontmatterLike` with an optional `skills?: string[]` field parsed from upstream agent YAML frontmatter (by skill name, e.g. `["brainstorming", "test-driven-development"]`). pi-superpowers resolves names → absolute paths at build time. Neither shipped agent (`code-reviewer`, `general-purpose`) uses this field today, so default behavior — all 14 skills — is preserved. Unknown names produce a warning diagnostic from `buildAllAgentConfigs` but do not fail registration.

**3. Domain extension — `src/subagents/agent-config-builder.ts`:**

pi-agents enforces domain ACLs on `read`. Vendor skill paths live under `node_modules/pi-superpowers/vendor/...`, outside the default `domain: [{path: ".", ...}]`. Extend the domain per dispatched agent to include the vendor skills dir as read-only:

```ts
domain: [
  { path: ".", read: true, write: true, delete: false },
  { path: vendorSkillsDir(), read: true, write: false, delete: false },
],
```

Without this, the agent would see the skill manifest but domain-check failures would block every `read` call.

**4. Built-in agent — `src/subagents/builtin-agents.ts`:

No change required. `general-purpose` gets all 14 skills by default (the current behavior). If we later decide it should have fewer, add a `skills: [...]` to its definition here.

**5. Tests:**

- `src/subagents/agent-config-builder.test.ts` — assert produced `skills: string[]` are absolute paths; assert `upstream.skills = ["brainstorming"]` narrows to just that path; assert missing `upstream.skills` defaults to all; assert domain includes the vendor skills dir as read-only.
- `src/subagents/frontmatter.test.ts` — assert `skills: [brainstorming, test-driven-development]` parses into a string array; assert omitting the field yields `undefined`.

### Coordination

pi-agents must tag `v0.2.0` before pi-superpowers picks it up, so pi-superpowers can bump its lockfile deliberately. Procedure:

1. Land pi-agents changes on `main`; tag `v0.2.0`; push.
2. In pi-superpowers: `npm install pi-agents@github:josorio7122/pi-agents#v0.2.0` to bump lockfile.
3. Land pi-superpowers changes.
4. Verify e2e with a real pi binary: `PI_BIN=$(which pi) npm run test:e2e` — a dispatched agent should receive XML skill manifest and be able to fetch bodies via `read`.

## Risks and mitigations

**1. Model discipline.** A dispatched model might ignore the manifest and not `read` the skills it needs. For capable models (Sonnet/Opus class) this is unlikely — pi's main-session behavior is the control case, and it works. For cheaper models there's a quality risk. Mitigation: the XML format pi uses is the exact one the Agent Skills spec prescribes; upstream Superpowers' `using-superpowers` skill already trains the model to treat skill discovery as mandatory. The model sees the same signal it sees in the main pi session.

**2. `noSkills: true` also skips `/skill:name` registration.** pi registers `/skill:<name>` slash commands from loaded skills. In a dispatched sub-session those commands aren't user-facing (the agent doesn't have a `/` interactive surface), so this is moot — but worth noting so we don't reintroduce `includeDefaults: true` by mistake.

**3. Version skew.** If someone runs pi-superpowers against an unpinned pi-agents that hasn't shipped this change, they'll see schema validation failures ("skills must be string, not object"). The coordinated tag order above avoids this.

**4. Relative paths in hand-authored agent files.** `scanVendorSkills` already emits absolute paths, so this isn't a real risk for pi-superpowers. But hand-authored agent files outside our control with relative skill paths will now be rejected at schema validation. Acceptable — the alternative (guessing what relative means) is worse.

## Success criteria

- Dispatched agent's system prompt contains `<skills>` XML block, not `## Skills\n\n### brainstorming (...)\n\n<full body>...`.
- Input-token usage on a no-skill-needed dispatch drops by 25–30k.
- Agent still successfully uses skills when needed — evidenced by `read` tool-calls to `/abs/.../SKILL.md` paths during a dispatch that requires skill guidance.
- `docs/skills.md` exists in pi-agents; `docs/agent-example.md` shows the new shape with `read` in `tools`.
- pi-agents `npm run check` passes; pi-superpowers `npm run check` passes after lockfile bump.

## References

- Agent Skills standard: https://agentskills.io/specification
- XML injection format: https://agentskills.io/integrate-skills
- pi docs: `node_modules/@mariozechner/pi-coding-agent/docs/skills.md`
- pi SDK skills module: `node_modules/@mariozechner/pi-coding-agent/dist/core/skills.d.ts`
- pi ResourceLoader: `node_modules/@mariozechner/pi-coding-agent/dist/core/resource-loader.d.ts`
- pi system-prompt composition: `node_modules/@mariozechner/pi-coding-agent/dist/core/system-prompt.js:20-37`
