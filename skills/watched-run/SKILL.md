---
name: watched-run
description: >
  Default workflow for real implementation work in a watched (human-present)
  local session: ticket, plan and critical plan review, TDD, early CodeRabbit
  CLI review, Clean Code + Sandi Metz self-review, independent Codex/Claude CLI
  reviews, hunk-anchored Night Shift MCP records, PR, and CI/review iteration. Trigger on build, implement, fix,
  add, or change-functionality requests and explicit watched-run invocations.
  Exclude standalone scripts and throwaway utilities not meant to ship as
  product functionality; if that boundary is unclear, ask once and follow
  the answer. Do not use for unattended overnight queues (night-shift /
  feedback-shift). Uses create_execution in record-only mode, never queue,
  claim, block, or skip operations.
---

# Watched Run

A watched (human-present) single-ticket development session. Ticket content
comes from Linear directly. Start CodeRabbit CLI review during implementation;
require independent Codex and Claude CLI reviews before shipping (skip Claude
when Claude is the producer), then follow CI + CodeRabbit on the PR.
The Night Shift MCP is used only in its **record-only** mode
(`create_execution`) to capture the plan and hunk-anchored explanations of
what the code does and why — it never enters the autonomous queue.

The record this produces is read in the same dashboard as overnight work, so
it uses the same payload shapes and the same phase signalling as `night-shift`
and `work-shift` — field shapes are in
[`references/review-report.md`](references/review-report.md), read it before
Step 6. A reviewer should not be able to tell which skill produced an
execution from its shape, only from its `agent_id`.

## How this differs from night-shift

Everything below is shared with `night-shift` unless this table says
otherwise. If you find another difference, it is drift, not design.

| | night-shift | watched-run (this skill) |
|---|---|---|
| Work arrives via | `get_queue` → `claim_execution` | `create_execution` for one ticket |
| Enters the overnight queue | yes | **no** — recorded work only |
| Isolation | git worktree per task | ordinary feature branch, local checkout |
| Thin / missing spec | `skip_execution` — never spec unattended | **ask the user**, or run `spec_ticket` |
| Stuck, blocked, NO-GO ×2 | `block_execution` and move on | **escalate to the user and wait** |
| Ends with | branch pushed, **no PR** | branch pushed, **PR opened**, CI followed |
| Human | asleep | present throughout |

## Scope — when this runs

This is the **default** for implementation work in this repo, not an
opt-in. Concretely:

- "Implement X" / "build Y" / "fix Z" / "add this feature" / a Linear
  ticket handed over → run this cycle.
- "Write a script that does X" / a one-off export, migration runner, or
  throwaway utility not meant to ship as part of the product → skip this
  skill, just write the script directly. No ticket, no plan, no PR.
- Genuinely unclear which bucket it's in → ask once: "Want me to run this
  through the full cycle (ticket/plan/review/PR), or just write it
  directly?" — then do whichever the user picks. Don't silently default
  either way when it's ambiguous.
- If no ticket has been given yet and this is real implementation work,
  ask for one (a Linear ID like `TECH-123`, or a description) before doing
  anything else — don't start implementing untracked.

## Cycle

```
1. TICKET    - Linear:get_issue(id) -> title, description, acceptance criteria, labels
2. RECORD    - create_execution(linear_issue_id) -> execution_id (record-only, never queued)
3. PLAN      - write implementation plan; store_artifact(plan); critical subagent
               review (GO/NO-GO) -> update_progress(planning) + add_note(verdict)
4. IMPLEMENT - TDD: red -> green -> refactor; start CodeRabbit CLI on the first
               coherent diff -> update_progress(tdd) then update_progress(implement)
5. VERIFY    - run tests/lint; confirm every FR/NFR is actually met
               -> update_progress(verify) + add_note(test + requirements summary)
6. REVIEW    - Clean Code + Sandi Metz review; implement all findings;
               store_artifact(review) + store_review_report with hunk-annotated
               explanations; CodeRabbit + Codex + Claude CLI reviews (Claude
               skipped if producer) -> store_critic_report with attributed,
               risk-flagged annotations -> update_progress(review)
7. SHIP      - commit, push, open a PR -> update_progress(commit)
               -> complete_execution (record only, not a queue exit)
8. CI/REVIEW - wait for CI + CodeRabbit; address every comment (add_review_comment
               type:"explain" for anything non-obvious you touch); repeat until green
9. REPORT    - summarize what changed, link the PR + execution record, note open items
```

**Every phase transition gets an `update_progress` call**, same as night-shift
and work-shift. `create_execution` opens the record at
`in_progress` / `planning`; without these calls the dashboard shows the run
sitting in `planning` from kickoff to completion and a stall is undiagnosable.

### 1. Get the ticket

```
Linear:get_issue(id: "TECH-123", includeRelations: true)
```
Treat the description + acceptance criteria as authoritative. If they're too
thin to plan from, ask rather than guess — this is a watched run, a quick
question is cheap.

