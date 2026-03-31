import type { AgentConfig } from "../discovery/validator.js";
import { resolveVariables } from "./variables.js";

export type AssemblyContext = Readonly<{
  agentConfig: AgentConfig;
  sessionDir: string;
  conversationLogContent: string;
  skillContents: ReadonlyArray<Readonly<{ name: string; when: string; content: string }>>;
  projectKnowledgeContent: string;
  generalKnowledgeContent: string;
}>;

function serializeYaml(data: unknown) {
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
  } = ctx;
  const fm = agentConfig.frontmatter;

  // Build variable map
  const variables: Record<string, string> = {
    SESSION_DIR: sessionDir,
    CONVERSATION_LOG: conversationLogContent,
    DOMAIN_BLOCK: serializeYaml(fm.domain),
    KNOWLEDGE_BLOCK: serializeYaml(fm.knowledge),
    SKILLS_BLOCK: serializeYaml(fm.skills),
    TEAM_BLOCK: "",
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

  // Append knowledge
  prompt += "\n\n---\n\n## Project Knowledge\n\n";
  prompt += projectKnowledgeContent || "(empty)";
  prompt += "\n\n## General Knowledge\n\n";
  prompt += generalKnowledgeContent || "(empty)";

  return prompt;
}
