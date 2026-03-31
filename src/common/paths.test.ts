import { describe, expect, it } from "vitest";
import { expandPath } from "./paths.js";

describe("expandPath", () => {
  it("expands ~ to home directory", () => {
    const result = expandPath("~/.pi/agent/general/test.yaml");
    expect(result).not.toContain("~");
    expect(result).toMatch(/^\//);
    expect(result).toContain(".pi/agent/general/test.yaml");
  });

  it("returns non-tilde paths unchanged", () => {
    expect(expandPath(".pi/knowledge/test.yaml")).toBe(".pi/knowledge/test.yaml");
  });

  it("returns absolute paths unchanged", () => {
    expect(expandPath("/tmp/test.yaml")).toBe("/tmp/test.yaml");
  });

  it("handles bare ~", () => {
    const result = expandPath("~");
    expect(result).not.toBe("~");
    expect(result).toMatch(/^\//);
  });

  it("handles ~ with trailing slash", () => {
    const result = expandPath("~/test/");
    expect(result).not.toContain("~");
    expect(result).toMatch(/^\//);
    expect(result).toContain("/test/");
    expect(result).toMatch(/\/test\/$/);
  });
});
