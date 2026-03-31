type Role = "worker" | "lead" | "orchestrator";

const EXECUTION_TOOLS = ["bash", "edit"] as const;
const COORDINATION_TOOLS = ["delegate"] as const;

export function validateRoleTools(role: Role, tools: readonly string[]) {
  const errors: string[] = [];

  if (role === "worker") {
    for (const t of COORDINATION_TOOLS) {
      if (tools.includes(t)) {
        errors.push(`Worker cannot have "${t}" — workers execute, they don't coordinate.`);
      }
    }
  }

  if (role === "lead" || role === "orchestrator") {
    for (const t of EXECUTION_TOOLS) {
      if (tools.includes(t)) {
        errors.push(`${role} cannot have "${t}" — ${role}s coordinate, they don't execute.`);
      }
    }
  }

  return errors;
}
