---
name: watched-run
description: >
  Default workflow for real implementation work in a watched (human-present)
  local session: ticket, baseline, red-proof E2E tests from a separate test
  author, scenario-based plan and critical plan review, TDD implementation,
  E2E + boundary-test verification, early CodeRabbit CLI review, independent Codex/Claude CLI reviews, hunk-anchored Night Shift
  MCP records, PR, and CI/review iteration. Trigger on build, implement, fix,
  add, or change-functionality requests and explicit watched-run invocations.
  Exclude standalone scripts and throwaway utilities not meant to ship as
  product functionality; if that boundary is unclear, ask once and follow
  the answer. Do not use for unattended overnight queues (night-shift /
  feedback-shift). Uses create_execution in record-only mode, never queue,
  claim, block, or skip operations.
---

# Watched Run

A watched (human-present) single-ticket development session. Ticket content
comes from Linear directly. Testing follows
[references/e2e-contract.md](references/e2e-contract.md). E2E acceptance
scenarios define the work, organise the plan and verify the result. They are
written and committed by a separate test author before implementation, one
test per scenario. Implementation itself is TDD (red -> green -> refactor with
unit/integration tests). Boundary tests validate every external boundary. That contract wins over anything below or in AGENTS.md that
conflicts with it. Start CodeRabbit CLI review during implementation;
require independent Codex and Claude CLI reviews before shipping (skip Claude
when Claude is the producer), then follow CI + CodeRabbit on the PR.
The Night Shift MCP is used only in its **record-only** mode
(`create_execution`) to capture the plan and hunk-anchored explanations of
what the code does and why — it never enters the autonomous queue.

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
               -> get_issue_spec -> FR/NFR snapshot (derive_requirements if the ticket has none)
3. BASELINE  - branch at base; just e2e / just boundary / just verify all pass on the base
4. E2E RED   - scenarios confirmed; separate test author (spec + base only, never the plan)
               commits one E2E test per scenario; each fails on an assertion -> RED_PROOF_SHA
5. PLAN      - write implementation plan; store_artifact; critical subagent review (GO/NO-GO)
6. IMPLEMENT - TDD per plan step (red -> green -> refactor) toward the red E2E scenarios;
               boundary test per touched boundary; never edit E2E files; fix loop stops
               after 2 rounds without fewer failures; CodeRabbit on first diff
7. VERIFY G3 - just e2e / just boundary / just verify on the final SHA, reported separately;
               hand checks; record_requirement_status per id as it is verified
8. REVIEW    - self-review; store_review_report with hunk-annotated explanations;
               CodeRabbit + Codex + Claude CLI reviews (Claude skipped if producer)
               -> store_critic_report with attributed, risk-flagged annotations
9. SHIP      - commit, push, open a PR; complete_execution (record only, not a queue exit)
               -> check requirement_gaps
10. CI/REVIEW - wait for CI + CodeRabbit; address every comment (add_review_comment
               type:"explain" for anything non-obvious you touch); repeat until green
11. REPORT   - summarize what changed, link the PR + execution record, note open items
```

### 1. Get the ticket

```
Linear:get_issue(id: "TECH-123", includeRelations: true)
```
Treat the description + acceptance criteria as authoritative; the FR/NFR
contract you verify against comes from `get_issue_spec` in step 2. If they're
too thin to plan from, ask rather than guess — this is a watched run, a quick
question is cheap.

### 2. Record (not queue)

```
Night Shift MCP -> create_execution
  agent_id:        "watched-run-YYYYMMDD-NNN"
  linear_issue_id:  "TECH-123"
```
Gives you an `execution_id` everything below attaches to. This is a
history/reasoning record, never claimed by the overnight agent, with no
queue effect until `complete_execution` at the end.

Then load the requirements snapshot for the record:

```
Night Shift MCP -> get_issue_spec
  execution_id: <execution_id>
```

`functional_requirements` / `non_functional_requirements` (each `{id, text}`)
are the requirements contract for the run and the only ids
`record_requirement_status` (step 7) accepts. They are a snapshot, not the
live ticket: if `spec_drift` lists added / removed / reworded ids, keep working
against the snapshot, tell the user, and mention the drift in the review
report's `outro`. Use ids exactly as returned (unnumbered bullets get `FR-U1`
style ids).

**No requirements on the ticket.** When `requirements_source` is `"none"`,
write them yourself from the acceptance criteria and description, show the
list to the user, and once they confirm, store them:

```
Night Shift MCP -> derive_requirements
  execution_id:   <execution_id>
  agent_id:       "watched-run-YYYYMMDD-NNN"
  functional:     [ "<testable behaviour the change MUST have>", ... ]
  non_functional: [ "<performance / security / persistence constraint>", ... ]
