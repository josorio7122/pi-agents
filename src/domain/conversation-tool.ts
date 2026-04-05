import { readFile } from "node:fs/promises";
import { Type } from "@sinclair/typebox";

const ReadConversationParams = Type.Object({});

export function createReadConversationTool(params: { readonly conversationLogPath: string }) {
  return {
    name: "read-conversation",
    label: "read-conversation",
    description: "Read the shared conversation log. Shows all messages between user, orchestrator, and agents.",
    parameters: ReadConversationParams,
    async execute() {
      try {
        const content = await readFile(params.conversationLogPath, "utf-8");
        const text = content.trim() || "(no conversation history yet)";
        return { content: [{ type: "text" as const, text }], details: undefined };
      } catch {
        return { content: [{ type: "text" as const, text: "(no conversation history yet)" }], details: undefined };
      }
    },
  };
}
