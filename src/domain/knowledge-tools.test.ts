import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEditKnowledgeTool, createReadKnowledgeTool, createWriteKnowledgeTool } from "./knowledge-tools.js";

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

function extractText(result: { content: ReadonlyArray<{ type: string; text?: string }> }) {
  const first = result.content[0];
  return first?.type === "text" ? (first.text ?? "") : "";
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

  it("writes when knowledgeFiles stores relative path", async () => {
    const env = makeTempEnv();
    // Simulate what session.ts does: expandPath(".pi/knowledge/project/scout.yaml") → relative
    const relativeKnowledgePath = ".pi/knowledge/project/scout.yaml";
    const files = [{ path: relativeKnowledgePath, maxLines: 10 }];
    const tool = createWriteKnowledgeTool({ cwd: env.cwd, knowledgeFiles: files });

    await tool.execute("call-1", { path: relativeKnowledgePath, content: "found: yes\n" });

    const content = readFileSync(env.knowledgePath, "utf-8");
    expect(content).toBe("found: yes\n");
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

describe("createReadKnowledgeTool", () => {
  it("has name read-knowledge", () => {
    const env = makeTempEnv();
    const tool = createReadKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });
    expect(tool.name).toBe("read-knowledge");
  });

  it("reads a knowledge file path", async () => {
    const env = makeTempEnv();
    writeFileSync(env.knowledgePath, "system:\n  framework: Express\n");
    const tool = createReadKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });

    const result = await tool.execute("call-1", { path: env.knowledgePath });
    const text = extractText(result);
    expect(text).toContain("framework: Express");
  });

  it("reads when knowledgeFiles stores relative path", async () => {
    const env = makeTempEnv();
    writeFileSync(env.knowledgePath, "found: yes\n");
    const relativeKnowledgePath = ".pi/knowledge/project/scout.yaml";
    const files = [{ path: relativeKnowledgePath, maxLines: 10 }];
    const tool = createReadKnowledgeTool({ cwd: env.cwd, knowledgeFiles: files });

    const result = await tool.execute("call-1", { path: relativeKnowledgePath });
    const text = extractText(result);
    expect(text).toContain("found: yes");
  });

  it("rejects reads from non-knowledge paths", async () => {
    const env = makeTempEnv();
    const tool = createReadKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });
    const otherPath = join(env.cwd, "src", "index.ts");

    await expect(tool.execute("call-1", { path: otherPath })).rejects.toThrow(
      "read-knowledge can only read knowledge files",
    );
  });

  it("returns empty content for non-existent knowledge file", async () => {
    const env = makeTempEnv();
    const tool = createReadKnowledgeTool({ cwd: env.cwd, knowledgeFiles: makeKnowledgeFiles(env) });

    const result = await tool.execute("call-1", { path: env.knowledgePath });
    const text = extractText(result);
    expect(text).toContain("(empty");
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
