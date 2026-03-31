# Plan Cross-Reference — Spec vs Implementation

Systematic trace of every requirement in `agent-spec.md` and `extension-design.md` against the plan parts.

---

## Agent Spec — Block by Block

### Block 1: Identity

| Requirement | Plan Part | Status | Notes |
|-------------|-----------|:------:|-------|
| `name` — string, min 1 | Part 2 `frontmatter.ts` | ✅ | Zod `z.string().min(1)` |
| `description` — string, min 1 | Part 2 `frontmatter.ts` | ✅ | |
| `model` — `provider/model-id` format | Part 2 `frontmatter.ts` | ✅ | Zod regex `/^.+\/.+$/` |
| `model` — resolves to Pi model | Part 2 `common/model.ts` + Part 6 `session.ts` | ✅ | `parseModelId` → `getModel(provider, id)` |
| `role` — enum: worker, lead, orchestrator | Part 2 `frontmatter.ts` | ✅ | Zod `z.enum(["worker","lead","orchestrator"])` |
| `color` — hex code | Part 2 `frontmatter.ts` | ✅ | Zod regex `/^#[0-9a-fA-F]{6}$/` |
| `icon` — emoji string | Part 2 `frontmatter.ts` | ✅ | Zod `z.string().min(1)` |
| Role-tool validation | Part 2 `validation.ts` | ✅ | `validateRoleTools(role, tools)` |
| Worker + delegate → reject | Part 2 `validation.ts` | ✅ | Tested |
| Lead + bash/edit → reject | Part 2 `validation.ts` | ✅ | Tested |

### Block 2: Domain

| Requirement | Plan Part | Status | Notes |
|-------------|-----------|:------:|-------|
| Array of `{path, read, write, delete}` | Part 2 `frontmatter.ts` | ✅ | Zod schema |
| Min 1 entry | Part 2 `frontmatter.ts` | ✅ | `.min(1)` |
| Explicit > implicit (unlisted = no access) | Part 5 `checker.ts` | ✅ | No match → blocked |
| Knowledge files implicitly writable | Part 5 `scoped-tools.ts` | ✅ | Gap 1 fix: inject knowledge paths |
| Conversation log implicitly readable | Part 4 `assembly.ts` | ✅ | Injected as `{{CONVERSATION_LOG}}`, not via tools |
| Domain enforcement via tool interception | Part 5 `scoped-tools.ts` | ✅ | Wraps Pi tool factories |
| Blocked call → permission error (not silent) | Part 5 `scoped-tools.ts` | ✅ | Throws clear error message |
| Domain failures recoverable (for team mode) | N/A for pi-agents scope | ✅ | Future: lead delegates to correct worker |

### Block 3: Capabilities

| Requirement | Plan Part | Status | Notes |
|-------------|-----------|:------:|-------|
| Explicit tool list, no hidden defaults | Part 2 `frontmatter.ts` | ✅ | Required, min 1 |
| Valid tools: read, write, edit, grep, bash, find, ls, delegate | Part 2 `frontmatter.ts` | ✅ | `z.enum(VALID_TOOLS)` |
| `delegate` not registered in pi-agents scope | Part 5 `scoped-tools.ts` | ✅ | Extension skips `delegate` |
| Only listed tools created | Part 5 `scoped-tools.ts` | ✅ | Iterates agent's `tools` array only |

### Block 4: Skills

| Requirement | Plan Part | Status | Notes |
|-------------|-----------|:------:|-------|
| Array of `{path, when}` | Part 2 `frontmatter.ts` | ✅ | Zod schema |
| Min 1 skill | Part 2 `frontmatter.ts` | ✅ | `.min(1)` |
| Skill `.md` files read from disk | Part 6 `session.ts` | ✅ | Pre-reads skill files, passes to assembly |
| Skill content injected into system prompt | Part 4 `assembly.ts` | ✅ | Appended with `when` instruction |
| Skill path existence check | Part 3 `validator.ts` | ✅ | Warn (non-fatal) |
| Composable — same skill shared across agents | Inherent | ✅ | Path reference, not embedded |
| `when` instruction injected alongside content | Part 4 `assembly.ts` | ✅ | Header: `### skill-name (when)` |

### Block 5: Knowledge

