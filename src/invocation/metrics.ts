import { isRecord } from "../common/type-guards.js";

export type AgentMetrics = Readonly<{
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  toolCalls: ReadonlyArray<Readonly<{ name: string; args: Record<string, unknown> }>>;
}>;

export function sumMetrics(a: AgentMetrics, b: AgentMetrics): AgentMetrics {
  return {
    turns: a.turns + b.turns,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cost: a.cost + b.cost,
    toolCalls: [...a.toolCalls, ...b.toolCalls],
  };
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function extractUsage(event: Record<string, unknown>) {
  const msg = isRecord(event.message) ? event.message : undefined;
  if (msg?.role !== "assistant") return undefined;
  const usage = isRecord(msg.usage) ? msg.usage : undefined;
  if (!usage) return undefined;
  const costObj = isRecord(usage.cost) ? usage.cost : undefined;
  return { input: toNumber(usage.input), output: toNumber(usage.output), cost: toNumber(costObj?.total) };
}

export function createMetricsTracker() {
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  return {
    // Accepts AgentSessionEvent or any record — we duck-type the fields we need
    handle(event: Readonly<Record<string, unknown>>) {
      switch (event.type) {
        case "turn_end":
          turns++;
          return;
        case "message_end": {
          const usage = extractUsage(event);
          if (usage) {
            inputTokens += usage.input;
            outputTokens += usage.output;
            cost += usage.cost;
          }
          return;
        }
        case "tool_execution_start":
          toolCalls.push({
            name: typeof event.toolName === "string" ? event.toolName : "unknown",
            args: isRecord(event.args) ? event.args : {},
          });
          return;
        default:
          return;
      }
    },
    snapshot(): AgentMetrics {
      return {
        turns,
        inputTokens,
        outputTokens,
        cost,
        toolCalls: [...toolCalls],
      };
    },
  };
}
