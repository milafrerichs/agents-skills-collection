# Recording payloads

Exact shapes for the calls that populate the dashboard. Read this before
Step 3f / 3g. These are the same payload shapes `watched-run` and `work-shift`
send — a reviewer should see one consistent format regardless of which skill
produced the execution.

- [store_review_report](#store_review_report) — your own structured self-assessment
- [store_critic_report](#store_critic_report) — the independent second opinion
- [summary_html](#summary_html) — the narrative overview on `complete_execution`

Division of labour: `store_review_report` is the canonical structured data,
`store_artifact` holds the full-text plan and review markdown, and
`summary_html` is narrative only. Do not re-embed the diff in the HTML — Focus
Review renders it from the review report.

---

## store_review_report

```
execution_id, agent_id, confidence, intro, outro,
requirements[], planCheck[], diff[], selfReview[], tests{}
```

Every field is optional to the server and effectively required in practice —
an omitted field renders as an empty panel to the reviewer.

### confidence (0–100)

An honest answer to "is this safe to approve?". It drives the risk buckets
shown on the queue chip, the intro, and the verdict.

| Range | Meaning | Typical cause |
|---|---|---|
| ≥ 85 | Safe to approve | Plan matched, review clean, tests green |
| 70–84 | Skim recommended | Minor partials or warnings |
| < 70 | Scrutinize | A step diverged, a check failed, tests incomplete, a requirement unmet |

Inflating this is the one thing that makes the whole dashboard useless — the
reviewer's triage order (and whether this task even gets looked at before
others) depends on it being truthful.

### intro / outro

First person. `intro` is 2–3 sentences: what was built, roughly how much, and
your gut on safety. `outro` is the closing recommendation: whether you would
approve and the one or two judgement calls you are deliberately leaving to
the human.

### requirements[]

Plain strings, one per FR/NFR, keeping the id prefix: `"FR-001: The system
MUST …"`, `"NFR-001: …"`. Source them from the `functional_requirements` /
`non_functional_requirements` arrays returned by `get_issue_spec` (3a) — the
same list covered in the plan's requirements-coverage section (3b) and walked
in verify (3e). Only fall back to the description's acceptance criteria when
the spec has no FR/NFR sections.

### planCheck[]

One entry per numbered implementation step from the plan, in order.

```json
{
  "step": "3. Add GET /companies/search handler with pagination",
  "status": "match",
  "note": "Short explanation of the outcome",
  "narration": "I added the handler and wired it to the existing search service.",
  "diff": { "name": "api/search.ts", "add": 41, "del": 3, "lines": [] }
}
```

`step` is display text shown verbatim, not a join key — keep it readable and
identical to the plan. `status` derives the risk shown in the Walkthrough
rail:

- `match` — implemented as planned (safe)
- `partial` — right direction, scope or approach differed (watch) — explain in `note`
- `diverged` — significant departure (risky) — explain in `note`

`diff` is the evidence pointer for that one step: a single hunk in the same
shape as a top-level `diff` entry, or `null` when the step changed no code.

### diff[]

Derived from `git diff origin/$BASE_BRANCH`, one entry per changed file.

```json
{
  "name": "api/search.ts",
  "add": 41,
  "del": 3,
  "lines": [
    { "k": "ctx", "text": "export async function search(q: string) {" },
    { "k": "del", "text": "  return db.query(raw);" },
    { "k": "add", "text": "  return db.query(sql`... ${q} ...`);",
      "annotation": {
        "summary": "Parameterised — the raw interpolation was injectable",
        "rationale": "q comes straight off the query string",
        "confidence": "high",
        "tags": ["security"]
      }
    }
  ]
}
```

`add` / `del` come from `git diff --stat`. Include **all** lines of each
changed hunk, context included — `k` is `ctx`, `add`, or `del`, and the text
carries no leading `+`/`-`.

Annotate sparingly: 1–3 per file, only where intent, risk, or a design
decision is not obvious from the code. Annotating every line trains the
reviewer to skip them all.

### selfReview[]

One entry per rule actually applied. Rules with no relevant code in this
change can be omitted — the dashboard renders what it is sent and counts
`warn`/`fail`.

Use the exact names so reviewers can trace them back to the skills:

- Clean Code: `Naming`, `Function Size`, `Single Responsibility`, `Error Handling`, `Comments vs. Code`
- Sandi Metz: `Law of Demeter`, `Message Passing`, `Class Responsibility`, `Flocking Rules`, `Inheritance vs. Composition`

```json
{
  "rule": "Single Responsibility",
  "verdict": "warn",
  "note": "SearchService also formatted output; extracted SearchPresenter.",
  "narration": "I split the formatting out so the service only queries.",
  "diff": null
}
```

`verdict` is `pass`, `warn`, or `fail`. `fail` is risky and `warn` is watch in
the Walkthrough; `pass` entries are not shown as beats, so a short confirming
`note` is enough. Supply `narration` whenever the verdict is not `pass`.

### tests{}

```json
{ "passed": 24, "failed": 0, "added": 6 }
```

---

## store_critic_report

Anchored to the immutable `commit_sha`, which is what lets findings render
inline beside the code in the morning review.

```json
{
  "execution_id": "...",
  "agent_id": "night-shift-critic-20260727-001",
  "commit_sha": "<sha>",
  "verdict": "approve_with_nits",
  "confidence": 82,
  "summary": "Solid handler; one unhandled empty-query case.",
  "files": [
    {
      "path": "api/search.ts",
      "summary": "New search handler.",
      "annotations": [
        {
          "newRange": [47, 52],
          "severity": "warn",
          "summary": "Empty q returns the full table",
          "rationale": "No guard before the query; a blank param scans everything.",
          "tags": ["performance"]
        }
      ]
    }
  ]
}
```

`newRange` is `[start, end]`, 1-based inclusive, in the **new** file at the
reviewed commit; a single line is `[n, n]`. Severity is `blocker`, `warn`, or
`nit`. One annotation per concrete issue — a paragraph covering three
problems cannot be anchored or resolved individually.

`verdict` is `approve`, `approve_with_nits`, or `request_changes`. An empty
`files` array is a valid clean review. The critic's `confidence` is promoted
to the execution's confidence for the Focus Review sort, so
`request_changes` with blockers belongs below 70.

The critic's `agent_id` must differ from the implementing agent's — same id
makes it a self-review wearing a costume.

---

## summary_html

Passed as `summary_html` on `complete_execution`. Self-contained: inline CSS,
no external dependencies, no relative links — the branch is pushed but there
is no PR yet, so there's nowhere for a relative link to resolve to.

```html
<h1>Night Shift: TECH-123</h1>
<p class="meta">2026-07-27 | night-shift-20260727-001 |
   <a href="https://linear.app/…/TECH-123">Linear: TECH-123</a></p>

<h2>Summary</h2>
<p>Two or three sentences: the task and what was done.</p>

<h2>Plan Review</h2>
<p><strong>GO.</strong> Key findings: …</p>

<h2>Changes</h2>
<table>
  <tr><th>File</th><th>What changed</th><th>Why</th></tr>
</table>

<h2>Diff</h2>
<pre>git diff --stat output</pre>

<h2>Requirements Coverage</h2>
<p>4/4 FR, 2/2 NFR met.</p>

<h2>Test Results</h2>
<p>PASS — 24 tests, 0 failed — npm test</p>
<pre>…last 10 lines of output…</pre>

<h2>Known Issues</h2>
<p>None.</p>

<h2>Worktree</h2>
<p>branch <code>night-shift/add-user-search-endpoint</code>, pushed to
   <code>origin/night-shift/add-user-search-endpoint</code> — no PR opened.</p>
```

Do not re-embed the diff or the full plan/review markdown here — the diff is
already rendered from `store_review_report`, and the full text lives in the
`store_artifact` records.
