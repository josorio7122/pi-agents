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
}) {
  // Simple: run all concurrently up to maxConcurrency
  const results: RunAgentResult[] = [];
  const executing: Promise<void>[] = [];

  for (const item of params.tasks) {
    const p = item.runAgent({ task: item.task }).then((r) => {
      results.push(r);
    });
    executing.push(p);

    if (executing.length >= params.maxConcurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

  return results;
}

export async function executeChain(params: {
  readonly steps: ReadonlyArray<{ readonly task: string; readonly runAgent: RunAgentFn }>;
}) {
  let previousOutput = "";

  for (let i = 0; i < params.steps.length; i++) {
    const step = params.steps[i];
    if (!step) continue;

    const taskWithPrevious = step.task.replaceAll("{previous}", previousOutput);
    const result = await step.runAgent({ task: taskWithPrevious });

    if (result.error) {
      return { ...result, error: `Chain failed at step ${i + 1}: ${result.error}` };
    }

    previousOutput = result.output;

    if (i === params.steps.length - 1) {
      return result;
    }
  }

  const emptyMetrics: AgentMetrics = { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] };
  return { output: "", metrics: emptyMetrics, error: "Empty chain" };
}
