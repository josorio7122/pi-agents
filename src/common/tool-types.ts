import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import type { TSchema } from "@sinclair/typebox";

export interface ExecutableTool {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly parameters: TSchema;
  prepareArguments?: (args: unknown) => unknown;
  execute(
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: unknown,
  ): Promise<AgentToolResult<unknown>>;
}
