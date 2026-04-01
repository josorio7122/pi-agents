---
name: guard
description: Full safety mode — destructive command warnings plus strict domain enforcement. Combines careful (warns before rm -rf, DROP TABLE, force-push) with explicit scope restriction. Use for maximum safety when touching prod or debugging live systems. Use when asked to "guard mode", "full safety", "lock it down", or "maximum safety".
---

# Full Safety Mode

Two protections active simultaneously:

## 1. Destructive Command Warnings

Before running any bash command, check against the careful skill's protected patterns (rm -rf, DROP TABLE, force-push, git reset --hard, kubectl delete, docker prune, etc.). Warn the user and explain the risk before proceeding.

## 2. Strict Domain Enforcement

Only read, write, or edit files within your assigned domain paths. Before ANY file operation:

1. Check the target path against your domain configuration
2. If outside your domain — STOP and tell the user: "This path is outside my domain. I cannot modify it."
3. Never attempt workarounds (symlinks, bash redirection, etc.)

## Rules

1. Check EVERY bash command against destructive patterns before executing
2. Check EVERY file operation against your domain before executing
3. When in doubt, ask the user — never proceed silently
4. If the user asks you to operate outside your domain, explain the restriction
5. Log what you blocked and why in your response
