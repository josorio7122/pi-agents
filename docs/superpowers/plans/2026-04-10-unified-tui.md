# Unified TUI Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move pi-teams' rich conversation TUI components (BorderedBox, renderConversation, event types) into pi-agents, upgrade pi-agents' agent tool rendering to use bordered boxes with Markdown output, move the base theme, and retrofit pi-teams to import everything from pi-agents.

**Architecture:** Phase 1 moves proven components from pi-teams into pi-agents' new `src/tui/` folder with their tests. Phase 2 rewrites pi-agents' `tool/render.ts` to use `BorderedBox` for all `renderCall`/`renderResult` output. Phase 3 updates the pi-agents public API and simulation scripts. Phase 4 retrofits pi-teams to import from pi-agents and deletes local copies.

**Tech Stack:** TypeScript (ESM-only), Vitest, Biome, pi-tui (Container, Text, Spacer, Markdown, BorderedBox)

**Repos:**
- `pi-agents` -> `/Users/josorio/Code/pi-agents`
- `pi-teams` -> `/Users/josorio/Code/pi-teams`

**Ordering:** Tasks 1-7 change pi-agents. Task 8 pushes and reinstalls. Tasks 9-11 change pi-teams. Task 12 is final verification.

---

## File Structure

### pi-agents new files (Tasks 1-3)

| File | Source | Purpose |
|------|--------|---------|
| `src/tui/bordered-box.ts` | pi-teams `src/tui/bordered-box.ts` | BorderedBox component (copy) |
| `src/tui/bordered-box.test.ts` | pi-teams `src/tui/bordered-box.test.ts` | Tests (copy) |
| `src/tui/types.ts` | Extracted from pi-teams `src/tui/state.ts` | `AgentStatus`, `ConversationEvent` type definitions |
| `src/tui/conversation.ts` | pi-teams `src/tui/conversation.ts` | `renderConversation()` (adapted imports) |
| `src/tui/conversation.test.ts` | pi-teams `src/tui/conversation.test.ts` | Tests (adapted imports) |
| `src/tui/render-events.ts` | pi-teams `src/delegate/render-events.ts` | `buildPartialEvents`, `buildFinalEvents` (adapted imports) |
| `src/tui/render-events.test.ts` | pi-teams `src/delegate/render-events.test.ts` | Tests (adapted imports) |
| `themes/pi-agents-dark.json` | pi-teams `themes/pi-teams-dark.json` | Base theme (renamed) |

### pi-agents modified files (Tasks 4-7)

| File | Change |
|------|--------|
| `src/tool/render.ts` | Rewrite renderAgentCall/renderAgentResult to use BorderedBox |
| `src/tool/render.test.ts` | Update tests for bordered output |
| `src/api.ts` | Export new TUI components |
| `scripts/simulate-helpers.ts` | Update for new rendering |
| `scripts/simulate-ui.ts` | Verify bordered rendering works |
| `package.json` | Add `themes` to `pi.themes` if not present |

### pi-teams modified files (Tasks 9-11)

| File | Change |
|------|--------|
| `src/tui/bordered-box.ts` + test | **Delete** |
| `src/tui/conversation.ts` + test | **Delete** |
| `src/delegate/render-events.ts` + test | **Delete** |
| `src/tui/state.ts` | Import types from pi-agents |
| `src/tui/render.ts` | Update type imports |
| `src/delegate/create-delegate-tool.ts` | Update imports |
| `scripts/simulate-conversation.ts` | Update imports |
| `scripts/conversation-data.ts` | Use types from pi-agents |
| `scripts/simulate-footer.ts` | Update type imports |

---

## Task 1: Move BorderedBox to pi-agents

**Repo:** pi-agents
**Files:**
- Create: `src/tui/bordered-box.ts`
- Create: `src/tui/bordered-box.test.ts`

Copy the BorderedBox component and its tests from pi-teams into pi-agents. No changes needed to the code — it has no pi-teams-specific imports.

- [ ] **Step 1: Create the component file**

Create `src/tui/bordered-box.ts` with this exact content (copied from pi-teams):

```typescript
import type { Component } from "@mariozechner/pi-tui";
import { visibleWidth } from "@mariozechner/pi-tui";

type BorderedBoxParams = Readonly<{
  header?: string;
  borderColor: (s: string) => string;
}>;

// Class required: pi-tui's Component interface mandates render/invalidate methods
// and addChild for container-style components. All pi-tui components use classes.
export class BorderedBox implements Component {
  private children: Component[] = [];
  private header: string | undefined;
  private borderColor: (s: string) => string;

  constructor(params: BorderedBoxParams) {
    this.header = params.header;
    this.borderColor = params.borderColor;
  }

  addChild(component: Component) {
    this.children.push(component);
  }

  invalidate() {
    for (const child of this.children) child.invalidate();
  }

  render(width: number): string[] {
    const bc = this.borderColor;
    const inner = Math.max(1, width - 4); // "| " content " |"
    const lines: string[] = [];

    // Top border with optional header
    if (this.header) {
      const headerVis = visibleWidth(this.header);
      const fill = Math.max(0, width - 5 - headerVis);
      lines.push(`${bc("\u250c\u2500")} ${this.header} ${bc("\u2500".repeat(fill) + "\u2510")}`);
    } else {
      lines.push(bc(`\u250c${"\u2500".repeat(width - 2)}\u2510`));
    }

    // Top padding
    lines.push(`${bc("\u2502")}${" ".repeat(width - 2)}${bc("\u2502")}`);

    // Children
    for (const child of this.children) {
      for (const line of child.render(inner)) {
        const vis = visibleWidth(line);
        const pad = Math.max(0, inner - vis);
        lines.push(`${bc("\u2502")}  ${line}${" ".repeat(pad)}${bc("\u2502")}`);
      }
    }

    // Bottom padding
    lines.push(`${bc("\u2502")}${" ".repeat(width - 2)}${bc("\u2502")}`);

    // Bottom border
    lines.push(bc(`\u2514${"\u2500".repeat(width - 2)}\u2518`));

    return lines;
  }
}
```

