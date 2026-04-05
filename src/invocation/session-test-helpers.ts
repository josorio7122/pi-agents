import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "../discovery/validator.js";
import { ensureLogExists } from "./conversation-log.js";

export async function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "pi-agents-integration-"));
  const projectKnowledgeDir = join(dir, ".pi", "knowledge", "project");
  const generalKnowledgeDir = join(dir, ".pi", "knowledge", "general");
  const sessionsDir = join(dir, ".pi", "sessions", "test-session");
  const skillsDir = join(dir, ".pi", "skills");

  mkdirSync(projectKnowledgeDir, { recursive: true });
  mkdirSync(generalKnowledgeDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });

  writeFileSync(join(skillsDir, "test-skill.md"), "# Test Skill\n\nBe helpful.");

  const conversationLogPath = join(sessionsDir, "conversation.jsonl");
  await ensureLogExists(conversationLogPath);

  return { dir, projectKnowledgeDir, generalKnowledgeDir, sessionsDir, conversationLogPath, skillsDir };
}

export function makeTestAgent(projectDir: string): AgentConfig {
  return {
    frontmatter: {
      name: "test-agent",
      description: "A test agent for integration testing.",
      model: "faux/faux-model",
      role: "worker",
      color: "#ffffff",
      icon: "🧪",
      domain: [{ path: "src/", read: true, write: true, delete: false }],
      tools: ["read", "write", "bash", "ls"],
      skills: [{ path: join(projectDir, ".pi", "skills", "test-skill.md"), when: "Always." }],
      knowledge: {
        project: {
          path: join(projectDir, ".pi", "knowledge", "project", "test-agent.yaml"),
          description: "Test project knowledge.",
          updatable: true,
          "max-lines": 100,
        },
        general: {
          path: join(projectDir, ".pi", "knowledge", "general", "test-agent.yaml"),
          description: "Test general knowledge.",
          updatable: true,
          "max-lines": 50,
        },
      },
      conversation: { path: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl" },
    },
    systemPrompt: "# Test Agent\n\nYou are a test agent. Reply concisely.",
    filePath: join(projectDir, ".pi", "agents", "test-agent.md"),
    source: "project",
  };
}
