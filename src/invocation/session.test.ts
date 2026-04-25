import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../discovery/validator.js";
import { makeTempProject, makeTestAgent } from "./session-test-helpers.js";

/**
 * Captures for assertions — populated by the mock factories below.
 */
type ResourceLoaderCall = Readonly<{
  cwd: string;
  agentDir: string;
  systemPrompt?: string;
  additionalSkillPaths?: ReadonlyArray<string>;
  noSkills?: boolean;
  noExtensions?: boolean;
  noPromptTemplates?: boolean;
  noThemes?: boolean;
  noContextFiles?: boolean;
}>;

type CreateSessionCall = Readonly<{
  cwd: string;
  model: Model<Api>;
  tools: ReadonlyArray<string>;
  customTools: ReadonlyArray<{ readonly name: string }>;
  sessionManager: {
    appendMessage: (message: unknown) => string;
  };
}>;

const captured = {
  resourceLoader: [] as ResourceLoaderCall[],
  createSession: [] as CreateSessionCall[],
};

vi.mock("@mariozechner/pi-coding-agent", async () => {
  const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>("@mariozechner/pi-coding-agent");
  class FakeResourceLoader {
    constructor(opts: ResourceLoaderCall) {
      captured.resourceLoader.push(opts);
    }
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
    createAgentSession: vi.fn().mockImplementation(async (opts: CreateSessionCall) => {
      captured.createSession.push(opts);
      const listeners: Array<(e: unknown) => void> = [];
      const assistantMessage = {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "mocked assistant reply" }],
        api: "anthropic",
        provider: "faux",
        model: "faux-model",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop" as const,
        timestamp: Date.now(),
      };
      return {
        session: {
          messages: [assistantMessage],
          subscribe: (fn: (e: unknown) => void) => {
            listeners.push(fn);
          },
          prompt: async () => {
            // Drive the real SessionManager so it persists the JSONL transcript.
            opts.sessionManager.appendMessage(assistantMessage);
            // Emit a turn_end so listeners (e.g. the maxTurns cap in session.ts)
            // observe at least one turn even though we resolve cleanly.
            for (const fn of listeners) fn({ type: "turn_end" });
          },
          abort: async () => {},
          dispose: () => {},
        },
      };
    }),
  };
});

// Keep assembly deterministic — the agent config here no longer has old frontmatter fields,
// so the current assembly implementation (which still references them) would throw. Stub it.
vi.mock("../prompt/assembly.js", () => ({
  assembleSystemPrompt: vi.fn().mockReturnValue("MOCKED_SYSTEM_PROMPT"),
}));

// Avoid filesystem-dependent context-file discovery.
vi.mock("../common/context-files.js", () => ({
  discoverContextFiles: vi.fn().mockResolvedValue([]),
}));
const { discoverContextFiles } = await import("../common/context-files.js");

// Stub build-tools to avoid pulling real pi tool factories during unit tests.
vi.mock("./build-tools.js", () => ({
  buildAgentTools: vi.fn().mockImplementation((params: { tools?: ReadonlyArray<string>; cwd: string }) => {
    const names = params.tools ?? ["read", "bash", "edit", "write"];
    return {
      builtinTools: names.map((name) => ({ name })),
      customTools: [],
    };
  }),
}));

// Worktree mocks — let the test assert call shape and toggle clean/dirty.
const worktreeState = {
  createCalls: [] as Array<{ repoDir: string; id: string }>,
  removeCalls: [] as Array<{ path: string; branch: string; repoDir: string }>,
  // When true, removeWorktreeIfClean reports clean (returns true). Default true.
  clean: true,
  // When set, createWorktree throws this error on next invocation.
  createThrows: undefined as Error | undefined,
};
vi.mock("./worktree.js", () => ({
  createWorktree: vi.fn(async (params: { repoDir: string; id: string }) => {
    worktreeState.createCalls.push(params);
    if (worktreeState.createThrows) throw worktreeState.createThrows;
    return {
      path: `${params.repoDir}/worktrees/${params.id}`,
      branch: `pi-agents/${params.id}`,
      repoDir: params.repoDir,
    };
  }),
  removeWorktreeIfClean: vi.fn(async (wt: { path: string; branch: string; repoDir: string }) => {
    worktreeState.removeCalls.push(wt);
    return worktreeState.clean;
  }),
}));

const fakeModel = { provider: "faux", id: "faux-model" } as unknown as Model<Api>;
const fakeRegistry = {
  find: (_provider: string, _id: string) => fakeModel,
} as unknown as ModelRegistry;

