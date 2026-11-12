# Early and final CLI reviews

Use this procedure during implementation and before shipping. Self-review,
Clean Code/Sandi Metz checks, and plan review do not replace these reviews.

## Required reviewers

- **CodeRabbit CLI:** start at the first coherent implementation diff, before
  finishing the task or waiting for tests, a push, or a PR.
- **Codex CLI:** always run a separate, fresh review process, including when
  Codex is the producer. The producer's own reasoning is not this review.
- **Claude CLI:** run a separate, fresh review process unless Claude produced
  the implementation. Record that exception explicitly; CodeRabbit and Codex
  remain required. Otherwise all three CLI reviews are required.

At task setup, identify the producer and check the required CLIs and their
authentication. Use installed `--help` output to confirm supported options;
do not silently replace a missing CLI with a subagent or a PR bot review.
If a required reviewer is unavailable, record the exact failure. In a watched
run, report the blocker; unattended, call `block_execution` and continue with
the next task. Do not claim the review gate passed or complete the execution.

## Start CodeRabbit early

Resolve `REVIEW_BASE` to the actual PR target ref (watched-run), or
`origin/$BASE_BRANCH` for this task (night-shift). Keep that base consistent
across reviewers. Run inside the task's repository/worktree:

```bash
coderabbit review --agent --base "$REVIEW_BASE" --include-untracked
```

This covers committed and local changes, including new files. See the
[CodeRabbit CLI reference](https://docs.coderabbit.ai/cli/reference) for
current options. Prefer `--agent` on current versions; adapt to the installed
CLI rather than assuming older `--prompt-only` / `--type` flags still exist.

Launch through a managed background process as soon as the diff is useful.
Retain its process handle, full output, exit status, and the reviewed revision
or diff snapshot outside the repo. Continue independent implementation or
verification while it runs; collect findings promptly and apply valid fixes.
An early result covers only its captured snapshot, not subsequent edits.
Apply this to feedback/rework rounds too.

## Final independent reviews

After implementation and self-review fixes, commit the candidate locally and
keep it unchanged while all required reviewers inspect it. Capture
`REVIEW_SHA=$(git rev-parse HEAD)`. Review the complete task diff against the
same base, not just the latest cleanup commit:

```bash
coderabbit review --agent --fresh --base "$REVIEW_BASE" --include-untracked
codex review --base "$REVIEW_BASE"
```

For Claude, prepare an input file outside the repo containing the ticket's
FR/NFR, relevant context, and `git diff "$REVIEW_BASE"..."$REVIEW_SHA"`.
Ask for an adversarial review of correctness, edge cases, migrations, security,
and missing tests; require file/line ranges, severity, rationale, and an overall
verdict. Give each reviewer the original requirements, not other reviewers'
conclusions. Skip this command only for the Claude-producer exception:

```bash
claude -p --tools "" --no-session-persistence < "$CLAUDE_REVIEW_INPUT"
```

The input must contain enough code context for Claude's tool-free review;
include relevant surrounding files when the diff alone is insufficient.
Run reviewers concurrently when possible. Wait for every required process to
finish and inspect its output and status; empty output, a timeout, or an
incomplete review is not approval.

Triage findings, fix actionable defects, and document any rejected finding
with a concrete rationale. Re-run relevant tests after fixes, commit them,
and repeat the required reviews on the new candidate before shipping. If
blocked or repeated failures prevent completion, record the outstanding
findings and report/block the task rather than declaring it reviewed.

Store full outputs and dispositions via `store_artifact` (`artifact_type:
"review"`), labeled by reviewer and reviewed SHA; record Claude's exception
when applicable. Keep `store_review_report` as the producer's self-assessment.
Use the existing distinct critic ID to store a consolidated, attributed
`store_critic_report` for the final reviewed SHA, preserving file/line anchors
and the most severe unresolved verdict. An empty findings list is valid only
when the required reviews completed and found no remaining issues. Include
reviewer statuses and outstanding findings in the final handoff.
