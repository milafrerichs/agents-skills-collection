# Feedback iteration mode

Enter only when `get_issue_spec` returned `is_rework: true`. It also returns:

- `feedback[]` — the current round, newest first, as `{ content, author, at }`
- `previous_branch` / `previous_worktree_path` — where the earlier run's work lives

Replaces Steps 3–5 of the main flow. Steps 6–9 (verify, review, ship, handoff)
run unchanged.

## Do not re-plan

The prior implementation is the starting point. Change only what the feedback
asks for and leave the rest intact. Reimplementing from scratch throws away work
the reviewer already accepted and forces them to re-read everything — the exact
cost the feedback loop exists to avoid.

## Read the feedback as a to-do list

The `feedback` array is authoritative for this round. Before touching code,
restate each item as a concrete change. Ambiguous feedback gets a question to the
user, not a guess — a wrong guess costs another full round.

## Recover the prior branch

`previous_worktree_path` will almost never exist here: it points at a machine
from an earlier session, and this sandbox is new. The branch on origin is the
real handoff.

```bash
git fetch origin --prune

if [ -n "$previous_branch" ] && git rev-parse --verify "origin/$previous_branch" >/dev/null 2>&1; then
  BRANCH="$previous_branch"
  git checkout -B "$BRANCH" "origin/$BRANCH"
elif [ -d "$previous_worktree_path" ]; then
  cd "$previous_worktree_path"          # same-machine case; rare in a sandbox
else
  # Prior work never reached origin — recreate from base, but stay scoped to the
  # feedback, guided by the original spec.
  BRANCH="work-shift/${SLUG}"
  git checkout -b "$BRANCH" "origin/$BASE_BRANCH"
fi
```

Whichever path ran, carry `BRANCH` through to Step 8 so `complete_execution`
records the same branch the reviewer has been following. Starting a new branch
name mid-thread orphans their review history.

If the prior work is genuinely gone, say so in the handoff. The reviewer needs to
know they are looking at a rebuild rather than an edit.

## Lightweight plan, no Opus review

The full 8-part plan and the GO/NO-GO review are for greenfield work. Instead
store a short feedback response mapping each item to the change it triggers:

```
Night Shift MCP → update_progress
  substatus: "planning"
  notes: "Feedback iteration: addressing <N> item(s)"

Night Shift MCP → store_artifact
  artifact_type: "plan"
  content: "## Feedback response
            - Feedback: \"<quote>\" → Change: <what you will do>
            - Feedback: \"<quote>\" → Change: <what you will do>"
```

Add or adjust tests as the feedback requires, then continue with Step 6.

## Review report adjustments (Step 7)

Three changes to `store_review_report` so the reviewer sees a feedback round
rather than a confusing partial re-run of the original plan:

- **`planCheck`** — one entry per feedback item, not per original plan step. Set
  `step` to a short quote of the feedback, `status` to `match` when addressed or
  `diverged` when not, with the reason in `note`.
- **`selfReview`** — note that this round addressed feedback rather than the
  original plan.
- **`diff`** — for each line that directly resolves a feedback item, add an
  annotation linking the two: `"summary": "Changed to toISOString() — per
  feedback: use UTC not local time"`.

That annotation is the whole point of the round: it puts the reviewer's own words
next to the line that answers them, so verifying the fix takes seconds.

## Handoff

Report the ticket under **REWORKED**, list the feedback items addressed, and name
the branch. If any item was not addressed, say which and why — an unmentioned gap
reads as an oversight and triggers a third round.