// Import after mocks are registered.
const { runAgent } = await import("./session.js");

function withSkills(agent: AgentConfig, skills: ReadonlyArray<string> | undefined): AgentConfig {
  const next = { ...agent.frontmatter } as Record<string, unknown>;
  if (skills === undefined) {
    delete next.skills;
  } else {
    next.skills = [...skills];
  }
  return { ...agent, frontmatter: next as AgentConfig["frontmatter"] };
}

function withTools(agent: AgentConfig, tools: ReadonlyArray<string> | undefined): AgentConfig {
  const next = { ...agent.frontmatter } as Record<string, unknown>;
  if (tools === undefined) {
    delete next.tools;
  } else {
    next.tools = [...tools];
  }
  return { ...agent, frontmatter: next as AgentConfig["frontmatter"] };
}

function withModel(agent: AgentConfig, model: string | undefined): AgentConfig {
  const next = { ...agent.frontmatter } as Record<string, unknown>;
  if (model === undefined) {
    delete next.model;
  } else {
    next.model = model;
  }
  return { ...agent, frontmatter: next as AgentConfig["frontmatter"] };
}

function withMaxTurns(agent: AgentConfig, value: number | undefined): AgentConfig {
  const next = { ...agent.frontmatter } as Record<string, unknown>;
  if (value === undefined) {
    delete next.maxTurns;
  } else {
    next.maxTurns = value;
  }
  return { ...agent, frontmatter: next as AgentConfig["frontmatter"] };
}

function withInheritContextFiles(agent: AgentConfig, value: boolean | undefined): AgentConfig {
  const next = { ...agent.frontmatter } as Record<string, unknown>;
  if (value === undefined) {
    delete next.inheritContextFiles;
  } else {
    next.inheritContextFiles = value;
  }
  return { ...agent, frontmatter: next as AgentConfig["frontmatter"] };
}

function withIsolation(agent: AgentConfig, value: "worktree" | undefined): AgentConfig {
  const next = { ...agent.frontmatter } as Record<string, unknown>;
  if (value === undefined) {
    delete next.isolation;
  } else {
    next.isolation = value;
  }
  return { ...agent, frontmatter: next as AgentConfig["frontmatter"] };
}

