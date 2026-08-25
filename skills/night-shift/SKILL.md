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
worktree, broadcasts real-time phase updates, and records the plan, review,
and critic findings into the execution so the morning dashboard review looks
the same as any other Night Shift MCP run (see `watched-run` / `work-shift`).

---

## MCP Tools Reference

All Night Shift coordination goes through the MCP server. Never fall back to
reading a local todo.md for the queue — always use get_queue first.

| Tool | When to call |
|---|---|
| get_queue | Once at startup — fetches ready executions from Linear |
| claim_execution | Before touching any task — atomic lock |
| get_issue_spec | Immediately after claiming — loads full Linear issue + FR/NFR |
| update_progress | At every phase transition |
| add_note | To log observations, plan review results, test summaries |
| store_artifact | Plan and combined Clean Code + Sandi Metz review markdown |
| store_review_report | Self-review: hunk-annotated hand-off for the dashboard |
| store_critic_report | Independent critic pass: risk-flagged annotations |
| block_execution | Task cannot proceed due to external dependency |
| skip_execution | Task is ambiguous or out of scope for tonight |
| complete_execution | Task fully implemented, tests green, committed |
| get_execution | To inspect state of a specific execution if needed |

agent_id convention: `night-shift-YYYYMMDD-NNN` (e.g. `night-shift-20250126-001`).
The critic pass uses a distinct id: `night-shift-critic-YYYYMMDD-NNN` — same
reason as `watched-run`/`work-shift`: same id makes it a self-review wearing a
costume, and the dashboard can no longer tell the two apart.

Field shapes for `store_review_report` / `store_critic_report` / `summary_html`
are in [`references/review-report.md`](references/review-report.md) — read it
before Step 3f. It is the same payload shape `watched-run` and `work-shift`
send, so a reviewer sees one consistent format regardless of which skill
produced the execution.

---

## High-Level Flow

```
1. INTAKE      - get_queue → display plan → confirm scope with user
2. FOR EACH TASK (in queue order):
   a. CLAIM    - claim_execution (atomic); get_issue_spec (incl. FR/NFR)
   b. PLAN     - Read docs + spec, write detailed plan (incl. requirements
                 coverage), store_artifact(plan), Opus review
                 → update_progress(planning) + add_note(plan review result)
   c. BRANCH   - Create git worktree on a fresh branch
   d. IMPLEMENT- TDD: write failing tests first, then code to pass them
                 → update_progress(tdd) then update_progress(implement)
   e. VERIFY   - Run tests / lint; walk every FR/NFR against evidence; iterate
                 if failing → update_progress(verify) + add_note(test summary)
   f. REVIEW   - Clean Code + Sandi Metz review; implement all findings;
                 store_artifact(review) + store_review_report (self);
                 independent critic subagent → store_critic_report
                 → update_progress(review)
   g. COMMIT   - Commit work; record worktree (no PR)
                 → update_progress(commit) → complete_execution(branch,
                   commit_sha, worktree_path, summary_html)
3. REPORT      - Print morning summary: worktrees ready, tasks skipped/blocked
```

Read [`references/worktree-ops.md`](references/worktree-ops.md) for git
worktree command patterns.

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

Returns the full Linear issue (title, description, parent issue, labels,
linked sub-issues) plus parsed `functional_requirements` /
`non_functional_requirements` (each `{id, text}`). **That FR/NFR list is the
authoritative contract for this task** — it drives the plan's requirements
coverage section (3b), the verify checklist (3e), and the `requirements` field
of the review report (3f). Only fall back to the description's acceptance
criteria when the spec has no FR/NFR sections.

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
8. Requirements coverage — every FR and NFR id mapped to the step(s) and
   test(s) that satisfy it. Anything not intended to be satisfied is called
   out here as blocked or out of scope. A silently dropped requirement is the
   most expensive failure mode a human reviewer can hit in the morning.

Keep the numbered step labels from item 5 stable — they become the
`planCheck` rows in 3f.

Store it on the execution — never write the plan into the target repo, it
would ride into whatever the human eventually pushes and pollute their diff:

```
Night Shift MCP → store_artifact
  execution_id:   <execution_id>
  agent_id:       "night-shift-<timestamp>"
  artifact_type:  "plan"
  content:        <full plan markdown>
```

#### Opus plan review (subagent)

Spawn a subagent (default model: Opus; use whichever the user has indicated
otherwise) with system prompt:
"You are a senior engineer doing a pre-implementation plan review. Be critical.
Flag vague steps, missing edge cases, incorrect file assumptions, and anything
that will likely cause problems during TDD."

