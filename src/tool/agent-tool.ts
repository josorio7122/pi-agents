import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createThrottle } from "../common/throttle.js";
import type { AgentConfig } from "../discovery/validator.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { runAgent } from "../invocation/session.js";
import { collectAgentNames, detectMode, executeChain, executeParallel, executeSingle } from "./modes.js";
import { buildPromptGuidelines } from "./prompt-guidelines.js";
import type { AgentResultDetails, AgentResultEntry } from "./render.js";
import { renderAgentCall, renderAgentResult, runningEntry, toResultEntry } from "./render.js";
import { truncateOutput } from "./truncate.js";

export function createAgentTool(params: {
  readonly agents: ReadonlyArray<AgentConfig>;
  readonly modelRegistry: ModelRegistry;
  readonly cwd: string;
  readonly sessionDir: string;
  readonly conversationLogPath: string;
}) {
  const { agents, modelRegistry, cwd, sessionDir, conversationLogPath } = params;

  function findAgentConfig(name: string) {
    return agents.find((a) => a.frontmatter.name === name);
  }

  function findAgentDisplay(name: string) {
    const a = findAgentConfig(name);
    if (!a) return undefined;
    const { icon, name: n, color, model } = a.frontmatter;
    return { icon, name: n, color, model };
  }

  function makeRunAgent(agentConfig: AgentConfig, signal?: AbortSignal) {
    return async (p: { readonly task: string; readonly onMetrics?: (metrics: AgentMetrics) => void }) =>
      runAgent({
        agentConfig,
        task: p.task,
        cwd,
        sessionDir,
        conversationLogPath,
        modelRegistry,
        ...(signal ? { signal } : {}),
        ...(p.onMetrics ? { onUpdate: p.onMetrics } : {}),
      });
  }

  return {
    name: "agent",
    label: "Agent",
    description:
      "Invoke a specialized agent to perform a task. Modes: single (agent+task), parallel (tasks array), chain (sequential with {previous}).",
    promptSnippet: "Delegate tasks to specialized agents (single, parallel, or chain mode)",
    promptGuidelines: buildPromptGuidelines(agents),
    parameters: Type.Object({
      agent: Type.Optional(Type.String({ description: "Agent name (single mode)" })),
      task: Type.Optional(Type.String({ description: "Task to perform (single mode)" })),
      tasks: Type.Optional(
        Type.Array(Type.Object({ agent: Type.String(), task: Type.String() }), { description: "Parallel mode" }),
      ),
      chain: Type.Optional(
        Type.Array(Type.Object({ agent: Type.String(), task: Type.String() }), { description: "Chain mode" }),
      ),
    }),

    async execute(
      _toolCallId: string,
      toolParams: Record<string, unknown>,
      signal: AbortSignal | undefined,
      onUpdate: ((partial: unknown) => void) | undefined,
    ) {
      if (signal?.aborted) throw new Error("Agent execution cancelled");

      const mode = detectMode(toolParams);
      if ("error" in mode) {
        throw new Error(mode.error);
      }

      // Validate all agent names upfront — fail fast before dispatching
      const agentNames = collectAgentNames(mode);
      const unknown = agentNames.filter((name) => !findAgentConfig(name));
      if (unknown.length > 0) {
        const available = agents.map((a) => a.frontmatter.name).join(", ");
        const unique = [...new Set(unknown)];
        throw new Error(
          `Unknown agent${unique.length > 1 ? "s" : ""}: ${unique.map((n) => `"${n}"`).join(", ")}. Available: ${available}`,
        );
      }

      const emitProgress = (details: AgentResultDetails) => {
        onUpdate?.({ content: [{ type: "text" as const, text: "" }], details });
      };

      if (mode.mode === "single") {
        const config = findAgentConfig(mode.agent)!;

        const singleEntry: AgentResultEntry[] = [runningEntry({ agentName: mode.agent })];
        emitProgress({ mode: "single", results: [...singleEntry] });

        const throttled = createThrottle(() => emitProgress({ mode: "single", results: [...singleEntry] }));
        const result = await executeSingle({
          task: mode.task,
          runAgent: makeRunAgent(config, signal),
          onMetrics: (m) => {
            singleEntry[0] = { ...singleEntry[0]!, metrics: m };
            throttled();
          },
        });
        throttled.flush();
        const details = {
          mode: "single",
          results: [toResultEntry({ agentName: mode.agent, result })],
        };
        return { content: [{ type: "text" as const, text: truncateOutput(result.output) }], details };
      }

      if (mode.mode === "parallel") {
        const taskDefs = mode.tasks.map((t) => ({
          agent: t.agent,
          task: t.task,
          runAgent: makeRunAgent(findAgentConfig(t.agent)!, signal),
        }));

        const entries: AgentResultEntry[] = taskDefs.map((t) => runningEntry({ agentName: t.agent }));
        emitProgress({ mode: "parallel", results: [...entries] });

        const throttled = createThrottle(() => emitProgress({ mode: "parallel", results: [...entries] }));
        const results = await executeParallel({
          tasks: taskDefs.map((t) => ({ task: t.task, runAgent: t.runAgent })),
          maxConcurrency: 4,
          onProgress: (idx, r) => {
            entries[idx] = toResultEntry({ agentName: taskDefs[idx]!.agent, result: r });
            throttled.flush();
          },
          onTaskMetrics: (idx, m) => {
            entries[idx] = { ...entries[idx]!, metrics: m };
            throttled();
          },
        });
        throttled.flush();

        const finalEntries = results.map((r, i) => toResultEntry({ agentName: taskDefs[i]!.agent, result: r }));
        const combined = results.map((r) => r.output).join("\n\n---\n\n");
        const details = { mode: "parallel", results: finalEntries };
        return { content: [{ type: "text" as const, text: truncateOutput(combined) }], details };
      }

      // chain
      const stepDefs = mode.chain.map((s) => ({
        agent: s.agent,
        task: s.task,
        runAgent: makeRunAgent(findAgentConfig(s.agent)!, signal),
      }));

      const chainEntries: AgentResultEntry[] = stepDefs.map((s, i) =>
        runningEntry({ agentName: s.agent, step: i + 1 }),
      );
      emitProgress({ mode: "chain", results: [...chainEntries] });

      const throttled = createThrottle(() => emitProgress({ mode: "chain", results: [...chainEntries] }));
      const chainResult = await executeChain({
        steps: stepDefs.map((s) => ({ task: s.task, runAgent: s.runAgent })),
        onStepComplete: (stepIdx, r) => {
          chainEntries[stepIdx] = toResultEntry({
            agentName: stepDefs[stepIdx]!.agent,
            result: r,
            step: stepIdx + 1,
          });
          throttled.flush();
        },
        onStepMetrics: (stepIdx, m) => {
          chainEntries[stepIdx] = { ...chainEntries[stepIdx]!, metrics: m };
          throttled();
        },
      });
      throttled.flush();

      const finalEntries = chainResult.steps.map((r, i) =>
        toResultEntry({ agentName: stepDefs[i]!.agent, result: r, step: i + 1 }),
      );
      const details = { mode: "chain", results: finalEntries };
      return { content: [{ type: "text" as const, text: truncateOutput(chainResult.output) }], details };
    },

    renderCall(args: Record<string, unknown>, theme: unknown) {
      type CallTheme = Parameters<typeof renderAgentCall>[0]["theme"];
      return renderAgentCall({ args, theme: theme as CallTheme, findAgent: findAgentDisplay });
    },

    renderResult(result: unknown, _options: { expanded: boolean; isPartial: boolean }, theme: unknown) {
      type ResultParams = Parameters<typeof renderAgentResult>[0];
      return renderAgentResult({
        result: result as ResultParams["result"],
        theme: theme as ResultParams["theme"],
        findAgent: findAgentDisplay,
      });
    },
  };
}
