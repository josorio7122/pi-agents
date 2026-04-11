import type { buildDomainWithKnowledge } from "../domain/scoped-tools.js";
import { createSubmitTool } from "../domain/submit-tool.js";
import { createToolForAgent } from "./tool-wrapper.js";

export function buildAgentTools(params: {
  readonly tools: readonly string[];
  readonly cwd: string;
  readonly domain: ReturnType<typeof buildDomainWithKnowledge>;
  readonly conversationLogPath: string;
  readonly agentName: string;
  readonly knowledgeFiles: ReadonlyArray<{ path: string; maxLines: number }>;
  readonly knowledgeEntries: ReadonlyArray<{ path: string; updatable: boolean }>;
}) {
  const { tools, cwd, domain, conversationLogPath, agentName, knowledgeFiles, knowledgeEntries } = params;

  // Create domain-scoped tools (built-in only — these go through SDK's tools option)
  const builtinTools = tools
    .map((t) => createToolForAgent({ name: t, cwd, domain, conversationLogPath, agentName, knowledgeFiles }))
    .filter((t): t is NonNullable<typeof t> => t != null);

  // Inject knowledge tools — read-knowledge always, write/edit only when updatable
  const hasUpdatableKnowledge = knowledgeEntries.some((e) => e.updatable);
  const knowledgeToolNames = hasUpdatableKnowledge
    ? ["read-knowledge", "write-knowledge", "edit-knowledge"]
    : ["read-knowledge"];
  const knowledgeToolDefs = knowledgeToolNames
    .map((t) => createToolForAgent({ name: t, cwd, domain, conversationLogPath, agentName, knowledgeFiles }))
    .filter((t): t is NonNullable<typeof t> => t != null);

  // Inject read-conversation tool
  const conversationTool = createToolForAgent({
    name: "read-conversation",
    cwd,
    domain,
    conversationLogPath,
    agentName,
    knowledgeFiles,
  });
  const conversationToolDefs = conversationTool ? [conversationTool] : [];

  // Inject submit tool — every agent must call this to deliver output
  const submitTool = createSubmitTool();

  return { builtinTools, customTools: [...knowledgeToolDefs, ...conversationToolDefs, submitTool] };
}