User message: full plan content + "Review this plan. For each section note any
gaps, risks, or improvements. End with GO / NO-GO and required changes if NO-GO."

Parse response:
- GO → proceed to 3c
- NO-GO → apply required changes to the plan, re-store_artifact, re-run review once more
- Still NO-GO after one revision → call block_execution with reason; skip task

Log review result via MCP:

```
Night Shift MCP → add_note
  note: "Opus plan review: <GO|NO-GO>. <summary of key findings>"
```

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

Green tests are necessary, not sufficient: walk the FR/NFR list from 3a
explicitly and point at concrete evidence (the test that exercises it, or the
code that guarantees it) for each one.

Log the outcome:

```
Night Shift MCP → add_note
  note: "Tests: <PASS|FAIL>. <N> passed, <M> failed.
         Requirements: <X>/<Y> FR met, <A>/<B> NFR met. <unmet ids>"
```

If tests fail, or a requirement stays unmet, after 2 fix attempts: commit what
works, add_note with the details, flag in morning report under Issues
Encountered, continue.

### 3f. Review — self, then critic, both hunk-anchored

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

Store the combined review markdown as an artifact — not as files in the
worktree, same reasoning as the plan:

```
Night Shift MCP → store_artifact
  execution_id:  <execution_id>
  agent_id:      "night-shift-<timestamp>"
  artifact_type: "review"
  content:       <combined Clean Code + Sandi Metz review markdown>
```

Then store the structured self-assessment that powers the Focus Review and
Walkthrough dashboard modes — field shapes are in
[`references/review-report.md`](references/review-report.md):

```
Night Shift MCP → store_review_report
  execution_id, agent_id, confidence, intro, outro,
  requirements, planCheck, diff, selfReview, tests
```

```bash
git add -A
git commit -m "refactor: apply clean-code + Sandi Metz review findings"
```

**Critic pass** — an independent adversarial second opinion, not the same
agent grading its own work. Spawn a subagent (default model: Opus; use
whichever the user has indicated otherwise):

> You are a senior engineer doing an adversarial post-implementation review.
> You did NOT write this code. Find real defects: correctness bugs, missing
> edge cases, risky migrations, security issues. Anchor every finding to a
> file and a line range.

Send `git diff origin/$BASE_BRANCH..HEAD` plus a request for per-file
findings with a `[start, end]` line range, severity (`blocker`/`warn`/`nit`),
summary, optional rationale, an overall summary, and a verdict.

```
Night Shift MCP → store_critic_report
  execution_id:  <execution_id>
  agent_id:      "night-shift-critic-<timestamp>"
  commit_sha:    "$(git rev-parse HEAD)"
  verdict:       approve | approve_with_nits | request_changes
  confidence:    <0-100>
  summary:       "<overall takeaway>"
  files:         [ ... ]   # empty array is a valid, honest clean review
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
COMMIT_SHA=$(git rev-parse HEAD)
```

Do NOT push or open a PR. Generate a self-contained HTML summary (no external
deps, inline CSS, `prefers-color-scheme`, no relative links — nothing on disk
to link to yet) covering: header with task title/date/Linear link, plan
review verdict, per-file change table, test results, requirements coverage,
known issues. Template and exact expectations are in
[`references/review-report.md`](references/review-report.md). Pass it
directly to `complete_execution` — do not commit it into the worktree; a human
who later pushes this branch should get their own diff back, not agent-authored
docs riding along in it.

Mark the execution complete:

```
Night Shift MCP → complete_execution
  agent_id:      "night-shift-<timestamp>"
  execution_id:  <execution_id>
  branch:        "$BRANCH"
  commit_sha:    "$COMMIT_SHA"
  worktree_path: "$WORKTREE_PATH"
  summary_html:  <self-contained HTML — see references/review-report.md>
```

Record the worktree location locally too, for the morning report:

```bash
echo "  branch=$BRANCH  path=$WORKTREE_PATH" >> /tmp/night-shift-worktrees.txt
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
  1. Open the execution in the Night Shift dashboard for the plan, self-review,
     and critic findings (same views as watched-run / work-shift executions)
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
| Requirement unmet after 2 attempts | add_note(unmet ids) | Flag in report ⚠️ |
| Rate limits / timeouts | add_note("retrying") | Pause 30s, retry once |
| Worktree dir already exists | — | git worktree remove --force, recreate |

Never:
- Push directly to main/master
- Delete or modify unrelated files
- Expose secrets or credentials in commits
- Run destructive DB migrations
- Write plan/review/summary files into the target repo (use store_artifact /
  summary_html instead — they end up in whatever the human eventually pushes)

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
