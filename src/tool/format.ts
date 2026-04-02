import type { AgentMetrics } from "../invocation/metrics.js";

export function formatTokens(count: number) {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

export function formatUsageStats(metrics: Readonly<AgentMetrics>) {
  const parts: string[] = [];
  if (metrics.turns > 0) parts.push(`${metrics.turns} turn${metrics.turns === 1 ? "" : "s"}`);
  parts.push(`↑${formatTokens(metrics.inputTokens)}`);
  parts.push(`↓${formatTokens(metrics.outputTokens)}`);
  if (metrics.toolCalls.length > 0) parts.push(`🔧${metrics.toolCalls.length}`);
  parts.push(`$${metrics.cost.toFixed(3)}`);
  return parts.join(" ");
}

export function formatToolCall(name: string, args: Readonly<Record<string, unknown>>) {
  switch (name) {
    case "bash":
      return `$ ${(args.command as string) ?? "..."}`;
    case "read":
      return `read ${(args.path as string) ?? "..."}`;
    case "write":
      return `write ${(args.path as string) ?? "..."}`;
    case "edit":
      return `edit ${(args.path as string) ?? "..."}`;
    case "grep":
      return `grep /${(args.pattern as string) ?? ""}/ in ${(args.path as string) ?? "."}`;
    case "find":
      return `find ${(args.pattern as string) ?? "*"} in ${(args.path as string) ?? "."}`;
    case "ls":
      return `ls ${(args.path as string) ?? "."}`;
    default: {
      const preview = JSON.stringify(args);
      return `${name} ${preview.length > 50 ? `${preview.slice(0, 50)}...` : preview}`;
    }
  }
}
