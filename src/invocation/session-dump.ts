import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type DumpParams = Readonly<{
  agentName: string;
  caller: string;
  task: string;
  messages: ReadonlyArray<unknown>;
  output: string;
  sessionDir: string;
}>;

export async function dumpAgentSession(params: DumpParams) {
  try {
    const agentDir = join(params.sessionDir, "agents");
    await mkdir(agentDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${ts}_${params.agentName}.jsonl`;
    const header = JSON.stringify({
      type: "agent_session",
      agent: params.agentName,
      caller: params.caller,
      task: params.task,
      timestamp: ts,
      extractedOutput: params.output,
    });
    const body = params.messages.map((msg) => JSON.stringify({ type: "message", message: msg }));
    await writeFile(join(agentDir, filename), `${[header, ...body].join("\n")}\n`);
  } catch {
    // Non-critical — don't fail the agent run if dump fails
  }
}