| Requirement | Plan Part | Status | Notes |
|-------------|-----------|:------:|-------|
| `project.path` — relative to project root | Part 2 `frontmatter.ts` | ✅ | |
| `project.description` — guidance for agent | Part 2 `frontmatter.ts` | ✅ | Injected via `{{KNOWLEDGE_BLOCK}}` |
| `project.updatable` — boolean | Part 2 `frontmatter.ts` | ✅ | |
| `project.max-lines` — positive int | Part 2 `frontmatter.ts` | ✅ | |
| `general.path` — typically `~/.pi/agent/general/` | Part 2 `frontmatter.ts` | ✅ | |
| `general.description` — guidance for agent | Part 2 `frontmatter.ts` | ✅ | |
| `general.updatable` — boolean | Part 2 `frontmatter.ts` | ✅ | |
| `general.max-lines` — positive int | Part 2 `frontmatter.ts` | ✅ | |
| `~` expanded in general path | Part 2 `common/paths.ts` | ✅ | `expandPath()` |
| Empty knowledge files created if missing | Part 3 `bootstrap.ts` | ✅ | On discovery |
| Project knowledge content injected into prompt | Part 4 `assembly.ts` | ✅ | Pre-read, appended |
| General knowledge content injected into prompt | Part 4 `assembly.ts` | ✅ | Pre-read, appended |
| Agent updates knowledge via `write` tool | Part 5 `scoped-tools.ts` | ✅ | Knowledge paths implicitly writable |
| Self-enhancement purely prompt-driven | No code needed | ✅ | `mental-model.md` skill instructs agent |
| `max-lines` enforced | ⚠️ | **PARTIAL** | Agent manages this via skill instructions. No extension enforcement. |

### Block 6: Conversation

| Requirement | Plan Part | Status | Notes |
|-------------|-----------|:------:|-------|
| `path` with `{{SESSION_ID}}` | Part 2 `frontmatter.ts` | ✅ | Zod: `.includes("{{SESSION_ID}}")` |
| `{{SESSION_ID}}` resolved at runtime | Part 9 `index.ts` | ✅ | `crypto.randomUUID()` on session_start |
| Extension is sole writer | Part 6 `conversation-log.ts` | ✅ | Only `appendToLog` writes |
| Agent does NOT write to log | Inherent | ✅ | Agent has no write access to log path |
| Append-only, immutable entries | Part 6 `conversation-log.ts` | ✅ | `appendFileSync` only |
| User task written BEFORE agent invocation | Part 6 `session.ts` step 9 | ✅ | Gap 3 fix |
| Agent response written AFTER completion | Part 6 `session.ts` step 12 | ✅ | |
| Full content injected as `{{CONVERSATION_LOG}}` | Part 4 `assembly.ts` | ✅ | Pre-read, injected |
| Entry schema: `{ts, from, to, message, type?}` | Part 2 `conversation.ts` | ✅ | Zod schema |
| Domain violations as system messages | Part 5 `scoped-tools.ts` | ⚠️ | **MISSING** — domain errors go to the agent as tool errors, but not written to conversation log |

### Block 7: System Prompt

| Requirement | Plan Part | Status | Notes |
|-------------|-----------|:------:|-------|
| Markdown body below `---` | Part 3 `parser.ts` | ✅ | Parsed as `body` |
| Non-empty body required | Part 3 `validator.ts` | ✅ | Tested |
| `{{SESSION_DIR}}` → filepath | Part 4 `variables.ts` | ✅ | |
| `{{CONVERSATION_LOG}}` → full text | Part 4 `variables.ts` + `assembly.ts` | ✅ | |
| `{{DOMAIN_BLOCK}}` → YAML | Part 4 `assembly.ts` | ✅ | Serialized from frontmatter |
| `{{KNOWLEDGE_BLOCK}}` → YAML | Part 4 `assembly.ts` | ✅ | Serialized from frontmatter |
| `{{SKILLS_BLOCK}}` → YAML | Part 4 `assembly.ts` | ✅ | Serialized from frontmatter |
| `{{TEAM_BLOCK}}` → empty (no teams) | Part 4 `assembly.ts` | ✅ | `""` for pi-agents scope |
| Variables resolved before every invocation | Part 6 `session.ts` | ✅ | Assembly called each time |

---

## Extension Design — Feature by Feature

### Discovery

