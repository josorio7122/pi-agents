import { describe, expect, it } from "vitest";
import { renderAgentCall, renderAgentResult } from "./render.js";

const mockTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

describe("renderAgentCall", () => {
  it("renders agent header with icon + name + model", () => {
    const component = renderAgentCall({
      args: { agent: "backend-dev", task: "test" },
      theme: mockTheme,
      findAgent: () => ({ icon: "🟢", name: "backend-dev", color: "#36f9f6", model: "anthropic/claude-sonnet-4-6" }),
    });
    // Component renders — Text object created
    expect(component).toBeDefined();
  });

  it("handles unknown agent", () => {
    const component = renderAgentCall({
      args: { agent: "unknown" },
      theme: mockTheme,
      findAgent: () => undefined,
    });
    expect(component).toBeDefined();
  });
});

describe("renderAgentResult", () => {
  it("renders thinking... when partial", () => {
    const component = renderAgentResult({
      result: { content: [{ type: "text", text: "" }] },
      isPartial: true,
      expanded: false,
      theme: mockTheme,
    });
    expect(component).toBeDefined();
  });

  it("renders collapsed output when complete", () => {
    const component = renderAgentResult({
      result: {
        content: [{ type: "text", text: "Done." }],
        details: {
          output: "Task completed successfully.",
          metrics: { turns: 2, inputTokens: 1000, outputTokens: 200, cost: 0.01, toolCalls: [] },
        },
      },
      isPartial: false,
      expanded: false,
      theme: mockTheme,
    });
    expect(component).toBeDefined();
  });

  it("renders expanded view with task + tools + output", () => {
    const component = renderAgentResult({
      result: {
        content: [{ type: "text", text: "Done." }],
        details: {
          output: "Task completed.",
          task: "Build the thing",
          metrics: {
            turns: 3,
            inputTokens: 5000,
            outputTokens: 500,
            cost: 0.03,
            toolCalls: [
              { name: "read", args: { path: "src/index.ts" } },
              { name: "bash", args: { command: "npm test" } },
            ],
          },
        },
      },
      isPartial: false,
      expanded: true,
      theme: mockTheme,
    });
    expect(component).toBeDefined();
  });

  it("handles no details gracefully", () => {
    const component = renderAgentResult({
      result: { content: [{ type: "text", text: "output" }] },
      isPartial: false,
      expanded: false,
      theme: mockTheme,
    });
    expect(component).toBeDefined();
  });
});
