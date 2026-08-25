# Worktree operations

Night shift runs every task in its own `git worktree` under `/tmp/worktrees/`
rather than a single checkout, so parallel or sequential tasks never collide
on the working tree, and a bad task can't leave main dirty for the next one.

## Create

```bash
git fetch origin
git worktree add "$WORKTREE_PATH" -b "$BRANCH" "origin/$BASE_BRANCH"
cd "$WORKTREE_PATH"
```

`-b "$BRANCH"` creates the branch as part of adding the worktree — don't
`git branch` separately first, that fails with "already exists" on the add.

## List / inspect

```bash
git worktree list
git -C "$WORKTREE_PATH" status --short
```

## Remove

Once a task is complete (or abandoned) and its worktree has been recorded in
the morning report, it can be cleaned up — but only after the human has had a
chance to review it. Don't remove a worktree in the same run that created it.

```bash
git worktree remove "$WORKTREE_PATH"        # clean tree only
git worktree remove --force "$WORKTREE_PATH" # dirty tree / already gone from disk
git worktree prune                           # sweep stale administrative entries
```

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `fatal: '<path>' already exists` on `worktree add` | A previous run's worktree wasn't cleaned up, or the slug collided | `git worktree remove --force "$WORKTREE_PATH"`, then recreate |
| `fatal: '<branch>' is already checked out` | Same branch name reused across runs (stale slug) | Recreate the slug/branch name, or reuse the existing worktree instead of creating a new one |
| Worktree directory deleted by hand, git still tracks it | `rm -rf` on the path instead of `git worktree remove` | `git worktree prune` to drop the stale entry, then re-add |
| Changes appear to vanish after the task | Worked in the main checkout instead of `cd "$WORKTREE_PATH"` | Always `cd` into the worktree before making any change; verify with `git rev-parse --show-toplevel` |

Never run worktree operations against the main checkout's own working
directory — every task's changes must live in its own worktree until a human
reviews and pushes it.
