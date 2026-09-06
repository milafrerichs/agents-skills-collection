---
name: watched-run
description: Default workflow for real implementation work in this repo — any time someone asks to build, implement, fix, add, or change functionality (not a one-off script), run this end-to-end in a watched (human-present) local session — plan, critical plan review, TDD implementation, self + critic review with hunk-anchored explanations recorded via Night Shift MCP (create_execution, never queued), PR, then iterate on CI + CodeRabbit comments until green. Trigger by default on implementation requests, not just explicit invocations ("work TECH-123 with me", "let's build this ticket now", "watched run on TECH-456", "implement X", "fix Y", "add Z"). Do NOT trigger for a standalone script or quick one-off ("write a script that...", a throwaway export/migration/utility not meant to ship as part of the product) — just write those directly, no plan/PR ceremony. If it's unclear which bucket a request falls into, ask once rather than guessing, and follow the user's answer. Do NOT use for the unattended overnight queue (that's the night-shift / feedback-shift skills) — this skill never calls get_queue, claim_execution, block_execution, or skip_execution.
---

# Watched Run

A watched (human-present) single-ticket development session. Ticket content
comes from the Night Shift MCP's `get_issue_spec` — the same structured
FR/NFR + rework contract night-shift and work-shift plan against. Review
comes from CI + CodeRabbit on a real PR. The Night Shift MCP is used in
**record-only** mode (`create_execution`) to capture the plan and
hunk-anchored explanations of what the code does and why — it never enters
the autonomous queue.

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
1. TICKET    - create_execution(linear_issue_id) -> execution_id (record-only, never queued);
               get_issue_spec(execution_id) -> title, description, FR/NFR, rework state
2. REWORK?   - if is_rework, address the reviewer's feedback on the prior branch instead
               of steps 3-5 (see "Feedback iteration" below)
3. PLAN      - write implementation plan; store_artifact; critical subagent review (GO/NO-GO)
4. IMPLEMENT - TDD: red -> green -> refactor; update_progress at each phase transition
5. VERIFY    - run tests/lint; confirm every FR/NFR is actually met
6. REVIEW    - self-review; store_review_report with hunk-annotated explanations;
               critic subagent -> store_critic_report with risk-flagged annotations
7. SHIP      - commit, push, open a PR; complete_execution (record only, not a queue exit)
8. CI/REVIEW - wait for CI + CodeRabbit; address every comment (add_review_comment
               type:"explain" for anything non-obvious you touch); repeat until green
9. REPORT    - summarize what changed, link the PR + execution record, note open items
```

### 1. Record, then get the ticket

```
Night Shift MCP -> create_execution
  agent_id:        "watched-run-YYYYMMDD-NNN"
  linear_issue_id:  "TECH-123"
```
Gives you an `execution_id` everything below attaches to. This is a
history/reasoning record, never claimed by the overnight agent, with no
queue effect until `complete_execution` at the end.

```
Night Shift MCP -> get_issue_spec
  execution_id: <execution_id>
```
Returns the full Linear issue (title, description, parent issue, labels) plus
parsed `functional_requirements` / `non_functional_requirements` (each `{id,
text}`) — the same structured contract night-shift and work-shift plan
against, so use it here too rather than a raw Linear ticket fetch. It also
reports rework state: `is_rework`, the current round of `feedback` (newest
first), and `previous_branch` / `previous_worktree_path` if a reviewer
already sent this ticket back once.

Treat the FR/NFR list as authoritative over the description's prose. If it's
too thin to plan from, ask rather than guess — this is a watched run, a quick
question is cheap.

### 2. Feedback iteration (is_rework)

If `get_issue_spec` returned `is_rework: true`, this ticket was already run
once (by any of watched-run / work-shift / night-shift) and a reviewer left
feedback. Do not re-plan or reimplement from scratch:

1. Recover the prior work: `git fetch origin` then
   `git checkout previous_branch` (or `git worktree add`/`checkout -b` from
   it if it no longer exists locally) — never start a fresh branch off
   `main` when a prior branch exists.
2. Restate each `feedback` item as a concrete change before touching code.
3. Store a short feedback-response plan instead of the full 8-part one:
   `store_artifact(artifact_type: "plan", content: "## Feedback response\n- Feedback: <quote> -> Change: <what you'll do>\n...")`.
4. Make the change, then continue at step 5 (Verify) below as normal. In
   step 6, note in `selfReview` that this round addressed feedback rather
   than an original plan, and mark `planCheck` per feedback item.
5. Push the same branch — this is what lets the reviewer see the new round
   on the PR they already opened, rather than a disconnected second PR.

### 3. Plan + plan review

```
Night Shift MCP -> update_progress
  execution_id: <execution_id>
  agent_id:     "watched-run-YYYYMMDD-NNN"
  substatus:    "planning"
```
Call `update_progress` at each phase transition below (`planning`, `tdd`,
`implement`, `verify`, `review`, `commit`) — a human is present, but the
dashboard is what a reviewer opens later, and it should show live progress
for a watched run exactly as it does for night-shift/work-shift.

Cover: 1. Goal · 2. Affected files · 3. Data/type changes · 4. Test strategy
(TDD) · 5. Implementation steps · 6. Edge cases & risks · 7. Out of scope ·
8. Requirements coverage (every FR/NFR -> step/test, or explicitly out of scope).

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
and flag to the user.

### 4. Implement (TDD)

```
Night Shift MCP -> update_progress
  substatus: "tdd"
```

Red -> Green -> Refactor per plan step, on a normal feature branch (no
worktree needed for a watched local run):
```bash
git checkout -b <type>/<slug>   # e.g. feat/user-search-endpoint
```

Once tests exist and implementation is underway:
```
Night Shift MCP -> update_progress
  substatus: "implement"
```

### 5. Verify

```
Night Shift MCP -> update_progress
  substatus: "verify"
```

Run the repo's actual test/lint commands (see root CLAUDE.md / AGENTS.md).
Walk every FR/NFR from the plan against concrete evidence — fix anything
unmet, or flag it explicitly.

### 6. Review — self, then critic, both hunk-anchored

```
Night Shift MCP -> update_progress
  substatus: "review"
```

This is where "what does this code do, what are the risk factors, explain
the critical pieces" gets captured — in the execution's review record,
anchored to actual lines, not in a scratch file.

**Self-review**: fix findings from your own read, re-run tests, then:
```
Night Shift MCP -> store_review_report
  execution_id: <execution_id>
  agent_id:     "watched-run-YYYYMMDD-NNN"
  confidence:   <0-100>   # >=85 safe, 70-84 skim, <70 scrutinize
  intro:        "<2-3 sentence first-person summary>"
  outro:        "<first-person closing recommendation / open judgement calls>"
  requirements: [ "<FR/NFR>", ... ]
  planCheck:    [ { step, status: match|partial|diverged, note, narration }, ... ]
  selfReview:   [ { rule, verdict: pass|warn|fail, note }, ... ]
  tests:        { passed, failed, added }
  diff:         [ { name, add, del, lines: [ { k: ctx|add|del, text,
                    annotation?: { summary, rationale?, confidence, tags? } }, ... ] }, ... ]
```
`diff.lines[].annotation` explains what a piece of code does and why —
attach it to 1-3 non-obvious lines per file, not every line.

**Critic pass** (independent, adversarial — correctness bugs, missing edge
cases, migrations, security), anchored to the reviewed commit:
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

```
Night Shift MCP -> update_progress
  substatus: "commit"
```

```bash
git add -A && git commit -m "feat: <what> — <why>"
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
  pushed_ref:    "<branch>"
  pushed_sha:    "$(git rev-parse HEAD)"   # re-read AFTER push
  worktree_path: "$(pwd)"
  summary_html:  <short self-contained HTML: what changed, link to PR>
```

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
Commit naming the comment it resolves, push (no force-push), re-run
`gh pr checks --watch`; loop until green or nothing addressable without a
human decision. Stale/ambiguous comments: say so, don't guess.

### 9. Report

What was built, PR link, CI status, comments addressed, pointer to the
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
| Call `claim_execution` / `get_queue` for this record (it must stay unqueued) |
| Write plan/review/summary files into the repo (use store_artifact / summary_html — a human reviewing the diff should get their own diff back, not agent-authored docs riding along in it) |
