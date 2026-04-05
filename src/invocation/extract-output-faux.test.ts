import { fauxAssistantMessage, fauxText, fauxToolCall, registerFauxProvider } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { runAgent } from "./session.js";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

describe("extractAssistantOutput via runAgent (faux provider)", () => {
  let faux: ReturnType<typeof registerFauxProvider>;
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey("faux", "fake-key-for-testing");
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  afterEach(() => {
    faux?.unregister();
  });

  it("returns text from a simple single-turn response", async () => {
    faux = registerFauxProvider();
    faux.setResponses([fauxAssistantMessage(fauxText("Here are the results."))]);
    const project = await makeTempProject();
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

    expect(result.output).toBe("Here are the results.");
  });

  it("skips post-knowledge noise and returns findings from multi-turn session", async () => {
    faux = registerFauxProvider();
    // Turn 1: Agent does work with bash tool call
    faux.setResponses([
      fauxAssistantMessage([fauxText("Investigating..."), fauxToolCall("bash", { command: "ls" })]),
      // Turn 2: Agent reports findings + writes knowledge
      fauxAssistantMessage([
        fauxText("## Findings\n\nFound the bug in line 42."),
        fauxToolCall("write-knowledge", {
          path: ".pi/knowledge/project/test-agent.yaml",
          content: "bugs:\n  - line 42",
        }),
      ]),
      // Turn 3: Agent's post-knowledge summary (noise)
      fauxAssistantMessage(fauxText("Updated project knowledge: added bug entry.")),
    ]);
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);

    const result = await runAgent({
      agentConfig: agent,
      task: "Investigate the bug",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
    });

    expect(result.output).toContain("## Findings");
    expect(result.output).toContain("Found the bug in line 42");
    expect(result.output).not.toContain("Updated project knowledge");
  });

  it("returns genuine summary after non-meta tool work", async () => {
    faux = registerFauxProvider();
    // Turn 1: Agent writes a file
    faux.setResponses([
      fauxAssistantMessage([
        fauxText("Creating the file..."),
        fauxToolCall("write", { path: "test.ts", content: "x" }),
      ]),
      // Turn 2: Agent gives a summary (no tool calls)
      fauxAssistantMessage(fauxText("Done. Created test.ts with the implementation.")),
    ]);
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);

    const result = await runAgent({
      agentConfig: agent,
      task: "Create the file",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
    });

    expect(result.output).toBe("Done. Created test.ts with the implementation.");
  });
});
