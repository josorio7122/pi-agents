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
│       └── 09-entry-point.md
└── src/
    ├── index.ts                    # Extension entry point
    ├── schema/
    │   ├── frontmatter.ts          # Zod schemas for all 7 blocks
    │   ├── frontmatter.test.ts
    │   ├── conversation.ts         # Conversation log entry schema
    │   └── conversation.test.ts
    ├── discovery/
    │   ├── parser.ts               # Parse .md → frontmatter + body
    │   ├── parser.test.ts
    │   ├── scanner.ts              # Scan directories for agent .md files
    │   ├── scanner.test.ts
    │   ├── validator.ts            # Validate 7 blocks + role-tool alignment
    │   ├── validator.test.ts
    │   ├── bootstrap.ts            # Create empty knowledge files
    │   └── bootstrap.test.ts
    ├── prompt/
    │   ├── assembly.ts             # Assemble system prompt from all blocks
    │   ├── assembly.test.ts
    │   ├── variables.ts            # Resolve {{VARIABLES}}
    │   └── variables.test.ts
    ├── domain/
    │   ├── checker.ts              # Domain permission checks
    │   ├── checker.test.ts
    │   ├── scoped-tools.ts         # Wrap Pi tools with domain checks
    │   └── scoped-tools.test.ts
    ├── invocation/
    │   ├── session.ts              # createAgentSession wrapper
    │   ├── session.test.ts
    │   ├── metrics.ts              # Token/cost/turn tracking
    │   ├── metrics.test.ts
    │   ├── conversation-log.ts     # Append-only log management
    │   └── conversation-log.test.ts
    ├── tool/
    │   ├── agent-tool.ts           # "agent" tool definition + execute
    │   ├── agent-tool.test.ts
    │   ├── modes.ts                # Single, parallel, chain execution
    │   └── modes.test.ts
    └── ui/
        ├── agents-command.ts       # /agents command
        ├── agents-command.test.ts
        ├── render-call.ts          # renderCall for agent tool
        ├── render-result.ts        # renderResult (thinking → output)
        └── format.ts               # Usage stats formatting helpers
```
