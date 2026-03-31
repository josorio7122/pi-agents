# Implementation Plan — Overview

## Build Order (Bottom-Up)

Each part is a self-contained unit with its own tests. Later parts depend on earlier parts. Each part is a separate branch, tested, and merged before starting the next.

**Functional patterns throughout:** No classes. Pure functions as the default. Factory functions with closures for stateful behavior. All types are `Readonly`. I/O pushed to the edges (sandwich architecture). See `AGENTS.md` for the full rules.

```
Part 1: Project Scaffolding
   └── tsconfig, biome, vitest, deps, pi package structure

Part 2: Frontmatter Schema & Parsing
   └── Zod schemas for all 7 blocks, .md parser, validation

Part 3: Agent Discovery
   └── Scan directories, parse agents, validate, bootstrap knowledge files

Part 4: Prompt Assembly
   └── Read skills, knowledge, conversation log → resolve {{VARIABLES}} → produce system prompt

Part 5: Domain-Scoped Tools
   └── Wrap Pi tool factories with domain permission checks

Part 6: Agent Invocation (SDK)
   └── createAgentSession per agent, event tracking, conversation log writes

Part 7: Agent Tool Registration
   └── Register "agent" tool — single, parallel, chain modes

Part 8: /agents Command & Rendering
   └── /agents command, renderCall, renderResult (thinking... → output + stats)

Part 9: Extension Entry Point + Test Harness
   └── Wire everything, scripts/test-agent.ts, gated integration tests
```

## Dependency Graph

```
Part 1 ─── scaffolding (no deps)
  │
Part 2 ─── schema + parsing (no runtime deps)
  │
Part 3 ─── discovery (depends on Part 2)
  │
Part 4 ─── prompt assembly (depends on Part 2)
  │
Part 5 ─── domain tools (depends on Part 2)
  │
Part 6 ─── invocation (depends on Part 2, 4, 5)
  │
Part 7 ─── agent tool (depends on Part 3, 6)
  │
Part 8 ─── command + rendering (depends on Part 3)
  │
Part 9 ─── entry point (depends on all)
```

## File Structure (Target)

```
pi-agents/
├── AGENTS.md
├── README.md
├── package.json
├── tsconfig.json
├── biome.json
├── scripts/
│   └── test-agent.ts              # Dev tool: test an agent .md via SDK
├── docs/
│   ├── agent-spec.md
│   ├── extension-design.md
│   ├── reference.md
│   └── plan/
│       ├── 00-overview.md          # This file
│       ├── 01-scaffolding.md
│       ├── 02-schema.md
│       ├── 03-discovery.md
│       ├── 04-prompt-assembly.md
│       ├── 05-domain-tools.md
│       ├── 06-invocation.md
│       ├── 07-agent-tool.md
│       ├── 08-command-rendering.md
│       ├── 09-entry-point.md
│       └── 10-gaps-and-fixes.md    # Review findings — all fixes applied to parts above
└── src/
    ├── index.ts                    # Extension entry point (thin glue)
    ├── index.test.ts               # Smoke tests with faux provider
    │
    ├── schema/                     # Zod schemas + types (pure, no I/O)
    │   ├── frontmatter.ts          # Zod schemas for all 7 blocks + AgentFrontmatter type
    │   ├── frontmatter.test.ts
    │   ├── validation.ts           # Cross-field: validateRoleTools(role, tools)
    │   ├── validation.test.ts
    │   ├── conversation.ts         # Conversation log entry schema
    │   └── conversation.test.ts
    │
    ├── common/                     # Cross-cutting pure utilities
    │   ├── paths.ts                # expandPath("~/...") → absolute path
    │   ├── paths.test.ts
    │   ├── model.ts                # parseModelId("anthropic/claude-sonnet-4-6") → {provider, modelId}
    │   └── model.test.ts
    │
    ├── discovery/                  # Find + validate agent .md files (I/O at edges)
    │   ├── parser.ts               # Parse .md string → { frontmatter, body }
    │   ├── parser.test.ts
    │   ├── scanner.ts              # Scan directories → file paths
    │   ├── scanner.test.ts
    │   ├── validator.ts            # Zod + role-tool validation → AgentConfig | errors
    │   ├── validator.test.ts
    │   ├── bootstrap.ts            # Create empty knowledge files if missing
    │   └── bootstrap.test.ts
    │
    ├── prompt/                     # System prompt assembly (pure core)
    │   ├── assembly.ts             # AssemblyContext → system prompt string
    │   ├── assembly.test.ts
    │   ├── variables.ts            # Resolve {{VARIABLES}} in template strings
    │   └── variables.test.ts
    │
    ├── domain/                     # File-system boundary enforcement
    │   ├── checker.ts              # checkDomain(path, operation, rules) → allowed?
    │   ├── checker.test.ts
    │   ├── scoped-tools.ts         # Wrap Pi tool factories with domain checks
    │   └── scoped-tools.test.ts
    │
    ├── invocation/                 # SDK session management (the impure shell)
    │   ├── session.ts              # runAgent() → createAgentSession + prompt + dispose
    │   ├── session.test.ts         # Uses faux provider
    │   ├── metrics.ts              # Event → metrics accumulator (factory + closure)
    │   ├── metrics.test.ts
    │   ├── conversation-log.ts     # Append-only JSONL: ensureExists, append, read
    │   └── conversation-log.test.ts
    │
    ├── tool/                       # The "agent" tool the LLM calls
    │   ├── agent-tool.ts           # Tool definition: params, execute, renderCall, renderResult
    │   ├── agent-tool.test.ts
    │   ├── modes.ts                # executeSingle, executeParallel, executeChain
    │   ├── modes.test.ts           # Uses injectable RunAgentFn (no LLM)
    │   ├── render.ts               # renderCall + renderResult (Pi TUI components)
    │   └── format.ts               # Pure: formatTokens, formatUsageStats, formatToolCall
    │
    └── command/                    # /agents slash command
        ├── agents-command.ts       # Register command, format agent list
        └── agents-command.test.ts
```
