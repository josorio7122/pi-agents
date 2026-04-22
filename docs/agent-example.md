# Agent Example

A minimal agent definition showing the required fields plus optional ones. For richer scenarios, see [`docs/skills.md`](skills.md) for skill authoring and https://agentskills.io/specification for the SKILL.md format.

## Minimal agent file: `scout.md`

```yaml
---
name: scout
description: Fast codebase recon — reads files, finds patterns, returns structured findings.
color: "#36f9f6"
icon: 🔍
---
You are a scout. Your job is to read files and report findings.
```

Everything else is optional. This agent:

- Runs on whatever model is active in the parent pi session (no `model:` → inherit).
- Uses pi's active default tool set: `read`, `bash`, `edit`, `write` (no `tools:` → default).
- Inherits pi's skill discovery from the user's own configured locations (no `skills:` → inherit).

## Fuller example with explicit overrides

```yaml
---
name: scout-plus
description: Scout with grep, pinned to Haiku for speed, and curated skills.
model: anthropic/claude-haiku-4-5
color: "#36f9f6"
icon: 🔍
tools:
  - read
  - bash
  - grep
  - find
  - ls
skills:
  - /abs/path/to/skills/pattern-matching/SKILL.md
  - /abs/path/to/skills/structured-output/SKILL.md
---
You are a scout. Your job is to read files and report findings.
Prefer grep over bash for pattern search.
```

This agent:

- Pins to `anthropic/claude-haiku-4-5` (overrides inheritance).
- Declares its own tool list (note `read` must be included when `skills` is declared).
- Sees ONLY the two listed skill files — user's global skills are not surfaced.

## pi tool reference

pi's full tool universe (from `@mariozechner/pi-coding-agent dist/core/tools/index.js`):

| Tool | Purpose |
|------|---------|
| `read` | Read a file — **required** when `skills` is declared. |
| `bash` | Run shell commands. |
| `edit` | Modify a file. |
| `write` | Create or overwrite a file. |
| `grep` | Content search (ripgrep-backed). |
| `find` | Pattern-based file search. |
| `ls` | Directory listing. |

When `tools:` is omitted, the agent receives pi's active default set: `["read", "bash", "edit", "write"]`.

## Schema reference

See [`src/schema/frontmatter.ts`](../src/schema/frontmatter.ts) for the authoritative schema. Required: `name`, `description`, `color`, `icon`. Optional: `model`, `tools`, `skills`.
