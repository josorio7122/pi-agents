# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project
adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-04-22

Initial release.

- `createAgentTool()` pi-compliant tool factory (via `defineTool` from
  `@mariozechner/pi-coding-agent`). Exposes single / parallel / chain
  (with `{previous}` substitution) dispatch modes.
- Agent discovery from `.pi/agents/**/*.md` with minimal frontmatter
  validation. Required fields: `name`, `description`, `color`, `icon`.
  Optional: `model` (with `"inherit"` sentinel — falls back to the
  parent session's current model), `tools` (with pi's active default
  `["read", "bash", "edit", "write"]` when absent), `skills` (absolute
  paths; absent inherits pi's default discovery, present overrides).
- Skills use pi's native progressive disclosure: skill bodies are NOT
  inlined in the dispatched agent's system prompt — pi's
  `DefaultResourceLoader` injects a `<skills>` XML manifest per the
  [agentskills.io spec](https://agentskills.io/integrate-skills) and
  the agent fetches full bodies with its `read` tool on demand. See
  [`docs/skills.md`](docs/skills.md).
- Session runner (`runAgent`) uses `DefaultResourceLoader` +
  `createAgentSession`; metrics, streaming, and abort signal handling.
- TUI rendering (bordered box, conversation events, working dots).
- Typebox schemas (not zod). Runtime validation via `safeParse` in
  `src/schema/parse.ts`; schema enforces `additionalProperties: false`
  so legacy keys (`domain`, `knowledge`, `role`, `reports`,
  `conversation`) are rejected with a clear error.
- Built-in tool factories: `createReadToolDefinition`,
  `createBashToolDefinition`, `createEditToolDefinition`,
  `createWriteToolDefinition`, `createGrepToolDefinition`,
  `createFindToolDefinition`, `createLsToolDefinition` — exposed via
  pi's allowlist mechanism (`createAgentSession.tools: string[]`).
- Pi core dev-deps tracked as `"*"` (repo follows pi HEAD).
- Repo harness aligned with pi-tasks: strict `tsconfig.json` (NodeNext,
  `verbatimModuleSyntax`, `isolatedModules`, `noEmit`), full `biome.json`
  rule set, blank-line check script, dedicated `vitest.e2e.config.ts`
  gated on `PI_E2E=1`, `simple-git-hooks` + `lint-staged` pre-commit,
  GitHub Actions `check` workflow, `dependabot.yml`, `CODEOWNERS`, issue
  templates, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`.