- [ ] **Step 2: Create the test file**

Create `src/tui/bordered-box.test.ts` with this exact content:

```typescript
import { Text, visibleWidth } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { BorderedBox } from "./bordered-box.js";

const noColor = (s: string) => s;

describe("BorderedBox", () => {
  it("renders top border with header text", () => {
    const box = new BorderedBox({ header: "hello", borderColor: noColor });
    box.addChild(new Text("body", 0, 0));
    const lines = box.render(40);
    expect(lines[0]).toContain("\u250c\u2500");
    expect(lines[0]).toContain("hello");
    expect(lines[0]).toContain("\u2510");
  });

  it("renders bottom border", () => {
    const box = new BorderedBox({ header: "hello", borderColor: noColor });
    box.addChild(new Text("body", 0, 0));
    const lines = box.render(40);
    const last = lines[lines.length - 1];
    expect(last).toContain("\u2514");
    expect(last).toContain("\u2518");
  });

  it("renders side borders on body lines", () => {
    const box = new BorderedBox({ header: "hello", borderColor: noColor });
    box.addChild(new Text("some content here", 0, 0));
    const lines = box.render(40);
    const bodyLines = lines.slice(1, -1);
    for (const line of bodyLines) {
      expect(line.startsWith("\u2502")).toBe(true);
      expect(line.endsWith("\u2502")).toBe(true);
    }
  });

  it("fills to exact width", () => {
    const box = new BorderedBox({ header: "hi", borderColor: noColor });
    box.addChild(new Text("x", 0, 0));
    const lines = box.render(50);
    for (const line of lines) {
      expect(visibleWidth(line)).toBe(50);
    }
  });

  it("renders padding lines inside border", () => {
    const box = new BorderedBox({ header: "hi", borderColor: noColor });
    box.addChild(new Text("content", 0, 0));
    const lines = box.render(40);
    expect(lines[1]).toMatch(/^\u2502\s+\u2502$/);
    expect(lines[lines.length - 2]).toMatch(/^\u2502\s+\u2502$/);
  });

  it("renders without header", () => {
    const box = new BorderedBox({ borderColor: noColor });
    box.addChild(new Text("content", 0, 0));
    const lines = box.render(40);
    expect(lines[0]).toMatch(/^\u250c\u2500+\u2510$/);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/tui/bordered-box.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tui/bordered-box.ts src/tui/bordered-box.test.ts
git commit -m "feat: add BorderedBox TUI component (from pi-teams)"
```

---

## Task 2: Move TUI types and render-events to pi-agents

**Repo:** pi-agents
**Files:**
- Create: `src/tui/types.ts`
- Create: `src/tui/render-events.ts`
- Create: `src/tui/render-events.test.ts`

Extract `AgentStatus` and `ConversationEvent` type definitions, and the event builder functions.

- [ ] **Step 1: Create types module**

Create `src/tui/types.ts`:

```typescript
import type { AgentMetrics } from "../invocation/metrics.js";

export type AgentStatus = Readonly<
  | { status: "idle" }
  | { status: "running"; metrics?: AgentMetrics }
  | { status: "done"; metrics: AgentMetrics }
  | { status: "error"; error: string; metrics?: AgentMetrics }
>;

export type ConversationEvent = Readonly<
  | { type: "delegation"; from: string; to: string; task: string; _scopeId?: number }
  | { type: "response"; agent: string; output: string; _scopeId?: number }
>;
```

- [ ] **Step 2: Create render-events module**

Create `src/tui/render-events.ts`:

```typescript
import type { AgentStatus, ConversationEvent } from "./types.js";

export function buildPartialEvents(params: {
  readonly events: ReadonlyArray<ConversationEvent>;
  readonly getStatus: (name: string) => AgentStatus;
}): ReadonlyArray<ConversationEvent> {
  const { events, getStatus } = params;
  const responded = new Set(
    events.filter((e): e is ConversationEvent & { type: "response" } => e.type === "response").map((e) => e.agent),
  );
  const pending = events.filter(
    (e): e is ConversationEvent & { type: "delegation" } => e.type === "delegation" && !responded.has(e.to),
  );
  const pendingBoxes: ReadonlyArray<ConversationEvent> = pending.map((e) => {
    const status = getStatus(e.to);
    const hasActivity = status.status === "running" && status.metrics && status.metrics.turns > 0;
    const phase = hasActivity ? "working" : "initializing";
    const dots = ".".repeat((Math.floor(Date.now() / 500) % 3) + 1);
    return { type: "response" as const, agent: e.to, output: `${phase}${dots}` };
  });
  return [...events, ...pendingBoxes];
}

export function buildFinalEvents(events: ReadonlyArray<ConversationEvent>): ReadonlyArray<ConversationEvent> {
  const responses = events.filter(
    (e): e is ConversationEvent & { type: "response" } => e.type === "response" && e.output.length > 0,
  );
  const responded = new Set(responses.map((e) => e.agent));
  return events.filter((e) => {
    if (e.type === "delegation") return responded.has(e.to);
    if (e.type === "response") return e.output.length > 0;
    return true;
  });
}
```

- [ ] **Step 3: Create test file**

