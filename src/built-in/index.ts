import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractFrontmatter } from "../discovery/extract-frontmatter.js";
import type { AgentConfig } from "../discovery/validator.js";
import { validateAgent } from "../discovery/validator.js";

export function loadBuiltInAgents(): ReadonlyArray<AgentConfig> {
  const dir = dirname(fileURLToPath(import.meta.url));
  // Convention: every .md file in this directory is a built-in agent — keep this dir reserved for agents only.
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const agents: AgentConfig[] = [];
  for (const f of files) {
    const filePath = join(dir, f);
    const content = readFileSync(filePath, "utf-8");
    const extracted = extractFrontmatter(content);
    if (!extracted.ok) {
      throw new Error(`Built-in agent ${f} has invalid frontmatter: ${extracted.error}`);
    }

    const validated = validateAgent({
      frontmatter: extracted.value.frontmatter,
      body: extracted.value.body,
      filePath,
      source: "built-in" as const,
    });
    if (!validated.ok) {
      throw new Error(`Built-in agent ${f} failed validation: ${validated.errors.map((e) => e.message).join("; ")}`);
    }
    agents.push(validated.value);
  }
  return agents;
}
