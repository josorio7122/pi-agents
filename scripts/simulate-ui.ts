/**
 * Simulates real agent TUI rendering with ANSI colors and streaming updates.
 *
 * Usage: npx tsx scripts/simulate-ui.ts [single|parallel|chain|all]
 * Default: all
 */
import type { AgentResultEntry } from "../src/tool/render.js";
import { animatedWait, clearAndPrint, randomMetrics, renderFrame, sleep, theme } from "./simulate-helpers.js";

async function simulateSingle() {
  console.log(theme.fg("accent", "\n━━━ SINGLE MODE: scout analyzing project ━━━\n"));
  const callArgs = { agent: "scout", task: "analyze the project structure and list all modules" };
  const lc = { value: 0 };
  let entry: AgentResultEntry = { agent: "scout", status: "running" };
  const getFrame = () => renderFrame(callArgs, { mode: "single", results: [entry] });
  await animatedWait({ ms: 800, getFrame, prevLineCount: lc });
  for (let turn = 1; turn <= 4; turn++) {
    entry = { agent: "scout", status: "running", metrics: randomMetrics(turn, turn * 0.5) };
    await animatedWait({ ms: 600, getFrame, prevLineCount: lc });
  }
  entry = { agent: "scout", status: "done", metrics: randomMetrics(5, 3) };
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
  await animatedWait({ ms: 800, getFrame, prevLineCount: lc });
  for (let tick = 0; tick < 3; tick++) {
    for (let i = 0; i < 4; i++) {
      if (entries[i]!.status === "running") {
        const prev = entries[i]!.metrics;
        const turns = (prev?.turns ?? 0) + (Math.random() > 0.5 ? 1 : 0);
        entries[i] = { agent: "scout", status: "running", metrics: randomMetrics(Math.max(1, turns), tick + 1) };
      }
    }
    await animatedWait({ ms: 500, getFrame, prevLineCount: lc });
  }
  entries[0] = { agent: "scout", status: "done", metrics: randomMetrics(3, 2) };
  entries[1] = { agent: "scout", status: "done", metrics: randomMetrics(4, 2.5) };
  await animatedWait({ ms: 700, getFrame, prevLineCount: lc });
  entries[2] = { agent: "scout", status: "done", metrics: randomMetrics(2, 1.5) };
  entries[3] = { agent: "scout", status: "running", metrics: randomMetrics(5, 3) };
  await animatedWait({ ms: 600, getFrame, prevLineCount: lc });
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
  await animatedWait({ ms: 800, getFrame, prevLineCount: lc });
  for (let tick = 0; tick < 3; tick++) {
    entries[0] = { agent: "scout", status: "running", step: 1, metrics: randomMetrics(tick + 1, tick + 1) };
    await animatedWait({ ms: 400, getFrame, prevLineCount: lc });
  }
  entries[0] = { agent: "scout", status: "done", step: 1, metrics: randomMetrics(3, 2) };
  await animatedWait({ ms: 600, getFrame, prevLineCount: lc });
  for (let tick = 0; tick < 4; tick++) {
    entries[1] = {
      agent: "investigator",
      status: "running",
      step: 2,
      metrics: randomMetrics(tick + 1, (tick + 1) * 1.5),
    };
    await animatedWait({ ms: 400, getFrame, prevLineCount: lc });
  }
  entries[1] = { agent: "investigator", status: "done", step: 2, metrics: randomMetrics(5, 4) };
  await animatedWait({ ms: 600, getFrame, prevLineCount: lc });
  for (let tick = 0; tick < 3; tick++) {
    entries[2] = {
      agent: "code-reviewer",
      status: "running",
      step: 3,
      metrics: randomMetrics(tick + 1, (tick + 1) * 2),
    };
    await animatedWait({ ms: 400, getFrame, prevLineCount: lc });
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
  await animatedWait({ ms: 800, getFrame, prevLineCount: lc });
  entries[0] = { agent: "scout", status: "running", metrics: randomMetrics(2, 1) };
  entries[1] = { agent: "backend-dev", status: "running", metrics: randomMetrics(1, 0.5) };
  await animatedWait({ ms: 600, getFrame, prevLineCount: lc });
  entries[0] = { agent: "scout", status: "done", metrics: randomMetrics(3, 2) };
  entries[1] = {
    agent: "backend-dev",
    status: "error",
    error: "Domain violation: write to /etc/hosts blocked",
    metrics: randomMetrics(2, 1),
  };
  lc.value = clearAndPrint(getFrame(), lc.value);
  await sleep(500);
}

const mode = process.argv[2] ?? "all";

async function main() {
  if (mode === "single" || mode === "all") await simulateSingle();
  if (mode === "parallel" || mode === "all") await simulateParallel();
  if (mode === "chain" || mode === "all") await simulateChain();
  if (mode === "error" || mode === "all") await simulateError();
  console.log("");
}

main().catch(console.error);