Create `src/tui/render-events.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { ConversationEvent } from "./types.js";
import { buildFinalEvents, buildPartialEvents } from "./render-events.js";

describe("buildPartialEvents", () => {
  it("adds pending boxes for delegations without responses", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
    ];
    const getStatus = () => ({ status: "running" as const });
    const result = buildPartialEvents({ events, getStatus });
    expect(result).toHaveLength(2);
    expect(result[1]?.type).toBe("response");
  });

  it("skips delegations that already have responses", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
      { type: "response", agent: "worker", output: "done" },
    ];
    const getStatus = () => ({
      status: "done" as const,
      metrics: { turns: 1, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] },
    });
    const result = buildPartialEvents({ events, getStatus });
    expect(result).toHaveLength(2);
    expect(result.filter((e) => e.type === "response")).toHaveLength(1);
  });
});

describe("buildFinalEvents", () => {
  it("drops orphaned delegations with no response", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
    ];
    const result = buildFinalEvents(events);
    expect(result).toHaveLength(0);
  });

  it("drops empty responses", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
      { type: "response", agent: "worker", output: "" },
    ];
    const result = buildFinalEvents(events);
    expect(result).toHaveLength(0);
  });

  it("keeps matched delegation-response pairs", () => {
    const events: ReadonlyArray<ConversationEvent> = [
      { type: "delegation", from: "lead", to: "worker", task: "do stuff" },
      { type: "response", agent: "worker", output: "done" },
    ];
    const result = buildFinalEvents(events);
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/tui/`
Expected: PASS (all tests in tui/)

- [ ] **Step 5: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tui/types.ts src/tui/render-events.ts src/tui/render-events.test.ts
git commit -m "feat: add TUI types and render-events (from pi-teams)"
```

---

## Task 3: Move renderConversation to pi-agents

**Repo:** pi-agents
**Files:**
- Create: `src/tui/conversation.ts`
- Create: `src/tui/conversation.test.ts`

Move the conversation rendering function. It needs adapted imports since it now references local modules instead of pi-teams paths.

- [ ] **Step 1: Create conversation module**

Create `src/tui/conversation.ts`:

```typescript
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer } from "@mariozechner/pi-tui";
import { colorize } from "../common/color.js";
import type { AgentConfig } from "../discovery/validator.js";
import type { RenderTheme } from "../tool/render.js";
import { BorderedBox } from "./bordered-box.js";
import type { ConversationEvent } from "./types.js";

function agentLabel(params: { readonly config: AgentConfig; readonly theme: RenderTheme }) {
  const fm = params.config.frontmatter;
  return `${fm.icon} ${colorize(fm.color, fm.name)}`;
}

function eventHeader(params: {
  readonly event: ConversationEvent;
  readonly agents: ReadonlyMap<string, AgentConfig>;
  readonly theme: RenderTheme;
}) {
  const { event, agents, theme } = params;
  if (event.type === "delegation") {
    const from = agents.get(event.from);
    const to = agents.get(event.to);
    if (!from || !to) return `${event.from} \u2192 ${event.to}`;
    return `${agentLabel({ config: from, theme })} ${theme.fg("dim", "\u2192")} ${agentLabel({ config: to, theme })}`;
  }
  const config = agents.get(event.agent);
  if (!config) return event.agent;
  return agentLabel({ config, theme });
}

function eventBody(event: ConversationEvent) {
  return event.type === "delegation" ? event.task : event.output;
}

export function renderConversation(params: {
  readonly events: ReadonlyArray<ConversationEvent>;
  readonly agents: ReadonlyMap<string, AgentConfig>;
  readonly theme: RenderTheme;
}) {
  const { events, agents, theme } = params;
  const container = new Container();
  const mdTheme = getMarkdownTheme();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) continue;

    if (i > 0) container.addChild(new Spacer(1));

    const header = eventHeader({ event, agents, theme });
    const box = new BorderedBox({ header, borderColor: (s) => theme.fg("dim", s) });
    box.addChild(new Markdown(eventBody(event), 0, 0, mdTheme));
    container.addChild(box);
  }

  return container;
}
```

- [ ] **Step 2: Create test file**

Create `src/tui/conversation.test.ts`:

```typescript
import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import { renderConversation } from "./conversation.js";
import type { ConversationEvent } from "./types.js";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const noopTheme = {
  fg: (_c: ThemeColor, t: string) => t,
  bold: (t: string) => t,
};

function stubConfig(name: string): AgentConfig {
  return {
    frontmatter: {
      name,
      description: `${name} agent`,
      model: "anthropic/claude-sonnet-4-6",
      role: "worker",
      color: "#36f9f6",
      icon: "\ud83d\udd28",
      domain: [{ path: "src/", read: true, write: true, delete: false }],
      tools: ["read"],
      skills: [{ path: ".pi/skills/test.md", when: "Always" }],
      knowledge: {
        project: { path: ".pi/k/p/x.yaml", description: "P", updatable: true, "max-lines": 100 },
        general: { path: ".pi/k/g/x.yaml", description: "G", updatable: true, "max-lines": 100 },
      },
      conversation: { path: ".pi/sessions/x/conversation.jsonl" },
    },
    systemPrompt: `You are ${name}.`,
    filePath: `.pi/agents/${name}.md`,
    source: "project",
  };
}

const agents = new Map([
  ["orchestrator", stubConfig("orchestrator")],
  ["builder", stubConfig("builder")],
]);

