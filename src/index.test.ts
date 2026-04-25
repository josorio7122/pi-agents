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
color: "#00ff00"
icon: "🔍"
tools:
  - read
  - ls
skills:
  - ${join(rootDir, ".pi", "skills", "test.md")}
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
    // 1 project agent (scout) + 2 built-ins (general-purpose, explore) = 3
    expect(infoNotifs.some((n) => n.msg.includes("3 agent(s) loaded"))).toBe(true);
  });

  it("registers tool with built-ins when no project/user agents found", async () => {
    const { default: extension } = await import("./index.js");
    const dirs = makeTempDirs();
    // No agents written — built-ins should still register

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

    // Built-ins always available
    expect(mock.registeredTools.length).toBe(1);
  });

  it("loads built-in agents when no project/user agents exist", async () => {
    const { default: extension } = await import("./index.js");
    const dirs = makeTempDirs();

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

    // Built-ins (general-purpose, explore) should be loaded even with no user/project agents
    expect(mock.registeredTools.length).toBe(1);
    const infoNotifs = notifications.filter((n) => n.level === "info");
    // 2 built-ins: general-purpose + explore
    expect(infoNotifs.some((n) => n.msg.includes("2 agent(s) loaded"))).toBe(true);
  });

  it("project agent overrides built-in agent of same name", async () => {
    const { default: extension } = await import("./index.js");
    const dirs = makeTempDirs();

    // Override the built-in `explore` with a project-level version
    const overrideContent = `---
name: explore
description: "Project-level override of explore"
color: "#ff0000"
icon: "🟥"
tools:
  - read
---

# Explore Override

This is a project override.
`;
    writeFileSync(join(dirs.projectAgents, "explore.md"), overrideContent);

    const mock = createMockPi();
    extension(mock.pi as never);

    let capturedAgents: ReadonlyArray<unknown> = [];
    const notifications: Array<{ msg: string; level: string }> = [];
    const ctx = {
      cwd: dirs.root,
      modelRegistry: { find: () => undefined },
      ui: {
        notify: (msg: string, level: string) => notifications.push({ msg, level }),
      },
    };

    await mock.handlers.session_start!({}, ctx);

    // Use the agents command handler to capture loaded agents (clean way to inspect them)
    const agentsCmd = mock.registeredCommands.agents as { handler: (args: unknown, ctx: unknown) => Promise<void> };
    await agentsCmd.handler(undefined, {
      ui: {
        notify: (msg: string) => {
          capturedAgents = [msg];
        },
      },
    });

    // Verify project explore won by checking source via re-import + scan: simpler approach
    // is to verify that "Project-level override" appears in the formatted list (description match)
    expect(String(capturedAgents[0])).toContain("Project-level override");
    // And the built-in description should NOT appear for explore
    expect(String(capturedAgents[0])).not.toContain("Fast read-only codebase exploration");
    // general-purpose built-in should still be listed (not overridden)
    expect(String(capturedAgents[0])).toContain("general-purpose");
  });

  it("emits diagnostics for invalid agents", async () => {
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
    // Built-ins still register even when a project agent is invalid (built-ins always load)
    expect(mock.registeredTools.length).toBe(1);
  });
});
