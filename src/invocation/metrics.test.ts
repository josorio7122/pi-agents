import { describe, expect, it } from "vitest";
import type { AgentMetrics } from "./metrics.js";
import { createMetricsTracker, sumMetrics } from "./metrics.js";

describe("createMetricsTracker", () => {
  it("starts with zero metrics", () => {
    const tracker = createMetricsTracker();
    const m = tracker.snapshot();
    expect(m.turns).toBe(0);
    expect(m.inputTokens).toBe(0);
    expect(m.outputTokens).toBe(0);
    expect(m.cost).toBe(0);
    expect(m.toolCalls).toEqual([]);
  });

  it("increments turns on turn_end", () => {
    const tracker = createMetricsTracker();
    tracker.handle({ type: "turn_end" });
    tracker.handle({ type: "turn_end" });
    expect(tracker.snapshot().turns).toBe(2);
  });

  it("accumulates tokens on message_end", () => {
    const tracker = createMetricsTracker();
    tracker.handle({
      type: "message_end",
      message: {
        role: "assistant",
        usage: { input: 1000, output: 200, cost: { total: 0.01 } },
      },
    });
    tracker.handle({
      type: "message_end",
      message: {
        role: "assistant",
        usage: { input: 2000, output: 300, cost: { total: 0.02 } },
      },
    });
    const m = tracker.snapshot();
    expect(m.inputTokens).toBe(3000);
    expect(m.outputTokens).toBe(500);
    expect(m.cost).toBeCloseTo(0.03);
  });

  it("ignores non-assistant messages", () => {
    const tracker = createMetricsTracker();
    tracker.handle({
      type: "message_end",
      message: { role: "user" },
    });
    expect(tracker.snapshot().inputTokens).toBe(0);
  });

  it("records tool calls on tool_execution_start", () => {
    const tracker = createMetricsTracker();
    tracker.handle({ type: "tool_execution_start", toolName: "read", args: { path: "test.ts" } });
    tracker.handle({ type: "tool_execution_start", toolName: "bash", args: { command: "npm test" } });
    const calls = tracker.snapshot().toolCalls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ name: "read", args: { path: "test.ts" } });
    expect(calls[1]).toEqual({ name: "bash", args: { command: "npm test" } });
  });

  it("returns immutable snapshots", () => {
    const tracker = createMetricsTracker();
    const s1 = tracker.snapshot();
    tracker.handle({ type: "turn_end" });
    const s2 = tracker.snapshot();
    expect(s1.turns).toBe(0);
    expect(s2.turns).toBe(1);
  });
});

describe("sumMetrics", () => {
  it("sums numeric fields and concatenates toolCalls", () => {
    const a: AgentMetrics = {
      turns: 2,
      inputTokens: 1000,
      outputTokens: 200,
      cost: 0.01,
      toolCalls: [{ name: "read", args: { path: "a.ts" } }],
    };
    const b: AgentMetrics = {
      turns: 3,
      inputTokens: 2000,
      outputTokens: 400,
      cost: 0.02,
      toolCalls: [{ name: "bash", args: { command: "ls" } }],
    };
    const result = sumMetrics(a, b);
    expect(result.turns).toBe(5);
    expect(result.inputTokens).toBe(3000);
    expect(result.outputTokens).toBe(600);
    expect(result.cost).toBeCloseTo(0.03);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]).toEqual({ name: "read", args: { path: "a.ts" } });
    expect(result.toolCalls[1]).toEqual({ name: "bash", args: { command: "ls" } });
  });

  it("works with zero metrics", () => {
    const zero: AgentMetrics = { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] };
    const a: AgentMetrics = { turns: 1, inputTokens: 500, outputTokens: 100, cost: 0.005, toolCalls: [] };
    expect(sumMetrics(zero, a)).toEqual(a);
    expect(sumMetrics(a, zero)).toEqual(a);
  });
});
