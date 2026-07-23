## Planning & Subagents

When planning any task:

- Use subagents for file exploration and file analysis — do not do bulk reads yourself
- Before writing code, produce a **task list** that can be distributed across subagents
- Plan explicitly for which subagents will handle which files/modules
- Check available skills and plan to use them where applicable
- Write a **verification plan** alongside the implementation plan — not just tests, but runtime verification (e.g. call the API, check the response, inspect logs)
- Ensure seeds are up to date before running integration or behaviour tests
- Where possible, run work in a container to ensure reproducibility
-  use **uv** when in python
-  when creating scripts or anything that can be executed always use just and Justfiles

---

## Testing Philosophy

### General Principles

- **Always use TDD** — write the test first, then make it pass
- Prefer **factories** over direct database records
  - Rails: use **FactoryBot**
  - TypeScript: use **fishery**
  - Python: use **factory_boy** or **polyfactory**
- Use **parameterized tests** wherever possible — prefer them over duplicated test cases
- Use `it` over `test` in RSpec and Jest contexts

### Test Levels

| Level | Guidance |
|---|---|
| **Unit** | Test all public methods. Keep them fast and isolated. |
| **Integration** | Important — verify that components work together correctly. Cover key flows. |
| **Behaviour / E2E** | Use sparingly at the top level. Cover critical user journeys only. |

---

## Boundaries & External Services

When you encounter a boundary (an external API, service, or third-party dependency):

- Evaluate whether it can or should be replaced with a **digital twin** (a fake/stub that mimics real behaviour)
- Write **boundary tests** that verify the exact requests the boundary should receive (method, path, headers, body)
- Use **tapes** (e.g. VCR, Polly.js, pytest-recording) to record real API interactions and save them as fixtures for fast, repeatable testing
- Never mock boundaries at the unit level without also having a tape-backed integration test

---

## Logging

- Prefer **wide, structured logging** — one log line per request or business function
- Do **not** scatter log calls throughout a function — log at entry/exit boundaries only
- Create a **context object** at the start of each request that accumulates relevant metadata as the operation progresses
- The context object should make it possible to determine where something failed or what data was missing — without needing intermediate log lines
- Log the final context object at the end of the request

Example shape:
```ts
const ctx = createContext({ requestId, userId, action });
// ... enrich ctx throughout the request ...
logger.info(ctx, 'request completed');
```

---

## Refactoring

- Apply **Sandi Metz** rules and object design principles:
  - Classes no longer than 100 lines
  - Methods no longer than 5 lines
  - No more than 4 parameters per method
  - Controllers instantiate one object only
- Apply **Martin Fowler** refactoring patterns (Extract Method, Replace Conditional with Polymorphism, etc.)
- Use dedicated refactoring agents/passes — separate refactoring commits from feature commits

---

## Code Review

- After completing a task, review all changes before committing
- Check for: correctness, test coverage, boundary handling, log hygiene, naming clarity
- Flag anything that was left as a known trade-off or TODO

---

## Local Setup

- always create a Justfile and add at least a start command which will be the defualt command to start something locally
- always allow me to start it locally

---

## Commit Messages

Use **Conventional Commits** format. At the end of a task, produce a commit message the user can copy directly.

```
<type>(<scope>): <short description>

<body — what changed and why>

<footer — breaking changes, issue refs>
```

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `perf`

Example:
```
feat(auth): add OAuth2 login via Google

Implements the authorization code flow using the google-auth-library.
Adds FactoryBot factories for OauthCredential and updates seeds.
Boundary tests added with VCR tapes for the token exchange endpoint.

Closes #142
```
