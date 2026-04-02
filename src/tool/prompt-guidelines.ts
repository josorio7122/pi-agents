import type { AgentConfig } from "../discovery/validator.js";

const TEMPLATE = `Each agent runs in an isolated session. It ONLY sees the task string you write — not this conversation.

Delegate tasks requiring specialized expertise or multi-file work. Answer simple questions directly.

Tasks must be self-contained. Include: what to do, where (file paths), what to return.

Available agents:
{{AGENTS}}

Modes:
  Single: { agent: '{{FIRST_AGENT}}', task: 'describe what to do' }
  Parallel: { tasks: [{agent, task}, ...] } — independent tasks, run concurrently
  Chain: { chain: [{agent, task}, ...] } — sequential, use {previous} for prior output`;

function describeAgent(a: AgentConfig) {
  const fm = a.frontmatter;
  const access = fm.domain.some((d) => d.write) ? "read/write" : "read-only";
  return `  ${fm.icon} ${fm.name} (${access}) — ${fm.description}`;
}

export function buildPromptGuidelines(agents: ReadonlyArray<AgentConfig>) {
  const agentLines = agents.map(describeAgent).join("\n");
  const firstName = agents[0]?.frontmatter.name ?? "agent";
  return TEMPLATE.replace("{{AGENTS}}", agentLines).replace("{{FIRST_AGENT}}", firstName).split("\n");
}
