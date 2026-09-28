# Architecture

## Layers

```
root session (conductor)          task[] (uzmanlar)              skill:// (prosedür)
─────────────────────────────────         ──────────────────────         ────────────────────
openai-codex/gpt-6-sol     →     luna-*          (5 rol)    →    graft
                                  space-bunny-*   (2 rol)         sol-luna-orchestrator
                                  antigravity-*   (3 rol)
```

- The **conductor** owns interpretation, architecture, slicing, interface
  contracts, integration, final verification, and delivery. It hands work to
  the specialists; it does not do the work in their name.
- The **specialists** take a single role: discovery, research, implementation,
  testing, or independent review. All of them report to the `Sol orchestrator`.
- **Skills** are not labels, they are executable procedures. The agent body
  routes with `skill://<name>`; the skill file defines the procedure.

## Agent roles

| Role | File | Model | Tools | When |
|---|---|---|---|---|
| Discovery | `core/agents/luna-explorer.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, lsp, web_search | find symbols, extract flow, map dependencies |
| Research | `core/agents/luna-researcher.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, web_search | current API/behaviour, primary source verification |
| Implementation | `core/agents/luna-worker.md` | `openai-codex/gpt-6-luna:max` | + edit, write | code slice with narrowed ownership |
| Test | `core/agents/luna-tester.md` | `openai-codex/gpt-6-luna:max` | + edit, write | repro, targeted test, produce evidence |
| Review | `core/agents/luna-reviewer.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, lsp, bash | independent correctness/security gate |
| Security review | `core/agents/security-reviewer.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, lsp, bash | SAST taint-trace via `skill://llm-sast-scanner`, Judge-verified findings only |
| Tier-1 fan-out | `core/agents/luna-coordinator.md` | `openai-codex/gpt-6-luna:max` | read-only + spawns | split a wide question, synthesize answers |
| Tier-1 seam owner | `core/agents/luna-integrator.md` | `openai-codex/gpt-6-luna:max` | + edit, write + spawns | own the shared interface and file partition |
| Long-context implementation | `core/agents/space-bunny-worker.md` | `stealth/space-bunny-alpha` | + edit, write | a slice that does not fit one pass (1M) |
| Long-context review | `core/agents/space-bunny-reviewer.md` | `stealth/space-bunny-alpha` | read, grep, glob, lsp, bash | a review that does not fit one pass (1M) |
| Antigravity discovery | `core/agents/antigravity-gemini-explorer.md` | `google-antigravity/gemini-3.8-flash:high` | read, grep, glob, lsp, bash | large read-only reading load (1M) |
| Antigravity implementation | `core/agents/antigravity-sonnet-worker.md` | `google-antigravity/claude-sonnet-4-6:high` | + edit, write | parallel, file-disjoint slice (250K) |
| Antigravity review | `core/agents/antigravity-opus-reviewer.md` | `google-antigravity/claude-opus-4-6:high` | read, grep, glob, lsp, bash | second opinion for a high-risk flow (250K) |

All model IDs were verified against `omp models` output (see README
"Verification").

## Routing rule

A task starts from the context window. For work that fits in 272K, `luna-*` is
always cheaper and faster. `space-bunny-*` and `antigravity-*` engage in only
two cases:

1. The reading load does not fit in one pass (1M models).
2. A disputed design needs a second vendor's opinion.

"Exists in the vendor catalogue" is not a delegation rationale. The rationale
is a capability need and a verified agent role.

## Model wiring — two sources, one verification path

Model pins are defined in **two separate places** and these can contradict
each other:

1. `~/.omp/agent/config.yml`
   - `modelRoles` → root roles (`plan`, `slow`, `smol`, `task`, `commit`, ...)
   - `task.agentModelOverrides` → role-based sub-agent pins
2. `agents/*.md` frontmatter → the `model:` line of each file

Resolved 2026-09-28 by decision, not by discovery: the GPT roles run the GPT-6
family, full stop. The live `config.yml` used to pin `gpt-5.6` while the agent
files pinned `gpt-6`; the config was moved to `gpt-6` and `verify.sh` check 1c
fails on any pin outside the `gpt-6-{luna,sol}` families plus the three documented
vendor pins. The one deliberate exception is
`vision: openai-codex/gpt-5.6-terra:auto`, because no `gpt-6-terra` exists in the
provider catalog — pinning a model ID that does not exist would be fabrication.
Re-check that exception against `omp models` whenever the catalog changes.

The repositories where the drift lived, and the state after the move:

| Role | `config.yml` before | `config.yml` now | agent frontmatter |
|---|---|---|---|
| `luna-*` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `space-bunny-*` | *(not defined)* | *(not defined)* | `stealth/space-bunny-alpha` |
| `vision` | `openai-codex/gpt-5.6-terra:auto` | **unchanged** (no GPT-6 terra) | — |

The preflight in `skills/sol-luna-orchestrator/SKILL.md` still reads both files
before routing. A decided policy does not replace reading the live wiring; it
replaces the unresolved disagreement the preflight used to have to report.

## Concurrency

