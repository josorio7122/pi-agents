import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

const CONTEXT_FILE_CANDIDATES = ["AGENTS.md", "CLAUDE.md"] as const;

export type ContextFile = Readonly<{ path: string; content: string }>;

async function loadContextFileFromDir(dir: string) {
  for (const filename of CONTEXT_FILE_CANDIDATES) {
    const filePath = join(dir, filename);
    try {
      const content = await readFile(filePath, "utf-8");
      return { path: filePath, content };
    } catch {}
  }
  return undefined;
}

export async function discoverContextFiles(params: { readonly cwd: string; readonly agentDir?: string }) {
  const { cwd, agentDir = getAgentDir() } = params;
  const contextFiles: ContextFile[] = [];
  const seenPaths = new Set<string>();

  // 1. Global agent dir context (highest priority — comes first)
  const globalContext = await loadContextFileFromDir(agentDir);
  if (globalContext) {
    contextFiles.push(globalContext);
    seenPaths.add(globalContext.path);
  }

  // 2. Walk UP from cwd to root, collecting from each ancestor
  const ancestorFiles: ContextFile[] = [];
  let currentDir = resolve(cwd);
  const root = resolve("/");

  while (true) {
    const contextFile = await loadContextFileFromDir(currentDir);
    if (contextFile && !seenPaths.has(contextFile.path)) {
      ancestorFiles.unshift(contextFile); // root → ... → parent → cwd order
      seenPaths.add(contextFile.path);
    }

    if (currentDir === root) break;
    const parentDir = resolve(currentDir, "..");
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  contextFiles.push(...ancestorFiles);
  return contextFiles;
}
