import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { runAgent } from "./session.js";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

/**
 * E2E test: verifies a real LLM calls the submit tool to deliver output.
 * Requires ANTHROPIC_API_KEY in environment. Skipped in CI.
 */
describe("submit tool e2e", () => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  it.skipIf(!hasApiKey)(
    "real LLM uses submit tool to deliver output",
    async () => {
      const authStorage = AuthStorage.create();
      const modelRegistry = ModelRegistry.create(authStorage);

      const project = await makeTempProject();
      const base = makeTestAgent(project.dir);
      const agent = { ...base, frontmatter: { ...base.frontmatter, model: "anthropic/claude-haiku-4-5" } };

      const result = await runAgent({
        agentConfig: agent,
        task: "What is 2 + 2? Reply with just the number.",
        cwd: project.dir,
        sessionDir: project.sessionsDir,
        modelRegistry,
      });

      expect(result.output).toContain("4");
      expect(result.error).toBeUndefined();
    },
    30_000,
  );
});
