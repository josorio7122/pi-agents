import type { AgentConfig } from "../discovery/validator.js";
import { resolveVariables } from "./variables.js";

export type AssemblyContext = Readonly<{
  agentConfig: AgentConfig;
  sessionDir: string;
  extraVariables?: Readonly<Record<string, string>>;
  sharedContextContents?: ReadonlyArray<Readonly<{ path: string; content: string }>>;
}>;

function section(title: string, body: string): string {
  if (!body) return "";
  return `\n\n---\n\n## ${title}\n${body}`;
}

function renderSharedContextSection(files: AssemblyContext["sharedContextContents"]): string {
  if (!files || files.length === 0) return "";
  const entries = files.map((f) => `\n### ${f.path}\n\n${f.content}\n`).join("");
  return section("Shared Context", entries);
}

export function assembleSystemPrompt(ctx: AssemblyContext): string {
  const { agentConfig, sessionDir, extraVariables, sharedContextContents } = ctx;

  const variables: Record<string, string> = {
    SESSION_DIR: sessionDir,
    ...extraVariables,
  };

  const body = resolveVariables(agentConfig.systemPrompt, variables);
  const sharedContext = renderSharedContextSection(sharedContextContents);

  return `${body}${sharedContext}`;
}
