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

const META_TOOLS = new Set(["read-knowledge", "write-knowledge", "edit-knowledge", "read-conversation"]);

function getTextFromMessage(msg: Message) {
  if (!Array.isArray(msg.content)) return "";
  let text = "";
  for (const part of msg.content) {
    if (part.type === "text" && part.text) text += part.text;
  }
  return text;
}

function getToolCallNames(msg: Message): ReadonlyArray<string> {
  if (!Array.isArray(msg.content)) return [];
  return msg.content.filter((p) => p.type === "toolCall" && p.name).map((p) => p.name as string);
}

function hasNonMetaToolCall(msg: Message) {
  return getToolCallNames(msg).some((name) => !META_TOOLS.has(name));
}

function hasAnyToolCall(msg: Message) {
  return getToolCallNames(msg).length > 0;
}

function precedingToolResultIsMetaOnly(messages: ReadonlyArray<Message>, assistantIndex: number) {
  // Look at the tool result(s) right before this assistant message.
  // If ALL preceding tool results came from meta tools, the assistant message is noise.
  for (let j = assistantIndex - 1; j >= 0; j--) {
    const prev = messages[j];
    if (!prev) break;
    if (prev.role === "toolResult") {
      // Check the toolName on the tool result
      const toolName = (prev as Readonly<{ toolName?: string }>).toolName;
      if (toolName && !META_TOOLS.has(toolName)) return false;
      continue;
    }
    // Hit a non-toolResult message (assistant or user) → stop looking
    break;
  }
  return true;
}

export function extractAssistantOutput(messages: ReadonlyArray<Message>): string {
  // Walk backwards through assistant messages. For each one:
  // 1. Has non-meta tool calls (bash, write, delegate, etc.) → return its text
  // 2. Has ONLY meta tool calls (knowledge/conversation) → return its text
  // 3. No tool calls:
  //    a. Preceded by meta tool results only → skip (post-knowledge noise)
  //    b. Preceded by non-meta tool results → return (genuine summary)
  //
  // Fallback: if all messages were skipped, return last non-empty text.

  let fallback = "";

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;

    const text = getTextFromMessage(msg);

    // Track fallback (last non-empty text we see walking backwards)
    if (text.trim() && !fallback) fallback = text;

    // Has non-meta tool calls → this is a work message, return its text
    if (hasNonMetaToolCall(msg)) return text;

    // Has only meta tool calls → the text alongside is the findings
    if (hasAnyToolCall(msg) && text.trim()) return text;

    // No tool calls → check what preceded this message
    if (!hasAnyToolCall(msg) && text.trim()) {
      // If preceded by non-meta tool results, this IS the real summary
      if (!precedingToolResultIsMetaOnly(messages, i)) return text;
      // Otherwise it's post-knowledge noise → skip
    }
  }

  return fallback;
}
