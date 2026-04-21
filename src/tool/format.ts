import type { AgentMetrics } from "../invocation/metrics.js";

export function formatTokens(count: number) {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

export function formatUsageStats(metrics: Readonly<AgentMetrics>) {
  const turns = metrics.turns > 0 ? `${metrics.turns} turn${metrics.turns === 1 ? "" : "s"}` : "";
  const toolCount = metrics.toolCalls.length;
  const tools = toolCount > 0 ? `${toolCount} tool${toolCount === 1 ? "" : "s"}` : "";
  const input = `↑${formatTokens(metrics.inputTokens)}`;
  const output = `↓${formatTokens(metrics.outputTokens)}`;
  const cost = `$${metrics.cost.toFixed(3)}`;
  return [turns, input, output, tools, cost].filter((s) => s !== "").join(" ");
}
