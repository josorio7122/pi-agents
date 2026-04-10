# Unified TUI Rendering — Design Spec

## Problem

pi-teams has a rich conversation TUI (bordered boxes with colored borders, `"from -> to"` headers, Markdown body, animated working indicators) that provides a much better visual experience than pi-agents' current minimal `Text`-based rendering. This rendering code is duplicated — pi-teams owns it but pi-agents should provide it as the shared library. pi-agents' own agent tool should also adopt this visual style.

## Goals

1. Move pi-teams' TUI components (BorderedBox, conversation rendering, event types) into pi-agents
2. Upgrade pi-agents' agent tool `renderCall`/`renderResult` to use bordered boxes with full Markdown output
3. Move the base theme from pi-teams to pi-agents
4. Retrofit pi-teams to import all TUI components from pi-agents instead of owning them

## Non-Goals

- The pi-teams footer (tree view with orchestrator/members/status) stays in pi-teams — it's teams-specific
- No new abstractions (no "AgentCard" component) — move proven code, let abstractions emerge later

---

## Architecture

### What moves to pi-agents

New `src/tui/` folder in pi-agents:

| File | Source | Purpose |
|------|--------|---------|
| `tui/bordered-box.ts` | pi-teams `tui/bordered-box.ts` | `BorderedBox` class implementing pi-tui `Component` |
| `tui/bordered-box.test.ts` | pi-teams `tui/bordered-box.test.ts` | Tests for BorderedBox |
| `tui/conversation.ts` | pi-teams `tui/conversation.ts` | `renderConversation()` — renders events as stacked bordered boxes |
| `tui/conversation.test.ts` | pi-teams `tui/conversation.test.ts` | Tests for conversation rendering |
| `tui/types.ts` | pi-teams `tui/state.ts` (types only) | `AgentStatus`, `ConversationEvent` type definitions |
| `tui/render-events.ts` | pi-teams `delegate/render-events.ts` | `buildPartialEvents()`, `buildFinalEvents()` |
| `tui/render-events.test.ts` | pi-teams `delegate/render-events.test.ts` | Tests for event builders |

Theme:

| File | Source | Purpose |
|------|--------|---------|
| `themes/pi-agents-dark.json` | pi-teams `themes/pi-teams-dark.json` | Base dark theme (renamed, `name` field updated) |

### What changes in pi-agents

| File | Change |
|------|--------|
| `tool/render.ts` | Rewrite `renderAgentCall` and `renderAgentResult` to use `BorderedBox` with `Markdown` body |
| `tool/render.test.ts` | Update tests for new bordered output (verify `┌─` borders, agent headers, markdown body) |
| `scripts/simulate-helpers.ts` | Update `renderFrame` to work with new rendering (imports may change, output is now bordered boxes) |
| `scripts/simulate-ui.ts` | Update if needed for new rendering — this is the primary visual verification tool |
| `api.ts` | Export new TUI components: `BorderedBox`, `renderConversation`, `AgentStatus`, `ConversationEvent`, `buildPartialEvents`, `buildFinalEvents` |

### What changes in pi-teams (retrofit)

| File | Change |
|------|--------|
| `tui/bordered-box.ts` | **Delete** — import from pi-agents |
| `tui/bordered-box.test.ts` | **Delete** — tests live in pi-agents |
| `tui/conversation.ts` | **Delete** — import from pi-agents |
| `tui/conversation.test.ts` | **Delete** — tests live in pi-agents |
| `tui/state.ts` | **Modify** — import `AgentStatus`, `ConversationEvent` from pi-agents, keep `FooterState` + `createFooterState` locally |
| `delegate/render-events.ts` | **Delete** — import from pi-agents |
| `delegate/render-events.test.ts` | **Delete** — tests live in pi-agents |
| `delegate/create-delegate-tool.ts` | **Modify** — update imports to use pi-agents |
| `tui/render.ts` | **Modify** — update imports for types |
| `scripts/simulate-conversation.ts` | **Modify** — update imports to use `BorderedBox` from pi-agents instead of local |
| `scripts/conversation-data.ts` | **Modify** — use `ConversationEvent` type from pi-agents (or keep local type alias if shape differs) |
| `scripts/simulate-footer.ts` | **Modify** — update imports for types that moved to pi-agents |
| `themes/pi-teams-dark.json` | **Delete or keep as override** — base theme now in pi-agents |

### What stays unchanged

| File | Reason |
|------|--------|
| pi-teams `tui/render.ts` | Footer tree view is teams-specific |
| pi-teams `tui/state.ts` (factory) | `createFooterState` manages scope hierarchies for nested delegation — teams-specific |
| pi-agents `tool/agent-tool.ts` | Calls render functions — signatures stay the same |
| pi-agents `tool/agent-tool-execute.ts` | Execution orchestration — unchanged, only `render.ts` output changes |

---

## Rendering Specification

### renderCall (tool invocation display)

**Single mode:**
```
┌─ icon agentName (model) ───────────────────────┐
│                                                  │
│  Task text rendered as Markdown...               │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Parallel mode:**
```
» parallel (N tasks)

┌─ icon agent1 (model) ──────────────────────────┐
│                                                  │
│  Task 1 text...                                  │
│                                                  │
└──────────────────────────────────────────────────┘

┌─ icon agent2 (model) ──────────────────────────┐
│                                                  │
│  Task 2 text...                                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Chain mode:**
```
› chain (N steps)

┌─ 1. icon agent1 (model) ───────────────────────┐
│                                                  │
│  Step 1 task text...                             │
│                                                  │
└──────────────────────────────────────────────────┘

┌─ 2. icon agent2 (model) ───────────────────────┐
│                                                  │
│  Step 2 task text...                             │
│                                                  │
└──────────────────────────────────────────────────┘
```

