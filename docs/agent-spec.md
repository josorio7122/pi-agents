# Agent Specification

> The agent is the core primitive. Everything else — orchestration, delegation, teams — is built on top of it.
> An agent is a self-contained, self-enhancing unit of specialized intelligence.
> Designed as composable blocks: each agent works alone, and agents compose into teams without modification.

---

## Design Principles

1. **An agent is a `.md` file** — configuration via frontmatter, behavior via system prompt
2. **An agent is self-enhancing** — it accumulates knowledge (project-local and general)
3. **An agent is specialized** — bounded domain, focused tools, deep expertise
4. **An agent is portable** — drop it into any project, it works
5. **An agent is observable** — the extension logs everything (the foundation for team communication)
6. **An agent is composable** — works alone; composes into teams without modification
7. **An agent is complete** — all 7 blocks are required; no hidden defaults, no silent degradation

---

## The 7 Blocks

An agent has exactly 7 blocks. All are required. The extension validates on load — missing blocks are rejected.

```
┌─────────────────────────────────────────────────────────────┐
│                      AGENT (.md file)                        │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Block 1: IDENTITY                                    │   │
│  │  name · description · model · role · color · icon     │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Block 2: DOMAIN                                      │   │
│  │  File-system boundaries (read / write / delete)       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Block 3: CAPABILITIES                                │   │
│  │  Tools available (explicit, no hidden defaults)       │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Block 4: SKILLS                                      │   │
│  │  Behavioral modules (.md files injected into prompt)  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Block 5: KNOWLEDGE                                   │   │
│  │  ┌─────────────────┐  ┌─────────────────────────┐    │   │
│  │  │ project         │  │ general                  │    │   │
│  │  │ THIS codebase   │  │ ALL projects, forever    │    │   │
│  │  │ .pi/knowledge/  │  │ ~/.pi/agent/general/     │    │   │
│  │  └─────────────────┘  └─────────────────────────┘    │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Block 6: CONVERSATION                                │   │
│  │  Shared append-only ledger. Written by the extension. │   │
│  │  The agent reads it. The primitive for team comms.    │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Block 7: SYSTEM PROMPT (markdown body)               │   │
│  │  Instructions, persona, constraints.                  │   │
│  │  References {{VARIABLES}} injected at runtime.        │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Complete Frontmatter Schema

```yaml
---
# ╔══════════════════════════════════════════════════════════╗
# ║  BLOCK 1: IDENTITY                                      ║
# ╚══════════════════════════════════════════════════════════╝
name: backend-dev                # Unique identifier (used in logs, delegation, file names)
description: >                   # What this agent does (visible to orchestrators for routing)
  Builds APIs, databases, and infrastructure.
  Thinks in endpoints, data models, queues, and deployment pipelines.
model: anthropic/claude-sonnet-4-6  # "provider/model-id" format — must match Pi's model registry
role: worker                     # worker | lead | orchestrator
color: "#36f9f6"                 # Hex color for TUI rendering
icon: "🟢"                       # Emoji icon for TUI display

# ╔══════════════════════════════════════════════════════════╗
# ║  BLOCK 2: DOMAIN                                        ║
# ╚══════════════════════════════════════════════════════════╝
domain:
  - path: apps/backend/
    read: true
    write: true
    delete: true
  - path: apps/frontend/
    read: true
    write: false
    delete: false

# ╔══════════════════════════════════════════════════════════╗
# ║  BLOCK 3: CAPABILITIES                                  ║
# ╚══════════════════════════════════════════════════════════╝
tools:
  - read
  - write
  - edit
  - grep
  - bash
  - find
  - ls

# ╔══════════════════════════════════════════════════════════╗
# ║  BLOCK 4: SKILLS                                        ║
# ╚══════════════════════════════════════════════════════════╝
skills:
  - path: .pi/skills/mental-model.md
    when: Read at task start. Update knowledge after completing work.
  - path: .pi/skills/active-listener.md
    when: Always. Read conversation log before every response.
  - path: .pi/skills/precise-worker.md
    when: Always. Execute exactly what your lead assigned.

# ╔══════════════════════════════════════════════════════════╗
# ║  BLOCK 5: KNOWLEDGE                                     ║
# ╚══════════════════════════════════════════════════════════╝
knowledge:
  project:
    path: .pi/knowledge/backend-dev.yaml
    description: >
      Architecture, patterns, decisions, gotchas, and tribal knowledge
      specific to THIS codebase.
    updatable: true
    max-lines: 10000
  general:
    path: ~/.pi/agent/general/backend-dev.yaml
    description: >
      Strategies, heuristics, anti-patterns, and techniques
      applicable to ALL projects.
    updatable: true
    max-lines: 5000

