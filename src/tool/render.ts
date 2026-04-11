import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { colorize } from "../common/color.js";
import { workingDots } from "../common/spinner.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { BorderedBox } from "../tui/bordered-box.js";
import { formatUsageStats } from "./format.js";
import { aggregateMetrics } from "./modes.js";
import type { AgentResultDetails, AgentResultEntry, FindAgent, RenderTheme } from "./render-types.js";

// ── helpers ────────────────────────────────────────────────

function agentHeader(params: {
  readonly agentName: string;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
  readonly stepPrefix?: string;
}) {
  const { agentName, theme, findAgent, stepPrefix } = params;
  const agent = findAgent(agentName);
  const icon = agent?.icon ?? "●";
  const name = agent?.name ?? agentName;
  const styledName = agent?.color ? colorize(agent.color, theme.bold(name)) : theme.bold(name);
  const model = agent?.model ?? "";
  const modelSuffix = model ? ` ${theme.fg("dim", `(${model})`)}` : "";
  const prefix = stepPrefix ?? "";
  const mainLabel = theme.fg("accent", theme.bold("Main"));
  const arrow = theme.fg("dim", "→");
  return `${prefix}${mainLabel} ${arrow} ${icon} ${styledName}${modelSuffix}`;
}

function borderColor(theme: RenderTheme) {
  return (s: string) => theme.fg("dim", s);
}

// ── renderCall helpers ──────────────────────────────────────

function taskBox(params: {
  readonly t: Record<string, unknown>;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
  readonly mdTheme: ReturnType<typeof getMarkdownTheme>;
  readonly stepPrefix?: string;
}) {
  const { t, theme, findAgent, mdTheme, stepPrefix } = params;
  const name = typeof t.agent === "string" ? t.agent : "...";
  const task = typeof t.task === "string" ? t.task : "";
  const header = agentHeader({ agentName: name, theme, findAgent, ...(stepPrefix ? { stepPrefix } : {}) });
  const box = new BorderedBox({ header, borderColor: borderColor(theme) });
  box.addChild(new Markdown(task, 0, 0, mdTheme));
  return box;
}

function renderParallelCall(params: {
  readonly tasks: Array<Record<string, unknown>>;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
  readonly mdTheme: ReturnType<typeof getMarkdownTheme>;
}) {
  const { tasks, theme, findAgent, mdTheme } = params;
  const container = new Container();
  container.addChild(new Text(`» ${theme.bold(`parallel (${tasks.length} tasks)`)}`, 0, 0));
  for (const t of tasks) {
    container.addChild(taskBox({ t, theme, findAgent, mdTheme }));
  }
  return container;
}

function renderChainCall(params: {
  readonly chain: Array<Record<string, unknown>>;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
  readonly mdTheme: ReturnType<typeof getMarkdownTheme>;
}) {
  const { chain, theme, findAgent, mdTheme } = params;
  const container = new Container();
  container.addChild(new Text(`› ${theme.bold(`chain (${chain.length} steps)`)}`, 0, 0));
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    if (!step) continue;
    container.addChild(taskBox({ t: step, theme, findAgent, mdTheme, stepPrefix: `${i + 1}. ` }));
  }
  return container;
}

// ── renderCall ──────────────────────────────────────────────

export function renderAgentCall(params: {
  readonly args: Record<string, unknown>;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
}) {
  const { args, theme, findAgent } = params;
  const mdTheme = getMarkdownTheme();

  const tasks = Array.isArray(args?.tasks) ? (args.tasks as Array<Record<string, unknown>>) : undefined;
  const chain = Array.isArray(args?.chain) ? (args.chain as Array<Record<string, unknown>>) : undefined;

  if (tasks && tasks.length > 0) {
    return renderParallelCall({ tasks, theme, findAgent, mdTheme });
  }
  if (chain && chain.length > 0) {
    return renderChainCall({ chain, theme, findAgent, mdTheme });
  }

  // Single mode
  const agentName = typeof args?.agent === "string" ? args.agent : "...";
  const task = typeof args?.task === "string" ? args.task : "";
  const header = agentHeader({ agentName, theme, findAgent });
  const box = new BorderedBox({ header, borderColor: borderColor(theme) });
  box.addChild(new Markdown(task, 0, 0, mdTheme));
  return box;
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
  const mdTheme = getMarkdownTheme();

  if (!details?.results) {
    const box = new BorderedBox({ borderColor: borderColor(theme) });
    box.addChild(new Text(`${theme.fg("accent", `Working${workingDots()}`)}`, 0, 0));
    return box;
  }

  const showStep = details.mode === "chain";
  const container = new Container();
  container.addChild(new Spacer(1));

  for (let i = 0; i < details.results.length; i++) {
    if (i > 0) container.addChild(new Spacer(1));
    const entry = details.results[i];
    if (!entry) continue;
    container.addChild(renderResultBox({ entry, theme, findAgent, showStep, mdTheme }));
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

// ── result box ─────────────────────────────────────────────

function renderResultBox(params: {
  readonly entry: AgentResultEntry;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
  readonly showStep: boolean;
  readonly mdTheme: ReturnType<typeof getMarkdownTheme>;
}) {
  const { entry, theme, findAgent, showStep, mdTheme } = params;
  const stepPrefix = showStep && entry.step ? `${theme.fg("dim", `${entry.step}.`)} ` : "";
  const header = agentHeader({ agentName: entry.agent, theme, findAgent, stepPrefix });
  const box = new BorderedBox({ header, borderColor: borderColor(theme) });

  if (entry.status === "running") {
    const dots = workingDots();
    const stats = entry.metrics ? ` ${theme.fg("dim", formatUsageStats(entry.metrics))}` : "";
    box.addChild(new Text(`${theme.fg("accent", `Working${dots}`)}${stats}`, 0, 0));
  } else if (entry.status === "error") {
    const errorMsg = entry.error ?? "unknown error";
    box.addChild(new Text(`${theme.fg("error", "✗")} ${theme.fg("error", errorMsg)}`, 0, 0));
  } else {
    // done
    if (entry.output) {
      box.addChild(new Markdown(entry.output, 0, 0, mdTheme));
      box.addChild(new Spacer(1));
    }
    const stats = entry.metrics ? ` ${formatUsageStats(entry.metrics)}` : "";
    box.addChild(new Text(`${theme.fg("success", "✓")}${stats}`, 0, 0));
  }

  return box;
}
