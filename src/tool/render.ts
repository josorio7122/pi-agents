import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import type { AgentMetrics } from "../invocation/metrics.js";
import { formatToolCall, formatUsageStats } from "./format.js";

export function renderAgentCall(params: {
  readonly args: Record<string, unknown>;
  readonly theme: { fg: (color: string, text: string) => string; bold: (text: string) => string };
  readonly findAgent: (name: string) => { icon: string; name: string; color: string; model: string } | undefined;
}) {
  const { args, theme, findAgent } = params;
  const agentName = (args.agent as string) ?? "...";
  const agent = findAgent(agentName);

  const icon = agent?.icon ?? "●";
  const name = agent?.name ?? agentName;
  const color = agent?.color ?? "accent";
  const model = agent?.model ?? "";

  let text = `${icon}  ${theme.fg(color, theme.bold(name))}`;
  if (model) text += ` ${theme.fg("dim", `(${model})`)}`;

  return new Text(text, 0, 0);
}

export function renderAgentResult(params: {
  readonly result: { details?: unknown; content: Array<{ type: string; text?: string }> };
  readonly isPartial: boolean;
  readonly expanded: boolean;
  readonly theme: { fg: (color: string, text: string) => string; bold: (text: string) => string };
}) {
  const { result, isPartial, expanded, theme } = params;

  if (isPartial) {
    return new Text(theme.fg("dim", "thinking..."), 0, 0);
  }

  const details = result.details as { output?: string; task?: string; metrics?: AgentMetrics } | undefined;
  const output = details?.output ?? result.content[0]?.text ?? "(no output)";
  const metrics = details?.metrics;

  if (expanded && metrics) {
    const container = new Container();

    container.addChild(new Text(theme.fg("dim", formatUsageStats(metrics)), 0, 0));

    if (details?.task) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("muted", "─── Task ───"), 0, 0));
      container.addChild(new Text(theme.fg("dim", details.task), 0, 0));
    }

    if (metrics.toolCalls.length > 0) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("muted", `─── Tools (${metrics.toolCalls.length} calls) ───`), 0, 0));
      for (const tc of metrics.toolCalls) {
        container.addChild(new Text(`${theme.fg("muted", "→ ")}${formatToolCall(tc.name, tc.args)}`, 0, 0));
      }
    }

    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
    container.addChild(new Text(output, 0, 0));

    return container;
  }

  // Collapsed
  let text = "";
  if (metrics) text += `${theme.fg("dim", formatUsageStats(metrics))}\n`;
  text += output;
  if (metrics && metrics.toolCalls.length > 0) {
    text += `\n${theme.fg("muted", `${metrics.toolCalls.length} tool calls (Ctrl+O to expand)`)}`;
  }

  return new Text(text, 0, 0);
}
