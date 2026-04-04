import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureLogExists, readLog } from "./conversation-log.js";
import { createToolForAgent } from "./tool-wrapper.js";

async function makeTempEnv() {
  const cwd = mkdtempSync(join(tmpdir(), "tool-wrapper-"));
  const srcDir = join(cwd, "src");
  mkdirSync(srcDir, { recursive: true });
  const logPath = join(cwd, "conversation.jsonl");
  await ensureLogExists(logPath);
  return { cwd, srcDir, logPath };
}

function makeDefaultParams(env: Awaited<ReturnType<typeof makeTempEnv>>) {
  return {
    cwd: env.cwd,
    domain: [{ path: "src/", read: true, write: true, delete: false }],
    conversationLogPath: env.logPath,
    agentName: "test-agent",
    knowledgeFiles: [] as ReadonlyArray<{ path: string; maxLines: number }>,
  };
}

describe("createToolForAgent", () => {
  it("returns undefined for unknown tool name", async () => {
    const env = await makeTempEnv();
    const result = createToolForAgent({ name: "nonexistent", ...makeDefaultParams(env) });
    expect(result).toBeUndefined();
  });

  it("returns bash tool without domain wrapping", async () => {
    const env = await makeTempEnv();
    const tool = createToolForAgent({ name: "bash", ...makeDefaultParams(env) });
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("bash");
  });

  it("returns read tool with domain wrapping", async () => {
    const env = await makeTempEnv();
    const tool = createToolForAgent({ name: "read", ...makeDefaultParams(env) });
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("read");
  });

  it("blocks file read outside domain", async () => {
    const env = await makeTempEnv();
    writeFileSync(join(env.cwd, "secret.txt"), "secret");

    const tool = createToolForAgent({
      name: "read",
      ...makeDefaultParams(env),
      domain: [{ path: "src/", read: true, write: false, delete: false }],
    });

    await expect(tool!.execute("call-1", { path: "secret.txt" })).rejects.toThrow("Domain violation");

    const log = await readLog(env.logPath);
    expect(log).toContain("Domain violation");
  });

  it("allows file read within domain", async () => {
    const env = await makeTempEnv();
    writeFileSync(join(env.srcDir, "hello.txt"), "hello world");

    const tool = createToolForAgent({ name: "read", ...makeDefaultParams(env) });
    const result = await tool!.execute("call-1", { path: "src/hello.txt" });
    expect(result).toBeDefined();
  });

  it("logs domain violation to conversation log on blocked write", async () => {
    const env = await makeTempEnv();
    writeFileSync(join(env.srcDir, "existing.txt"), "data");

    const tool = createToolForAgent({
      name: "write",
      ...makeDefaultParams(env),
      domain: [{ path: "src/", read: true, write: false, delete: false }],
    });

    await expect(tool!.execute("call-1", { path: "src/existing.txt", content: "new" })).rejects.toThrow(
      "Domain violation",
    );

    const log = await readLog(env.logPath);
    expect(log).toContain("Domain violation");
    expect(log).toContain("test-agent");
  });
});
