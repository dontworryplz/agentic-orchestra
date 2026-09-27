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
| Discovery | `agents/luna-explorer.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, lsp, web_search | find symbols, extract flow, map dependencies |
| Research | `agents/luna-researcher.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, web_search | current API/behaviour, primary source verification |
| Implementation | `agents/luna-worker.md` | `openai-codex/gpt-6-luna:max` | + edit, write | code slice with narrowed ownership |
| Test | `agents/luna-tester.md` | `openai-codex/gpt-6-luna:max` | + edit, write | repro, targeted test, produce evidence |
| Review | `agents/luna-reviewer.md` | `openai-codex/gpt-6-luna:max` | read, grep, glob, lsp, bash | independent correctness/security gate |
| Long-context implementation | `agents/space-bunny-worker.md` | `stealth/space-bunny-alpha` | + edit, write | a slice that does not fit one pass (1M) |
| Long-context review | `agents/space-bunny-reviewer.md` | `stealth/space-bunny-alpha` | read, grep, glob, lsp, bash | a review that does not fit one pass (1M) |
| Antigravity discovery | `agents/antigravity-gemini-explorer.md` | `google-antigravity/gemini-3.8-flash:high` | read, grep, glob, lsp, bash | large read-only reading load (1M) |
| Antigravity implementation | `agents/antigravity-sonnet-worker.md` | `google-antigravity/claude-sonnet-4-6:high` | + edit, write | parallel, file-disjoint slice (250K) |
| Antigravity review | `agents/antigravity-opus-reviewer.md` | `google-antigravity/claude-opus-4-6:high` | read, grep, glob, lsp, bash | second opinion for a high-risk flow (250K) |

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

Observed example (measured at install time, `gpt-6`/`gpt-5.6` version drift):

| Role | `config.yml` `agentModelOverrides` | agent frontmatter |
|---|---|---|
| `luna-explorer` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `luna-worker` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `luna-reviewer` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `space-bunny-*` | *(not defined)* | `stealth/space-bunny-alpha` |

Which one wins is up to the runtime, it cannot be predicted. That is why the
preflight in `skills/sol-luna-orchestrator/SKILL.md` makes it mandatory to
**read both files before routing**: if the two IDs differ, report both and
verify which one really runs with a `task` result.

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

Two independent paths read the same `agents/` and `skills/` source. The
reason for the decision is scope, not preference:

```
                    agents/ (10)        skills/ (9)
                         │                  │
        ┌────────────────┴─────────┬────────┴───────────────┐
        │                          │                        │
  npx skills add            agentic-orchestra         install*.sh
  (vercel-labs/skills)      (Node CLI)                (bash)
        │                          │                        │
  skill only,               skill + agents,           skill + agents,
  80+ agent                 omp/opencode/claude       omp/opencode/claude
  varsayılan: symlink       kopyalar, üstüne yazmaz   kopyalar, üstüne yazmaz
```

`npx skills add` carries no agent definition and does not know OMP; in the
`skills` v1.7.0 agent table `opencode` and `pi` exist, `omp` does not. So if
OMP or the agent roles are needed, one of the other two paths is required.

The contract all three paths share as their only guarantee: **install never
overwrites.** `npx skills add` does not give that guarantee (it symlinks by
default, copies with `--copy`), so do not install the same skill via two paths
at once.

## Conversion layer

`agents/*.md` is in OMP format. The other two runtimes have a different
frontmatter schema, so conversion is applied in two places:

| Source field | OMP | OpenCode | Claude Code |
|---|---|---|---|
| tools | `tools: a, b, c` | `a: true` map under `tools:` | `tools: A,B,C` Title-case list |
| role | — | `mode: subagent` | — |
| model | `provider/model:effort` | *(dropped)* | `inherit` |
| extra field | `read-summarize` | `temperature`, `steps` | `effort` |

The two implementations (bash and Node) repeat each other on purpose: one is
dependency-free, the other is cross-platform. Without the duplication they
would silently diverge; `verify.sh` check 12 compares the two byte-for-byte
and on the first run found Node's `trailing-space` difference.

Two rules bound the conversion:

1. **A model pin is never invented.** OMP wants `provider/model:effort`;
   OpenCode takes a short alias, Claude Code takes a four-valued enum. There
   is no common language. The scripts drop the pin and report it on stderr.
2. **Read-only status is preserved through conversion.** Every capability not
   given in the OpenCode output is written as `false`. Otherwise a discovery
   agent would gain write authority from the runtime default — a silent
   privilege escalation.
