---
name: sol-luna-orchestrator
description: "Use GPT-6 Sol as conductor, GPT-6 Luna as default specialist, and selected Antigravity agents for complementary large-context exploration, bounded implementation, and independent deep review."
---

# GPT-6 Sol / GPT-6 Luna Orchestra

## Model topology

- **Conductor:** the active root session is `openai-codex/gpt-6-sol`. Sol owns interpretation, architecture, decomposition, cross-slice contracts, integration, final verification, and delivery. A skill cannot switch the root model; report a mismatch rather than claiming it is.
- **Default specialists:** GPT-6 Luna (`gpt-6-luna`) for exploration, research, implementation, testing, and independent review. `.codex/config.toml` and `.codex/agents/{explorer,worker,tester,researcher,reviewer}.toml` pin Luna/max for Codex roles. OMP `task` selects an agent role, not an arbitrary model ID; do not invent a `model` argument or claim an unverified runtime model.
- **Antigravity supports Luna, not replaces it.** Select an available specialist only for a complementary, independent task. Its output is evidence or a bounded patch; Luna or Sol validates and integrates it. Do not spawn a model merely because it is listed in a provider catalog.

## Task-to-agent routing

| Task | Default | Optional Antigravity specialist | Why / boundary |
|---|---|---|---|
| Broad, read-only repository mapping or large logs/docs | `luna-explorer` (or runtime-required `scout` for exploratory codebase research) | `antigravity-gemini-explorer` → Gemini 3.8 Flash, 1M context | Fast compression of a genuinely large read set. Read-only; Sol/Luna verifies decisive source lines. |
| Bounded independent implementation with disjoint file ownership | `luna-worker` | `antigravity-sonnet-worker` → Claude Sonnet 4.6, 250K context | Separate coding slice only when useful parallelism exists. No shared-file edits, no mid-flight project-wide validation. |
| Deep independent architecture, security, or correctness review | `luna-reviewer` | `antigravity-opus-reviewer` → Claude Opus 4.6, 250K context | Second opinion for high-risk flows or contested design. Read-only; evidence-backed blockers must be fixed before delivery. |
| Version-specific research or empirical testing | `luna-researcher` / `luna-tester` | None required by default | Use primary sources and actual execution; do not replace a test with a model opinion. |

Gemini 3.1 Pro (1M context) may be useful for visual/very-long multimodal analysis **only if a matching runtime agent is configured and verified**. The provider list alone does not make it an invocable `task` role. Likewise, Flash-lite, image, older Claude/Gemini, GPT-OSS, and tab-preview entries are not automatically assigned work. Choose by required capability and available agent role, not model count or context size. When an Antigravity provider returns `429 RESOURCE_EXHAUSTED`, report the unavailable slot and use an available qualified role; never fabricate its review.

If project instructions mandate a dedicated `security-reviewer`, run that agent separately. Do not assume its model is Luna or Antigravity without runtime evidence. Such a mandatory gate is not replaced by an optional Opus review.

## Delegation

Sol scopes with its own first search/read, decides architecture and exact cross-slice interfaces, then fans out only genuinely independent substantial slices. No delegation for trivial edits, one slice, or a direct question. Use one `task` batch for parallel slices; respect the runtime limit (currently four live subagents). Assign one writer per file/subsystem, preserve dirty/user-owned work, and serialize shared mutation through an integration owner.

Each task names objective, exact files/symbols, non-goals, constraints, shared interface, deliverable, and observable acceptance. Concurrent agents skip formatters, linters, builds, and project-wide tests; Sol runs focused and final validation after integration. Do not spawn every role mechanically.

## Eresus Guard workflow

Read matching skills before work (especially `eresus-autonomous`, `graft`, `empirical-validation`, and security/GSD skills when applicable). Run GSD preflight, inspect the selected finalized plan and current repository state, and trace the real authorization/tenant/resource path before delegation. Substantial implementation requires an independent dedicated security review with in-scope fixes before completion.

Sol inspects actual changes, tests changed behavior, resolves review findings, updates persistent planning state when required, and reports evidence and residual risks. Never claim an agent ran, a model was selected, or a security pass was granted unless observed in the tool result.
