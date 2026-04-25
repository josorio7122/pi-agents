import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
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

/**
 * Builds a fake `DefaultResourceLoader` class for use inside `vi.mock()`
 * factories. All getters return empty/no-op shapes that satisfy
 * pi-coding-agent's `ResourceLoader` contract.
 *
 * The optional `onConstruct` callback receives the constructor opts — used by
 * session.test.ts to assert what runAgent passes to the loader. Tests that
 * don't need to capture opts call without an argument.
 */
export function createFakeResourceLoader(onConstruct?: (opts: unknown) => void) {
  return class FakeResourceLoader {
    constructor(opts?: unknown) {
      onConstruct?.(opts);
    }
    getSystemPrompt() {
      return "";
    }
    getExtensions() {
      return { extensions: [], errors: [], runtime: {} };
    }
    getSkills() {
      return { skills: [], diagnostics: [] };
    }
    getPrompts() {
      return { prompts: [], diagnostics: [] };
    }
    getThemes() {
      return { themes: [], diagnostics: [] };
    }
    getAgentsFiles() {
      return { agentsFiles: [] };
    }
    getAppendSystemPrompt() {
      return [];
    }
    extendResources() {}
    async reload() {}
  };
}

export const fakeModel = { provider: "faux", id: "faux-model" } as unknown as Model<Api>;

export const fakeRegistry = {
  find: (_provider: string, _id: string) => fakeModel,
} as unknown as ModelRegistry;
