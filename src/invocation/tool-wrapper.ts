import { resolve } from "node:path";
import {
  type AgentToolResult,
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@mariozechner/pi-coding-agent";
// Each create*Tool factory returns AgentTool<SpecificSchema> — the schema generic
// varies per tool. We forward params opaquely through the domain-check wrapper,
// so we erase the schema to match AgentTool<TSchema, any> structurally.
import type { TSchema } from "@sinclair/typebox";
import { checkDomain } from "../domain/checker.js";
import { createReadConversationTool } from "../domain/conversation-tool.js";
import {
  createEditKnowledgeTool,
  createReadKnowledgeTool,
  createWriteKnowledgeTool,
} from "../domain/knowledge-tools.js";
import type { buildDomainWithKnowledge } from "../domain/scoped-tools.js";
import { appendToLog } from "./conversation-log.js";

interface WrappableTool {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: TSchema;
  prepareArguments?: (args: unknown) => unknown;
  execute(
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown,
  ): Promise<AgentToolResult<unknown>>;
}

export function createToolForAgent(params: {
  readonly name: string;
  readonly cwd: string;
  readonly domain: ReturnType<typeof buildDomainWithKnowledge>;
  readonly conversationLogPath: string;
  readonly agentName: string;
  readonly knowledgeFiles: ReadonlyArray<{ path: string; maxLines: number }>;
}) {
  const { name, cwd, domain, conversationLogPath, agentName, knowledgeFiles } = params;
  function createTool(toolName: string, cwd: string): WrappableTool | undefined {
    switch (toolName) {
      case "read":
        return createReadTool(cwd);
      case "write":
        return createWriteTool(cwd);
      case "edit":
        return createEditTool(cwd);
      case "grep":
        return createGrepTool(cwd);
      case "find":
        return createFindTool(cwd);
      case "ls":
        return createLsTool(cwd);
      case "bash":
        return createBashTool(cwd);
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

  const baseTool = createTool(name, cwd);
  if (!baseTool) return undefined;

  // bash is not domain-checked
  if (name === "bash") return baseTool;

  // Knowledge and conversation tools handle their own validation
  if (["read-knowledge", "write-knowledge", "edit-knowledge", "read-conversation"].includes(name)) return baseTool;

  // Wrap file tools with domain check
  const originalExecute = baseTool.execute;
  return {
    ...baseTool,
    // biome-ignore lint/complexity/useMaxParams: implements Pi's AgentTool.execute (4 positional params)
    async execute(toolCallId: string, toolParams: unknown, signal?: AbortSignal, onUpdate?: unknown) {
      const p = typeof toolParams === "object" && toolParams !== null ? (toolParams as Record<string, unknown>) : {};
      const rawPath = p.path ?? p.file_path ?? "";
      const filePath = typeof rawPath === "string" ? rawPath : "";

      if (filePath) {
        const op = name === "read" || name === "grep" || name === "find" || name === "ls" ? "read" : "write";
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
      if (name === "write" || name === "edit") {
        const resolved = resolve(cwd, filePath);
        const isKnowledgePath = knowledgeFiles.some((kf) => resolved === kf.path || resolved.startsWith(`${kf.path}/`));
        if (isKnowledgePath) {
          const knowledgeTool = name === "write" ? "write-knowledge" : "edit-knowledge";
          throw new Error(`Use ${knowledgeTool} to update knowledge files, not ${name}.`);
        }
      }

      return originalExecute(toolCallId, toolParams, signal, onUpdate);
    },
  };
}
