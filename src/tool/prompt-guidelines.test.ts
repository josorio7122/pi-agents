import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import { buildPromptGuidelines } from "./prompt-guidelines.js";

function fakeAgent(overrides: {
  name: string;
  description: string;
  icon: string;
  domain: Array<{ path: string; read: boolean; write: boolean; delete: boolean }>;
}): AgentConfig {
  return {
    frontmatter: {
      name: overrides.name,
      description: overrides.description,
      icon: overrides.icon,
      model: "anthropic/claude-sonnet-4-6",
      role: "worker",
      color: "#fff",
      domain: overrides.domain,
      tools: ["read", "grep"],
      skills: [{ path: ".pi/agent-skills/test.md", when: "always" }],
      knowledge: {
        project: { path: ".pi/knowledge/test.yaml", description: "test", updatable: true, "max-lines": 100 },
        general: { path: "~/.pi/agent/general/test.yaml", description: "test", updatable: true, "max-lines": 100 },
      },
      conversation: { path: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl" },
    },
    systemPrompt: "You are a test agent.",
    filePath: "/test/agent.md",
    source: "project",
  };
}

describe("buildPromptGuidelines", () => {
  it("includes context isolation warning", () => {
    const lines = buildPromptGuidelines([]);
    const text = lines.join("\n");
    expect(text).toContain("isolated session");
    expect(text).toContain("ONLY sees the task string");
  });

  it("lists agents with access level from domain", () => {
    const agents = [
      fakeAgent({
        name: "scout",
        description: "Reads code",
        icon: "🔍",
        domain: [{ path: "src/", read: true, write: false, delete: false }],
      }),
      fakeAgent({
        name: "dev",
        description: "Writes code",
        icon: "💻",
        domain: [{ path: "src/", read: true, write: true, delete: false }],
      }),
    ];
    const text = buildPromptGuidelines(agents).join("\n");
    expect(text).toContain("🔍 scout (read-only) — Reads code");
    expect(text).toContain("💻 dev (read/write) — Writes code");
  });

  it("uses first agent name in mode examples", () => {
    const agents = [
      fakeAgent({
        name: "my-agent",
        description: "test",
        icon: "🔍",
        domain: [{ path: "src/", read: true, write: false, delete: false }],
      }),
    ];
    const text = buildPromptGuidelines(agents).join("\n");
    expect(text).toContain("agent: 'my-agent'");
    expect(text).not.toContain("scout");
  });

  it("falls back to 'agent' when no agents", () => {
    const text = buildPromptGuidelines([]).join("\n");
    expect(text).toContain("agent: 'agent'");
  });

  it("does not expose model information", () => {
    const agents = [
      fakeAgent({
        name: "scout",
        description: "test",
        icon: "🔍",
        domain: [{ path: "src/", read: true, write: false, delete: false }],
      }),
    ];
    const text = buildPromptGuidelines(agents).join("\n");
    expect(text).not.toContain("sonnet");
    expect(text).not.toContain("haiku");
    expect(text).not.toContain("opus");
    expect(text).not.toContain("anthropic");
  });

  it("includes task writing guidance", () => {
    const text = buildPromptGuidelines([]).join("\n");
    expect(text).toContain("self-contained");
  });

  it("includes mode descriptions", () => {
    const text = buildPromptGuidelines([]).join("\n");
    expect(text).toContain("Single:");
    expect(text).toContain("Parallel:");
    expect(text).toContain("Chain:");
    expect(text).toContain("{previous}");
  });
});