describe("renderConversation", () => {
  it("renders delegation event as bordered box with sender \u2192 receiver header", () => {
    const events: ConversationEvent[] = [{ type: "delegation", from: "orchestrator", to: "builder", task: "Build it" }];
    const comp = renderConversation({ events, agents, theme: noopTheme });
    const lines = comp.render(60);
    const joined = lines.map(strip).join("\n");
    expect(joined).toContain("orchestrator");
    expect(joined).toContain("\u2192");
    expect(joined).toContain("builder");
    expect(joined).toContain("Build it");
  });

  it("renders response event as bordered box with agent header", () => {
    const events: ConversationEvent[] = [{ type: "response", agent: "builder", output: "Done. Created 3 files." }];
    const comp = renderConversation({ events, agents, theme: noopTheme });
    const lines = comp.render(60);
    const joined = lines.map(strip).join("\n");
    expect(joined).toContain("builder");
    expect(joined).toContain("Done. Created 3 files.");
  });

  it("renders multiple events as stacked blocks", () => {
    const events: ConversationEvent[] = [
      { type: "delegation", from: "orchestrator", to: "builder", task: "Build it" },
      { type: "response", agent: "builder", output: "Done." },
    ];
    const comp = renderConversation({ events, agents, theme: noopTheme });
    const lines = comp.render(60);
    const tops = lines.filter((l) => strip(l).startsWith("\u250c"));
    const bottoms = lines.filter((l) => strip(l).startsWith("\u2514"));
    expect(tops).toHaveLength(2);
    expect(bottoms).toHaveLength(2);
  });

  it("returns empty container for no events", () => {
    const comp = renderConversation({ events: [], agents, theme: noopTheme });
    const lines = comp.render(60);
    expect(lines).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/tui/conversation.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tui/conversation.ts src/tui/conversation.test.ts
git commit -m "feat: add renderConversation TUI component (from pi-teams)"
```

---

## Task 4: Add theme to pi-agents

**Repo:** pi-agents
**Files:**
- Create: `themes/pi-agents-dark.json`
- Modify: `package.json`

Move the theme from pi-teams and register the themes directory.

- [ ] **Step 1: Create themes directory and theme file**

Create `themes/pi-agents-dark.json` — copy pi-teams' theme with updated name:

```json
{
    "$schema": "https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
    "name": "pi-agents-dark",
    "vars": {
        "cyan": "#00d7ff",
        "blue": "#5f87ff",
        "green": "#b5bd68",
        "red": "#cc6666",
        "yellow": "#ffff00",
        "gray": "#808080",
        "dimGray": "#666666",
        "darkGray": "#505050",
        "accent": "#8abeb7",
        "selectedBg": "#3a3a4a",
        "userMsgBg": "#343541",
        "toolPendingBg": "",
        "toolSuccessBg": "",
        "toolErrorBg": "",
        "customMsgBg": ""
    },
    "colors": {
        "accent": "accent",
        "border": "blue",
        "borderAccent": "cyan",
        "borderMuted": "darkGray",
        "success": "green",
        "error": "red",
        "warning": "yellow",
        "muted": "gray",
        "dim": "dimGray",
        "text": "",
        "thinkingText": "gray",
        "selectedBg": "selectedBg",
        "userMessageBg": "userMsgBg",
        "userMessageText": "",
        "customMessageBg": "customMsgBg",
        "customMessageText": "",
        "customMessageLabel": "#9575cd",
        "toolPendingBg": "toolPendingBg",
        "toolSuccessBg": "toolSuccessBg",
        "toolErrorBg": "toolErrorBg",
        "toolTitle": "",
        "toolOutput": "gray",
        "mdHeading": "#f0c674",
        "mdLink": "#81a2be",
        "mdLinkUrl": "dimGray",
        "mdCode": "accent",
        "mdCodeBlock": "green",
        "mdCodeBlockBorder": "gray",
        "mdQuote": "gray",
        "mdQuoteBorder": "gray",
        "mdHr": "gray",
        "mdListBullet": "accent",
        "toolDiffAdded": "green",
        "toolDiffRemoved": "red",
        "toolDiffContext": "gray",
        "syntaxComment": "#6A9955",
        "syntaxKeyword": "#569CD6",
        "syntaxFunction": "#DCDCAA",
        "syntaxVariable": "#9CDCFE",
        "syntaxString": "#CE9178",
        "syntaxNumber": "#B5CEA8",
        "syntaxType": "#4EC9B0",
        "syntaxOperator": "#D4D4D4",
        "syntaxPunctuation": "#D4D4D4",
        "thinkingOff": "darkGray",
        "thinkingMinimal": "#6e6e6e",
        "thinkingLow": "#5f87af",
        "thinkingMedium": "#81a2be",
        "thinkingHigh": "#b294bb",
        "thinkingXhigh": "#d183e8",
        "bashMode": "green"
    },
    "export": {
        "pageBg": "#18181e",
        "cardBg": "#1e1e24",
        "infoBg": "#3c3728"
    }
}
```

- [ ] **Step 2: Register themes in package.json**

In `package.json`, check if `pi.themes` exists. If not, add it alongside `pi.extensions`:

```json
  "pi": {
    "extensions": [
      "./src/index.ts"
    ],
    "themes": [
      "./themes"
    ]
  },
```

- [ ] **Step 3: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add themes/pi-agents-dark.json package.json
git commit -m "feat: add pi-agents-dark theme (from pi-teams)"
```

---

## Task 5: Rewrite tool/render.ts to use BorderedBox

**Repo:** pi-agents
**Files:**
- Modify: `src/tool/render.ts`

This is the core upgrade. Rewrite `renderAgentCall` and `renderAgentResult` to use `BorderedBox` with `Markdown` body instead of plain `Text` components.

- [ ] **Step 1: Run existing tests as baseline**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/tool/render.test.ts`
Expected: PASS

- [ ] **Step 2: Rewrite render.ts**

Replace the entire content of `src/tool/render.ts`. Read the file first, then replace with:

```typescript
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { colorize } from "../common/color.js";
import { spinnerFrame } from "../common/spinner.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { BorderedBox } from "../tui/bordered-box.js";
import { formatUsageStats } from "./format.js";
import type { RunAgentResult } from "./modes.js";
import { aggregateMetrics } from "./modes.js";

export type RenderTheme = Readonly<{
  fg: (color: ThemeColor, text: string) => string;
  bold: (text: string) => string;
}>;

type AgentDisplay = Readonly<{ icon: string; name: string; color: string; model: string }>;
type FindAgent = (name: string) => AgentDisplay | undefined;

export type AgentResultEntry = Readonly<{
  agent: string;
  status: "running" | "done" | "error";
  metrics?: AgentMetrics;
  error?: string;
  output?: string;
  step?: number;
}>;

export type AgentResultDetails = Readonly<{
  mode: "single" | "parallel" | "chain";
  results: ReadonlyArray<AgentResultEntry>;
}>;

export function toResultEntry(params: {
  readonly agentName: string;
  readonly result: RunAgentResult;
  readonly step?: number;
}): AgentResultEntry {
  const { agentName, result, step } = params;
  const status: AgentResultEntry["status"] = result.error ? "error" : "done";
  return {
    agent: agentName,
    status,
    metrics: result.metrics,
    output: result.output,
    ...(result.error ? { error: result.error } : {}),
    ...(step !== undefined ? { step } : {}),
  };
}

export function runningEntry(params: { readonly agentName: string; readonly step?: number }): AgentResultEntry {
  return { agent: params.agentName, status: "running", ...(params.step !== undefined ? { step: params.step } : {}) };
}

// -- helpers ---------------------------------------------------------------

function agentHeader(params: { readonly agent: AgentDisplay | undefined; readonly name: string; readonly theme: RenderTheme; readonly step?: number }) {
  const { agent, name, theme, step } = params;
  const icon = agent?.icon ?? "\u25cf";
  const displayName = agent?.name ?? name;
  const styledName = agent?.color ? colorize(agent.color, theme.bold(displayName)) : theme.bold(displayName);
  const model = agent?.model ?? "";
  const modelSuffix = model ? ` ${theme.fg("dim", `(${model})`)}` : "";
  const stepPrefix = step ? `${theme.fg("dim", `${step}.`)} ` : "";
  return `${stepPrefix}${icon} ${styledName}${modelSuffix}`;
}

function statusLine(params: { readonly entry: AgentResultEntry; readonly theme: RenderTheme }) {
  const { entry, theme } = params;
  if (entry.status === "done") {
    const stats = entry.metrics ? formatUsageStats(entry.metrics) : "";
    return `${theme.fg("success", "\u2713")} ${theme.fg("dim", stats)}`;
  }
  if (entry.status === "error") {
    return `${theme.fg("error", "\u2717")} ${theme.fg("error", entry.error ?? "unknown error")}`;
  }
  // running
  const spinner = theme.fg("accent", spinnerFrame());
  const label = entry.metrics && entry.metrics.turns > 0 ? "working" : "initializing";
  const dots = ".".repeat((Math.floor(Date.now() / 500) % 3) + 1);
  const stats = entry.metrics ? `\n${theme.fg("dim", formatUsageStats(entry.metrics))}` : "";
  return `${spinner} ${label}${dots}${stats}`;
}

// -- renderCall ------------------------------------------------------------

export function renderAgentCall(params: {
  readonly args: Record<string, unknown>;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
}) {
  const { args, theme, findAgent } = params;
  const mdTheme = getMarkdownTheme();
  const container = new Container();

  const tasks = Array.isArray(args?.tasks) ? (args.tasks as ReadonlyArray<{ agent?: string; task?: string }>) : undefined;
  const chain = Array.isArray(args?.chain) ? (args.chain as ReadonlyArray<{ agent?: string; task?: string }>) : undefined;

  if (tasks && tasks.length > 0) {
    container.addChild(new Text(`\u00bb ${theme.bold(`parallel (${tasks.length} tasks)`)}`, 0, 0));
    for (const t of tasks) {
      container.addChild(new Spacer(1));
      const name = typeof t.agent === "string" ? t.agent : "...";
      const header = agentHeader({ agent: findAgent(name), name, theme });
      const box = new BorderedBox({ header, borderColor: (s) => theme.fg("dim", s) });
      if (typeof t.task === "string") box.addChild(new Markdown(t.task, 0, 0, mdTheme));
      container.addChild(box);
    }
    return container;
  }

  if (chain && chain.length > 0) {
    container.addChild(new Text(`\u203a ${theme.bold(`chain (${chain.length} steps)`)}`, 0, 0));
    for (let i = 0; i < chain.length; i++) {
      const s = chain[i];
      if (!s) continue;
      container.addChild(new Spacer(1));
      const name = typeof s.agent === "string" ? s.agent : "...";
      const header = agentHeader({ agent: findAgent(name), name, theme, step: i + 1 });
      const box = new BorderedBox({ header, borderColor: (s2) => theme.fg("dim", s2) });
      if (typeof s.task === "string") box.addChild(new Markdown(s.task, 0, 0, mdTheme));
      container.addChild(box);
    }
    return container;
  }

  // single mode
  const agentName = typeof args?.agent === "string" ? args.agent : "...";
  const header = agentHeader({ agent: findAgent(agentName), name: agentName, theme });
  const box = new BorderedBox({ header, borderColor: (s) => theme.fg("dim", s) });
  if (typeof args?.task === "string") box.addChild(new Markdown(args.task, 0, 0, mdTheme));
  container.addChild(box);
  return container;
}

// -- renderResult ----------------------------------------------------------

function isAgentResultDetails(value: unknown): value is AgentResultDetails {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (v.mode === "single" || v.mode === "parallel" || v.mode === "chain") && Array.isArray(v.results);
}

export function renderAgentResult(params: {
  readonly result: { details?: unknown; content: Array<{ type: string; text?: string }> };
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
}) {
  const { result, theme, findAgent } = params;
  const details = isAgentResultDetails(result.details) ? result.details : undefined;
  const mdTheme = getMarkdownTheme();

  if (!details?.results) {
    const box = new BorderedBox({ borderColor: (s) => theme.fg("dim", s) });
    box.addChild(new Text(`${theme.fg("accent", spinnerFrame())} initializing...`, 0, 0));
    return box;
  }

  const showStep = details.mode === "chain";
  const container = new Container();

  for (let i = 0; i < details.results.length; i++) {
    if (i > 0) container.addChild(new Spacer(1));
    const entry = details.results[i];
    if (!entry) continue;

    const agent = findAgent(entry.agent);
    const header = agentHeader({ agent, name: entry.agent, theme, step: showStep ? entry.step : undefined });
    const box = new BorderedBox({ header, borderColor: (s) => theme.fg("dim", s) });

    if (entry.status === "done" && entry.output) {
      box.addChild(new Markdown(entry.output, 0, 0, mdTheme));
      box.addChild(new Text("", 0, 0));
    }
    box.addChild(new Text(statusLine({ entry, theme }), 0, 0));
    container.addChild(box);
  }

  if (details.results.length > 1) {
    const withMetrics = details.results.filter((e): e is AgentResultEntry & { metrics: AgentMetrics } => !!e.metrics);
    if (withMetrics.length > 0) {
      const agg = aggregateMetrics(withMetrics.map((e) => ({ output: "", metrics: e.metrics })));
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("dim", `\u03a3 ${formatUsageStats(agg)}`), 0, 0));
    }
  }

  return container;
}
```

- [ ] **Step 3: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: Tests will FAIL — render.test.ts assertions need updating (next task). Lint and typecheck should pass.

- [ ] **Step 4: Commit render.ts only**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tool/render.ts
git commit -m "feat: rewrite renderAgentCall/renderAgentResult to use BorderedBox"
```

---

## Task 6: Update render.test.ts for bordered output

**Repo:** pi-agents
**Files:**
- Modify: `src/tool/render.test.ts`

Update all test assertions to expect bordered box output instead of plain text.

- [ ] **Step 1: Rewrite render.test.ts**

Replace the entire content of `src/tool/render.test.ts` with tests that verify bordered output:

```typescript
import { describe, expect, it } from "vitest";
import type { RenderTheme } from "./render.js";
import { renderAgentCall, renderAgentResult } from "./render.js";

const mockTheme: RenderTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
};

const agents: Record<string, { icon: string; name: string; color: string; model: string }> = {
  scout: { icon: "\ud83d\udd0d", name: "scout", color: "#fff", model: "anthropic/claude-haiku-3" },
  investigator: { icon: "\ud83d\udd2c", name: "investigator", color: "#fff", model: "anthropic/claude-opus-4-6" },
};
const mockFindAgent = (name: string) => agents[name];
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("renderAgentCall", () => {
  it("renders single agent in bordered box with task", () => {
    const c = renderAgentCall({ args: { agent: "scout", task: "analyze this" }, theme: mockTheme, findAgent: mockFindAgent });
    const lines = c.render(80);
    const text = lines.map(strip).join("\n");
    expect(text).toContain("\u250c");
    expect(text).toContain("scout");
    expect(text).toContain("anthropic/claude-haiku-3");
    expect(text).toContain("analyze this");
    expect(text).toContain("\u2518");
  });

  it("renders parallel mode with multiple boxes", () => {
    const c = renderAgentCall({
      args: { tasks: [{ agent: "scout", task: "a" }, { agent: "scout", task: "b" }] },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(80);
    const text = lines.map(strip).join("\n");
    expect(text).toContain("parallel (2 tasks)");
    const tops = lines.filter((l) => strip(l).startsWith("\u250c"));
    expect(tops).toHaveLength(2);
  });

  it("renders chain mode with numbered boxes", () => {
    const c = renderAgentCall({
      args: { chain: [{ agent: "scout", task: "a" }, { agent: "investigator", task: "b" }] },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(80);
    const text = lines.map(strip).join("\n");
    expect(text).toContain("chain (2 steps)");
    expect(text).toContain("1.");
    expect(text).toContain("2.");
  });

  it("handles unknown agent gracefully", () => {
    const c = renderAgentCall({ args: { agent: "unknown", task: "test" }, theme: mockTheme, findAgent: mockFindAgent });
    const text = c.render(80).map(strip).join("\n");
    expect(text).toContain("unknown");
    expect(text).toContain("\u250c");
  });
});

describe("renderAgentResult", () => {
  it("shows initializing box when no details", () => {
    const c = renderAgentResult({
      result: { content: [{ type: "text", text: "" }] },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(80).map(strip).join("\n");
    expect(text).toContain("initializing");
    expect(text).toContain("\u250c");
  });

  it("renders done result in bordered box with output and metrics", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "output" }],
        details: {
          mode: "single",
          results: [{
            agent: "scout",
            status: "done",
            output: "Found 3 modules.",
            metrics: { turns: 3, inputTokens: 1000, outputTokens: 200, cost: 0.01, toolCalls: [{ name: "read", args: {} }] },
          }],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(80).map(strip).join("\n");
    expect(text).toContain("\u250c");
    expect(text).toContain("scout");
    expect(text).toContain("Found 3 modules.");
    expect(text).toContain("\u2713");
    expect(text).toContain("3 turns");
  });

  it("renders running result with spinner in bordered box", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: {
          mode: "single",
          results: [{ agent: "scout", status: "running", metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.001, toolCalls: [] } }],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(80);
    const text = lines.map(strip).join("\n");
    expect(text).toContain("\u250c");
    expect(text).toContain("working");
  });

  it("renders error result in bordered box", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: {
          mode: "single",
          results: [{ agent: "scout", status: "error", error: "timeout" }],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(80).map(strip).join("\n");
    expect(text).toContain("\u2717");
    expect(text).toContain("timeout");
  });

  it("renders parallel results as multiple bordered boxes", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: {
          mode: "parallel",
          results: [
            { agent: "scout", status: "done", output: "result 1", metrics: { turns: 2, inputTokens: 500, outputTokens: 100, cost: 0.005, toolCalls: [] } },
            { agent: "scout", status: "done", output: "result 2", metrics: { turns: 1, inputTokens: 200, outputTokens: 50, cost: 0.002, toolCalls: [] } },
          ],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(80);
    const text = lines.map(strip).join("\n");
    const tops = lines.filter((l) => strip(l).startsWith("\u250c"));
    expect(tops).toHaveLength(2);
    expect(text).toContain("\u03a3");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/josorio/Code/pi-agents && npx vitest run src/tool/render.test.ts`
Expected: PASS

- [ ] **Step 3: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/tool/render.test.ts
git commit -m "test: update render tests for bordered box output"
```

---

## Task 7: Update pi-agents exports and simulation scripts

**Repo:** pi-agents
**Files:**
- Modify: `src/api.ts`
- Modify: `scripts/simulate-helpers.ts`

- [ ] **Step 1: Update api.ts exports**

Add to `src/api.ts`:

```typescript
// TUI components
export { BorderedBox } from "./tui/bordered-box.js";
export { renderConversation } from "./tui/conversation.js";
export { buildFinalEvents, buildPartialEvents } from "./tui/render-events.js";
export type { AgentStatus, ConversationEvent } from "./tui/types.js";
```

- [ ] **Step 2: Update simulate-helpers.ts**

Read `scripts/simulate-helpers.ts` first. The `renderFrame` function calls `renderAgentCall` and `renderAgentResult` — these now return `Container`/`BorderedBox` instead of `Text`. The function should still work since both implement `Component.render(width)`. Verify by running the simulation.

If any imports changed (e.g., `AgentResultEntry` or `AgentResultDetails` moved), update them.

- [ ] **Step 3: Run simulation to visually verify**

Run: `cd /Users/josorio/Code/pi-agents && npx tsx scripts/simulate-ui.ts single`

Expected: Single mode renders a bordered box with agent header, animated spinner, then final output with metrics. Visually verify:
- Box has `┌─` top border with agent header
- Running state shows `⠋ working...` inside box
- Done state shows `✓` and metrics inside box
- Box has `└─` bottom border

Run: `cd /Users/josorio/Code/pi-agents && npx tsx scripts/simulate-ui.ts all`

Expected: All 4 modes (single, parallel, chain, error) render with bordered boxes.

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-agents
git add src/api.ts scripts/simulate-helpers.ts
git commit -m "feat: export TUI components from api.ts, update simulation"
```

---

## Task 8: Push pi-agents and reinstall in pi-teams

**Repo:** both

- [ ] **Step 1: Push pi-agents**

```bash
cd /Users/josorio/Code/pi-agents && git push
```

- [ ] **Step 2: Reinstall in pi-teams**

```bash
cd /Users/josorio/Code/pi-teams && npm install pi-agents@github:josorio7122/pi-agents
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/josorio/Code/pi-teams && npx tsc --noEmit`
Expected: Pass (existing code still compiles — we haven't changed pi-teams imports yet).

- [ ] **Step 4: Commit lock file**

```bash
cd /Users/josorio/Code/pi-teams
git add package-lock.json
git commit -m "chore: update pi-agents dependency (unified TUI)"
```

---

## Task 9: Retrofit pi-teams — delete local TUI components

**Repo:** pi-teams
**Files:**
- Delete: `src/tui/bordered-box.ts`, `src/tui/bordered-box.test.ts`
- Delete: `src/tui/conversation.ts`, `src/tui/conversation.test.ts`
- Delete: `src/delegate/render-events.ts`, `src/delegate/render-events.test.ts`
- Modify: `src/tui/state.ts`
- Modify: `src/delegate/create-delegate-tool.ts`

- [ ] **Step 1: Update state.ts to import types from pi-agents**

In `src/tui/state.ts`, the `AgentStatus` and `ConversationEvent` types are defined locally. Replace the local definitions with imports from pi-agents and re-export them for backward compat within pi-teams:

Read the file first. Then:
1. Add import at top: `import type { AgentStatus, ConversationEvent } from "pi-agents";`
2. Delete the local `AgentStatus` type definition
3. Delete the local `ConversationEvent` type definition
4. Add re-exports: `export type { AgentStatus, ConversationEvent };`

Keep `FooterState`, `createFooterState`, and the `IDLE` constant unchanged.

- [ ] **Step 2: Update create-delegate-tool.ts imports**

Read the file. Change imports:
- `import { buildFinalEvents, buildPartialEvents } from "./render-events.js";` -> `import { buildFinalEvents, buildPartialEvents } from "pi-agents";`
- `import { renderConversation } from "../tui/conversation.js";` -> `import { renderConversation } from "pi-agents";`
- `import { BorderedBox } from "../tui/bordered-box.js";` -> remove (if present, may not be directly imported)

Check that `ConversationEvent` is still importable from `"../tui/state.js"` (via the re-export we added).

- [ ] **Step 3: Delete local files**

```bash
cd /Users/josorio/Code/pi-teams
rm src/tui/bordered-box.ts src/tui/bordered-box.test.ts
rm src/tui/conversation.ts src/tui/conversation.test.ts
rm src/delegate/render-events.ts src/delegate/render-events.test.ts
```

- [ ] **Step 4: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add -A src/tui/bordered-box.ts src/tui/bordered-box.test.ts src/tui/conversation.ts src/tui/conversation.test.ts src/delegate/render-events.ts src/delegate/render-events.test.ts src/tui/state.ts src/delegate/create-delegate-tool.ts
git commit -m "refactor: import TUI components from pi-agents, delete local copies"
```

---

## Task 10: Update pi-teams simulation scripts

**Repo:** pi-teams
**Files:**
- Modify: `scripts/simulate-conversation.ts`
- Modify: `scripts/conversation-data.ts`
- Modify: `scripts/simulate-footer.ts`

- [ ] **Step 1: Update simulate-conversation.ts**

Read the file. Update the BorderedBox import:

```typescript
// Old:
import { BorderedBox } from "../src/tui/bordered-box.js";
// New:
import { BorderedBox } from "pi-agents";
```

If it imports `ConversationEvent` from a local path, update to import from `pi-agents`.

- [ ] **Step 2: Update conversation-data.ts**

Read the file. If it defines its own `ConversationEvent` type locally, consider importing from `pi-agents` instead. However, the script's type may be simpler (no `_scopeId`), so it may be fine to keep the local type. Only update if the types match exactly.

- [ ] **Step 3: Update simulate-footer.ts**

Read the file. Update any type imports that now come from pi-agents instead of local paths. The `RenderTheme` import should already come from pi-agents (or from `../src/tui/render.js` which re-exports — check).

- [ ] **Step 4: Run simulations to verify**

Run: `cd /Users/josorio/Code/pi-teams && npm run simulate`
Expected: Footer renders correctly (tree view with agents, spinners, metrics).

Run: `cd /Users/josorio/Code/pi-teams && npm run simulate:conversation`
Expected: Conversation renders correctly (bordered boxes with delegation/response events).

- [ ] **Step 5: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add scripts/
git commit -m "refactor: update simulation scripts to use pi-agents TUI imports"
```

---

## Task 11: Handle pi-teams theme

**Repo:** pi-teams
**Files:**
- Modify or delete: `themes/pi-teams-dark.json`
- Possibly modify: `src/index.ts`

The base theme now lives in pi-agents. pi-teams has two options:
1. Keep its theme as an override (if it needs different colors)
2. Delete its theme and use pi-agents' theme

- [ ] **Step 1: Check if pi-teams theme differs from pi-agents**

Compare: the themes should be identical except the `name` field. If so, pi-teams can drop its theme.

- [ ] **Step 2: Update index.ts theme reference**

In `src/index.ts`, find where `ctx.ui.setTheme("pi-teams-dark")` is called. Change to `ctx.ui.setTheme("pi-agents-dark")`.

- [ ] **Step 3: Delete pi-teams theme (if identical)**

```bash
rm -rf /Users/josorio/Code/pi-teams/themes/pi-teams-dark.json
```

If the `themes` directory is now empty and pi-teams' `package.json` has a `pi.themes` entry, remove that entry too.

- [ ] **Step 4: Run simulation to verify theme loads**

Run: `cd /Users/josorio/Code/pi-teams && npm run simulate`
Expected: Colors render correctly.

- [ ] **Step 5: Run all checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/josorio/Code/pi-teams
git add -A themes/ src/index.ts package.json
git commit -m "refactor: use pi-agents-dark theme, remove local theme"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run all pi-agents checks**

Run: `cd /Users/josorio/Code/pi-agents && npm run check`
Expected: lint PASS, typecheck PASS, all tests PASS.

- [ ] **Step 2: Run all pi-teams checks**

Run: `cd /Users/josorio/Code/pi-teams && npm run check`
Expected: lint PASS, typecheck PASS, all tests PASS.

- [ ] **Step 3: Run pi-agents simulation**

Run: `cd /Users/josorio/Code/pi-agents && npx tsx scripts/simulate-ui.ts all`
Expected: All 4 modes render with bordered boxes, spinners animate, metrics display.

- [ ] **Step 4: Run pi-teams simulations**

Run: `cd /Users/josorio/Code/pi-teams && npm run simulate`
Run: `cd /Users/josorio/Code/pi-teams && npm run simulate:conversation`
Expected: Both render correctly using pi-agents components.

- [ ] **Step 5: Verify no local TUI duplicates remain**

```bash
ls /Users/josorio/Code/pi-teams/src/tui/bordered-box.ts 2>/dev/null && echo "ERROR" || echo "OK: deleted"
ls /Users/josorio/Code/pi-teams/src/tui/conversation.ts 2>/dev/null && echo "ERROR" || echo "OK: deleted"
ls /Users/josorio/Code/pi-teams/src/delegate/render-events.ts 2>/dev/null && echo "ERROR" || echo "OK: deleted"
```
Expected: All say "OK: deleted"

---

## Summary

### pi-agents changes
| Change | Type |
|--------|------|
| New `src/tui/` folder with BorderedBox, conversation, types, render-events | Component migration |
| New `themes/pi-agents-dark.json` | Theme migration |
| Rewritten `tool/render.ts` | Bordered box rendering |
| Updated `tool/render.test.ts` | Test updates |
| Updated `api.ts` | New exports |
| Updated simulation scripts | Visual verification |

### pi-teams changes
| Change | Type |
|--------|------|
| Deleted `tui/bordered-box.ts` + test | Remove duplication |
| Deleted `tui/conversation.ts` + test | Remove duplication |
| Deleted `delegate/render-events.ts` + test | Remove duplication |
| Updated `tui/state.ts` | Import types from pi-agents |
| Updated `delegate/create-delegate-tool.ts` | Import from pi-agents |
| Updated simulation scripts | Use pi-agents imports |
| Deleted/updated theme | Use pi-agents theme |
