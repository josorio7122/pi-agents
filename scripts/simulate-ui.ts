/**
 * Simulates real agent TUI rendering with ANSI colors and streaming updates.
 *
 * Usage: npx tsx scripts/simulate-ui.ts [single|parallel|chain|all]
 * Default: all
 */
import type { AgentMetrics } from "../src/invocation/metrics.js";
import { renderAgentCall, renderAgentResult } from "../src/tool/render.js";
import type { AgentResultDetails, AgentResultEntry } from "../src/tool/render.js";

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

const theme = {
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

const findAgent = (name: string) => AGENTS[name];

// ── Helpers ─────────────────────────────────────────────────

const WIDTH = process.stdout.columns || 100;

function renderFrame(callArgs: Record<string, unknown>, details: AgentResultDetails) {
  const call = renderAgentCall({ args: callArgs, theme, findAgent });
  const result = renderAgentResult({
    result: { content: [{ type: "text", text: "" }], details },
    theme,
    findAgent,
  });

  // Clear screen area and redraw
  const callLines = call.render(WIDTH);
  const resultLines = result.render(WIDTH);
  return [...callLines, ...resultLines];
}

function clearAndPrint(lines: ReadonlyArray<string>, prevLineCount: number) {
  if (prevLineCount > 0) {
    process.stdout.write(`\x1b[${prevLineCount}A\x1b[J`);
  }
  for (const line of lines) {
    process.stdout.write(line + "\n");
  }
  return lines.length;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function animatedWait(
  ms: number,
  getFrame: () => ReadonlyArray<string>,
  prevLineCount: { value: number },
) {
  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      prevLineCount.value = clearAndPrint(getFrame(), prevLineCount.value);
    }, 80);
    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, ms);
  });
}

