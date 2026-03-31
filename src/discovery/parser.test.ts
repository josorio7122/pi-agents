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
});
