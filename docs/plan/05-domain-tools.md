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
// Agent owns its knowledge — readable + writable only if updatable
const implicitDomain = knowledgeEntries
  .filter(e => e.updatable)
  .map(e => ({
    path: expandPath(e.path),
    read: true,
    write: true,
    delete: false,
  }));
// Non-updatable knowledge is read-only
const readOnlyKnowledge = knowledgeEntries
  .filter(e => !e.updatable)
  .map(e => ({
    path: expandPath(e.path),
    read: true,
    write: false,
    delete: false,
  }));
const fullDomain = [...domain, ...implicitDomain, ...readOnlyKnowledge];
```

For each tool in the agent's `tools` list:
1. If `bash` → use `createBashTool(cwd)` directly (no domain wrapping)
2. If file tool → use Pi's factory (`createReadTool(cwd)`, etc.) and wrap `execute`:
   - Before executing, call `checkDomain` on the path argument
   - If blocked → throw error with clear message (the LLM sees this)
   - If allowed → delegate to original tool's `execute`

### Domain Error Format
When an operation is blocked, two things happen:

1. **Log it** — append a system message to conversation.jsonl (the extension always writes, regardless of mode)
2. **Throw it** — return an error the agent LLM can understand

```typescript
// 1. Write to conversation log (always — for observability/audit)
appendToLog(conversationLogPath, {
  ts: new Date().toISOString(),
  from: "system",
  to: agentName,
  message: `Domain violation: write not permitted on apps/frontend/index.tsx`,
  type: "system",
});

// 2. Throw error for the agent
throw new Error(
  `Domain violation: write not permitted on apps/frontend/index.tsx\n` +
  `Agent "backend-dev" can only write to: apps/backend/`
);
```

The `conversationLogPath` is passed into `createScopedTools` so domain errors can be logged.

```typescript
function createScopedTools(params: {
  cwd: string;
  tools: readonly string[];
  domain: readonly DomainEntry[];
  knowledgeEntries: readonly KnowledgeEntry[];
  conversationLogPath: string;  // For logging domain violations
  agentName: string;            // For log entry "to" field
}): ToolDefinition[]
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
- `read` tool with forbidden path → returns domain error + logs to conversation
- `write` tool with read-only domain → returns domain error + logs to conversation
- `bash` tool → always passes (no domain check)
- Only tools listed in agent's `tools` array are created (no extras)
- `write` to project knowledge path → allowed (implicit domain)
- `write` to general knowledge path → allowed (implicit domain)
- `write` to random unlisted path → blocked + logged
- Domain violation → conversation.jsonl has system message entry

### Knowledge File Size Enforcement

When the agent writes to a knowledge file (project or general), the extension checks the line count after the write completes. If it exceeds `max-lines`, truncate from the top (oldest entries removed first).

```typescript
// After a successful write to a knowledge file path:
function enforceMaxLines(params: {
  filePath: string;
  maxLines: number;
  conversationLogPath: string;
  agentName: string;
}): void
// 1. Read file, count lines
// 2. If lines <= maxLines → do nothing
// 3. If lines > maxLines → keep last maxLines lines, write back
// 4. Log to conversation: "Knowledge file truncated (12000 → 10000 lines)"
```

This is a post-write hook on the `write` tool wrapper. The agent's write succeeds, then the extension trims if needed.

**Why truncate from the top?** Oldest entries are least relevant. The agent's most recent learnings (at the bottom) are the highest signal. This matches the `mental-model.md` skill's instruction: "update stale entries, don't just append" — but if the agent fails to prune, the extension does it.

### Tests for max-lines enforcement
- Knowledge file with 100 lines, max-lines 10000 → untouched
- Knowledge file with 12000 lines, max-lines 10000 → truncated to 10000, system message logged
- Non-knowledge file write → no line check (only knowledge paths)
- Truncation preserves last N lines (not first N)

## Commit
`feat: domain-scoped tools — enforce file-system boundaries and knowledge size limits`
