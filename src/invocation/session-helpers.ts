import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ContextFile } from "../common/context-files.js";
import type { ExecutableTool } from "../common/tool-types.js";
import type { AgentConfig } from "../discovery/validator.js";
import type { AgentMetrics } from "./metrics.js";

export type RunAgentParams = Readonly<{
  agentConfig: AgentConfig;
  task: string;
  cwd: string;
  sessionDir: string;
  conversationLogPath: string;
  modelRegistry: ModelRegistry;
  modelOverride?: Model<Api>;
  signal?: AbortSignal;
  onUpdate?: (metrics: AgentMetrics) => void;
  caller?: string;
  extraVariables?: Readonly<Record<string, string>>;
  customTools?: ReadonlyArray<ExecutableTool>;
  sharedContext?: ReadonlyArray<ContextFile>;
}>;

export type RunAgentResult = Readonly<{
  output: string;
  metrics: AgentMetrics;
  error?: string;
}>;

/**
 * Internal message shape for output extraction. Pi does not currently
 * export a type that captures both `role === "toolResult"` with `toolName`
 * AND `role === "assistant"` with text-array content in a single union,
 * so we duck-type the fields we need. Replace with pi's type once it exists.
 */
type MessagePart = Readonly<{ type: string; text?: string; name?: string }>;
type MessageContent = string | ReadonlyArray<MessagePart>;
type Message = Readonly<{ role: string; content?: MessageContent; toolName?: string }>;

export function extractAssistantOutput(messages: ReadonlyArray<Message>): string {
  // Primary: find the last submit tool result — that IS the agent's output
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "toolResult" && m.toolName === "submit") return getTextFromContent(m.content);
  }

  // Fallback: last non-empty assistant text (agent didn't call submit)
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const text = getTextFromContent(m.content);
    if (text.trim()) return text;
  }
  return "";
}

function getTextFromContent(content: MessageContent | undefined) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is MessagePart & { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}