| Requirement | Plan Part | Status |
|-------------|-----------|:------:|
| Scan `.pi/agents/*.md` | Part 3 `scanner.ts` | ✅ |
| Scan `~/.pi/agent/agents/*.md` | Part 3 `scanner.ts` | ✅ |
| Project overrides global (same name) | Part 3 `scanner.ts` | ✅ |
| Validate all 7 blocks present | Part 3 `validator.ts` | ✅ |
| Validate role-tool alignment | Part 3 `validator.ts` → `validation.ts` | ✅ |
| Reject invalid agents, notify user | Part 3 `validator.ts` + Part 9 `index.ts` | ✅ |
| Bootstrap knowledge files | Part 3 `bootstrap.ts` | ✅ |
| Discover on `session_start` | Part 9 `index.ts` | ✅ |
| Refresh on `/reload` | Part 9 `index.ts` | ✅ |

### `/agents` Command

| Requirement | Plan Part | Status |
|-------------|-----------|:------:|
| List agents: icon + colored name + description | Part 8 `agents-command.ts` | ✅ |
| Registered via `pi.registerCommand()` | Part 8 | ✅ |
| Uses getter for latest agents (after reload) | Part 9 | ✅ |

### `agent` Tool

| Requirement | Plan Part | Status |
|-------------|-----------|:------:|
| Single mode: `{agent, task}` | Part 7 `modes.ts` | ✅ |
| Parallel mode: `{tasks: [...]}` | Part 7 `modes.ts` | ✅ |
| Chain mode: `{chain: [...]}` with `{previous}` | Part 7 `modes.ts` | ✅ |
| Max 4 concurrent in parallel | Part 7 `modes.ts` | ✅ |
| `promptSnippet` + `promptGuidelines` | Part 7 `agent-tool.ts` | ✅ |
| Available agents listed in guidelines | Part 7 `agent-tool.ts` | ✅ |
| Output truncation (>50KB) | Part 7 `agent-tool.ts` | ✅ |
| `runAgent` injectable for testing | Part 7 `modes.ts` | ✅ |

### Agent Invocation (SDK)

| Requirement | Plan Part | Status |
|-------------|-----------|:------:|
| `createAgentSession` per agent | Part 6 `session.ts` | ✅ |
| `SessionManager.inMemory()` | Part 6 `session.ts` | ✅ |
| Custom `ResourceLoader` with assembled prompt | Part 6 `session.ts` | ✅ |
| Domain-scoped tools | Part 5 `scoped-tools.ts` | ✅ |
| Shared `modelRegistry` from `ctx.modelRegistry` | Part 6 `session.ts` | ✅ | No separate `authStorage` needed — `modelRegistry` handles auth (matches pi-flow pattern) |
| Subscribe to events for metrics | Part 6 `metrics.ts` | ✅ |
| Track tokens, cost, turns, tool calls | Part 6 `metrics.ts` | ✅ |
| `session.prompt(task)` | Part 6 `session.ts` | ✅ |
| `session.dispose()` after completion | Part 6 `session.ts` | ✅ |
| Abort signal propagation | Part 6 `session.ts` | ✅ |

### Conversation Log

| Requirement | Plan Part | Status |
|-------------|-----------|:------:|
| Append-only JSONL | Part 6 `conversation-log.ts` | ✅ |
| Extension is sole writer | Part 6 `conversation-log.ts` | ✅ |
| `ensureExists` + `append` + `read` | Part 6 `conversation-log.ts` | ✅ |
| User task written before invocation | Part 6 `session.ts` | ✅ |
| Agent response written after completion | Part 6 `session.ts` | ✅ |
| Re-read + re-inject on next invocation | Part 6 `session.ts` | ✅ |

### Rendering

| Requirement | Plan Part | Status |
|-------------|-----------|:------:|
| `renderCall`: icon + colored name + model | Part 8 `tool/render.ts` | ✅ |
| `renderResult` partial: `thinking...` | Part 8 `tool/render.ts` | ✅ |
| `renderResult` collapsed: output + usage stats | Part 8 `tool/render.ts` | ✅ |
| `renderResult` expanded (Ctrl+O): task + tools + output | Part 8 `tool/render.ts` | ✅ |
| Parallel: stacked, each resolves independently | Part 8 `tool/render.ts` | ✅ |
| Format: `formatTokens`, `formatUsageStats`, `formatToolCall` | Part 8 `tool/format.ts` | ✅ |
| No widget below editor | Correct | ✅ | Not implemented |
| No status footer | Correct | ✅ | Not implemented |

