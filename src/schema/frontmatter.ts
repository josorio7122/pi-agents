import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

const DomainEntrySchema = Type.Object({
  path: Type.String({ minLength: 1 }),
  read: Type.Boolean(),
  write: Type.Boolean(),
  delete: Type.Boolean(),
});

const SkillSchema = Type.Object({
  path: Type.String({ minLength: 1 }),
  when: Type.String({ minLength: 1 }),
});

const KnowledgeFileSchema = Type.Object({
  path: Type.String({ minLength: 1 }),
  description: Type.String({ minLength: 1 }),
  updatable: Type.Boolean(),
  "max-lines": Type.Integer({ minimum: 1 }),
});

export const AgentFrontmatterSchema = Type.Object({
  // Block 1: Identity
  name: Type.String({ minLength: 1 }),
  description: Type.String({ minLength: 1 }),
  model: Type.String({ pattern: "^.+/.+$" }),
  // Use Type.Union(Type.Literal) rather than StringEnum because this schema
  // is validated locally with Value.Check; StringEnum is a Type.Unsafe shim
  // for LLM-provider JSON Schema compatibility and is not runtime-checkable.
  role: Type.Union([Type.Literal("worker"), Type.Literal("lead"), Type.Literal("orchestrator")]),
  color: Type.String({ pattern: "^#[0-9a-fA-F]{6}$" }),
  icon: Type.String({ minLength: 1 }),
  // Block 2: Domain
  domain: Type.Array(DomainEntrySchema, { minItems: 1 }),
  // Block 3: Capabilities
  tools: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  // Block 4: Skills
  skills: Type.Array(SkillSchema, { minItems: 1 }),
  // Block 5: Knowledge
  knowledge: Type.Object({
    project: KnowledgeFileSchema,
    general: KnowledgeFileSchema,
  }),
  // Block 6: Reports (optional — only for agents that produce report artifacts)
  reports: Type.Optional(
    Type.Object({
      path: Type.String({ minLength: 1 }),
      updatable: Type.Boolean(),
    }),
  ),
  // Block 7: Conversation
  conversation: Type.Object({
    path: Type.String({ pattern: ".*\\{\\{SESSION_ID\\}\\}.*" }),
  }),
});

export type AgentFrontmatter = Readonly<Static<typeof AgentFrontmatterSchema>>;
