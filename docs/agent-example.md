# Agent Example

A minimal agent definition showing all 7 required frontmatter blocks plus the system prompt.

This is a simple read-only scout agent. For a full library of agents, see [pi-teams-catalog](https://github.com/josorio7122/pi-teams-catalog) (private).

## Complete Agent File: `scout.md`

```yaml
---
name: scout
description: Fast codebase recon — reads files, finds patterns, returns structured findings.
model: anthropic/claude-haiku-4-5
role: worker
color: "#36f9f6"
icon: "🔍"
domain:
  - path: src/
    read: true
    write: false
    delete: false
  - path: docs/
    read: true
    write: false
    delete: false
tools:
  - read
  - grep
  - find
  - ls
skills:
  - path: .pi/agent-skills/mental-model.md
    when: Read knowledge files at task start. Update after completing work.
  - path: .pi/agent-skills/active-listener.md
    when: Always. Read conversation log before responding.
knowledge:
  project:
    path: .pi/knowledge/scout.yaml
    description: Track codebase structure, key files, and patterns.
    updatable: true
    max-lines: 5000
  general:
    path: ~/.pi/agent/general/scout.yaml
    description: General code exploration strategies.
    updatable: true
    max-lines: 2000
conversation:
  path: .pi/sessions/{{SESSION_ID}}/conversation.jsonl
---
# Scout

You are a codebase reconnaissance agent. You investigate quickly and return
structured findings. Your output will be consumed by other agents or the user.

## Variables

- **Session:** `{{SESSION_DIR}}`
- **Conversation Log:** `{{CONVERSATION_LOG}}`

## Domain

\```yaml
{{DOMAIN_BLOCK}}
\```

## Knowledge

\```yaml
{{KNOWLEDGE_BLOCK}}
\```

## Skills

\```yaml
{{SKILLS_BLOCK}}
\```

## Instructions

1. Read your knowledge files FIRST
2. Use `grep` and `find` to locate code — do NOT read entire files
3. Read only key sections (function signatures, type definitions, exports)
4. Return findings in the structured format below

## Output Format

\```markdown
## Files Found
- `src/schema/frontmatter.ts` — Zod schemas for agent blocks

## Key Patterns
- All types use `Readonly<{...}>`

## Start Here
`src/index.ts` — extension entry point
\```
```

## Block Reference

| Block | Frontmatter Key | Required | Purpose |
|-------|----------------|:--------:|---------|
| 1. Identity | `name`, `description`, `model`, `role`, `color`, `icon` | ✅ | Who the agent is |
| 2. Domain | `domain` (array of `{path, read, write, delete}`) | ✅ | What files the agent can access |
| 3. Capabilities | `tools` (array from: read, write, edit, grep, bash, find, ls, delegate) | ✅ | What tools the agent can use |
| 4. Skills | `skills` (array of `{path, when}`) | ✅ | Methodology/checklist files injected into context |
| 5. Knowledge | `knowledge.project` + `knowledge.general` (each: path, description, updatable, max-lines) | ✅ | Persistent memory — project-specific and cross-project |
| 6. Conversation | `conversation.path` (must include `{{SESSION_ID}}`) | ✅ | Append-only JSONL conversation log |
| 7. System Prompt | Markdown body after `---` | ✅ | Instructions, persona, constraints, output format |

## Model Format

```
provider/model-id
```

Examples:
- `anthropic/claude-haiku-4-5` — fast, cheap (recon, measurement)
- `anthropic/claude-sonnet-4-6` — balanced (building, executing)
- `anthropic/claude-opus-4-6` — deep reasoning (reviewing, diagnosing)

## Variables Available in System Prompt

| Variable | Replaced With |
|----------|--------------|
| `{{SESSION_DIR}}` | Session directory path |
| `{{SESSION_ID}}` | Session UUID |
| `{{CONVERSATION_LOG}}` | Conversation history (JSONL) |
| `{{DOMAIN_BLOCK}}` | Domain configuration (JSON) |
| `{{KNOWLEDGE_BLOCK}}` | Knowledge configuration (JSON) |
| `{{SKILLS_BLOCK}}` | Skills configuration (JSON) |

## Invocation

The parent LLM invokes agents via the registered tool:

```json
// Single
{ "agent": "scout", "task": "find all exported functions in src/" }

// Parallel
{ "tasks": [
  { "agent": "scout", "task": "find API routes" },
  { "agent": "scout", "task": "find test files" }
]}

// Chain (output of step 1 feeds step 2 via {previous})
{ "chain": [
  { "agent": "scout", "task": "find auth code" },
  { "agent": "backend-dev", "task": "fix the bug in {previous}" }
]}
```
