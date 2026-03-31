import { readFileSync } from "node:fs";
import { getModel } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  createBashTool,
  createEditTool,
  createExtensionRuntime,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  type ModelRegistry,
  SessionManager,
  SettingsManager,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";
import { parseModelId } from "../common/model.js";
import { expandPath } from "../common/paths.js";
import type { AgentConfig } from "../discovery/validator.js";
import { checkDomain } from "../domain/checker.js";
import { enforceMaxLines } from "../domain/max-lines.js";
import { buildDomainWithKnowledge } from "../domain/scoped-tools.js";
import { assembleSystemPrompt } from "../prompt/assembly.js";
import { appendToLog, readLog } from "./conversation-log.js";
import type { AgentMetrics } from "./metrics.js";
import { createMetricsTracker } from "./metrics.js";

type RunAgentParams = Readonly<{
  agentConfig: AgentConfig;
  task: string;
  cwd: string;
  sessionDir: string;
  conversationLogPath: string;
  modelRegistry: ModelRegistry;
  signal?: AbortSignal;
  onUpdate?: (metrics: AgentMetrics) => void;
}>;

type RunAgentResult = Readonly<{
  output: string;
  metrics: AgentMetrics;
  error?: string;
}>;

function readFileSafe(filePath: string) {
  try {
    return readFileSync(expandPath(filePath), "utf-8");
  } catch {
    return "";
  }
}

function createToolForAgent(params: {
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
      const resolved = require("node:path").resolve(cwd, filePath);
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

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const { agentConfig, task, cwd, sessionDir, conversationLogPath, modelRegistry, onUpdate } = params;
  const fm = agentConfig.frontmatter;

  // Read all file content upfront (I/O at the edges)
  const conversationLogContent = readLog(conversationLogPath);
  const skillContents = fm.skills.map((s) => ({
    name: s.path.split("/").pop()?.replace(".md", "") ?? s.path,
    when: s.when,
    content: readFileSafe(s.path),
  }));
  const projectKnowledgeContent = readFileSafe(fm.knowledge.project.path);
  const generalKnowledgeContent = readFileSafe(fm.knowledge.general.path);

  // Assemble system prompt (pure)
  const systemPrompt = assembleSystemPrompt({
    agentConfig,
    sessionDir,
    conversationLogContent,
    skillContents,
    projectKnowledgeContent,
    generalKnowledgeContent,
  });

  // Resolve model
  const { provider, modelId } = parseModelId(fm.model);
  const model =
    modelRegistry.find(provider, modelId) ?? getModel(provider as "anthropic", modelId as "claude-sonnet-4-5");
  if (!model) {
    return { output: "", metrics: createMetricsTracker().snapshot(), error: `Model not found: ${fm.model}` };
  }

  // Build domain with implicit knowledge paths
  const fullDomain = buildDomainWithKnowledge({
    domain: fm.domain,
    knowledgeEntries: [
      { path: expandPath(fm.knowledge.project.path), updatable: fm.knowledge.project.updatable },
      { path: expandPath(fm.knowledge.general.path), updatable: fm.knowledge.general.updatable },
    ],
  });

  // Knowledge files with max-lines for post-write enforcement
  const knowledgeFiles = [
    { path: expandPath(fm.knowledge.project.path), maxLines: fm.knowledge.project["max-lines"] },
    { path: expandPath(fm.knowledge.general.path), maxLines: fm.knowledge.general["max-lines"] },
  ];

  // Create domain-scoped tools
  const tools = fm.tools
    .filter((t) => t !== "delegate") // No delegation in pi-agents scope
    .map((t) =>
      createToolForAgent({ name: t, cwd, domain: fullDomain, conversationLogPath, agentName: fm.name, knowledgeFiles }),
    )
    .filter(Boolean);

  // Write user task to conversation log BEFORE invocation
  appendToLog(conversationLogPath, {
    ts: new Date().toISOString(),
    from: "user",
    to: fm.name,
    message: task,
  });

  // Create agent session
  const { session } = await createAgentSession({
    cwd,
    model,
    tools: tools as never,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
    modelRegistry,
    resourceLoader: {
      getSystemPrompt: () => systemPrompt,
      getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
      getSkills: () => ({ skills: [], diagnostics: [] }),
      getPrompts: () => ({ prompts: [], diagnostics: [] }),
      getThemes: () => ({ themes: [], diagnostics: [] }),
      getAgentsFiles: () => ({ agentsFiles: [] }),
      getAppendSystemPrompt: () => [],
      extendResources: () => {},
      reload: async () => {},
    },
  });

  // Track metrics
  const tracker = createMetricsTracker();
  session.subscribe((event) => {
    tracker.handle(event as Record<string, unknown>);
    onUpdate?.(tracker.snapshot());
  });

  // Run the agent
  try {
    await session.prompt(task);
  } catch (err) {
    session.dispose();
    return { output: "", metrics: tracker.snapshot(), error: String(err) };
  }

  // Extract final output
  const messages = session.messages;
  let output = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") output += part.text;
      }
      break;
    }
  }

  session.dispose();

  // Write agent response to conversation log AFTER completion
  appendToLog(conversationLogPath, {
    ts: new Date().toISOString(),
    from: fm.name,
    to: "user",
    message: output,
  });

  return { output, metrics: tracker.snapshot() };
}
