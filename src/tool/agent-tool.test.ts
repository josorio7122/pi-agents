import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { createAgentTool } from "./agent-tool.js";
import type { RenderTheme } from "./render.js";

const emptyMetrics: AgentMetrics = { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] };

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

describe("createAgentTool", () => {
  const modelRegistry = { find: () => undefined } as never;

  it("returns tool with correct name and label", () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
    });
    expect(tool.name).toBe("agent");
    expect(tool.label).toBe("Agent");
  });

  it("includes all agent names in promptGuidelines", () => {
    const tool = createAgentTool({
      agents: [makeAgent(), makeAgent({ name: "investigator", icon: "🔬", description: "Deep analysis" })],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
    });
    const guidelines = tool.promptGuidelines.join("\n");
    expect(guidelines).toContain("scout");
    expect(guidelines).toContain("investigator");
    expect(guidelines).toContain("🔍");
    expect(guidelines).toContain("🔬");
  });

  it("has parameters schema with all three modes", () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
    });
    const props = tool.parameters.properties;
    expect(props).toHaveProperty("agent");
    expect(props).toHaveProperty("task");
    expect(props).toHaveProperty("tasks");
    expect(props).toHaveProperty("chain");
  });

  it("renderCall delegates to renderAgentCall", () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
    });
    const mockTheme: RenderTheme = { fg: (_c, t) => t, bold: (t) => t };
    const rendered = tool.renderCall({ agent: "scout", task: "test" }, mockTheme as any);
    const text = rendered.render(120).join("\n");
    expect(text).toContain("scout");
  });

  it("renderResult delegates to renderAgentResult", () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
    });
    const mockTheme: RenderTheme = { fg: (_c, t) => t, bold: (t) => t };
    const rendered = tool.renderResult(
      { content: [{ type: "text", text: "" }] },
      { expanded: false, isPartial: false },
      mockTheme as any,
    );
    const text = rendered.render(120).join("\n");
    expect(text).toContain("running...");
  });

  it("renderResult shows done state with details", () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
    });
    const mockTheme: RenderTheme = { fg: (_c, t) => t, bold: (t) => t };
    const rendered = tool.renderResult(
      {
        content: [{ type: "text", text: "done" }],
        details: {
          mode: "single",
          results: [
            {
              agent: "scout",
              status: "done",
              metrics: { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.001, toolCalls: [] },
            },
          ],
        },
      },
      { expanded: false, isPartial: false },
      mockTheme as any,
    );
    const text = rendered.render(120).join("\n");
    expect(text).toContain("✓");
  });

  it("execute throws on invalid mode", async () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
    });
    await expect(tool.execute("call-1", {}, undefined, undefined, undefined as any)).rejects.toThrow(
      "No mode specified",
    );
  });

  it("execute throws on unknown agent in single mode", async () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
      conversationLogPath: "/tmp/sessions/abc/conversation.jsonl",
    });
    await expect(
      tool.execute("call-1", { agent: "nonexistent", task: "do stuff" }, undefined, undefined, undefined as any),
    ).rejects.toThrow('Unknown agent: "nonexistent"');
  });

  it("execute throws when parallel mode has unknown agents", async () => {
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
        undefined as any,
      ),
    ).rejects.toThrow("Unknown agent");
  });

  it("execute throws on abort signal", async () => {
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
      tool.execute("call-1", { agent: "scout", task: "do stuff" }, controller.signal, undefined, undefined as any),
    ).rejects.toThrow("cancelled");
  });

  it("execute throws when chain mode has unknown agents", async () => {
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
        undefined as any,
      ),
    ).rejects.toThrow("Unknown agent");
  });
});
