import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorktree, removeWorktreeIfClean } from "./worktree.js";

describe("worktree", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "pi-worktree-"));
    execSync("git init -q -b main", { cwd: repoDir });
    execSync('git config user.email "t@e"', { cwd: repoDir });
    execSync('git config user.name "t"', { cwd: repoDir });
    writeFileSync(join(repoDir, "seed.txt"), "x");
    execSync("git add . && git commit -q -m init", { cwd: repoDir });
  });

  it("creates worktree under ./worktrees/<id> and bootstraps .gitignore", async () => {
    const wt = await createWorktree({ repoDir, id: "abc-123" });
    expect(existsSync(wt.path)).toBe(true);
    expect(wt.path).toContain("worktrees");
    const gi = readFileSync(join(repoDir, "worktrees", ".gitignore"), "utf-8");
    expect(gi.trim()).toBe("*");
  });

  it("removes worktree when clean", async () => {
    const wt = await createWorktree({ repoDir, id: "clean-1" });
    const removed = await removeWorktreeIfClean(wt);
    expect(removed).toBe(true);
    expect(existsSync(wt.path)).toBe(false);
  });

  it("preserves worktree when dirty", async () => {
    const wt = await createWorktree({ repoDir, id: "dirty-1" });
    writeFileSync(join(wt.path, "new.txt"), "modified");
    const removed = await removeWorktreeIfClean(wt);
    expect(removed).toBe(false);
    expect(existsSync(wt.path)).toBe(true);
  });
});
