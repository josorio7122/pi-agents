import { describe, expect, it } from "vitest";
import type { AgentMetrics } from "../invocation/metrics.js";
import type { RunAgentFn } from "./modes.js";
import { aggregateMetrics, detectMode, executeChain, executeParallel, executeSingle } from "./modes.js";

const emptyMetrics: AgentMetrics = { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] };

const fakeRunAgent: RunAgentFn = async (params) => ({
  output: `Done: ${params.task}`,
  metrics: emptyMetrics,
});

const failingRunAgent: RunAgentFn = async () => ({
  output: "",
  metrics: emptyMetrics,
  error: "Agent failed",
});

describe("detectMode", () => {
  it("detects single mode", () => {
    const result = detectMode({ agent: "dev", task: "build" });
    expect(result).toEqual({ mode: "single", agent: "dev", task: "build" });
  });

  it("detects parallel mode", () => {
    const result = detectMode({ tasks: [{ agent: "a", task: "x" }] });
    expect(result).toEqual({ mode: "parallel", tasks: [{ agent: "a", task: "x" }] });
  });

  it("detects chain mode", () => {
    const result = detectMode({ chain: [{ agent: "a", task: "x" }] });
    expect(result).toEqual({ mode: "chain", chain: [{ agent: "a", task: "x" }] });
  });

  it("rejects when multiple modes specified", () => {
    const result = detectMode({ agent: "a", task: "b", tasks: [{ agent: "c", task: "d" }] });
    expect("error" in result).toBe(true);
  });

  it("rejects when no mode specified", () => {
    const result = detectMode({});
    expect("error" in result).toBe(true);
  });
});

describe("executeSingle", () => {
  it("calls runAgent and returns result", async () => {
    const result = await executeSingle({ task: "build it", runAgent: fakeRunAgent });
    expect(result.output).toBe("Done: build it");
  });
});

describe("executeParallel", () => {
  it("runs multiple tasks concurrently", async () => {
    const results = await executeParallel({
      tasks: [
        { task: "task A", runAgent: fakeRunAgent },
        { task: "task B", runAgent: fakeRunAgent },
      ],
      maxConcurrency: 4,
    });
    expect(results).toHaveLength(2);
    expect(results[0]?.output).toBe("Done: task A");
    expect(results[1]?.output).toBe("Done: task B");
  });
});

describe("executeChain", () => {
  it("passes output of step N as {previous} to step N+1", async () => {
    const capturing: RunAgentFn = async (params) => ({
      output: `result-of-${params.task.replace("{previous}", "").trim()}`,
      metrics: emptyMetrics,
    });

    const result = await executeChain({
      steps: [
        { task: "step1", runAgent: capturing },
        { task: "step2 using {previous}", runAgent: capturing },
      ],
    });

    expect(result.output).toBe("result-of-step2 using result-of-step1");
    expect(result.steps).toHaveLength(2);
  });

  it("stops on first failure and returns completed steps", async () => {
    const result = await executeChain({
      steps: [
        { task: "step1", runAgent: failingRunAgent },
        { task: "step2 {previous}", runAgent: fakeRunAgent },
      ],
    });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.error).toBe("Agent failed");
  });
});

describe("aggregateMetrics", () => {
  it("sums metrics across results", () => {
    const results = [
      {
        output: "a",
        metrics: {
          turns: 2,
          inputTokens: 1000,
          outputTokens: 200,
          cost: 0.01,
          toolCalls: [{ name: "read", args: {} }],
        },
      },
      {
        output: "b",
        metrics: {
          turns: 3,
          inputTokens: 2000,
          outputTokens: 400,
          cost: 0.02,
          toolCalls: [{ name: "bash", args: {} }],
        },
      },
    ];
    const agg = aggregateMetrics(results);
    expect(agg.turns).toBe(5);
    expect(agg.inputTokens).toBe(3000);
    expect(agg.outputTokens).toBe(600);
    expect(agg.cost).toBe(0.03);
    expect(agg.toolCalls).toHaveLength(2);
  });

  it("returns zeros for empty array", () => {
    const agg = aggregateMetrics([]);
    expect(agg.turns).toBe(0);
    expect(agg.toolCalls).toHaveLength(0);
  });
});
