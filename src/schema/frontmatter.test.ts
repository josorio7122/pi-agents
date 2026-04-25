import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { AgentFrontmatterSchema, PI_DEFAULT_TOOLS, validateFrontmatter } from "./frontmatter.js";
import { safeParse } from "./parse.js";

const validMinimal = {
  name: "scout",
  description: "Fast codebase recon.",
  color: "#36f9f6",
  icon: "🔍",
};

describe("AgentFrontmatterSchema", () => {
  it("accepts minimal required fields", () => {
    const result = safeParse(AgentFrontmatterSchema, validMinimal);
    expect(result.success).toBe(true);
  });

  it("accepts model: inherit", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, model: "inherit" });
    expect(result.success).toBe(true);
  });

  it("accepts model as provider/name", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, model: "anthropic/claude-sonnet-4-6" });
    expect(result.success).toBe(true);
  });

  it("rejects model with bad format", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, model: "bogus" });
    expect(result.success).toBe(false);
  });

  it("accepts tools when declared", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, tools: ["read", "bash"] });
    expect(result.success).toBe(true);
  });

  it("accepts tools absent (inherits default)", () => {
    const result = safeParse(AgentFrontmatterSchema, validMinimal);
    expect(result.success).toBe(true);
  });

  it("rejects tools: [] (minItems 1 when field declared)", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, tools: [] });
    expect(result.success).toBe(false);
  });

  it("accepts skills absent", () => {
    const result = safeParse(AgentFrontmatterSchema, validMinimal);
    expect(result.success).toBe(true);
  });

  it("accepts skills: [] (explicit opt-out)", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, skills: [] });
    expect(result.success).toBe(true);
  });

  it("accepts skills with absolute paths", () => {
    const result = safeParse(AgentFrontmatterSchema, {
      ...validMinimal,
      skills: ["/abs/path/to/skill/SKILL.md"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects skills with relative paths", () => {
    const result = safeParse(AgentFrontmatterSchema, {
      ...validMinimal,
      skills: ["./skill.md"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level keys (additionalProperties: false)", () => {
    const result = safeParse(AgentFrontmatterSchema, { ...validMinimal, extra: "value" });
    expect(result.success).toBe(false);
  });
});

describe("validateFrontmatter", () => {
  it("returns [] when skills absent", () => {
    expect(validateFrontmatter(validMinimal as never)).toEqual([]);
  });

  it("returns [] when skills declared with default tools (default includes read)", () => {
    expect(
      validateFrontmatter({
        ...validMinimal,
        skills: ["/abs/skill/SKILL.md"],
      } as never),
    ).toEqual([]);
  });

  it("returns error when skills declared and tools omits read", () => {
    const errors = validateFrontmatter({
      ...validMinimal,
      tools: ["bash"],
      skills: ["/abs/skill/SKILL.md"],
    } as never);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("declares skills but has no 'read' tool");
  });

  it("returns [] for empty skills list (opt-out)", () => {
    expect(
      validateFrontmatter({
        ...validMinimal,
        tools: ["bash"],
        skills: [],
      } as never),
    ).toEqual([]);
  });

  it("exposes pi-default tool list for consumers", () => {
    expect(PI_DEFAULT_TOOLS).toEqual(["read", "bash", "edit", "write"]);
  });
});

describe("frontmatter additions", () => {
  it("accepts disallowedTools", () => {
    const fm = {
      name: "x",
      description: "y",
      color: "#abcdef",
      icon: "i",
      disallowedTools: ["write", "edit"],
    };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(true);
  });

  it("accepts maxTurns positive integer", () => {
    const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", maxTurns: 10 };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(true);
  });

  it("rejects maxTurns zero or negative", () => {
    const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", maxTurns: 0 };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(false);
  });

  it("accepts inheritContextFiles boolean", () => {
    const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", inheritContextFiles: false };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(true);
  });

  it("accepts isolation: worktree", () => {
    const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", isolation: "worktree" };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(true);
  });

  it("rejects unknown isolation values", () => {
    const fm = { name: "x", description: "y", color: "#abcdef", icon: "i", isolation: "remote" };
    expect(Value.Check(AgentFrontmatterSchema, fm)).toBe(false);
  });
});
