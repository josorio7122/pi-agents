import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanForAgentFiles } from "./scanner.js";

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "pi-agents-test-"));
}

describe("scanForAgentFiles", () => {
  it("returns .md files from a directory", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "agent-a.md"), "---\nname: a\n---\n# A");
    writeFileSync(join(dir, "agent-b.md"), "---\nname: b\n---\n# B");
    writeFileSync(join(dir, "agent-c.md"), "---\nname: c\n---\n# C");

    const paths = scanForAgentFiles(dir);
    expect(paths).toHaveLength(3);
    expect(paths.every((p) => p.endsWith(".md"))).toBe(true);
  });

  it("ignores non-.md files", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "agent.md"), "---\nname: a\n---\n# A");
    writeFileSync(join(dir, "readme.txt"), "not an agent");
    writeFileSync(join(dir, "config.yaml"), "key: value");

    const paths = scanForAgentFiles(dir);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain("agent.md");
  });

  it("returns empty array for empty directory", () => {
    const dir = makeTempDir();
    expect(scanForAgentFiles(dir)).toEqual([]);
  });

  it("returns empty array for non-existent directory", () => {
    expect(scanForAgentFiles("/tmp/does-not-exist-pi-agents-xyz")).toEqual([]);
  });

  it("does not recurse into subdirectories", () => {
    const dir = makeTempDir();
    const sub = join(dir, "sub");
    mkdirSync(sub);
    writeFileSync(join(dir, "top.md"), "---\nname: top\n---\n# Top");
    writeFileSync(join(sub, "nested.md"), "---\nname: nested\n---\n# Nested");

    const paths = scanForAgentFiles(dir);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain("top.md");
  });
});
