---
name: review-changes
description: "Review a change as an independent gate: establish the exact diff base, then report only reachable defects with severity, evidence, and a fix. Use for staged, worktree, branch, or commit review before merge or commit."
---

# Review changes

## Establish the base before reading anything

`tools/diff-base.sh` does this for you. Run it before anything else; it prints
the base and the commands to read. If it refuses — a mixed state, or nothing to
review — that refusal *is* the first finding: the change is not reviewable as
one unit. Do not review past the refusal.

A review of the wrong bytes is worse than no review, because it produces
confident findings about code that will never ship. Determine what you are
reviewing first:

| Situation | Review exactly this | Do not read |
|---|---|---|
| Pre-commit | the staged index — `git diff --cached` | the worktree file; it may differ from what you stage |
| Staged blob content | `git show :path` | the on-disk file, which is not necessarily the staged one |
| Uncommitted work | separate tracked, staged, unstaged, and untracked sets | mixing them into one picture |
| Branch or PR | the diff against the merge base | `main`-vs-anything that skips a merge commit |
| Single commit | `git show <sha>` | the cumulative branch state |

State the base you used in the report. If the change mixes concerns, say so
before reviewing content — a diff that fixes a bug and reformats a file cannot
be judged as one unit.

## Procedure

1. Establish the base. See the table above; state it in the report.
2. Read the diff once, whole, before forming any opinion. A partial read produces
   findings about code that was not changed.
3. Walk the priority order top to bottom and stop descending when you run out of
   material findings. Do not read section 6 until sections 1-5 are clear.
4. For each candidate finding, run the evidence discipline: exact location,
   traced path, why the existing guard does not prevent it.
5. Refute it. A finding that survives its own refutation attempt is ready;
   one that does not is deleted, not softened.
6. Assign a severity. If you cannot name the failure mode, it is not a finding.
7. Check verification quality with the falsification test.
8. Write the verdict, then the findings, then resolved checks, residual
   uncertainty, and the commit recommendation.
9. If you have no material findings, say `PASS` and stop. Padding a clean review
   trains the reader to skip the next one.

## Priority order

Review in this order and stop descending once you are out of material findings.
The first three are where real damage lives; the last is rarely worth a line.

1. **Security boundaries** — authentication, authorization, tenant and resource
   isolation, secret handling, injection, SSRF, path traversal, unsafe
   deserialization, and any external effect the caller did not intend.
2. **Data integrity** — transaction boundaries, rollback, idempotency,
   concurrency, immutable records, migrations, partial failure, replay.
3. **Correctness** — violated invariants, error paths, empty and boundary
   values, lifecycle transitions, precedence between overlapping rules, time
   and numeric boundaries, races, timezone and off-by-one.
4. **Compatibility** — API and schema drift, existing callers, serialization
   format, CLI and UI behavior, deployment assumptions, whether a cutover is
   actually complete on both sides.
5. **Verification quality** — whether the tests exercise consumer-visible
   behavior and would fail for the plausible bug.
6. **Maintainability** — only when it creates a concrete future defect risk.

Never report taste, naming, formatting, import order, comment style, or
speculative "this could be more abstract". A review that spends its findings
there has failed to review.

## Evidence discipline

Every finding must carry all three, or it is not a finding:

1. an exact location — file and line, or file and symbol
2. the path that makes it real — the execution flow, the data flow, or the
   input that reaches it
3. why the existing code does not already prevent it

Two rules do most of the work here:

- **Trace source to sink, and guard to protected action.** Do not infer
  protection from a function name, a comment, a middleware registration you
  assumed, or a check in a caller you did not read. Read the guard.
- **Confirm the absence before reporting a gap.** "No test covers this" and
  "this check does not exist" are claims about the whole repository. Search
  with a second, differently-spelled query before asserting either.

Distinguish confirmed facts from residual uncertainty. A finding that mixes
the two is unactionable.

## Severity

| Level | Use when |
|---|---|
| P0 Critical | exploitable compromise, irreversible widespread data loss, production-wide outage |
| P1 High | authorization bypass, tenant escape, durable corruption, major contract break, likely severe outage |
| P2 Medium | real correctness or integration defect, bounded impact, or a failure path likely to occur |
| P3 Low | concrete minor defect with a real failure mode |

P3 is for defects, not for style. If you cannot name the failure, it is not
P3 — drop it.

## Verification findings

A missing or weak test is a finding **only** when a plausible regression is
otherwise unprotected. Apply the falsification test from
`skill://empirical-validation`: if the fix were reverted, would this test fail?
If yes, the test is real. If no, it is a tautology and its presence proves
nothing — that is the more serious finding, and it belongs in category 5.

A suite that passes because the changed path is never exercised is a
verification defect, not a green light.

## Refute your own findings

Before reporting, try to break each finding you intend to raise:

- Is the input actually reachable from a real caller or user?
- Is there a guard earlier in the flow that I did not trace?
- Does an existing test already pin this behavior?
- Is the invariant I say is violated actually guaranteed by the type system,
  the schema, or the framework contract?

If any of these dissolves the finding, drop it. Findings that cannot survive
their own refutation attempt are noise, and noise costs the reader the findings
that matter. Report fewer, better findings; an empty report with `PASS` is a
legitimate outcome.

## Rejected anti-patterns

| Anti-pattern | Why it is rejected |
|---|---|
| Reviewing the worktree during a pre-commit review | The staged bytes are what will ship; the worktree may differ |
| Reviewing the implementation story instead of the diff | The narrative is what needs checking, not the input to it |
| Reporting a finding whose reachable path you did not trace | Unfalsifiable; the reader cannot check it and cannot dismiss it either |
| Inferring a guard exists from a name, comment, or middleware you assumed | The guard is the thing under review; assume it is absent until read |
| "No test covers this" after one search | An absence claim about the whole repo needs a second, different query |
| Style, naming, formatting, import order, speculative abstraction | No failure mode; spends the reader's attention on nothing |
| Padding a clean review with suggestions | Manufactures work for the author and trains the reader to skip the report |
| Suggesting a redesign instead of the smallest fix | A correct minimal fix is cheaper to review and less likely to be wrong |
| Running a project-wide suite, formatter, or auto-fixer to "check" | A read-only gate must not mutate; it also answers a different question |
| Reporting PASS while residual uncertainty is unstated | The reader cannot tell an unreviewed area from a reviewed-and-sound one |
| Softening a P0/P1 into a suggestion because the change is nearly done | Severity is a property of the defect, not of the schedule |

## Constraints

- **Never modify anything.** No edit, write, stage, reset, stash, checkout,
  commit, or format. You are a read-only gate.
- **Run only focused, read-only verification.** A single test file, a single
  query, a `--dry-run`. Never a project-wide suite, a broad formatter, an
  auto-fixer, or a build that writes artifacts.
- Do not review the intent or the plan. Review the change as it stands.

## Output contract

Lead with exactly one verdict:

- `PASS` — no material findings. Say so plainly. Do not invent issues to appear
  useful, and do not pad with suggestions.
- `CHANGES REQUIRED` — findings that must be fixed before merge.
- `BLOCKED` — you could not establish the base, could not read the evidence, or
  a P0/P1 makes the change unsafe to merge regardless of the rest.

Then, per finding:

1. severity and a one-line title
2. exact location
3. the evidence and the reachable failure scenario
4. impact on the user, security, or operations
5. the smallest correct fix — not the most thorough redesign
6. the focused validation that would prove the fix

Close with:

- **Resolved checks** — important risks you inspected and found sound, so the
  reader knows the scope of what was cleared
- **Residual uncertainty** — what you could not read, could not run, or could
  not verify
- **Commit recommendation** — commit or do not, and why

Keep it compressed and evidence-first. If a section would be empty, omit it
rather than padding.

## Hand off

| The diff touches auth, secrets, trust boundaries, or user-controlled sinks | `skill://security-review` for the taint-trace procedure before you finalize severity |
| Your finding needs | Go to |
|---|---|
| Proof that a test would actually catch the bug | `skill://empirical-validation` — the falsification test decides whether the test is a finding or a tautology |
| Spec-level conformance rather than a diff | `skill://verifier` — clause by clause, with a verdict per clause |
| To reproduce a defect before reporting it | `skill://debug-issue` — a finding you could not reproduce is an unverified suspicion, and must be labelled that way |

## One finding, end to end

The contract above is abstract; this is what a P1 looks like when it is done
right.

> **P1 High — tenant escape via unfiltered list endpoint**
> `handlers/notes.go:42`
> `ListNotes` filters by `user_id` from the session, but the admin branch at
> line 51 passes `req.Query("user_id")` straight through. The guard at
> `middleware/auth.go:18` authenticates the caller and never checks tenancy, so
> any authenticated user reaching `/notes` with `?user_id=` reads another
> tenant's rows. Reachable from the public router at `routes/http.go:77`.
> Impact: cross-tenant data disclosure.
> Smallest fix: drop the query parameter from the admin branch and select the
> tenant from the session, as the non-admin branch already does at line 44.
> Validation: a test that creates two tenants, requests tenant B's notes as
> tenant A with and without the parameter, and asserts an empty result both
> times. Without the fix, the parameterized case returns B's rows.

What makes that a finding rather than a note: exact location, the traced path
from guard to protected action, a reachable scenario, the smallest fix, and a
validation that fails without it. What is missing is also stated — this
example says nothing about write paths, so that goes under residual
uncertainty, not silently under "resolved checks".