describe("runAgent (resourceLoader + model resolution)", () => {
  beforeEach(() => {
    captured.resourceLoader = [];
    captured.createSession = [];
    worktreeState.createCalls = [];
    worktreeState.removeCalls = [];
    worktreeState.clean = true;
    worktreeState.createThrows = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes fm.skills as additionalSkillPaths with noSkills=true", async () => {
    const project = await makeTempProject();
    const agent = withSkills(makeTestAgent(project.dir), ["/abs/a"]);

    const result = await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(result.error).toBeUndefined();
    expect(captured.resourceLoader).toHaveLength(1);
    const opts = captured.resourceLoader[0];
    expect(opts?.additionalSkillPaths).toEqual(["/abs/a"]);
    expect(opts?.noSkills).toBe(true);
  });

  it("omits additionalSkillPaths and sets noSkills=false when fm.skills is undefined", async () => {
    const project = await makeTempProject();
    const agent = withSkills(makeTestAgent(project.dir), undefined);

    await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(captured.resourceLoader).toHaveLength(1);
    const opts = captured.resourceLoader[0];
    expect(opts?.additionalSkillPaths).toBeUndefined();
    expect(opts?.noSkills).toBe(false);
  });

  it("activates pi's default tool set (read/bash/edit/write) when fm.tools is undefined", async () => {
    const project = await makeTempProject();
    const agent = withTools(makeTestAgent(project.dir), undefined);

    await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(captured.createSession).toHaveLength(1);
    const toolNames = captured.createSession[0]?.tools ?? [];
    expect(toolNames).toEqual(expect.arrayContaining(["read", "bash", "edit", "write"]));
  });

  it("dispatches with inheritedModel when fm.model is 'inherit'", async () => {
    const project = await makeTempProject();
    const agent = withModel(makeTestAgent(project.dir), "inherit");
    const inheritedModel = { provider: "parent", id: "parent-model" } as unknown as Model<Api>;

    await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      inheritedModel,
    });

    expect(captured.createSession).toHaveLength(1);
    expect(captured.createSession[0]?.model).toBe(inheritedModel);
  });

  it("returns an error when fm.model is 'inherit' and no inheritedModel is provided", async () => {
    const project = await makeTempProject();
    const agent = withModel(makeTestAgent(project.dir), "inherit");

    const result = await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
    });

    expect(result.error).toContain("no model is active");
    expect(captured.createSession).toHaveLength(0);
  });

  it("skips discoverContextFiles when fm.inheritContextFiles === false", async () => {
    const project = await makeTempProject();
    const agent = withInheritContextFiles(makeTestAgent(project.dir), false);

    await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(discoverContextFiles).not.toHaveBeenCalled();
  });

  it("calls discoverContextFiles when fm.inheritContextFiles is undefined", async () => {
    const project = await makeTempProject();
    const agent = withInheritContextFiles(makeTestAgent(project.dir), undefined);

    await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(discoverContextFiles).toHaveBeenCalled();
  });

  it("returns a maxTurns error when the cap fires but session.prompt resolves cleanly", async () => {
    const project = await makeTempProject();
    // Mocked prompt emits one turn_end then resolves without throwing.
    // With maxTurns=1 the cap triggers session.abort() but prompt still resolves —
    // exercises the happy-path branch that previously dropped the error.
    const agent = withMaxTurns(makeTestAgent(project.dir), 1);

    const result = await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(result.error).toBeDefined();
    expect(result.error).toContain("maxTurns");
    expect(result.error).toContain("1");
  });

  it("writes a JSONL transcript per agent run under sessionDir/agents/<id>/", async () => {
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);

    await runAgent({
      agentConfig: agent,
      task: "say hi",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    const agentsDir = join(project.sessionsDir, "agents");
    expect(existsSync(agentsDir)).toBe(true);
    const dirs = readdirSync(agentsDir);
    expect(dirs.length).toBe(1);
    const files = readdirSync(join(agentsDir, dirs[0]!));
    expect(files.some((f) => f.endsWith(".jsonl"))).toBe(true);
  });

  it("does not invoke worktree helpers when isolation is unset", async () => {
    const project = await makeTempProject();
    const agent = makeTestAgent(project.dir);

    await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(worktreeState.createCalls).toHaveLength(0);
    expect(worktreeState.removeCalls).toHaveLength(0);
  });

  it("creates a worktree and uses its path as the effective cwd when isolation: worktree", async () => {
    const project = await makeTempProject();
    const agent = withIsolation(makeTestAgent(project.dir), "worktree");

    await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(worktreeState.createCalls).toHaveLength(1);
    expect(worktreeState.createCalls[0]?.repoDir).toBe(project.dir);
    expect(worktreeState.createCalls[0]?.id).toBeTruthy();

    // Effective cwd flows into resourceLoader and createAgentSession.
    const expectedPath = `${project.dir}/worktrees/${worktreeState.createCalls[0]?.id}`;
    expect(captured.resourceLoader[0]?.cwd).toBe(expectedPath);
    expect(captured.createSession[0]?.cwd).toBe(expectedPath);
  });

  it("removes worktree on clean exit; result has no worktree field", async () => {
    const project = await makeTempProject();
    const agent = withIsolation(makeTestAgent(project.dir), "worktree");
    worktreeState.clean = true;

    const result = await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(worktreeState.removeCalls).toHaveLength(1);
    expect(result.worktree).toBeUndefined();
  });

  it("returns a worktree-creation error when createWorktree throws (no unhandled rejection)", async () => {
    const project = await makeTempProject();
    const agent = withIsolation(makeTestAgent(project.dir), "worktree");
    worktreeState.createThrows = new Error("not in a git repo");

    const result = await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(result.output).toBe("");
    expect(result.error).toBeDefined();
    expect(result.error).toContain("worktree creation failed");
    // Session was never created — failure short-circuits before createAgentSession.
    expect(captured.createSession).toHaveLength(0);
    expect(worktreeState.removeCalls).toHaveLength(0);
  });

  it("preserves worktree on dirty exit; result.worktree carries path + branch", async () => {
    const project = await makeTempProject();
    const agent = withIsolation(makeTestAgent(project.dir), "worktree");
    worktreeState.clean = false;

    const result = await runAgent({
      agentConfig: agent,
      task: "Do it",
      cwd: project.dir,
      sessionDir: project.sessionsDir,
      modelRegistry: fakeRegistry,
      modelOverride: fakeModel,
    });

    expect(worktreeState.removeCalls).toHaveLength(1);
    expect(result.worktree).toBeDefined();
    expect(result.worktree?.path).toBe(`${project.dir}/worktrees/${worktreeState.createCalls[0]?.id}`);
    expect(result.worktree?.branch).toBe(`pi-agents/${worktreeState.createCalls[0]?.id}`);
  });
});
