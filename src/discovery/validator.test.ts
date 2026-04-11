import { describe, expect, it } from "vitest";
import { validateAgent } from "./validator.js";

const validFrontmatter = {
  name: "backend-dev",
  description: "Builds APIs.",
  model: "anthropic/claude-sonnet-4-6",
  role: "worker",
  color: "#36f9f6",
  icon: "💻",
  domain: [{ path: "apps/backend/", read: true, write: true, delete: true }],
  tools: ["read", "write", "edit", "grep", "bash", "find", "ls"],
  skills: [{ path: ".pi/skills/mental-model.md", when: "Read at task start." }],
  knowledge: {
    project: {
      path: ".pi/knowledge/project/backend-dev.yaml",
      description: "Track patterns.",
      updatable: true,
      "max-lines": 10000,
    },
    general: {
      path: ".pi/knowledge/general/backend-dev.yaml",
      description: "General strategies.",
      updatable: true,
      "max-lines": 5000,
    },
  },
  conversation: { path: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl" },
};

describe("validateAgent", () => {
  it("accepts valid worker config", () => {
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

  it("rejects missing domain", () => {
    const { domain: _, ...noD } = validFrontmatter;
    const result = validateAgent({
      frontmatter: noD,
      body: "# Agent\n\nInstructions.",
      filePath: "test.md",
      source: "project",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes("domain"))).toBe(true);
  });

  it("rejects worker with delegate", () => {
    const result = validateAgent({
      frontmatter: { ...validFrontmatter, tools: ["read", "delegate"] },
      body: "# Agent\n\nInstructions.",
      filePath: "test.md",
      source: "project",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes("delegate"))).toBe(true);
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
