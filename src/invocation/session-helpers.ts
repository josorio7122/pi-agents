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
  // Strategy: find the last meaningful assistant output, skipping knowledge/meta noise.
  //
  // Walk backwards through assistant messages:
  //   - Has non-meta tool calls → return its text (work message)
  //   - Has ONLY meta tool calls → skip, but remember text as candidate
  //   - No tool calls, preceded by non-meta results → return (genuine summary)
  //   - No tool calls, preceded by meta results → skip (post-knowledge noise)
  //
  // When we find a non-meta work message, check: does it have substantial text?
  // If yes, return it. If not (just a transition like "Investigating..."), check
  // if a later meta-tool message had better text (the findings alongside write-knowledge).
  //
  // Fallback chain: non-meta text → meta-tool text → last non-empty text.

  let fallback = "";
  let metaToolText = "";

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;

    const text = getTextFromMessage(msg);

    // Track fallback (last non-empty text we see walking backwards)
    if (text.trim() && !fallback) fallback = text;

    // Has non-meta tool calls → this is a work message
    if (hasNonMetaToolCall(msg)) {
      // If this work message has substantial text, return it
      if (isSubstantial(text)) return text;
      // Otherwise keep looking — earlier work messages may have the real findings.
      // Remember meta-tool text as a candidate in case we exhaust all messages.
      continue;
    }

    // Has only meta tool calls → remember text but keep looking for real work
    if (hasAnyToolCall(msg) && text.trim()) {
      if (!metaToolText) metaToolText = text;
      continue;
    }

    // No tool calls → check what preceded this message
    if (!hasAnyToolCall(msg) && text.trim()) {
      // If preceded by non-meta tool results, this IS the real summary
      if (!precedingToolResultIsMetaOnly(messages, i)) return text;
      // Otherwise it's post-knowledge noise → skip
    }
  }

  // No non-meta work found — prefer meta-tool text (likely findings alongside
  // write-knowledge), then try extracting from knowledge args, then fallback.
  return metaToolText || extractKnowledgeContent(messages) || fallback;
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
