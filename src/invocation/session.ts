import { readFileSync } from "node:fs";
import { getModel } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  createExtensionRuntime,
  type ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { parseModelId } from "../common/model.js";
import { expandPath } from "../common/paths.js";
import type { AgentConfig } from "../discovery/validator.js";
import { buildDomainWithKnowledge } from "../domain/scoped-tools.js";
import { assembleSystemPrompt } from "../prompt/assembly.js";
import { appendToLog, readLog } from "./conversation-log.js";
import type { AgentMetrics } from "./metrics.js";
import { createMetricsTracker } from "./metrics.js";
import { createToolForAgent } from "./tool-wrapper.js";

type RunAgentParams = Readonly<{
  agentConfig: AgentConfig;
  task: string;
  cwd: string;
  sessionDir: string;
  conversationLogPath: string;
  modelRegistry: ModelRegistry;
  modelOverride?: unknown; // For testing with faux provider
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

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const { agentConfig, task, cwd, sessionDir, conversationLogPath, modelRegistry, modelOverride, onUpdate } = params;
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

  // Resolve model (override for testing, otherwise from registry)
  const model =
    modelOverride ??
    (() => {
      const { provider, modelId } = parseModelId(fm.model);
      return modelRegistry.find(provider, modelId) ?? getModel(provider as "anthropic", modelId as "claude-sonnet-4-6");
    })();
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
    model: model as never,
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