```

They are stored as `agent_derived` with ids `FR-U1…` / `NFR-U1…`; re-call
`get_issue_spec` to pick them up. The server rejects this when the ticket has
its own requirements — never use it to replace or extend those.

### 3. Baseline

Create the branch at the PR target (base) before anything else. No worktree is
needed for a watched local run:
```bash
git checkout -b <type>/<slug>   # e.g. feat/user-search-endpoint
BASE_SHA=$(git rev-parse HEAD)
```
On the base, run `just e2e`, `just boundary` and `just verify` and record each
result separately (`add_note`). All three must pass. If one fails, stop and
report it. If the `e2e` or `boundary` recipe is missing, ask the user before
adding it (Justfiles are tier 2). See
[references/e2e-contract.md](references/e2e-contract.md#baseline-before-work-starts).

### 4. E2E red proof (separate test author)

Follow [references/e2e-contract.md](references/e2e-contract.md) for the
details:

1. Confirm the acceptance scenarios (Given/When/Then, with ids, each mapped
   to the FRs it covers). If the ticket has none, derive them and get the
   user's confirmation.
2. Spawn a **fresh** test-author subagent (never a fork) that sees only the
   spec and the repo at `BASE_SHA`, never the plan. It writes one E2E test per
   scenario, named by scenario id, and commits them by themselves.
3. Run `just e2e`. Every scenario test must fail on an assertion, not on a
   setup error. Record `RED_PROOF_SHA`, the E2E test file list and each
   failure line on the execution.

From here on, the implementer never edits those files. If one looks wrong,
raise a `TEST_DISPUTE` with evidence and stop. The author may revise it once.

### 5. Plan + plan review

Organise the plan around the acceptance scenarios: each step names the
scenario(s) it moves toward green.

Cover: 1. Goal · 2. Affected files · 3. Data/type changes · 4. Test strategy
(which red-proof E2E scenario each step moves forward; the TDD unit/integration
tests each step starts with; the boundaries the change touches and the
boundary test, fake or tape for each) ·
5. Implementation steps · 6. Edge cases & risks · 7. Out of scope ·
8. Requirements coverage (every FR -> scenario id -> E2E test; every NFR ->
implementation step and `tested` / `demonstrated` evidence).
Do not mark a ticket requirement out of scope without an explicit scope change
from the user.

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
break while turning the E2E tests green, and boundaries touched without a
boundary test. End with GO / NO-GO and required changes if NO-GO."

GO -> proceed. NO-GO -> revise once, re-store, re-review. Still NO-GO -> stop
and flag to the user.

### 6. Implement (TDD)

Read [references/cli-reviews.md](references/cli-reviews.md) and check the
required CLIs before implementing. Start CodeRabbit CLI as soon as the first
coherent implementation diff exists; collect findings while continuing work.
Do not defer it until verification, push, or PR creation.

Work through the plan step by step on the branch from step 3. Use TDD:
red -> green -> refactor with unit/integration tests for each step. The
red-proof E2E scenarios are the outer target. Run `just e2e` after each step
to see which scenarios now pass, but don't use them instead of the inner
tests.

- Build each external boundary the diff touches (third-party API, DB, queue,
  storage) test-first too. Its boundary test checks the exact request against
  a sandbox, fake or tape. The E2E tests use those same fakes and tapes.
- Use sandbox or test-mode credentials only.
- Never edit, skip or weaken an E2E test file. Raise `TEST_DISPUTE` instead.
- **Fix loop:** after each round, log the number of failing tests. Keep going
  while it drops. After two rounds in a row without a drop, or when the
  wall-clock budget runs out, stop and show the user the failures.

### 7. Verify (G3)

On the final SHA, run each of these and report its result separately:
`just e2e` (acceptance), `just boundary` (validation) and `just verify` (lint,
build, unit). All three must pass. Then do the hand checks in
[references/e2e-contract.md](references/e2e-contract.md#verify-g3):
- `git diff "$RED_PROOF_SHA"..HEAD -- <E2E test files>` is empty;
- each E2E test still exercises its full scenario;
- new behaviour has its TDD unit/integration tests;
- every boundary the diff touches has a boundary test.

Store the three outputs and the hand-check results with `store_artifact`
(`artifact_type: "summary_notes"`).

Verify every functional requirement (FR) and non-functional requirement (NFR)
from the ticket against concrete evidence. **Done means** every FR is covered
by a passing E2E test, and every NFR has `tested` or `demonstrated` evidence.
An NFR that rests only on `asserted` evidence (code reading or a manual claim)
is recorded as `partial` and listed for the user. Fix anything unmet; if a requirement cannot be met or verified, report
the blocker and do not ship or mark the work complete.

Record each requirement on the execution **as you verify it** — one call per
id, straight after checking it, never batched at the end:

```
Night Shift MCP -> record_requirement_status
  execution_id:   <execution_id>
  agent_id:       "watched-run-YYYYMMDD-NNN"
  requirement_id: "FR-001"          # an id from the get_issue_spec snapshot
  status:         met | partial | unmet | not_verifiable | descoped
  note:           "<why — required for anything but met>"
  commit_sha:     "$(git rev-parse HEAD)"
  anchors:        [ { file: "<repo-relative path>", newRange: [start, end] } ]
  evidence:       [ { kind: test | command | code | manual,
                      ref: "<test name / command / code ref / manual check>",
                      note?: "<optional>" } ]
