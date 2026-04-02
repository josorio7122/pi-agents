import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { Container, Spacer, Text } from "@mariozechner/pi-tui";
import { colorize } from "../common/color.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { formatUsageStats } from "./format.js";
import type { RunAgentResult } from "./modes.js";
import { aggregateMetrics } from "./modes.js";

// Structural subset of Theme used by render functions.
// Accepts Pi's Theme class and lightweight test fakes alike.
export type RenderTheme = Readonly<{
  fg: (color: ThemeColor, text: string) => string;
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

export function toResultEntry(params: {
  readonly agentName: string;
  readonly result: RunAgentResult;
  readonly step?: number;
}): AgentResultEntry {
  const { agentName, result, step } = params;
  const status: AgentResultEntry["status"] = result.error ? "error" : "done";
  const base = { agent: agentName, status, metrics: result.metrics };
  return { ...base, ...(result.error ? { error: result.error } : {}), ...(step !== undefined ? { step } : {}) };
}

export function runningEntry(params: { readonly agentName: string; readonly step?: number }): AgentResultEntry {
  return { agent: params.agentName, status: "running", ...(params.step !== undefined ? { step: params.step } : {}) };
}

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
  const styledName = agent?.color ? colorize(agent.color, theme.bold(name)) : theme.bold(name);
  const model = agent?.model ?? "";
  const modelSuffix = model ? ` ${theme.fg("dim", `(${model})`)}` : "";
  return new Text(`${icon} ${styledName}${modelSuffix}`, 0, 0);
}

// ── renderResult ────────────────────────────────────────────

function isAgentResultDetails(value: unknown): value is AgentResultDetails {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (v.mode === "single" || v.mode === "parallel" || v.mode === "chain") && Array.isArray(v.results);
}

export function renderAgentResult(params: {
  readonly result: { details?: unknown; content: Array<{ type: string; text?: string }> };
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
}) {
  const { result, theme, findAgent } = params;
  const details = isAgentResultDetails(result.details) ? result.details : undefined;

  if (!details?.results) {
    return new Text(theme.fg("dim", "running..."), 0, 0);
  }

  const isSingle = details.mode === "single" && details.results.length === 1;
  const showStep = details.mode === "chain";
  const container = new Container();
  container.addChild(new Spacer(1));
  for (let i = 0; i < details.results.length; i++) {
    if (i > 0) container.addChild(new Spacer(1));
    container.addChild(
      isSingle
        ? renderCompactCard(details.results[i]!, theme)
        : renderCard({ entry: details.results[i]!, theme, findAgent, showStep }),
    );
  }

  if (details.results.length > 1) {
    const withMetrics = details.results.filter((e): e is AgentResultEntry & { metrics: AgentMetrics } => !!e.metrics);
    if (withMetrics.length > 0) {
      const agg = aggregateMetrics(withMetrics.map((e) => ({ output: "", metrics: e.metrics })));
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("dim", `Σ ${formatUsageStats(agg)}`), 0, 0));
    }
  }

  return container;
}

// ── base card ───────────────────────────────────────────────

function renderCompactCard(entry: AgentResultEntry, theme: RenderTheme) {
  const statusIcon = statusIndicator(entry.status, theme);
  const stats = entry.metrics ? ` ${theme.fg("dim", formatUsageStats(entry.metrics))}` : "";
  const errorSuffix = entry.error ? ` ${theme.fg("error", entry.error)}` : "";
  return new Text(`${statusIcon}${stats}${errorSuffix}`, 0, 0);
}

function renderCard(params: {
  readonly entry: AgentResultEntry;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
  readonly showStep: boolean;
}) {
  const { entry, theme, findAgent, showStep } = params;
  const agent = findAgent(entry.agent);
  const icon = agent?.icon ?? "●";

  const styledName = agent?.color ? colorize(agent.color, entry.agent) : entry.agent;
  const statusIcon = statusIndicator(entry.status, theme);
  const stats = entry.metrics ? ` ${theme.fg("dim", formatUsageStats(entry.metrics))}` : "";
  const errorSuffix = entry.error ? ` ${theme.fg("error", entry.error)}` : "";
  const stepPrefix = showStep && entry.step ? `${theme.fg("dim", `${entry.step}.`)} ` : "";

  return new Text(`${stepPrefix}${icon} ${styledName} ${statusIcon}${stats}${errorSuffix}`, 0, 0);
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function statusIndicator(status: AgentResultEntry["status"], theme: RenderTheme) {
  if (status === "done") return theme.fg("success", "✓");
  if (status === "error") return theme.fg("error", "✗");
  const frame = SPINNER_FRAMES[Math.floor(Date.now() / 80) % SPINNER_FRAMES.length]!;
  return theme.fg("accent", frame);
}
