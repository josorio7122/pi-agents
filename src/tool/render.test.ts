import { describe, expect, it } from "vitest";
import { renderAgentCall, renderAgentResult } from "./render.js";
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

// ── renderCall ────────────────────────────────────────────

describe("renderAgentCall", () => {
  it("renders single agent with bordered box, icon, name, model, and task", () => {
    const c = renderAgentCall({
      args: { agent: "scout", task: "find bugs" },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(lines.some((l) => l.includes("┌"))).toBe(true);
    expect(text).toContain("🔍");
    expect(text).toContain("scout");
    expect(text).toContain("anthropic/claude-haiku-3");
    expect(text).toContain("find bugs");
  });

  it("renders parallel mode with header + multiple bordered boxes", () => {
    const c = renderAgentCall({
      args: {
        tasks: [
          { agent: "scout", task: "task a" },
          { agent: "investigator", task: "task b" },
        ],
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(text).toContain("parallel (2 tasks)");
    const tops = lines.filter((l) => l.startsWith("┌"));
    expect(tops).toHaveLength(2);
    expect(text).toContain("scout");
    expect(text).toContain("investigator");
    expect(text).toContain("task a");
    expect(text).toContain("task b");
  });

  it("renders chain mode with header + numbered bordered boxes", () => {
    const c = renderAgentCall({
      args: {
        chain: [
          { agent: "scout", task: "step a" },
          { agent: "investigator", task: "step b" },
        ],
      },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(text).toContain("chain (2 steps)");
    expect(text).toContain("1.");
    expect(text).toContain("2.");
    const tops = lines.filter((l) => l.startsWith("┌"));
    expect(tops).toHaveLength(2);
    expect(text).toContain("scout");
    expect(text).toContain("investigator");
  });

  it("handles unknown agent gracefully", () => {
    const c = renderAgentCall({ args: { agent: "unknown" }, theme: mockTheme, findAgent: mockFindAgent });
    const text = c.render(120).map(strip).join("\n");
    expect(text).toContain("unknown");
    expect(text).toContain("┌");
  });
});

// ── renderResult ──────────────────────────────────────────

describe("renderAgentResult", () => {
  it("shows initializing box when no details", () => {
    const c = renderAgentResult({
      result: { content: [{ type: "text", text: "" }] },
      theme: mockTheme,
      findAgent: mockFindAgent,
    });
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(text).toContain("initializing...");
    expect(lines.some((l) => l.includes("┌"))).toBe(true);
  });

  it("renders done entry with output + checkmark + metrics in bordered box", () => {
    const c = renderAgentResult({
      result: {
        content: [{ type: "text", text: "output" }],
        details: {
          mode: "single",
          results: [
            {
              agent: "scout",
              status: "done",
              output: "Found 3 bugs",
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
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(lines.some((l) => l.includes("┌"))).toBe(true);
    expect(text).toContain("scout");
    expect(text).toContain("Found 3 bugs");
    expect(text).toContain("✓");
    expect(text).toContain("3 turns");
  });

  it("renders running entry with working indicator in bordered box", () => {
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
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(text).toContain("Working");
    const tops = lines.filter((l) => l.startsWith("┌"));
    expect(tops).toHaveLength(2);
  });

  it("renders running entry without metrics still shows working", () => {
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
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    expect(text).toContain("Working");
    const tops = lines.filter((l) => l.startsWith("┌"));
    expect(tops).toHaveLength(2);
  });

  it("renders error entry with ✗ in bordered box", () => {
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

  it("renders parallel results with multiple boxes + aggregate stats", () => {
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
    const lines = c.render(120).map(strip);
    const text = lines.join("\n");
    const tops = lines.filter((l) => l.startsWith("┌"));
    expect(tops).toHaveLength(2);
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
});