```

- `anchors` point at where the code satisfies it (new-file line ranges);
  `evidence` is what proves it. For an FR, use the passing E2E test
  (`kind: test`, `ref: "<scenario id>: <test name>"`). For an NFR, put the
  evidence level in `note`: `tested` = `test`, `demonstrated` = `command`,
  `asserted` = `code` / `manual`.
- Record `partial` / `unmet` / `not_verifiable` honestly before fixing or
  reporting the blocker — not instead of it.
- `descoped` needs human approval and counts as a gap until given; use it only
  when the ticket or the user explicitly puts the requirement out of scope,
  and say which in `note`.
- Calls are appended; the latest per id in the current round wins. Re-record
  an id whenever a fix changes its status or evidence. Every snapshot id left
  unrecorded is marked `missing`.

Also list the FR/NFR strings in the review report's `requirements` field
(step 8). Once every id is recorded `met`, explicitly note: "All functional
and non-functional requirements of <ticket ID> are met." Include this
confirmation in the PR description and final report, and recheck it after
review fixes.

### 8. Review — self and independent CLI reviews, all hunk-anchored

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

### 9. Ship

Ship only after G3 passes on the final SHA (all three commands plus the hand
checks), every ticket FR/NFR is verified as met, the confirmation is
recorded, the required CLI reviews complete, and actionable findings are
resolved. If the commit below changes the reviewed candidate, repeat the
final reviews before pushing.

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
- Red proof: <RED_PROOF_SHA> (E2E tests, one per scenario, failing on base)
- just e2e: <result> · just boundary: <result> · just verify: <result>
- Boundaries touched -> boundary tests: <list>
- Resting on `asserted`: <list or "none">
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

The response includes `requirement_gaps` — snapshot ids that are `missing`,
`unmet`, or `descoped`. It does not block completion, but since this run only
ships once every requirement is met, it should be empty. A `missing` id means
a `record_requirement_status` call was skipped: record it now. Report any
remaining gap to the user rather than leaving it for the dashboard to surface.

### 10. Wait for CI + CodeRabbit, then address comments

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
Commit naming the comment it resolves, re-run `record_requirement_status`
for any requirement whose status or evidence the fix changed, re-run G3 (the
three commands and the E2E-diff check), repeat the final CLI reviews on the new candidate before pushing, push (no force-push), re-run
`gh pr checks --watch`; loop until green or nothing addressable without a
human decision. Stale/ambiguous comments: say so, don't guess. A comment
asking to change an E2E test is a `TEST_DISPUTE`: take it to the user, don't
edit the test.

### 11. Report

What was built, PR link, CI status, `RED_PROOF_SHA`, the separate
`just e2e` / `just boundary` / `just verify` results (baseline and final),
anything resting on `asserted`, any `TEST_DISPUTE`, comments addressed, requirements tally
(`<X>/<Y> FR, <A>/<B> NFR met`, source ticket or agent_derived, any
`requirement_gaps`), CLI reviewer statuses
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
| Call `claim_execution` / `get_queue` for this record (it must stay unqueued) |
| Edit, skip or weaken an E2E test file after the red proof (raise `TEST_DISPUTE`) |
| Show the plan to the E2E test author, or let it touch non-test files |
| Use production keys or credentials in tests, tapes or fakes |
| Add or change a Justfile recipe without asking (tier 2) |