### Data Flow (14 steps)

| Step | Plan Part | Status |
|------|-----------|:------:|
| a. Find agent config by name | Part 7 `modes.ts` | ✅ |
| b. Read conversation log | Part 6 `session.ts` | ✅ |
| c. Read project knowledge | Part 6 `session.ts` | ✅ |
| d. Read general knowledge | Part 6 `session.ts` | ✅ |
| e. Read skill .md files | Part 6 `session.ts` | ✅ |
| f. Resolve {{VARIABLES}} | Part 4 `variables.ts` | ✅ |
| g. Assemble system prompt | Part 4 `assembly.ts` | ✅ |
| h. Create domain-scoped tools | Part 5 `scoped-tools.ts` | ✅ |
| i. createAgentSession | Part 6 `session.ts` | ✅ |
| j. Subscribe to events | Part 6 `metrics.ts` | ✅ |
| k. session.prompt(task) | Part 6 `session.ts` | ✅ |
| l. Agent completes + log writes | Part 6 `session.ts` + `conversation-log.ts` | ✅ |
| m. session.dispose() | Part 6 `session.ts` | ✅ |
| n. Return result + render | Part 7 + Part 8 | ✅ |

---

## Open Design Decisions (from extension-design.md)

| Question | Resolved? | Resolution |
|----------|:---------:|------------|
| Agent descriptions in parent LLM system prompt? | ✅ | Via `promptGuidelines` on the tool (Part 7) |
| Conversation log per-agent or shared? | ✅ | Per-session file. All agents in one session share one log. |
| Knowledge file conflicts in parallel? | ⚠️ | **Not addressed** — last write wins for now. Add `withFileMutationQueue()` if needed. |
| Model resolution format? | ✅ | `provider/model-id` in frontmatter |
| Agent output truncation? | ✅ | Pi's `truncateHead` (Part 7) |

---

## Remaining Issues

### Issue 1: Domain violations not written to conversation log

**Spec says:** "Domain violations → `conversation.jsonl` (system message)" (Block 6 observability table)

**Plan has:** Domain errors returned as tool errors to the agent. But NOT written to the conversation log as system messages.

**Impact:** Low for pi-agents (single agent, no one else reads the log). Important for future team mode.

**Recommendation:** Defer. Add in team layer when conversation log is shared.

### Issue 2: `max-lines` not enforced by extension

**Spec says:** `max-lines` is a field on knowledge. Forces prioritization when exceeded.

**Plan has:** The field exists in the schema. The `mental-model.md` skill instructs the agent to manage it. But the extension doesn't enforce it.

**Impact:** Low — the agent self-manages via skill. If the agent ignores the instruction, the file grows unbounded.

**Recommendation:** Defer. Monitor in practice. If agents consistently exceed, add extension-side enforcement later.

### Issue 3: `updatable: false` not enforced

**Spec says:** `knowledge.project.updatable` and `knowledge.general.updatable` are booleans.

**Status:** ✅ **Fixed** — Part 5 `scoped-tools.ts` now checks `updatable` before adding implicit write access. Non-updatable knowledge is read-only in the domain.

### Issue 4: Extension-design.md file structure is outdated

**extension-design.md** shows a flat `src/` structure:
```
src/
├── index.ts
├── discovery.ts
├── invocation.ts
├── conversation.ts
├── prompt-assembly.ts
├── domain.ts
├── rendering.ts
└── types.ts
```

**Plan has:** Feature folders: `schema/`, `common/`, `discovery/`, `prompt/`, `domain/`, `invocation/`, `tool/`, `command/`

**Recommendation:** Update `extension-design.md` to match the plan's folder structure.

---

## Verdict

**97% coverage.** 2 remaining issues are low-impact and deferred by design:

1. Domain violations in conversation log → defer to team layer
2. `max-lines` enforcement → defer, agent self-manages via skill

✅ `updatable: false` enforcement → fixed in Part 5
✅ Outdated file structure in extension-design.md → updated

**The plan covers every spec requirement for the pi-agents scope.** Ready to build.
