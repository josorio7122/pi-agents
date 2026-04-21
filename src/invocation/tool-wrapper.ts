import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { extractFilePath } from "../common/params.js";
import type { ExecutableTool } from "../common/tool-types.js";
import { checkDomain } from "../domain/checker.js";
import { createReadConversationTool } from "../domain/conversation-tool.js";
import {
  createEditKnowledgeTool,
  createReadKnowledgeTool,
  createWriteKnowledgeTool,
  isKnowledgePath,
} from "../domain/knowledge-tools.js";
import type { buildDomainWithKnowledge } from "../domain/scoped-tools.js";
import { appendToLog } from "./conversation-log.js";

type KnowledgeFile = Readonly<{ path: string; maxLines: number }>;

const OPERATION_BY_TOOL: Readonly<Record<string, "read" | "write">> = {
  read: "read",
  grep: "read",
  find: "read",
  ls: "read",
  write: "write",
  edit: "write",
};

const SELF_VALIDATING_TOOLS: ReadonlyArray<string> = [
  "read-knowledge",
  "write-knowledge",
  "edit-knowledge",
  "read-conversation",
];

export function dispatchBuiltinTool(params: {
  readonly name: string;
  readonly cwd: string;
  readonly conversationLogPath: string;
  readonly knowledgeFiles: ReadonlyArray<KnowledgeFile>;
}): ExecutableTool | undefined {
  const { name, cwd, conversationLogPath, knowledgeFiles } = params;
  switch (name) {
    case "read":
      return createReadToolDefinition(cwd);
    case "write":
      return createWriteToolDefinition(cwd);
    case "edit":
      return createEditToolDefinition(cwd);
    case "grep":
      return createGrepToolDefinition(cwd);
    case "find":
      return createFindToolDefinition(cwd);
    case "ls":
      return createLsToolDefinition(cwd);
    case "bash":
      return createBashToolDefinition(cwd);
    case "read-knowledge":
      return createReadKnowledgeTool({ cwd, knowledgeFiles });
    case "write-knowledge":
      return createWriteKnowledgeTool({ cwd, knowledgeFiles });
    case "edit-knowledge":
      return createEditKnowledgeTool({ cwd, knowledgeFiles });
    case "read-conversation":
      return createReadConversationTool({ conversationLogPath });
    default:
      return undefined;
  }
}

export function wrapWithDomainCheck(params: {
  readonly baseTool: ExecutableTool;
  readonly name: string;
  readonly cwd: string;
  readonly domain: ReturnType<typeof buildDomainWithKnowledge>;
  readonly conversationLogPath: string;
  readonly agentName: string;
  readonly knowledgeFiles: ReadonlyArray<KnowledgeFile>;
}): ExecutableTool {
  const { baseTool, name, cwd, domain, conversationLogPath, agentName, knowledgeFiles } = params;

  // bash is not domain-checked
  if (name === "bash") return baseTool;

  // Knowledge and conversation tools handle their own validation
  if (SELF_VALIDATING_TOOLS.includes(name)) return baseTool;

  // Wrap file tools with domain check
  const originalExecute = baseTool.execute;
  return {
    ...baseTool,
    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.execute (5 positional params)
    async execute(toolCallId: string, toolParams: unknown, signal, onUpdate, ctx: ExtensionContext) {
      const filePath = extractFilePath(toolParams);

      if (filePath) {
        const op = OPERATION_BY_TOOL[name] ?? "write";
        const result = checkDomain({ filePath, operation: op, domain, cwd });

        if (!result.allowed) {
          await appendToLog(conversationLogPath, {
            ts: new Date().toISOString(),
            from: "system",
            to: agentName,
            message: `Domain violation: ${result.reason}`,
            type: "system",
          });
          throw new Error(`Domain violation: ${result.reason}`);
        }
      }

      // Block generic write/edit on knowledge files — must use knowledge tools
      if (filePath && (name === "write" || name === "edit")) {
        if (isKnowledgePath({ filePath, knowledgeFiles, cwd })) {
          const knowledgeTool = name === "write" ? "write-knowledge" : "edit-knowledge";
          throw new Error(`Use ${knowledgeTool} to update knowledge files, not ${name}.`);
        }
      }

      return originalExecute(toolCallId, toolParams, signal, onUpdate, ctx);
    },
  };
}

export function createToolForAgent(params: {
  readonly name: string;
  readonly cwd: string;
  readonly domain: ReturnType<typeof buildDomainWithKnowledge>;
  readonly conversationLogPath: string;
  readonly agentName: string;
  readonly knowledgeFiles: ReadonlyArray<KnowledgeFile>;
}): ExecutableTool | undefined {
  const { name, cwd, domain, conversationLogPath, agentName, knowledgeFiles } = params;
  const baseTool = dispatchBuiltinTool({ name, cwd, conversationLogPath, knowledgeFiles });
  if (!baseTool) return undefined;
  return wrapWithDomainCheck({ baseTool, name, cwd, domain, conversationLogPath, agentName, knowledgeFiles });
}
