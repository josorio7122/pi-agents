import { describe, expect, it } from "vitest";
import { renderAgentResult } from "./render.js";
import type { RenderTheme } from "./render-types.js";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

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
  it("renders chain cards with step numbers in bordered boxes", () => {
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
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(text).toContain("1.");
    expect(text).toContain("2.");
    expect(text).toContain("scout");
    expect(text).toContain("investigator");
    const tops = lines.filter((l) => l.startsWith("┌"));
    expect(tops).toHaveLength(2);
  });

  it("shows error state with message in bordered box", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: { mode: "single", results: [{ agent: "scout", status: "error", error: "Agent crashed" }] },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(text).toContain("✗");
    expect(text).toContain("Agent crashed");
    expect(lines.some((l) => l.includes("┌"))).toBe(true);
  });

  it("renders mixed running + done in parallel with bordered boxes", () => {
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
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(text).toContain("✓");
    expect(text).toContain("scout");
    expect(text).toContain("working...");
    const tops = lines.filter((l) => l.startsWith("┌"));
    expect(tops).toHaveLength(2);
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
    const text = c.render(120).map(strip).join("\n");
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
    const text = c.render(120).map(strip).join("\n");
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
    const text = c.render(120).map(strip).join("\n");
    expect(text).not.toContain("Σ");
  });
});
