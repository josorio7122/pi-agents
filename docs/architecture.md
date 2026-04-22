# Architecture

pi-agents is a Pi extension that turns `.md` files into composable AI agents with sandboxed tool access, self-updating knowledge, and multi-agent orchestration.

## Pipeline

Every agent invocation flows through four stages:

```
Discovery → Validation → Invocation → Rendering
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
| `frontmatter.ts` | The minimal agent schema (4 required: name, description, color, icon; 3 optional: model, tools, skills) |
| `validation.ts` | Frontmatter validation rules (e.g., read-tool requirement when skills are declared) |

### Invocation (`src/invocation/`)

Creates an SDK session, executes the agent, and tracks metrics.

| File | Purpose |
|------|---------|
| `session.ts` | Core orchestrator — builds prompt, creates tools, runs agent session |
| `session-helpers.ts` | `RunAgentParams`/`RunAgentResult` types + `extractAssistantOutput` |
| `metrics.ts` | Factory for tracking turns, tokens, cost, tool calls |

### Prompt (`src/prompt/`)

Assembles the system prompt from agent config + runtime context. Skills surface as an XML manifest via pi's `DefaultResourceLoader`; the agent fetches full bodies with `read` on demand. See [`docs/skills.md`](skills.md).

| File | Purpose |
|------|---------|
| `assembly.ts` | Combines body + shared context |
| `variables.ts` | `{{KEY}}` template substitution |

### Tool (`src/tool/`)

The `agent` tool definition — registered with Pi so the parent agent can delegate work.

| File | Purpose |
|------|---------|
| `agent-tool.ts` | Tool factory — parameter schema, render hooks, execute dispatch |
| `agent-tool-execute.ts` | Execution logic for single, parallel, and chain modes |
| `modes.ts` | Mode detection, validation, and orchestration (maxConcurrency limiter for parallel) |
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

1. Create `.pi/agents/<name>.md` with YAML frontmatter (schema: `src/schema/frontmatter.ts`)
2. Provide required fields: `name`, `description`, `color`, `icon`
3. Optionally override `model`, `tools`, or `skills` (see [`docs/agent-example.md`](agent-example.md))
4. Write the system prompt in the markdown body
5. The extension auto-discovers the file on session start

No code changes required. The frontmatter schema in `src/schema/frontmatter.ts` defines all valid configuration.

## Key Design Decisions

- **Functional core, impure shell** — domain logic is pure functions; I/O lives at the edges (session, conversation-log)
- **Zero classes** — factory functions with closures for stateful behavior
- **Zod at boundaries** — frontmatter and conversation entries validated at parse time
- **Domain checks at execution time** — not at tool creation time, so paths are resolved against the actual CWD
- **Abort signal propagation** — `RunAgentParams` accepts `signal?: AbortSignal`; session wires `signal.addEventListener('abort', () => session.abort())` for in-flight cancellation; parallel/chain loops check `signal.aborted` before dispatching new tasks
- **Knowledge tools are separate from generic write/edit** — prevents accidental writes outside knowledge scope
- **Truncation preserves head** — agent output capped at 2000 lines / 50KB before returning to parent context
