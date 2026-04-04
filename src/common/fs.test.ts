import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFileSafe } from "./fs.js";

describe("readFileSafe", () => {
  it("reads existing file content", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-agents-fs-"));
    const filePath = join(dir, "test.txt");
    writeFileSync(filePath, "hello world");
    expect(await readFileSafe(filePath)).toBe("hello world");
  });

  it("returns empty string for non-existent file", async () => {
    expect(await readFileSafe("/tmp/does-not-exist-xyz.txt")).toBe("");
  });

  it("returns empty string for directory path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-agents-fs-"));
    expect(await readFileSafe(dir)).toBe("");
  });
});
