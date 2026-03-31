import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxText, registerFauxProvider } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import { ensureLogExists, readLog } from "./conversation-log.js";
import { runAgent } from "./session.js";

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "pi-agents-integration-"));
  const knowledgeDir = join(dir, ".pi", "knowledge");
  const generalDir = join(dir, "general");
  const sessionsDir = join(dir, ".pi", "sessions", "test-session");
  const skillsDir = join(dir, ".pi", "skills");

  mkdirSync(knowledgeDir, { recursive: true });
  mkdirSync(generalDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });

  // Create a minimal skill file
  writeFileSync(join(skillsDir, "test-skill.md"), "# Test Skill\n\nBe helpful.");

  // Create empty knowledge files
  writeFileSync(join(knowledgeDir, "test-agent.yaml"), "");
  writeFileSync(join(generalDir, "test-agent.yaml"), "");

  const conversationLogPath = join(sessionsDir, "conversation.jsonl");
  ensureLogExists(conversationLogPath);

  return { dir, knowledgeDir, generalDir, sessionsDir, conversationLogPath, skillsDir };
}

function makeTestAgent(projectDir: string): AgentConfig {
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
          path: join(projectDir, ".pi", "knowledge", "test-agent.yaml"),
          description: "Test project knowledge.",
          updatable: true,
          "max-lines": 100,
        },
        general: {
          path: join(projectDir, "general", "test-agent.yaml"),
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

describe("runAgent (faux provider)", () => {
  let faux: ReturnType<typeof registerFauxProvider>;
  const authStorage = AuthStorage.create();
  // Set a fake API key so createAgentSession doesn't reject
  authStorage.setRuntimeApiKey("faux", "fake-key-for-testing");
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  afterEach(() => {
    faux?.unregister();
  });

  it("runs agent and returns output", async () => {
    faux = registerFauxProvider();
    faux.setResponses([fauxAssistantMessage(fauxText("Hello from the agent!"))]);

    const project = makeTempProject();
    const agent = makeTestAgent(project.dir);

    const result = await runAgent({
      agentConfig: agent,
      task: "Say hello",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
    });

    expect(result.error).toBeUndefined();
    expect(result.output).toContain("Hello from the agent!");
  });

  it("writes user task and agent response to conversation log", async () => {
    faux = registerFauxProvider();
    faux.setResponses([fauxAssistantMessage(fauxText("Task completed."))]);

    const project = makeTempProject();
    const agent = makeTestAgent(project.dir);

    await runAgent({
      agentConfig: agent,
      task: "Do something",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
    });

    const logContent = readLog(project.conversationLogPath);
    const lines = logContent.trim().split("\n");

    // At least 2 entries: user task + agent response
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const userEntry = JSON.parse(lines[0]!);
    expect(userEntry.from).toBe("user");
    expect(userEntry.to).toBe("test-agent");
    expect(userEntry.message).toBe("Do something");

    const agentEntry = JSON.parse(lines[lines.length - 1]!);
    expect(agentEntry.from).toBe("test-agent");
    expect(agentEntry.to).toBe("user");
    expect(agentEntry.message).toContain("Task completed.");
  });

  it("tracks metrics", async () => {
    faux = registerFauxProvider();
    faux.setResponses([fauxAssistantMessage(fauxText("Done."))]);

    const project = makeTempProject();
    const agent = makeTestAgent(project.dir);

    const result = await runAgent({
      agentConfig: agent,
      task: "Quick task",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
    });

    expect(result.metrics).toBeDefined();
    expect(result.metrics.turns).toBeGreaterThanOrEqual(0);
  });

  it("injects conversation log into prompt", async () => {
    faux = registerFauxProvider();

    // Pre-populate conversation log
    const project = makeTempProject();
    const { appendToLog } = await import("./conversation-log.js");
    appendToLog(project.conversationLogPath, {
      ts: "2026-01-01T00:00:00Z",
      from: "user",
      to: "test-agent",
      message: "Previous conversation entry",
    });

    faux.setResponses([fauxAssistantMessage(fauxText("Acknowledged."))]);

    const agent = makeTestAgent(project.dir);

    const result = await runAgent({
      agentConfig: agent,
      task: "Continue",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
    });

    expect(result.error).toBeUndefined();
  });

  it("returns error for unknown model", async () => {
    const project = makeTempProject();
    const agent = makeTestAgent(project.dir);
    const badAgent = {
      ...agent,
      frontmatter: { ...agent.frontmatter, model: "nonexistent/bad-model" },
    };

    const result = await runAgent({
      agentConfig: badAgent,
      task: "This should fail",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      // No modelOverride — let it try to resolve the bad model
    });

    expect(result.error).toContain("Model not found");
  });
});
