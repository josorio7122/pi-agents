import type { Api, Model } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  createExtensionRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { discoverContextFiles } from "../common/context-files.js";
import { readFileSafe } from "../common/fs.js";
import { parseModelId } from "../common/model.js";
import { expandPath } from "../common/paths.js";
import { buildDomainWithKnowledge } from "../domain/scoped-tools.js";
import { assembleSystemPrompt } from "../prompt/assembly.js";
import { buildAgentTools } from "./build-tools.js";
import { appendToLog } from "./conversation-log.js";
import { createMetricsTracker } from "./metrics.js";
import { dumpAgentSession } from "./session-dump.js";
import type { RunAgentParams, RunAgentResult } from "./session-helpers.js";
import { extractAssistantOutput } from "./session-helpers.js";

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
    sharedContext,
  } = params;
  const fm = agentConfig.frontmatter;

  // Read skill files upfront — parallel async I/O
  // Conversation log and knowledge are NOT pre-loaded; agents read them via tools
  const skillResults = await Promise.all(fm.skills.map((s) => readFileSafe(s.path)));
  const skillContents = fm.skills.map((s, i) => ({
    name: s.path.split("/").pop()?.replace(".md", "") ?? s.path,
    when: s.when,
    content: skillResults[i] ?? "",
  }));

  // Auto-discover shared context files if not provided
  const sharedContextContents = sharedContext ?? (await discoverContextFiles({ cwd }));

  // Assemble system prompt (pure)
  const assemblyCtx = {
    agentConfig,
    sessionDir,

    skillContents,
    ...(extraVariables ? { extraVariables } : {}),
    ...(sharedContextContents.length > 0 ? { sharedContextContents } : {}),
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

  // Build all agent tools
  const { builtinTools, customTools: builtCustomTools } = buildAgentTools({
    tools: fm.tools,
    cwd,
    domain: fullDomain,
    conversationLogPath,
    agentName: fm.name,
    knowledgeFiles,
    knowledgeEntries,
  });

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
    tools: builtinTools,
    customTools: [...builtCustomTools, ...((customTools ?? []) as typeof builtCustomTools)],
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

  // Run the agent — wire abort signal to session.abort() for in-flight cancellation
  if (signal?.aborted) {
    session.dispose();
    return { output: "", metrics: tracker.snapshot(), error: "Agent execution cancelled" };
  }

  const abortHandler = () => {
    session.abort().catch(() => {});
  };
  signal?.addEventListener("abort", abortHandler);

  try {
    await session.prompt(task);
  } catch (err) {
    const error = signal?.aborted ? "Agent execution cancelled" : String(err);
    return { output: "", metrics: tracker.snapshot(), error };
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }

  // Extract final output, persist, and dispose — guaranteed cleanup via finally
  let output = "";
  try {
    output = extractAssistantOutput(session.messages);

    // Persist full agent session for debugging — mirrors pi's session format
    await dumpAgentSession({
      agentName: fm.name,
      caller,
      task,
      messages: session.messages,
      output,
      sessionDir,
    });

    // Write agent response to conversation log AFTER completion
    await appendToLog(conversationLogPath, {
      ts: new Date().toISOString(),
      from: fm.name,
      to: caller,
      message: output,
    });
  } finally {
    session.dispose();
  }

  return { output, metrics: tracker.snapshot() };
}
