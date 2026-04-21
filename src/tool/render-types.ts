import type { Theme } from "@mariozechner/pi-coding-agent";
import type { AgentMetrics } from "../invocation/metrics.js";
import type { RunAgentResult } from "./modes.js";

// Structural subset of Pi's Theme used by render functions.
// Spelled as `Pick<Theme, ...>` so the derivation is explicit — accepts the real
// Theme class and lightweight test fakes alike.
export type RenderTheme = Pick<Theme, "fg" | "bold">;

export type AgentDisplay = Readonly<{ icon: string; name: string; color: string; model: string }>;
export type FindAgent = (name: string) => AgentDisplay | undefined;

export type AgentResultEntry = Readonly<{
  agent: string;
  status: "running" | "done" | "error";
  metrics?: AgentMetrics;
  error?: string;
  step?: number;
  output?: string;
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
  const base = { agent: agentName, status, metrics: result.metrics, output: result.output };
  return { ...base, ...(result.error ? { error: result.error } : {}), ...(step !== undefined ? { step } : {}) };
}

export function runningEntry(params: { readonly agentName: string; readonly step?: number }): AgentResultEntry {
  return { agent: params.agentName, status: "running", ...(params.step !== undefined ? { step: params.step } : {}) };
}
