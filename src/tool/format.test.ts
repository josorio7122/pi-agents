import { describe, expect, it } from "vitest";
import { formatTokens, formatToolCall, formatUsageStats } from "./format.js";

describe("formatTokens", () => {
  it("formats small numbers as-is", () => {
    expect(formatTokens(500)).toBe("500");
  });

  it("formats thousands with k", () => {
    expect(formatTokens(1500)).toBe("1.5k");
  });

  it("formats tens of thousands", () => {
    expect(formatTokens(45000)).toBe("45k");
  });

  it("formats millions with M", () => {
    expect(formatTokens(1200000)).toBe("1.2M");
  });

  it("formats zero", () => {
    expect(formatTokens(0)).toBe("0");
  });
});

describe("formatUsageStats", () => {
  it("formats input + output + cost", () => {
    const result = formatUsageStats({ inputTokens: 45000, outputTokens: 3200, cost: 0.034, turns: 0, toolCalls: [] });
    expect(result).toContain("↑45k");
    expect(result).toContain("↓3.2k");
    expect(result).toContain("$0.034");
  });

  it("includes turns when > 0", () => {
    const result = formatUsageStats({ inputTokens: 1000, outputTokens: 200, cost: 0.01, turns: 3, toolCalls: [] });
    expect(result).toContain("3 turns");
  });

  it("formats singular turn and tool", () => {
    const result = formatUsageStats({
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.001,
      turns: 1,
      toolCalls: [{ name: "read", args: {} }],
    });
    expect(result).toContain("1 turn ");
    expect(result).toContain("1 tool ");
  });

  it("formats plural tools", () => {
    const result = formatUsageStats({
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.001,
      turns: 0,
      toolCalls: [
        { name: "read", args: {} },
        { name: "bash", args: {} },
      ],
    });
    expect(result).toContain("2 tools");
  });
});

describe("formatToolCall", () => {
  it("formats bash as $ command", () => {
    expect(formatToolCall("bash", { command: "npm test" })).toBe("$ npm test");
  });

  it("formats read as read path", () => {
    expect(formatToolCall("read", { path: "src/index.ts" })).toBe("read src/index.ts");
  });

  it("formats grep as grep /pattern/ in path", () => {
    expect(formatToolCall("grep", { pattern: "TODO", path: "src/" })).toBe("grep /TODO/ in src/");
  });

  it("formats write with path", () => {
    expect(formatToolCall("write", { path: "src/new.ts" })).toContain("write src/new.ts");
  });

  it("formats unknown tools with name + args", () => {
    expect(formatToolCall("custom", { key: "value" })).toContain("custom");
  });
});
