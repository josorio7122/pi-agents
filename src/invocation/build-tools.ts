import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@mariozechner/pi-coding-agent";
import type { ExecutableTool } from "../common/tool-types.js";
import { PI_DEFAULT_TOOLS } from "../schema/frontmatter.js";

function buildBuiltin(name: string, cwd: string): ExecutableTool | undefined {
  if (name === "read") return createReadToolDefinition(cwd);
  if (name === "bash") return createBashToolDefinition(cwd);
  if (name === "edit") return createEditToolDefinition(cwd);
  if (name === "write") return createWriteToolDefinition(cwd);
  if (name === "grep") return createGrepToolDefinition(cwd);
  if (name === "find") return createFindToolDefinition(cwd);
  if (name === "ls") return createLsToolDefinition(cwd);
  return undefined;
}

export function buildAgentTools(params: {
  readonly tools: readonly string[] | undefined;
  readonly cwd: string;
}): Readonly<{
  builtinTools: ReadonlyArray<ExecutableTool>;
  customTools: ReadonlyArray<ExecutableTool>;
}> {
  const effective = params.tools ?? PI_DEFAULT_TOOLS;
  const builtinTools = effective
    .map((name) => buildBuiltin(name, params.cwd))
    .filter((tool): tool is ExecutableTool => tool !== undefined);
  return { builtinTools, customTools: [] };
}