This is also where the spec work night-shift refuses to do lands: an
unattended run calls `skip_execution(reason "needs spec")` precisely so a
human-present session can spec it properly. For a genuinely under-specified
ticket, load the methodology with `get_spec_skill` and run `spec_ticket` to
start a Socratic spec session, then plan from the written spec. Never
spec-and-implement from your own guesses in one pass.

### 2. Record (not queue)

```
Night Shift MCP -> create_execution
  agent_id:        "watched-run-YYYYMMDD-NNN"
  linear_issue_id:  "TECH-123"
```
Gives you an `execution_id` everything below attaches to. This is a
history/reasoning record, never claimed by the overnight agent, with no
queue effect until `complete_execution` at the end.

### 3. Plan + plan review

```
Night Shift MCP -> update_progress
  substatus: "planning"
  notes:     "Loading spec and codebase context"
```

Cover: 1. Goal · 2. Affected files · 3. Data/type changes · 4. Test strategy
(TDD) · 5. Implementation steps · 6. Edge cases & risks · 7. Out of scope ·
8. Requirements coverage (every ticket FR/NFR -> implementation step and verification evidence).
Do not mark a ticket requirement out of scope without an explicit scope change
from the user. Keep the numbered step labels from item 5 stable — they become
the `planCheck` rows in Step 6.

```
Night Shift MCP -> store_artifact
  execution_id:   <execution_id>
  agent_id:       "watched-run-YYYYMMDD-NNN"
  artifact_type:  "plan"
  content:        <full plan markdown>
```
Don't write the plan into the repo — it lives on the execution record.

Spawn a critical review subagent before writing code (default model: Opus;
use whichever the user has indicated otherwise). Prompt: "You are a senior
engineer doing a pre-implementation plan review. Be critical. Flag vague
steps, missing edge cases, incorrect file assumptions, anything likely to
break during TDD. End with GO / NO-GO and required changes if NO-GO."

GO -> proceed. NO-GO -> revise once, re-store, re-review. Still NO-GO -> stop
and flag to the user — escalate with the findings and numbered options, do not
end the run on your own judgement the way an unattended shift would. Record
the verdict either way:

```
Night Shift MCP -> add_note
  note: "Plan review: <GO|NO-GO>. <summary of key findings>"
```

### 4. Implement (TDD)

Read [references/cli-reviews.md](references/cli-reviews.md) and check the
required CLIs before implementing. Start CodeRabbit CLI as soon as the first
coherent implementation diff exists; collect findings while continuing work.
Do not defer it until verification, push, or PR creation.

Read `/mnt/skills/user/tdd/SKILL.md` before writing any code, then
Red -> Green -> Refactor per plan step, on a normal feature branch (no
worktree needed for a watched local run):
```bash
git checkout -b <type>/<slug>   # e.g. feat/user-search-endpoint
```

```
Night Shift MCP -> update_progress
  substatus: "tdd"        # then "implement" once tests exist and code starts
  notes:     "<current step>"
```

### 5. Verify

Run the repo's actual test/lint commands (see root CLAUDE.md / AGENTS.md).
When a ticket is associated with the work, verify every functional requirement
(FR) and non-functional requirement (NFR) from that ticket against concrete
evidence. Fix anything unmet; if a requirement cannot be met or verified, report
the blocker and do not ship or mark the work complete.

```
Night Shift MCP -> update_progress
  substatus: "verify"
  notes:     "Running full test suite"

Night Shift MCP -> add_note
  note: "Tests: <PASS|FAIL>. <N> passed, <M> failed.
         Requirements: <X>/<Y> FR met, <A>/<B> NFR met. <unmet ids>"
```

Record each requirement's status and supporting evidence in the execution's
review report. Once all are verified, explicitly note: "All functional and
non-functional requirements of <ticket ID> are met." Include this confirmation
in the PR description and final report, and recheck it after review fixes.

### 6. Review — self and independent CLI reviews, all hunk-anchored

This is where "what does this code do, what are the risk factors, explain
the critical pieces" gets captured — in the execution's review record,
anchored to actual lines, not in a scratch file.

```
Night Shift MCP -> update_progress
  substatus: "review"
  notes:     "Running clean-code and Sandi Metz reviews"
```

**Named self-reviews** — the same two passes night-shift and work-shift run,
and the source of the `selfReview[]` rule names in the review report:

- Clean Code — read `/mnt/skills/user/clean-code/SKILL.md`. Naming, function
  size, single responsibility, comments vs. code, error handling.
- Sandi Metz — read `/mnt/skills/user/sandi-metz-reviewer/SKILL.md`. Class
  responsibility, Law of Demeter, message passing, flocking rules.

Implement ALL findings and re-run the tests. Store the combined markdown on
the execution — never as files in the repo:

```
Night Shift MCP -> store_artifact
  execution_id:   <execution_id>
  agent_id:       "watched-run-YYYYMMDD-NNN"
  artifact_type:  "review"
  content:        <combined Clean Code + Sandi Metz review markdown>
```

