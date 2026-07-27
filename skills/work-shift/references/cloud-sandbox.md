# Cloud sandbox notes

Read before Step 0 and again before the push in Step 8.

## One repo, one checkout

Claude Code on the web starts with a single repository already cloned and a
toolchain installed. Two consequences for a skill ported from `night-shift`:

- **No worktrees.** The sandbox *is* the isolation boundary. `git worktree add`
  into `/tmp/worktrees/...` still works mechanically, but it produces a path that
  vanishes with the sandbox and confuses `complete_execution`'s `worktree_path`.
  Branch in place instead.
- **No cross-repo queue.** If the ticket turns out to belong to a different
  repository than the one checked out, that is a `skip_execution` with the reason
  stated — not something to work around by cloning.

Verify the repo matches the ticket before planning:

```bash
git remote get-url origin
git log --oneline -5
```

## Determining the base branch

`git symbolic-ref refs/remotes/origin/HEAD` is the reliable source. It can be
absent on a shallow or partial clone, in which case set it once:

```bash
git remote set-head origin --auto
BASE_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|^origin/||')
```

Do not infer the base from the currently checked-out branch — sandboxes are
sometimes started on a feature branch, and branching off it silently stacks the
work on someone else's unmerged changes.

## Shallow clones

Sandboxes often clone with `--depth 1`. Anything that walks history — `git diff
origin/$BASE_BRANCH`, `git merge-base`, the critic's diff — needs more:

```bash
git rev-parse --is-shallow-repository   # true → unshallow before diffing
git fetch --unshallow origin 2>/dev/null || git fetch --depth=100 origin
```

Do this in Step 0, not at Step 7 when the diff is already needed.

## Push credentials

Push works when the sandbox was granted repository write access at session
start. It is not guaranteed. Check early rather than discovering it after an
hour of work:

```bash
git push --dry-run origin HEAD 2>&1 | tail -5
```

If this fails, say so at kickoff and agree with the user whether to continue
(recording the run, ending with an unpushed local commit) or stop. Finding out at
Step 8 wastes the whole run.

On failure at push time, the run is still worth recording: `add_note` the error,
then `complete_execution` with the local `commit_sha`, and state plainly in the
handoff that the branch exists only in a sandbox that will be reclaimed.

## Network egress

Sandboxes restrict outbound network to an allowlist. Package installs from npm,
PyPI, and crates.io generally work; arbitrary hosts do not. If a test suite needs
a service that is unreachable — a live database, a third-party API — that is a
`block_execution`, not something to stub around, since stubbing changes what the
tests actually prove.

Check what a suite needs before committing to it:

```bash
grep -rn "DATABASE_URL\|REDIS_URL\|_API_KEY" .env.example docker-compose.yml 2>/dev/null | head
```

## Toolchain detection

```bash
[ -f package-lock.json ] && echo npm
[ -f yarn.lock ]         && echo yarn
[ -f pnpm-lock.yaml ]    && echo pnpm
[ -f pyproject.toml ] || [ -f setup.py ] && echo python
[ -f go.mod ]     && echo go
[ -f Cargo.toml ] && echo rust
[ -f encore.app ] && echo "encore test ./..."
```

Match the lockfile that exists. Running `npm install` in a pnpm repo rewrites the
lockfile and lands a large unrelated diff in the review.

## Ephemerality

The sandbox and everything in it disappear when the session ends. Anything that
must outlive the run has to be either pushed to origin or stored on the Night
Shift server via `store_artifact` / `store_review_report` / `store_critic_report`
/ `summary_html`. This is the reason the skill never writes plans, reviews, or
HTML summaries into the repo: on a machine that will be deleted, a file on disk
is not a record, and in the repo it is diff noise.
