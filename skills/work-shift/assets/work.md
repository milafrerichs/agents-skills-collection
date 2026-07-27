---
description: Work a single Linear ticket end-to-end and record it to Night Shift
argument-hint: <TECH-123> [notes or scope constraints]
---

Run the `work-shift` skill for Linear ticket **$1**.

Additional context from the invoker (may be empty): $ARGUMENTS

Follow the skill at `.claude/skills/work-shift/SKILL.md` exactly:

1. Resolve the repo, base branch, and shallow/push preconditions (Step 0 —
   read the skill's `references/cloud-sandbox.md` first).
2. `create_execution` for $1 and keep the execution_id (Step 1).
3. `get_issue_spec`, treat the FR/NFR arrays as the contract, and confirm scope
   with me before building (Step 2).
4. Plan → `store_artifact` → Fable plan review → GO/NO-GO (Step 3).
5. Branch, TDD, verify against every requirement (Steps 4–6).
6. Clean Code + Sandi Metz review, then `store_review_report` (Step 7 — read
   the skill's `references/review-report.md` first).
7. Commit, push the branch, critic pass, `complete_execution` (Step 8).
8. Print the handoff report (Step 9).

Do not open a pull request. Do not call `get_queue`.

<!-- Install to .claude/commands/work.md so this is invoked as /work TECH-123 -->
