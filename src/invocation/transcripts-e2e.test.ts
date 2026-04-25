import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { runAgent } from "./session.js";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

describe("transcripts e2e", () => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  it.skipIf(!hasApiKey)(
    "real agent writes parseable JSONL transcript",
    async () => {
      const authStorage = AuthStorage.create();
      const modelRegistry = ModelRegistry.create(authStorage);
      const project = await makeTempProject();
      const base = makeTestAgent(project.dir);
      const agent = { ...base, frontmatter: { ...base.frontmatter, model: "anthropic/claude-haiku-4-5" } };

      await runAgent({
        agentConfig: agent,
        task: "Reply with the word: pong",
        cwd: project.dir,
        sessionDir: project.sessionsDir,
        modelRegistry,
      });

      const agentsDir = join(project.sessionsDir, "agents");
      expect(existsSync(agentsDir)).toBe(true);
      const [agentId] = readdirSync(agentsDir);
      const files = readdirSync(join(agentsDir, agentId!));
      const jsonl = files.find((f) => f.endsWith(".jsonl"))!;
      const content = readFileSync(join(agentsDir, agentId!, jsonl), "utf-8");
      const lines = content
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toHaveProperty("type");
    },
    30_000,
  );
});
