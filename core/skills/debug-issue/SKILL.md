---
name: debug-issue
description: "Diagnose a failure in a fixed order: reproduce, characterize, localize, explain, fix the cause, prove the same scenario, guard the bug class. Use whenever investigating a bug, crash, wrong result, or flaky behavior."
---

# Debug issue

## The order

Debugging fails when steps are skipped, not when they are slow. Each step
below has an exit condition; do not enter the next one without it.

| # | Step | Exit condition |
|---|---|---|
| 1 | Reproduce | the failure occurs on demand, from recorded inputs and state |
| 2 | Characterize | you can state the exact boundary of the failure in one sentence |
| 3 | Localize | you can name the smallest region where correct and incorrect behavior diverge |
| 4 | Explain | you have a falsifiable hypothesis for that region |
| 5 | Fix | the source cause is corrected, not the symptom |
| 6 | Prove | the same scenario now behaves correctly |
| 7 | Guard | a test now fails for this bug class |

Skipping to step 5 from step 1 is guessing with a code editor. It produces
changes that cannot be evaluated, because there is nothing to compare against.

## 1. Reproduce

Capture: exact input, exact starting state, exact command or action, exact
error or wrong output, exact environment.

- If it does not reproduce, **stop**. Report what you tried, what you varied,
  and what you could not control. Do not fix on suspicion; an unreproduced
  "fix" is indistinguishable from a change that broke something else.
- Intermittent failures need a **rate**, not a vibe. Run it enough times to
  state "3 of 20", then localize on the varying input. A bug you cannot
  reproduce reliably cannot be proven fixed either.
- Capture the failing output verbatim before changing anything. It is the
  baseline for step 6.

## Triage: symptom to first probe

Step 1 is reproduce, but the *first* probe depends on the symptom shape. Guessing
wrong here costs an hour, so pick by symptom rather than by habit:

| Symptom | First probe | Why that one |
|---|---|---|
| Worked yesterday, broken now | `git log` on the suspect area; diff the last change | Recency correlates with exposure, not with cause, but it bounds the search fastest |
| Fails only for some inputs | Bisect the input set; find one working and one failing case | The difference between the two *is* the bug |
| Fails only for some users or tenants | Compare the two contexts field by field: role, permissions, locale, feature flags, data shape | Configuration divergence, not logic |
| Fails on second call, or under load | Check shared mutable state, caches, connection pools, idempotency | State and timing, not the happy path |
| Wrong values, no error | Print the actual value at the boundary where it is first wrong | An exception would have found it for you |
| Only in production | Establish what differs: version, config, data volume, feature flags | Almost always a divergence, not a code defect |
| Flaky, no pattern | Run it N times, record the rate and the varying input | A bug you cannot characterize cannot be proven fixed |
| Passes locally, fails in CI | Compare environment, dependency versions, and locale/timezone settings | The two environments differ somewhere findable |
| Regressed after a refactor | `git bisect` over the refactor commits | Refactors are behavior-preserving by contract, so the refactor broke an invariant |

Two universal disqualifiers for the first probe: **do not** clear caches or
restart the process as step one (that destroys the evidence and hides state
corruption), and **do not** start by reading more code. If you cannot name the
probe, you are not ready to probe — go back to reproduction.

## 2. Characterize

Write the boundary as one sentence: *"X happens when A, but not when B."*

Name what varies and what is held constant. The difference between the working
and failing case **is** the bug. Most of the work of debugging is finding a
second data point that differs in exactly one respect.

State the shape of the failure: deterministic or rate-dependent, one-shot or
progressive, data-dependent or state-dependent, first-run or after N.

## 3. Localize

Narrow by halves. Each probe should cut the candidate space roughly in half:

- bisect the input range
- bisect the call path
- disable or stub one layer at a time
- compare against the last known-good version of the single most suspicious unit

Instrument for a value, not a message. Print the actual data at the boundary —
an `assume`-style assertion that a value is correct, or a log that says
"entering handler", tells you nothing. Narrow until you reach a line where the
value is demonstrably wrong, and that line is inside your target.

Widen your search only when narrowing has actually stalled, and record what
you eliminated. A localization step that ends with "I read more files" has not
localized anything.

## 4. Explain before fixing

State a hypothesis that is **falsifiable** — something that, if false, means
you were looking in the wrong place.

Then design the observation that would refute it, and run that. A hypothesis
you cannot disprove is not an explanation; it is a preference.

