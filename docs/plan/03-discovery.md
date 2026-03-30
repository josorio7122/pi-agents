# Part 3: Agent Discovery

## Goal
Scan directories for agent `.md` files, parse them into validated configs, and bootstrap empty knowledge files. Pure functions where possible — I/O at the edges.

## Dependencies
- Part 2 (schema + parsing)

## Files

### `src/discovery/parser.ts`
Parse a `.md` file string into frontmatter (YAML) + body (markdown). Uses Pi's `parseFrontmatter` utility.

### `src/discovery/parser.test.ts`
Test parsing valid agent files, files without frontmatter, files with invalid YAML.

### `src/discovery/scanner.ts`
Scan directories for `*.md` files. Returns file paths. Pure I/O — reads directory, returns strings.

### `src/discovery/scanner.test.ts`
Test with temp directories containing `.md` files, non-`.md` files, nested dirs (should not recurse).

### `src/discovery/validator.ts`
Take parsed frontmatter + body → validate with Zod schema → validate role-tool alignment → return `AgentConfig` or errors. Pure function (no I/O).

### `src/discovery/validator.test.ts`
Test valid agents pass, invalid agents fail with specific error messages. Test that system prompt body is non-empty.

### `src/discovery/bootstrap.ts`
Given a list of validated agent configs, ensure knowledge files exist. Create empty files if missing. I/O function.

### `src/discovery/bootstrap.test.ts`
Test with temp directories — files created when missing, existing files not overwritten.

## Design

### `AgentConfig` (output of discovery)
```typescript
// The validated, ready-to-use agent configuration
// Plain data object — no methods, all readonly
type AgentConfig = Readonly<{
  frontmatter: AgentFrontmatter;    // Zod-validated
  systemPrompt: string;              // Markdown body
  filePath: string;                  // Source .md file path
  source: "project" | "user";        // Where it was discovered
}>;
```

### Discovery Flow
```
1. scanDirectories(projectDir, userDir)
   → string[] (file paths)

2. For each file path:
   a. readFile(path) → string
   b. parseAgentFile(content) → { frontmatter: unknown; body: string }
   c. validateAgent(frontmatter, body) → AgentConfig | ValidationError[]

3. Project agents override user agents with same name

4. bootstrapKnowledge(agents)
   → create empty .yaml files if missing
```

### Error Handling
- File read errors → skip file, report warning
- YAML parse errors → skip file, report error with file path
- Zod validation errors → skip agent, report errors with field paths
- Role-tool validation errors → skip agent, report specific mismatch

All errors collected as `DiscoveryDiagnostic[]` — never throw during discovery.

```typescript
// Plain data — no classes, no methods
type DiscoveryDiagnostic = Readonly<{
  level: "error" | "warning";
  filePath: string;
  message: string;
}>;

type DiscoveryResult = Readonly<{
  agents: ReadonlyArray<AgentConfig>;
  diagnostics: ReadonlyArray<DiscoveryDiagnostic>;
}>;
```

## Tests

### Parser
- Valid `.md` with frontmatter + body → returns both
- `.md` without frontmatter → returns empty frontmatter, full body
- `.md` with invalid YAML → returns parse error
- Empty file → returns error

### Scanner
- Directory with 3 `.md` files → returns 3 paths
- Directory with `.md` + `.txt` + `.yaml` → returns only `.md`
- Empty directory → returns empty array
- Non-existent directory → returns empty array (no throw)

### Validator
- Valid worker config → returns AgentConfig
- Missing `domain` → returns error
- Worker + `delegate` → returns role-tool error
- Empty system prompt body → returns error

### Bootstrap
- Agent with non-existent project knowledge path → file created
- Agent with non-existent general knowledge path → file created (including parent dirs)
- Agent with existing knowledge files → files untouched (check mtime)

## Commit
`feat: agent discovery — parse, validate, and bootstrap agent .md files`
