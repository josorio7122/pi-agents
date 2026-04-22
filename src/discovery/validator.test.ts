import { describe, expect, it } from "vitest";
import { validateAgent } from "./validator.js";

const validFrontmatter = {
  name: "backend-dev",
  description: "Builds APIs.",
  color: "#36f9f6",
  icon: "💻",
};

describe("validateAgent", () => {
  it("accepts valid minimal frontmatter", () => {
    const result = validateAgent({
      frontmatter: validFrontmatter,
      body: "# Backend Dev\n\nYou build APIs.",
      filePath: ".pi/agents/backend-dev.md",
      source: "project",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter.name).toBe("backend-dev");
    expect(result.value.systemPrompt).toContain("You build APIs.");
  });

  it("rejects agent with skills but no read tool", () => {
    const result = validateAgent({
      frontmatter: {
        ...validFrontmatter,
        skills: ["/abs/s/SKILL.md"],
        tools: ["bash"],
      },
      body: "# Agent\n\nInstructions.",
      filePath: "test.md",
      source: "project",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes("read"))).toBe(true);
  });

  it("accepts agent with skills and explicit read tool", () => {
    const result = validateAgent({
      frontmatter: {
        ...validFrontmatter,
        skills: ["/abs/s/SKILL.md"],
        tools: ["read", "bash"],
      },
      body: "# Agent\n\nInstructions.",
      filePath: "test.md",
      source: "project",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts agent with empty skills (opt-out) and no read tool", () => {
    const result = validateAgent({
      frontmatter: {
        ...validFrontmatter,
        skills: [],
        tools: ["bash"],
      },
      body: "# Agent\n\nInstructions.",
      filePath: "test.md",
      source: "project",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects empty system prompt body", () => {
    const result = validateAgent({
      frontmatter: validFrontmatter,
      body: "",
      filePath: "test.md",
      source: "project",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes("Missing system prompt body"))).toBe(true);
  });

  it("preserves filePath and source", () => {
    const result = validateAgent({
      frontmatter: validFrontmatter,
      body: "# Agent\n\nInstructions.",
      filePath: "/home/user/.pi/agent/agents/backend-dev.md",
      source: "user",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.filePath).toBe("/home/user/.pi/agent/agents/backend-dev.md");
    expect(result.value.source).toBe("user");
  });
});
