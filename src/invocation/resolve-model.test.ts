import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { resolveModel } from "./resolve-model.js";

const fakeModel = { provider: "anthropic", id: "claude-sonnet-4-6" } as unknown as Model<Api>;

const registry = {
  find: (provider: string, id: string) =>
    provider === "anthropic" && id === "claude-sonnet-4-6" ? fakeModel : undefined,
} as unknown as ModelRegistry;

describe("resolveModel", () => {
  it("returns inherited model when fm.model is undefined", () => {
    const result = resolveModel({ fmModel: undefined, inherited: fakeModel, registry });
    expect(result).toBe(fakeModel);
  });

  it("returns inherited model when fm.model is 'inherit'", () => {
    const result = resolveModel({ fmModel: "inherit", inherited: fakeModel, registry });
    expect(result).toBe(fakeModel);
  });

  it("resolves explicit provider/name via registry", () => {
    const result = resolveModel({ fmModel: "anthropic/claude-sonnet-4-6", inherited: undefined, registry });
    expect(result).toBe(fakeModel);
  });

  it("throws with a clear message when inherit requested but no parent model", () => {
    expect(() => resolveModel({ fmModel: "inherit", inherited: undefined, registry })).toThrowError(
      /no model is active in the parent session/,
    );
    expect(() => resolveModel({ fmModel: undefined, inherited: undefined, registry })).toThrowError(
      /no model is active in the parent session/,
    );
  });

  it("throws when explicit model is not in registry", () => {
    expect(() => resolveModel({ fmModel: "unknown/xyz", inherited: undefined, registry })).toThrowError(
      /Model not found: unknown\/xyz/,
    );
  });
});
