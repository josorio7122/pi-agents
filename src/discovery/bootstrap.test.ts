import { existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bootstrapKnowledge } from "./bootstrap.js";
import type { AgentConfig } from "./validator.js";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "pi-agents-bootstrap-"));
}

function makeAgent(params: { readonly projectPath: string; readonly generalPath: string }): AgentConfig {
  return {
    frontmatter: {
      name: "test-agent",
      description: "Test",
      model: "anthropic/claude-sonnet-4-6",
      role: "worker",
      color: "#ffffff",
      icon: "🔵",
      domain: [{ path: "src/", read: true, write: true, delete: false }],
      tools: ["read", "write", "bash"],
      skills: [{ path: ".pi/skills/test.md", when: "Always" }],
      knowledge: {
        project: { path: params.projectPath, description: "Test", updatable: true, "max-lines": 1000 },
        general: { path: params.generalPath, description: "Test", updatable: true, "max-lines": 500 },
      },
      conversation: { path: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl" },
    },
    systemPrompt: "# Test\n\nInstructions.",
    filePath: ".pi/agents/test.md",
    source: "project",
  };
}

describe("bootstrapKnowledge", () => {
  it("creates project knowledge file if missing", () => {
    const dir = makeTempDir();
    const projectPath = join(dir, "knowledge", "test.yaml");
    const generalPath = join(dir, "general", "test.yaml");
    const agent = makeAgent({ projectPath, generalPath });

    bootstrapKnowledge([agent]);

    expect(existsSync(projectPath)).toBe(true);
  });

  it("creates general knowledge file if missing (with parent dirs)", () => {
    const dir = makeTempDir();
    const projectPath = join(dir, "knowledge", "test.yaml");
    const generalPath = join(dir, "general", "nested", "deep", "test.yaml");
    const agent = makeAgent({ projectPath, generalPath });

    bootstrapKnowledge([agent]);

    expect(existsSync(generalPath)).toBe(true);
  });

  it("does not overwrite existing knowledge files", () => {
    const dir = makeTempDir();
    const projectPath = join(dir, "knowledge", "test.yaml");
    const generalPath = join(dir, "general", "test.yaml");

    // Pre-create with content
    const { mkdirSync } = require("node:fs");
    mkdirSync(join(dir, "knowledge"), { recursive: true });
    mkdirSync(join(dir, "general"), { recursive: true });
    writeFileSync(projectPath, "existing: content\n");
    const mtimeBefore = statSync(projectPath).mtimeMs;

    const agent = makeAgent({ projectPath, generalPath });
    bootstrapKnowledge([agent]);

    const mtimeAfter = statSync(projectPath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
