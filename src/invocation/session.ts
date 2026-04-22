import type { Api, Model } from "@mariozechner/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { discoverContextFiles } from "../common/context-files.js";
import type { AssemblyContext } from "../prompt/assembly.js";
import { assembleSystemPrompt } from "../prompt/assembly.js";
import { buildAgentTools } from "./build-tools.js";
import { createMetricsTracker } from "./metrics.js";
import { resolveModel } from "./resolve-model.js";
import type { RunAgentParams, RunAgentResult } from "./session-helpers.js";
import { extractAssistantOutput } from "./session-helpers.js";

export async function runAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const {
    agentConfig,
    task,
    cwd,
    sessionDir,
    modelRegistry,
    modelOverride,
    inheritedModel,
    signal,
    onUpdate,
    extraVariables,
    customTools,
    sharedContext,
  } = params;
  const fm = agentConfig.frontmatter;

  const sharedContextContents = sharedContext ?? (await discoverContextFiles({ cwd }));

  const assemblyCtx: AssemblyContext = {
    agentConfig,
    sessionDir,
    ...(extraVariables ? { extraVariables } : {}),
    ...(sharedContextContents.length > 0 ? { sharedContextContents } : {}),
  };
  const systemPrompt = assembleSystemPrompt(assemblyCtx);

  let model: Model<Api>;
  try {
    model = modelOverride ?? resolveModel({ fmModel: fm.model, inherited: inheritedModel, registry: modelRegistry });
  } catch (err) {
    return { output: "", metrics: createMetricsTracker().snapshot(), error: String(err) };
  }

  const { builtinTools, customTools: builtCustomTools } = buildAgentTools({
    tools: fm.tools,
    cwd,
  });
  const allCustomTools = [...builtinTools, ...builtCustomTools, ...(customTools ?? [])];
  const activeToolNames = allCustomTools.map((t) => t.name);

  const skillLoaderOpts =
    fm.skills !== undefined ? { additionalSkillPaths: [...fm.skills], noSkills: true } : { noSkills: false as const };

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    systemPrompt,
    ...skillLoaderOpts,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });

  const { session } = await createAgentSession({
    cwd,
    model,
    tools: activeToolNames,
    customTools: allCustomTools,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
    modelRegistry,
    resourceLoader,
  });

  const tracker = createMetricsTracker();
  session.subscribe((event) => {
    tracker.handle(event);
    onUpdate?.(tracker.snapshot());
  });

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

  let output = "";
  try {
    output = extractAssistantOutput(session.messages);
  } finally {
    session.dispose();
  }

  return { output, metrics: tracker.snapshot() };
}
