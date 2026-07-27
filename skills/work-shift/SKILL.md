---
name: work-shift
description: >
  Work a single Linear ticket end-to-end inside a Claude Code cloud sandbox —
  plan, Opus plan review, TDD implementation, verification, code review, critic
  pass, branch push — and record the whole run into the Night Shift MCP so it
  appears in the dashboard next to overnight work. Use this skill whenever
  someone wants to work one specific ticket rather than the overnight queue:
  "/work TECH-123", "work TECH-456", "run work shift on TECH-789", "work
  through this ticket in the cloud", "implement TECH-123 and record it",
  "single-ticket night shift", "do this issue and log it to Night Shift", "pick
  up this Linear issue and push a branch". Also trigger when someone pastes a
  Linear issue ID and
  asks to implement, build, or fix it in a cloud/remote session, or asks for
  coding work to be "recorded as an execution". Do NOT use this for the
  overnight queue — that is the night-shift skill.
---

# Work Shift

A single-ticket, cloud-sandbox sibling of `night-shift`. Same rigor, one issue,
attended kickoff, and the run is **recorded** into Night Shift rather than
claimed from its queue.

## How this differs from night-shift

Both skills produce the same artefacts and feed the same dashboard. The
differences all follow from *where* this runs and *how the work arrives*:

| | night-shift | work-shift (this skill) |
|---|---|---|
| Work arrives via | `get_queue` → `claim_execution` | `create_execution` for one ticket |
| Enters the overnight queue | yes | **no** — recorded work only |
| Scope | whole queue, may span repos | exactly one ticket, one repo |
| Isolation | git worktree per task | branch in the sandbox checkout |
| Ends with | local worktree, no push | **branch pushed to origin, no PR** |
| Human | asleep | present at kickoff |

`create_execution` exists precisely for this: it records work against a Linear
ticket — plan, diff, decisions, review — building history without ever entering
the autonomous queue. Never call `get_queue` from this skill; taking a queued
item out from under the overnight agent is exactly the collision `claim_execution`
was built to prevent.

**agent_id convention:** `work-shift-YYYYMMDD-NNN` (e.g. `work-shift-20260727-001`).
The critic uses a distinct id: `work-shift-critic-YYYYMMDD-NNN`. Keeping these
separate is what makes the dashboard show a genuine second opinion rather than
the implementer grading itself.

---

## Flow

```
0. RESOLVE   - Ticket ID + repo context + base branch
1. RECORD    - create_execution → execution_id (claim it if the server wants one)
2. SPEC      - get_issue_spec → FR/NFR checklist; confirm scope with the user
3. PLAN      - 8-part plan → store_artifact(plan) → Opus plan review → GO/NO-GO
4. BRANCH    - work-shift/<slug> off origin/<base>
5. IMPLEMENT - TDD red → green → refactor
6. VERIFY    - tests + lint + explicit FR/NFR confirmation
7. REVIEW    - Clean Code + Sandi Metz → store_artifact(review) + store_review_report
8. SHIP      - commit, push branch, critic pass → complete_execution(summary_html)
9. HANDOFF   - print the report
```

Every phase transition gets an `update_progress` call. That is what makes the
dashboard useful while the run is still going — a stalled run is only
diagnosable if it said what it was doing last.

---

## Step 0 — Resolve the ticket and the repo

