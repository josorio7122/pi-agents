import { describe, expect, it } from "vitest";
import { expandPath, resolveConversationPath } from "./paths.js";

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

describe("resolveConversationPath", () => {
  it("resolves {{SESSION_ID}} in template", () => {
    const result = resolveConversationPath({
      template: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl",
      sessionId: "abc-123",
      cwd: "/project",
    });
    expect(result).toBe("/project/.pi/sessions/abc-123/conversation.jsonl");
  });

  it("resolves absolute template paths", () => {
    const result = resolveConversationPath({
      template: "/tmp/sessions/{{SESSION_ID}}/log.jsonl",
      sessionId: "xyz",
      cwd: "/project",
    });
    expect(result).toBe("/tmp/sessions/xyz/log.jsonl");
  });
});
