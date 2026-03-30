# pi-agents

Agent layer specification for [pi](https://github.com/badlogic/pi-mono) — composable, self-enhancing AI agents.

## What This Is

A specification for how agents are defined, how they enhance themselves, and how they compose into teams. An agent is a `.md` file with YAML frontmatter (configuration) and a markdown body (system prompt). Every agent has 7 required blocks.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/agent-spec.md](docs/agent-spec.md) | Complete agent specification — the 7 required blocks, frontmatter schema, knowledge system, conversation log |
| [docs/extension-design.md](docs/extension-design.md) | Extension design — discovery, invocation, SDK usage, rendering, architecture |
| [docs/reference.md](docs/reference.md) | Technical reference — reverse-engineered from IndyDevDan's multi-team system |

## Quick Start

An agent is a single `.md` file:

```yaml
---
name: backend-dev
description: Builds APIs, databases, and infrastructure.
model: claude-sonnet-4-6
role: worker
color: "#36f9f6"
icon: "🟢"

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
  - path: .pi/skills/mental-model.md
    when: Read at task start. Update knowledge after completing work.
  - path: .pi/skills/active-listener.md
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
