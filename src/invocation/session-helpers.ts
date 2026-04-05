import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ContextFile } from "../common/context-files.js";
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
  customTools?: ReadonlyArray<unknown>;
  sharedContext?: ReadonlyArray<ContextFile>;
}>;

export type RunAgentResult = Readonly<{
  output: string;
  metrics: AgentMetrics;
  error?: string;
}>;

type MessagePart = Readonly<{ type: string; text?: string }>;
type MessageContent = string | ReadonlyArray<MessagePart>;
type Message = Readonly<{ role: string; content?: MessageContent }>;

export function extractAssistantOutput(messages: ReadonlyArray<Message>): string {
  let output = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "text") output += part.text;
      }
      break;
    }
  }
  return output;
}
