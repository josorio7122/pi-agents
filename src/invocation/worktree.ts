import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type Worktree = Readonly<{ path: string; branch: string; repoDir: string }>;

function ensureWorktreesGitignore(repoDir: string): void {
  const dir = join(repoDir, "worktrees");
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, ".gitignore");
  if (!existsSync(gi)) writeFileSync(gi, "*\n");
}

export async function createWorktree(params: { repoDir: string; id: string }): Promise<Worktree> {
  ensureWorktreesGitignore(params.repoDir);
  const path = join(params.repoDir, "worktrees", params.id);
  const branch = `pi-agents/${params.id}`;
  await exec("git", ["worktree", "add", "-b", branch, path], { cwd: params.repoDir });
  return { path, branch, repoDir: params.repoDir };
}

export async function removeWorktreeIfClean(wt: Worktree): Promise<boolean> {
  const { stdout } = await exec("git", ["status", "--porcelain"], { cwd: wt.path });
  if (stdout.trim().length > 0) return false;
  await exec("git", ["worktree", "remove", "--force", wt.path], { cwd: wt.repoDir });
  // Branch may not exist yet (no commits made) or already deleted — silent ignore is fine.
  await exec("git", ["branch", "-D", wt.branch], { cwd: wt.repoDir }).catch(() => {});
  return true;
}
