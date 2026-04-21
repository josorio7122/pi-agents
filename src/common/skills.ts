import { basename } from "node:path";
import { readFileSafe } from "./fs.js";

type SkillRef = Readonly<{ path: string; when: string }>;
type SkillContent = Readonly<{ name: string; when: string; content: string }>;

export async function loadSkillContents(skills: ReadonlyArray<SkillRef>): Promise<ReadonlyArray<SkillContent>> {
  const results = await Promise.all(skills.map((s) => readFileSafe(s.path)));
  return skills.map((s, i) => ({
    name: basename(s.path, ".md"),
    when: s.when,
    content: results[i] ?? "",
  }));
}
