---
name: refactor-safely
description: Perform a behavior-preserving structural change without breaking callers, contracts, or stored data; use when a task renames, moves, re-signatures, splits, abstracts, or deletes code, or when a task touches a public surface or a persisted shape.
---

# Refactor Safely

## Defining rule

A refactor changes structure and never behavior. The moment observable behavior changes, the work is a feature or a bug fix, and it needs its own justification, its own verification, and its own change unit.

Three guarantees hold for every accepted refactor:
- Observable behavior, output, and externally visible state are identical.
- The public surface stays compatible, or the break is intentional, declared, and scheduled.
- Data already written stays readable, or a migration and compatibility window carry it forward.

One change unit, one purpose. A diff that fails to state equivalence is not shippable as a refactor.

## 1. Blast radius before edit

Before touching a line, enumerate every consumer of the shape you are about to change. Write the list into the change unit. An unrecorded list is not a list.

Sweep all of these, not only the first hit:
- Direct callers by name, including dispatch by string, reflection, dependency injection bindings, and configuration lookups.
- Every implementer of an interface, base type, or protocol you touch. A widened signature breaks all of them.
- Sibling variants of the same unit: other platforms, other backends, other locales, other feature tiers, other build targets, other deployment modes.
- Generated code, its templates, and its generator configuration. The emitted artifact is a consumer.
- Tests, fixtures, seed data, mocks, fakes, stubs, and contract tests.
- Snapshots, approved-output files, and recorded request or response payloads.
- Migration and backfill scripts, especially already-shipped ones. They are frozen callers.
- Serialized consumers: stored records, cache entries, queue messages, replayed logs, configuration values, environment values, feature flags, remotely delivered payloads.

Reach past the first hit. A single search result says nothing about the second consumer.

## 2. Classify the change by risk

| Change kind | Risk | Required action |
| --- | --- | --- |
| Pure internal rename, scope contained | Low | Single-pass rename, full suite run, no compatibility layer |
| Signature change, same semantics | Medium | Widen, migrate, narrow; old entry point keeps delegating until migration completes |
| Symbol moved across module boundaries | Medium | Re-export or shim at the old location first, migrate importers, then remove the re-export |
| Persisted or serialized shape changed | High | Not a refactor: migration plus compatibility window plus rollback, or leave the shape alone |
| Exported or public contract changed | High | Additive only, or a declared major break with a compatibility window and a deprecation notice |
| Abstraction layer introduced or removed | High | Justify against at least two real instances and a named variation axis; land it with behavior unchanged |
| One unit split into several | Medium | New units plus a facade preserving the old entry point, migrate callers, then delete the original body |
| Apparently-unused unit deleted | Medium | Two independent corroborating reference checks, plus a deprecation window, before removal |

## 3. Corroborate "no references"

"No references found" is a claim, not a fact, until a second method with a different blind spot agrees. Name two independent methods and record both results.

Independent methods, by blind spot:
- Symbol-name search across tracked sources, including singular, plural, and variant spellings.
- Whole-word search on the string form used at call sites, configuration, and runtime lookup.
- Type, interface, and signature search to catch implementers and implementor stubs.
- Import and dependency-graph inspection for edges text search misses behind aliases, barrel modules, and re-export files.
- Runtime evidence: logs, traces, or telemetry that name the symbol.
- Release history: an already-shipped version may still call it.

If the methods disagree, take the minimum. Dynamic lookup and out-of-repo consumers are invisible to every method here; treat them as present.

## 4. Sequence signature changes

Order is fixed: widen, migrate, narrow.

1. Widen. Add the new parameter or shape, keep the old entry point, and have it delegate. Behavior identical.
2. Migrate. Move every caller from the blast-radius list, one at a time, each independently correct.
3. Narrow. Remove the old path only when the list is empty and the deprecation window has elapsed.

Narrowing before every caller has migrated is a break, not a refactor. This holds equally for re-export removal, shim deletion, and default-value removal.

## 5. Treat data and migrations separately

Changing a persisted or serialized shape is not a refactor. Bytes already in the wild are a consumer you cannot enumerate and cannot recompile.

Required:
- A migration that both reads the old form and writes the new one.
- A compatibility window during which reads accept both forms and writes emit only one.
- A tested rollback for every step.
- A cutover point where old-form support is removed, on its own change unit.

Never combine a shape change, its migration, and structural cleanup in one change unit.

## Anti-patterns

- Refactoring and behavior change in one change unit. Rejected: the diff can no longer be reviewed for equivalence, and a regression cannot be attributed. Split them; the behavior change carries its own justification and verification.
- Deleting on the strength of one search. Rejected: every method has blind spots, and dynamic lookup, external consumers, and stored data are invisible to all of them. Require two independent methods, or a deprecation window.
- Leaving a deprecated shim with no removal owner. Rejected: permanent deprecation is permanent cost, and it silently becomes a second implementation. Every shim gets a named owner and a recorded removal condition.
- Abstracting after only one real instance. Rejected: the abstraction encodes a guess about the second instance and becomes more expensive to unwind with each caller. Require two real instances and a named variation axis.
- Renaming for aesthetics during unrelated work. Rejected: it inflates the diff, splits reviewer attention, and mixes a trivial cleanup with a risky change. Separate change unit.
- Skipping a cross-boundary consumer because it regenerates. Rejected: the generator reads the definition you edited, so the emitted artifact changes in the same change unit, and snapshots, fixtures, and recorded payloads shift silently. Regenerate deliberately, review the regenerated diff, and keep it inside the same change unit.

## Output contract

A completed refactor reports:

- Purpose: one sentence, one change unit.
- Equivalence: before and after behavior, asserted identical, with the check that proves it.
- Blast-radius list: every consumer enumerated, each marked migrated, shimmed, or verified unaffected.
- Corroboration: the two independent reference checks and their results, for everything deleted.
- Compatibility: shims, re-exports, deprecation windows, and the named owner of each.
- Data position: unchanged, or migration plus window plus rollback plus cutover.
- Verification: checks run and their results; anything unrun is named as unrun.
- Residual risk: what remains unproven and what would surface it.

Unverifiable is reported as unverified. No claim of equivalence without the evidence named above.
