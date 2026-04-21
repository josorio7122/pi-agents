import type { ExecutableTool } from "../common/tool-types.js";
import { createReadConversationTool } from "../domain/conversation-tool.js";
import {
  createEditKnowledgeTool,
  createReadKnowledgeTool,
  createWriteKnowledgeTool,
} from "../domain/knowledge-tools.js";
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
}): { readonly builtinTools: ReadonlyArray<ExecutableTool>; readonly customTools: ReadonlyArray<ExecutableTool> } {
  const { tools, cwd, domain, conversationLogPath, agentName, knowledgeFiles, knowledgeEntries } = params;

  // Create domain-scoped tools (built-in only — these go through SDK's tools option)
  const builtinTools = tools
    .map((t) => createToolForAgent({ name: t, cwd, domain, conversationLogPath, agentName, knowledgeFiles }))
    .filter((t): t is NonNullable<typeof t> => t != null);

  // Inject knowledge tools — read-knowledge always, write/edit only when updatable
  const hasUpdatableKnowledge = knowledgeEntries.some((e) => e.updatable);
  const knowledgeToolDefs: ReadonlyArray<ExecutableTool> = hasUpdatableKnowledge
    ? [
        createReadKnowledgeTool({ cwd, knowledgeFiles }),
        createWriteKnowledgeTool({ cwd, knowledgeFiles }),
        createEditKnowledgeTool({ cwd, knowledgeFiles }),
      ]
    : [createReadKnowledgeTool({ cwd, knowledgeFiles })];

  // Inject read-conversation tool — always defined
  const conversationToolDefs: ReadonlyArray<ExecutableTool> = [createReadConversationTool({ conversationLogPath })];

  // Inject submit tool — every agent must call this to deliver output
  const submitTool = createSubmitTool();

  return { builtinTools, customTools: [...knowledgeToolDefs, ...conversationToolDefs, submitTool] };
}
