import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import type { TSchema } from "@sinclair/typebox";

/**
 * A structural subset of pi's `AgentTool` (defined in
 * `@mariozechner/pi-agent-core/dist/types.d.ts` as a 4-ary execute:
 * `(toolCallId, params, signal?, onUpdate?) => Promise<AgentToolResult<T>>`).
 *
 * Pi's `createReadTool`, `createWriteTool`, etc. — re-exported from
 * `@mariozechner/pi-coding-agent` and used in `src/invocation/tool-wrapper.ts`
 * and `src/domain/knowledge-tools.ts` — return `AgentTool<T>`, NOT
 * `ToolDefinition<T>`. `ToolDefinition` is a different pi type (5-ary, adds
 * `ctx: ExtensionContext`) used for extension-registered tools.
 *
 * We don't import `AgentTool` directly because `@mariozechner/pi-agent-core` is
 * not currently a declared peer dependency (only `pi-ai`, `pi-coding-agent`,
 * `pi-tui`, `typebox` are — see `package.json`), and `pi-coding-agent` doesn't
 * re-export `AgentTool`. This interface is a schema-erased structural subset so
 * the wrappers can forward params opaquely without threading the schema generic.
 *
 * Collapse path: once `@mariozechner/pi-coding-agent` re-exports `AgentTool` (or
 * pi-agents adds `pi-agent-core` as a peer), this file can go away and consumers
 * can `import type { AgentTool } from "@mariozechner/pi-coding-agent"`.
 *
 * See `src/invocation/tool-wrapper.ts:77`, `src/domain/knowledge-tools.ts:42`,
 * `src/domain/knowledge-tools.ts:80` — the `biome-ignore` comments there say
 * "implements Pi's AgentTool.execute (4 positional params)" which this interface
 * mirrors.
 */
export interface ExecutableTool {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: TSchema;
  execute(
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown,
  ): Promise<AgentToolResult<unknown>>;
}
