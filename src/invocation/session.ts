import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import {
  type AgentSessionEvent,
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
import { createWorktree, removeWorktreeIfClean, type Worktree } from "./worktree.js";

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

  const sharedContextContents =
    sharedContext ?? (fm.inheritContextFiles === false ? [] : await discoverContextFiles({ cwd }));

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

  const agentId = randomUUID();

  // Optional worktree isolation: agent runs against a fresh git worktree under
  // <cwd>/worktrees/<agentId>; cleanup post-run preserves dirty trees.
  let effectiveCwd = cwd;
  let activeWorktree: Worktree | undefined;
  if (fm.isolation === "worktree") {
    try {
      activeWorktree = await createWorktree({ repoDir: cwd, id: agentId });
      effectiveCwd = activeWorktree.path;
    } catch (err) {
      return { output: "", metrics: createMetricsTracker().snapshot(), error: `worktree creation failed: ${err}` };
    }
  }

  const { builtinTools, customTools: builtCustomTools } = buildAgentTools({
    tools: fm.tools,
    disallowedTools: fm.disallowedTools,
    cwd: effectiveCwd,
  });
  const allCustomTools = [...builtinTools, ...builtCustomTools, ...(customTools ?? [])];
  const activeToolNames = allCustomTools.map((t) => t.name);

  const skillLoaderOpts =
    fm.skills !== undefined ? { additionalSkillPaths: [...fm.skills], noSkills: true } : { noSkills: false as const };

  const resourceLoader = new DefaultResourceLoader({
    cwd: effectiveCwd,
    agentDir: getAgentDir(),
    systemPrompt,
    ...skillLoaderOpts,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  // Required: pi's createAgentSession only auto-reloads when IT constructs the loader.
  // When we provide one, pi assumes it's initialized — skip this and getSkills() returns [].
  await resourceLoader.reload();

  const agentSessionDir = join(sessionDir, "agents", agentId);
  mkdirSync(agentSessionDir, { recursive: true });

  const { session } = await createAgentSession({
    cwd: effectiveCwd,
    model,
    tools: activeToolNames,
    customTools: allCustomTools,
    sessionManager: SessionManager.create(effectiveCwd, agentSessionDir),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
    modelRegistry,
    resourceLoader,
  });

  const tracker = createMetricsTracker();
  // pi's SDK does not natively cap turns. Track turn_end events ourselves and
  // abort the session once fm.maxTurns is reached.
  let maxTurnsReached = false;
  session.subscribe((event: AgentSessionEvent) => {
    tracker.handle(event);
    onUpdate?.(tracker.snapshot());
    if (
      fm.maxTurns !== undefined &&
      !maxTurnsReached &&
      event.type === "turn_end" &&
      tracker.snapshot().turns >= fm.maxTurns
    ) {
      maxTurnsReached = true;
      session.abort().catch(() => {});
    }
  });

  // dispose() is best-effort: failures here must not mask the real run error.
  // Idempotent via the `disposed` guard so multi-path callers can't double-free.
  let disposed = false;
  const safeDispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      session.dispose();
    } catch {
      // swallow — disposal is cleanup, not a failure mode.
    }
  };

  // Wrap every return path so worktree cleanup runs uniformly: clean trees are
  // removed silently, dirty trees stay and surface in the result.
  const finalize = async (base: RunAgentResult): Promise<RunAgentResult> => {
    if (!activeWorktree) return base;
    let removed = false;
    try {
      removed = await removeWorktreeIfClean(activeWorktree);
    } catch {
      removed = false;
    }
    if (removed) return base;
    return { ...base, worktree: { path: activeWorktree.path, branch: activeWorktree.branch } };
  };

  if (signal?.aborted) {
    safeDispose();
    return finalize({ output: "", metrics: tracker.snapshot(), error: "Agent execution cancelled" });
  }

  const abortHandler = () => {
    session.abort().catch(() => {});
  };
  signal?.addEventListener("abort", abortHandler);

  try {
    await session.prompt(task);
  } catch (err) {
    let error: string;
    if (maxTurnsReached) {
      error = `Agent stopped: maxTurns (${fm.maxTurns}) reached`;
    } else if (signal?.aborted) {
      error = "Agent execution cancelled";
    } else {
      error = String(err);
    }
    safeDispose();
    return finalize({ output: "", metrics: tracker.snapshot(), error });
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }

  let output = "";
  try {
    output = extractAssistantOutput(session.messages);
  } finally {
    safeDispose();
  }

  // If maxTurns triggered abort but session.prompt() still resolved cleanly
  // (e.g. abort landed between turns), surface the cap as an error so callers
  // can distinguish "finished" from "capped".
  if (maxTurnsReached) {
    return finalize({
      output,
      metrics: tracker.snapshot(),
      error: `Agent stopped: maxTurns (${fm.maxTurns}) reached`,
    });
  }

  return finalize({ output, metrics: tracker.snapshot() });
}
