import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReadConversationTool } from "./conversation-tool.js";

function extractText(result: { content: ReadonlyArray<{ type: string; text?: string }> }) {
  const first = result.content[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

describe("createReadConversationTool", () => {
  it("has name read-conversation", () => {
    const tool = createReadConversationTool({ conversationLogPath: "/tmp/fake.jsonl" });
    expect(tool.name).toBe("read-conversation");
  });

  it("reads conversation log content", async () => {
    const dir = mkdtempSync(join(tmpdir(), "conv-tool-"));
    const logPath = join(dir, "conversation.jsonl");
    writeFileSync(logPath, '{"from":"user","to":"orchestrator","message":"hello"}\n');

    const tool = createReadConversationTool({ conversationLogPath: logPath });
    const result = await tool.execute();
    const text = extractText(result);
    expect(text).toContain("hello");
    expect(text).toContain("orchestrator");
  });

  it("returns placeholder for non-existent file", async () => {
    const tool = createReadConversationTool({ conversationLogPath: "/tmp/nonexistent-conv.jsonl" });
    const result = await tool.execute();
    const text = extractText(result);
    expect(text).toContain("no conversation history yet");
  });

  it("returns placeholder for empty file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "conv-tool-"));
    const logPath = join(dir, "conversation.jsonl");
    writeFileSync(logPath, "");

    const tool = createReadConversationTool({ conversationLogPath: logPath });
    const result = await tool.execute();
    const text = extractText(result);
    expect(text).toContain("no conversation history yet");
  });
});
