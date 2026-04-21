# Contributing to pi-agents

Thanks for considering a contribution! This project is small and opinionated — please follow the conventions below.

## Development setup

```bash
git clone https://github.com/josorio7122/pi-agents
cd pi-agents
npm install
npm run check          # lint + blank-line check + typecheck + unit tests
```

## Running end-to-end tests

E2E tests hit a real LLM via `@mariozechner/pi-coding-agent`. They're gated on `PI_E2E=1`, so `npm run check` skips them by default.

```bash
export PI_E2E=1
# Plus whatever auth the model needs — see pi-coding-agent docs.
npm run test:e2e
```

## Code style

- **Pi compliance is non-negotiable.** Never shadow pi's `Theme`, `ThemeColor`, `ToolDefinition`, `ExtensionContext`, or `AgentToolResult` types. Import directly from `@mariozechner/pi-coding-agent`.
- **No raw ANSI escapes** in production code. Use pi's `theme.fg(slot, text)` / `theme.strikethrough(text)` / etc.
- **Strings: don't assemble literal text with `+` or array-then-`.join()`.** Multi-line prose uses a template literal + `.replace(/\s+/g, " ").trim()` at load time (see `src/common/strings.ts` and its `flatten` helper). Simple variable concat (`pad + line`) is fine — the rule is about building one string from multiple string *literals*.
- **Typebox for schemas**, not zod. Pi bundles typebox as a core peer package. For string enums, use `Type.Union([Type.Literal(...)])` for local validation (`Value.Check`) and `StringEnum` from `@mariozechner/pi-ai` for tool-parameter schemas sent to LLMs.
- **Biome enforces:** no `any`, no non-null assertions (`!`), no barrel files (except `api.ts`), max 2 params per function, 120-char lines.
- **File size:** aim for < 200 LOC per file. Split by responsibility when exceeded.
- **Tests colocate:** `foo.ts` → `foo.test.ts`. E2E tests use the `-e2e.test.ts` suffix.

## Commit messages

- Format: `type(scope): description` — conventional commits. Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `ci`, `style`.
- **No `Co-Authored-By` trailers** — especially no AI attribution.
- Breaking changes use `!`: `feat(api)!: rename createAgentTool config`.

## Pull requests

- Branch off `main`. Name: `feature/<short-name>`, `fix/<short-name>`.
- Open a PR early if the change is non-trivial — discuss approach before you invest hours.
- CI (`npm run check`) must pass before merge. Review is required for non-trivial changes.

## What belongs in pi-agents

- Agent discovery + frontmatter schema.
- Session runner, domain scoping, tool wrapping, conversation log.
- TUI rendering for agent conversations and status.
- Public `createAgentTool()` factory consumed by pi-teams and other pi-packages.

## What does NOT belong

- Domain-specific agents themselves — those live in separate pi-packages or private catalogs.
- Integrations with specific LLM providers — pi-coding-agent handles that.
- Changes to pi-core types or contracts (upstream to pi-mono).

## Reporting issues

Use the GitHub issue tracker. For security issues, see [SECURITY.md](SECURITY.md).
