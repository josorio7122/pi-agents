# Part 8: /agents Command & Rendering

## Goal
Register the `/agents` command. Implement `renderCall` and `renderResult` for the agent tool — inline in the tool output area, matching the video's clean style.

## Dependencies
- Part 3 (discovery — agent configs for `/agents` command)
- Part 7 (agent tool — rendering hooks)

## Files

### `src/command/agents-command.ts`
Register `/agents` command. Display agent list.

### `src/command/agents-command.test.ts`
Test command output format.

### `src/tool/render.ts`
`renderCall` + `renderResult` for the agent tool. Lives in `tool/` because it's part of the tool definition — not standalone UI.

### `src/tool/format.ts`
Pure formatting helpers: usage stats, tool call display, token formatting. Extracted from render.ts for testability.

### `src/tool/format.test.ts`
Test formatting functions (pure — no TUI dependencies).

## Design

### `/agents` Command

```typescript
function registerAgentsCommand(params: {
  pi: ExtensionAPI;
  agents: readonly AgentConfig[];
}): void
```

Output format:
```
 🔵  orchestrator     Coordinates the full team
 🟡  eng-lead         Translates requirements to plans
 💻  backend-dev      APIs, databases, infrastructure
```

Uses `ctx.ui.notify()` with the formatted list. Agent name padded and rendered in its `color` via `theme.fg()`.

### `renderCall` — Agent Header

Shown when the LLM calls the tool:

**Single mode:**
```
 💻  backend-dev (claude-sonnet-4-6)
```

**Parallel mode:**
```
 ● agent parallel (2 tasks)
   💻 backend-dev
   🔵 frontend-dev
```

**Chain mode:**
```
 ● agent chain (3 steps)
   1. 💻 backend-dev
   2. 🟡 eng-lead
   3. 🟠 qa-engineer
```

### `renderResult` — Execution Status

**While running (`isPartial: true`):**
```
thinking...
```

Simple dim text. No streaming, no tool traces. Matches the video exactly.

**Completed — collapsed (default):**
```
                                                        ↑45k ↓3.2k $0.034
Implemented ComplementNB classifier. Created cnb_classifier.py
with 4 passing tests.
```

First line: usage stats (right-aligned via theme). Below: the agent's output text.
If tool calls were made, add a hint:

```
4 tool calls (Ctrl+O to expand)
```

**Completed — expanded (Ctrl+O):**
```
                                               3 turns ↑45k ↓3.2k $0.034
─── Task ───
Implement ComplementNB in classifier.py
─── Tools (4 calls) ───
→ grep /ComplementNB/ in apps/
→ read apps/backend/classifier.py
→ write apps/backend/cnb_classifier.py (87 lines)
→ $ python -m pytest tests/test_cnb.py
─── Output ───
Implemented ComplementNB classifier. Created cnb_classifier.py
with 4 passing tests.
```

Uses Pi's `Container`, `Text`, `Spacer`, `Markdown` components.

**Parallel — collapsed:**
```
parallel 2/2 done                                              $0.068

 💻 backend-dev ✓                                    ↑45k ↓3.2k $0.034
    Implemented ComplementNB...

 🔵 frontend-dev ✓                                   ↑32k ↓2.1k $0.034
    Updated UI components...
```

**Parallel — while running:**
```
parallel 1/2 done, 1 running

 💻 backend-dev ✓                                    ↑45k ↓3.2k $0.034
    Implemented ComplementNB...

 🔵 frontend-dev ⏳
    thinking...
```

### Formatting Helpers (Pure)

```typescript
function formatTokens(count: number): string
// 500 → "500", 1500 → "1.5k", 45000 → "45k", 1200000 → "1.2M"

function formatUsageStats(metrics: AgentMetrics): string
// "↑45k ↓3.2k $0.034"
// With turns: "3 turns ↑45k ↓3.2k $0.034"

function formatToolCall(name: string, args: Record<string, unknown>): string
// "grep /pattern/ in apps/"
// "read apps/backend/classifier.py"
// "$ python -m pytest tests/"
```

Tool call formatting follows the same patterns as pi-flow's subagent extension:
- `bash` → `$ command`
- `read` → `read path:offset-limit`
- `write` → `write path (N lines)`
- `edit` → `edit path`
- `grep` → `grep /pattern/ in path`
- `find` → `find pattern in path`
- `ls` → `ls path`

## Tests

### Format helpers
- `formatTokens(500)` → `"500"`
- `formatTokens(1500)` → `"1.5k"`
- `formatTokens(45000)` → `"45k"`
- `formatTokens(1200000)` → `"1.2M"`
- `formatUsageStats({ inputTokens: 45000, outputTokens: 3200, cost: 0.034 })` → `"↑45k ↓3.2k $0.034"`
- `formatToolCall("bash", { command: "npm test" })` → `"$ npm test"`
- `formatToolCall("read", { path: "src/index.ts" })` → `"read src/index.ts"`
- `formatToolCall("grep", { pattern: "TODO", path: "src/" })` → `"grep /TODO/ in src/"`

### /agents command
- 3 agents discovered → output contains all 3 names
- 0 agents → output says "No agents found"

## Commit
`feat: /agents command and agent tool rendering`
