import { describe, expect, it } from "vitest";
import { ConversationEntrySchema } from "./conversation.js";

describe("ConversationEntrySchema", () => {
  it("accepts valid entry", () => {
    const result = ConversationEntrySchema.safeParse({
      ts: "2026-03-30T14:22:01Z",
      from: "user",
      to: "backend-dev",
      message: "Build the classifier",
    });
    expect(result.success).toBe(true);
  });

  it("accepts entry with optional type", () => {
    const result = ConversationEntrySchema.safeParse({
      ts: "2026-03-30T14:22:01Z",
      from: "orchestrator",
      to: "eng-lead",
      message: "Build ComplementNB",
      type: "delegate",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing from", () => {
    const result = ConversationEntrySchema.safeParse({
      ts: "2026-03-30T14:22:01Z",
      to: "backend-dev",
      message: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing message", () => {
    const result = ConversationEntrySchema.safeParse({
      ts: "2026-03-30T14:22:01Z",
      from: "user",
      to: "backend-dev",
    });
    expect(result.success).toBe(false);
  });
});
