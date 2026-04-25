import { describe, expect, it } from "vitest";
import { loadBuiltInAgents } from "./index.js";

describe("built-in agents", () => {
  it("loads general-purpose and explore", () => {
    const agents = loadBuiltInAgents();
    const names = agents.map((a) => a.frontmatter.name);
    expect(names).toContain("general-purpose");
    expect(names).toContain("explore");
  });

  it("explore is read-only via disallowedTools", () => {
    const agents = loadBuiltInAgents();
    const explore = agents.find((a) => a.frontmatter.name === "explore");
    expect(explore?.frontmatter.disallowedTools).toEqual(expect.arrayContaining(["edit", "write"]));
  });

  it("explore has inheritContextFiles: false", () => {
    const agents = loadBuiltInAgents();
    const explore = agents.find((a) => a.frontmatter.name === "explore");
    expect(explore?.frontmatter.inheritContextFiles).toBe(false);
  });

  it("general-purpose has no tool restrictions (inherits defaults)", () => {
    const gp = loadBuiltInAgents().find((a) => a.frontmatter.name === "general-purpose");
    expect(gp?.frontmatter.tools).toBeUndefined();
    expect(gp?.frontmatter.disallowedTools).toBeUndefined();
    expect(gp?.frontmatter.model).toBeUndefined();
  });
});
