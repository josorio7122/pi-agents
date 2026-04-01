# Agent Library Proposal

Analysis of gstack skills → pi-agents agent library design.

## Gstack Skill Inventory (29 skills)

| Skill | Lines | Domain | Category |
|-------|------:|--------|----------|
| **ship** | 1931 | Full shipping pipeline (tests, review, version, changelog, PR) | Shipping |
| **plan-ceo-review** | 1537 | CEO/founder-mode plan review, scope expansion/reduction | Planning |
| **land-and-deploy** | 1367 | Merge PR, wait for CI, deploy, canary checks | Shipping |
| **office-hours** | 1317 | YC-style forcing questions, design thinking | Strategy |
| **design-review** | 1314 | Visual QA — spacing, hierarchy, AI slop detection | Design |
| **plan-design-review** | 1227 | Designer's eye plan review, 0-10 ratings | Design |
| **retro** | 1197 | Weekly engineering retrospective, trend tracking | Process |
| **review** | 1138 | Pre-landing PR review (SQL safety, LLM trust boundary) | Quality |
| **qa** | 1136 | Test + fix loop, automated QA | Quality |
| **plan-eng-review** | 1120 | Architecture, data flow, edge cases, test coverage | Planning |
| **autoplan** | 1116 | Auto CEO+design+eng review pipeline | Planning |
| **design-consultation** | 962 | Design system creation, DESIGN.md | Design |
| **cso** | 929 | Security audit (OWASP, STRIDE, supply chain) | Security |
| **codex** | 862 | Cross-model review via OpenAI Codex | Quality |
| **design-shotgun** | 730 | Multiple design variants + comparison | Design |
| **qa-only** | 726 | Report-only QA (no fixes) | Quality |
| **document-release** | 718 | Post-ship doc sync | Documentation |
| **canary** | 587 | Post-deploy monitoring | Ops |
| **connect-chrome** | 549 | Real Chrome browser control | Browser |
| **browse** | 538 | Headless browser for testing | Browser |
| **setup-deploy** | 528 | Configure deployment platform | Ops |
| **investigate** | 504 | Root cause debugging, 4-phase | Debugging |
| **benchmark** | 498 | Performance regression detection | Quality |
| **setup-browser-cookies** | 348 | Cookie import for auth testing | Browser |
| **gstack-upgrade** | 232 | Self-upgrade | Utility |
| **freeze** | 82 | Restrict edits to a directory | Safety |
| **guard** | 82 | Combined careful + freeze | Safety |
| **careful** | 59 | Destructive command warnings | Safety |
| **unfreeze** | 40 | Clear freeze boundary | Utility |

## Natural Agent Clusters

Based on skill groupings, domain patterns, and the gstack ethos:

### 1. 🚀 Shipper Agent
**Role:** worker | **Model:** anthropic/claude-sonnet-4-6
**What:** End-to-end shipping — tests, review, version bump, changelog, PR creation, doc sync.

**Skills (adapted from gstack):**
- `ship` → core shipping workflow
- `review` → pre-landing diff review
- `document-release` → post-ship doc sync

**Domain:** Full read/write — this agent touches everything.
**Tools:** read, write, edit, grep, bash, find, ls

**Why one agent:** Ship/review/document-release are a single pipeline. Splitting them means passing context between agents with no benefit.

---

### 2. 🏗️ Architect Agent
**Role:** worker | **Model:** anthropic/claude-sonnet-4-6
**What:** Plan review from three angles — CEO (scope/vision), engineering (architecture/edge cases), design (visual quality).

**Skills (adapted from gstack):**
- `plan-ceo-review` → scope expansion/reduction, forcing questions
- `plan-eng-review` → architecture, data flow, test coverage
- `plan-design-review` → design dimensions, 0-10 ratings

**Domain:** Read everything, write to docs/ and plans.
**Tools:** read, write, edit, grep, find, ls

**Why one agent:** All three reviews operate on the same plan. The architect holds the full context and applies each lens. This is the "autoplan" pipeline as a single agent.

---

### 3. 🧪 QA Agent
**Role:** worker | **Model:** anthropic/claude-sonnet-4-6
**What:** Systematic testing — browser-based QA, benchmarks, reports.

**Skills (adapted from gstack):**
- `qa` → test + fix loop with screenshots
- `qa-only` → report-only mode
- `benchmark` → performance regression detection
- `browse` → headless browser commands

**Domain:** Read everything, write to src/ for fixes + test reports.
**Tools:** read, write, edit, grep, bash, find, ls

**Why one agent:** QA and benchmarking share the browser infrastructure and testing mindset. One agent with browser skills handles all verification.

---

### 4. 🔒 Security Agent
**Role:** worker | **Model:** anthropic/claude-sonnet-4-6
**What:** Security audits — OWASP, STRIDE, supply chain, secrets, CI/CD.

**Skills (adapted from gstack):**
- `cso` → full security audit (daily + comprehensive modes)
- `careful` → destructive command warnings
- `guard` → combined safety mode

**Domain:** Read everything (needs full codebase access for audit), write to reports.
**Tools:** read, grep, bash, find, ls

**Why one agent:** Security is a distinct domain with specialized knowledge. The CSO skill is 929 lines — it needs its own context window.

---

### 5. 🔍 Investigator Agent
**Role:** worker | **Model:** anthropic/claude-sonnet-4-6
**What:** Root cause debugging — investigate, analyze, hypothesize, implement.

**Skills (adapted from gstack):**
- `investigate` → 4-phase debugging methodology
- `freeze` → scope-restricted edits during debugging

