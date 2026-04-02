import { resolve } from "node:path";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { checkDomain } from "../domain/checker.js";
import { enforceMaxLines } from "../domain/max-lines.js";
import type { buildDomainWithKnowledge } from "../domain/scoped-tools.js";
import { appendToLog } from "./conversation-log.js";

export function createToolForAgent(params: {
  readonly name: string;
  readonly cwd: string;
  readonly domain: ReturnType<typeof buildDomainWithKnowledge>;
  readonly conversationLogPath: string;
  readonly agentName: string;
  readonly knowledgeFiles: ReadonlyArray<{ path: string; maxLines: number }>;
}) {
  const { name, cwd, domain, conversationLogPath, agentName, knowledgeFiles } = params;
  const factories: Record<string, (c: string) => unknown> = {
    read: createReadTool,
    write: createWriteTool,
    edit: createEditTool,
    grep: createGrepTool,
    find: createFindTool,
    ls: createLsTool,
    bash: createBashTool,
  };

  const factory = factories[name];
  if (!factory) return undefined;

  const baseTool = factory(cwd) as {
    name: string;
    execute: (...args: unknown[]) => Promise<unknown>;
    [key: string]: unknown;
  };

  // bash is not domain-checked
  if (name === "bash") return baseTool;

  // Wrap file tools with domain check
  const originalExecute = baseTool.execute;
  return {
    ...baseTool,
    async execute(toolCallId: unknown, toolParams: unknown, ...rest: unknown[]) {
      const p = toolParams as Record<string, unknown> | undefined;
      const filePath = (p?.path ?? p?.file_path ?? "") as string;

      if (filePath) {
        const op = name === "read" || name === "grep" || name === "find" || name === "ls" ? "read" : "write";
        const result = checkDomain({ filePath, operation: op, domain, cwd });

        if (!result.allowed) {
          appendToLog(conversationLogPath, {
            ts: new Date().toISOString(),
            from: "system",
            to: agentName,
            message: `Domain violation: ${result.reason}`,
            type: "system",
          });
          throw new Error(`Domain violation: ${result.reason}`);
        }
      }

      // For write/edit to knowledge files: use mutation queue + enforce max-lines
      const resolved = resolve(cwd, filePath);
      const knowledgeMatch = knowledgeFiles.find((kf) => resolved === kf.path || resolved.startsWith(kf.path));

      if (knowledgeMatch && (name === "write" || name === "edit")) {
        return withFileMutationQueue(resolved, async () => {
          const result = await originalExecute.call(baseTool, toolCallId, toolParams, ...rest);
          const truncated = enforceMaxLines({ filePath: resolved, maxLines: knowledgeMatch.maxLines });
          if (truncated) {
            appendToLog(conversationLogPath, {
              ts: new Date().toISOString(),
              from: "system",
              to: agentName,
              message: `Knowledge file truncated to ${knowledgeMatch.maxLines} lines: ${filePath}`,
              type: "system",
            });
          }
          return result;
        });
      }

      return originalExecute.call(baseTool, toolCallId, toolParams, ...rest);
    },
  };
}
