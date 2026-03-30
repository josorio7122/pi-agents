# Part 4: Prompt Assembly

## Goal
Given an `AgentConfig` and runtime context, assemble the complete system prompt. Read skill files, knowledge files, conversation log. Resolve all `{{VARIABLES}}`. Output a single string ready for `createAgentSession`.

## Dependencies
- Part 2 (schema — `AgentFrontmatter` type)

## Files

### `src/prompt/variables.ts`
Pure function: takes a template string + variable map → returns resolved string.

### `src/prompt/variables.test.ts`
Test variable substitution, missing variables, multiple occurrences.

### `src/prompt/assembly.ts`
Orchestrates the full assembly: reads files from disk, resolves variables, produces final prompt.

### `src/prompt/assembly.test.ts`
Test with fixture files — skills, knowledge, conversation log. Test that all blocks are present in output.

## Design

### Variable Resolution (Pure)
```typescript
function resolveVariables(template: string, variables: Record<string, string>): string
// Replaces all {{KEY}} with values from the map.
// Unknown variables are left as-is (not stripped).
```

### Variables Map
| Variable | Source |
|----------|--------|
| `{{SESSION_DIR}}` | Runtime: session directory path |
| `{{CONVERSATION_LOG}}` | File content: conversation.jsonl (full text) |
| `{{DOMAIN_BLOCK}}` | Serialized: agent's domain rules as YAML |
| `{{KNOWLEDGE_BLOCK}}` | Serialized: agent's knowledge config as YAML |
| `{{SKILLS_BLOCK}}` | Serialized: agent's skill references as YAML |
| `{{TEAM_BLOCK}}` | Empty string (no teams in pi-agents scope) |

### Assembly Flow (I/O)
```typescript
interface AssemblyContext {
  readonly agentConfig: AgentConfig;
  readonly sessionDir: string;
  readonly conversationLogContent: string;  // Pre-read by caller
}

function assembleSystemPrompt(ctx: AssemblyContext): Promise<string>
```

Steps:
1. Read each skill `.md` file from `skills[].path`
2. Read project knowledge `.yaml` from `knowledge.project.path`
3. Read general knowledge `.yaml` from `knowledge.general.path`
4. Build variable map:
   - `SESSION_DIR` → `ctx.sessionDir`
   - `CONVERSATION_LOG` → `ctx.conversationLogContent`
   - `DOMAIN_BLOCK` → serialize `domain` array as YAML
   - `KNOWLEDGE_BLOCK` → serialize `knowledge` config as YAML
   - `SKILLS_BLOCK` → serialize `skills` array as YAML
   - `TEAM_BLOCK` → `""` (empty for now)
5. Resolve variables in system prompt body
6. Append skill contents after the resolved body
7. Append knowledge file contents as context
8. Return final assembled string

### Output Structure
```
[System prompt body with resolved {{VARIABLES}}]

---

## Skills

### mental-model (Read at task start. Update knowledge after completing work.)
[content of mental-model.md]

### active-listener (Always. Read conversation log before every response.)
[content of active-listener.md]

---

## Project Knowledge
[content of .pi/knowledge/backend-dev.yaml]

## General Knowledge
[content of ~/.pi/agent/general/backend-dev.yaml]
```

## Tests

### Variable resolution
- Single variable → replaced
- Multiple occurrences of same variable → all replaced
- Unknown variable → left as `{{UNKNOWN}}`
- Empty variable value → replaced with empty string
- No variables in template → returned unchanged

### Assembly
- Agent with 2 skills → both skill contents in output
- Agent with empty knowledge files → sections present but empty
- Agent with populated knowledge → content included
- Conversation log content → injected into `{{CONVERSATION_LOG}}`
- All `{{VARIABLES}}` resolved (no raw `{{...}}` in output except unknowns)
- Missing skill file → error reported, assembly continues with available skills

## Commit
`feat: prompt assembly — resolve variables, inject skills and knowledge`