**Domain:** Full read/write.
**Tools:** read, write, edit, grep, bash, find, ls

**Why one agent:** Debugging requires deep focus on one problem. The freeze skill prevents accidental scope creep — the agent fixes the bug, not the world.

---

### 6. 🎨 Designer Agent
**Role:** worker | **Model:** anthropic/claude-sonnet-4-6
**What:** Design systems, visual QA, variant exploration.

**Skills (adapted from gstack):**
- `design-consultation` → create DESIGN.md, propose design system
- `design-review` → visual QA with before/after screenshots
- `design-shotgun` → multiple design variants + comparison

**Domain:** Read everything, write to frontend files + design docs.
**Tools:** read, write, edit, grep, bash, find, ls

**Why one agent:** Design is taste. The agent builds a coherent design vision (consultation), enforces it (review), and explores alternatives (shotgun).

---

### 7. 📊 Retro Agent
**Role:** worker | **Model:** anthropic/claude-haiku-4-5
**What:** Engineering retrospectives, metrics, trend tracking.

**Skills (adapted from gstack):**
- `retro` → commit analysis, work patterns, quality metrics

**Domain:** Read-only + write to retro reports.
**Tools:** read, grep, bash, find, ls

**Why haiku:** Retro is analysis-heavy but not creative. Fast model, low cost.

---

### 8. 💡 Strategist Agent
**Role:** worker | **Model:** anthropic/claude-sonnet-4-6
**What:** YC office hours, product thinking, forcing questions.

**Skills (adapted from gstack):**
- `office-hours` → startup mode (6 forcing questions) + builder mode

**Domain:** Read everything, write to docs/plans.
**Tools:** read, write, edit, grep, find, ls

**Why standalone:** Strategy requires a different thinking mode — questioning premises, expanding scope, challenging assumptions. Mixing this with execution agents dilutes the perspective.

---

## Skills NOT Mapped to Agents

| Skill | Reason |
|-------|--------|
| `codex` | OpenAI Codex CLI wrapper — platform-specific, not portable to pi-agents |
| `connect-chrome` | Real Chrome launch — infrastructure skill, not agent behavior |
| `setup-browser-cookies` | Cookie import — infrastructure prerequisite for QA |
| `setup-deploy` | One-time deploy config — utility, not recurring agent work |
| `land-and-deploy` | Could be part of Shipper, but deploy infra varies wildly per project |
| `canary` | Post-deploy monitoring — could extend Shipper or QA in the future |
| `gstack-upgrade` | Self-upgrade — irrelevant to pi-agents |
| `unfreeze` | Utility complement to freeze — embedded in investigator workflow |
| `autoplan` | Orchestrator for 3 plan reviews — replaced by Architect agent doing all 3 |

## Shared Skills (all agents get these)

From our existing pi-agents skills:
- `mental-model.md` — knowledge management (project + general)
- `active-listener.md` — read conversation log before responding
- `precise-worker.md` — execute exactly, no scope creep

## New Skills to Create

Based on gstack patterns that don't map 1:1 to existing skills:

### 1. `boil-the-lake.md`
**From:** ETHOS.md principle
**Purpose:** When evaluating approach A (complete) vs B (90%), always choose A. AI makes completeness cheap.
**Assign to:** All agents

### 2. `search-first.md`
**From:** ETHOS.md principle
**Purpose:** Before building anything unfamiliar — search first. Three layers: tried-and-true, new-and-popular, first-principles.
**Assign to:** Architect, Investigator, Designer

### 3. `ship-checklist.md`
**From:** ship SKILL.md steps 3-8
**Purpose:** Pre-landing checklist — tests, review, version bump, changelog, PR body template.
**Assign to:** Shipper

### 4. `review-checklist.md`
**From:** review SKILL.md
**Purpose:** SQL safety, LLM trust boundary, conditional side effects.
**Assign to:** Shipper, Security

### 5. `debug-methodology.md`
**From:** investigate SKILL.md
**Purpose:** 4-phase debugging: investigate → analyze → hypothesize → implement. Iron law: no fixes without root cause.
**Assign to:** Investigator

### 6. `design-system.md`
**From:** design-consultation SKILL.md
**Purpose:** How to create DESIGN.md, propose typography/color/spacing/motion.
**Assign to:** Designer

### 7. `security-audit.md`
**From:** cso SKILL.md
**Purpose:** OWASP Top 10, STRIDE, secrets archaeology, dependency supply chain.
**Assign to:** Security

## Status: Skills Ported

16 gstack skills ported to `.pi/skills/` with:
- gstack preamble/telemetry/voice/contributor boilerplate stripped
- `$B` browse commands → playwright-cli equivalents
- `$D` design binary → removed (not available)
- Codex integration → removed
- `~/.gstack/` paths → `.pi/` equivalents
- `.claude/skills/` refs → `.pi/skills/`
- All methodology, checklists, scoring, examples preserved

## Next: Create Agent .md Files

| Priority | Agent | Skills to Wire |
|:--------:|-------|---------------|
| 1 | 🔍 Investigator | investigate, careful |
| 2 | 🚀 Shipper | ship, review, document-release |
| 3 | 🔒 Security | cso, careful, guard |
| 4 | 🏗️ Architect | plan-ceo-review, plan-eng-review, plan-design-review |
| 5 | 🎨 Designer | design-consultation, design-review, design-shotgun, frontend-design*, interface-design* |
| 6 | 🧪 QA | qa, qa-only, benchmark, playwright* |

\* = pi-skills (referenced, not ported)
