# pi-agents

Agent layer specification for [pi](https://github.com/badlogic/pi-mono) — composable, self-enhancing AI agents.

## What This Is

A specification for how agents are defined, how they enhance themselves, and how they compose into teams. An agent is a `.md` file with YAML frontmatter (configuration) and a markdown body (system prompt). Every agent has 7 required blocks.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/agent-spec.md](docs/agent-spec.md) | Complete agent specification — the 7 required blocks, frontmatter schema, knowledge system, conversation log |
| [docs/agent-example.md](docs/agent-example.md) | Annotated agent example with block reference, model format, variables, and invocation modes |
| [docs/extension-design.md](docs/extension-design.md) | Extension design — discovery, invocation, SDK usage, rendering, architecture |
| [docs/reference.md](docs/reference.md) | Technical reference — reverse-engineered from IndyDevDan's multi-team system |

## Development

### Testing

```bash
npm test              # Run unit tests
npm run check         # Biome lint + TypeScript + tests
```

### Visual TUI Testing

Simulate real agent rendering with ANSI colors and streaming metric updates:

```bash
npx tsx scripts/simulate-ui.ts          # All scenarios
npx tsx scripts/simulate-ui.ts single   # Single agent with live metrics
npx tsx scripts/simulate-ui.ts parallel # 4 agents running concurrently
npx tsx scripts/simulate-ui.ts chain    # 3-step sequential pipeline
npx tsx scripts/simulate-ui.ts error    # Parallel with one failure
```

The script exercises `renderCall` + `renderResult` with realistic data and timing — cards appear as `⏳`, metrics stream live, then flip to `✓`/`✗` on completion.

### Smoke Tests

Manual end-to-end test playbook requiring a running `pia` session:

```bash
cat docs/smoke-tests.yml   # 8 scenarios: single, parallel, chain, TDD, domain enforcement, etc.
```

## Quick Start

An agent is a single `.md` file:

```yaml
---
name: backend-dev
description: Builds APIs, databases, and infrastructure.
model: anthropic/claude-sonnet-4-6
role: worker
color: "#36f9f6"
icon: "💻"

domain:
  - path: apps/backend/
    read: true
    write: true
    delete: true

tools:
  - read
  - write
  - edit
  - grep
  - bash
  - find
  - ls

skills:
  - path: .pi/agent-skills/mental-model.md
    when: Read at task start. Update knowledge after completing work.
  - path: .pi/agent-skills/active-listener.md
    when: Always. Read conversation log before every response.

knowledge:
  project:
    path: .pi/knowledge/backend-dev.yaml
    description: Architecture and patterns for this codebase.
    updatable: true
    max-lines: 10000
  general:
    path: ~/.pi/agent/general/backend-dev.yaml
    description: General backend development strategies.
    updatable: true
    max-lines: 5000

conversation:
  path: .pi/sessions/{{SESSION_ID}}/conversation.jsonl
---
# Backend Developer

You build APIs, databases, and infrastructure...
```