# ╔══════════════════════════════════════════════════════════╗
# ║  BLOCK 6: CONVERSATION                                  ║
# ╚══════════════════════════════════════════════════════════╝
conversation:
  path: .pi/sessions/{{SESSION_ID}}/conversation.jsonl
---
```

---

## Block 1: Identity

The minimal facts that define what this agent IS.

```yaml
name: backend-dev
description: >
  Builds APIs, databases, and infrastructure.
  Thinks in endpoints, data models, queues, and deployment pipelines.
model: anthropic/claude-sonnet-4-6
role: worker
color: "#36f9f6"
icon: "🟢"
```

### Fields

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `name` | string | ✅ | Unique identifier. Used in conversation log `from`/`to` fields, file paths, and delegation. |
| `description` | string | ✅ | What this agent does. Visible to orchestrators/leads for routing decisions. |
| `model` | string | ✅ | LLM model in `provider/model-id` format (e.g., `anthropic/claude-sonnet-4-6`). Must match Pi's model registry. |
| `role` | enum | ✅ | `worker`, `lead`, or `orchestrator`. |
| `color` | string | ✅ | Hex color code (e.g., `"#36f9f6"`). Used for agent name rendering in TUI. |
| `icon` | string | ✅ | Emoji icon (e.g., `"🟢"`). Displayed before agent name in TUI and `/agents` command. |

### Role Semantics

| Role | Purpose | Key Constraint |
|------|---------|----------------|
| `worker` | Executes concrete tasks — reads, writes, runs code | Should NOT have `delegate` in tools |
| `lead` | Coordinates workers — plans, delegates, synthesizes | Should NOT have `bash`/`edit` in tools |
| `orchestrator` | User's interface — routes to leads, synthesizes final answers | Should NOT have `bash`/`edit` in tools |

The extension validates that `tools` aligns with `role`. A worker with `delegate` or a lead with `bash` is a configuration error.

---

## Block 2: Domain

The agent's territory — what parts of the codebase it can access.

```yaml
domain:
  - path: apps/backend/
    read: true
    write: true
    delete: true
  - path: apps/frontend/
    read: true
    write: false
    delete: false
  - path: specs/
    read: true
    write: false
    delete: false
```

### Fields

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `path` | string | ✅ | Directory or file path (relative to project root). |
| `read` | boolean | ✅ | Can the agent read files here? |
| `write` | boolean | ✅ | Can the agent create/modify files here? |
| `delete` | boolean | ✅ | Can the agent delete files here? |

### Rules

1. **Explicit over implicit** — if a path isn't listed, the agent has NO access.
2. **Read broadly, write narrowly** — specialization through write constraints.
3. **Knowledge files are implicitly accessible** — the agent owns its knowledge (Block 5 paths).
4. **Conversation log is implicitly readable** — injected by the extension, not accessed via tools.
5. **Domain failures are recoverable** — when an agent hits a boundary, it surfaces the error. In team mode, a lead can delegate to the correct worker.

### Enforcement

The extension intercepts every tool call and checks domain permissions before execution. A blocked call returns a permission error to the agent — it does not silently fail.

---

## Block 3: Capabilities

The tools available to this agent. Explicit — no hidden defaults.

```yaml
tools:
  - read
  - write
  - edit
  - grep
  - bash
  - find
  - ls
```

### Available Tools

| Tool | Purpose | Typical Role |
|------|---------|-------------|
| `read` | Read file contents | All |
| `write` | Create/overwrite files | All |
| `edit` | Precise text replacement in files | Worker |
| `grep` | Search file contents | All |
| `bash` | Execute shell commands | Worker |
| `find` | Find files by name/pattern | All |
| `ls` | List directory contents | All |
| `delegate` | Route tasks to other agents | Lead, Orchestrator |

### Role-Tool Validation

The extension validates tools against role:

| Combination | Valid? | Why |
|-------------|:------:|-----|
| Worker + `bash`, `edit` | ✅ | Workers execute |
| Worker + `delegate` | ❌ | Workers don't coordinate |
| Lead + `delegate` | ✅ | Leads coordinate |
| Lead + `bash`, `edit` | ❌ | Leads don't execute |
| Orchestrator + `delegate` | ✅ | Orchestrators coordinate |
| Orchestrator + `bash`, `edit` | ❌ | Orchestrators don't execute |

---

## Block 4: Skills

Behavioral modules — `.md` files injected into the agent's prompt that shape HOW it thinks and acts.

```yaml
skills:
  - path: .pi/skills/mental-model.md
    when: Read at task start. Update knowledge after completing work.
  - path: .pi/skills/active-listener.md
    when: Always. Read conversation log before every response.
  - path: .pi/skills/precise-worker.md
    when: Always. Execute exactly what your lead assigned.