**Self-review report**: fix findings from your own read, re-run tests, then
store the structured self-assessment that powers the Focus Review and
Walkthrough dashboard modes — full field shapes in
[`references/review-report.md`](references/review-report.md):
```
Night Shift MCP -> store_review_report
  execution_id: <execution_id>
  agent_id:     "watched-run-YYYYMMDD-NNN"
  confidence:   <0-100>   # >=85 safe, 70-84 skim, <70 scrutinize
  intro:        "<2-3 sentence first-person summary>"
  outro:        "<first-person closing recommendation / open judgement calls>"
  requirements: [ "<FR/NFR>", ... ]
  planCheck:    [ { step, status: match|partial|diverged, note, narration, diff }, ... ]
  selfReview:   [ { rule, verdict: pass|warn|fail, note, narration, diff }, ... ]
  tests:        { passed, failed, added }
  diff:         [ { name, add, del, lines: [ { k: ctx|add|del, text,
                    annotation?: { summary, rationale?, confidence, tags? } }, ... ] }, ... ]
```
`diff.lines[].annotation` explains what a piece of code does and why —
attach it to 1-3 non-obvious lines per file, not every line.

**Independent CLI reviews:** follow
[references/cli-reviews.md](references/cli-reviews.md): CodeRabbit plus a fresh
Codex CLI review and a fresh Claude CLI review, unless Claude produced the
code. Commit the candidate before reviewing, resolve findings, and obtain
reviews of the final candidate before shipping. Store full outputs as review
artifacts and consolidate attributed findings under the distinct critic ID,
anchored to the reviewed commit:
```
Night Shift MCP -> store_critic_report
  execution_id: <execution_id>
  agent_id:     "watched-run-critic-YYYYMMDD-NNN"
  commit_sha:   "$(git rev-parse HEAD)"
  verdict:      approve | approve_with_nits | request_changes
  confidence:   <0-100>
  summary:      "<overall takeaway>"
  files: [ { path, summary?, annotations: [
    { newRange: [start, end], summary, rationale?, severity: blocker|warn|nit, tags? }
  ] } ]
```
`severity` + `rationale` is the risk-factor callout — concrete, not vague.
Empty `files: []` is a valid, honest clean review.

### 7. Ship

Ship only after every ticket FR/NFR is verified as met, the confirmation is
recorded, the required CLI reviews complete, and actionable findings are
resolved. If the commit below changes the reviewed candidate, repeat the
final reviews before pushing.

```
Night Shift MCP -> update_progress
  substatus: "commit"
  notes:     "Final commit; opening PR"
```

```bash
git add -A
git diff --cached --quiet || git commit -m "feat: <what> — <why>"
git push -u origin <branch>
gh pr create --title "<TECH-123> <title>" --body "$(cat <<'EOF'
## Summary
<1-3 sentences>

## Linear
TECH-123

## Test plan
<how you verified>
EOF
)"
```
Never force-push once the PR is open and someone (or CodeRabbit) may be reading it.

```
Night Shift MCP -> complete_execution
  execution_id:  <execution_id>
  agent_id:      "watched-run-YYYYMMDD-NNN"
  branch:        "<branch>"
  commit_sha:    "$(git rev-parse HEAD)"
  remote:        "origin"
  pushed_ref:    "<branch>"
  pushed_sha:    "$(git rev-parse HEAD)"   # re-read AFTER push
  worktree_path: "$(pwd)"
  summary_html:  <self-contained HTML — see references/review-report.md>
```

`complete_execution` rejects the completion if `pushed_sha` and `commit_sha`
disagree. If the push itself failed, do **not** complete — report the error to
the user and never invent a ref to satisfy the schema.

### 8. Wait for CI + CodeRabbit, then address comments

```bash
gh pr checks <PR-number> --watch
gh api repos/:owner/:repo/pulls/<PR-number>/comments
gh api repos/:owner/:repo/pulls/<PR-number>/reviews
```
For each comment: restate it as a concrete scoped edit, make the smallest
fix, and if it touches something non-obvious, leave an inline explain note
on the execution record:
```
Night Shift MCP -> add_review_comment
  execution_id: <execution_id>
  author:       "watched-run-YYYYMMDD-NNN"
  type:         "explain"
  file:         "<repo-relative path>"
  newRange:     [start, end]
  body:         "<why this change / what it protects against>"
```
Commit naming the comment it resolves, repeat the final CLI reviews on the
new candidate before pushing, push (no force-push), re-run
`gh pr checks --watch`; loop until green or nothing addressable without a
human decision. Stale/ambiguous comments: say so, don't guess.

### 9. Report

What was built, PR link, CI status, comments addressed, CLI reviewer statuses
(and any Claude-producer exception), pointer to the
execution record (plan + review + critic findings), anything left open.

## Guardrails (always)

| Never |
|---|
| Push directly to main/master |
| Force-push a branch someone (or CodeRabbit) may be reading |
| Delete or modify unrelated files |
| Expose secrets/credentials in commits |
| Run destructive DB migrations |
| Expand a review comment into unrequested scope |
| Write plan / review / summary files into the repo (use `store_artifact` + `summary_html`) |
| Call `claim_execution` / `get_queue` for this record (it must stay unqueued) |