The ticket ID comes from the invocation (`/work TECH-123`, "run work shift
on TECH-123"). If no ID was given, ask for one rather than guessing — this
skill's entire output is anchored to a Linear issue.

The sandbox has exactly one repo checked out. Capture its context:

```bash
REPO_PATH=$(git rev-parse --show-toplevel)
cd "$REPO_PATH"
git status --short
git fetch origin --prune
BASE_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
BASE_BRANCH="${BASE_BRANCH:-main}"
REPO_LABEL=$(basename -s .git "$(git remote get-url origin)")
```

If the working tree is dirty, stop and report it. Sandboxes usually start clean;
uncommitted changes mean someone else's work is in flight and a branch cut here
would silently absorb it.

Read `references/cloud-sandbox.md` for sandbox-specific git, auth, and network
caveats — especially before the push in Step 8.

## Step 1 — Record the execution

```
Night Shift MCP → create_execution
  agent_id:        "work-shift-YYYYMMDD-NNN"
  linear_issue_id: "TECH-123"
  repo_label:      "<REPO_LABEL>"
  priority:        3
```

Keep the returned `execution_id` — every later call needs it. If the server
rejects the `repo_label`, retry once without it and note the omission; the
recording matters more than the repo link.

Then attempt a claim so the execution is attributed to this agent:

```
Night Shift MCP → claim_execution
  agent_id: "work-shift-YYYYMMDD-NNN"
  execution_id: <execution_id>
```

An error here is expected and harmless — `claim_execution` is a conditional
update against `status=queued`, and a freshly created record is not queued.
Continue either way; do not retry in a loop.

## Step 2 — Load the spec and confirm scope

```
Night Shift MCP → get_issue_spec
  execution_id: <execution_id>
```

This returns the full Linear issue plus parsed `functional_requirements` and
`non_functional_requirements` (each `{id, text}`). **That FR/NFR list is the
contract for the whole run** — it drives the plan's coverage section (Step 3),
the verify checklist (Step 6), and the `requirements` field of the review report
(Step 7). Treat it as authoritative over your own reading of the description.

If `is_rework` is true, the reviewer already sent this back. Read
`references/rework-mode.md` and follow it instead of Steps 3–5 — you are
addressing feedback on existing work, not rebuilding it.

### Under-specified tickets

If there is no spec and no acceptance criteria, do not invent one. A human
kicked this off, so use them:

1. Ask up to three sharp questions covering the biggest ambiguities.
2. If they answer, record the answers via `add_note` and fold them into the plan
   as explicit **Assumptions**.
3. If they are not available, call `spec_ticket` to open an interactive spec
   session, then `block_execution(reason: "needs spec")` and stop. Speccing and
   implementing in the same unattended pass just launders a guess into a commit.

### Confirm before building

```
Work Shift
==========
Agent:    work-shift-YYYYMMDD-NNN
Ticket:   [TECH-123] Add user search endpoint
Repo:     equimatch-api (base: main)
Exec:     <execution_id>
Requirements: 4 FR, 2 NFR

Proceed? (y / adjust scope / n)
```

## Step 3 — Plan

```
Night Shift MCP → update_progress
  agent_id: "work-shift-YYYYMMDD-NNN"
  execution_id: <execution_id>
  substatus: "planning"
  notes: "Loading spec and codebase context"
```

Cross-reference the spec against the actual codebase before writing anything —
grep for the entities the ticket names, read `README.md`, anything under `docs/`,
`openapi.yml`, and the files the ticket points at. Plans written from the ticket
alone are the main source of "affected files" being wrong.

Write an 8-part plan:

1. **Goal** — one sentence describing what "done" looks like
2. **Affected files** — every file expected to change or be created
3. **Data / type changes** — schema, interface, or model changes
4. **Test strategy** — the cases that will prove correctness, written first
5. **Implementation steps** — numbered, fine-grained, in execution order
6. **Edge cases & risks** — what could go wrong and how it's handled
7. **Out of scope** — what will explicitly not be touched
8. **Requirements coverage** — every FR and NFR id mapped to the step(s) and
   test(s) that satisfy it. Anything you do not intend to satisfy is called out
   here as blocked or out of scope. Silently dropped requirements are the single
   most expensive failure mode in review.

Store it server-side — never write plan files into the work repo, they end up in
the diff and pollute the review:

```
Night Shift MCP → store_artifact
  execution_id: <execution_id>
  agent_id: "work-shift-YYYYMMDD-NNN"
  artifact_type: "plan"
  content: <full plan markdown>
```

Keep the numbered step labels from item 5 stable — they become the `planCheck`
rows in Step 7 and are shown verbatim in the dashboard's "plan vs. what it did"
view.

### Opus plan review

Spawn a subagent (model `claude-opus-4-5`) with the system prompt:

> You are a senior engineer doing a pre-implementation plan review. Be critical.
> Flag vague steps, missing edge cases, incorrect file assumptions, and anything
> that will likely cause problems during TDD.

Send the full plan plus: *"Review this plan. For each section note any gaps,
risks, or improvements. End with GO / NO-GO and required changes if NO-GO."*

- **GO** → continue to Step 4.
- **NO-GO** → apply the required changes, re-`store_artifact`, review once more.
- **NO-GO twice** → `block_execution(reason)` and stop. Two failed reviews means
  the ticket is not ready, not that the third plan will be better.

```
Night Shift MCP → add_note
  agent_id: "work-shift-YYYYMMDD-NNN"
  execution_id: <execution_id>
  note: "Opus plan review: <GO|NO-GO>. <key findings>"
```

## Step 4 — Branch

No worktree here. The sandbox is already an isolated checkout, so a second one
buys nothing and breaks the paths the dashboard records.

```bash
SLUG=$(echo "<issue title>" | tr '[:upper:]' '[:lower:]' \
       | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/-$//' | cut -c1-50)
BRANCH="work-shift/${SLUG}"
git checkout -b "$BRANCH" "origin/$BASE_BRANCH"
```

`complete_execution` requires a `worktree_path`; pass `$REPO_PATH`. The field
means "where the work lives", and in a sandbox that is the checkout itself.

## Step 5 — Implement (TDD)

```
Night Shift MCP → update_progress
  substatus: "tdd"
  notes: "Writing failing tests for: <first requirement>"
```

Read `/mnt/skills/user/tdd/SKILL.md` before writing code, then red → green →
refactor per logical unit: failing test for the next plan step, minimum code to
pass, clean up without breaking it, repeat.

Once tests exist and implementation is underway:

```
Night Shift MCP → update_progress
  substatus: "implement"
  notes: "Tests written; implementing: <current step>"
```

Commit at each green milestone on larger tickets — `git commit -m "feat: <what> — <why>"`.
Frequent commits give the critic in Step 8 a readable history to reason about.

## Step 6 — Verify

```
Night Shift MCP → update_progress
  substatus: "verify"
  notes: "Running full test suite"
```

```bash
[ -f package.json ]   && npm test 2>&1 | tail -30
[ -f pyproject.toml ] && python -m pytest --tb=short 2>&1 | tail -30
[ -f encore.app ]     && encore test ./... 2>&1 | tail -30
[ -f .eslintrc* ]     && npx eslint . --max-warnings=0 2>&1 | tail -20
```

Then walk the FR/NFR list explicitly. Green tests are necessary, not sufficient —
non-functional requirements around persistence, performance, security, and
auditability are routinely uncovered by unit tests. For each requirement, point
at the concrete evidence: the test that exercises it or the code that guarantees
it.

```
Night Shift MCP → add_note
  note: "Tests: <PASS|FAIL>. <N> passed, <M> failed.
         Requirements: <X>/<Y> FR met, <A>/<B> NFR met. <unmet ids>"
```

Treat an unmet requirement exactly like a failing test: two fix attempts, then
record it and flag it in the handoff report rather than quietly shipping.

## Step 7 — Review

```
Night Shift MCP → update_progress
  substatus: "review"
  notes: "Running clean-code and Sandi Metz reviews"
```

```bash
git diff "origin/$BASE_BRANCH" --name-only
```

Run both reviews against the changed files and **implement every finding**, then
re-run the suite to confirm nothing broke:

- Clean Code — read `/mnt/skills/user/clean-code/SKILL.md`. Naming, function
  size, single responsibility, error handling, comments vs. code.
- Sandi Metz — read `/mnt/skills/user/sandi-metz-reviewer/SKILL.md`. Law of
  Demeter, message passing, class responsibility, flocking rules, inheritance
  vs. composition.

```
Night Shift MCP → store_artifact
  artifact_type: "review"
  content: <combined Clean Code + Sandi Metz review markdown>
```

Then store the structured self-assessment that powers the Focus Review and
Walkthrough dashboard modes:

```
Night Shift MCP → store_review_report
  execution_id, agent_id, confidence, intro, outro,
  requirements, planCheck, diff, selfReview, tests
```

**Read `references/review-report.md` before this call.** It has the exact field
shapes, the confidence rubric, the `planCheck` status semantics, and the diff
annotation model. Omitted fields render as empty panels for the reviewer, so
fill all of them.

```bash
git add -A
git commit -m "refactor: apply clean-code + Sandi Metz review findings"
```

## Step 8 — Commit, push, critic, complete

```
Night Shift MCP → update_progress
  substatus: "commit"
  notes: "Final commit and branch push"
```

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: final cleanup"
COMMIT_SHA=$(git rev-parse HEAD)
git push -u origin "$BRANCH"
```

Push the branch; **do not open a PR**. The reviewer opens it themselves once the
dashboard review passes — that decision is theirs, not the agent's.

If the push fails on credentials or network, do not treat the run as lost:
`add_note` with the failure, complete the execution with the local
`commit_sha`, and say plainly in the handoff that the branch is unpushed.

### Critic pass

`store_review_report` was your own self-assessment. Now get an adversarial second
opinion. Spawn a subagent (model `claude-opus-4-5`):

> You are a senior engineer doing an adversarial post-implementation review. You
> did NOT write this code. Find real defects: correctness bugs, missing edge
> cases, risky migrations, security issues. Anchor every finding to a file and a
> line range.

Send `git diff "origin/$BASE_BRANCH".."$COMMIT_SHA"` plus a request to group
findings by file, give each a `[start, end]` line range in the **new** file at
that commit, a severity (`blocker` / `warn` / `nit`), a one-sentence summary, an
optional rationale, a per-file summary, an overall summary, and a verdict.

```
Night Shift MCP → store_critic_report
  execution_id, agent_id: "work-shift-critic-YYYYMMDD-NNN",
  commit_sha: "$COMMIT_SHA", verdict, confidence, summary, files
```

The critic is advisory — it does not block completion — but its `confidence`
must be honest. `request_changes` with blocker annotations means `< 70`, which is
what sorts the work to the top of the review queue. An empty `files` array is a
valid clean review. Field shapes are in `references/review-report.md`.

### Complete

```
Night Shift MCP → complete_execution
  agent_id:      "work-shift-YYYYMMDD-NNN"
  execution_id:  <execution_id>
  branch:        "$BRANCH"
  worktree_path: "$REPO_PATH"
  commit_sha:    "$COMMIT_SHA"
  summary_html:  <self-contained HTML — see references/review-report.md>
```

This flips the Linear issue to "In Review" and posts the branch details. The HTML
is a narrative overview only: header, summary, plan review verdict, per-file
change table, `git diff --stat`, collapsed `<details>` blocks embedding the plan
and reviews, test results, known issues. It must be fully self-contained — no
relative links, because there are no files on disk to link to. The structured
diff is already rendered from `store_review_report`; do not duplicate it here.

## Step 9 — Handoff report

```
Work Shift Complete
==================
Agent:   work-shift-YYYYMMDD-NNN
Ticket:  [TECH-123] Add user search endpoint
Exec:    <execution_id>

Branch:  work-shift/add-user-search-endpoint  (pushed → origin)
Commit:  <sha>
Tests:   PASS — 24 passed, 0 failed, 6 added
Reqs:    4/4 FR, 2/2 NFR met
Self-confidence: 88   Critic: approve_with_nits (82)

Recorded to Night Shift: plan, review, review report, critic report, HTML summary
Linear: moved to In Review

Open items:
  - <anything unmet, unpushed, or worth a second look>

Next: review in the NightShift dashboard, then open the PR from
      work-shift/add-user-search-endpoint when satisfied.
```

---

## Error handling

| Situation | MCP action | Local action |
|---|---|---|
| No ticket ID given | — | Ask; do not guess |
| Dirty working tree at start | — | Stop and report |
| `create_execution` rejects repo_label | retry without it | Note the omission |
| `claim_execution` errors | — | Expected; continue |
| No spec, human present | `add_note` (answers) | Fold into plan Assumptions |
| No spec, human absent | `spec_ticket` → `block_execution` | Stop |
| Opus plan review NO-GO twice | `block_execution(reason)` | Stop |
| Tests fail after 2 attempts | `add_note(details)` | Flag in handoff |
| Requirement unmet after 2 attempts | `add_note(ids)` | Flag in handoff |
| Push rejected / no credentials | `add_note` + `complete_execution` | Say branch is unpushed |
| Rate limit or timeout | `add_note("retrying")` | Pause 30s, retry once |
| Ticket out of scope for this repo | `skip_execution(reason)` | Stop |

**Never:** push to the base branch, open a PR, call `get_queue` or claim someone
else's queued execution, write plan/review/HTML files into the work repo, commit
secrets, or run destructive migrations.

---

## Reference files

- `references/cloud-sandbox.md` — sandbox git, auth, network, and toolchain notes
- `references/review-report.md` — exact payloads for `store_review_report`,
  `store_critic_report`, and the `summary_html` template
- `references/rework-mode.md` — what to do when `get_issue_spec` returns `is_rework`
- `assets/work.md` — drop-in `/work` slash command
