import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import type { AssemblyContext } from "./assembly.js";
import { assembleSystemPrompt } from "./assembly.js";

const agent: AgentConfig = {
  frontmatter: {
    name: "backend-dev",
    description: "Builds APIs.",
    model: "anthropic/claude-sonnet-4-6",
    role: "worker",
    color: "#36f9f6",
    icon: "💻",
    domain: [{ path: "apps/backend/", read: true, write: true, delete: true }],
    tools: ["read", "write", "bash"],
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
  },
  systemPrompt:
    "# Backend Dev\n\nSession: {{SESSION_DIR}}\nLog: {{CONVERSATION_LOG}}\n\n## Domain\n{{DOMAIN_BLOCK}}\n\n## Knowledge\n{{KNOWLEDGE_BLOCK}}\n\n## Skills\n{{SKILLS_BLOCK}}\n\n## Team\n{{TEAM_BLOCK}}",
  filePath: ".pi/agents/backend-dev.md",
  source: "project",
};

function makeCtx(overrides?: Partial<AssemblyContext>): AssemblyContext {
  return {
    agentConfig: agent,
    sessionDir: "/tmp/sessions/abc123",
    conversationLogContent: '{"from":"user","to":"backend-dev","message":"hello"}',
    skillContents: [
      { name: "mental-model", when: "Read at task start.", content: "# Mental Model\n\nUpdate your knowledge." },
    ],
    projectKnowledgeContent: "system:\n  framework: Express",
    generalKnowledgeContent: "strategies:\n  - Read tests first",
    ...overrides,
  };
}

describe("assembleSystemPrompt — shared context & extras", () => {
  it("extraVariables override defaults", () => {
    const result = assembleSystemPrompt(makeCtx({ extraVariables: { TEAM_BLOCK: "overridden-team-content" } }));
    expect(result).toContain("overridden-team-content");
  });

  it("includes shared context section when provided", () => {
    const result = assembleSystemPrompt(
      makeCtx({
        sharedContextContents: [{ path: "AGENTS.md", content: "# Rules\nAlways test first." }],
      }),
    );
    expect(result).toContain("## Shared Context");
    expect(result).toContain("### AGENTS.md");
    expect(result).toContain("Always test first.");
  });

  it("omits shared context section when not provided", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).not.toContain("## Shared Context");
  });

  it("omits shared context section when empty", () => {
    const result = assembleSystemPrompt(makeCtx({ sharedContextContents: [] }));
    expect(result).not.toContain("## Shared Context");
  });

  it("includes multiple shared context files", () => {
    const result = assembleSystemPrompt(
      makeCtx({
        sharedContextContents: [
          { path: "AGENTS.md", content: "agent rules" },
          { path: "README.md", content: "project readme" },
        ],
      }),
    );
    expect(result).toContain("### AGENTS.md");
    expect(result).toContain("agent rules");
    expect(result).toContain("### README.md");
    expect(result).toContain("project readme");
  });

  it("handles multiple skills", () => {
    const result = assembleSystemPrompt(
      makeCtx({
        skillContents: [
          { name: "mental-model", when: "Always.", content: "# MM\n\nContent A." },
          { name: "active-listener", when: "Always.", content: "# AL\n\nContent B." },
        ],
      }),
    );
    expect(result).toContain("Content A.");
    expect(result).toContain("Content B.");
  });
});
