import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expandPath } from "../common/paths.js";
import type { AgentConfig } from "./validator.js";

function ensureFileExists(filePath: string) {
  const resolved = expandPath(filePath);
  if (existsSync(resolved)) return;
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, "", "utf-8");
}

export function bootstrapKnowledge(agents: ReadonlyArray<AgentConfig>) {
  for (const agent of agents) {
    ensureFileExists(agent.frontmatter.knowledge.project.path);
    ensureFileExists(agent.frontmatter.knowledge.general.path);
  }
}
