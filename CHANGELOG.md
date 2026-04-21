# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Repo tooling aligned with pi-tasks: stricter `tsconfig.json` (NodeNext,
  verbatimModuleSyntax, isolatedModules, noEmit), blank-line check script
  wired into `npm run check`, peer-dependency layout for pi core packages.
- Migrated schemas from zod to `@sinclair/typebox` (pi's core schema
  library). `AgentFrontmatterSchema` uses `Type.Union([Type.Literal(...)])`
  for the role enum (locally validated via `Value.Check`; `StringEnum` is
  reserved for tool-parameter schemas sent to LLMs). Runtime validation
  lives in `src/schema/parse.ts`.
- Tool wrappers document `ExecutableTool` as a deliberate 4-arg adapter
  over pi's `AgentTool` type; `RenderTheme` tightened to
  `Pick<Theme, "fg" | "bold">` so the structural-subset relationship is
  explicit.
- `assembleSystemPrompt` rewritten as template-literal section
  composition; no more `let prompt += ...` accumulation.
- LLM-dependent knowledge test moved to `-e2e.test.ts` suffix, gated on
  `PI_E2E=1`, and run via a dedicated `vitest.e2e.config.ts`.

### Removed
- `zod` dependency.

### Added
- `src/common/strings.ts` with `flatten(s)` helper for multi-line prompt
  templates.
- GitHub Actions `check` workflow.
- `simple-git-hooks` + `lint-staged` pre-commit biome fix.
- OSS community files: `LICENSE`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `CONTRIBUTING.md`.

## [1.0.0]

Initial release.

- `createAgentTool()` pi-compliant tool factory (via `defineTool` from `@mariozechner/pi-coding-agent`).
- Agent discovery from `.pi/agents/**/*.md`, frontmatter validation, domain/tools scoping.
- Session runner with conversation log, metrics, parallel/chain execution modes.
- TUI rendering (bordered box, conversation events, working dots).
