---
name: sol-luna-orchestrator
description: "Use GPT-6 Sol as conductor, GPT-6 Luna as default specialist, Space Bunny and Antigravity agents for complementary large-context exploration, bounded implementation, and independent deep review."
---

# GPT-6 Sol / GPT-6 Luna Orchestra

## Preflight: read the live model wiring first

Do not route work from memory. Before the first delegation, read the two places
that actually decide models:

1. `~/.omp/agent/config.yml` — `modelRoles` (root roles) and
   `task.agentModelOverrides` (per-role pins for subagents).
2. The `agents/*.md` frontmatter in this orchestra — each file's `model:` line.

These two can disagree, and the disagreement is the runtime's business, not
yours to guess at. Report the observed value; never state a model you did not
read. If a role appears in `agentModelOverrides` with a different ID than its
agent file, say both and treat the pin as unverified until a real `task` result
shows which one ran.

Confirm a model ID exists before routing to it (`omp models`). A model listed in
a provider catalog is not an invocable `task` role.

## Model topology

- **Conductor:** the root session model, expected `openai-codex/gpt-6-sol`. Sol owns interpretation, architecture, decomposition, cross-slice contracts, integration, final verification, and delivery. A skill cannot switch the root model; report a mismatch rather than claiming it is.
- **Default specialists:** GPT-6 Luna (`gpt-6-luna`, 272K context) for exploration, research, implementation, testing, and independent review. OMP `task` selects an agent role, not an arbitrary model ID; do not invent a `model` argument or claim an unverified runtime model.
- **Space Bunny is the long-context alternate, not a default.** `space-bunny-worker` and `space-bunny-reviewer` (`stealth/space-bunny-alpha`, 1M context) take over only when a slice or review genuinely exceeds what Luna can hold in one pass, or when a second vendor's judgment is wanted. Below that threshold Luna is the cheaper, faster default.
- **Antigravity supports Luna, not replaces it.** Select an available specialist only for a complementary, independent task. Its output is evidence or a bounded patch; Luna or Sol validates and integrates it. Do not spawn a model merely because it is listed in a provider catalog.

## Task-to-agent routing

| Task | Default | Optional specialist | Why / boundary |
|---|---|---|---|
| Broad, read-only repository mapping or large logs/docs | `luna-explorer` (or runtime-required `scout` for exploratory codebase research) | `antigravity-gemini-explorer` → Gemini 3.8 Flash, 1M context | Fast compression of a genuinely large read set. Read-only; Sol/Luna verifies decisive source lines. |
| Bounded independent implementation with disjoint file ownership | `luna-worker` | `antigravity-sonnet-worker` → Claude Sonnet 4.6, 250K context · `space-bunny-worker` → Space Bunny, 1M context | Separate coding slice only when useful parallelism exists. No shared-file edits, no mid-flight project-wide validation. |
| Deep independent architecture, security, or correctness review | `luna-reviewer` | `antigravity-opus-reviewer` → Claude Opus 4.6, 250K context · `space-bunny-reviewer` → Space Bunny, 1M context | Second opinion for high-risk flows or contested design. Read-only; evidence-backed blockers must be fixed before delivery. |
| Slice or review too large for one Luna pass | `space-bunny-worker` / `space-bunny-reviewer` | None needed | Use when the read set does not fit 272K. Escalating to Space Bunny for a small diff wastes budget and adds no signal. |
| Version-specific research or empirical testing | `luna-researcher` / `luna-tester` | None required by default | Use primary sources and actual execution; do not replace a test with a model opinion. |

Gemini 3.1 Pro (1M context) may be useful for visual/very-long multimodal analysis **only if a matching runtime agent is configured and verified**. The provider list alone does not make it an invocable `task` role. Likewise, Flash-lite, image, older Claude/Gemini, GPT-OSS, and tab-preview entries are not automatically assigned work. Choose by required capability and available agent role, not model count or context size. When an Antigravity provider returns `429 RESOURCE_EXHAUSTED`, report the unavailable slot and use an available qualified role; never fabricate its review.

If project instructions mandate a dedicated `security-reviewer`, run that agent separately. Do not assume its model is Luna or Antigravity without runtime evidence. Such a mandatory gate is not replaced by an optional Opus review.

## Delegation

Sol scopes with its own first search/read, decides architecture and exact cross-slice interfaces, then fans out only genuinely independent substantial slices. No delegation for trivial edits, one slice, or a direct question. Use one `task` batch for parallel slices; respect the runtime limit (currently four live subagents). Assign one writer per file/subsystem, preserve dirty/user-owned work, and serialize shared mutation through an integration owner.

Each task names objective, exact files/symbols, non-goals, constraints, shared interface, deliverable, and observable acceptance. Concurrent agents skip formatters, linters, builds, and project-wide tests; Sol runs focused and final validation after integration. Do not spawn every role mechanically.

