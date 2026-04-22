import type { Api, Model } from "@mariozechner/pi-ai";
import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { createAgentTool } from "./agent-tool.js";

vi.mock("../invocation/session.js", () => ({
  runAgent: vi.fn(async () => ({
    output: "done",
    metrics: { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] },
  })),
}));

const { runAgent } = await import("../invocation/session.js");
const runAgentMock = vi.mocked(runAgent);

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

function makeCtx(model: Model<Api> | undefined): ExtensionContext {
  return { model } as unknown as ExtensionContext;
}

describe("createAgentTool", () => {
  const modelRegistry = { find: () => undefined } as never;

  it("returns tool with correct name and label", () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
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
    });
    const guidelines = (tool.promptGuidelines ?? []).join("\n");
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
    });
    const rendered = tool.renderCall?.({ agent: "scout", task: "test" }, fakeTheme, fakeContext);
    const text = rendered?.render(120).join("\n") ?? "";
    expect(text).toContain("scout");
  });

  it("renderResult delegates to renderAgentResult", () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
    });

    const rendered = tool.renderResult?.(
      { content: [{ type: "text", text: "" }], details: {} },
      { expanded: false, isPartial: false },
      fakeTheme,
      fakeContext,
    );
    const text = rendered?.render(120).join("\n") ?? "";
    expect(text).toContain("Working");
  });

  it("renderResult shows done state with details", () => {
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
    });

    const rendered = tool.renderResult?.(
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
    const text = rendered?.render(120).join("\n") ?? "";
    expect(text).toContain("✓");
  });

  it("propagates ctx.model to runAgent as inheritedModel", async () => {
    runAgentMock.mockClear();
    runAgentMock.mockResolvedValueOnce({ output: "ok", metrics: emptyMetrics });
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
    });
    const parentModel = { id: "claude-parent", provider: "anthropic" } as unknown as Model<Api>;
    await tool.execute("call-1", { agent: "scout", task: "do" }, undefined, undefined, makeCtx(parentModel));
    expect(runAgentMock).toHaveBeenCalledTimes(1);
    const call = runAgentMock.mock.calls[0]?.[0];
    expect(call?.inheritedModel).toBe(parentModel);
  });

  it("omits inheritedModel when ctx.model is undefined", async () => {
    runAgentMock.mockClear();
    runAgentMock.mockResolvedValueOnce({ output: "ok", metrics: emptyMetrics });
    const tool = createAgentTool({
      agents: [makeAgent()],
      modelRegistry,
      cwd: "/tmp",
      sessionDir: "/tmp/sessions/abc",
    });
    await tool.execute("call-1", { agent: "scout", task: "do" }, undefined, undefined, makeCtx(undefined));
    expect(runAgentMock).toHaveBeenCalledTimes(1);
    const call = runAgentMock.mock.calls[0]?.[0];
    expect(call?.inheritedModel).toBeUndefined();
  });
});
