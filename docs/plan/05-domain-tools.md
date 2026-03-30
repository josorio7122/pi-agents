# Part 5: Domain-Scoped Tools

## Goal
Wrap Pi's tool factory functions with domain permission checks. An agent only gets tools that respect its `domain` block. File-accessing tools are scoped — bash is passed through.

## Dependencies
- Part 2 (schema — `DomainEntry` type)

## Files

### `src/domain/checker.ts`
Pure function: given a file path and domain rules, return whether the operation is allowed.

### `src/domain/checker.test.ts`
Test read/write/delete permissions across various path combinations.

### `src/domain/scoped-tools.ts`
Create Pi tools (using `createReadTool`, etc.) wrapped with domain checks.

### `src/domain/scoped-tools.test.ts`
Test that domain-violating operations are blocked, permitted operations pass through.

## Design

### Domain Checker (Pure)
```typescript
type Operation = "read" | "write" | "delete";

interface DomainEntry {
  readonly path: string;
  readonly read: boolean;
  readonly write: boolean;
  readonly delete: boolean;
}

function checkDomain(params: {
  filePath: string;
  operation: Operation;
  domain: readonly DomainEntry[];
  cwd: string;
}): { allowed: true } | { allowed: false; reason: string }
```

Rules:
1. Resolve `filePath` to absolute path relative to `cwd`
2. Find the most specific `domain` entry that matches (longest prefix)
3. If no entry matches → `{ allowed: false, reason: "path not in agent domain" }`
4. If entry found but operation not permitted → `{ allowed: false, reason: "write not permitted on ..." }`
5. If permitted → `{ allowed: true }`

### Tool-Operation Mapping
| Tool | Operation Checked |
|------|------------------|
| `read` | `read` on `path` argument |
| `write` | `write` on `path` argument |
| `edit` | `write` on `path` argument |
| `grep` | `read` on `path` argument |
| `find` | `read` on `path` argument |
| `ls` | `read` on `path` argument |
| `bash` | Not domain-checked (shell commands can't be statically analyzed) |

### Scoped Tool Factory
```typescript
function createScopedTools(params: {
  cwd: string;
  tools: readonly string[];
  domain: readonly DomainEntry[];
  knowledgePaths: readonly string[];  // Project + general knowledge paths (auto-writable)
}): ToolDefinition[]
```

Before checking domain, inject implicit entries for knowledge files:
```typescript
// Agent owns its knowledge — always readable + writable
const implicitDomain = knowledgePaths.map(p => ({
  path: expandPath(p),
  read: true,
  write: true,
  delete: false,
}));
const fullDomain = [...domain, ...implicitDomain];
```

For each tool in the agent's `tools` list:
1. If `bash` → use `createBashTool(cwd)` directly (no domain wrapping)
2. If file tool → use Pi's factory (`createReadTool(cwd)`, etc.) and wrap `execute`:
   - Before executing, call `checkDomain` on the path argument
   - If blocked → throw error with clear message (the LLM sees this)
   - If allowed → delegate to original tool's `execute`

### Domain Error Format
When an operation is blocked, the tool returns an error the LLM can understand:

```
Domain violation: write not permitted on apps/frontend/index.tsx
Agent "backend-dev" can only write to: apps/backend/
```

## Tests

### Checker
- Path inside permitted domain → allowed
- Path outside all domains → not allowed
- Read on read-only domain → allowed
- Write on read-only domain → not allowed
- Delete on no-delete domain → not allowed
- Nested path matching (most specific wins): `/apps/backend/src/` matches `/apps/backend/`
- Relative path resolved to absolute before checking
- Trailing slash normalization

### Scoped tools
- `read` tool with valid path → executes normally
- `read` tool with forbidden path → returns domain error
- `write` tool with read-only domain → returns domain error
- `bash` tool → always passes (no domain check)
- Only tools listed in agent's `tools` array are created (no extras)
- `write` to project knowledge path → allowed (implicit domain)
- `write` to general knowledge path → allowed (implicit domain)
- `write` to random unlisted path → blocked

## Commit
`feat: domain-scoped tools — enforce file-system boundaries per agent`
