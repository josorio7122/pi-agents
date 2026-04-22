import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

// Pi's active default tool set.
// Source: @mariozechner/pi-coding-agent dist/core/sdk.js:139,
//         dist/core/system-prompt.js:48, dist/core/agent-session.js:1887.
export const PI_DEFAULT_TOOLS: readonly string[] = ["read", "bash", "edit", "write"];

export const AgentFrontmatterSchema = Type.Object(
  {
    // Identity — required
    name: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    color: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
    icon: Type.String({ minLength: 1 }),

    // Model — optional; absent / "inherit" → parent session's model; else "provider/name" pins.
    model: Type.Optional(Type.Union([Type.Literal("inherit"), Type.String({ pattern: "^.+/.+$" })])),

    // Tools — optional; absent → pi's active default.
    tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),

    // Skills — optional; absent → inherit parent's default discovery;
    //                    present (even empty) → use ONLY these paths.
    skills: Type.Optional(Type.Array(Type.String({ pattern: "^/" }), { minItems: 0 })),
  },
  { additionalProperties: false },
);

export type AgentFrontmatter = Readonly<Static<typeof AgentFrontmatterSchema>>;

export function validateFrontmatter(fm: AgentFrontmatter): string[] {
  const errors: string[] = [];
  const effectiveTools = fm.tools ?? PI_DEFAULT_TOOLS;
  const hasSkills = fm.skills !== undefined && fm.skills.length > 0;
  if (hasSkills && !effectiveTools.includes("read")) {
    errors.push(
      `Agent '${fm.name}' declares skills but has no 'read' tool. pi requires the 'read' tool for skill body loading (progressive disclosure). Add 'read' to tools or remove skills.`,
    );
  }
  return errors;
}
