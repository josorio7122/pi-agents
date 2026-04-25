import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

/**
 * Regression guard: when a frontmatter restricts `tools` to a subset (e.g.
 * `["read"]`), the active tool set passed to pi must NOT contain disallowed
 * tools. We simulate a faux model attempting to call `write` from inside the
 * mocked `prompt()`. Because pi-agents only registers the allowed tools'
 * executors, the `write` tool is simply absent — the call cannot fire and the
 * file on disk stays untouched.
 *
 * The assertion is twofold:
 *  1. The `customTools` array passed to `createAgentSession` does NOT include
 *     a tool named `write` (visibility-level enforcement, the preferred path).
 *  2. After the run, `x.txt` does not exist on disk (behavioral confirmation).
 */

type CapturedCustomTool = Readonly<{ name: string; execute?: (args: unknown) => unknown }>;
type CapturedSessionOpts = Readonly<{ customTools: ReadonlyArray<CapturedCustomTool> }>;

const captured = {
  createSession: [] as CapturedSessionOpts[],
};

vi.mock("@mariozechner/pi-coding-agent", async () => {
  const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>("@mariozechner/pi-coding-agent");
  class FakeResourceLoader {
    getSystemPrompt() {
      return "";
    }
    getExtensions() {
      return { extensions: [], errors: [], runtime: {} };
    }
    getSkills() {
      return { skills: [], diagnostics: [] };
    }
    getPrompts() {
      return { prompts: [], diagnostics: [] };
    }
    getThemes() {
      return { themes: [], diagnostics: [] };
    }
    getAgentsFiles() {
      return { agentsFiles: [] };
    }
    getAppendSystemPrompt() {
      return [];
    }
    extendResources() {}
    async reload() {}
  }
  return {
    ...actual,
    DefaultResourceLoader: FakeResourceLoader,
    createAgentSession: vi.fn().mockImplementation(async (opts: CapturedSessionOpts) => {
      captured.createSession.push(opts);
      const listeners: Array<(e: unknown) => void> = [];
      return {
        session: {
          messages: [],
          subscribe: (fn: (e: unknown) => void) => {
            listeners.push(fn);
          },
          // Faux model "attempts" to call write. If pi-agents has correctly
          // filtered the active tool set, write is not present and the call
          // is a no-op; x.txt is never created. If write leaks through, the
          // executor runs and the assertion below fails.
          prompt: async () => {
            const writeTool = opts.customTools.find((t) => t.name === "write");
            if (writeTool?.execute) {
              await writeTool.execute({ path: "x.txt", content: "leaked" });
            }
            for (const fn of listeners) fn({ type: "turn_end" });
          },
          abort: async () => {},
          dispose: () => {},
        },
      };
    }),
  };
});

vi.mock("../prompt/assembly.js", () => ({
  assembleSystemPrompt: vi.fn().mockReturnValue("MOCKED_SYSTEM_PROMPT"),
}));

vi.mock("../common/context-files.js", () => ({
  discoverContextFiles: vi.fn().mockResolvedValue([]),
}));

const fakeModel = { provider: "faux", id: "faux-model" } as unknown as Model<Api>;
const fakeRegistry = {
  find: (_provider: string, _id: string) => fakeModel,
} as unknown as ModelRegistry;

// Note: build-tools.ts is NOT mocked here — we want the real builder to run
// so we exercise the actual allow/deny filtering logic.

const { runAgent } = await import("./session.js");

describe("tool allowlist enforcement", () => {
  it("rejects a call to a disallowed tool at execution time", async () => {
    captured.createSession = [];
    const project = await makeTempProject();
    const base = makeTestAgent(project.dir);
    const agent = {
      ...base,
      frontmatter: { ...base.frontmatter, tools: ["read"], disallowedTools: [] },
    };

    const result = await runAgent({
      agentConfig: agent,
      task: "Call write tool to create x.txt",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(result.error).toBeUndefined();
    // Visibility enforcement: write must not even be registered.
    expect(captured.createSession).toHaveLength(1);
    const toolNames = (captured.createSession[0]?.customTools ?? []).map((t) => t.name);
    expect(toolNames).toContain("read");
    expect(toolNames).not.toContain("write");
    // Behavioral confirmation: nothing wrote to disk.
    expect(existsSync(join(project.dir, "x.txt"))).toBe(false);
  });

  it("blocks tools listed in disallowedTools when tools is omitted", async () => {
    captured.createSession = [];
    const project = await makeTempProject();
    const base = makeTestAgent(project.dir);
    // Omit `tools` to fall back to pi's default set (which includes `write`),
    // and rely solely on `disallowedTools` to deny `write`. This is the
    // separate enforcement path added in T2 — distinct from the allowlist.
    const { tools: _omit, ...fmWithoutTools } = base.frontmatter;
    const agent = {
      ...base,
      frontmatter: { ...fmWithoutTools, disallowedTools: ["write"] },
    };

    const result = await runAgent({
      agentConfig: agent,
      task: "Call write tool to create x.txt",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(result.error).toBeUndefined();
    // Visibility enforcement: write must not be registered even though pi's
    // default tool set would otherwise include it.
    expect(captured.createSession).toHaveLength(1);
    const toolNames = (captured.createSession[0]?.customTools ?? []).map((t) => t.name);
    expect(toolNames).toContain("read");
    expect(toolNames).not.toContain("write");
    // Behavioral confirmation: nothing wrote to disk.
    expect(existsSync(join(project.dir, "x.txt"))).toBe(false);
  });
});
