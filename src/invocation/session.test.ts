import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fauxAssistantMessage, fauxText, registerFauxProvider } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { readLog } from "./conversation-log.js";
import { runAgent } from "./session.js";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

describe("runAgent (faux provider)", () => {
  let faux: ReturnType<typeof registerFauxProvider>;
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey("faux", "fake-key-for-testing");
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  afterEach(() => {
    faux?.unregister();
  });

  it("runs agent and returns output", async () => {
    faux = registerFauxProvider();
    faux.setResponses([fauxAssistantMessage(fauxText("Hello from the agent!"))]);
    const project = await makeTempProject();
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
    const project = await makeTempProject();
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
    const logContent = await readLog(project.conversationLogPath);
    const lines = logContent.trim().split("\n");
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
    const project = await makeTempProject();
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
    const project = await makeTempProject();
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

  it("uses custom caller in conversation log entries", async () => {
    faux = registerFauxProvider();
    faux.setResponses([fauxAssistantMessage(fauxText("Done."))]);
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);
    await runAgent({
      agentConfig: agent,
      task: "Build this",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
      caller: "orchestrator",
    });
    const logContent = await readLog(project.conversationLogPath);
    const lines = logContent.trim().split("\n");
    const userEntry = JSON.parse(lines[0]!);
    expect(userEntry.from).toBe("orchestrator");
    expect(userEntry.to).toBe("test-agent");
    const agentEntry = JSON.parse(lines[lines.length - 1]!);
    expect(agentEntry.from).toBe("test-agent");
    expect(agentEntry.to).toBe("orchestrator");
  });

  it("includes shared context in system prompt when provided", async () => {
    faux = registerFauxProvider();
    let capturedContext: unknown;
    faux.setResponses([
      (context) => {
        capturedContext = context;
        return fauxAssistantMessage(fauxText("Acknowledged."));
      },
    ]);
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);
    const result = await runAgent({
      agentConfig: agent,
      task: "Check rules",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
      sharedContext: [{ path: "AGENTS.md", content: "SHARED_RULE: always test first" }],
    });
    expect(result.error).toBeUndefined();
    const contextStr = JSON.stringify(capturedContext);
    expect(contextStr).toContain("SHARED_RULE: always test first");
    expect(contextStr).toContain("Shared Context");
  });
  it("auto-discovers shared context when not provided", async () => {
    faux = registerFauxProvider();
    let capturedContext: unknown;
    faux.setResponses([
      (context) => {
        capturedContext = context;
        return fauxAssistantMessage(fauxText("OK."));
      },
    ]);
    const project = await makeTempProject();
    writeFileSync(join(project.dir, "AGENTS.md"), "AUTO_DISCOVERED: project agent rules");
    const agent = makeTestAgent(project.dir);
    const result = await runAgent({
      agentConfig: agent,
      task: "Do something",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
    });
    expect(result.error).toBeUndefined();
    const contextStr = JSON.stringify(capturedContext);
    expect(contextStr).toContain("AUTO_DISCOVERED: project agent rules");
  });
  it("returns error for unknown model", async () => {
    const project = await makeTempProject();
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
    });
    expect(result.error).toContain("Model not found");
  });
});