### renderResult (tool result display)

**Single mode — running:**
```
┌─ icon agentName (model) ───────────────────────┐
│                                                  │
│  ⠋ working...                                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Single mode — running with metrics:**
```
┌─ icon agentName (model) ───────────────────────┐
│                                                  │
│  ⠋ working...                                    │
│  2 turns ↑1.5k ↓200 $0.003                      │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Single mode — done:**
```
┌─ icon agentName (model) ───────────────────────┐
│                                                  │
│  Agent's full output rendered as Markdown...     │
│                                                  │
│  ✓ 2 turns ↑1.5k ↓200 $0.003                    │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Single mode — error:**
```
┌─ icon agentName (model) ───────────────────────┐
│                                                  │
│  ✗ Agent execution failed: timeout               │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Parallel mode — mixed states:**
```
┌─ icon agent1 (model) ──────────────────────────┐
│                                                  │
│  ✓ Output from agent 1...                        │
│  2 turns ↑1.5k ↓200 $0.003                      │
│                                                  │
└──────────────────────────────────────────────────┘

┌─ icon agent2 (model) ──────────────────────────┐
│                                                  │
│  ⠋ working...                                    │
│                                                  │
└──────────────────────────────────────────────────┘

Σ 2 turns ↑1.5k ↓200 $0.003
```

**Chain mode:** Same as parallel but with step numbers in headers (`1.`, `2.`, etc.)

### Borders and Colors

- Border characters: `┌─┐│└┘` (same as pi-teams' `BorderedBox`)
- Border color: `theme.fg("dim", ...)` for all borders
- Agent name in header: `colorize(agent.color, agent.name)` — uses agent's hex color
- Status indicators: `✓` in success color, `✗` in error color, `⠋` spinner in accent color
- Metrics line: dim text
- Body content: rendered as `Markdown` using pi-coding-agent's `getMarkdownTheme()`

---

## Theme

The base theme `themes/pi-agents-dark.json` provides:

- **Border colors:** `border`, `borderAccent`, `borderMuted`
- **Status colors:** `success` (green), `error` (red), `accent` (cyan), `warning` (yellow)
- **Text colors:** `muted` (gray), `dim` (dimGray)
- **Markdown colors:** `mdHeading`, `mdLink`, `mdCode`, `mdCodeBlock`
- **Diff colors:** `toolDiffAdded`, `toolDiffRemoved`
- **Background:** `pageBg`, `cardBg`, `infoBg`

pi-teams can keep its own theme that extends/overrides this, or use the base directly.

---

## Data Flow

### pi-agents agent tool (single mode)

```
User calls agent tool with {agent: "dev", task: "..."}
  → renderCall: BorderedBox(header="icon dev (model)", body=Markdown(task))
  → execute: runAgent(...)
    → partial updates: renderResult with "working..." in box
    → done: renderResult with output Markdown + metrics in box
```

### pi-teams delegate tool

```
Orchestrator calls delegate with {target: "dev", task: "..."}
  → renderCall: renderConversation([{type: "delegation", from, to, task}])
  → execute: runAgent(...)
    → partial updates: buildPartialEvents → renderConversation with "working..." boxes
    → done: buildFinalEvents → renderConversation with response boxes
```

Both paths use the same `BorderedBox` component and `Markdown` rendering. The difference is pi-teams adds the `"from → to"` delegation header style via `renderConversation`, while pi-agents uses a simpler `"icon name (model)"` header.

---

## Verification Strategy

### Simulation scripts as visual acceptance tests

Both repos have simulation scripts that render the TUI components in the terminal. These MUST be run before AND after the migration to verify visual correctness.

**Before migration (baseline):**
1. `cd pi-agents && npx tsx scripts/simulate-ui.ts` — capture current pi-agents rendering (minimal Text-based)
2. `cd pi-teams && npm run simulate` — capture current footer rendering
3. `cd pi-teams && npm run simulate:conversation` — capture current conversation rendering

**After pi-agents changes (Phase 2):**
1. `cd pi-agents && npx tsx scripts/simulate-ui.ts` — verify bordered boxes render correctly for single/parallel/chain/error modes
2. Visually confirm: boxes have borders, headers show agent icon+name+model, body shows task/output as Markdown, metrics appear, spinners animate

**After pi-teams retrofit (Phase 4):**
1. `cd pi-teams && npm run simulate` — footer still renders correctly (unchanged)
2. `cd pi-teams && npm run simulate:conversation` — conversation renders using pi-agents' BorderedBox (same visual output)

### Automated tests

- pi-agents: `npm run check` (lint + typecheck + 271+ tests)
- pi-teams: `npm run check` (lint + typecheck + 105+ tests)
- pi-agents `tool/render.test.ts` must be updated to assert bordered output (`┌─`, `│`, `└─` characters, agent headers, Markdown body)

---

## Migration Order

1. **Phase 1 — pi-agents:** Create `tui/` folder, move components, add theme
2. **Phase 2 — pi-agents:** Rewrite `tool/render.ts` to use bordered boxes, update `scripts/simulate-helpers.ts` and `scripts/simulate-ui.ts`
3. **Phase 2.5 — pi-agents:** Run `npx tsx scripts/simulate-ui.ts` to visually verify bordered rendering
4. **Phase 3 — pi-agents:** Update `api.ts` exports, push
5. **Phase 4 — pi-teams:** Delete local copies, import from pi-agents, update simulation scripts
6. **Phase 4.5 — pi-teams:** Run `npm run simulate:conversation` and `npm run simulate` to visually verify
7. **Phase 5 — Verify:** Both repos pass `npm run check`
