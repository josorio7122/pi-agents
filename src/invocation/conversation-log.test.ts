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
    it("creates file with parent dirs if missing", () => {
      const dir = makeTempDir();
      const logPath = join(dir, "sessions", "abc", "conversation.jsonl");
      ensureLogExists(logPath);
      expect(readFileSync(logPath, "utf-8")).toBe("");
    });

    it("does not overwrite existing file", () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      ensureLogExists(logPath);
      appendToLog(logPath, { ts: "t1", from: "user", to: "agent", message: "hello" });
      ensureLogExists(logPath); // should not clear
      expect(readLog(logPath)).toContain("hello");
    });
  });

  describe("appendToLog", () => {
    it("appends JSONL entry", () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      ensureLogExists(logPath);
      appendToLog(logPath, { ts: "2026-03-30T14:00:00Z", from: "user", to: "agent", message: "task" });
      const content = readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());
      expect(parsed.from).toBe("user");
      expect(parsed.message).toBe("task");
    });

    it("appends multiple entries as separate lines", () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      ensureLogExists(logPath);
      appendToLog(logPath, { ts: "t1", from: "user", to: "agent", message: "first" });
      appendToLog(logPath, { ts: "t2", from: "agent", to: "user", message: "second" });
      const lines = readFileSync(logPath, "utf-8").trim().split("\n");
      expect(lines).toHaveLength(2);
    });

    it("supports optional type field", () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      ensureLogExists(logPath);
      appendToLog(logPath, { ts: "t1", from: "system", to: "agent", message: "violation", type: "system" });
      const content = readFileSync(logPath, "utf-8");
      expect(JSON.parse(content.trim()).type).toBe("system");
    });
  });

  describe("readLog", () => {
    it("returns empty string for non-existent file", () => {
      expect(readLog("/tmp/does-not-exist-xyz.jsonl")).toBe("");
    });

    it("returns full content", () => {
      const dir = makeTempDir();
      const logPath = join(dir, "conversation.jsonl");
      ensureLogExists(logPath);
      appendToLog(logPath, { ts: "t1", from: "user", to: "agent", message: "hello" });
      appendToLog(logPath, { ts: "t2", from: "agent", to: "user", message: "world" });
      const content = readLog(logPath);
      expect(content).toContain("hello");
      expect(content).toContain("world");
    });
  });
});
