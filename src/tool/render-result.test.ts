import { describe, expect, it } from "vitest";
import type { RenderTheme } from "./render.js";
import { renderAgentResult } from "./render.js";

const mockTheme: RenderTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
};

const agents: Record<string, { icon: string; name: string; color: string; model: string }> = {
  scout: { icon: "🔍", name: "scout", color: "#fff", model: "anthropic/claude-haiku-3" },
  investigator: { icon: "🔬", name: "investigator", color: "#fff", model: "anthropic/claude-opus-4-6" },
};
const mockFindAgent = (name: string) => agents[name];

describe("renderAgentResult — chain, error & aggregates", () => {
  it("renders chain cards with step numbers", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: {
          mode: "chain",
          results: [
            {
              agent: "scout",
              status: "done",
              step: 1,
              metrics: { turns: 2, inputTokens: 500, outputTokens: 100, cost: 0.005, toolCalls: [] },
            },
            {
              agent: "investigator",
              status: "done",
              step: 2,
              metrics: { turns: 4, inputTokens: 1000, outputTokens: 300, cost: 0.02, toolCalls: [] },
            },
          ],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(120);
    const text = lines.join("\n");
    expect(text).toContain("1.");
    expect(text).toContain("2.");
    expect(text).toContain("scout");
    expect(text).toContain("investigator");
  });

  it("shows error state with message", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: { mode: "single", results: [{ agent: "scout", status: "error", error: "Agent crashed" }] },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(120).join("\n");
    expect(text).toContain("✗");
    expect(text).toContain("Agent crashed");
  });

  it("renders mixed running + done in parallel", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: {
          mode: "parallel",
          results: [
            {
              agent: "scout",
              status: "done",
              metrics: { turns: 2, inputTokens: 500, outputTokens: 100, cost: 0.005, toolCalls: [] },
            },
            { agent: "scout", status: "running" },
          ],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(120);
    expect(lines.some((l) => l.includes("✓"))).toBe(true);
    expect(lines.some((l) => l.includes("scout"))).toBe(true);
  });

  it("shows aggregate stats for parallel with multiple cards", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: {
          mode: "parallel",
          results: [
            {
              agent: "scout",
              status: "done",
              metrics: {
                turns: 4,
                inputTokens: 3500,
                outputTokens: 5800,
                cost: 0.079,
                toolCalls: Array(10).fill({ name: "r", args: {} }),
              },
            },
            {
              agent: "scout",
              status: "done",
              metrics: {
                turns: 14,
                inputTokens: 3900,
                outputTokens: 13000,
                cost: 0.174,
                toolCalls: Array(40).fill({ name: "r", args: {} }),
              },
            },
          ],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(120).join("\n");
    expect(text).toContain("Σ");
    expect(text).toContain("18 turns");
    expect(text).toContain("50 tools");
  });

  it("no aggregate for single mode", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: {
          mode: "single",
          results: [
            {
              agent: "scout",
              status: "done",
              metrics: { turns: 3, inputTokens: 1000, outputTokens: 200, cost: 0.01, toolCalls: [] },
            },
          ],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(120).join("\n");
    expect(text).not.toContain("Σ");
  });

  it("no aggregate when all running with no metrics", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: {
          mode: "parallel",
          results: [
            { agent: "scout", status: "running" },
            { agent: "scout", status: "running" },
          ],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(120).join("\n");
    expect(text).not.toContain("Σ");
  });
});
