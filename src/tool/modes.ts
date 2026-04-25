import { isRecord } from "../common/type-guards.js";
import { type AgentMetrics, sumMetrics } from "../invocation/metrics.js";
import type { RunAgentResult } from "../invocation/session-helpers.js";

export type { RunAgentResult };

export type RunAgentFn = (params: {
  readonly task: string;
  readonly onMetrics?: (metrics: AgentMetrics) => void;
}) => Promise<RunAgentResult>;

const CANCELLED_RESULT: RunAgentResult = {
  output: "",
  metrics: { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] },
  error: "Agent execution cancelled",
};

type AgentMode =
  | { readonly mode: "single"; readonly agent: string; readonly task: string }
  | { readonly mode: "parallel"; readonly tasks: ReadonlyArray<{ agent: string; task: string }> }
  | { readonly mode: "chain"; readonly chain: ReadonlyArray<{ agent: string; task: string }> };

type ModeOrError = AgentMode | { readonly error: string };

export function collectAgentNames(mode: AgentMode) {
  if (mode.mode === "single") return [mode.agent];
  if (mode.mode === "parallel") return mode.tasks.map((t) => t.agent);
  return mode.chain.map((s) => s.agent);
}

function toTaskArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { agent: string; task: string } =>
        isRecord(item) && typeof item.agent === "string" && typeof item.task === "string",
    )
    .map((item) => ({ agent: item.agent, task: item.task }));
}

export function detectMode(params: Record<string, unknown>): ModeOrError {
  const hasSingle = typeof params.agent === "string" && typeof params.task === "string";
  const hasParallel = Array.isArray(params.tasks) && params.tasks.length > 0;
  const hasChain = Array.isArray(params.chain) && params.chain.length > 0;

  const count = (hasSingle ? 1 : 0) + (hasParallel ? 1 : 0) + (hasChain ? 1 : 0);
  if (count === 0) {
    return { error: "No mode specified. Provide agent+task, tasks array, or chain array." };
  }
  if (count > 1) {
    return { error: "Multiple modes specified. Provide exactly one of: agent+task, tasks, or chain." };
  }

  if (hasSingle) return { mode: "single", agent: String(params.agent), task: String(params.task) };
  if (hasParallel) return { mode: "parallel", tasks: toTaskArray(params.tasks) };
  return { mode: "chain", chain: toTaskArray(params.chain) };
}

export async function executeParallel(params: {
  readonly tasks: ReadonlyArray<{ readonly task: string; readonly runAgent: RunAgentFn }>;
  readonly maxConcurrency: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (index: number, result: RunAgentResult) => void;
  readonly onTaskMetrics?: (index: number, metrics: AgentMetrics) => void;
}) {
  const results: Array<RunAgentResult | undefined> = new Array(params.tasks.length).fill(undefined);
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < params.tasks.length; i++) {
    if (params.signal?.aborted) {
      for (let j = i; j < params.tasks.length; j++) results[j] = CANCELLED_RESULT;
      break;
    }
    const idx = i;
    const item = params.tasks[idx];
    if (!item) continue;
    const metricsOpt = params.onTaskMetrics ? { onMetrics: (m: AgentMetrics) => params.onTaskMetrics?.(idx, m) } : {};
    const p = item.runAgent({ task: item.task, ...metricsOpt }).then((r) => {
      results[idx] = r;
      params.onProgress?.(idx, r);
      executing.delete(p);
    });
    executing.add(p);

    if (executing.size >= params.maxConcurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

  return results.map((r) => r ?? CANCELLED_RESULT);
}

export type ChainResult = Readonly<{
  output: string;
  steps: ReadonlyArray<RunAgentResult>;
}>;

export async function executeChain(params: {
  readonly steps: ReadonlyArray<{ readonly task: string; readonly runAgent: RunAgentFn }>;
  readonly signal?: AbortSignal;
  readonly onStepComplete?: (index: number, result: RunAgentResult) => void;
  readonly onStepMetrics?: (index: number, metrics: AgentMetrics) => void;
}): Promise<ChainResult> {
  let previousOutput = "";
  const completed: RunAgentResult[] = [];

  for (const [i, step] of params.steps.entries()) {
    if (params.signal?.aborted) {
      completed.push(CANCELLED_RESULT);
      return { output: previousOutput, steps: completed };
    }

    const taskWithPrevious = step.task.replaceAll("{previous}", previousOutput);
    const metricsOpt = params.onStepMetrics ? { onMetrics: (m: AgentMetrics) => params.onStepMetrics?.(i, m) } : {};
    const result = await step.runAgent({ task: taskWithPrevious, ...metricsOpt });
    completed.push(result);
    params.onStepComplete?.(i, result);

    if (result.error) {
      return { output: result.output, steps: completed };
    }

    previousOutput = result.output;
  }

  return { output: previousOutput, steps: completed };
}

export function aggregateMetricsArray(metrics: ReadonlyArray<AgentMetrics>): AgentMetrics {
  const zero: AgentMetrics = { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] };
  return metrics.reduce<AgentMetrics>((acc, m) => sumMetrics(acc, m), zero);
}
