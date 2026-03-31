import { describe, expect, it } from "vitest";
import { validateRoleTools } from "./validation.js";

describe("validateRoleTools", () => {
  it("accepts worker without delegate", () => {
    expect(validateRoleTools("worker", ["read", "write", "bash"])).toEqual([]);
  });

  it("rejects worker with delegate", () => {
    const errors = validateRoleTools("worker", ["read", "delegate"]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("delegate");
  });

  it("accepts lead with delegate", () => {
    expect(validateRoleTools("lead", ["read", "delegate"])).toEqual([]);
  });

  it("rejects lead with bash", () => {
    const errors = validateRoleTools("lead", ["read", "delegate", "bash"]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("bash");
  });

  it("rejects lead with edit", () => {
    const errors = validateRoleTools("lead", ["read", "delegate", "edit"]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("edit");
  });

  it("rejects orchestrator with bash", () => {
    const errors = validateRoleTools("orchestrator", ["read", "delegate", "bash"]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects orchestrator with edit", () => {
    const errors = validateRoleTools("orchestrator", ["read", "delegate", "edit"]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts orchestrator with delegate", () => {
    expect(validateRoleTools("orchestrator", ["read", "delegate"])).toEqual([]);
  });
});
