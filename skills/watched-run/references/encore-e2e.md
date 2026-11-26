# Encore.ts testing guide

Use this guide in a repo with an `encore.app` file (e.g. pipeliner). It
applies [e2e-contract.md](e2e-contract.md) to Encore. Where they disagree on
an Encore detail, this guide wins. On anything else, the contract does.

## Two layers

| Layer | Runs with | Use for |
|---|---|---|
| **1. In-process integration** | `encore test` + Vitest | Almost everything: the TDD tests, and the acceptance-scenario E2E tests by default. |
| **2. Black-box HTTP** | a running app (`encore run` or a preview environment) | A few critical flows only, and scenarios Layer 1 can't reach: real routing, the auth handler, serialization, deployed config. |

Encore recommends integration tests over unit tests here, because most code
is business logic around databases and calls between services. Under
`encore test`, the inner TDD loop is therefore mostly Layer 1 integration
tests. Use pure unit tests only for logic that really is pure, such as a URL
normaliser.

## Layer 1: `encore test`

`encore test` sets up the infrastructure in test mode before the tests run.
That includes separate test databases tuned for speed, so these tests run
almost as fast as unit tests.

**Entry point.** Import the endpoint and call it like a function. That is the
public entry point for an acceptance-scenario test. Assert on the response
**and** on the side effect, read back through another endpoint or the DB:

```ts
import { describe, it, expect } from "vitest";
import { create, get } from "./coupons";

describe("coupons", () => {
  it("SC-01: creates and persists a coupon", async () => {
    const code = `TEST-${crypto.randomUUID()}`;
    await create({ code, percentOff: 20 });
    const c = await get({ code });
    expect(c.percentOff).toBe(20);
  });
});
```

**What is real and what is faked**
- **Real:**
  - calls between services;
  - databases: use the test DB, never a mock; follow the repo's cleanup
    helper, e.g. pipeliner's `useCleanDatabase`;
  - Pub/Sub and other Encore infrastructure.
- **Faked:** external dependencies only, such as Lemlist, LeadMagic, email
  providers and PostHog.
- **How to fake an external API:** at the HTTP boundary, with a fake that
  intercepts `fetch` or a tape. Don't `vi.mock` the client module. Mocking the
  module skips the app's own client code, which is exactly what the boundary
  test has to check. The E2E tests and the boundary test share the same fake
  (see the contract).
- **Unexpected requests:** any outbound request the test hasn't faked must
  fail the test. In the TECH-1775 test spin, pipeliner's PostHog client made
  a real request during a test.

**Secrets**
- A developer's Encore CLI may be logged in, with real secrets in the local
  environment. In the TECH-1775 spin, the local environment had real Lemlist
  keys.
- In every test that reaches an external service, override that service's
  secrets with dummy values and point its base URL at the fake. Never let a
  test read a real key.

**Crons and jobs.** Call the function behind the cron directly, or through
its endpoint. Don't test the schedule.

**Async effects.** For Pub/Sub subscribers or workflows, use
`expect.poll(...)` or `vi.waitFor(...)` with a timeout. Never use `sleep`.

## Layer 2: black-box HTTP

Run this against `encore run` locally or in CI, or against an Encore
preview environment. A PR gets its own preview environment.

- Generate a typed client for the environment under test with
  `encore gen client --env=<env> --lang=typescript`, and use it in the tests.
  The tests then get type safety, and breaking API changes show up as
  compile errors. Check the exact env name for a PR preview with
  `encore env list`.
- Preview databases can be pre-populated from staging (Neon branching).
  Because the data is shared, unique ids per test are required, not
  optional.
- Keep this layer to a few golden-path flows per service, plus the unhappy
  paths clients actually hit: 401/403, validation errors, not-found.

**Move a scenario from Layer 1 to Layer 2 when it depends on any of these:**
- the auth handler or auth data (see "Unverified" below);
- HTTP routing, path or query parsing, or serialization;
- deployed config, or Pub/Sub delivery if it doesn't run under `encore test`.

Say in the scenario's test which layer it uses and why.

## Running in a sandbox (lessons from the test spin)

- **`encore test` rewrites `package.json`.** When the CLI version is newer
  than the `encore.dev` dependency, it bumps `encore.dev` and runs
  `npm install`. In a sandbox, install the matching `encore.dev` version,
  run with `npm_config_dry_run=true`, and restore `package.json` and
  `package-lock.json` afterwards. Never commit the bump as part of a test.
- **Dependencies:** if `/tmp` is short on space, keep `node_modules` outside
  it and symlink it in.

## Unverified: check before relying on it

Neither of these is confirmed for this setup yet. Until someone checks, treat
scenarios that depend on them as Layer 2:
- whether Pub/Sub subscribers actually run under `encore test` in
  TypeScript;
- how auth data is set when an endpoint is called directly in-process.

Whoever checks either one first should record the answer here.
