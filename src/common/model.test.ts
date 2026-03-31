import { describe, expect, it } from "vitest";
import { parseModelId } from "./model.js";

describe("parseModelId", () => {
  it("splits provider/model-id", () => {
    expect(parseModelId("anthropic/claude-sonnet-4-6")).toEqual({
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
    });
  });

  it("handles provider with nested slashes in model id", () => {
    expect(parseModelId("openrouter/google/gemini-3-flash")).toEqual({
      provider: "openrouter",
      modelId: "google/gemini-3-flash",
    });
  });

  it("throws on missing slash", () => {
    expect(() => parseModelId("claude-sonnet-4-6")).toThrow();
  });

  it("throws on empty string", () => {
    expect(() => parseModelId("")).toThrow();
  });
});
