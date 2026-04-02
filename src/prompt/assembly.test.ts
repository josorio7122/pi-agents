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
        path: ".pi/knowledge/backend-dev.yaml",
        description: "Track patterns.",
        updatable: true,
        "max-lines": 10000,
      },
      general: {
        path: "~/.pi/agent/general/backend-dev.yaml",
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

describe("assembleSystemPrompt", () => {
  it("resolves {{SESSION_DIR}}", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("/tmp/sessions/abc123");
    expect(result).not.toContain("{{SESSION_DIR}}");
  });

  it("resolves {{CONVERSATION_LOG}} with full content", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain('{"from":"user","to":"backend-dev","message":"hello"}');
    expect(result).not.toContain("{{CONVERSATION_LOG}}");
  });

  it("resolves {{DOMAIN_BLOCK}} as YAML", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("apps/backend/");
    expect(result).not.toContain("{{DOMAIN_BLOCK}}");
  });

  it("resolves {{KNOWLEDGE_BLOCK}} as YAML", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("Track patterns.");
    expect(result).not.toContain("{{KNOWLEDGE_BLOCK}}");
  });

  it("resolves {{SKILLS_BLOCK}} as YAML", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("mental-model");
    expect(result).not.toContain("{{SKILLS_BLOCK}}");
  });

  it("resolves {{TEAM_BLOCK}} as empty string", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).not.toContain("{{TEAM_BLOCK}}");
  });

  it("includes skill contents with when instruction", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("# Mental Model");
    expect(result).toContain("Update your knowledge.");
    expect(result).toContain("Read at task start.");
  });

  it("includes project knowledge content", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("framework: Express");
  });

  it("includes general knowledge content", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("Read tests first");
  });

  it("handles empty knowledge files", () => {
    const result = assembleSystemPrompt(makeCtx({ projectKnowledgeContent: "", generalKnowledgeContent: "" }));
    expect(result).toContain("Project Knowledge");
    expect(result).toContain("General Knowledge");
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
