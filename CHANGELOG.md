# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project
adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-04-21

Initial release.

- `createAgentTool()` pi-compliant tool factory (via `defineTool` from `@mariozechner/pi-coding-agent`).
- Agent discovery from `.pi/agents/**/*.md`, frontmatter validation, domain/tools scoping.
- Session runner with conversation log, metrics, parallel/chain execution modes.
- TUI rendering (bordered box, conversation events, working dots).
- Typebox schemas (not zod): `AgentFrontmatterSchema` uses
  `Type.Union([Type.Literal(...)])` for the role enum; runtime validation
  in `src/schema/parse.ts`.
- `src/common/strings.ts` with `flatten(s)` helper for multi-line prompt
  templates.
- pi 0.68 compatibility: `createAgentSession.tools` is a `string[]`
  allowlist; domain-wrapped built-ins ship via `customTools`. Tool
  factories use `createReadToolDefinition` etc.
- Pi core dev-deps tracked as `"*"` (repo follows pi HEAD).
- Repo harness aligned with pi-tasks: strict `tsconfig.json` (NodeNext,
  `verbatimModuleSyntax`, `isolatedModules`, `noEmit`), full `biome.json`
  rule set, blank-line script, dedicated `vitest.e2e.config.ts` gated on
  `PI_E2E=1`, `simple-git-hooks` + `lint-staged` pre-commit, GitHub
  Actions `check` workflow, `dependabot.yml`, `CODEOWNERS`, issue
  templates, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`.
