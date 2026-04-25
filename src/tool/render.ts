import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { colorize } from "../common/color.js";
import { workingDots } from "../common/spinner.js";
import { isRecord } from "../common/type-guards.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { BorderedBox } from "../tui/bordered-box.js";
import { formatUsageStats } from "./format.js";
import { aggregateMetricsArray, detectMode } from "./modes.js";
import type { AgentResultDetails, AgentResultEntry, FindAgent, RenderTheme } from "./render-types.js";

// ── helpers ────────────────────────────────────────────────

function agentHeader(params: {
  readonly agentName: string;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
  readonly direction: "call" | "return";
  readonly stepPrefix?: string;
}) {
  const { agentName, theme, findAgent, direction, stepPrefix } = params;
  const agent = findAgent(agentName);
  const icon = agent?.icon ?? "●";
  const name = agent?.name ?? agentName;
  const styledName = agent?.color ? colorize(agent.color, theme.bold(name)) : theme.bold(name);
  const model = agent?.model ?? "";
  const modelSuffix = model ? ` ${theme.fg("dim", `(${model})`)}` : "";
  const prefix = stepPrefix ?? "";
  const mainLabel = theme.fg("accent", theme.bold("Main"));
  const arrow = theme.fg("dim", "→");
  const agentSide = `${icon} ${styledName}${modelSuffix}`;
  if (direction === "return") return `${prefix}${agentSide} ${arrow} ${mainLabel}`;
  return `${prefix}${mainLabel} ${arrow} ${agentSide}`;
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
  const header = agentHeader({
    agentName: name,
    theme,
    findAgent,
    direction: "call",
    ...(stepPrefix ? { stepPrefix } : {}),
  });
  const box = new BorderedBox({ header, borderColor: borderColor(theme) });
  box.addChild(new Markdown(task, 0, 0, mdTheme));
  return box;
}

function renderListCall(params: {
  readonly items: ReadonlyArray<{ readonly agent: string; readonly task: string }>;
  readonly title: string;
  readonly stepped: boolean;
  readonly theme: RenderTheme;
  readonly findAgent: FindAgent;
  readonly mdTheme: ReturnType<typeof getMarkdownTheme>;
}) {
  const { items, title, stepped, theme, findAgent, mdTheme } = params;
  const container = new Container();
  const symbol = stepped ? "›" : "»";
  container.addChild(new Text(`${symbol} ${theme.bold(title)}`, 0, 0));
  for (const [i, item] of items.entries()) {
    const stepPrefix = stepped ? `${i + 1}. ` : undefined;
    container.addChild(
      taskBox({ t: item as Record<string, unknown>, theme, findAgent, mdTheme, ...(stepPrefix ? { stepPrefix } : {}) }),
    );
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
  const mode = detectMode(args);

  if ("mode" in mode && mode.mode === "parallel") {
    return renderListCall({
      items: mode.tasks,
      title: `parallel (${mode.tasks.length} tasks)`,
      stepped: false,
      theme,
      findAgent,
      mdTheme,
    });
  }
  if ("mode" in mode && mode.mode === "chain") {
    return renderListCall({
      items: mode.chain,
      title: `chain (${mode.chain.length} steps)`,
      stepped: true,
      theme,
      findAgent,
      mdTheme,
    });
  }

  // Single mode (or incomplete args — defensive fallback)
  const fallbackAgent = typeof args?.agent === "string" ? args.agent : "...";
  const fallbackTask = typeof args?.task === "string" ? args.task : "";
  const single = "mode" in mode && mode.mode === "single" ? mode : undefined;
  const agentName = single ? single.agent : fallbackAgent;
  const task = single ? single.task : fallbackTask;
  const header = agentHeader({ agentName, theme, findAgent, direction: "call" });
  const box = new BorderedBox({ header, borderColor: borderColor(theme) });
  box.addChild(new Markdown(task, 0, 0, mdTheme));
  return box;
}

// ── renderResult ────────────────────────────────────────────

function isAgentResultDetails(value: unknown): value is AgentResultDetails {
  if (!isRecord(value)) return false;
  return (
    (value.mode === "single" || value.mode === "parallel" || value.mode === "chain") && Array.isArray(value.results)
  );
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
      const agg = aggregateMetricsArray(withMetrics.map((e) => e.metrics));
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
  const header = agentHeader({ agentName: entry.agent, theme, findAgent, direction: "return", stepPrefix });
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
