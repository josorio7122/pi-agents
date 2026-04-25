import { describe, expect, it } from "vitest";
import { buildAgentTools } from "./build-tools.js";

describe("disallowedTools", () => {
  it("filters out denied tools from effective set", () => {
    const result = buildAgentTools({
      tools: ["read", "bash", "write"],
      disallowedTools: ["write"],
      cwd: "/tmp",
    });
    const names = result.builtinTools.map((t) => t.name);
    expect(names).toContain("read");
    expect(names).toContain("bash");
    expect(names).not.toContain("write");
  });

  it("applies disallowedTools against pi default when tools omitted", () => {
    const result = buildAgentTools({
      tools: undefined,
      disallowedTools: ["edit", "write"],
      cwd: "/tmp",
    });
    const names = result.builtinTools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["read", "bash"]));
    expect(names).not.toContain("edit");
    expect(names).not.toContain("write");
  });
});
