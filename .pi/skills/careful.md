---
name: careful
description: Safety guardrails for destructive commands. Warns before rm -rf, DROP TABLE, force-push, git reset --hard, kubectl delete, and similar destructive operations. Use when touching prod, debugging live systems, or working in a shared environment. Use when asked to "be careful", "safety mode", "prod mode", or "careful mode".
---

# Destructive Command Guardrails

Before running any bash command, check it against the patterns below. If a match is found, warn the user and explain the risk before proceeding.

## Protected Patterns

| Pattern | Example | Risk |
|---------|---------|------|
| `rm -rf` / `rm -r` / `rm --recursive` | `rm -rf /var/data` | Recursive delete |
| `DROP TABLE` / `DROP DATABASE` | `DROP TABLE users;` | Data loss |
| `TRUNCATE` | `TRUNCATE orders;` | Data loss |
| `git push --force` / `-f` | `git push -f origin main` | History rewrite |
| `git reset --hard` | `git reset --hard HEAD~3` | Uncommitted work loss |
| `git checkout .` / `git restore .` | `git checkout .` | Uncommitted work loss |
| `kubectl delete` | `kubectl delete pod` | Production impact |
| `docker rm -f` / `docker system prune` | `docker system prune -a` | Container/image loss |

## Safe Exceptions

These patterns are allowed without warning:
- `rm -rf node_modules` / `.next` / `dist` / `__pycache__` / `.cache` / `build` / `.turbo` / `coverage`

## Rules

1. **NEVER** run a destructive command without warning the user first
2. Check EVERY bash command against the patterns above before executing — including piped commands, subshells, and `bash -c` strings
3. If a match is found, state the specific risk and ask the user before proceeding
4. If the user confirms, proceed — never block indefinitely
5. Safe exceptions bypass the warning
