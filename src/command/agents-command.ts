import type { AgentConfig } from "../discovery/validator.js";

export function formatAgentList(agents: ReadonlyArray<AgentConfig>): ReadonlyArray<string> {
  if (agents.length === 0) return ["No agents found. Place .md files in .pi/agents/"];
  return agents.map((a) => `${a.frontmatter.icon}  ${a.frontmatter.name.padEnd(20)} ${a.frontmatter.description}`);
}
