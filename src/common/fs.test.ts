import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSafe } from "./fs.js";

describe("readFileSafe", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "fs-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns file content when file exists", async () => {
    const filePath = join(tmpDir, "hello.txt");
    await writeFile(filePath, "hello world");
    expect(await readFileSafe(filePath)).toBe("hello world");
  });

  it("returns empty string when file does not exist", async () => {
    expect(await readFileSafe(join(tmpDir, "missing.txt"))).toBe("");
  });
});
