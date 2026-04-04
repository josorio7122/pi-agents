import type { AgentConfig } from "../discovery/validator.js";
import { resolveVariables } from "./variables.js";

export type AssemblyContext = Readonly<{
  agentConfig: AgentConfig;
  sessionDir: string;
  conversationLogContent: string;
  skillContents: ReadonlyArray<Readonly<{ name: string; when: string; content: string }>>;
  projectKnowledgeContent: string;
  generalKnowledgeContent: string;
  extraVariables?: Readonly<Record<string, string>>;
}>;

function serializeBlock(data: unknown) {
  return JSON.stringify(data, null, 2);
}

export function assembleSystemPrompt(ctx: AssemblyContext) {
  const {
    agentConfig,
    sessionDir,
    conversationLogContent,
    skillContents,
    projectKnowledgeContent,
    generalKnowledgeContent,
    extraVariables,
  } = ctx;
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

  // Append knowledge with framing
  prompt += "\n\n---\n\n## Project Knowledge\n";
  prompt += `File: ${fm.knowledge.project.path}\n`;
  prompt += "What you have learned about THIS codebase. Use this to navigate efficiently.\n\n";
  prompt += projectKnowledgeContent || "(empty — you have not explored this codebase yet)";
  prompt += "\n\n## General Knowledge\n";
  prompt += `File: ${fm.knowledge.general.path}\n`;
  prompt += "Your accumulated strategies and heuristics from all projects.\n\n";
  prompt += generalKnowledgeContent || "(empty — you have not built general strategies yet)";

  // Append reports section if agent produces reports
  if (fm.reports) {
    prompt += "\n\n## Reports\n";
    prompt += `Directory: ${fm.reports.path}\n`;
    prompt += "Write report artifacts here. The directory is created automatically on first write.";
  }

  return prompt;
}
