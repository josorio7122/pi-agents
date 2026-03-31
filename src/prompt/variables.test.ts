import { describe, expect, it } from "vitest";
import { resolveVariables } from "./variables.js";

describe("resolveVariables", () => {
  it("replaces a single variable", () => {
    expect(resolveVariables("Hello {{NAME}}", { NAME: "World" })).toBe("Hello World");
  });

  it("replaces multiple occurrences of the same variable", () => {
    expect(resolveVariables("{{X}} and {{X}}", { X: "yes" })).toBe("yes and yes");
  });

  it("replaces multiple different variables", () => {
    expect(resolveVariables("{{A}} + {{B}}", { A: "1", B: "2" })).toBe("1 + 2");
  });

  it("leaves unknown variables as-is", () => {
    expect(resolveVariables("Hello {{UNKNOWN}}", { NAME: "World" })).toBe("Hello {{UNKNOWN}}");
  });

  it("replaces with empty string", () => {
    expect(resolveVariables("before {{X}} after", { X: "" })).toBe("before  after");
  });

  it("returns unchanged template when no variables", () => {
    expect(resolveVariables("no vars here", { X: "val" })).toBe("no vars here");
  });
});
