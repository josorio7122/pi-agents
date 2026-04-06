import { describe, expect, it } from "vitest";
import { extractAssistantOutput } from "./session-helpers.js";

// Helper to build messages matching the SDK's shape
function assistant(parts: ReadonlyArray<{ type: string; text?: string; name?: string }>) {
  return { role: "assistant" as const, content: parts };
}

function text(t: string) {
  return { type: "text" as const, text: t };
}

function toolCall(name: string) {
  return { type: "toolCall" as const, name, id: "tc-1", arguments: {} };
}

function toolResult(toolName: string) {
  return { role: "toolResult" as const, content: [text("ok")], toolCallId: "tc-1", toolName };
}

function user(t: string) {
  return { role: "user" as const, content: t };
}

describe("extractAssistantOutput", () => {
  // === No knowledge writes — last non-empty assistant text ===

  it("returns text from a simple response", () => {
    const messages = [user("Hello"), assistant([text("Hello back!")])];
    expect(extractAssistantOutput(messages)).toBe("Hello back!");
  });

  it("returns last message when no knowledge tools are used", () => {
    const messages = [
      user("Implement the feature"),
      assistant([text("Writing the code"), toolCall("write")]),
      toolResult("write"),
      assistant([text("Done. Added endpoint + 5 tests passing.")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("Done. Added endpoint + 5 tests passing.");
  });

  it("concatenates multiple text parts from the same message", () => {
    const messages = [user("Explain"), assistant([text("Part 1. "), text("Part 2.")])];
    expect(extractAssistantOutput(messages)).toBe("Part 1. Part 2.");
  });

  it("returns empty string when no assistant messages exist", () => {
    expect(extractAssistantOutput([user("Hello")])).toBe("");
  });

  it("returns empty string when all text is empty", () => {
    expect(extractAssistantOutput([user("Do something"), assistant([text("")])])).toBe("");
  });

  // === Knowledge write boundary — output BEFORE, noise AFTER ===

  it("takes text before write-knowledge, ignores noise after", () => {
    const messages = [
      user("Investigate the bug"),
      assistant([text("Let me read the code"), toolCall("bash")]),
      toolResult("bash"),
      assistant([text("## Bug Report\n\nFound a race condition in app.py:235")]),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated project knowledge: added race_condition entry")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Bug Report\n\nFound a race condition in app.py:235");
  });

  it("ignores post-knowledge error messages", () => {
    const messages = [
      user("Review the code"),
      assistant([text("## Code Review\n\nApproved with one finding")]),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Knowledge files aren't writable. The review above is complete.")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Code Review\n\nApproved with one finding");
  });

  it("handles delegate work followed by knowledge write", () => {
    const messages = [
      user("Add delete endpoint"),
      assistant([text("Delegating to backend-dev"), toolCall("delegate")]),
      toolResult("delegate"),
      assistant([text("## Summary\n\nEndpoint implemented and reviewed.")]),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated knowledge")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Summary\n\nEndpoint implemented and reviewed.");
  });

  it("handles read-knowledge before work + edit-knowledge after", () => {
    const messages = [
      user("Check what happened"),
      assistant([toolCall("read-knowledge")]),
      toolResult("read-knowledge"),
      assistant([text("Checking the code"), toolCall("read")]),
      toolResult("read"),
      assistant([text("## Analysis\n\nThe issue is in line 42")]),
      assistant([toolCall("edit-knowledge")]),
      toolResult("edit-knowledge"),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Analysis\n\nThe issue is in line 42");
  });

  it("skips empty text and thinking-only messages to find output", () => {
    const messages = [
      user("Do the work"),
      assistant([text("## Results\n\nEverything works")]),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([{ type: "thinking", text: "internal thoughts" }]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Results\n\nEverything works");
  });

  it("skips narration-only work messages to find real output", () => {
    const messages = [
      user("Scout the codebase"),
      assistant([text("Investigating..."), toolCall("grep")]),
      toolResult("grep"),
      assistant([text("## Files Found\n- app.py — main entry\n- models.py — data layer")]),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated project knowledge")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Files Found\n- app.py — main entry\n- models.py — data layer");
  });

  it("returns empty when no text exists before knowledge write", () => {
    const messages = [
      user("Scout the codebase"),
      assistant([toolCall("ls")]),
      toolResult("ls"),
      assistant([toolCall("read")]),
      toolResult("read"),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated project knowledge")]),
    ];
    // Agent violated the contract — no output before knowledge write
    expect(extractAssistantOutput(messages)).toBe("");
  });

  it("takes output before the LAST knowledge write when multiple exist", () => {
    const messages = [
      user("Do research"),
      assistant([text("First finding")]),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("More research"), toolCall("read")]),
      toolResult("read"),
      assistant([text("## Final Report\n\nComplete findings here")]),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated knowledge")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Final Report\n\nComplete findings here");
  });

  it("handles only-knowledge sessions", () => {
    const messages = [
      user("Update knowledge"),
      assistant([text("Reading knowledge"), toolCall("read-knowledge")]),
      toolResult("read-knowledge"),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Done updating")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("Reading knowledge");
  });
});