## Pre-delegation gate

Before fanning out, Sol does three things itself — not because they are hard,
but because every one of them is cheaper to do once than to re-derive per
subagent:

1. **Preflight.** Read matching skills before work: `skill://graft` and
   `skill://context-fetch` for navigation, `skill://empirical-validation` for
   the proof standard the subagents will be held to, and
   `skill://refactor-safely` when a slice is structural.
2. **Inspect real state.** The selected finalized plan, plus the current
   repository state — not the state the plan was written against. Dirty or
   user-owned work in a slice's files is a partition conflict, and it is
   cheaper to find it now than after three agents have written.
3. **Trace the real boundary.** For any slice touching authorization, tenancy,
   or resource ownership, trace the actual enforcement path once. A subagent
   that has to discover where the guard lives will guess.

Substantial implementation requires an independent dedicated security review
with in-scope fixes before completion. This package ships no security-review
procedure, so that gate is either a project-mandated agent or an external tool
— it is not optional and it is not something a general reviewer substitutes for.

Sol inspects actual changes, tests changed behavior, resolves review findings, updates persistent planning state when required, and reports evidence and residual risks. Never claim an agent ran, a model was selected, or a security pass was granted unless observed in the tool result.

## Delegation tiers

OMP treats an agent's `spawns` key as a capability grant: without it, that
agent cannot spawn at all. Tiering is therefore an explicit decision, not a
default, and this package draws it in two places.

**Tier 0 — the root session.** You. Interpret, decompose, set interfaces,
integrate, verify, deliver.

**Tier 1 — agents that may spawn** (they carry a `spawns` list):

| Agent | May spawn | Owns |
|---|---|---|
| `luna-coordinator` | explorers, researchers, one reviewer | the split of a wide question and the synthesis of the answers |
| `luna-integrator` | workers, one independent reviewer | the seam: shared interface, file partition, combined result |
| `luna-tester` | explorers, researchers | locating the exercised path across a wide surface |

**Tier 2 — leaves.** Every other agent. They do not spawn, and that is a
property of their definition, not an accident of their configuration.

Why the leaves stay leaves, in one line each:

- `luna-worker` and the other writers own specific files. A worker that spawns
  another writer destroys the file partition that made parallel work safe.
- `luna-reviewer` and the other reviewers are an independent gate. A reviewer
  that delegates is no longer independent; the gate becomes a second opinion on
  its own subagent.
- `luna-explorer` and `luna-researcher` are cheap and single-purpose. Delegation
  from them costs more than the answer.

### The shape of the tree

Two levels below the root, never three. `1 (you) + 1 (tier 1) + 3 (children)` is
the live maximum, because `task.maxConcurrency` is 4 per level. A third tier
multiplies cost without multiplying coverage: the children of a leaf would
answer questions you could have answered with one more `graft` query.

`verify.sh` asserts this. The spawn graph must be acyclic, must have no
self-reference, must name only agents that exist, and must stay within one
spawning hop. A cycle does not crash — it recurses until the budget is gone, and
a leaf that quietly grew a chain is invisible in the cost until the invoice
arrives.

### When to promote an agent

Adding a `spawns` key to a leaf is the right move only when **all** of these
hold:

1. The question genuinely spans more code than one context window holds.
2. The parts partition cleanly, with no shared files between children.
3. The children can be read-only, or the parent can guarantee one writer per
4. file regardless of how many children run.
5. You can state the budget: how many children, at what depth, and what the
   total live-agent count becomes.

If any of the four is uncertain, do not spawn. Answer with one pass, or escalate
to tier 1 and let it decide.

## Hand off

Delegation is not the end of the procedure. Route the subagent to the skill its
slice needs, by name, in the assignment:

| The slice involves | The assignment must name |
|---|---|
| Locating code before reading it | `skill://context-fetch` |
| A defect with an unknown cause | `skill://debug-issue` |
| Structural change, rename, split, delete, contract change | `skill://refactor-safely` |
| A spec, requirement set, or acceptance criteria to check | `skill://verifier` |
| Any completion claim | `skill://empirical-validation` |
| A diff to gate before integration | `skill://review-changes` |
| Bounded execution inside a plan | `skill://executor` |
| A code-graph query in an indexed repo | `skill://graft` |

A task assignment that names only files and acceptance criteria leaves each
subagent to invent its own procedure. That is the most common cause of a
correct-looking report with no evidence behind it.

## Security gates

This package ships no security-review procedure, and the antigravity and luna
reviewer agents reference `skill://eresus-guard`, which resolves to nothing
here. The declared gaps are listed in `docs/unresolved-skills.txt`; a reference
to a missing procedure is a **stop-and-report** condition for the subagent, not
an invitation to improvise one.

If project instructions mandate a dedicated security review, run it as a
separate agent and treat it as mandatory. An optional second-opinion review does
not substitute for a required gate.
