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

    skillContents: [
      { name: "mental-model", when: "Read at task start.", content: "# Mental Model\n\nUpdate your knowledge." },
    ],
    ...overrides,
  };
}

describe("assembleSystemPrompt", () => {
  it("resolves {{SESSION_DIR}}", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("/tmp/sessions/abc123");
    expect(result).not.toContain("{{SESSION_DIR}}");
  });

  it("resolves {{CONVERSATION_LOG}} with tool reference", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("read-conversation");
    expect(result).not.toContain("{{CONVERSATION_LOG}}");
  });

  it("does not inject conversation log content into prompt", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).not.toContain("conversation history between all participants");
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

  it("leaves {{TEAM_BLOCK}} unresolved when not in extraVariables", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("{{TEAM_BLOCK}}");
  });

  it("resolves {{TEAM_BLOCK}} when provided via extraVariables", () => {
    const result = assembleSystemPrompt(makeCtx({ extraVariables: { TEAM_BLOCK: "my-team-content" } }));
    expect(result).toContain("my-team-content");
    expect(result).not.toContain("{{TEAM_BLOCK}}");
  });

  it("includes skill contents with when instruction", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("# Mental Model");
    expect(result).toContain("Update your knowledge.");
    expect(result).toContain("Read at task start.");
  });

  it("includes knowledge file paths and descriptions", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain(".pi/knowledge/project/backend-dev.yaml");
    expect(result).toContain("Track patterns.");
    expect(result).toContain(".pi/knowledge/general/backend-dev.yaml");
    expect(result).toContain("General strategies.");
  });

  it("does not inject knowledge file content into prompt", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).not.toContain("framework: Express");
    expect(result).not.toContain("Read tests first");
  });

  it("mentions read-knowledge tool", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).toContain("read-knowledge");
  });

  it("includes reports section when agent has reports block", () => {
    const agentWithReports: AgentConfig = {
      ...agent,
      frontmatter: { ...agent.frontmatter, reports: { path: ".pi/reports", updatable: true } },
    };
    const result = assembleSystemPrompt(makeCtx({ agentConfig: agentWithReports }));
    expect(result).toContain("## Reports");
    expect(result).toContain("Directory: .pi/reports");
  });

  it("omits reports section when agent has no reports block", () => {
    const result = assembleSystemPrompt(makeCtx());
    expect(result).not.toContain("## Reports");
  });

  it("resolves extraVariables in system prompt", () => {
    const agentWithTeams: AgentConfig = {
      ...agent,
      systemPrompt: agent.systemPrompt + "\n\n## Teams\n{{TEAMS_BLOCK}}",
    };

    const result = assembleSystemPrompt(
      makeCtx({
        agentConfig: agentWithTeams,
        extraVariables: { TEAMS_BLOCK: "- name: eng-lead\n  leads: Engineering" },
      }),
    );
    expect(result).toContain("- name: eng-lead");
    expect(result).toContain("leads: Engineering");
    expect(result).not.toContain("{{TEAMS_BLOCK}}");
  });
});