```

### Fields

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `path` | string | ✅ | Path to the skill `.md` file (relative to project root). |
| `when` | string | ✅ | Instruction for when this skill applies. Injected alongside the skill content. |

### What a Skill IS

A skill is a **behavioral instruction set** — not code, not a tool, not a function. It's a set of rules that shape how the agent thinks and acts. Skills are:

- **Composable** — an agent can have many skills
- **Reusable** — the same skill can be shared across agents
- **Role-appropriate** — different skills for workers vs leads

### Skill Categories

| Category | Purpose | Examples |
|----------|---------|---------|
| **Cognitive** | How the agent thinks | `mental-model.md` — manage knowledge files |
| **Communication** | How the agent interacts | `active-listener.md` — read log before responding |
| **Execution** | How the agent works | `precise-worker.md` — follow instructions exactly |
| **Leadership** | How the agent manages | `zero-micro-management.md` — delegate, never execute |
| **Autonomy** | How much the agent self-directs | `high-autonomy.md` — act without asking questions |

---

## Block 5: Knowledge

The self-enhancement engine. Two types of knowledge with different scopes, locations, and lifecycles.

```yaml
knowledge:
  project:
    path: .pi/knowledge/backend-dev.yaml
    description: >
      Architecture, patterns, decisions, gotchas, and tribal knowledge
      specific to THIS codebase.
    updatable: true
    max-lines: 10000
  general:
    path: ~/.pi/agent/general/backend-dev.yaml
    description: >
      Strategies, heuristics, anti-patterns, and techniques
      applicable to ALL projects.
    updatable: true
    max-lines: 5000
```

### Fields

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `project.path` | string | ✅ | Path to project knowledge file (relative to project root). |
| `project.description` | string | ✅ | What to track. Injected into the agent's prompt as guidance. |
| `project.updatable` | boolean | ✅ | Can the agent modify this file? |
| `project.max-lines` | number | ✅ | Maximum file size. Forces prioritization when exceeded. |
| `general.path` | string | ✅ | Path to general knowledge file (typically in `~/.pi/agent/general/`). |
| `general.description` | string | ✅ | What to track. Injected into the agent's prompt as guidance. |
| `general.updatable` | boolean | ✅ | Can the agent modify this file? |
| `general.max-lines` | number | ✅ | Maximum file size. Forces prioritization when exceeded. |

### The Two Types

```
PROJECT KNOWLEDGE                        GENERAL KNOWLEDGE
"What I know about THIS codebase"        "What I know about being
                                          a better agent"

Location:                                Location:
.pi/knowledge/{name}.yaml               ~/.pi/agent/general/{name}.yaml
(inside project)                         (user home — global)

Lifecycle:                               Lifecycle:
Starts empty per project                 Accumulates across ALL projects
Dies when you switch projects            Travels with you forever
Committed to git (team-shared)           Personal to your agent

Contains:                                Contains:
• Architecture & stack details           • Debugging strategies
• File ownership & key files             • Tool efficiency heuristics
• Patterns & conventions                 • Framework-specific tips
• Decisions & rationale                  • Anti-patterns to avoid
• Gotchas & tribal knowledge             • Collaboration patterns
• Bug patterns & fixes                   • Problem-solving shortcuts

max-lines: 10000                         max-lines: 5000
(detailed, project-specific)             (distilled, high-signal)
```

### The Generalization Loop

Project knowledge feeds general knowledge. When the agent notices recurring patterns, it generalizes:

```
Project A: "Session middleware must be before auth routes in this Express app"
Project B: "CORS middleware must be before API routes in this Fastify app"
Project C: "Auth guard must be before resolver chain in this GraphQL server"
                              │
                              ▼
General: "In server frameworks, middleware/guard ordering is the #1
          source of subtle bugs. Always verify order when debugging
          unexpected 401s/403s/500s."
```

**Decision rule:**
- Would you tell a junior dev this on ANY project? → **General knowledge**
- Does it only make sense in THIS codebase? → **Project knowledge**

### The Knowledge Lifecycle

```
EVERY INVOCATION:

1. LOAD BOTH
   ├── Read general knowledge (global)   → "What strategies do I have?"
   └── Read project knowledge (local)    → "What do I know about THIS codebase?"

