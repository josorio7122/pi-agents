import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { loadBuiltInAgents } from "../built-in/index.js";
import { runAgent } from "./session.js";
import { makeTempProject } from "./session-test-helpers.js";

describe("built-in explore e2e", () => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  it.skipIf(!hasApiKey)(
    "explore agent reads a file and reports its content",
    async () => {
      const authStorage = AuthStorage.create();
      const modelRegistry = ModelRegistry.create(authStorage);
      const project = await makeTempProject();
      writeFileSync(join(project.dir, "marker.txt"), "PI_AGENT_MARKER_XYZ");

      const explore = loadBuiltInAgents().find((a) => a.frontmatter.name === "explore")!;
      const result = await runAgent({
        agentConfig: explore,
        task: "Find any file in the cwd containing PI_AGENT_MARKER_XYZ. Report its filename.",
        cwd: project.dir,
        sessionDir: project.sessionsDir,
        modelRegistry,
      });

      expect(result.output.toLowerCase()).toContain("marker.txt");
      expect(result.error).toBeUndefined();
    },
    60_000,
  );
});
