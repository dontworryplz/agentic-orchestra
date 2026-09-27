---
name: empirical-validation
description: "Require observed proof before claiming completion. Use before reporting any fix, fix, or refactor as working, and whenever a claim would otherwise rest on reading code instead of running it."
---

# Empirical validation

## The rule

A claim is evidence-backed only when it cites an **observation from running the
system**. Reading code produces hypotheses about behavior; it never produces
evidence about behavior. "The code now returns early, so the error is gone" is
a hypothesis. "This command, run on this input, printed this, exit 0" is
evidence.

If you cannot produce the observation, the honest output is *"not verified"*,
not a confident summary. An unverified claim delivered confidently is worse
than an admitted gap, because it removes the reader's incentive to check.

## Proof ladder

Use the **cheapest tier that actually falsifies the claim**. Do not climb
higher for confidence you do not need; do not stop below the tier that could
expose the plausible defect.

| Tier | Observation | Sufficient for | Not sufficient for |
|---|---|---|---|
| 1 | Typecheck / build / lint | syntax, type errors, unresolved imports | anything behavioral |
| 2 | Targeted unit test on the changed unit | logic inside that unit | integration, wiring, persistence |
| 3 | Integration or component test touching the real boundary | contract across a module edge | production-only failure modes |
| 4 | Real runtime scenario — CLI invocation, HTTP request, job run, UI action | consumer-visible behavior | concurrency, scale, multi-tenant isolation |
| 5 | Reproduction before, same scenario after | a bug fix | unrelated adjacent behavior |

Two hard floors: **a bug fix is never reported at tier 1 or 2** if the defect
was consumer-visible — reproduce it first (tier 5, pre), then the same
scenario post. And **compilation is never a completion claim**, in any tier.

## Rejected as evidence

Each of these is something people routinely report. None of them is proof.

| Claim | Why it is not evidence |
|---|---|
| "It compiles" | Compilation constrains types and names, not behavior |
| "The tests pass" | Only if a test exercises the changed path — see the falsification test below |
| "The test was already passing" | A pre-existing pass proves nothing about your change |
| "The mock returned X so the result is X" | The mock encodes your assumption, not the system's behavior |
| "The assertion checks the source contains this string" | Asserts on text, not on behavior; passes on a wrong implementation |
| "It didn't throw" | Most defects are wrong values, not crashes |
| "The logic now returns early, so it's fixed" | An inference from reading code |
| "I ran it and it looked right" | Unrecorded, unrepeatable, uncheckable |
| "Retried and it went green" | A flaky pass is a defect report, not a pass |
| "Cleared the cache/state and it worked" | You changed the system to hide the symptom |
| "The screenshot looks correct" | Proves rendering, not the state transition that produced it |

## The falsification test

Before reporting any test as proof, ask: **if I reverted the change under
test, would this test go red?**

- **Yes** → real evidence. Keep it.
- **No** → it is a tautology. Delete it or rewrite it against behavior, then
  answer again.
- **Unclear** → you do not know what the test protects. Find out before
  claiming it.

Run this test against your own proof, not only against someone else's.

## Command hygiene

Every reported observation carries:

1. the exact command, verbatim, including flags
2. the working directory or repo root it ran in
3. the exit status
4. the decisive output line — the one that proves or disproves the claim, not a
   truncated tail

Capture the result as you run it. Do not reconstruct a command from memory at
report time, and never report a result you did not observe in this session. If
a command was blocked by permissions or environment, say that instead of
reporting the outcome you expected.

## Determinism

Prefer a command whose result does not depend on timing, ordering, network, or
wall-clock. When a check is flaky:

1. run it enough times to characterize the failure rate — not to get green
2. report the flakiness as a finding with the rate and the varying input
3. **never** present "passed on attempt 4" as a pass

Sleep, retry, and reconnect loops convert a deterministic defect into a
nondeterministic one and hide it. That is a regression in the evidence, not a
fix.

## Scope of the claim

State the boundary of what was exercised, explicitly, in both directions:

- what you ran, on what input, in what state
- what you did **not** exercise, and why (not reached, not available, out of
  scope)

Then never widen the claim. A focused pass on one path is not a statement about
the package, the module, or the project. If the reader needs a broader claim,
say what additional evidence would be required to make it.

## Relationship to repair

- Do not change production code to make a test pass. If the test is right, the
  code is wrong.
- Do not weaken an assertion, add a skip, or loosen a matcher to reach green.
- Do not delete a failing test; fix the cause or report the conflict.
- A pre-existing failure is a finding to report, not a blocker to route around.

## Output contract

Report, in this order:

1. **Claim** — one sentence, falsifiable.
2. **Evidence** — command, cwd, exit status, decisive output.
3. **Tier** — which rung of the ladder, and why that tier was enough.
4. **Pre/post** — for a fix: the same scenario observed failing before.
5. **Not covered** — what remains unexercised.
6. **Residual risk** — what could still be broken, and what would detect it.

If step 2 is unavailable, the first line of the report is **NOT VERIFIED**,
followed by what you tried and what access you need. Never substitute a
plausible narrative for a missing observation.
