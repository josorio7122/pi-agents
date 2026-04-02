import type { AgentConfig } from "../discovery/validator.js";

export function buildPromptGuidelines(agents: ReadonlyArray<AgentConfig>) {
  return [
    "Use this tool ONLY when a task benefits from a specialized agent. For simple questions, answer directly.",
    "Write clear, specific tasks. Bad: 'check the code'. Good: 'list all exported functions in src/schema/'.",
    "",
    "Available agents:",
    ...agents.map((a) => `  ${a.frontmatter.icon} ${a.frontmatter.name} — ${a.frontmatter.description}`),
    "",
    "Modes:",
    "  Single: { agent: 'scout', task: 'find all files that export Zod schemas' }",
    "  Parallel: { tasks: [{agent: 'scout', task: 'find API routes'}, {agent: 'scout', task: 'find test files'}] }",
    "  Chain: { chain: [{agent: 'scout', task: 'find auth code'}, {agent: 'scout', task: 'analyze {previous}'}] }",
  ];
}
