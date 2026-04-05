import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverContextFiles } from "./context-files.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pi-agents-context-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("discoverContextFiles", () => {
  it("finds AGENTS.md in cwd", async () => {
    writeFileSync(join(tmpDir, "AGENTS.md"), "# Project Rules");
    const files = await discoverContextFiles({ cwd: tmpDir, agentDir: join(tmpDir, "no-global") });
    expect(files).toHaveLength(1);
    expect(files[0]?.content).toBe("# Project Rules");
    expect(files[0]?.path).toContain("AGENTS.md");
  });

  it("finds CLAUDE.md when no AGENTS.md", async () => {
    writeFileSync(join(tmpDir, "CLAUDE.md"), "# Claude Rules");
    const files = await discoverContextFiles({ cwd: tmpDir, agentDir: join(tmpDir, "no-global") });
    expect(files).toHaveLength(1);
    expect(files[0]?.content).toBe("# Claude Rules");
  });

  it("AGENTS.md takes priority over CLAUDE.md in same dir", async () => {
    writeFileSync(join(tmpDir, "AGENTS.md"), "agents wins");
    writeFileSync(join(tmpDir, "CLAUDE.md"), "claude loses");
    const files = await discoverContextFiles({ cwd: tmpDir, agentDir: join(tmpDir, "no-global") });
    expect(files).toHaveLength(1);
    expect(files[0]?.content).toBe("agents wins");
  });

  it("finds global agentDir context first", async () => {
    const globalDir = join(tmpDir, "global");
    const projectDir = join(tmpDir, "project");
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(globalDir, "AGENTS.md"), "global rules");
    writeFileSync(join(projectDir, "AGENTS.md"), "project rules");

    const files = await discoverContextFiles({ cwd: projectDir, agentDir: globalDir });
    expect(files).toHaveLength(2);
    expect(files[0]?.content).toBe("global rules");
    expect(files[1]?.content).toBe("project rules");
  });

  it("walks up ancestors", async () => {
    const parent = join(tmpDir, "parent");
    const child = join(parent, "child");
    mkdirSync(child, { recursive: true });
    writeFileSync(join(parent, "AGENTS.md"), "parent rules");

    const files = await discoverContextFiles({ cwd: child, agentDir: join(tmpDir, "no-global") });
    expect(files.some((f) => f.content === "parent rules")).toBe(true);
  });

  it("returns empty array when no files found", async () => {
    const emptyDir = join(tmpDir, "empty");
    mkdirSync(emptyDir, { recursive: true });
    const files = await discoverContextFiles({ cwd: emptyDir, agentDir: join(tmpDir, "no-global") });
    expect(files).toEqual([]);
  });

  it("deduplicates same path", async () => {
    // agentDir === cwd — same AGENTS.md should not appear twice
    writeFileSync(join(tmpDir, "AGENTS.md"), "shared rules");
    const files = await discoverContextFiles({ cwd: tmpDir, agentDir: tmpDir });
    expect(files).toHaveLength(1);
  });
});
