import { ANIMATION_FRAME_MS } from "../common/spinner.js";
import { createThrottle } from "../common/throttle.js";
import type { AgentConfig } from "../discovery/validator.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import type { RunAgentResult } from "./modes.js";
import { collectAgentNames, detectMode, executeChain, executeParallel } from "./modes.js";
import type { AgentResultDetails, AgentResultEntry } from "./render-types.js";
import { runningEntry, toResultEntry } from "./render-types.js";
import { truncateOutput } from "./truncate.js";

type EmitProgress = (details: AgentResultDetails) => void;
type Mode = "single" | "parallel" | "chain";
type MakeRunAgent = (
  config: AgentConfig,
  signal?: AbortSignal,
) => (p: { readonly task: string; readonly onMetrics?: (metrics: AgentMetrics) => void }) => Promise<RunAgentResult>;

function withAnimation(emitProgress: EmitProgress) {
  let lastDetails: AgentResultDetails | undefined;
  const interval = setInterval(() => {
    if (lastDetails) emitProgress(lastDetails);
  }, ANIMATION_FRAME_MS);
  return {
    update(details: AgentResultDetails) {
      lastDetails = details;
      emitProgress(details);
    },
    stop() {
      clearInterval(interval);
    },
  };
}

function withThrottledAnimation(params: {
  readonly mode: Mode;
  readonly animation: ReturnType<typeof withAnimation>;
  readonly initialEntries: ReadonlyArray<AgentResultEntry>;
}) {
  const { mode, animation } = params;
  const entries: AgentResultEntry[] = [...params.initialEntries];
  animation.update({ mode, results: [...entries] });
  const throttled = createThrottle(() => {
    animation.update({ mode, results: [...entries] });
  });
  return {
    throttled,
    setEntry(index: number, next: AgentResultEntry) {
      entries[index] = next;
      throttled.flush();
    },
    updateMetrics(index: number, metrics: AgentMetrics) {
      const prev = entries[index];
      if (prev) entries[index] = { ...prev, metrics };
      throttled();
    },
  };
}

async function executeSingleMode(params: {
  readonly mode: { readonly agent: string; readonly task: string };
  readonly findAgent: (name: string) => AgentConfig | undefined;
  readonly makeRunAgent: MakeRunAgent;
  readonly animation: ReturnType<typeof withAnimation>;
  readonly signal: AbortSignal | undefined;
}) {
  const { mode, findAgent, makeRunAgent, animation, signal } = params;
  const config = findAgent(mode.agent);
  if (!config) throw new Error(`Agent "${mode.agent}" not found`);

  const { throttled, updateMetrics } = withThrottledAnimation({
    mode: "single",
    animation,
    initialEntries: [runningEntry({ agentName: mode.agent })],
  });

  const runAgent = makeRunAgent(config, signal);
  const result = await runAgent({
    task: mode.task,
    onMetrics: (m) => updateMetrics(0, m),
  });
  throttled.flush();

  const details = { mode: "single", results: [toResultEntry({ agentName: mode.agent, result })] };
  return { content: [{ type: "text" as const, text: truncateOutput(result.output) }], details };
}

async function executeParallelMode(params: {
  readonly mode: { readonly tasks: ReadonlyArray<{ readonly agent: string; readonly task: string }> };
  readonly findAgent: (name: string) => AgentConfig | undefined;
  readonly makeRunAgent: MakeRunAgent;
  readonly animation: ReturnType<typeof withAnimation>;
  readonly signal: AbortSignal | undefined;
}) {
  const { mode, findAgent, makeRunAgent, animation, signal } = params;
  const taskDefs = mode.tasks.map((t) => {
    const agentConfig = findAgent(t.agent);
    if (!agentConfig) throw new Error(`Agent "${t.agent}" not found`);
    return { agent: t.agent, task: t.task, runAgent: makeRunAgent(agentConfig, signal) };
  });

  const { throttled, setEntry, updateMetrics } = withThrottledAnimation({
    mode: "parallel",
    animation,
    initialEntries: taskDefs.map((t) => runningEntry({ agentName: t.agent })),
  });

  const results = await executeParallel({
    tasks: taskDefs.map((t) => ({ task: t.task, runAgent: t.runAgent })),
    maxConcurrency: 4,
    ...(signal ? { signal } : {}),
    onProgress: (idx, r) => {
      const def = taskDefs[idx];
      if (def) setEntry(idx, toResultEntry({ agentName: def.agent, result: r }));
    },
    onTaskMetrics: (idx, m) => updateMetrics(idx, m),
  });
  throttled.flush();

  const finalEntries = results.map((r, i) => toResultEntry({ agentName: taskDefs[i]?.agent ?? r.output, result: r }));
  const combined = results.map((r) => r.output).join("\n\n---\n\n");
  return {
    content: [{ type: "text" as const, text: truncateOutput(combined) }],
    details: { mode: "parallel", results: finalEntries },
  };
}

