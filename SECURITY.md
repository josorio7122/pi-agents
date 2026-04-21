# Security Policy

## Supported versions

Only the latest minor version is supported. Security fixes are released as patch versions against that line.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

Please report security issues privately via GitHub's security advisory feature:

[Report a vulnerability →](https://github.com/josorio7122/pi-agents/security/advisories/new)

You can also email: josorio7122@gmail.com

I'll acknowledge within 72 hours and provide a fix timeline within 7 days. Do not open a public issue for security reports.

## Scope

In scope:
- The agent-discovery pipeline (`src/discovery/`) — anything a malformed `.pi/agents/**/*.md` can trigger.
- The agent-execution session runner (`src/invocation/`) — domain-scoping, tool-wrapper boundary, conversation log.
- The tool factory (`src/tool/agent-tool.ts`) and public API (`src/api.ts`).

Out of scope:
- Vulnerabilities in pi's own runtime (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`) — report upstream at [pi-mono](https://github.com/badlogic/pi-mono).
- Vulnerabilities in the underlying LLM provider (Anthropic, OpenAI, etc.) — report to them directly.
- Dependency vulnerabilities in typebox / pi-tui without a pi-agents-specific attack vector — covered by upstream.
