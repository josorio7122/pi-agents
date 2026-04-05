import type { AgentMetrics } from "../src/invocation/metrics.js";
import type { AgentResultDetails, AgentResultEntry } from "../src/tool/render.js";
import { renderAgentCall, renderAgentResult } from "../src/tool/render.js";

// ── ANSI theme (close to Pi's actual colors) ───────────────

const COLORS: Record<string, string> = {
  dim: "\x1b[90m",
  muted: "\x1b[37m",
  success: "\x1b[32m",
  error: "\x1b[31m",
  accent: "\x1b[36m",
  warning: "\x1b[33m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

export const theme = {
  fg: (color: string, text: string) => `${COLORS[color] ?? ""}${text}${RESET}`,
  bold: (text: string) => `${BOLD}${text}${RESET}`,
};

// ── Agent catalog ───────────────────────────────────────────

const AGENTS: Record<string, { icon: string; name: string; color: string; model: string }> = {
  scout: { icon: "🔍", name: "scout", color: "#36f9f6", model: "anthropic/claude-haiku-3" },
  investigator: { icon: "🔬", name: "investigator", color: "#ff8c42", model: "anthropic/claude-opus-4-6" },
  "backend-dev": { icon: "💻", name: "backend-dev", color: "#36f9f6", model: "anthropic/claude-sonnet-4-6" },
  "code-reviewer": { icon: "📋", name: "code-reviewer", color: "#ffd700", model: "anthropic/claude-opus-4-6" },
};

export const findAgent = (name: string) => AGENTS[name];

// ── Helpers ─────────────────────────────────────────────────

const WIDTH = process.stdout.columns || 100;

export function renderFrame(callArgs: Record<string, unknown>, details: AgentResultDetails) {
  const call = renderAgentCall({ args: callArgs, theme, findAgent });
  const result = renderAgentResult({
    result: { content: [{ type: "text", text: "" }], details },
    theme,
    findAgent,
  });
  const callLines = call.render(WIDTH);
  const resultLines = result.render(WIDTH);
  return [...callLines, ...resultLines];
}

export function clearAndPrint(lines: ReadonlyArray<string>, prevLineCount: number) {
  if (prevLineCount > 0) {
    process.stdout.write(`\x1b[${prevLineCount}A\x1b[J`);
  }
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
  return lines.length;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function animatedWait(params: {
  readonly ms: number;
  readonly getFrame: () => ReadonlyArray<string>;
  readonly prevLineCount: { value: number };
}) {
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      params.prevLineCount.value = clearAndPrint(params.getFrame(), params.prevLineCount.value);
    }, 80);
    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, params.ms);
  });
}

export function randomMetrics(turns: number, scale: number): AgentMetrics {
  const toolNames = ["read", "bash", "grep", "find", "edit", "write"];
  const toolCount = Math.floor(Math.random() * scale * 3) + 1;
  return {
    turns,
    inputTokens: Math.floor(Math.random() * 3000 * scale) + 200,
    outputTokens: Math.floor(Math.random() * 2000 * scale) + 100,
    cost: Number((Math.random() * 0.05 * scale + 0.002).toFixed(4)),
    toolCalls: Array.from({ length: toolCount }, () => ({
      name: toolNames[Math.floor(Math.random() * toolNames.length)]!,
      args: {},
    })),
  };
}
