import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentConfig } from "../discovery/validator.js";

export async function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "pi-agents-integration-"));
  const sessionsDir = join(dir, ".pi", "sessions", "test-session");

  mkdirSync(sessionsDir, { recursive: true });

  return { dir, sessionsDir };
}

export function makeTestAgent(_projectDir: string): AgentConfig {
  return {
    frontmatter: {
      name: "test-agent",
      description: "A test agent for integration testing.",
      model: "faux/faux-model",
      color: "#ffffff",
      icon: "test",
      tools: ["read", "write", "bash"],
    },
    systemPrompt: "# Test Agent\n\nYou are a test agent. Reply concisely.",
    filePath: join(_projectDir, ".pi", "agents", "test-agent.md"),
    source: "project",
  };
}
