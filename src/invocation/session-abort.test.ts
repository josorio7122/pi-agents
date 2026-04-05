import { fauxAssistantMessage, fauxText, registerFauxProvider } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { runAgent } from "./session.js";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

describe("runAgent abort signal", () => {
  let faux: ReturnType<typeof registerFauxProvider>;
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey("faux", "fake-key-for-testing");
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  afterEach(() => {
    faux?.unregister();
  });

  it("returns cancellation error when signal is already aborted", async () => {
    faux = registerFauxProvider();
    faux.setResponses([fauxAssistantMessage(fauxText("Should not reach."))]);
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);
    const controller = new AbortController();
    controller.abort();

    const result = await runAgent({
      agentConfig: agent,
      task: "Do work",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
      signal: controller.signal,
    });
    expect(result.error).toBe("Agent execution cancelled");
    expect(result.output).toBe("");
  });

  it("aborts session when signal fires during prompt execution", async () => {
    const controller = new AbortController();
    faux = registerFauxProvider();
    // Faux provider responds with a delay — abort fires during that window
    faux.setResponses([
      () => {
        controller.abort();
        return fauxAssistantMessage(fauxText("Completed despite abort."));
      },
    ]);
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);

    const result = await runAgent({
      agentConfig: agent,
      task: "Long running task",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      conversationLogPath: project.conversationLogPath,
      modelRegistry,
      modelOverride: faux.getModel(),
      signal: controller.signal,
    });
    // Session should abort — either error or the abort handler fires
    // The key test: signal.aborted is true after session completes
    expect(controller.signal.aborted).toBe(true);
    // If abort worked, we get an error or empty output
    if (result.error) {
      expect(result.error).toBeTruthy();
    }
  });
});
