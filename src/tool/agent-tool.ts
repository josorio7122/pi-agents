import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { defineTool } from "@mariozechner/pi-coding-agent";
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

  return defineTool({
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

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.execute (5 positional params)
    async execute(_toolCallId, toolParams, signal, onUpdate, _ctx) {
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

      // Animation interval — drives spinner re-renders at 80ms (same as Pi's Loader)
      let lastDetails: AgentResultDetails | undefined;
      const animationInterval = setInterval(() => {
        if (lastDetails) emitProgress(lastDetails);
      }, 80);
      const stopAnimation = () => clearInterval(animationInterval);

      if (mode.mode === "single") {
        const config = findAgentConfig(mode.agent);
        if (!config) throw new Error(`Agent "${mode.agent}" not found`);

        const singleEntry: AgentResultEntry[] = [runningEntry({ agentName: mode.agent })];
        lastDetails = { mode: "single", results: [...singleEntry] };
        emitProgress(lastDetails);

        const throttled = createThrottle(() => {
          lastDetails = { mode: "single", results: [...singleEntry] };
          emitProgress(lastDetails);
        });
        const result = await executeSingle({
          task: mode.task,
          runAgent: makeRunAgent(config, signal),
          onMetrics: (m) => {
            const prev = singleEntry[0];
            if (prev) singleEntry[0] = { ...prev, metrics: m };
            throttled();
          },
        });
        throttled.flush();
        stopAnimation();
        const details = {
          mode: "single",
          results: [toResultEntry({ agentName: mode.agent, result })],
        };
        return { content: [{ type: "text" as const, text: truncateOutput(result.output) }], details };
      }

      if (mode.mode === "parallel") {
        const taskDefs = mode.tasks.map((t) => {
          const agentConfig = findAgentConfig(t.agent);
          if (!agentConfig) throw new Error(`Agent "${t.agent}" not found`);
          return { agent: t.agent, task: t.task, runAgent: makeRunAgent(agentConfig, signal) };
        });

        const entries: AgentResultEntry[] = taskDefs.map((t) => runningEntry({ agentName: t.agent }));
        lastDetails = { mode: "parallel", results: [...entries] };
        emitProgress(lastDetails);

        const throttled = createThrottle(() => {
          lastDetails = { mode: "parallel", results: [...entries] };
          emitProgress(lastDetails);
        });
        const results = await executeParallel({
          tasks: taskDefs.map((t) => ({ task: t.task, runAgent: t.runAgent })),
          maxConcurrency: 4,
          onProgress: (idx, r) => {
            const def = taskDefs[idx];
            if (def) entries[idx] = toResultEntry({ agentName: def.agent, result: r });
            throttled.flush();
          },
          onTaskMetrics: (idx, m) => {
            const prev = entries[idx];
            if (prev) entries[idx] = { ...prev, metrics: m };
            throttled();
          },
        });
        throttled.flush();
        stopAnimation();

        const finalEntries = results.map((r, i) =>
          toResultEntry({ agentName: taskDefs[i]?.agent ?? r.output, result: r }),
        );
        const combined = results.map((r) => r.output).join("\n\n---\n\n");
        const details = { mode: "parallel", results: finalEntries };
        return { content: [{ type: "text" as const, text: truncateOutput(combined) }], details };
      }

      // chain
      const stepDefs = mode.chain.map((s) => {
        const agentConfig = findAgentConfig(s.agent);
        if (!agentConfig) throw new Error(`Agent "${s.agent}" not found`);
        return { agent: s.agent, task: s.task, runAgent: makeRunAgent(agentConfig, signal) };
      });

      const chainEntries: AgentResultEntry[] = stepDefs.map((s, i) =>
        runningEntry({ agentName: s.agent, step: i + 1 }),
      );
      lastDetails = { mode: "chain", results: [...chainEntries] };
      emitProgress(lastDetails);

      const throttled = createThrottle(() => {
        lastDetails = { mode: "chain", results: [...chainEntries] };
        emitProgress(lastDetails);
      });
      const chainResult = await executeChain({
        steps: stepDefs.map((s) => ({ task: s.task, runAgent: s.runAgent })),
        onStepComplete: (stepIdx, r) => {
          const stepDef = stepDefs[stepIdx];
          if (stepDef) {
            chainEntries[stepIdx] = toResultEntry({
              agentName: stepDef.agent,
              result: r,
              step: stepIdx + 1,
            });
          }
          throttled.flush();
        },
        onStepMetrics: (stepIdx, m) => {
          const prev = chainEntries[stepIdx];
          if (prev) chainEntries[stepIdx] = { ...prev, metrics: m };
          throttled();
        },
      });
      throttled.flush();
      stopAnimation();

      const finalEntries = chainResult.steps.map((r, i) =>
        toResultEntry({ agentName: stepDefs[i]?.agent ?? "", result: r, step: i + 1 }),
      );
      const details = { mode: "chain", results: finalEntries };
      return { content: [{ type: "text" as const, text: truncateOutput(chainResult.output) }], details };
    },

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.renderCall (3 positional params)
    renderCall(args, theme, _context) {
      return renderAgentCall({ args: args as Record<string, unknown>, theme, findAgent: findAgentDisplay });
    },

    // biome-ignore lint/complexity/useMaxParams: implements Pi's ToolDefinition.renderResult (4 positional params)
    renderResult(result, _options, theme, _context) {
      return renderAgentResult({ result, theme, findAgent: findAgentDisplay });
    },
  });
}
