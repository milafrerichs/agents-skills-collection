---
name: night-shift
description: >
  Autonomous overnight agent that works through open tasks pulled from the
  Night Shift MCP queue (Linear "Ready for Night Shift" issues), implementing
  each task in an isolated git worktree, and reporting worktree locations for
  human review in the morning. Use this skill whenever the user wants to: run
  the night shift, process their todo list overnight, work through tasks
  autonomously, batch-implement open tasks for review, or says anything like
  "work through my todo", "handle these tasks overnight", "set up the night
  shift", or "work through my backlog". Also triggers for phrases like "while I
  sleep", "for morning review", "work through these issues", or "autonomous task
  agent".
---

# Night Shift Agent

An autonomous agent that fetches the task queue from the **Night Shift MCP
Server**, claims each task atomically, works through it in an isolated git
worktree, broadcasts real-time phase updates, and produces a morning report
with worktree locations ready for human review.

---

## MCP Tools Reference

All Night Shift coordination goes through the MCP server. Never fall back to
reading a local todo.md for the queue — always use get_queue first.

| Tool | When to call |
|---|---|
| get_queue | Once at startup — fetches ready executions from Linear |
| claim_execution | Before touching any task — atomic lock |
| get_issue_spec | Immediately after claiming — loads full Linear issue |
| update_progress | At every phase transition |
| add_note | To log observations, plan review results, test summaries |
| block_execution | Task cannot proceed due to external dependency |
| skip_execution | Task is ambiguous or out of scope for tonight |
| complete_execution | Task fully implemented, tests green, committed |
| get_execution | To inspect state of a specific execution if needed |

agent_id convention: night-shift-YYYYMMDD-NNN e.g. night-shift-20250126-001

---

## High-Level Flow

```
1. INTAKE      - get_queue → display plan → confirm scope with user
2. FOR EACH TASK (in queue order):
   a. CLAIM    - claim_execution (atomic); get_issue_spec
   b. PLAN     - Read docs + spec, write detailed plan, Opus review
                 → update_progress(planning) + add_note(plan review result)
   c. BRANCH   - Create git worktree on a fresh branch
   d. IMPLEMENT- TDD: write failing tests first, then code to pass them
                 → update_progress(tdd) then update_progress(implement)
   e. VERIFY   - Run tests / lint; iterate if failing
                 → update_progress(verify) + add_note(test summary)
   f. REVIEW   - Clean Code + Sandi Metz review; implement all findings
                 → update_progress(review)
   g. COMMIT   - Commit work; record worktree (no PR)
                 → update_progress(commit) → complete_execution
   h. SUMMARY  - Generate HTML change summary linking all artefacts
3. REPORT      - Print morning summary: worktrees ready, tasks skipped/blocked
```

Read references/worktree-ops.md for git worktree command patterns.

---

## Step 1 — Intake

### Fetch the queue

Call the Night Shift MCP: get_queue (no parameters needed)

This syncs the "Ready for Night Shift" Linear issues, resolves repo labels to
local paths, and returns an ordered list of executions. Each execution has:
- execution_id (UUID) — used for all subsequent MCP calls
- linear_issue_id — e.g. TECH-123
- title — issue title
- repo_path — local path to the git repo
- priority — processing order

### Display plan and confirm scope

```
Night Shift Plan
================
Agent:   night-shift-<timestamp>
Tasks:   <N> ready in queue

Queue:
  1. [TECH-123] Add user search endpoint  (repo: /path/to/repo)
  2. [TECH-124] Fix pagination off-by-one (repo: /path/to/repo)
  3. [TECH-127] Refactor auth middleware   (repo: /path/to/repo)

Proceed? (y / subset list / n)
```

If running non-interactively (night shift mode), proceed with the full queue
automatically. Note any skips/blocks in the final report.

---

## Step 2 — Environment Check

Before starting work, verify the environment:

```bash
cd <repo_path from execution>
git status --short
BASE_BRANCH=$(git symbolic-ref --short HEAD)   # usually main or master
```

---

## Step 3 — Per-Task Loop

For each execution returned by get_queue, follow this sequence:

### 3a. Claim + Load Spec

Claim the execution first — this is an atomic lock preventing concurrent agents
from picking up the same task:

```
Night Shift MCP → claim_execution
  agent_id:     "night-shift-<timestamp>"
  execution_id: <execution_id>
```

If claim returns an error (already claimed by another agent), move to next task.

