# Part 2: Frontmatter Schema & Parsing

## Goal
Define Zod schemas for all 7 blocks. Parse `.md` files into validated frontmatter + system prompt body. This is the foundation — everything depends on these types.

## Dependencies
- Part 1 (scaffolding)

## Files

### `src/schema/frontmatter.ts`
Zod schemas for each block + the combined agent config.

### `src/schema/frontmatter.test.ts`
Validate correct configs pass, invalid configs fail with clear errors.

### `src/schema/conversation.ts`
Zod schema for conversation log entries.

### `src/schema/conversation.test.ts`
Validate entry format.

## Schema Design

### Block 1: Identity
```typescript
const IdentitySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.string().min(1),
  role: z.enum(["worker", "lead", "orchestrator"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1),
});
```

### Block 2: Domain
```typescript
const DomainEntrySchema = z.object({
  path: z.string().min(1),
  read: z.boolean(),
  write: z.boolean(),
  delete: z.boolean(),
});

const DomainSchema = z.array(DomainEntrySchema).min(1);
```

### Block 3: Capabilities
```typescript
const VALID_TOOLS = ["read", "write", "edit", "grep", "bash", "find", "ls", "delegate"] as const;
const ToolsSchema = z.array(z.enum(VALID_TOOLS)).min(1);
```

### Block 4: Skills
```typescript
const SkillSchema = z.object({
  path: z.string().min(1),
  when: z.string().min(1),
});

const SkillsSchema = z.array(SkillSchema).min(1);
```

### Block 5: Knowledge
```typescript
const KnowledgeFileSchema = z.object({
  path: z.string().min(1),
  description: z.string().min(1),
  updatable: z.boolean(),
  "max-lines": z.number().int().positive(),
});

const KnowledgeSchema = z.object({
  project: KnowledgeFileSchema,
  general: KnowledgeFileSchema,
});
```

### Block 6: Conversation
```typescript
const ConversationSchema = z.object({
  path: z.string().includes("{{SESSION_ID}}"),
});
```

### Combined Agent Config
```typescript
const AgentFrontmatterSchema = z.object({
  // Block 1
  name: IdentitySchema.shape.name,
  description: IdentitySchema.shape.description,
  model: IdentitySchema.shape.model,
  role: IdentitySchema.shape.role,
  color: IdentitySchema.shape.color,
  icon: IdentitySchema.shape.icon,
  // Block 2
  domain: DomainSchema,
  // Block 3
  tools: ToolsSchema,
  // Block 4
  skills: SkillsSchema,
  // Block 5
  knowledge: KnowledgeSchema,
  // Block 6
  conversation: ConversationSchema,
});
```

The inferred type `z.infer<typeof AgentFrontmatterSchema>` becomes the canonical `AgentFrontmatter` type used everywhere.

### Conversation Entry
```typescript
const ConversationEntrySchema = z.object({
  ts: z.string(),
  from: z.string(),
  to: z.string(),
  message: z.string(),
  type: z.string().optional(),
});
```

### Role-Tool Validation
Separate pure function, not in Zod schema (cross-field validation):

```typescript
function validateRoleTools(role: Role, tools: Tool[]): string[]
// Returns array of error messages. Empty = valid.
// Worker + delegate → error
// Lead + bash → error
// Lead + edit → error
// Orchestrator + bash → error
// Orchestrator + edit → error
```

## Tests

### Happy path
- Valid worker frontmatter → parses successfully
- Valid lead frontmatter → parses successfully
- Valid orchestrator frontmatter → parses successfully

### Missing blocks
- Missing `name` → error mentioning "name"
- Missing `domain` → error mentioning "domain"
- Missing `knowledge` → error mentioning "knowledge"
- Missing `conversation` → error mentioning "conversation"
- Missing `skills` → error mentioning "skills"
- Missing `tools` → error mentioning "tools"
- Missing `color` → error mentioning "color"
- Missing `icon` → error mentioning "icon"

### Invalid values
- `role: "invalid"` → error
- `color: "not-hex"` → error
- `tools: []` (empty) → error
- `domain: []` (empty) → error
- `conversation.path` without `{{SESSION_ID}}` → error
- `knowledge.project.max-lines: -1` → error

### Role-tool validation
- Worker with `delegate` → error
- Lead with `bash` → error
- Lead with `edit` → error
- Orchestrator with `bash` → error
- Worker without `delegate` → valid
- Lead with `delegate` → valid

### Conversation entry
- Valid entry → parses
- Missing `from` → error
- Entry with optional `type` → parses

## Commit
`feat: frontmatter schema — Zod validation for all 7 agent blocks`
