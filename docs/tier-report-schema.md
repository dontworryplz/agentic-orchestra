# Tier-1 report schema

Every agent that may spawn returns the same envelope, so the conductor parses
one shape rather than one per role.

## Why a single schema

The conductor is the only consumer of tier-1 output. When each role invented its
own field names, the conductor had to know which of `SYNTHESIS`/`CONFLICTS`,
`SEAM CHECK`/`REVIEW` and `STATUS`/`DECISION_REQUEST` belonged to which child —
which is exactly the kind of knowledge a conductor should not be holding in its
prompt, because the next role added would silently fall through the gap.

The envelope is fixed. What goes **inside** each field is the role's own
business, and a role may add fields after the last one; it may not rename,
reorder, or omit the first six.

## The envelope

Returned by `luna-coordinator`, `luna-integrator`, and by any agent that gains a
`spawns` key later.

| # | Field | Always | Contents |
|---|---|---|---|
| 1 | `ROLE` | yes | the agent's own name, so a mismatched report is obvious |
| 2 | `STATUS` | yes | `done` · `partial` · `blocked` · `stopped` — same four values `skill://executor` uses, so a tier-1 stop reads the same as a leaf stop |
| 3 | `DELEGATED` | yes | one line per child: role, exact assignment, non-goals, acceptance criterion. Empty if nothing was spawned, stated as such. |
| 4 | `EVIDENCE` | yes | what was observed, with its citation: command, exit status, decisive output, `file:line`. If nothing was observed, say `NONE` — do not describe instead. |
| 5 | `DELIVERED` | yes | what changed or was concluded, as distinct from what was asked for. Divergence is the point of the field. |
| 6 | `DECISION_REQUEST` | only when `STATUS` is `blocked` or `stopped` | the boundary hit, the options seen, the single question the conductor must answer |
| 7 | role-specific | varies | everything after this point is the role's own |

## Role-specific tails

| Role | Adds |
|---|---|
| `luna-coordinator` | `SPLIT` (the sub-questions and each child's non-goal), `CONFLICTS` (where two children disagreed, with both positions), `NOT COVERED` (parts no child addressed) |
| `luna-integrator` | `INTERFACE`, `PARTITION` (with the conflict check run), `INTEGRATED` (merge order and what each slice actually changed), `SEAM CHECK` (the one command that exercises the seam), `REVIEW` (the gate verdict unedited) |
| any future tier-1 agent | whatever its consumers need, after field 7 |

## Rules

1. **`STATUS` is one of four values.** No fifth value, no prose hedge. An agent
   that does not know reports `blocked` and explains in `DECISION_REQUEST`; an
   invented value like `mostly done` is unparseable and reads as `done`.
2. **`EVIDENCE: NONE` is a valid answer; a narrative is not.** "I reviewed the
   auth path" is not evidence. "Read `handlers/auth.go:31-58`; guard is
   `middleware/auth.go:18`" is. The rules are in `skill://empirical-validation`.
3. **`DECISION_REQUEST` carries one question.** Three questions is a decision
   deferred, and the conductor will answer the easiest one and drop the rest.
4. **A child's report is never restated as the parent's finding.** The parent
   cites what the child cited. Relaying a conclusion without its evidence is the
   failure this schema exists to make visible.
5. **A role that spawns nothing still returns the envelope**, with
   `DELEGATED: none` and its reason for not delegating. An empty report is
   indistinguishable from a crashed one.

## Assertion

`tests/evals/tier-report.mjs` checks that every agent carrying a `spawns` key
declares all six mandatory fields in order, and that `DECISION_REQUEST` is
conditional on `STATUS`. It is part of `verify.sh`, so adding a tier-1 role
without this envelope fails the build.
