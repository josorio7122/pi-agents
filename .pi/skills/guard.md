---
name: guard
description: Full safety mode — destructive command warnings plus strict domain enforcement. Combines careful (warns before rm -rf, DROP TABLE, force-push) with explicit scope restriction. Use for maximum safety when touching prod or debugging live systems. Use when asked to "guard mode", "full safety", "lock it down", or "maximum safety".
---

# Full Safety Mode

Two protections active simultaneously:

## 1. Destructive Command Warnings

Apply ALL rules from the careful skill. Check every bash command — including pipes, subshells, and `bash -c` strings — against destructive patterns before executing.

## 2. Strict Domain Enforcement

Before ANY file operation:

1. Check the target path against your domain configuration
2. If outside your domain — STOP and tell the user: "This path is outside my domain. I cannot modify it."
3. **NEVER** attempt workarounds (symlinks, bash redirection, indirect writes)

## Rules

1. **NEVER** run a destructive command without warning the user first
2. **NEVER** write outside your domain — no exceptions, no workarounds
3. When in doubt, ask the user — never proceed silently
4. State what you blocked and why in every response where a block occurred
