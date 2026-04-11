import { readFileSafe } from "./fs.js";

type SkillRef = Readonly<{ path: string; when: string }>;
type SkillContent = Readonly<{ name: string; when: string; content: string }>;

export async function loadSkillContents(skills: ReadonlyArray<SkillRef>): Promise<ReadonlyArray<SkillContent>> {
  const results = await Promise.all(skills.map((s) => readFileSafe(s.path)));
  return skills.map((s, i) => ({
    name: s.path.split("/").pop()?.replace(".md", "") ?? s.path,
    when: s.when,
    content: results[i] ?? "",
  }));
}
