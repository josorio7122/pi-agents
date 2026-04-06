import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import { createSubmitTool } from "../domain/submit-tool.js";
import { assembleSystemPrompt } from "../prompt/assembly.js";
import { appendToLog } from "./conversation-log.js";
import { createMetricsTracker } from "./metrics.js";
import type { RunAgentParams, RunAgentResult } from "./session-helpers.js";
import { extractAssistantOutput } from "./session-helpers.js";
import { createToolForAgent } from "./tool-wrapper.js";

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

  // Create domain-scoped tools (built-in only — these go through SDK's tools option)
  const builtinTools = fm.tools
    .map((t) =>
      createToolForAgent({ name: t, cwd, domain: fullDomain, conversationLogPath, agentName: fm.name, knowledgeFiles }),
    )
    .filter((t): t is NonNullable<typeof t> => t != null);
  const tools = builtinTools;

  // Inject knowledge tools — read-knowledge always, write/edit only when updatable
  const hasUpdatableKnowledge = knowledgeEntries.some((e) => e.updatable);
  const knowledgeToolNames = hasUpdatableKnowledge
    ? ["read-knowledge", "write-knowledge", "edit-knowledge"]
    : ["read-knowledge"];
  const knowledgeToolDefs = knowledgeToolNames
    .map((t) =>
      createToolForAgent({
        name: t,
        cwd,
        domain: fullDomain,
        conversationLogPath,
        agentName: fm.name,
        knowledgeFiles,
      }),
    )
    .filter((t): t is NonNullable<typeof t> => t != null);

  // Inject read-conversation tool
  const conversationTool = createToolForAgent({
    name: "read-conversation",
    cwd,
    domain: fullDomain,
    conversationLogPath,
    agentName: fm.name,
    knowledgeFiles,
  });
  const conversationToolDefs = conversationTool ? [conversationTool] : [];

  // Inject submit tool — every agent must call this to deliver output
  const submitTool = createSubmitTool();

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
    customTools: [
      ...knowledgeToolDefs,
      ...conversationToolDefs,
      submitTool,
      ...((customTools ?? []) as typeof knowledgeToolDefs),
    ],
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

  // Extract final output
  const output = extractAssistantOutput(session.messages);

  // Persist full agent session for debugging — mirrors pi's session format
  await dumpAgentSession({
    agentName: fm.name,
    caller,
    task,
    messages: session.messages,
    output,
    sessionDir,
  });

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

type DumpParams = Readonly<{
  agentName: string;
  caller: string;
  task: string;
  messages: ReadonlyArray<unknown>;
  output: string;
  sessionDir: string;
}>;

async function dumpAgentSession(params: DumpParams) {
  try {
    const agentDir = join(params.sessionDir, "agents");
    await mkdir(agentDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${ts}_${params.agentName}.jsonl`;
    const lines: string[] = [
      JSON.stringify({
        type: "agent_session",
        agent: params.agentName,
        caller: params.caller,
        task: params.task,
        timestamp: new Date().toISOString(),
        extractedOutput: params.output,
      }),
    ];
    for (const msg of params.messages) {
      lines.push(JSON.stringify({ type: "message", message: msg }));
    }
    await writeFile(join(agentDir, filename), lines.join("\n") + "\n");
  } catch {
    // Non-critical — don't fail the agent run if dump fails
  }
}
