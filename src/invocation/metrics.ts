export type AgentMetrics = Readonly<{
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  toolCalls: ReadonlyArray<Readonly<{ name: string; args: Record<string, unknown> }>>;
}>;

export function createMetricsTracker() {
  let turns = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  return {
    handle(event: Record<string, unknown>) {
      if (event.type === "turn_end") {
        turns++;
      }
      if (event.type === "message_end") {
        const msg = event.message as Record<string, unknown> | undefined;
        if (msg?.role === "assistant") {
          const usage = msg.usage as Record<string, unknown> | undefined;
          if (usage) {
            inputTokens += (usage.input as number | undefined) ?? 0;
            outputTokens += (usage.output as number | undefined) ?? 0;
            const costObj = usage.cost as Record<string, unknown> | undefined;
            cost += (costObj?.total as number | undefined) ?? 0;
          }
        }
      }
      if (event.type === "tool_execution_start") {
        toolCalls.push({
          name: event.toolName as string,
          args: (event.args as Record<string, unknown>) ?? {},
        });
      }
    },
    snapshot(): AgentMetrics {
      return {
        turns,
        inputTokens,
        outputTokens,
        cost,
        toolCalls: toolCalls.map((tc) => ({ ...tc })),
      };
    },
  };
}