`config.yml` → `task.maxConcurrency: 4`. At most four sub-agents at the same
time. The rule: one writer per file/subsystem. Shared file mutation is
serialized to the integration owner. Concurrent agents do not run the
formatter, linter, build, or project-wide tests; the conductor takes
verification after integration.

## Authority limits

No specialist agent holds extended authority:

- Read-only roles (`luna-explorer`, `luna-researcher`, `luna-reviewer`,
  `space-bunny-reviewer`, the 3 `antigravity-*` discovery/review ones) contain
  no `edit`/`write`.
- Writing roles touch only files that are explicitly assigned to them.
- No agent calls `stage` or `commit`; that is the conductor's job.
- All roles work with "report, then stop" discipline; they never claim
  delivery.

## Distribution layer

Three paths read the same `core/agents/` and `core/skills/` source. The
reason for the decision is scope, not preference:

```
                 core/agents/ (13)   core/skills/ (10)
                          │                  │
        ┌────────────────┴─────────┬────────┴───────────────┐
        │                          │                        │
  npx skills add            agentic-orchestra         installer/wizard.py
  (vercel-labs/skills)      (Node CLI)                (Python wizard)
        │                          │                        │
  skill only,               skill + agents,           skill + agents,
  default: symlink          12 providers,             12 providers,
                            copies, never overwrites  copies, never overwrites
```

`npx skills add` carries no agent definition and does not know OMP; in the
`skills` v1.7.0 agent table `opencode` and `pi` exist, `omp` does not. So if
OMP or the agent roles are needed, one of the other two paths is required.

The contract all three paths share as their only guarantee: **install never
overwrites.** `npx skills add` does not give that guarantee (it symlinks by
default, copies with `--copy`), so do not install the same skill via two paths
at once.

## Conversion layer

`core/agents/*.md` is the canonical format (OMP-compatible frontmatter).
Every other provider renders from it through its adapter
(`adapters/<id>.mjs` + `installer/adapters.py` + `lib/convert.mjs` /
`lib/convert.py`), so the mapping is declared once per target:

| Source field | OMP | OpenCode | Claude Code | Others without a native agent format |
|---|---|---|---|---|
| tools | `tools: a, b, c` | `a: true` map under `tools:` | `tools: A,B,C` Title-case list | body only (grant not expressible) |
| role | — | `mode: subagent` | — | labeled compatibility wrapper |
| model | `provider/model:effort` | *(dropped)* | `inherit` | *(dropped)* |
| extra field | `read-summarize` | `temperature`, `steps` | `effort` | — |

The implementations (bash, Node, Python) repeat each other on purpose: bash
is the dependency-free path, Node is the npx path, Python drives the
universal wizard. Without the checks that duplication would drift silently;
`verify.sh` check 12 compares bash vs Node byte-for-byte and `verify.py`
compares Python vs Node the same way.

Two rules bound the conversion:

1. **A model pin is never invented.** OMP wants `provider/model:effort`;
   OpenCode takes a short alias, Claude Code takes a four-valued enum. There
   is no common language. The scripts drop the pin and report it on stderr.
2. **Read-only status is preserved through conversion.** Every capability not
   given in the OpenCode output is written as `false`. Otherwise a discovery
   agent would gain write authority from the runtime default — a silent
   privilege escalation.

## Delegation tiers

`spawns` is a capability grant, not a hint. An agent without the key cannot
spawn at all; OMP reports `none (spawns disabled for this agent)`. So who may
delegate is a design decision recorded in the agent files.

```
tier 0   root session (Sol)              interprets, decomposes, integrates
              │  one hop
tier 1   luna-coordinator   → spawns   [luna-explorer, luna-researcher,
              │                             space-bunny-reviewer]
         luna-integrator    → spawns   [luna-worker, space-bunny-worker,
              │                             antigravity-sonnet-worker,
              │                             luna-reviewer,
              │                             space-bunny-reviewer]
         luna-tester        → spawns   [luna-explorer, luna-researcher]
              │  one hop
tier 2   leaves (10 roles)              no spawns key
```

Two constraints make the three tier-1 grants defensible:

- **`luna-tester` is the only tier-1 agent that writes**, and both of its
  children are read-only, so a fan-out cannot create a write conflict.
- **No reviewer spawns.** A reviewer that delegates is no longer an independent
  gate.

`luna-coordinator` and `luna-integrator` are new in 0.3.0. Before them the
package had ten specialists and no orchestrator: the routing table in
`sol-luna-orchestrator` referred to an "integration owner" role that nothing
defined, and a question too wide for one explorer's context had no answer
short of a partial one reported as complete.

The graph is asserted, not assumed. `tools/check-spawn-graph.mjs` fails on an
unknown target, a self-reference, a cycle, a third level, or a conversion that
drops `spawns` without saying so. It found two of those while being written: a
depth limit that was one too permissive, and a check that read stderr from a
child process which had none to give.

### Cost

`task.maxConcurrency` is 4 per level. The tree is capped at
`1 + 1 + 3 = 5` live agents, two tiers deep. A third tier would be
`1 + 1 + 3 + 9`: nine times the leaf cost for coverage that one more graph query
usually provides.
