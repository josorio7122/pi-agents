import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import { createAgentTool } from "./agent-tool.js";
import { executeAgentTool } from "./agent-tool-execute.js";

const fakeCtx = {} as unknown as ExtensionContext;

function makeAgent(overrides?: Partial<AgentConfig["frontmatter"]>): AgentConfig {
  return {
    frontmatter: {
      name: "scout",
      description: "Fast recon agent",
      model: "anthropic/claude-haiku-3",
      color: "#00ff00",
      icon: "🔍",
      tools: ["read", "ls"],
      skills: [],
      ...overrides,
    },
    systemPrompt: "You are a scout.",
    filePath: "/tmp/agents/scout.md",
    source: "project",
  };
}

describe("createAgentTool — execute errors", () => {
  const modelRegistry = { find: () => undefined } as never;

  it("throws on invalid mode", async () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
    });
    await expect(tool.execute("call-1", {}, undefined, undefined, fakeCtx)).rejects.toThrow("No mode specified");
  });

  it("throws on unknown agent in single mode", async () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
    });
    await expect(
      tool.execute("call-1", { agent: "nonexistent", task: "do stuff" }, undefined, undefined, fakeCtx),
    ).rejects.toThrow('Unknown agent: "nonexistent"');
  });

  it("throws when parallel mode has unknown agents", async () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
    });
    await expect(
      tool.execute(
        "call-1",
        {
          tasks: [
            { agent: "scout", task: "ok" },
            { agent: "ghost", task: "nope" },
          ],
        },
        undefined,
        undefined,
        fakeCtx,
      ),
    ).rejects.toThrow("Unknown agent");
  });

  it("throws on abort signal", async () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      tool.execute("call-1", { agent: "scout", task: "do stuff" }, controller.signal, undefined, fakeCtx),
    ).rejects.toThrow("cancelled");
  });

  it("throws when chain mode has unknown agents", async () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
    });
    await expect(
      tool.execute(
        "call-1",
        {
          chain: [
            { agent: "scout", task: "ok" },
            { agent: "phantom", task: "nope" },
          ],
        },
        undefined,
        undefined,
        fakeCtx,
      ),
    ).rejects.toThrow("Unknown agent");
  });
});

describe("executeAgentTool — animation cleanup", () => {
  it("cleans up animation interval when execution throws after animation starts", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const emitProgress = vi.fn();
    const agent = makeAgent();

    const runAgentFn = vi.fn().mockRejectedValue(new Error("agent not found in run"));
    const makeRunAgent = vi.fn().mockReturnValue(runAgentFn);

    await expect(
      executeAgentTool({
        toolParams: { agent: "scout", task: "test" },
        agents: [agent],
        findAgent: (name) => (name === "scout" ? agent : undefined),
        makeRunAgent,
        emitProgress,
        signal: undefined,
      }),
    ).rejects.toThrow("agent not found in run");

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});
