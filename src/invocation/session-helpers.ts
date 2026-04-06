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
  const { metaToolText, workText, fallback } = collectCandidates(messages);

  // Pick winner: if meta-tool text is dramatically larger than work text,
  // it's the real content (e.g., full plan alongside write-knowledge)
  // and work text is just narration ("Let me check one more...").
  if (metaToolText && workText && metaToolText.length > workText.length * 3) {
    return metaToolText;
  }
  return workText || metaToolText || extractKnowledgeContent(messages) || fallback;
}

/** Walk backwards collecting candidate outputs by category. */
function collectCandidates(messages: ReadonlyArray<Message>) {
  let metaToolText = "";
  let workText = "";
  let fallback = "";

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;

    const text = getTextFromMessage(msg);

    // Track fallback (last non-empty text we see walking backwards)
    if (text.trim() && !fallback) fallback = text;

    // Has non-meta tool calls → work message
    if (hasNonMetaToolCall(msg)) {
      if (!workText && isSubstantial(text)) workText = text;
      continue;
    }

    // Has only meta tool calls → remember text as candidate
    if (hasAnyToolCall(msg) && text.trim()) {
      if (!metaToolText) metaToolText = text;
      continue;
    }

    // No tool calls → genuine summary if preceded by non-meta results
    if (!hasAnyToolCall(msg) && text.trim()) {
      if (!workText && !precedingToolResultIsMetaOnly(messages, i)) {
        workText = text;
      }
    }
  }

  return { metaToolText, workText, fallback };
}

/** Text is substantial if it has multiple lines or is longer than a short transition phrase. */
function isSubstantial(text: string) {
  const trimmed = text.trim();
  return trimmed.includes("\n") || trimmed.length > 80;
}

/**
 * Last-resort extraction: pull content from write-knowledge tool call arguments.
 * When the agent puts its findings only in the knowledge write (not as text output),
 * this recovers the actual content.
 */
function extractKnowledgeContent(messages: ReadonlyArray<Message>) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part.type !== "toolCall" || part.name !== "write-knowledge") continue;
      const args = part as Readonly<{ arguments?: Record<string, unknown> }>;
      const content = args.arguments?.content;
      if (typeof content === "string" && content.trim().length > 0) {
        return content;
      }
    }
  }
  return "";
}
