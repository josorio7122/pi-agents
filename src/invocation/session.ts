import type { Api, Model } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  createExtensionRuntime,
  type ModelRegistry,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { readFileSafe } from "../common/fs.js";
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
  modelOverride?: Model<Api>;
  signal?: AbortSignal;
  onUpdate?: (metrics: AgentMetrics) => void;
  caller?: string;
  extraVariables?: Readonly<Record<string, string>>;
  customTools?: ReadonlyArray<unknown>;
}>;

type RunAgentResult = Readonly<{
  output: string;
  metrics: AgentMetrics;
  error?: string;
}>;

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const {
    agentConfig,
    task,
    cwd,
    sessionDir,
    conversationLogPath,
    modelRegistry,
    modelOverride,
    signal,
    onUpdate,
    caller = "user",
    extraVariables,
    customTools,
  } = params;
  const fm = agentConfig.frontmatter;

  // Read all file content upfront — parallel async I/O
  const [conversationLogContent, projectKnowledgeContent, generalKnowledgeContent, ...skillResults] = await Promise.all(
    [
      readLog(conversationLogPath),
      readFileSafe(fm.knowledge.project.path),
      readFileSafe(fm.knowledge.general.path),
      ...fm.skills.map((s) => readFileSafe(s.path)),
    ],
  );
  const skillContents = fm.skills.map((s, i) => ({
    name: s.path.split("/").pop()?.replace(".md", "") ?? s.path,
    when: s.when,
    content: skillResults[i] ?? "",
  }));

  // Assemble system prompt (pure)
  const assemblyCtx = {
    agentConfig,
    sessionDir,
    conversationLogContent,
    skillContents,
    projectKnowledgeContent,
    generalKnowledgeContent,
    ...(extraVariables ? { extraVariables } : {}),
  };
  const systemPrompt = assembleSystemPrompt(assemblyCtx);

  // Resolve model (override for testing, otherwise from registry)
  const { provider, modelId } = parseModelId(fm.model);
  const model: Model<Api> | undefined = modelOverride ?? modelRegistry.find(provider, modelId);
  if (!model) {
    return { output: "", metrics: createMetricsTracker().snapshot(), error: `Model not found: ${fm.model}` };
  }

  // Build domain with implicit knowledge paths
  const knowledgeEntries = [
    { path: expandPath(fm.knowledge.project.path), updatable: fm.knowledge.project.updatable },
    { path: expandPath(fm.knowledge.general.path), updatable: fm.knowledge.general.updatable },
  ];
  const fullDomain = buildDomainWithKnowledge(
    fm.reports
      ? { domain: fm.domain, knowledgeEntries, reportsDir: { path: fm.reports.path, updatable: fm.reports.updatable } }
      : { domain: fm.domain, knowledgeEntries },
  );

  // Knowledge files with max-lines for post-write enforcement
  const knowledgeFiles = [
    { path: expandPath(fm.knowledge.project.path), maxLines: fm.knowledge.project["max-lines"] },
    { path: expandPath(fm.knowledge.general.path), maxLines: fm.knowledge.general["max-lines"] },
  ];

  // Create domain-scoped tools.
  const builtinTools = fm.tools
    .map((t) =>
      createToolForAgent({ name: t, cwd, domain: fullDomain, conversationLogPath, agentName: fm.name, knowledgeFiles }),
    )
    .filter((t): t is NonNullable<typeof t> => t != null);
  const tools = [...builtinTools, ...((customTools ?? []) as typeof builtinTools)];

  // Write caller task to conversation log BEFORE invocation
  await appendToLog(conversationLogPath, {
    ts: new Date().toISOString(),
    from: caller,
    to: fm.name,
    message: task,
  });

  // Create agent session
  const { session } = await createAgentSession({
    cwd,
    model,
    tools,
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
    } satisfies ResourceLoader,
  });

  // Track metrics
  const tracker = createMetricsTracker();
  session.subscribe((event) => {
    tracker.handle(event);
    onUpdate?.(tracker.snapshot());
  });

  // Run the agent
  if (signal?.aborted) {
    session.dispose();
    return { output: "", metrics: tracker.snapshot(), error: "Agent execution cancelled" };
  }

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
  await appendToLog(conversationLogPath, {
    ts: new Date().toISOString(),
    from: fm.name,
    to: caller,
    message: output,
  });

  return { output, metrics: tracker.snapshot() };
}
