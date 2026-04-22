import { describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "./assembly.js";

const baseConfig = {
  frontmatter: {
    name: "scout",
    description: "test",
    color: "#ff0000",
    icon: "🔍",
  },
  systemPrompt: "Hello {{SESSION_DIR}}.",
  filePath: "/abs/scout.md",
  source: "project" as const,
};

const baseCtx = {
  agentConfig: baseConfig,
  sessionDir: "/tmp/session",
};

describe("assembleSystemPrompt", () => {
  it("substitutes SESSION_DIR in the body", () => {
    const out = assembleSystemPrompt(baseCtx as never);
    expect(out).toContain("Hello /tmp/session.");
  });

  it("substitutes extraVariables in the body", () => {
    const out = assembleSystemPrompt({
      ...baseCtx,
      agentConfig: { ...baseConfig, systemPrompt: "Team={{TEAM}}." },
      extraVariables: { TEAM: "alpha" },
    } as never);
    expect(out).toContain("Team=alpha.");
  });

  it("renders shared context section when files provided", () => {
    const out = assembleSystemPrompt({
      ...baseCtx,
      sharedContextContents: [{ path: "/abs/CONTEXT.md", content: "shared" }],
    } as never);
    expect(out).toContain("## Shared Context");
    expect(out).toContain("### /abs/CONTEXT.md");
    expect(out).toContain("shared");
  });

  it("omits shared context section when absent", () => {
    const out = assembleSystemPrompt(baseCtx as never);
    expect(out).not.toContain("## Shared Context");
  });

  it("omits shared context section when empty array", () => {
    const out = assembleSystemPrompt({ ...baseCtx, sharedContextContents: [] } as never);
    expect(out).not.toContain("## Shared Context");
  });

  it("contains no '## Skills' section (pi injects skill XML downstream)", () => {
    const out = assembleSystemPrompt(baseCtx as never);
    expect(out).not.toContain("## Skills");
  });
});
