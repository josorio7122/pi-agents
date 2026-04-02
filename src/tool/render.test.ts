import { describe, expect, it } from "vitest";
import type { RenderTheme } from "./render.js";
import { renderAgentCall, renderAgentResult } from "./render.js";

const mockTheme: RenderTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
};

const agents: Record<string, { icon: string; name: string; color: string; model: string }> = {
  scout: { icon: "🔍", name: "scout", color: "#fff", model: "anthropic/claude-haiku-3" },
  investigator: { icon: "🔬", name: "investigator", color: "#fff", model: "anthropic/claude-opus-4-6" },
};
const mockFindAgent = (name: string) => agents[name];

// ── renderCall ────────────────────────────────────────────

describe("renderAgentCall", () => {
  it("renders single agent with icon + name + model", () => {
    const c = renderAgentCall({ args: { agent: "scout", task: "test" }, theme: mockTheme, findAgent: mockFindAgent });
    const text = c.render(120).join("\n");
    expect(text).toContain("🔍");
    expect(text).toContain("scout");
    expect(text).toContain("anthropic/claude-haiku-3");
  });

  it("renders parallel mode header with count only", () => {
    const c = renderAgentCall({
      args: {
        tasks: [
          { agent: "scout", task: "a" },
          { agent: "scout", task: "b" },
        ],
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(120).join("\n");
    expect(text).toContain("parallel (2 tasks)");
    expect(text).not.toContain("scout");
  });

  it("renders chain mode header with count only", () => {
    const c = renderAgentCall({
      args: {
        chain: [
          { agent: "scout", task: "a" },
          { agent: "investigator", task: "b" },
        ],
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(120).join("\n");
    expect(text).toContain("chain (2 steps)");
    expect(text).not.toContain("scout");
  });

  it("handles unknown agent gracefully", () => {
    const c = renderAgentCall({ args: { agent: "unknown" }, theme: mockTheme, findAgent: mockFindAgent });
    expect(c.render(120).join("")).toContain("unknown");
  });
});

// ── renderResult ──────────────────────────────────────────

describe("renderAgentResult", () => {
  it("shows running fallback when no details", () => {
    const c = renderAgentResult({
      result: { content: [{ type: "text", text: "" }] },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    expect(c.render(120).join("")).toContain("running...");
  });

  it("renders single done card with stats", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "output" }],
        details: {
          mode: "single",
          results: [
            {
              agent: "scout",
              status: "done",
              metrics: {
                turns: 3,
                inputTokens: 1000,
                outputTokens: 200,
                cost: 0.01,
                toolCalls: [{ name: "read", args: {} }],
              },
            },
          ],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(120).join("\n");
    expect(text).toContain("✓");
    expect(text).toContain("3 turns");
    expect(text).not.toContain("output");
  });

  it("single mode shows compact card — no icon or name", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
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
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const text = c.render(120).join("\n");
    expect(text).toContain("✓");
    expect(text).not.toContain("scout");
    expect(text).not.toContain("🔍");
  });

  it("renders running agents with spinner when metrics present", () => {
    const metrics = { turns: 1, inputTokens: 100, outputTokens: 50, cost: 0.001, toolCalls: [] };
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "" }],
        details: {
          mode: "parallel",
          results: [
            { agent: "scout", status: "running", metrics },
            { agent: "scout", status: "running", metrics },
          ],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(120);
    const running = lines.filter((l) => l.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/));
    expect(running).toHaveLength(2);
  });

  it("hides spinner for running agents with no metrics", () => {
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
    const lines = c.render(120);
    const running = lines.filter((l) => l.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/));
    expect(running).toHaveLength(0);
  });

  it("renders parallel cards separated by spacer", () => {
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
            {
              agent: "scout",
              status: "error",
              error: "timeout",
              metrics: { turns: 1, inputTokens: 200, outputTokens: 50, cost: 0.002, toolCalls: [] },
            },
          ],
        },
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(120);
    expect(lines.some((l) => l.includes("✓"))).toBe(true);
    expect(lines.some((l) => l.includes("✗"))).toBe(true);
    expect(lines.some((l) => l.includes("timeout"))).toBe(true);
    expect(lines.includes("")).toBe(true);
  });

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
    // Running entry with no metrics shows name only, no spinner
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
