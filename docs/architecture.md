# Architecture

pi-agents is a Pi extension that turns `.md` files into composable AI agents with sandboxed tool access, self-updating knowledge, and multi-agent orchestration.

## Pipeline

Every agent invocation flows through five stages:

```
Discovery → Validation → Domain → Invocation → Rendering
```

### Discovery (`src/discovery/`)

Scans `.pi/agents/` (project) and `~/.pi/agents/` (user) for `.md` files. Each file is parsed into YAML frontmatter + markdown body.

| File | Purpose |
|------|---------|
| `scanner.ts` | Finds `.md` files in agent directories |
| `parser.ts` | Splits frontmatter from body, validates structure |
| `validator.ts` | Zod validation + cross-field checks (role-tool constraints) |

### Schema (`src/schema/`)

Zod schemas define the contract for agent configuration and runtime data.

| File | Purpose |
|------|---------|
| `frontmatter.ts` | The 7-block agent schema (identity, domain, tools, skills, knowledge, reports, conversation) |
| `conversation.ts` | JSONL conversation log entry schema |
| `validation.ts` | Role-tool cross-validation rules |

### Domain (`src/domain/`)

Enforces what each agent can read, write, and delete. Path-based ACL resolved at tool execution time.

| File | Purpose |
|------|---------|
| `checker.ts` | Longest-prefix domain matching — checks if a path is allowed |
| `scoped-tools.ts` | Builds full domain by merging explicit domain + knowledge paths + report paths |
| `knowledge-tools.ts` | `write-knowledge` / `edit-knowledge` — dedicated tools for updatable knowledge files |
| `max-lines.ts` | Enforces max-lines on knowledge files after every write |

**Enforcement table:**

| Tool | Knowledge path | Non-knowledge path |
|------|---------------|-------------------|
| `write` | ❌ Blocked | ✅ If in domain |
| `edit` | ❌ Blocked | ✅ If in domain |
| `write-knowledge` | ✅ + max-lines | ❌ Blocked |
| `edit-knowledge` | ✅ + max-lines | ❌ Blocked |

### Invocation (`src/invocation/`)

Creates an SDK session, executes the agent, and tracks metrics.

| File | Purpose |
|------|---------|
| `session.ts` | Core orchestrator — builds prompt, creates tools, runs agent session |
| `session-helpers.ts` | `RunAgentParams`/`RunAgentResult` types + `extractAssistantOutput` |
| `tool-wrapper.ts` | Wraps SDK tools with domain checks and knowledge guards |
| `metrics.ts` | Factory for tracking turns, tokens, cost, tool calls |
| `conversation-log.ts` | JSONL append log for inter-agent conversation history |

### Prompt (`src/prompt/`)

Assembles the system prompt from agent config + runtime context.

| File | Purpose |
|------|---------|
| `assembly.ts` | Combines body + skills + knowledge + shared context + reports |
| `variables.ts` | `{{KEY}}` template substitution |

### Tool (`src/tool/`)

The `agent` tool definition — registered with Pi so the parent agent can delegate work.

| File | Purpose |
|------|---------|
| `agent-tool.ts` | Tool factory — parameter schema, render hooks, execute dispatch |
| `agent-tool-execute.ts` | Execution logic for single, parallel, and chain modes |
| `modes.ts` | Mode detection, validation, and orchestration (Promise.race for parallel) |
| `render.ts` | TUI components for agent call/result cards with live metrics |
| `format.ts` | Token/cost/tool-call formatting utilities |
| `prompt-guidelines.ts` | Generates prompt guidelines listing available agents |
| `truncate.ts` | Caps agent output before returning to parent context |

### Common (`src/common/`)

Shared utilities with no domain knowledge.

| File | Purpose |
|------|---------|
| `color.ts` | Hex color → ANSI escape |
| `context-files.ts` | Discovers `AGENTS.md` files walking up the directory tree |
| `fs.ts` | Safe file reading (returns empty string on error) |
| `model.ts` | Parses `provider/model-id` format |
| `paths.ts` | `~/` expansion, conversation path templates |
| `throttle.ts` | UI update throttle factory (80ms interval) |

### Entry Point

| File | Purpose |
|------|---------|
| `index.ts` | Pi extension entry — discovers agents, registers `agent` tool + `/agents` command |
| `api.ts` | Curated public API surface for external consumers |

### Command (`src/command/`)

| File | Purpose |
|------|---------|
| `agents-command.ts` | Formats the `/agents` CLI command output listing all discovered agents |

## Adding an Agent

1. Create `.pi/agents/<name>.md` with YAML frontmatter (see [agent-spec.md](agent-spec.md))
2. Define domain paths, tools, and knowledge entries
3. Write the system prompt in the markdown body
4. The extension auto-discovers the file on session start

No code changes required. The frontmatter schema in `src/schema/frontmatter.ts` defines all valid configuration.

## Key Design Decisions

- **Functional core, impure shell** — domain logic is pure functions; I/O lives at the edges (session, conversation-log)
- **Zero classes** — factory functions with closures for stateful behavior
- **Zod at boundaries** — frontmatter and conversation entries validated at parse time
- **Domain checks at execution time** — not at tool creation time, so paths are resolved against the actual CWD
- **Knowledge tools are separate from generic write/edit** — prevents accidental writes outside knowledge scope
- **Truncation preserves head** — agent output capped at 2000 lines / 50KB before returning to parent context
