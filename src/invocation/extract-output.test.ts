import { describe, expect, it } from "vitest";
import { extractAssistantOutput } from "./session-helpers.js";

function assistant(parts: ReadonlyArray<{ type: string; text?: string; name?: string }>) {
  return { role: "assistant" as const, content: parts };
}

function text(t: string) {
  return { type: "text" as const, text: t };
}

function toolCall(name: string) {
  return { type: "toolCall" as const, name, id: "tc-1", arguments: {} };
}

function submitResult(response: string) {
  return { role: "toolResult" as const, toolName: "submit", content: [text(response)], toolCallId: "tc-1" };
}

function toolResult(toolName: string) {
  return { role: "toolResult" as const, content: [text("ok")], toolCallId: "tc-1", toolName };
}

function user(t: string) {
  return { role: "user" as const, content: t };
}

describe("extractAssistantOutput", () => {
  // === Submit tool — primary extraction ===

  it("extracts response from submit tool result", () => {
    const messages = [
      user("Scout the codebase"),
      assistant([toolCall("read")]),
      toolResult("read"),
      assistant([toolCall("submit")]),
      submitResult("## Report\n\nFound 3 files."),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Report\n\nFound 3 files.");
  });

  it("ignores assistant text and uses submit result", () => {
    const messages = [
      user("Investigate"),
      assistant([text("Let me look..."), toolCall("grep")]),
      toolResult("grep"),
      assistant([text("Compiling findings..."), toolCall("submit")]),
      submitResult("## Findings\n\nBug in line 42."),
      assistant([text("Done!")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Findings\n\nBug in line 42.");
  });

  it("uses last submit when called multiple times", () => {
    const messages = [
      user("Do work"),
      assistant([toolCall("submit")]),
      submitResult("First attempt"),
      assistant([toolCall("submit")]),
      submitResult("Final answer"),
    ];
    expect(extractAssistantOutput(messages)).toBe("Final answer");
  });

  it("ignores knowledge writes after submit", () => {
    const messages = [
      user("Scout"),
      assistant([toolCall("read")]),
      toolResult("read"),
      assistant([toolCall("submit")]),
      submitResult("## Files Found\n- app.py"),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated knowledge.")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Files Found\n- app.py");
  });

  it("ignores knowledge writes before submit", () => {
    const messages = [
      user("Research"),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Now submitting results.")]),
      assistant([toolCall("submit")]),
      submitResult("## Analysis\n\nComplete findings."),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Analysis\n\nComplete findings.");
  });

  // === Fallback — no submit tool ===

  it("falls back to last assistant text when no submit", () => {
    const messages = [user("Hello"), assistant([text("Here are the results.")])];
    expect(extractAssistantOutput(messages)).toBe("Here are the results.");
  });

  it("falls back to last non-empty assistant text", () => {
    const messages = [
      user("Do work"),
      assistant([text("Working..."), toolCall("bash")]),
      toolResult("bash"),
      assistant([text("Done. Created the file.")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("Done. Created the file.");
  });

  it("returns empty string when no assistant messages", () => {
    expect(extractAssistantOutput([user("Hello")])).toBe("");
  });

  it("returns empty string when all text is empty", () => {
    expect(extractAssistantOutput([user("Do something"), assistant([text("")])])).toBe("");
  });

  it("concatenates multiple text parts", () => {
    const messages = [user("Explain"), assistant([text("Part 1. "), text("Part 2.")])];
    expect(extractAssistantOutput(messages)).toBe("Part 1. Part 2.");
  });
});
