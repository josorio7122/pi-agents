import type { AgentMetrics } from "../invocation/metrics.js";

export type RunAgentResult = Readonly<{
  output: string;
  metrics: AgentMetrics;
  error?: string;
}>;

export type RunAgentFn = (params: { readonly task: string }) => Promise<RunAgentResult>;

type AgentMode =
  | { readonly mode: "single"; readonly agent: string; readonly task: string }
  | { readonly mode: "parallel"; readonly tasks: ReadonlyArray<{ agent: string; task: string }> }
  | { readonly mode: "chain"; readonly chain: ReadonlyArray<{ agent: string; task: string }> };

type ModeOrError = AgentMode | { readonly error: string };

export function detectMode(params: Record<string, unknown>): ModeOrError {
  const hasSingle = typeof params.agent === "string" && typeof params.task === "string";
  const hasParallel = Array.isArray(params.tasks) && params.tasks.length > 0;
  const hasChain = Array.isArray(params.chain) && params.chain.length > 0;

  const count = Number(hasSingle) + Number(hasParallel) + Number(hasChain);
  if (count === 0) return { error: "No mode specified. Provide agent+task, tasks array, or chain array." };
  if (count > 1) return { error: "Multiple modes specified. Provide exactly one of: agent+task, tasks, or chain." };

  if (hasSingle) return { mode: "single", agent: params.agent as string, task: params.task as string };
  if (hasParallel) return { mode: "parallel", tasks: params.tasks as Array<{ agent: string; task: string }> };
  return { mode: "chain", chain: params.chain as Array<{ agent: string; task: string }> };
}

export async function executeSingle(params: { readonly task: string; readonly runAgent: RunAgentFn }) {
  return params.runAgent({ task: params.task });
}

export async function executeParallel(params: {
  readonly tasks: ReadonlyArray<{ readonly task: string; readonly runAgent: RunAgentFn }>;
  readonly maxConcurrency: number;
  readonly onProgress?: (index: number, result: RunAgentResult) => void;
}) {
  const results: Array<RunAgentResult | undefined> = new Array(params.tasks.length).fill(undefined);
  const executing: Promise<void>[] = [];

  for (let i = 0; i < params.tasks.length; i++) {
    const idx = i;
    const item = params.tasks[idx]!;
    const p = item.runAgent({ task: item.task }).then((r) => {
      results[idx] = r;
      params.onProgress?.(idx, r);
    });
    executing.push(p);

    if (executing.length >= params.maxConcurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

  return results as RunAgentResult[];
}

export type ChainResult = Readonly<{
  output: string;
  steps: ReadonlyArray<RunAgentResult>;
}>;

export async function executeChain(params: {
  readonly steps: ReadonlyArray<{ readonly task: string; readonly runAgent: RunAgentFn }>;
  readonly onStepComplete?: (index: number, result: RunAgentResult) => void;
}): Promise<ChainResult> {
  let previousOutput = "";
  const completed: RunAgentResult[] = [];

  for (let i = 0; i < params.steps.length; i++) {
    const step = params.steps[i];
    if (!step) continue;

    const taskWithPrevious = step.task.replaceAll("{previous}", previousOutput);
    const result = await step.runAgent({ task: taskWithPrevious });
    completed.push(result);
    params.onStepComplete?.(i, result);

    if (result.error) {
      return { output: result.output, steps: completed };
    }

    previousOutput = result.output;
  }

  return { output: previousOutput, steps: completed };
}

export function aggregateMetrics(results: ReadonlyArray<RunAgentResult>): AgentMetrics {
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  for (const r of results) {
    turns += r.metrics.turns;
    inputTokens += r.metrics.inputTokens;
    outputTokens += r.metrics.outputTokens;
    cost += r.metrics.cost;
    toolCalls.push(...r.metrics.toolCalls);
  }

  return { turns, inputTokens, outputTokens, cost, toolCalls };
}
