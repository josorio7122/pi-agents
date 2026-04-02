import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import type { AgentMetrics } from "../invocation/metrics.js";
import { formatUsageStats } from "./format.js";

type RenderTheme = Readonly<{
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
}>;

type AgentDisplay = Readonly<{ icon: string; name: string; color: string; model: string }>;
type FindAgent = (name: string) => AgentDisplay | undefined;

export type AgentResultEntry = Readonly<{
  agent: string;
  status: "running" | "done" | "error";
  metrics?: AgentMetrics;
  error?: string;
  step?: number;
}>;

export type AgentResultDetails = Readonly<{
  mode: "single" | "parallel" | "chain";
  results: ReadonlyArray<AgentResultEntry>;
}>;

// ── renderCall ──────────────────────────────────────────────

export function renderAgentCall(params: {
  readonly args: Record<string, unknown>;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
}) {
  const { args, theme, findAgent } = params;

  const tasks = Array.isArray(args?.tasks) ? args.tasks : undefined;
  const chain = Array.isArray(args?.chain) ? args.chain : undefined;

  if (tasks && tasks.length > 0) {
    return new Text(`» ${theme.bold(`parallel (${tasks.length} tasks)`)}`, 0, 0);
  }
  if (chain && chain.length > 0) {
    return new Text(`› ${theme.bold(`chain (${chain.length} steps)`)}`, 0, 0);
  }

  const agentName = typeof args?.agent === "string" ? args.agent : "...";
  const agent = agentName !== "..." ? findAgent(agentName) : undefined;
  const icon = agent?.icon ?? "●";
  const name = agent?.name ?? agentName;
  const model = agent?.model ?? "";
  const modelSuffix = model ? ` ${theme.fg("dim", `(${model})`)}` : "";
  return new Text(`${icon} ${theme.bold(name)}${modelSuffix}`, 0, 0);
}

// ── renderResult ────────────────────────────────────────────

export function renderAgentResult(params: {
  readonly result: { details?: unknown; content: Array<{ type: string; text?: string }> };
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
}) {
  const { result, theme, findAgent } = params;
  const details = result.details as AgentResultDetails | undefined;

  if (!details?.results) {
    return new Text(theme.fg("dim", "running..."), 0, 0);
  }

  if (details.mode === "single" && details.results.length === 1) {
    return renderCard(details.results[0]!, theme, findAgent, false);
  }

  const container = new Container();
  for (let i = 0; i < details.results.length; i++) {
    if (i > 0) container.addChild(new Spacer(1));
    const entry = details.results[i]!;
    const showStep = details.mode === "chain";
    container.addChild(renderCard(entry, theme, findAgent, showStep));
  }
  return container;
}

// ── base card ───────────────────────────────────────────────

function renderCard(entry: AgentResultEntry, theme: RenderTheme, findAgent: FindAgent, showStep: boolean) {
  const agent = findAgent(entry.agent);
  const icon = agent?.icon ?? "●";

  const statusIcon = statusIndicator(entry.status, theme);
  const stats = entry.metrics ? ` ${theme.fg("dim", formatUsageStats(entry.metrics))}` : "";
  const errorSuffix = entry.error ? ` ${theme.fg("error", entry.error)}` : "";
  const stepPrefix = showStep && entry.step ? `${theme.fg("dim", `${entry.step}.`)} ` : "";

  return new Text(`${stepPrefix}${icon} ${entry.agent} ${statusIcon}${stats}${errorSuffix}`, 0, 0);
}

function statusIndicator(status: AgentResultEntry["status"], theme: RenderTheme) {
  if (status === "done") return theme.fg("success", "✓");
  if (status === "error") return theme.fg("error", "✗");
  return theme.fg("dim", "⏳");
}