Rank candidate causes and **eliminate by observation, not by plausibility**.
The most likely cause is frequently not the cause; ordering by intuition is
how confident wrong answers get made.

Rule out, in this order, because they masquerade as root causes:

- stale build output, cache, or generated artifacts
- environment, credentials, or configuration differing from the failing context
- the caller passing something the signature permits but the callee never
  handled
- a recent change to a shared dependency, schema, or migration
- the failure being a correct response to incorrect input from upstream

## 5. Fix the cause

Fix the line where the wrong value is produced. Do not fix the line where the
wrong value is noticed.

Then ask the class question: *why did nothing prevent this?* A missing
validation, a missing constraint, a missing test, an unclear contract. Close
the cheapest of those that genuinely covers the class — this is what stops the
next occurrence. Do not build an abstraction to prevent it; add the assertion
or the test.

## 6. Prove

The **same** scenario from step 1, run the same way, must now behave
correctly. Report the command, exit status, and decisive output.

Then probe one step past the boundary in both directions — one case stricter,
one more permissive. A fix that only works for the exact failing input has
moved the bug, not removed it.

Follow the rules in `skill://empirical-validation`: what you did not exercise
gets stated as not covered.

## 7. Guard

Add the smallest test that fails for this bug class — not for this exact input
if a neighboring input shares the cause. Confirm the guard by reverting the fix
mentally: if the test would still pass, it protects nothing.

## Anti-patterns

Each of these feels productive and produces no fixable root cause.

| Anti-pattern | Why it fails |
|---|---|
| Fixing before reproducing | there is no baseline, so success cannot be shown and regression cannot be detected |
| Changing several things, then attributing the pass | you do not know which change mattered, so you cannot keep the right one |
| Restarting or clearing state as the fix | it hides the state corruption that is the actual defect |
| Adding a retry, sleep, or reconnect | converts a deterministic defect into a flaky one and loses the signal |
| Widen scope when a probe fails | you have lost the bisect; the smallest suspect space was the one you had |
| "Works on my machine" | an unrecorded environmental difference, presented as a result |
| Deleting the failing test | removes the only evidence of the defect |
| Asserting a value is correct instead of printing it | assumes the invariant you are trying to test |
| Trusting an error message | messages are often generated at a different layer than the fault |
| Fixing the newest commit | recency correlates with exposure, not with cause |

## When to stop and hand back

Return a decision request instead of improvising when:

- the failure cannot be reproduced and the varying factor cannot be isolated
- the evidence needed exists only in production, or requires access you lack
- the cause spans a boundary you do not own
- two readings of the requirement produce different correct implementations
- the fix would require a contract, schema, or architecture change that was not
  authorized

Report what you observed, what you eliminated, and the specific evidence you
need. A well-scoped "blocked, here is the missing datum" is a successful
outcome; a speculative patch is not.

## Output contract

Report in this order. Never merge two sections; a merged report hides which
step actually failed.

1. **Reproduction** — exact input, starting state, command or action, verbatim
   output. If not reproduced, the report opens with `NOT REPRODUCED` and this
   section states the attempts and the varying factors tried.
2. **Boundary** — one sentence: "X happens when A, but not when B."
3. **Localization** — the smallest region where correct and incorrect behavior
   diverge, with the probe that narrowed it there and what each probe eliminated.
4. **Explanation** — the falsifiable hypothesis, and the observation that would
   have refuted it. Include the refuted candidates and the observation that
   refuted each.
5. **Fix** — the source cause corrected, plus the class guard added and why it
   covers the class rather than the instance.
6. **Proof** — the same scenario, the same way, now correct: command, exit
   status, decisive output. Plus the one-step-past-the-boundary probe in both
   directions. What was not exercised is named here.
7. **Residual** — what may still be wrong, and what would detect it.

Steps 4 and 5 are the ones that get skipped. If you cannot fill the
explanation section, you have not debugged — you have guessed. Report the
localization and the missing evidence instead of a patch.

## Hand off

| You are at | Reach for |
|---|---|
| Localizing, and the search is getting expensive | `skill://context-fetch` — cheapest sufficient surface before more reading |
| Proving the fix, before reporting | `skill://empirical-validation` — the pre/post rule and the falsification test |
| The fix is structural, not a one-line correction | `skill://refactor-safely` — widen, migrate, narrow; do not half-migrate |
| Re-reviewing the change after review findings land | `skill://review-changes` |

There is no shipped security skill. If the cause is an authorization, secret, or
input-trust boundary, stop and report it as a security-relevant boundary rather
than routing it to a procedure that does not exist here.
