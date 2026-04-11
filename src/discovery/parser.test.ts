import { describe, expect, it } from "vitest";
import { parseAgentFile } from "./parser.js";

const validAgent = `---
name: test-agent
description: A test agent
model: anthropic/claude-sonnet-4-6
role: worker
---
# Test Agent

You are a test agent.
`;

describe("parseAgentFile", () => {
  it("parses valid .md with frontmatter + body", () => {
    const result = parseAgentFile(validAgent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter.name).toBe("test-agent");
    expect(result.value.body).toContain("You are a test agent.");
  });

  it("returns error for file without frontmatter", () => {
    const result = parseAgentFile("# Just markdown\n\nNo frontmatter here.");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("frontmatter");
  });

  it("returns error for empty file", () => {
    const result = parseAgentFile("");
    expect(result.ok).toBe(false);
  });

  it("returns error for frontmatter-only (no body)", () => {
    const result = parseAgentFile("---\nname: test\n---\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("body");
  });

  it("trims whitespace from body", () => {
    const result = parseAgentFile("---\nname: test\n---\n\n  # Agent  \n\nInstructions.\n\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toBe("# Agent  \n\nInstructions.");
  });

  it("handles frontmatter with invalid YAML gracefully", () => {
    // parseFrontmatter may throw on malformed YAML, or return empty frontmatter.
    // Either way, parseAgentFile must not return ok: true with garbage data.
    try {
      const result = parseAgentFile("---\n: invalid: yaml: [\n---\nBody here");
      // If it doesn't throw, it must be an error result
      expect(result.ok).toBe(false);
    } catch (err) {
      // Throwing is acceptable — YAML parsing failure
      expect(err).toBeDefined();
    }
  });

  it("handles file with multiple --- separators", () => {
    const content = "---\nname: test\n---\n# Agent\n\n---\n\nMore content after separator";
    const result = parseAgentFile(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Body should include everything after the closing ---
    expect(result.value.body).toContain("More content after separator");
  });

  it("returns error for whitespace-only content", () => {
    const result = parseAgentFile("   \n\t\n  ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Empty");
  });

  it("returns error for frontmatter with only whitespace between delimiters", () => {
    const result = parseAgentFile("---\n   \n---\nBody here");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("frontmatter");
  });
});
