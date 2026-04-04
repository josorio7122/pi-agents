import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendToLog, ensureLogExists, readLog } from "./conversation-log.js";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "pi-agents-log-"));
}

describe("conversation-log", () => {
  describe("ensureLogExists", () => {
    it("creates file with parent dirs if missing", async () => {
      const dir = makeTempDir();
      const logPath = join(dir, "sessions", "abc", "conversation.jsonl");
      await ensureLogExists(logPath);
      expect(readFileSync(logPath, "utf-8")).toBe("");
    });

    it("does not overwrite existing file", async () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      await ensureLogExists(logPath);
      await appendToLog(logPath, { ts: "t1", from: "user", to: "agent", message: "hello" });
      await ensureLogExists(logPath);
      expect(await readLog(logPath)).toContain("hello");
    });
  });

  describe("appendToLog", () => {
    it("appends JSONL entry", async () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      await ensureLogExists(logPath);
      await appendToLog(logPath, { ts: "2026-03-30T14:00:00Z", from: "user", to: "agent", message: "task" });
      const content = readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());
      expect(parsed.from).toBe("user");
      expect(parsed.message).toBe("task");
    });

    it("appends multiple entries as separate lines", async () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      await ensureLogExists(logPath);
      await appendToLog(logPath, { ts: "t1", from: "user", to: "agent", message: "first" });
      await appendToLog(logPath, { ts: "t2", from: "agent", to: "user", message: "second" });
      const lines = readFileSync(logPath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
    });

    it("supports optional type field", async () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      await ensureLogExists(logPath);
      await appendToLog(logPath, { ts: "t1", from: "system", to: "agent", message: "violation", type: "system" });
      const content = readFileSync(logPath, "utf-8");
      expect(JSON.parse(content.trim()).type).toBe("system");
    });
  });

  describe("readLog", () => {
    it("returns empty string for non-existent file", async () => {
      expect(await readLog("/tmp/does-not-exist-xyz.jsonl")).toBe("");
    });

    it("returns full content", async () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      await ensureLogExists(logPath);
      await appendToLog(logPath, { ts: "t1", from: "user", to: "agent", message: "hello" });
      await appendToLog(logPath, { ts: "t2", from: "agent", to: "user", message: "world" });
      const content = await readLog(logPath);
      expect(content).toContain("hello");
      expect(content).toContain("world");
    });
  });
});
