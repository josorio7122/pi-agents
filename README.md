# pi-agents

Agent layer specification for [pi](https://github.com/badlogic/pi-mono) — composable AI agents with progressive skill disclosure.

## What This Is

A minimal, opinionated way to define agents as `.md` files with YAML frontmatter. pi-agents delegates skill loading to pi's native [Agent Skills spec](https://agentskills.io/specification) implementation — the dispatched agent's system prompt carries a compact `<skills>` XML manifest, and the agent reads full skill bodies on demand via its `read` tool (progressive disclosure).

Minimal frontmatter: 4 required fields + 3 optional. No filesystem ACL, no per-agent knowledge subsystem, no hand-rolled conversation log — pi does the heavy lifting.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/agent-example.md](docs/agent-example.md) | Annotated agent examples — minimal and with explicit overrides — plus pi tool reference |
| [docs/skills.md](docs/skills.md) | Skill loading: progressive disclosure, override-or-inherit semantics, the `read`-tool requirement |
| [docs/architecture.md](docs/architecture.md) | Architecture — pipeline stages, file map, design decisions |

## Development

```bash
npm test              # unit tests
npm run check         # lint + blank-line check + typecheck + tests
```

### Visual TUI Testing

Simulate agent rendering with ANSI colors and streaming metric updates:

```bash
npx tsx scripts/simulate-ui.ts          # all scenarios
npx tsx scripts/simulate-ui.ts single   # single agent with live metrics
npx tsx scripts/simulate-ui.ts parallel # 4 agents running concurrently
npx tsx scripts/simulate-ui.ts chain    # 3-step sequential pipeline
npx tsx scripts/simulate-ui.ts error    # parallel with one failure
```

## Quick Start

An agent is a single `.md` file with YAML frontmatter:

```yaml
---
name: scout
description: Fast codebase recon — reads files, finds patterns, returns structured findings.
color: "#36f9f6"
icon: 🔍
---
You are a scout. Your job is to read files and report findings.
```

That's a complete, valid agent. It runs on the parent pi session's current model (no `model:` → inherit), gets pi's default tool set `["read", "bash", "edit", "write"]` (no `tools:` → default), and inherits pi's configured skill locations (no `skills:` → inherit).

For explicit overrides:

```yaml
---
name: reviewer
description: Reviews code against standards.
model: anthropic/claude-sonnet-4-6
color: "#f5a623"
icon: 🔬
tools:
  - read
  - bash
  - grep
skills:
  - /abs/path/to/skills/code-style/SKILL.md
  - /abs/path/to/skills/test-coverage/SKILL.md
---
You are a code reviewer.
```

`skills:` paths are absolute; when present, pi surfaces ONLY those skills to the agent (not the user's global ones). `read` is required in `tools:` whenever `skills:` is declared — pi-agents validates this at load time.

pi-agents ships two built-in agents — `general-purpose` and `explore` — that are always available without any `.pi/agents/` setup. User or project agents with the same `name` override the built-in by name.

See [docs/agent-example.md](docs/agent-example.md) for the full field reference and [docs/skills.md](docs/skills.md) for skill authoring.
