import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// We test discoverAgents behavior by importing the default export
// and simulating pi.on("session_start") with a mock ExtensionAPI.

// Helper: write a valid agent .md file
function writeValidAgent(params: { readonly dir: string; readonly name: string; readonly rootDir: string }) {
  const { dir, name, rootDir } = params;
  const content = `---
name: ${name}
description: "Test agent"
model: anthropic/claude-haiku-3
role: worker
color: "#00ff00"
icon: "🔍"
domain:
  - path: src/
    read: true
    write: false
    delete: false
tools:
  - read
  - ls
skills:
  - path: ${join(rootDir, ".pi", "skills", "test.md")}
    when: Always
knowledge:
  project:
    path: ${join(rootDir, ".pi", "knowledge", "project", `${name}.yaml`)}
    description: "Project knowledge"
    updatable: true
    max-lines: 100
  general:
    path: ${join(rootDir, ".pi", "knowledge", "general", `${name}.yaml`)}
    description: "General knowledge"
    updatable: false
    max-lines: 50
conversation:
  path: .pi/sessions/{{SESSION_ID}}/conversation.jsonl
---

# ${name}

You are ${name}. Be helpful.
`;
  writeFileSync(join(dir, `${name}.md`), content);
}

function writeInvalidAgent(dir: string, name: string) {
  writeFileSync(join(dir, `${name}.md`), `---\nname: ${name}\n---\nBody text.`);
}

function makeTempDirs() {
  const root = mkdtempSync(join(tmpdir(), "pi-agents-index-"));
  const projectAgents = join(root, ".pi", "agents");
  const userAgents = join(root, "user-agents");
  mkdirSync(projectAgents, { recursive: true });
  mkdirSync(userAgents, { recursive: true });
  return { root, projectAgents, userAgents };
}

// Import the module to test discoverAgents indirectly via the extension
// Since discoverAgents is not exported, we test through the extension's behavior.
// We create a minimal mock of ExtensionAPI.
function createMockPi() {
  const handlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
  const registeredTools: unknown[] = [];
  const registeredCommands: Record<string, unknown> = {};

  return {
    pi: {
      on: (event: string, handler: (...args: unknown[]) => Promise<void>) => {
        handlers[event] = handler;
      },
      registerTool: (tool: unknown) => {
        registeredTools.push(tool);
      },
      registerCommand: (name: string, def: unknown) => {
        registeredCommands[name] = def;
      },
    },
    handlers,
    registeredTools,
    registeredCommands,
  };
}

describe("pi-agents extension", () => {
  it("registers session_start handler and agents command", async () => {
    const { default: extension } = await import("./index.js");
    const mock = createMockPi();
    extension(mock.pi as never);

    expect(mock.handlers).toHaveProperty("session_start");
    expect(mock.registeredCommands).toHaveProperty("agents");
  });

  it("discovers agents from project directory", async () => {
    const { default: extension } = await import("./index.js");
    const dirs = makeTempDirs();
    writeValidAgent({ dir: dirs.projectAgents, name: "scout", rootDir: dirs.root });
    mkdirSync(join(dirs.root, ".pi", "skills"), { recursive: true });
    writeFileSync(join(dirs.root, ".pi", "skills", "test.md"), "# Test Skill\nBe helpful.");

    const mock = createMockPi();
    extension(mock.pi as never);

    const sessionDir = join(dirs.root, ".pi", "sessions", "test");
    mkdirSync(sessionDir, { recursive: true });

    const notifications: Array<{ msg: string; level: string }> = [];
    const ctx = {
      cwd: dirs.root,
      modelRegistry: { find: () => undefined },
      ui: {
        notify: (msg: string, level: string) => notifications.push({ msg, level }),
      },
    };

    // Override getAgentDir to use our temp dir
    // session_start handler uses join(getAgentDir(), "agents") for userDir
    // and join(ctx.cwd, ".pi", "agents") for projectDir
    await mock.handlers.session_start!({}, ctx);

    expect(mock.registeredTools.length).toBe(1);
    const infoNotifs = notifications.filter((n) => n.level === "info");
    expect(infoNotifs.some((n) => n.msg.includes("1 agent(s) loaded"))).toBe(true);
  });

  it("does not register tool when no agents found", async () => {
    const { default: extension } = await import("./index.js");
    const dirs = makeTempDirs();
    // No agents written

    const mock = createMockPi();
    extension(mock.pi as never);

    const notifications: Array<{ msg: string; level: string }> = [];
    const ctx = {
      cwd: dirs.root,
      modelRegistry: { find: () => undefined },
      ui: {
        notify: (msg: string, level: string) => notifications.push({ msg, level }),
      },
    };

    await mock.handlers.session_start!({}, ctx);

    expect(mock.registeredTools.length).toBe(0);
  });

  it("reports diagnostics for invalid agents", async () => {
    const { default: extension } = await import("./index.js");
    const dirs = makeTempDirs();
    writeInvalidAgent(dirs.projectAgents, "bad-agent");

    const mock = createMockPi();
    extension(mock.pi as never);

    const notifications: Array<{ msg: string; level: string }> = [];
    const ctx = {
      cwd: dirs.root,
      modelRegistry: { find: () => undefined },
      ui: {
        notify: (msg: string, level: string) => notifications.push({ msg, level }),
      },
    };

    await mock.handlers.session_start!({}, ctx);

    const errorNotifs = notifications.filter((n) => n.level === "error");
    expect(errorNotifs.length).toBeGreaterThan(0);
    expect(mock.registeredTools.length).toBe(0);
  });
});
