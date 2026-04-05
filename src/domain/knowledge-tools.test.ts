import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEditKnowledgeTool, createWriteKnowledgeTool } from "./knowledge-tools.js";

function makeTempEnv() {
  const cwd = mkdtempSync(join(tmpdir(), "knowledge-tools-"));
  const knowledgeDir = join(cwd, ".pi", "knowledge", "project");
  mkdirSync(knowledgeDir, { recursive: true });
  const knowledgePath = join(knowledgeDir, "scout.yaml");
  return { cwd, knowledgeDir, knowledgePath };
}

function makeKnowledgeFiles(env: ReturnType<typeof makeTempEnv>) {
  return [{ path: env.knowledgePath, maxLines: 10 }];
}

describe("createWriteKnowledgeTool", () => {
  it("has name write-knowledge", () => {
    const env = makeTempEnv();
    const tool = createWriteKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });
    expect(tool.name).toBe("write-knowledge");
  });

  it("writes to a knowledge file path", async () => {
    const env = makeTempEnv();
    const tool = createWriteKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });

    await tool.execute("call-1", { path: env.knowledgePath, content: "discovery: complete\n" });

    const content = readFileSync(env.knowledgePath, "utf-8");
    expect(content).toBe("discovery: complete\n");
  });

  it("rejects writes to non-knowledge paths", async () => {
    const env = makeTempEnv();
    const tool = createWriteKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });
    const otherPath = join(env.cwd, "src", "index.ts");

    await expect(tool.execute("call-1", { path: otherPath, content: "bad" })).rejects.toThrow(
      "write-knowledge can only write to knowledge files",
    );
  });

  it("enforces max-lines after writing", async () => {
    const env = makeTempEnv();
    const files = [{ path: env.knowledgePath, maxLines: 3 }];
    const tool = createWriteKnowledgeTool({ cwd: env.cwd, knowledgeFiles: files });

    const longContent = "line1\nline2\nline3\nline4\nline5\n";
    await tool.execute("call-1", { path: env.knowledgePath, content: longContent });

    const content = readFileSync(env.knowledgePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("line3");
  });
});

describe("createEditKnowledgeTool", () => {
  it("has name edit-knowledge", () => {
    const env = makeTempEnv();
    const tool = createEditKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });
    expect(tool.name).toBe("edit-knowledge");
  });

  it("edits a knowledge file path", async () => {
    const env = makeTempEnv();
    writeFileSync(env.knowledgePath, "old: value\n");
    const tool = createEditKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });

    await tool.execute("call-1", {
      path: env.knowledgePath,
      edits: [{ oldText: "old: value", newText: "new: value" }],
    });

    const content = readFileSync(env.knowledgePath, "utf-8");
    expect(content).toContain("new: value");
  });

  it("rejects edits to non-knowledge paths", async () => {
    const env = makeTempEnv();
    const tool = createEditKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });
    const otherPath = join(env.cwd, "src", "index.ts");

    await expect(tool.execute("call-1", { path: otherPath, edits: [{ oldText: "a", newText: "b" }] })).rejects.toThrow(
      "edit-knowledge can only edit knowledge files",
    );
  });

  it("enforces max-lines after editing", async () => {
    const env = makeTempEnv();
    const files = [{ path: env.knowledgePath, maxLines: 3 }];
    writeFileSync(env.knowledgePath, "line1\nline2\n");
    const tool = createEditKnowledgeTool({ cwd: env.cwd, knowledgeFiles: files });

    await tool.execute("call-1", {
      path: env.knowledgePath,
      edits: [{ oldText: "line2", newText: "line2\nline3\nline4\nline5" }],
    });

    const content = readFileSync(env.knowledgePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(3);
  });
});