2. WORK
   Apply general heuristics while exploring the codebase.
   Use project knowledge to navigate efficiently.

3. LEARN — update BOTH
   ├── Project: "What did I learn about this codebase?"
   │   New architecture? Updated file? Discovered gotcha?
   └── General: "Did I learn something generalizable?"
       New strategy? Better heuristic? Anti-pattern?
```

### Self-Enhancement vs Memory

| Memory | Self-Enhancement |
|--------|-----------------|
| Appends everything | Curates: adds, updates, removes |
| Grows unboundedly | Bounded by `max-lines` — forces prioritization |
| Raw data | Structured insights (patterns, decisions, risks) |
| Passive recall | Active learning: "What did I learn?" |
| Same quality over time | Improves: early entries raw, later entries refined |
| Project-locked | **Generalizes across projects** |

### Evolution Over Sessions

**Cold start (sessions 1-3):** Agent knows nothing about this codebase. General knowledge (from past projects) accelerates discovery.

**Pattern recognition (sessions 3-10):** Conventions, patterns, decisions emerge in project knowledge.

**Deep understanding (sessions 10-20):** Architecture rationale, bug patterns, tribal knowledge accumulate.

**Institutional knowledge (sessions 20+):** The agent knows things no single developer remembers. General knowledge is refined and high-signal.

---

## Block 6: Conversation

The shared append-only ledger. Written by the extension, read by the agent.

```yaml
conversation:
  path: .pi/sessions/{{SESSION_ID}}/conversation.jsonl
```

### Fields

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `path` | string | ✅ | Path to conversation log. `{{SESSION_ID}}` is resolved at runtime. In team mode, the extension overrides all agents to the same path. |

### How It Works

The agent **does not write** to this file. The agent talks. The **extension records everything**.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   conversation.jsonl                                         │
│   (ONE file per session, append-only)                        │
│                                                              │
│   WRITTEN BY:  the extension — SOLE WRITER                   │
│   READ BY:     all agents (injected as {{CONVERSATION_LOG}})     │
│   MODIFIED BY: nobody — append-only, immutable entries       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Why the Agent Doesn't Write

1. **No coordination needed** — agents don't need write access to a shared file
2. **No race conditions** — only one writer, even with parallel agents
3. **Consistent format** — the extension controls the schema
4. **The agent stays simple** — it responds; the infrastructure records

### Log Entry Schema

Every entry is a message between two parties:

```yaml
ts: string          # ISO 8601 timestamp
from: string        # Sender (agent name, "user", or "system")
to: string          # Recipient (agent name, "user", or "system")
message: string     # The actual content
type: string        # Optional: "delegate" | "system" | omit for normal messages
```

### Example

```jsonl
{"ts":"2026-03-30T14:22:01Z","from":"user","to":"orchestrator","message":"Build the ComplementNB classifier"}
{"ts":"2026-03-30T14:22:03Z","from":"orchestrator","to":"engineering-lead","message":"Build ComplementNB in the classifier module","type":"delegate"}
{"ts":"2026-03-30T14:22:05Z","from":"engineering-lead","to":"backend-dev","message":"Implement ComplementNB in classifier.py","type":"delegate"}
{"ts":"2026-03-30T14:22:10Z","from":"backend-dev","to":"engineering-lead","message":"Implemented ComplementNB. Created cnb_classifier.py, 4 tests passing."}
{"ts":"2026-03-30T14:22:12Z","from":"engineering-lead","to":"orchestrator","message":"Backend Dev implemented ComplementNB. All tests passing."}
{"ts":"2026-03-30T14:22:14Z","from":"orchestrator","to":"user","message":"Done. ComplementNB classifier is implemented..."}
```

### Why So Simple?

This log gets injected into every agent's context on every invocation. Every token costs money. Keep entries lean. Tool call details, token counts, and cost tracking belong in the extension's observability layer — NOT in the conversation log.

| Data | Where It Lives | Injected into Agent? |
|------|---------------|:--------------------:|
| Agent messages | `conversation.jsonl` | ✅ Yes |
| Tool call details | Extension TUI | ❌ No |
| Token usage / cost | Extension TUI | ❌ No |
| Domain violations | `conversation.jsonl` (system message) | ✅ Yes |
| Delegation events | `conversation.jsonl` (type: delegate) | ✅ Yes |

### The Append-Only Guarantee

```
Line 1:  {"from":"user","to":"orchestrator","message":"..."}    ← never changes
Line 2:  {"from":"orchestrator","to":"eng-lead","message":"..."}← never changes
...
Line N:  (new entry appended)                                    ← only grows
```

No entry is ever modified or deleted. The file only grows. This means:
- **No conflicts** — even with parallel agents, each append is atomic
- **Full audit trail** — you can replay any session
- **Simple implementation** — append is the only write operation

### How Composition Works

```
Solo mode:   conversation.jsonl has 2 participants (user + agent)
Pair mode:   conversation.jsonl has 3 participants (user + lead + worker)
Team mode:   conversation.jsonl has 10+ participants (everyone)
```

**The agent file doesn't change.** The extension points all team agents at the same log file.

---

## Block 7: System Prompt

The markdown body below the frontmatter `---` closer. The agent's instructions, persona, and constraints.

### Template Structure

```markdown
# {Agent Name}

