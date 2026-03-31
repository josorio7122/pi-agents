import { z } from "zod/v4";

const VALID_TOOLS = ["read", "write", "edit", "grep", "bash", "find", "ls", "delegate"] as const;

const DomainEntrySchema = z.object({
  path: z.string().min(1),
  read: z.boolean(),
  write: z.boolean(),
  delete: z.boolean(),
});

const SkillSchema = z.object({
  path: z.string().min(1),
  when: z.string().min(1),
});

const KnowledgeFileSchema = z.object({
  path: z.string().min(1),
  description: z.string().min(1),
  updatable: z.boolean(),
  "max-lines": z.number().int().positive(),
});

export const AgentFrontmatterSchema = z.object({
  // Block 1: Identity
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.string().regex(/^.+\/.+$/),
  role: z.enum(["worker", "lead", "orchestrator"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1),
  // Block 2: Domain
  domain: z.array(DomainEntrySchema).min(1),
  // Block 3: Capabilities
  tools: z.array(z.enum(VALID_TOOLS)).min(1),
  // Block 4: Skills
  skills: z.array(SkillSchema).min(1),
  // Block 5: Knowledge
  knowledge: z.object({
    project: KnowledgeFileSchema,
    general: KnowledgeFileSchema,
  }),
  // Block 6: Conversation
  conversation: z.object({
    path: z.string().includes("{{SESSION_ID}}"),
  }),
});

export type AgentFrontmatter = z.infer<typeof AgentFrontmatterSchema>;
