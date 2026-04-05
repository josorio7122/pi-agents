import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import { ensureLogExists } from "./conversation-log.js";
import { runAgent } from "./session.js";

async function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "pi-agents-integration-"));
  const sessionsDir = join(dir, ".pi", "sessions", "test-session");

  mkdirSync(join(dir, ".pi", "knowledge", "project"), { recursive: true });
  mkdirSync(join(dir, ".pi", "knowledge", "general"), { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });

  const conversationLogPath = join(sessionsDir, "conversation.jsonl");
  await ensureLogExists(conversationLogPath);

  return { dir, sessionsDir, conversationLogPath };
}

describe("runAgent e2e — read-only agent with updatable knowledge", () => {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  it("agent with only read/ls tools can write to updatable knowledge files", async () => {
    const project = await makeTempProject();
    const knowledgePath = join(project.dir, ".pi", "knowledge", "project", "readonly-scout.yaml");

    const readOnlyAgent: AgentConfig = {
      frontmatter: {
        name: "readonly-scout",
        description: "A read-only agent that should be able to update its knowledge.",
        model: "anthropic/claude-haiku-4-5",
        role: "worker",
        color: "#36f9f6",
        icon: "🔍",
        domain: [{ path: "src/", read: true, write: false, delete: false }],
        tools: ["read", "ls"],
        skills: [],
        knowledge: {
          project: {
            path: knowledgePath,
            description: "Track codebase structure.",
            updatable: true,
            "max-lines": 100,
          },
          general: {
            path: join(project.dir, ".pi", "knowledge", "general", "readonly-scout.yaml"),
            description: "General strategies.",
            updatable: true,
            "max-lines": 50,
          },
        },
        conversation: { path: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl" },
      },
      systemPrompt: [
        "# Read-Only Scout",
        "",
        "You are a test agent. You have one job:",
        `Write the text "discovery: complete" to the file at: ${knowledgePath}`,
        "Use the write-knowledge tool to do this. Do not explain, just write the file.",
      ].join("\n"),
      filePath: join(project.dir, ".pi", "agents", "readonly-scout.md"),
      source: "project",
    };

    const result = await runAgent({
      agentConfig: readOnlyAgent,
      task: `Write "discovery: complete" to ${knowledgePath} using the write-knowledge tool. Nothing else.`,
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
    });

    expect(result.error).toBeUndefined();
    expect(existsSync(knowledgePath)).toBe(true);
    const content = readFileSync(knowledgePath, "utf-8");
    expect(content).toContain("discovery");
  }, 30_000);
});
