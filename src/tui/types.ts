import type { AgentMetrics } from "../invocation/metrics.js";

export type AgentStatus = Readonly<
  | { status: "idle" }
  | { status: "running"; metrics?: AgentMetrics }
  | { status: "done"; metrics: AgentMetrics }
  | { status: "error"; error: string; metrics?: AgentMetrics }
>;

export type ConversationEvent = Readonly<
  { type: "delegation"; from: string; to: string; task: string } | { type: "response"; agent: string; output: string }
>;
