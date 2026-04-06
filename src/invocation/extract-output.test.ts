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
  // Pattern 1: Simple response — single assistant message, no tool calls
  it("returns text from a simple single-message response", () => {
    const messages = [user("Hello"), assistant([text("Hello back!")])];
    expect(extractAssistantOutput(messages)).toBe("Hello back!");
  });

  // Pattern 2: Work + knowledge write + summary noise
  // Agent does real work, writes knowledge, then says "Updated knowledge"
  it("skips post-knowledge summary and returns findings", () => {
    const messages = [
      user("Investigate the bug"),
      assistant([text("Let me read the code"), toolCall("bash")]),
      toolResult("bash"),
      assistant([text("## Bug Report\n\nFound a race condition in app.py:235"), toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated project knowledge: added race_condition entry")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Bug Report\n\nFound a race condition in app.py:235");
  });

  // Pattern 3: Knowledge write fails — agent complains
  it("skips knowledge error message and returns findings", () => {
    const messages = [
      user("Review the code"),
      assistant([text("Reading the diff"), toolCall("bash")]),
      toolResult("bash"),
      assistant([text("## Code Review\n\nApproved with one finding"), toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Knowledge files aren't writable. The review above is complete.")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Code Review\n\nApproved with one finding");
  });

  // Pattern 4: Agent with regular write tool — last message IS the summary
  it("returns last message when it has no knowledge tool calls", () => {
    const messages = [
      user("Implement the feature"),
      assistant([text("Writing the code"), toolCall("write")]),
      toolResult("write"),
      assistant([text("Done. Here's what was implemented:\n\n- Added endpoint\n- 5 tests passing")]),
    ];
    expect(extractAssistantOutput(messages)).toBe(
      "Done. Here's what was implemented:\n\n- Added endpoint\n- 5 tests passing",
    );
  });

  // Pattern 5: Eng-lead delegates then writes knowledge — summary alongside knowledge call
  it("returns text from message with delegate + knowledge tools", () => {
    const messages = [
      user("Add delete endpoint"),
      assistant([text("Delegating to backend-dev"), toolCall("delegate")]),
      toolResult("delegate"),
      assistant([text("Work complete, sending to reviewer"), toolCall("delegate")]),
      toolResult("delegate"),
      assistant([text("## Summary\n\nEndpoint implemented and reviewed."), toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated knowledge: added delete endpoint pattern")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Summary\n\nEndpoint implemented and reviewed.");
  });

  // Pattern 6: Only knowledge tools — return text alongside knowledge call
  it("returns text from message that only has knowledge tool calls", () => {
    const messages = [
      user("Update your knowledge"),
      assistant([text("Reading knowledge"), toolCall("read-knowledge")]),
      toolResult("read-knowledge"),
      assistant([text("Here's what I know about the project:\n\n- FastAPI backend"), toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated knowledge")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("Here's what I know about the project:\n\n- FastAPI backend");
  });

  // Pattern 7: read-conversation + work + knowledge
  it("skips read-conversation and knowledge noise", () => {
    const messages = [
      user("Check what happened"),
      assistant([text("Reading conversation"), toolCall("read-conversation")]),
      toolResult("read-conversation"),
      assistant([text("Checking the code"), toolCall("read")]),
      toolResult("read"),
      assistant([text("## Analysis\n\nThe issue is in line 42"), toolCall("edit-knowledge")]),
      toolResult("edit-knowledge"),
      assistant([text("Updated general knowledge: added analysis strategy")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Analysis\n\nThe issue is in line 42");
  });

  // Pattern 8: Agent returns empty text alongside knowledge call
  it("skips empty text and finds previous real content", () => {
    const messages = [
      user("Do the work"),
      assistant([text("## Results\n\nEverything works"), toolCall("bash")]),
      toolResult("bash"),
      assistant([toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("## Results\n\nEverything works");
  });

  // Pattern 9: Multiple text parts in one message
  it("concatenates multiple text parts from the same message", () => {
    const messages = [user("Explain"), assistant([text("Part 1. "), text("Part 2.")])];
    expect(extractAssistantOutput(messages)).toBe("Part 1. Part 2.");
  });

  // Pattern 10: No assistant messages at all
  it("returns empty string when no assistant messages exist", () => {
    const messages = [user("Hello")];
    expect(extractAssistantOutput(messages)).toBe("");
  });

  // Pattern 11: All assistant messages have empty text
  it("returns empty string when all text is empty", () => {
    const messages = [user("Do something"), assistant([text("")])];
    expect(extractAssistantOutput(messages)).toBe("");
  });

  // Pattern 12: Mixed knowledge tools (read-knowledge, edit-knowledge)
  it("treats read-knowledge and edit-knowledge as meta tools", () => {
    const messages = [
      user("What do you know?"),
      assistant([text("Let me check"), toolCall("read-knowledge")]),
      toolResult("read-knowledge"),
      assistant([text("Based on my knowledge, the system uses FastAPI"), toolCall("edit-knowledge")]),
      toolResult("edit-knowledge"),
      assistant([text("Updated project knowledge")]),
    ];
    expect(extractAssistantOutput(messages)).toBe("Based on my knowledge, the system uses FastAPI");
  });

  // Pattern 13: Last message has only thinking + no text
  it("skips assistant messages with only thinking content", () => {
    const messages = [
      user("Think about it"),
      assistant([text("Here are my thoughts:\n\nThe architecture is solid."), toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([{ type: "thinking", text: "internal thoughts" }]),
    ];
    expect(extractAssistantOutput(messages)).toBe("Here are my thoughts:\n\nThe architecture is solid.");
  });

  // Pattern 14: Knowledge write in separate turn with transition phrase
  // Agent does recon, then writes knowledge in a separate message with only a transition phrase
  it("skips transition phrase alongside knowledge write and returns earlier findings", () => {
    const messages = [
      user("Scout the codebase"),
      assistant([text("Investigating..."), toolCall("grep")]),
      toolResult("grep"),
      assistant([text("## Files Found\n- app.py \u2014 main entry\n- models.py \u2014 data layer"), toolCall("read")]),
      toolResult("read"),
      assistant([text("Let me save this to my knowledge files:"), toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated project knowledge: added architecture entry")]),
    ];
    expect(extractAssistantOutput(messages)).toBe(
      "## Files Found\n- app.py \u2014 main entry\n- models.py \u2014 data layer",
    );
  });

  // Pattern 15: Non-meta tool calls with empty text + knowledge write with transition phrase
  // Agent does recon (tool calls with no text), then writes knowledge with a transition phrase
  it("skips empty-text work messages and transition-phrase knowledge writes", () => {
    const messages = [
      user("Scout the codebase"),
      assistant([toolCall("ls")]),
      toolResult("ls"),
      assistant([toolCall("grep")]),
      toolResult("grep"),
      assistant([toolCall("read")]),
      toolResult("read"),
      assistant([toolCall("read")]),
      toolResult("read"),
      assistant([text("Perfect! Let me save this to my knowledge files:"), toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Updated project knowledge: added architecture entry")]),
    ];
    // The transition phrase is the only non-empty text, but it's not useful findings.
    // Best we can do: return it since there's nothing better.
    expect(extractAssistantOutput(messages)).toBe(
      "Perfect! Let me save this to my knowledge files:",
    );
  });

  // Pattern 16: Fallback — all messages are meta, return last non-empty text
  it("falls back to last non-empty text when all messages are meta", () => {
    const messages = [
      user("Update knowledge"),
      assistant([text("Reading knowledge"), toolCall("read-knowledge")]),
      toolResult("read-knowledge"),
      assistant([text("Writing knowledge"), toolCall("write-knowledge")]),
      toolResult("write-knowledge"),
      assistant([text("Done updating")]),
    ];
    // The only "work" is knowledge operations. "Writing knowledge" is alongside write-knowledge.
    // "Done updating" has no tools. Best we can do: return "Writing knowledge" since it's alongside a meta tool.
    expect(extractAssistantOutput(messages)).toBe("Writing knowledge");
  });
});
