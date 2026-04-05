import type { AgentConfig } from "../discovery/validator.js";
import { resolveVariables } from "./variables.js";

export type AssemblyContext = Readonly<{
  agentConfig: AgentConfig;
  sessionDir: string;
  conversationLogContent: string;
  skillContents: ReadonlyArray<Readonly<{ name: string; when: string; content: string }>>;
  extraVariables?: Readonly<Record<string, string>>;
  sharedContextContents?: ReadonlyArray<Readonly<{ path: string; content: string }>>;
}>;

function serializeBlock(data: unknown) {
  return JSON.stringify(data, null, 2);
}

export function assembleSystemPrompt(ctx: AssemblyContext) {
  const { agentConfig, sessionDir, conversationLogContent, skillContents, extraVariables, sharedContextContents } = ctx;
  const fm = agentConfig.frontmatter;

  // Build variable map
  const variables: Record<string, string> = {
    SESSION_DIR: sessionDir,
    CONVERSATION_LOG: conversationLogContent
      ? `The following is the conversation history between all participants (JSONL format, one message per line):\n\n${conversationLogContent}`
      : "(no conversation history yet)",
    DOMAIN_BLOCK: serializeBlock(fm.domain),
    KNOWLEDGE_BLOCK: serializeBlock(fm.knowledge),
    SKILLS_BLOCK: serializeBlock(fm.skills),
    ...extraVariables,
  };

  // Resolve variables in system prompt body
  let prompt = resolveVariables(agentConfig.systemPrompt, variables);

  // Append skills
  if (skillContents.length > 0) {
    prompt += "\n\n---\n\n## Skills\n";
    for (const skill of skillContents) {
      prompt += `\n### ${skill.name} (${skill.when})\n\n${skill.content}\n`;
    }
  }

  // Append knowledge file paths (content loaded by agent via read-knowledge tool)
  prompt += "\n\n---\n\n## Knowledge Files\n";
  prompt += `- **Project:** \`${fm.knowledge.project.path}\` — ${fm.knowledge.project.description}\n`;
  prompt += `- **General:** \`${fm.knowledge.general.path}\` — ${fm.knowledge.general.description}\n`;
  prompt += "\nUse `read-knowledge` to load these files. Use `write-knowledge` or `edit-knowledge` to update them.";

  // Append shared context files (AGENTS.md, CLAUDE.md, etc.)
  if (sharedContextContents && sharedContextContents.length > 0) {
    prompt += "\n\n---\n\n## Shared Context\n";
    for (const file of sharedContextContents) {
      prompt += `\n### ${file.path}\n\n${file.content}\n`;
    }
  }

  // Append reports section if agent produces reports
  if (fm.reports) {
    prompt += "\n\n## Reports\n";
    prompt += `Directory: ${fm.reports.path}\n`;
    prompt += "Write report artifacts here. The directory is created automatically on first write.";
  }

  return prompt;
}