function randomMetrics(turns: number, scale: number): AgentMetrics {
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

// ── Scenarios ───────────────────────────────────────────────

async function simulateSingle() {
  console.log(theme.fg("accent", "\n━━━ SINGLE MODE: scout analyzing project ━━━\n"));

  const callArgs = { agent: "scout", task: "analyze the project structure and list all modules" };
  const agentName = "scout";
  const lc = { value: 0 };

  // Phase 1: running, no metrics yet
  let entry: AgentResultEntry = { agent: agentName, status: "running" };
  const getFrame = () => renderFrame(callArgs, { mode: "single", results: [entry] });
  await animatedWait(800, getFrame, lc);

  // Phase 2-5: streaming metrics updates
  for (let turn = 1; turn <= 4; turn++) {
    entry = { agent: agentName, status: "running", metrics: randomMetrics(turn, turn * 0.5) };
    await animatedWait(600, getFrame, lc);
  }

  // Phase 6: done
  entry = { agent: agentName, status: "done", metrics: randomMetrics(5, 3) };
  lc.value = clearAndPrint(getFrame(), lc.value);
  await sleep(500);
}

async function simulateParallel() {
  console.log(theme.fg("accent", "\n━━━ PARALLEL MODE: 4 scouts analyzing different dirs ━━━\n"));

  const callArgs = {
    tasks: [
      { agent: "scout", task: "analyze src/schema/" },
      { agent: "scout", task: "analyze src/domain/" },
      { agent: "scout", task: "analyze src/tool/" },
      { agent: "scout", task: "analyze src/invocation/" },
    ],
  };

  const entries: AgentResultEntry[] = [
    { agent: "scout", status: "running" },
    { agent: "scout", status: "running" },
    { agent: "scout", status: "running" },
    { agent: "scout", status: "running" },
  ];
  const lc = { value: 0 };
  const getFrame = () => renderFrame(callArgs, { mode: "parallel", results: [...entries] });

  await animatedWait(800, getFrame, lc);

  for (let tick = 0; tick < 3; tick++) {
    for (let i = 0; i < 4; i++) {
      if (entries[i]!.status === "running") {
        const prev = entries[i]!.metrics;
        const turns = (prev?.turns ?? 0) + (Math.random() > 0.5 ? 1 : 0);
        entries[i] = { agent: "scout", status: "running", metrics: randomMetrics(Math.max(1, turns), tick + 1) };
      }
    }
    await animatedWait(500, getFrame, lc);
  }

  entries[0] = { agent: "scout", status: "done", metrics: randomMetrics(3, 2) };
  entries[1] = { agent: "scout", status: "done", metrics: randomMetrics(4, 2.5) };
  await animatedWait(700, getFrame, lc);

  entries[2] = { agent: "scout", status: "done", metrics: randomMetrics(2, 1.5) };
  entries[3] = { agent: "scout", status: "running", metrics: randomMetrics(5, 3) };
  await animatedWait(600, getFrame, lc);

  entries[3] = { agent: "scout", status: "done", metrics: randomMetrics(6, 3.5) };
  lc.value = clearAndPrint(getFrame(), lc.value);
  await sleep(500);
}

async function simulateChain() {
  console.log(theme.fg("accent", "\n━━━ CHAIN MODE: scout → investigator → code-reviewer ━━━\n"));

  const callArgs = {
    chain: [
      { agent: "scout", task: "find all auth-related code" },
      { agent: "investigator", task: "analyze security of {previous}" },
      { agent: "code-reviewer", task: "review findings from {previous}" },
    ],
  };

  const entries: AgentResultEntry[] = [
    { agent: "scout", status: "running", step: 1 },
    { agent: "investigator", status: "running", step: 2 },
    { agent: "code-reviewer", status: "running", step: 3 },
  ];
  const lc = { value: 0 };
  const getFrame = () => renderFrame(callArgs, { mode: "chain", results: [...entries] });

  await animatedWait(800, getFrame, lc);

  for (let tick = 0; tick < 3; tick++) {
    entries[0] = { agent: "scout", status: "running", step: 1, metrics: randomMetrics(tick + 1, tick + 1) };
    await animatedWait(400, getFrame, lc);
  }

  entries[0] = { agent: "scout", status: "done", step: 1, metrics: randomMetrics(3, 2) };
  await animatedWait(600, getFrame, lc);

  for (let tick = 0; tick < 4; tick++) {
    entries[1] = { agent: "investigator", status: "running", step: 2, metrics: randomMetrics(tick + 1, (tick + 1) * 1.5) };
    await animatedWait(400, getFrame, lc);
  }

  entries[1] = { agent: "investigator", status: "done", step: 2, metrics: randomMetrics(5, 4) };
  await animatedWait(600, getFrame, lc);

  for (let tick = 0; tick < 3; tick++) {
    entries[2] = { agent: "code-reviewer", status: "running", step: 3, metrics: randomMetrics(tick + 1, (tick + 1) * 2) };
    await animatedWait(400, getFrame, lc);
  }

  entries[2] = { agent: "code-reviewer", status: "done", step: 3, metrics: randomMetrics(4, 5) };
  lc.value = clearAndPrint(getFrame(), lc.value);
  await sleep(500);
}

async function simulateError() {
  console.log(theme.fg("accent", "\n━━━ ERROR SCENARIO: parallel with one failure ━━━\n"));

  const callArgs = {
    tasks: [
      { agent: "scout", task: "analyze src/" },
      { agent: "backend-dev", task: "refactor module" },
    ],
  };

  const entries: AgentResultEntry[] = [
    { agent: "scout", status: "running" },
    { agent: "backend-dev", status: "running" },
  ];
  const lc = { value: 0 };
  const getFrame = () => renderFrame(callArgs, { mode: "parallel", results: [...entries] });

  await animatedWait(800, getFrame, lc);

  entries[0] = { agent: "scout", status: "running", metrics: randomMetrics(2, 1) };
  entries[1] = { agent: "backend-dev", status: "running", metrics: randomMetrics(1, 0.5) };
  await animatedWait(600, getFrame, lc);

  entries[0] = { agent: "scout", status: "done", metrics: randomMetrics(3, 2) };
  entries[1] = { agent: "backend-dev", status: "error", error: "Domain violation: write to /etc/hosts blocked", metrics: randomMetrics(2, 1) };
  lc.value = clearAndPrint(getFrame(), lc.value);
  await sleep(500);
}

// ── Main ────────────────────────────────────────────────────

const mode = process.argv[2] ?? "all";

async function main() {
  if (mode === "single" || mode === "all") await simulateSingle();
  if (mode === "parallel" || mode === "all") await simulateParallel();
  if (mode === "chain" || mode === "all") await simulateChain();
  if (mode === "error" || mode === "all") await simulateError();
  console.log("");
}

main().catch(console.error);