Then load the full issue spec:

```
Night Shift MCP → get_issue_spec
  execution_id: <execution_id>
```

Returns: full Linear issue (title, description, parent issue, labels,
acceptance criteria, linked sub-issues). Treat acceptance criteria as
authoritative requirements.

### 3b. Plan

Signal planning started:

```
Night Shift MCP → update_progress
  substatus: "planning"
  notes: "Loading spec and codebase context"
```

Cross-reference the issue spec against the codebase:
- Relevant spec sections (search by keyword in the issue description)
- Existing code structure (find, grep, ls)
- Related files the task mentions
- Project docs: README.md, any files under docs/, openapi.yml

#### Write the plan

Produce a detailed implementation plan covering:
1. Goal — one-sentence restatement of what "done" looks like
2. Affected files — every file expected to change or be created
3. Data / type changes — schema, interface, or model changes required
4. Test strategy — what test cases will prove correctness (TDD: written first)
5. Implementation steps — numbered, fine-grained, in execution order
6. Edge cases & risks — anything that could go wrong; how to handle it
7. Out of scope — explicit list of what will NOT be touched

Save to disk before writing any code:

```bash
mkdir -p night-shift-plans
PLAN_PATH="night-shift-plans/${SLUG}.md"
# Write plan content to $PLAN_PATH
```

#### Opus plan review (subagent)

Spawn a subagent (model: claude-opus-4-5) with system prompt:
"You are a senior engineer doing a pre-implementation plan review. Be critical.
Flag vague steps, missing edge cases, incorrect file assumptions, and anything
that will likely cause problems during TDD."

User message: full plan content + "Review this plan. For each section note any
gaps, risks, or improvements. End with GO / NO-GO and required changes if NO-GO."

Parse response:
- GO → proceed to 3c
- NO-GO → apply required changes to plan file, re-run review once more
- Still NO-GO after one revision → call block_execution with reason; skip task

Log review result via MCP:

```
Night Shift MCP → add_note
  note: "Opus plan review: <GO|NO-GO>. <summary of key findings>"
```

Append the Opus review to the plan file under ## Plan Review.

### 3c. Create worktree

```bash
SLUG=$(echo "<issue title>" | tr '[:upper:]' '[:lower:]' \
       | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | cut -c1-50)
BRANCH="night-shift/${SLUG}"
WORKTREE_PATH="/tmp/worktrees/${SLUG}"

git fetch origin
git worktree add "$WORKTREE_PATH" -b "$BRANCH" "origin/$BASE_BRANCH"
cd "$WORKTREE_PATH"
```

All work for this task happens inside WORKTREE_PATH. Never commit to main.

### 3d. Implement (TDD)

Signal TDD phase:

```
Night Shift MCP → update_progress
  substatus: "tdd"
  notes: "Writing failing tests for: <first requirement>"
```

Read /mnt/skills/user/tdd/SKILL.md before writing any code.
Follow Red → Green → Refactor for every logical unit:
1. Red — Write a failing test for the next plan requirement
2. Green — Write the minimum code to pass
3. Refactor — Clean up without breaking the test
4. Repeat for each plan step

Once tests are written and implementation begins:

```
Night Shift MCP → update_progress
  substatus: "implement"
  notes: "Tests written; implementing: <current step>"
```

For large tasks (L), commit at each Green milestone:
```bash
git add -p
git commit -m "feat: <what> — <why>"
```

### 3e. Verify

Signal verify phase:

```
Night Shift MCP → update_progress
  substatus: "verify"
  notes: "Running full test suite"
```

```bash
# Node
[ -f package.json ] && npm test 2>&1 | tail -30
# Python
[ -f pyproject.toml ] && python -m pytest --tb=short 2>&1 | tail -30
# Encore
[ -f encore.app ] && encore test ./... 2>&1 | tail -30
# Lint
[ -f .eslintrc* ] && npx eslint . --max-warnings=0 2>&1 | tail -20
```

Log the outcome:

```
Night Shift MCP → add_note
  note: "Tests: <PASS|FAIL>. <N> passed, <M> failed. <brief summary>"
```

If tests fail after 2 fix attempts: commit what works, add_note with failure
details, flag in morning report under Issues Encountered, continue.

### 3f. Code Review

Signal review phase:

```
Night Shift MCP → update_progress
  substatus: "review"
  notes: "Running clean-code and Sandi Metz reviews"
```

Get changed files:
```bash
git diff origin/$BASE_BRANCH --name-only
```

