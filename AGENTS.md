# Agent Instructions

Rules for AI agents (and humans) editing this repo. Short and enforced — read before writing code.

## Package manager

Use **npm**: `npm install`, `npm test`, `npm run check`.

## File-scoped commands

| Task | Command |
|------|---------|
| Typecheck | `npx tsc --noEmit` |
| Lint | `npx biome check path/to/file.ts` |
| Lint fix | `npx biome check --fix path/to/file.ts` |
| Test file | `npx vitest run path/to/file.test.ts` |
| Test watch | `npx vitest path/to/file.test.ts` |
| Blank-line check | `bash scripts/check-blank-lines.sh` |
| All checks | `npm run check` |
| E2E (gated) | `npm run test:e2e` — sets `PI_E2E=1`, uses `vitest.e2e.config.ts` |

## Strings

The rule targets *literal* string assembly, not variable concatenation.

- **Never build a string by joining string literals with `+`.** If the output is a single string written across multiple lines in source, use a template literal. Concrete BAD example:
  ```ts
  const desc = "Line one. " +
               "Line two. " +
               "Line three.";
  ```
  Instead:
  ```ts
  const desc = flatten(`
    Line one.
    Line two.
    Line three.
  `);
  ```
  where `flatten = s => s.replace(/\s+/g, " ").trim()`. (Helper lives at `src/common/strings.ts` after Task 8.)
- **Never build a string by pushing literals into an array and `.join()`-ing it.** Same anti-pattern, different syntax.
- **`a + b` with variables is fine.** Simple variable concat like `pad + line` or `prefix + suffix` reads clearly.
- **`.join()` is fine when the array IS the domain type** — e.g. rendered lines passed into pi-tui, or a list of agent outputs. Joining for display at a boundary is OK.

## Pi compliance (non-negotiable)

- **Never shadow pi's types.** Import `Theme`, `ThemeColor`, `ToolDefinition`, `ExtensionContext`, `AgentToolResult`, `ExtensionAPI` directly from `@mariozechner/pi-coding-agent`. Do not redeclare them with our own names.
- **No raw ANSI escapes (`\x1b[...]`) in production code.** Use `theme.fg(slot, text)`, `theme.strikethrough(text)`, `theme.bold(text)`.
- **Canonical `ThemeColor` slots only:** `accent`, `muted`, `dim`, `text`, `success`, `error`, `warning`. Don't invent new slot names.
- **Peer deps for pi core packages use `"*"`** per pi's `docs/packages.md`. Never pin them in `peerDependencies` OR `devDependencies`. `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox` are `"*"` in both so the repo always tracks pi HEAD. If pi ships a breaking change, update `src/` in the same PR that bumps the lockfile — don't pin around it.

## TypeScript

- **No classes.** Factory functions + closures for stateful behavior. Exception: pi-tui's own components (`Container`, `Text`, `BorderedBox`) are instantiated via `new` at the rendering boundary; we don't extend them.
- **Typebox for schemas** (not zod). Pi bundles typebox as a core peer package. Use `Type.Object({...})`, `Type.String()`, etc. from `@sinclair/typebox`. String enums have two forms:
  - **Locally validated** (e.g. `AgentFrontmatterSchema` against `Value.Check`): `Type.Union([Type.Literal("a"), Type.Literal("b")])`. `StringEnum` from `@mariozechner/pi-ai` crashes `Value.Check` because it wraps `Type.Unsafe` and lacks the `[Kind]` symbol.
  - **Tool parameter schemas sent to LLMs** (via `defineTool`): `StringEnum([...] as const)` from `@mariozechner/pi-ai` — Google's API rejects `anyOf`/`const`, so `Type.Union` of `Type.Literal` doesn't work there.

  Runtime validation goes through the `safeParse` helper at `src/schema/parse.ts`.
- **No `any`**, **no non-null assertions (`!`)**, **no barrel files except `src/api.ts`**. Enforced by biome.
- **No nested ternaries.** Enforced by biome (`noNestedTernary: "error"`). Use early returns or a helper function.
- **Max 2 params per function.** Use an options object for anything longer. Enforced by biome (`useMaxParams`).
- **Blank line between consecutive multi-line blocks at the same scope.** Enforced via `scripts/check-blank-lines.sh`, wired into `npm run check` as `lint:blanks`.
- **File size target: < 200 LOC.** Split by responsibility when exceeded.
- **ESM-only.** `.js` extensions on relative imports. `verbatimModuleSyntax` is on — use `import type` / `export type` for type-only specifiers.

## Functional programming (core value)

pi-agents is a pure library at its core. Mutation is confined to the edges (IO with pi, streaming tool events, file-system reads).

- **Prefer `const`.** `let` is discouraged in `src/` production modules. IO-boundary code MAY use `let` when bridging a stream or Node API that can't be expressed functionally (e.g. accumulating stdout chunks in an event handler, accumulating `output` text in `runAgent`).
- **No mutation of inputs.** Every function that takes a collection must return a NEW collection. Never `.push`/`.pop`/`.shift`/`.unshift`/`.splice`/`.sort`/`.reverse` on arrays passed in. Use spread + immutable helpers.
- **Inputs and exports are `readonly` where it matters.** `readonly T[]` / `ReadonlyArray<T>` / `Readonly<T>` on public types. Internal intermediates may be `T[]` if constructed fresh.
- **No imperative loops for value construction.** Don't write `for (let i = 0; i < n; i++) arr.push(x)`. Use `.map` / `Array.from({length: n}, …)` / recursion.
  - `for...of` for side effects (e.g. streaming events to a UI) is OK.
  - `for...of` to build a new collection by pushing is NOT — use `.map`/`.flatMap`.
- **Sandwich architecture.** Pure core (schema, validator, prompt assembly) wrapped by thin IO shell (`invocation/session.ts` execute, `discovery/scanner.ts`, scripts). Push side effects to the edges.
- **Idempotent pure functions.** Same args → same return value, every time. Inject `now` / clock / randomness as explicit parameters.

## Tests

- **Co-locate:** `foo.ts` → `foo.test.ts`.
- **E2E tests use the `-e2e.test.ts` suffix** and are gated on `PI_E2E=1`. Default `npm test` and CI exclude them via `vitest.config.ts`. The dedicated lane uses `vitest.e2e.config.ts`.
- **Prefer `vi.spyOn` over `vi.mock`** — `vi.mock` is last resort.
- **Prefer fakes and real objects over mocks.** Never mock what you own — >2 mocks means refactor first.
- `npm run check` before commit; `npm run test:e2e` requires `PI_E2E=1` and a live model API key.

## Git

- **Conventional commits:** `type(scope): description`. Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `ci`, `style`.
- **No `Co-Authored-By` trailers.** No AI attribution.
- **Breaking changes use `!`:** `feat(api)!: rename createAgentTool config`.
- **Branch protection is on `main`** — CI (`check`) must pass before merge. PRs squash-merge only.

## Conventions

- Colocate tests: `foo.ts` → `foo.test.ts` in the same directory.
- Feature folders: `src/discovery/`, `src/invocation/`, `src/tool/`, `src/domain/`, `src/prompt/`, `src/schema/`, `src/tui/`, `src/common/`.
- Export only what other modules consume via `src/api.ts`.
- After refactors — grep for orphaned types/interfaces/consts.
- **Keep docs current** — when adding, removing, or changing files, APIs, or behavior, update relevant docs (`README.md`, `docs/`, JSDoc, AGENTS.md, CHANGELOG).

## When in doubt

See `CONTRIBUTING.md` for the human-facing version. When the two disagree, `AGENTS.md` wins.
