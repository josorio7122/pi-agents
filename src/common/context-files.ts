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

function* walkUp(start: string): Generator<string> {
  let current = resolve(start);
  while (true) {
    yield current;
    const parent = resolve(current, "..");
    if (parent === current) return;
    current = parent;
  }
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
  for (const dir of walkUp(cwd)) {
    const contextFile = await loadContextFileFromDir(dir);
    if (contextFile && !seenPaths.has(contextFile.path)) {
      ancestorFiles.unshift(contextFile); // root → ... → parent → cwd order
      seenPaths.add(contextFile.path);
    }
  }

  contextFiles.push(...ancestorFiles);
  return contextFiles;
}
