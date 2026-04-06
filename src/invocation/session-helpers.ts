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

type MessagePart = Readonly<{ type: string; text?: string; name?: string }>;
type MessageContent = string | ReadonlyArray<MessagePart>;
type Message = Readonly<{ role: string; content?: MessageContent }>;

const META_WRITE_TOOLS = new Set(["write-knowledge", "edit-knowledge"]);

function getTextFromMessage(msg: Message) {
  if (!Array.isArray(msg.content)) return "";
  let text = "";
  for (const part of msg.content) {
    if (part.type === "text" && part.text) text += part.text;
  }
  return text;
}

export function extractAssistantOutput(messages: ReadonlyArray<Message>): string {
  // Contract: agents write their report BEFORE calling write-knowledge.
  // Find the last meta-write call → everything before it is output, everything after is noise.
  const boundary = findLastMetaWriteIndex(messages);
  if (boundary < 0) return findLastNonEmptyText(messages, messages.length - 1);

  // Take the last non-empty assistant text strictly BEFORE the meta-write.
  return findLastNonEmptyText(messages, boundary - 1);
}

/** Index of the last assistant message containing a write-knowledge or edit-knowledge call. */
function findLastMetaWriteIndex(messages: ReadonlyArray<Message>) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant" || !Array.isArray(msg.content)) continue;
    if (msg.content.some((p) => p.type === "toolCall" && META_WRITE_TOOLS.has(p.name))) return i;
  }
  return -1;
}

/** Walk backwards from `end` and return the last non-empty assistant text. */
function findLastNonEmptyText(messages: ReadonlyArray<Message>, end: number) {
  for (let i = end; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const text = getTextFromMessage(msg);
    if (text.trim()) return text;
  }
  return "";
}
