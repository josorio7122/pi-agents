import { Type } from "@sinclair/typebox";
import { readFileSafe } from "../common/fs.js";

const ReadConversationParams = Type.Object({});

export function createReadConversationTool(params: { readonly conversationLogPath: string }) {
  return {
    name: "read-conversation",
    label: "read-conversation",
    description: "Read the shared conversation log. Shows all messages between user, orchestrator, and agents.",
    parameters: ReadConversationParams,
    async execute() {
      const content = await readFileSafe(params.conversationLogPath);
      const text = content.trim() || "(no conversation history yet)";
      return { content: [{ type: "text" as const, text }], details: undefined };
    },
  };
}
