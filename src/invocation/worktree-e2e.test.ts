import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { runAgent } from "./session.js";
import { makeTestAgent } from "./session-test-helpers.js";

describe("worktree isolation e2e", () => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  it.skipIf(!hasApiKey)(
    "agent edits stay inside worktree, parent cwd untouched",
    async () => {
      const authStorage = AuthStorage.create();
      const modelRegistry = ModelRegistry.create(authStorage);
      const repoDir = mkdtempSync(join(tmpdir(), "pi-wt-e2e-"));
      execSync("git init -q -b main", { cwd: repoDir });
      execSync('git config user.email "t@e"', { cwd: repoDir });
      execSync('git config user.name "t"', { cwd: repoDir });
      writeFileSync(join(repoDir, "seed.txt"), "original");
      execSync("git add . && git commit -q -m init", { cwd: repoDir });

      const sessionsDir = join(repoDir, ".pi", "sessions", "test");
      mkdirSync(sessionsDir, { recursive: true });

      const base = makeTestAgent(repoDir);
      const agent = {
        ...base,
        frontmatter: {
          ...base.frontmatter,
          model: "anthropic/claude-haiku-4-5",
          isolation: "worktree" as const,
        },
      };

      await runAgent({
        agentConfig: agent,
        task: "Use bash to write the literal text 'CHANGED' into a file named edit.txt in the cwd.",
        cwd: repoDir,
        sessionDir: sessionsDir,
        modelRegistry,
      });

      // Parent's seed.txt unchanged; parent has no edit.txt
      expect(readFileSync(join(repoDir, "seed.txt"), "utf-8")).toBe("original");
      expect(() => readFileSync(join(repoDir, "edit.txt"), "utf-8")).toThrow();
    },
    90_000,
  );
});