## Purpose
One paragraph: what this agent does and how it thinks.

## Variables
Runtime context injected by the extension before each invocation.
- **Session:** `{{SESSION_DIR}}`
- **Conversation Log:** `{{CONVERSATION_LOG}}`

## Instructions
Behavioral rules. What to do, what not to do.

## Domain
```yaml
{{DOMAIN_BLOCK}}
```

## Knowledge
```yaml
{{KNOWLEDGE_BLOCK}}
```

## Skills
```yaml
{{SKILLS_BLOCK}}
```

## Team (leads/orchestrators only)
```yaml
{{TEAM_BLOCK}}
```
```

### Variable Injection

The extension resolves these **before every invocation**:

| Variable | Injected As | Source |
|----------|------------|--------|
| `{{SESSION_DIR}}` | Filepath string | Current session directory |
| `{{CONVERSATION_LOG}}` | **Full text content** | Conversation JSONL — every message from every agent (written by extension) |
| `{{DOMAIN_BLOCK}}` | YAML block | Agent's domain rules from frontmatter |
| `{{KNOWLEDGE_BLOCK}}` | YAML block | Both knowledge configs from frontmatter |
| `{{SKILLS_BLOCK}}` | YAML block | Agent's skill references from frontmatter |
| `{{TEAM_BLOCK}}` | YAML block | Team members (only for leads/orchestrators) |

---

## Composability

### The Rule

**Nothing in the agent `.md` file changes when it joins a team.** The extension handles composition:

| Block | Solo Agent | Team Agent | What the Extension Changes |
|-------|-----------|------------|---------------------------|
| Identity | Same | Same | Nothing |
| Domain | Same | Same | Nothing |
| Capabilities | Same | Same | Adds `delegate` for leads based on `role` |
| Skills | Same | Same | Nothing |
| Knowledge | Same | Same | Leads may read workers' project knowledge |
| Conversation | Same path template | **Same resolved path** | Points all agents at the same log file |
| System Prompt | Same | Same | Injects `{{TEAM_BLOCK}}` for leads/orchestrators |

**The agent is a block. The extension is the glue.**

---

## File Layout

```
project-root/
├── .pi/
│   ├── agents/                        # Agent definitions (committed)
│   │   ├── orchestrator.md
│   │   ├── planning-lead.md
│   │   ├── engineering-lead.md
│   │   ├── backend-dev.md
│   │   ├── frontend-dev.md
│   │   └── ...
│   │
│   ├── skills/                        # Behavioral modules (committed)
│   │   ├── mental-model.md
│   │   ├── active-listener.md
│   │   ├── precise-worker.md
│   │   ├── zero-micro-management.md
│   │   └── ...
│   │
│   ├── knowledge/                     # Project knowledge (committed)
│   │   ├── orchestrator.yaml
│   │   ├── engineering-lead.yaml
│   │   ├── backend-dev.yaml
│   │   └── ...
│   │
│   └── sessions/                      # Session artifacts (gitignored)
│       └── {session-id}/
│           ├── conversation.jsonl     # Conversation log (written by extension)
│           └── ...

~/.pi/
└── agent/
    └── general/                       # General knowledge (global — personal)
        ├── orchestrator.yaml
        ├── engineering-lead.yaml
        ├── backend-dev.yaml
        └── ...
```

### Git Rules

| Path | Git Status | Why |
|------|-----------|-----|
| `.pi/agents/*.md` | **Committed** | Team-shared agent definitions |
| `.pi/skills/*.md` | **Committed** | Team-shared behavioral modules |
| `.pi/knowledge/*.yaml` | **Committed** | Project knowledge — team-shared codebase understanding |
| `.pi/sessions/` | **Gitignored** | Ephemeral — conversation logs, session artifacts |
| `~/.pi/agent/general/` | **N/A (global)** | General knowledge — personal, travels across projects |
