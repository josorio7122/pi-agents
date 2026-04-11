import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSkillContents } from "./skills.js";

describe("loadSkillContents", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pi-skills-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("loads skill files and extracts name from path", async () => {
    const skillPath = join(tmpDir, "my-skill.md");
    await writeFile(skillPath, "# Skill\n\nDo stuff.");

    const result = await loadSkillContents([{ path: skillPath, when: "Always." }]);

    expect(result).toEqual([{ name: "my-skill", when: "Always.", content: "# Skill\n\nDo stuff." }]);
  });

  it("returns empty content for missing files", async () => {
    const result = await loadSkillContents([{ path: join(tmpDir, "missing.md"), when: "Never." }]);

    expect(result).toEqual([{ name: "missing", when: "Never.", content: "" }]);
  });

  it("handles empty skills array", async () => {
    const result = await loadSkillContents([]);
    expect(result).toEqual([]);
  });

  it("extracts name from nested path", async () => {
    const skillPath = join(tmpDir, "deep", "nested", "cool-skill.md");
    const result = await loadSkillContents([{ path: skillPath, when: "Sometimes." }]);

    expect(result[0]?.name).toBe("cool-skill");
  });
});
