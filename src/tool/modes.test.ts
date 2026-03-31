import { describe, expect, it } from "vitest";
import type { AgentMetrics } from "../invocation/metrics.js";
import type { RunAgentFn } from "./modes.js";
import { detectMode, executeChain, executeParallel, executeSingle } from "./modes.js";

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
  });

  it("stops on first failure", async () => {
    const result = await executeChain({
      steps: [
        { task: "step1", runAgent: failingRunAgent },
        { task: "step2 {previous}", runAgent: fakeRunAgent },
      ],
    });
    expect(result.error).toContain("step 1");
  });
});
