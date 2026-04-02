# Prompt & Skill Evaluation

Evaluated using: **prompt-engineering**, **skill-writer**, **skill-scanner** skills.

---

## 1. Scout Agent (`scout.md`)

### Prompt Engineering Assessment

| Criterion | Rating | Notes |
|-----------|:------:|-------|
| Instruction hierarchy | ✅ | System context → Variables → Domain → Instructions → Output Format |
| Degrees of freedom | ✅ | Medium freedom — preferred pattern with examples. Appropriate for exploratory tasks. |
| Conciseness | ✅ | No filler. Every instruction is actionable. |
| Authority patterns | ✅ | "do NOT read entire files", "Every tool call must have a clear purpose" |
| Output format | ✅ | Concrete example with actual project files — agent knows exactly what to produce |
| Variable injection | ✅ | All 6 `{{VARIABLES}}` present |
| Examples | ✅ | Output format has a real example, not a generic placeholder |

### Issues Found

1. **Missing `active-listener` skill** — scout doesn't have the conversation log reading skill. If invoked after another agent, it won't know what already happened.

**Severity:** Medium — matters in chain/parallel mode.

### Fix

```yaml
skills:
  - path: .pi/agent-skills/mental-model.md
    when: Read knowledge files at task start. Update after completing work.
  - path: .pi/agent-skills/active-listener.md        # ADD THIS
    when: Always. Read conversation log before responding.
```

---

## 2. Backend-Dev Agent (`backend-dev.md`)

### Prompt Engineering Assessment

| Criterion | Rating | Notes |
|-----------|:------:|-------|
| Instruction hierarchy | ✅ | Clear sections: Variables → Domain → Instructions → Learning → TDD → Code Quality |
| Degrees of freedom | ✅ | Low freedom for TDD (strict: "NEVER write implementation before test"). Medium for code quality. Correct mix. |
| Conciseness | ✅ | Dense, no filler |
| Authority patterns | ✅ | "NEVER write implementation before the test", "Non-Negotiable", strong enforcement |
| User learning capture | ✅ | Concrete examples of project vs general decisions |
| Variable injection | ✅ | All 6 `{{VARIABLES}}` present |

### Issues Found

1. **Numbered instruction list mixes concerns** — steps 1-6 mix knowledge reading, conversation reading, task execution, and knowledge updating. The numbered list implies sequential execution but some are always-do vs task-specific.

**Severity:** Low — works, but could be clearer.

2. **`npm test` hardcoded** — should reference the project's actual test command, not assume npm.

**Severity:** Low — works for this project, not portable.

### Fixes

Reorder instructions: separate "always do first" from "task-specific":

```markdown
## Before Every Task
1. Read your knowledge files
2. Read the conversation log for context

## During the Task
3. Execute the assigned task precisely
4. Follow TDD: failing test → implementation → green
5. Write code to files — keep chat responses focused on decisions

## After the Task
6. Run tests to verify
7. Update your knowledge files with what you learned
```

---

## 3. Mental Model Skill (`mental-model.md`)

### Skill-Writer Assessment

| Criterion | Rating | Notes |
|-----------|:------:|-------|
| Description quality | ✅ | Trigger-rich: "manage persistent knowledge files", "two types", "project-specific and general" |
| Description format | ✅ | Third person, `<What> — <types>. <When>. <Key capability>.` |
| Imperative voice | ✅ | "Read BOTH", "NEVER store", "UPDATE the stale entry" |
| Conciseness | ⚠️ | 76 lines — could be tighter. The YAML example block is 15 lines which is justified. |
| Degrees of freedom | ✅ | Low freedom for rules (NEVER), medium freedom for structure (let categories emerge) |
| Progressive disclosure | N/A | Single file skill, no references |
| Decision logic | ✅ | Clear decision rule with yes/no binary |
| Examples | ✅ | Concrete YAML examples for both project and general |
| Anti-patterns addressed | ✅ | "What NOT to store" section |

### Issues Found

1. **No mention of file paths** — the skill says "read your knowledge files" but never tells the agent WHERE they are. The agent gets paths via `{{KNOWLEDGE_BLOCK}}` in its system prompt, but the skill itself should reference this.

