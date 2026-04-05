import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import { createAgentTool } from "./agent-tool.js";

const fakeCtx = {} as unknown as ExtensionContext;

function makeAgent(overrides?: Partial<AgentConfig["frontmatter"]>): AgentConfig {
  return {
    frontmatter: {
      name: "scout",
      description: "Fast recon agent",
      model: "anthropic/claude-haiku-3",
      role: "worker",
      color: "#00ff00",
      icon: "🔍",
      domain: [{ path: "src/", read: true, write: false, delete: false }],
      tools: ["read", "ls"],
      skills: [],
      knowledge: {
        project: { path: "/tmp/knowledge/scout.yaml", description: "project", updatable: true, "max-lines": 100 },
        general: { path: "/tmp/knowledge/general.yaml", description: "general", updatable: false, "max-lines": 50 },
      },
      conversation: { path: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl" },
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
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
    });
    await expect(tool.execute("call-1", {}, undefined, undefined, fakeCtx)).rejects.toThrow("No mode specified");
  });

  it("throws on unknown agent in single mode", async () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
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
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
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
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
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
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
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
