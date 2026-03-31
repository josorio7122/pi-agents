import type { AgentConfig } from "../discovery/validator.js";

export function formatAgentList(agents: ReadonlyArray<AgentConfig>) {
  if (agents.length === 0) return ["No agents found. Place .md files in .pi/agents/"];

  return agents.map((a) => {
    const fm = a.frontmatter;
    return `${fm.icon}  ${fm.name.padEnd(20)} ${fm.description}`;
  });
}