Review 1 — Clean Code (read /mnt/skills/user/clean-code/SKILL.md first):
Focus on naming, function length, single responsibility, comments, error handling.

Review 2 — Sandi Metz OO Design (read /mnt/skills/user/sandi-metz-reviewer/SKILL.md):
Focus on class responsibilities, Law of Demeter, message passing, flocking rules.

Implement ALL review findings. Re-run test suite to confirm nothing broke.

Save both reviews to night-shift-plans/:
- night-shift-plans/review-clean-code-${SLUG}.md
- night-shift-plans/review-sandi-metz-${SLUG}.md

```bash
git add -A
git commit -m "refactor: apply clean-code + Sandi Metz review findings"
```

### 3g. Commit & Complete

Signal commit phase:

```
Night Shift MCP → update_progress
  substatus: "commit"
  notes: "Final commit; recording worktree"
```

```bash
cd "$WORKTREE_PATH"
git add -A
git diff --cached --quiet || git commit -m "chore: final cleanup"

# Record worktree location for morning report
echo "  branch=$BRANCH  path=$WORKTREE_PATH" >> /tmp/night-shift-worktrees.txt
```

Do NOT push or open a PR. Mark the execution complete:

```
Night Shift MCP → complete_execution
  agent_id:     "night-shift-<timestamp>"
  execution_id: <execution_id>
```

### 3h. HTML Change Summary

Generate a self-contained HTML file (no external deps, inline CSS, prefers-color-scheme):

```bash
HTML_PATH="$WORKTREE_PATH/night-shift-summary-${SLUG}.html"
```

Must include:
- Header: task title, date, Linear ticket link (https://linear.app/team/issue/<ID>)
- Plan link: night-shift-plans/${SLUG}.md
- Opus plan review summary
- Changes section: per-file — what changed, why, trade-offs
- Clean Code + Sandi Metz review links
- Test results: pass/fail summary + command used
- Known issues (if any)

```bash
cp "$HTML_PATH" "night-shift-plans/summary-${SLUG}.html"
git add -A
git commit -m "docs: add night-shift change summary"
```

---

## Step 4 — Morning Report

```
Morning Report
==============
Night Shift Complete
Agent:    night-shift-<timestamp>
Started:  <timestamp>
Finished: <timestamp>

TASKS COMPLETE (N)
  [TECH-123] add-user-search-endpoint
    branch:  night-shift/add-user-search-endpoint
    path:    /tmp/worktrees/add-user-search-endpoint
    summary: night-shift-plans/summary-add-user-search-endpoint.html
    Linear:  complete_execution called - issue updated

SKIPPED (M)
  [TECH-126] "Migrate DB schema"
    reason: blocked by unmerged #98
    Linear: skip_execution called

BLOCKED (K)
  [TECH-130] "Add caching layer"
    reason: Redis not configured in this environment
    Linear: block_execution called

ISSUES ENCOUNTERED
  [TECH-124]: tests failing (redis mock); committed as-is, see worktree

Next steps for reviewer:
  1. Open night-shift-plans/summary-<slug>.html in browser for full context
  2. cd <worktree path> to inspect directly
  3. Push + open PR manually when satisfied
  4. Linear issues already updated via MCP (status, notes, skip/block reasons)
```

---

## Error Handling & Guardrails

| Situation | MCP Action | Local Action |
|-----------|-----------|--------------|
| claim returns "already claimed" | — | Move to next execution |
| Task ambiguous or no spec | skip_execution(reason) | Log in report |
| Opus plan review NO-GO twice | block_execution(reason) | Log in report |
| Tests fail after 2 retries | add_note(failure details) | Flag in report ⚠️ |
| Rate limits / timeouts | add_note("retrying") | Pause 30s, retry once |
| Worktree dir already exists | — | git worktree remove --force, recreate |

Never:
- Push directly to main/master
- Delete or modify unrelated files
- Expose secrets or credentials in commits
- Run destructive DB migrations

---

## Detecting Project Conventions

```bash
[ -f package-lock.json ] && echo "npm"
[ -f yarn.lock ]         && echo "yarn"
[ -f pnpm-lock.yaml ]    && echo "pnpm"
[ -f pyproject.toml -o -f setup.py ] && echo "python"
[ -f go.mod ]    && echo "go"
[ -f Cargo.toml ] && echo "rust"
[ -f encore.app ] && echo "encore test ./..."
```

---
