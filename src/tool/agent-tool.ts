import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { createThrottle } from "../common/throttle.js";
import type { AgentConfig } from "../discovery/validator.js";
import { runAgent } from "../invocation/session.js";
import type { RunAgentFn, RunAgentResult } from "./modes.js";
import { detectMode, executeChain, executeParallel, executeSingle } from "./modes.js";
import type { AgentResultDetails, AgentResultEntry } from "./render.js";
import { renderAgentCall, renderAgentResult } from "./render.js";

const EMPTY_METRICS = { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] } as const;

function unknownAgentRunner(name: string): RunAgentFn {
  return async () => ({ output: "", metrics: EMPTY_METRICS, error: `Unknown agent: ${name}` });
}

function toEntry(agentName: string, r: RunAgentResult, step?: number): AgentResultEntry {
  const base = {
    agent: agentName,
    status: (r.error ? "error" : "done") as AgentResultEntry["status"],
    metrics: r.metrics,
  };
  return { ...base, ...(r.error ? { error: r.error } : {}), ...(step !== undefined ? { step } : {}) };
}

function runningEntry(agentName: string, step?: number): AgentResultEntry {
  return { agent: agentName, status: "running", ...(step !== undefined ? { step } : {}) };
}

function buildPromptGuidelines(agents: ReadonlyArray<AgentConfig>) {
  return [
    "Use this tool ONLY when a task benefits from a specialized agent. For simple questions, answer directly.",
    "Write clear, specific tasks. Bad: 'check the code'. Good: 'list all exported functions in src/schema/'.",
    "",
    "Available agents:",
    ...agents.map((a) => `  ${a.frontmatter.icon} ${a.frontmatter.name} — ${a.frontmatter.description}`),
    "",
    "Modes:",
    "  Single: { agent: 'scout', task: 'find all files that export Zod schemas' }",
    "  Parallel: { tasks: [{agent: 'scout', task: 'find API routes'}, {agent: 'scout', task: 'find test files'}] }",
    "  Chain: { chain: [{agent: 'scout', task: 'find auth code'}, {agent: 'scout', task: 'analyze {previous}'}] }",
  ];
}

function truncateOutput(text: string) {
  const truncation = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  return truncation.truncated
    ? `${truncation.content}\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines]`
    : text;
}

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
    return {
      icon: a.frontmatter.icon,
      name: a.frontmatter.name,
      color: a.frontmatter.color,
      model: a.frontmatter.model,
    };
  }

  function makeRunAgent(agentConfig: AgentConfig): RunAgentFn {
    return async (p) =>
      runAgent({
        agentConfig,
        task: p.task,
        cwd,
        sessionDir,
        conversationLogPath,
        modelRegistry,
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
      _signal: AbortSignal | undefined,
      onUpdate: ((partial: unknown) => void) | undefined,
    ) {
      const mode = detectMode(toolParams);
      if ("error" in mode) {
        return { content: [{ type: "text" as const, text: mode.error }], details: {} };
      }

      const emitProgress = (details: AgentResultDetails) => {
        onUpdate?.({ content: [{ type: "text" as const, text: "" }], details });
      };

      if (mode.mode === "single") {
        const config = findAgentConfig(mode.agent);
        if (!config) {
          const available = agents.map((a) => a.frontmatter.name).join(", ");
          return {
            content: [{ type: "text" as const, text: `Unknown agent: "${mode.agent}". Available: ${available}` }],
            details: {},
          };
        }

        const singleEntry: AgentResultEntry[] = [runningEntry(mode.agent)];
        emitProgress({ mode: "single", results: [...singleEntry] });

        const throttled = createThrottle(() => emitProgress({ mode: "single", results: [...singleEntry] }));
        const result = await executeSingle({
          task: mode.task,
          runAgent: makeRunAgent(config),
          onMetrics: (m) => {
            singleEntry[0] = { ...singleEntry[0]!, metrics: m };
            throttled();
          },
        });
        throttled.flush();
        const details: AgentResultDetails = { mode: "single", results: [toEntry(mode.agent, result)] };
        return { content: [{ type: "text" as const, text: truncateOutput(result.output) }], details };
      }

      if (mode.mode === "parallel") {
        const taskDefs = mode.tasks.map((t) => ({
          agent: t.agent,
          task: t.task,
          runAgent: findAgentConfig(t.agent) ? makeRunAgent(findAgentConfig(t.agent)!) : unknownAgentRunner(t.agent),
        }));

        const entries: AgentResultEntry[] = taskDefs.map((t) => runningEntry(t.agent));
        emitProgress({ mode: "parallel", results: [...entries] });

        const throttled = createThrottle(() => emitProgress({ mode: "parallel", results: [...entries] }));
        const results = await executeParallel({
          tasks: taskDefs.map((t) => ({ task: t.task, runAgent: t.runAgent })),
          maxConcurrency: 4,
          onProgress: (idx, r) => {
            entries[idx] = toEntry(taskDefs[idx]!.agent, r);
            throttled.flush();
          },
          onTaskMetrics: (idx, m) => {
            entries[idx] = { ...entries[idx]!, metrics: m };
            throttled();
          },
        });
        throttled.flush();

        const finalEntries = results.map((r, i) => toEntry(taskDefs[i]!.agent, r));
        const combined = results.map((r) => r.output).join("\n\n---\n\n");
        const details: AgentResultDetails = { mode: "parallel", results: finalEntries };
        return { content: [{ type: "text" as const, text: truncateOutput(combined) }], details };
      }

      // chain
      const stepDefs = mode.chain.map((s) => ({
        agent: s.agent,
        task: s.task,
        runAgent: findAgentConfig(s.agent) ? makeRunAgent(findAgentConfig(s.agent)!) : unknownAgentRunner(s.agent),
      }));

      const chainEntries: AgentResultEntry[] = stepDefs.map((s, i) => runningEntry(s.agent, i + 1));
      emitProgress({ mode: "chain", results: [...chainEntries] });

      const throttled = createThrottle(() => emitProgress({ mode: "chain", results: [...chainEntries] }));
      const chainResult = await executeChain({
        steps: stepDefs.map((s) => ({ task: s.task, runAgent: s.runAgent })),
        onStepComplete: (stepIdx, r) => {
          chainEntries[stepIdx] = toEntry(stepDefs[stepIdx]!.agent, r, stepIdx + 1);
          throttled.flush();
        },
        onStepMetrics: (stepIdx, m) => {
          chainEntries[stepIdx] = { ...chainEntries[stepIdx]!, metrics: m };
          throttled();
        },
      });
      throttled.flush();

      const finalEntries = chainResult.steps.map((r, i) => toEntry(stepDefs[i]!.agent, r, i + 1));
      const details: AgentResultDetails = { mode: "chain", results: finalEntries };
      return { content: [{ type: "text" as const, text: truncateOutput(chainResult.output) }], details };
    },

    renderCall(args: Record<string, unknown>, theme: unknown) {
      return renderAgentCall({
        args,
        theme: theme as Parameters<typeof renderAgentCall>[0]["theme"],
        findAgent: findAgentDisplay,
      });
    },

    renderResult(result: unknown, _options: { expanded: boolean; isPartial: boolean }, theme: unknown) {
      return renderAgentResult({
        result: result as Parameters<typeof renderAgentResult>[0]["result"],
        theme: theme as Parameters<typeof renderAgentResult>[0]["theme"],
        findAgent: findAgentDisplay,
      });
    },
  };
}
