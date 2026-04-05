import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { AgentConfig } from "../discovery/validator.js";
import type { AgentMetrics } from "../invocation/metrics.js";
import { runAgent } from "../invocation/session.js";
import { executeAgentTool } from "./agent-tool-execute.js";
import { buildPromptGuidelines } from "./prompt-guidelines.js";
import type { AgentResultDetails } from "./render.js";
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
      const emitProgress = (details: AgentResultDetails) => {
        onUpdate?.({ content: [{ type: "text" as const, text: "" }], details });
      };
      return executeAgentTool({
        toolParams: toolParams as Record<string, unknown>,
        agents,
        findAgent: findAgentConfig,
        makeRunAgent,
        emitProgress,
        signal,
      });
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
