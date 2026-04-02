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
  if (metrics.toolCalls.length > 0)
    parts.push(`${metrics.toolCalls.length} tool${metrics.toolCalls.length === 1 ? "" : "s"}`);
  parts.push(`$${metrics.cost.toFixed(3)}`);
  return parts.join(" ");
}

function str(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function formatToolCall(name: string, args: Readonly<Record<string, unknown>>) {
  switch (name) {
    case "bash":
      return `$ ${str(args.command, "...")}`;
    case "read":
      return `read ${str(args.path, "...")}`;
    case "write":
      return `write ${str(args.path, "...")}`;
    case "edit":
      return `edit ${str(args.path, "...")}`;
    case "grep":
      return `grep /${str(args.pattern, "")}/ in ${str(args.path, ".")}`;
    case "find":
      return `find ${str(args.pattern, "*")} in ${str(args.path, ".")}`;
    case "ls":
      return `ls ${str(args.path, ".")}`;
    default: {
      const preview = JSON.stringify(args);
      return `${name} ${preview.length > 50 ? `${preview.slice(0, 50)}...` : preview}`;
    }
  }
}