**Severity:** Low — the system prompt handles it, but the skill could reinforce.

2. **"Your knowledge file has a max size"** — doesn't say what the actual max is. The agent gets `max-lines` from frontmatter but the skill should say "check your knowledge config for the limit."

**Severity:** Low.

### Prompt Engineering Assessment

| Criterion | Rating | Notes |
|-----------|:------:|-------|
| Authority | ✅ | "NEVER", "Always. No exceptions." |
| Commitment | ⚠️ | Missing — should require the agent to announce when it updates knowledge |
| Social proof | N/A | Not applicable for single-agent skill |

### Fix

Add after the Rules section:

```markdown
## Announcement

When you update a knowledge file, state what you added/changed in your response:
"Updated project knowledge: added key_files.auth-routes, updated architecture.api.pattern"
```

---

## 4. Active Listener Skill (`active-listener.md`)

### Skill-Writer Assessment

| Criterion | Rating | Notes |
|-----------|:------:|-------|
| Description quality | ✅ | Trigger-rich, clear on when to activate |
| Imperative voice | ✅ | All rules are commands |
| Conciseness | ✅ | 16 lines — perfect size for a behavioral skill |
| Degrees of freedom | ✅ | Low freedom (strict rules) — appropriate for discipline skill |

### Issues Found

None. This is a clean, tight behavioral skill.

---

## 5. Precise Worker Skill (`precise-worker.md`)

### Skill-Writer Assessment

| Criterion | Rating | Notes |
|-----------|:------:|-------|
| Description quality | ✅ | Clear trigger: "execute exactly", "no improvising", "no scope creep" |
| Imperative voice | ✅ | Direct commands throughout |
| Conciseness | ✅ | 17 lines — minimal, high-signal |
| Degrees of freedom | ✅ | Low freedom — this IS a constraint skill |

### Issues Found

1. **Rule 4 contradicts some use cases** — "do not ask clarifying questions" is aggressive. For a worker invoked by the parent LLM (not a lead), asking might be appropriate.

**Severity:** Low — in the current pi-agents scope (no leads), the parent LLM gives the task, and the worker should just execute. The rule is correct for now.

---

## 6. promptGuidelines (`agent-tool.ts`)

### Prompt Engineering Assessment

| Criterion | Rating | Notes |
|-----------|:------:|-------|
| When to use / not use | ✅ | "Use ONLY when a task benefits from a specialized agent" |
| Task quality guidance | ✅ | Bad vs good example |
| Concrete mode examples | ✅ | Single, parallel, chain with real syntax |
| Conciseness | ✅ | ~12 lines — tight |

### Issues Found

None. Clean and complete for the current scope.

---

## 7. Assembly Output Structure (`assembly.ts`)

### Prompt Engineering Assessment

| Criterion | Rating | Notes |
|-----------|:------:|-------|
| Variable framing | ✅ | Knowledge sections have "What you have learned about THIS codebase" framing |
| Empty state handling | ✅ | "(empty — you have not explored this codebase yet)" guides the agent |
| Skill injection | ✅ | Name + when + content — clear structure |
| Separator usage | ✅ | `---` between sections |

### Issues Found

1. **`serializeYaml` uses JSON** — the function name says YAML but outputs JSON. This is cosmetic (LLMs handle both) but confusing for maintainers.

**Severity:** Cosmetic — rename to `serializeBlock` or actually use YAML.

2. **Conversation log injected raw** — no framing like "This is the conversation history between all participants." The agent sees raw JSONL without context.

**Severity:** Medium — the active-listener skill tells the agent to read it, but the assembly should frame what it is.

---

## Summary

| Prompt/Skill | Rating | Action Needed |
|-------------|:------:|--------------|
| **scout.md** | ⚠️ | Add `active-listener` skill |
| **backend-dev.md** | ⚠️ | Reorder instructions (before/during/after) |
| **mental-model.md** | ⚠️ | Add announcement requirement |
| **active-listener.md** | ✅ | None |
| **precise-worker.md** | ✅ | None |
| **promptGuidelines** | ✅ | None |
| **assembly.ts** | ⚠️ | Rename serializeYaml, add conversation log framing |
