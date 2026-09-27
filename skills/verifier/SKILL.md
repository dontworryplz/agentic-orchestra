---
name: verifier
description: "Verify that a specification's stated behavior is what the code actually does, clause by clause, and report satisfied / violated / unverifiable verdicts. Use when checking a spec, requirement set, acceptance criteria, or contract against an implementation, before signing off on a phase, or when asked to confirm, audit, or trace spec conformance."
---

# Verifier

Purpose: decide whether observed behavior matches specified behavior. Not proving that a
change works; that is `skill://empirical-validation`. Establish what the spec promises here,
then use that skill to establish what a change did.

## Core move

Convert every spec clause into an observable assertion **before** reading the implementation.

Write the falsifying observation first: what would I see if this clause were false? If no
observation can distinguish true from false, the clause is not verifiable. Report it as
unverifiable with the reason. Never let an unobservable clause default to passing.

Reading the code and confirming the code matches itself is not verification. Implementation
review is a separate activity; behavior is the only subject here.

## Procedure

1. Enumerate clauses. Split compound sentences into atomic clauses. Assign each a stable
   identifier in specification order. A clause split into three atomics is three rows, not one.
2. Classify each clause: observable, latent (intent without a checkable outcome), or external.
3. For every observable clause, write the falsifying observation before opening the
   implementation: state before, action taken, state after, and the result that would refute it.
4. Note the seam: input boundary, output boundary, persisted state, emitted signal, timing,
   or resource usage. No reachable seam means unverifiable, even when the logic is plainly present.
5. Probe the high-value surfaces below wherever a clause touches them. Spec silence is a gap.
6. Execute the observation. Record what happened, not what was intended.
7. Assign a verdict per clause. No fourth verdict, no partial credit, no averages.
8. Reconcile coverage: every clause id appears exactly once in traceability output.
9. Report. Mismatched clause counts between enumeration and traceability fail the verification.

## Clause-to-check structure

| Field | Purpose |
| --- | --- |
| Clause id | Stable reference, specification order |
| Clause text | The requirement, quoted or tightly paraphrased |
| Type | observable / latent / external |
| Seam | Where the observation is taken |
| Preconditions | State and inputs before the action |
| Action | The single operation performed |
| Falsifier | The specific observation that would refute the clause |
| Surfaces probed | Which high-value surfaces were exercised |
| Observed | What actually happened |
| Verdict | satisfied / violated / unverifiable |
| Evidence | Check name and outcome identifier |

## Verdict values

| Verdict | Applies when |
| --- | --- |
| satisfied | The falsifying observation was performed and did not occur |
| violated | The falsifying observation occurred, or a correct observation contradicted the clause |
| unverifiable | No reachable seam, unavailable dependency, or a latent clause with no checkable outcome |

`satisfied` requires execution, never inference. `violated` requires the deviation stated.
`unverifiable` requires a reason and what would resolve it.

## High-value surfaces

Probe each actively. Specs habitually omit them, and omission is where defects live.

1. Error paths: rejected input, absent dependencies, partial initialization, injected faults.
2. Degenerate inputs: empty, nil, single-element, maximum, and just past each boundary.
3. Lifecycle and state transitions: each legal transition plus illegal ones, repeated
   transitions, and transitions after terminal states.
4. Ordering and precedence: overlapping rules, conflicting rules, and which one wins.
5. Idempotency: the same invocation repeated, interleaved, and after partial completion.
6. Concurrency: simultaneous invocation, shared mutable state, and interleaving of the above.
7. Permission and authorization boundaries: identity absent, identity partial, identity
   unauthorized, and privilege changes after grant.
8. Numeric and time boundaries: zero, sign, rounding, overflow, time zones, clock skew,
   day boundaries, and inclusive versus exclusive endpoints.
9. Persisted shape compatibility: old data read by new code, new data read by old code, and
   partial or absent records.

## Anti-patterns

| Anti-pattern | Why rejected |
| --- | --- |
| Reading the implementation and agreeing with it | Confirms code matches code; behavior never observed |
| Deferring the falsifier until after reading code | Implementation knowledge silently narrows what you look for |
| Asserting on source text, formatting, or generated markup | Passes on refactors that break behavior; fails on rewrites that keep it |
| Asserting that a mock recorded the value handed to it | Echoes the input; proves nothing about the real path |
| Asserting only that no exception was raised | Wrong behavior that returns cleanly passes; the spec is about outcomes |
| Reporting one verdict for a group of clauses | Hides the violated member; loses the deviation |
| Marking an unreachable clause as satisfied | A check nobody can run is not a pass |
| Fixing the defect and re-verifying in the same pass | Turns verification into authorship; report the violation instead |
| Averaging verdicts into a score | A single violation fails the contract; a ratio hides it |

## Output contract

Report, in this order:

1. **Verdict line**: total clauses, and counts of satisfied, violated, unverifiable.
2. **Violations**: clause id, clause text, falsifier, observed deviation, smallest satisfying
   change. State the deviation; do not repair it.
3. **Unverifiable clauses**: clause id, reason, the missing seam or dependency, and what
   would make it checkable.
4. **Traceability**: every clause id mapped to its check, surfaces probed, and verdict.
   No clause may be omitted, and none may be dropped silently.
5. **Surface gaps**: high-value surfaces with no probe performed, each marked as a coverage
   gap rather than an implicit pass.
6. **Evidence index**: check name and outcome identifier per executed check, so any verdict
   can be re-derived independently.

Never emit a verdict for a clause absent from traceability. Incomplete verification is reported
as a scope limitation, never as a partial verdict.
