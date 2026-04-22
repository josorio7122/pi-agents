import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import { formatAgentList } from "./agents-command.js";

function makeAgent(params: {
  readonly name: string;
  readonly icon: string;
  readonly description: string;
}): AgentConfig {
  return {
    frontmatter: {
      name: params.name,
      description: params.description,
      model: "anthropic/claude-sonnet-4-6",
      color: "#ffffff",
      icon: params.icon,
      tools: ["read", "write", "bash"],
      skills: ["/pi/skills/test.md"],
    },
    systemPrompt: "# Test\nInstructions.",
    filePath: ".pi/agents/test.md",
    source: "project",
  };
}

describe("formatAgentList", () => {
  it("formats multiple agents", () => {
    const agents = [
      makeAgent({ name: "backend-dev", icon: "💻", description: "Builds APIs." }),
      makeAgent({ name: "frontend-dev", icon: "🔵", description: "Builds UIs." }),
    ];
    const lines = formatAgentList(agents);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("💻");
    expect(lines[0]).toContain("backend-dev");
    expect(lines[0]).toContain("Builds APIs.");
    expect(lines[1]).toContain("🔵");
    expect(lines[1]).toContain("frontend-dev");
  });

  it("returns message for no agents", () => {
    const lines = formatAgentList([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("No agents found");
  });
});
