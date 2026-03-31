import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { AgentConfig } from "../discovery/validator.js";
import { runAgent } from "../invocation/session.js";
import type { RunAgentFn } from "./modes.js";
import { detectMode, executeChain, executeParallel, executeSingle } from "./modes.js";
import { renderAgentCall, renderAgentResult } from "./render.js";

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
      });
  }

  return {
    name: "agent",
    label: "Agent",
    description:
      "Invoke a specialized agent to perform a task. Modes: single (agent+task), parallel (tasks array), chain (sequential with {previous}).",
    promptSnippet: "Delegate tasks to specialized agents (single, parallel, or chain mode)",
    promptGuidelines: [
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
    ],
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
      _onUpdate: ((partial: unknown) => void) | undefined,
    ) {
      const mode = detectMode(toolParams);
      if ("error" in mode) {
        return { content: [{ type: "text" as const, text: mode.error }], details: {} };
      }

      let result: { output: string; metrics: unknown; error?: string };

      if (mode.mode === "single") {
        const config = findAgentConfig(mode.agent);
        if (!config) {
          const available = agents.map((a) => a.frontmatter.name).join(", ");
          return {
            content: [{ type: "text" as const, text: `Unknown agent: "${mode.agent}". Available: ${available}` }],
            details: {},
          };
        }

        result = await executeSingle({
          task: mode.task,
          runAgent: makeRunAgent(config),
        });
      } else if (mode.mode === "parallel") {
        const tasks = mode.tasks.map((t) => {
          const config = findAgentConfig(t.agent);
          return {
            task: t.task,
            runAgent: config
              ? makeRunAgent(config)
              : async () => ({
                  output: "",
                  metrics: { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] },
                  error: `Unknown agent: ${t.agent}`,
                }),
          };
        });

        const results = await executeParallel({ tasks, maxConcurrency: 4 });
        const combined = results.map((r) => r?.output ?? "").join("\n\n---\n\n");
        result = { output: combined, metrics: {} };
      } else {
        const steps = mode.chain.map((s) => {
          const config = findAgentConfig(s.agent);
          return {
            task: s.task,
            runAgent: config
              ? makeRunAgent(config)
              : async () => ({
                  output: "",
                  metrics: { turns: 0, inputTokens: 0, outputTokens: 0, cost: 0, toolCalls: [] },
                  error: `Unknown agent: ${s.agent}`,
                }),
          };
        });

        result = await executeChain({ steps });
      }

      // Truncate output
      let outputText = result.output;
      if (result.error) outputText = `Error: ${result.error}`;
      const truncation = truncateHead(outputText, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
      const finalOutput = truncation.truncated
        ? `${truncation.content}\n\n[Output truncated: ${truncation.outputLines}/${truncation.totalLines} lines]`
        : outputText;

      return {
        content: [{ type: "text" as const, text: finalOutput }],
        details: { output: finalOutput, task: "task" in mode ? mode.task : undefined, metrics: result.metrics },
      };
    },

    renderCall(args: Record<string, unknown>, theme: unknown) {
      return renderAgentCall({
        args,
        theme: theme as Parameters<typeof renderAgentCall>[0]["theme"],
        findAgent: findAgentDisplay,
      });
    },

    renderResult(result: unknown, options: { expanded: boolean; isPartial: boolean }, theme: unknown) {
      return renderAgentResult({
        result: result as Parameters<typeof renderAgentResult>[0]["result"],
        isPartial: options.isPartial,
        expanded: options.expanded,
        theme: theme as Parameters<typeof renderAgentResult>[0]["theme"],
      });
    },
  };
}
