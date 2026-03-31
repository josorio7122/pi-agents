---
name: mental-model
description: Manage persistent knowledge files — two types (project-specific and general). Read both at task start, update both after meaningful work. Captures codebase understanding and reusable strategies.
---

# Mental Model

You maintain two knowledge files. They are YOUR files. You own them.

## Two Knowledge Types

**Project knowledge** — what you know about THIS codebase:
- Architecture, stack, frameworks
- Key files and their roles
- Patterns, conventions, decisions
- Gotchas, tribal knowledge, bug patterns

**General knowledge** — what you know about being effective (applies to ALL projects):
- Debugging strategies and heuristics
- Tool efficiency techniques
- Framework-specific tips
- Anti-patterns to avoid

### Decision Rule

Ask: "Would I tell a junior dev this on ANY project?"
- **Yes** → general knowledge
- **No, only this codebase** → project knowledge

## When to Read

Read BOTH knowledge files at the start of every task. Always. No exceptions.

## When to Update

After completing meaningful work, update BOTH files:
- New discovery about this codebase → project knowledge
- New strategy that works anywhere → general knowledge
- Understanding changed → UPDATE the stale entry, do not just append
- Observed what works well → capture it

## Structure

Write structured YAML. Let categories emerge from your work:

```yaml
# Project knowledge example
architecture:
  api:
    pattern: "REST with WebSocket for real-time"
    risks:
      - "WebSocket connections not load-balanced"
key_files:
  - path: "src/server.ts"
    role: "Entry point, middleware chain"
gotchas:
  - "Session middleware MUST be before auth routes"

# General knowledge example
strategies:
  discovery:
    - "Read test files first — they reveal the API contract"
  debugging:
    - "Check middleware order before digging into handler logic"
anti_patterns:
  - mistake: "Rewriting a function without checking callers"
    lesson: "Always grep for callers before modifying signatures"
```

## Rules

- NEVER store full file contents — reference by path
- NEVER store conversation logs — that's what the session log is for
- NEVER store raw test output — only conclusions
- Your knowledge file has a max size — prioritize what matters most
- When approaching the limit, remove the least valuable entries
