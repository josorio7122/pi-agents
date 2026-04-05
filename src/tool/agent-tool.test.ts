import type { Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { createAgentTool } from "./agent-tool.js";

const fakeTheme = { fg: (_c: string, t: string) => t, bold: (t: string) => t } as unknown as Theme;
// ToolRenderContext is not exported — cast through unknown at the boundary
const fakeContext = {} as unknown as Parameters<NonNullable<ReturnType<typeof createAgentTool>["renderCall"]>>[2];

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
    const guidelines = tool.promptGuidelines!.join("\n");
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
    const rendered = tool.renderCall!({ agent: "scout", task: "test" }, fakeTheme, fakeContext);
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
    const rendered = tool.renderResult!(
      { content: [{ type: "text", text: "" }], details: {} },
      { expanded: false, isPartial: false },
      fakeTheme,
      fakeContext,
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
    const rendered = tool.renderResult!(
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
      fakeTheme,
      fakeContext,
    );
    const text = rendered.render(120).join("\n");
    expect(text).toContain("✓");
  });
});
