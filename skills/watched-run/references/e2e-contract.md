# Testing contract: E2E tests drive, boundary tests validate

This contract governs how a watched run tests its work. Where it conflicts
with other parts of the skill or with AGENTS.md (for example "Behaviour / E2E:
use sparingly" or "Always use TDD" at the unit level), this contract wins.

## Roles

| Layer | Role | Rule |
|---|---|---|
| **E2E** | Primary driver | One test per acceptance scenario (Given/When/Then), named by its scenario id. It runs through the app's public entry point (HTTP, CLI or UI) against a real database. External services are replaced by fakes or tapes. |
| **Boundary** | Validation stage | One test for each external boundary the change touches (third-party API, DB, queue, storage). It checks the exact request (method, path, headers, body) against a sandbox, fake or tape. |
| **Unit** | Optional support | Only where it helps the implementer. It never stands in for an E2E or boundary test. |

- E2E tests use the **same** fakes and tapes that the boundary tests verify,
  so a fake cannot drift away from the real API without a boundary test failing.
- Use sandbox or test-mode credentials only. Never use production keys, not
  even to record a tape.

## Scenarios

The E2E tests are written against acceptance scenarios with stable ids
(e.g. `SC-01`). Each scenario has Given/When/Then and names the FR ids it
covers.

- If the ticket already has them, use them as written.
- If it has none, write them from the acceptance criteria and FR/NFR snapshot.
  Show them to the user and wait for confirmation before the test author starts.
- Every FR must be covered by at least one scenario. If an FR can't be
  expressed as a scenario, tell the user. Don't drop it silently.

## Separate test author (emulated)

The `e2e-writer` agent isn't built yet, so the run emulates it.

1. **Spawn the author before implementing.** Use a fresh subagent: the `Agent`
   tool with a non-fork type such as `general-purpose`. Never use `fork`,
   because a fork inherits the plan. Its prompt contains **only**:
   - the spec: ticket title and description, the FR/NFR snapshot and the
     confirmed scenarios;
   - the repo at the base commit, which is the run's branch before any
     implementation;
   - this section's rules, plus the names of the existing fakes and tapes and
     how the E2E suite is run (`just e2e`).

   It never gets the plan, the plan review or any implementation notes. Tell
   it not to read the execution record.
2. **The author writes one E2E test per scenario** and commits them by
   themselves, with no other changes. Test-only support files the tests need
   (scenario fixtures, test setup data) may go in the same commit. Every file
   in that commit counts as an **E2E test file** from then on.
3. **Red proof.** Run `just e2e` at that commit and read every test's
   failure:
   - Each scenario test must **fail on an assertion**, meaning the behaviour is
     missing. Setup errors don't count: a missing route, a broken fixture, an
     import error or a crash before the When step.
   - A test that fails on setup goes back to the author to fix before the red
     proof is recorded. This is not the dispute revision.
   - A test that **passes** on the base means either the scenario is already
     satisfied or the test is weak. Stop and tell the user.

   Once every test fails on an assertion, record that commit as the red proof:
   ```bash
   RED_PROOF_SHA=$(git rev-parse HEAD)
   ```
   Put the SHA, the list of E2E test files and each test's failure line on the
   record (`add_note`, plus `store_artifact` with
   `artifact_type: "summary_notes"` for the full output).
4. **Ownership.**
   - The implementer must not edit, delete, rename, skip or weaken any E2E
     test file.
   - The test author touches nothing except E2E test files.

### TEST_DISPUTE

If an E2E test looks wrong, stop and tell the user. Examples: it asserts
something the spec doesn't say, it can't pass without breaking another FR, or
it depends on a fake's behaviour that the boundary test shows is wrong. Send a
message headed `TEST_DISPUTE` that includes:
- the test file and its scenario id;
- the spec text it should express, quoted;
- what the test actually asserts, with the lines quoted;
- the evidence: failing output, the conflicting FR, or the boundary test result.

After the user agrees, the test author may revise that test **once**. Give the
same author (`SendMessage`) the dispute and nothing from the plan. The
revision is a separate commit that touches only E2E test files, and it becomes
the new `RED_PROOF_SHA`: re-run step 3 on the base plus that commit. If the
test is still disputed, stop. The user and you fix the spec together before
any more work.

## Baseline: before work starts

On the base, before the test author starts, run each command and keep each
result separately:

```bash
just e2e        # driver
just boundary   # validation
just verify     # lint, build, unit
```

All three must pass on the base. If one fails, stop and report it, because
you can't tell new failures from old ones.

**Missing recipes:** if `e2e` or `boundary` doesn't exist in the Justfile,
ask the user before adding it. Justfiles are tier 2: never change one without
asking first.

## Implementation and fix loop

- Make the E2E tests pass from the outside in. Add a boundary test for every
  boundary the diff touches, built on the fakes and tapes the E2E tests use.
  If a fake has to change, its boundary test must prove the new behaviour
  matches the sandbox or tape.
- After each fix round, count the failing tests across `just e2e` and
  `just boundary` and log the count (`add_note`).
- **Keep going while each round lowers the failure count.** After **two
  rounds in a row with no drop**, or when the wall-clock budget runs out, stop.
  Show the user the failing tests with their output. Don't keep going, and
  don't touch the E2E tests.

## Verify (G3)

Run all three on the final SHA and report each result **separately** (command,
exit status, pass/fail counts):

| Command | Stage |
|---|---|
| `just e2e` | driver |
| `just boundary` | validation |
| `just verify` | lint, build, unit |

All three must pass. Then check by hand and record what you found:

- [ ] `git diff "$RED_PROOF_SHA"..HEAD -- <E2E test files>` is empty.
- [ ] Each E2E test really exercises its scenario: the same Given/When/Then,
      through the public entry point, with a real DB. It isn't weakened by
      looser assertions, skips, extra stubbing or a different entry point.
- [ ] Every boundary the diff touches has a boundary test that checks the
      exact request (method, path, headers, body).
- [ ] No production credentials appear in tests, tapes or config.

## Done means

- Every FR is covered by a **passing E2E test**. Record it with
  `evidence: [{ kind: "test", ref: "<scenario id>: <test name>" }]`.
- Every NFR has evidence at `demonstrated` or `tested`. Map the evidence
  levels onto `record_requirement_status` like this, and put the level in the
  evidence `note`:

  | Level | Meaning | Evidence `kind` |
  |---|---|---|
  | `tested` | an automated test checks it (E2E, boundary or unit) | `test` |
  | `demonstrated` | observed by running the real thing: a command, benchmark, request or log | `command` |
  | `asserted` | only claimed from reading the code or by hand | `code` / `manual` |

- Anything that rests only on `asserted` is **not done**. Record it as
  `partial` with the reason, and list it for the user in the final report and
  the PR description.
