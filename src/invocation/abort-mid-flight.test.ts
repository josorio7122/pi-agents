import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

/**
 * Regression guard: an in-flight `runAgent` call must terminate with a
 * cancellation error when the caller's `AbortController` fires while the
 * model/tool turn is still running. We simulate "long-running tool call" via
 * a mock `prompt()` whose returned promise only settles once `session.abort()`
 * is invoked — exactly what pi does internally when an abort signal fires.
 */

// Track dispose() calls on the fake session so the test can prove the abort
// catch path releases pi's internal resources.
const disposeSpy = vi.fn();

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
    createAgentSession: vi.fn().mockImplementation(async () => {
      let rejectPrompt: ((err: Error) => void) | undefined;
      const promptPromise = new Promise<void>((_, reject) => {
        rejectPrompt = reject;
      });
      // Swallow the "unhandled rejection" warning before any consumer awaits.
      promptPromise.catch(() => {});
      return {
        session: {
          messages: [],
          subscribe: () => {},
          // Never resolves on its own — only settles when abort() is called.
          prompt: () => promptPromise,
          abort: async () => {
            rejectPrompt?.(new Error("aborted"));
          },
          dispose: disposeSpy,
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

vi.mock("./build-tools.js", () => ({
  buildAgentTools: vi.fn().mockImplementation((params: { tools?: ReadonlyArray<string>; cwd: string }) => {
    const names = params.tools ?? ["read", "bash", "edit", "write"];
    return {
      builtinTools: names.map((name) => ({ name })),
      customTools: [],
    };
  }),
}));

const fakeModel = { provider: "faux", id: "faux-model" } as unknown as Model<Api>;
const fakeRegistry = {
  find: (_provider: string, _id: string) => fakeModel,
} as unknown as ModelRegistry;

const { runAgent } = await import("./session.js");

describe("abort mid-flight", () => {
  it("aborts during a long-running tool call", async () => {
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);
    const controller = new AbortController();

    disposeSpy.mockClear();
    const promise = runAgent({
      agentConfig: agent,
      task: "Run `bash` tool with command `sleep 30`",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
      signal: controller.signal,
    });

    // Fire abort after a short, deterministic tick — the mock prompt is hung
    // on a promise that only settles when session.abort() is called, so this
    // is the only way the run can terminate.
    setTimeout(() => controller.abort(), 50);
    const result = await promise;
    expect(result.error).toMatch(/cancel|abort/i);
    expect(result.output).toBe("");
    // Regression guard: catch path must dispose the session, not leak it.
    // Disk-backed SessionManager.create() means a missed dispose strands
    // unflushed transcripts on disk.
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  }, 5_000);
});
