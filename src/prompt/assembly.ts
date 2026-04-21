import type { AgentConfig } from "../discovery/validator.js";
import type { AgentFrontmatter } from "../schema/frontmatter.js";
import { resolveVariables } from "./variables.js";

export type AssemblyContext = Readonly<{
  agentConfig: AgentConfig;
  sessionDir: string;
  skillContents: ReadonlyArray<Readonly<{ name: string; when: string; content: string }>>;
  extraVariables?: Readonly<Record<string, string>>;
  sharedContextContents?: ReadonlyArray<Readonly<{ path: string; content: string }>>;
}>;

function serializeBlock(data: unknown) {
  return JSON.stringify(data, null, 2);
}

function renderSkillsSection(skillContents: AssemblyContext["skillContents"]): string {
  if (skillContents.length === 0) return "";
  const entries = skillContents.map((s) => `\n### ${s.name} (${s.when})\n\n${s.content}\n`).join("");
  return `\n\n---\n\n## Skills\n${entries}`;
}

function renderKnowledgeSection(knowledge: AgentFrontmatter["knowledge"]): string {
  return `\n\n---\n\n## Knowledge Files
- **Project:** \`${knowledge.project.path}\` — ${knowledge.project.description}
- **General:** \`${knowledge.general.path}\` — ${knowledge.general.description}

Use \`read-knowledge\` to load these files. Use \`write-knowledge\` or \`edit-knowledge\` to update them.`;
}

function renderSharedContextSection(files: AssemblyContext["sharedContextContents"]): string {
  if (!files || files.length === 0) return "";
  const entries = files.map((f) => `\n### ${f.path}\n\n${f.content}\n`).join("");
  return `\n\n---\n\n## Shared Context\n${entries}`;
}

function renderReportsSection(reports: AgentFrontmatter["reports"]): string {
  if (!reports) return "";
  return `\n\n## Reports\nDirectory: ${reports.path}\nWrite report artifacts here. The directory is created automatically on first write.`;
}

export function assembleSystemPrompt(ctx: AssemblyContext) {
  const { agentConfig, sessionDir, skillContents, extraVariables, sharedContextContents } = ctx;
  const fm = agentConfig.frontmatter;

  const variables: Record<string, string> = {
    SESSION_DIR: sessionDir,
    CONVERSATION_LOG: "Use `read-conversation` to load the conversation history.",
    DOMAIN_BLOCK: serializeBlock(fm.domain),
    KNOWLEDGE_BLOCK: serializeBlock(fm.knowledge),
    SKILLS_BLOCK: serializeBlock(fm.skills),
    ...extraVariables,
  };

  const body = resolveVariables(agentConfig.systemPrompt, variables);
  const skills = renderSkillsSection(skillContents);
  const knowledge = renderKnowledgeSection(fm.knowledge);
  const sharedContext = renderSharedContextSection(sharedContextContents);
  const reports = renderReportsSection(fm.reports);

  return `${body}${skills}${knowledge}${sharedContext}${reports}`;
}
