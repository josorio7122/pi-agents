type Role = "worker" | "lead" | "orchestrator";

const FORBIDDEN_TOOLS_BY_ROLE: Readonly<Record<Role, ReadonlyArray<string>>> = {
  worker: ["delegate"],
  lead: ["bash", "edit"],
  orchestrator: ["bash", "edit"],
};

const REASON_BY_ROLE: Readonly<Record<Role, string>> = {
  worker: "workers execute, they don't coordinate.",
  lead: "leads coordinate, they don't execute.",
  orchestrator: "orchestrators coordinate, they don't execute.",
};

export function validateRoleTools(role: Role, tools: readonly string[]) {
  return FORBIDDEN_TOOLS_BY_ROLE[role]
    .filter((t) => tools.includes(t))
    .map((t) => `${role === "worker" ? "Worker" : role} cannot have "${t}" — ${REASON_BY_ROLE[role]}`);
}
