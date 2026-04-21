import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
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

function requireKnowledgeMatch(params: {
  readonly toolName: string;
  readonly verb: "write to" | "edit" | "read";
  readonly filePath: string;
  readonly resolved: string;
  readonly knowledgeFiles: ReadonlyArray<KnowledgeFile>;
  readonly cwd: string;
}): KnowledgeFile {
  const match = findKnowledgeMatch({
    resolved: params.resolved,
    knowledgeFiles: params.knowledgeFiles,
    cwd: params.cwd,
  });
  if (!match) {
    throw new Error(
      `${params.toolName} can only ${params.verb} knowledge files. Path "${params.filePath}" is not a knowledge file.`,
    );
  }
  return match;
}

export function isKnowledgePath(params: {
  readonly filePath: string;
  readonly knowledgeFiles: ReadonlyArray<KnowledgeFile>;
  readonly cwd: string;
}) {
  const resolved = resolve(params.cwd, params.filePath);
  return findKnowledgeMatch({ resolved, knowledgeFiles: params.knowledgeFiles, cwd: params.cwd }) !== undefined;
}

function wrapWithKnowledgeGuard(params: {
  readonly baseTool: ExecutableTool;
  readonly toolName: string;
  readonly verb: "write to" | "edit";
  readonly description: string;
  readonly cwd: string;
  readonly knowledgeFiles: ReadonlyArray<KnowledgeFile>;
}): ExecutableTool {
  const { baseTool, toolName, verb, description, cwd, knowledgeFiles } = params;
  const originalExecute = baseTool.execute;

  return {
    ...baseTool,
    name: toolName,
    label: toolName,
    description,
    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.execute (5 positional params)
    async execute(toolCallId: string, toolParams: unknown, signal, onUpdate, ctx: ExtensionContext) {
      const filePath = extractFilePath(toolParams);
      const resolved = resolve(cwd, filePath);
      const match = requireKnowledgeMatch({ toolName, verb, filePath, resolved, knowledgeFiles, cwd });

      // Base tool already uses withFileMutationQueue — no double-wrap
      const result = await originalExecute(toolCallId, toolParams, signal, onUpdate, ctx);
      await enforceMaxLines({ filePath: resolved, maxLines: match.maxLines });
      return result;
    },
  };
}

export function createWriteKnowledgeTool(params: KnowledgeToolParams): ExecutableTool {
  const baseTool = createWriteToolDefinition(params.cwd);
  return wrapWithKnowledgeGuard({
    baseTool,
    toolName: "write-knowledge",
    verb: "write to",
    description: "Write content to a knowledge file. Use for persisting what you have learned.",
    cwd: params.cwd,
    knowledgeFiles: params.knowledgeFiles,
  });
}

export function createReadKnowledgeTool(params: KnowledgeToolParams): ExecutableTool {
  const baseTool = createReadToolDefinition(params.cwd);
  return {
    ...baseTool,
    name: "read-knowledge",
    label: "read-knowledge",
    description: "Read a knowledge file. Use to load your project or general knowledge.",
    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.execute (5 positional params)
    async execute(_toolCallId: string, toolParams: unknown, _signal, _onUpdate, _ctx: ExtensionContext) {
      const filePath = extractFilePath(toolParams);
      const resolved = resolve(params.cwd, filePath);
      requireKnowledgeMatch({
        toolName: "read-knowledge",
        verb: "read",
        filePath,
        resolved,
        knowledgeFiles: params.knowledgeFiles,
        cwd: params.cwd,
      });

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
  const baseTool = createEditToolDefinition(params.cwd);
  return wrapWithKnowledgeGuard({
    baseTool,
    toolName: "edit-knowledge",
    verb: "edit",
    description: "Edit a knowledge file. Use for updating specific entries in what you have learned.",
    cwd: params.cwd,
    knowledgeFiles: params.knowledgeFiles,
  });
}
