# Skills

pi-agents delegates skill loading to pi's native progressive-disclosure system. Skills are not eagerly inlined into the dispatched agent's system prompt — only a manifest (name + description + path) is surfaced, and the agent fetches full bodies with its own `read` tool on demand.

## Frontmatter

```yaml
skills:
  - /abs/path/to/skill-a/SKILL.md
  - /abs/path/to/skill-b/SKILL.md
```

All paths must be absolute (`/...`). Relative paths are rejected at schema validation.

The field is **optional** with override-or-inherit semantics:

- **Absent** — the dispatched agent inherits pi's default skill discovery (user's `~/.pi/agent/skills/`, project `.pi/skills/`, `package.json` `pi.skills` entries, settings, etc.).
- **Present, non-empty** — the agent sees ONLY those paths. pi's default discovery is skipped for this dispatch.
- **Present, empty (`skills: []`)** — explicit opt-out. The agent gets no skills at all.

## The `read`-tool requirement

The agent must have `read` in its `tools:` list (or omit `tools:` to inherit pi's default `["read", "bash", "edit", "write"]`, which includes `read`). If skills are declared and `read` is not in the effective tool list, `validateFrontmatter` produces:

> Agent '<name>' declares skills but has no 'read' tool. pi requires the 'read' tool for skill body loading (progressive disclosure). Add 'read' to tools or remove skills.

## How pi composes the system prompt

pi-agents supplies the agent's assembled system prompt to pi via `DefaultResourceLoader(systemPrompt, ...)`. pi's `buildSystemPrompt` (in `@mariozechner/pi-coding-agent`) then composes:

```
[pi-agents' assembled prompt]
[pi's append-system-prompt, if any]
[project context files, if any]
<skills>
  <skill>
    <name>skill-name</name>
    <description>skill description</description>
    <path>/abs/path/to/SKILL.md</path>
  </skill>
  ...
</skills>
Current date: YYYY-MM-DD
Current working directory: /path/to/cwd
```

See:

- https://agentskills.io/specification — SKILL.md format (source of truth).
- https://agentskills.io/integrate-skills — XML injection format used by pi.
- `node_modules/@mariozechner/pi-coding-agent/docs/skills.md` — pi's skill documentation.

## Example

An agent that gets exactly two skills, overriding the user's global discovery:

```yaml
---
name: reviewer
description: Reviews code against standards.
color: "#f5a623"
icon: 🔍
skills:
  - /usr/local/share/pi-teams/skills/code-style/SKILL.md
  - /usr/local/share/pi-teams/skills/test-coverage/SKILL.md
---
You are a code reviewer.
```

Tools default to pi's set (`read`, `bash`, `edit`, `write`). `read` covers the skill-loading requirement.

An agent that inherits everything the user has configured globally:

```yaml
---
name: helper
description: General-purpose helper.
color: "#36f9f6"
icon: 🛠
---
You are a helper.
```

No `skills:` → inherits. No `tools:` → pi's default. No `model:` → inherits parent session's current model.
