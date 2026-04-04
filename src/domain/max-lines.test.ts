import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enforceMaxLines } from "./max-lines.js";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "pi-agents-maxlines-"));
}

describe("enforceMaxLines", () => {
  it("does nothing when under limit", async () => {
    const dir = makeTempDir();
    const filePath = join(dir, "test.yaml");
    writeFileSync(filePath, "line1\nline2\nline3\n");
    const truncated = await enforceMaxLines({ filePath, maxLines: 100 });
    expect(truncated).toBe(false);
    expect(readFileSync(filePath, "utf-8")).toBe("line1\nline2\nline3\n");
  });

  it("truncates from the top when over limit", async () => {
    const dir = makeTempDir();
    const filePath = join(dir, "test.yaml");
    writeFileSync(filePath, "old1\nold2\nold3\nnew1\nnew2\n");
    const truncated = await enforceMaxLines({ filePath, maxLines: 3 });
    expect(truncated).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toBe("old3\nnew1\nnew2\n");
    expect(content).not.toContain("old1");
    expect(content).not.toContain("old2");
  });

  it("handles file at exact limit", async () => {
    const dir = makeTempDir();
    const filePath = join(dir, "test.yaml");
    writeFileSync(filePath, "a\nb\nc\n");
    const truncated = await enforceMaxLines({ filePath, maxLines: 3 });
    expect(truncated).toBe(false);
  });

  it("handles non-existent file", async () => {
    const truncated = await enforceMaxLines({ filePath: "/tmp/does-not-exist-xyz.yaml", maxLines: 100 });
    expect(truncated).toBe(false);
  });
});
