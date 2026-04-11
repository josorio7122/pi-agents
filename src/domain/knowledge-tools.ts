import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createEditTool, createReadTool, createWriteTool } from "@mariozechner/pi-coding-agent";
import { extractFilePath } from "../common/params.js";
import type { ExecutableTool } from "../common/tool-types.js";
import { enforceMaxLines } from "./max-lines.js";

type KnowledgeFile = Readonly<{ path: string; maxLines: number }>;

interface KnowledgeToolParams {
  readonly cwd: string;
  readonly knowledgeFiles: ReadonlyArray<KnowledgeFile>;
}

function findKnowledgeMatch(params: {
  readonly resolved: string;
  readonly knowledgeFiles: ReadonlyArray<KnowledgeFile>;
  readonly cwd: string;
}) {
  const { resolved, knowledgeFiles, cwd } = params;
  return knowledgeFiles.find((kf) => {
    const kfResolved = resolve(cwd, kf.path);
    return resolved === kfResolved || resolved.startsWith(`${kfResolved}/`);
  });
}

function wrapWithKnowledgeGuard(params: {
  readonly baseTool: ExecutableTool;
  readonly toolName: string;
  readonly description: string;
  readonly cwd: string;
  readonly knowledgeFiles: ReadonlyArray<KnowledgeFile>;
}): ExecutableTool {
  const { baseTool, toolName, description, cwd, knowledgeFiles } = params;
  const originalExecute = baseTool.execute;

  return {
    ...baseTool,
    name: toolName,
    label: toolName,
    description,
    // biome-ignore lint/complexity/useMaxParams: implements Pi's AgentTool.execute (4 positional params)
    async execute(toolCallId: string, toolParams: unknown, signal?: AbortSignal, onUpdate?: unknown) {
      const filePath = extractFilePath(toolParams);
      const resolved = resolve(cwd, filePath);
      const match = findKnowledgeMatch({ resolved, knowledgeFiles, cwd });

      if (!match) {
        throw new Error(
          `${toolName} can only ${toolName.includes("write") ? "write to" : "edit"} knowledge files. Path "${filePath}" is not a knowledge file.`,
        );
      }

      // Base tool already uses withFileMutationQueue — no double-wrap
      const result = await originalExecute(toolCallId, toolParams, signal, onUpdate);
      await enforceMaxLines({ filePath: resolved, maxLines: match.maxLines });
      return result;
    },
  };
}

export function createWriteKnowledgeTool(params: KnowledgeToolParams): ExecutableTool {
  const baseTool = createWriteTool(params.cwd);
  return wrapWithKnowledgeGuard({
    baseTool,
    toolName: "write-knowledge",
    description: "Write content to a knowledge file. Use for persisting what you have learned.",
    cwd: params.cwd,
    knowledgeFiles: params.knowledgeFiles,
  });
}

export function createReadKnowledgeTool(params: KnowledgeToolParams): ExecutableTool {
  const baseTool = createReadTool(params.cwd);
  return {
    ...baseTool,
    name: "read-knowledge",
    label: "read-knowledge",
    description: "Read a knowledge file. Use to load your project or general knowledge.",
    // biome-ignore lint/complexity/useMaxParams: implements Pi's AgentTool.execute (4 positional params)
    async execute(_toolCallId: string, toolParams: unknown, _signal?: AbortSignal, _onUpdate?: unknown) {
      const filePath = extractFilePath(toolParams);
      const resolved = resolve(params.cwd, filePath);
      const match = findKnowledgeMatch({ resolved, knowledgeFiles: params.knowledgeFiles, cwd: params.cwd });

      if (!match) {
        throw new Error(`read-knowledge can only read knowledge files. Path "${filePath}" is not a knowledge file.`);
      }

      try {
        const content = await readFile(resolved, "utf-8");
        return { content: [{ type: "text" as const, text: content }], details: undefined };
      } catch {
        return { content: [{ type: "text" as const, text: "(empty — file does not exist yet)" }], details: undefined };
      }
    },
  };
}

export function createEditKnowledgeTool(params: KnowledgeToolParams): ExecutableTool {
  const baseTool = createEditTool(params.cwd);
  return wrapWithKnowledgeGuard({
    baseTool,
    toolName: "edit-knowledge",
    description: "Edit a knowledge file. Use for updating specific entries in what you have learned.",
    cwd: params.cwd,
    knowledgeFiles: params.knowledgeFiles,
  });
}