async function executeChainMode(params: {
  readonly mode: { readonly chain: ReadonlyArray<{ readonly agent: string; readonly task: string }> };
  readonly findAgent: (name: string) => AgentConfig | undefined;
  readonly makeRunAgent: MakeRunAgent;
  readonly animation: ReturnType<typeof withAnimation>;
  readonly signal: AbortSignal | undefined;
}) {
  const { mode, findAgent, makeRunAgent, animation, signal } = params;
  const stepDefs = mode.chain.map((s) => {
    const agentConfig = findAgent(s.agent);
    if (!agentConfig) throw new Error(`Agent "${s.agent}" not found`);
    return { agent: s.agent, task: s.task, runAgent: makeRunAgent(agentConfig, signal) };
  });

  const { throttled, setEntry, updateMetrics } = withThrottledAnimation({
    mode: "chain",
    animation,
    initialEntries: stepDefs.map((s, i) => runningEntry({ agentName: s.agent, step: i + 1 })),
  });

  const chainResult = await executeChain({
    steps: stepDefs.map((s) => ({ task: s.task, runAgent: s.runAgent })),
    ...(signal ? { signal } : {}),
    onStepComplete: (stepIdx, r) => {
      const stepDef = stepDefs[stepIdx];
      if (stepDef) setEntry(stepIdx, toResultEntry({ agentName: stepDef.agent, result: r, step: stepIdx + 1 }));
    },
    onStepMetrics: (stepIdx, m) => updateMetrics(stepIdx, m),
  });
  throttled.flush();

  const finalEntries = chainResult.steps.map((r, i) =>
    toResultEntry({ agentName: stepDefs[i]?.agent ?? "", result: r, step: i + 1 }),
  );
  return {
    content: [{ type: "text" as const, text: truncateOutput(chainResult.output) }],
    details: { mode: "chain", results: finalEntries },
  };
}

export async function executeAgentTool(params: {
  readonly toolParams: Record<string, unknown>;
  readonly agents: ReadonlyArray<AgentConfig>;
  readonly findAgent: (name: string) => AgentConfig | undefined;
  readonly makeRunAgent: MakeRunAgent;
  readonly emitProgress: EmitProgress;
  readonly signal: AbortSignal | undefined;
}) {
  const { toolParams, agents, findAgent, makeRunAgent, emitProgress, signal } = params;

  if (signal?.aborted) throw new Error("Agent execution cancelled");

  const mode = detectMode(toolParams);
  if ("error" in mode) throw new Error(mode.error);

  const agentNames = collectAgentNames(mode);
  const unknown = agentNames.filter((name) => !findAgent(name));
  if (unknown.length > 0) {
    const available = agents.map((a) => a.frontmatter.name).join(", ");
    const unique = [...new Set(unknown)];
    throw new Error(
      `Unknown agent${unique.length > 1 ? "s" : ""}: ${unique.map((n) => `"${n}"`).join(", ")}. Available: ${available}`,
    );
  }

  const animation = withAnimation(emitProgress);
  try {
    if (mode.mode === "single") {
      return await executeSingleMode({ mode, findAgent, makeRunAgent, animation, signal });
    }
    if (mode.mode === "parallel") {
      return await executeParallelMode({ mode, findAgent, makeRunAgent, animation, signal });
    }
    return await executeChainMode({ mode, findAgent, makeRunAgent, animation, signal });
  } finally {
    animation.stop();
  }
}
