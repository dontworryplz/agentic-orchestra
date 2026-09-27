# Skills reference

## What ships in this repo (9)

| Skill | What it does | Trigger |
|---|---|---|
| [`sol-luna-orchestrator`](../skills/sol-luna-orchestrator/SKILL.md) | Conductor/specialist topology, task→role routing table, delegation, and authority limits. | When work will be distributed in the root session. |
| [`context-fetch`](../skills/context-fetch/SKILL.md) | Context check starting from the cheapest sufficient surface; a "read nothing" gate before the first `read`. | Before opening a file, before finding a symbol. |
| [`debug-issue`](../skills/debug-issue/SKILL.md) | repro → characterize → localize → explain → fix at the root → prove the same scenario → protect the class. | Bug, crash, wrong result, flaky behaviour. |
| [`empirical-validation`](../skills/empirical-validation/SKILL.md) | Evidence ladder, falsification test, command hygiene, the "11 things that are not evidence" table. | Before you claim a fix works. |
| [`review-changes`](../skills/review-changes/SKILL.md) | Establishing the diff base, six-tier priority order, P0–P3, falsifying yourself before reporting. | Independent gate before a merge or a commit. |
| [`executor`](../skills/executor/SKILL.md) | Ownership contract, priority rules, "stop and report" conditions, no-expansion discipline. | When executing an approved, narrowed plan task. |
| [`verifier`](../skills/verifier/SKILL.md) | Spec clause → falsifying observation; three verdict values, no partial score; nine high-value surfaces. | When checking a spec/requirement/acceptance criterion against the code. |
| [`refactor-safely`](../skills/refactor-safely/SKILL.md) | Blast radius before editing, risk classification, expand→migrate→narrow, two search methods for "no reference". | For a structural change that preserves behaviour. |
| [`graft`](../skills/graft/SKILL.md) | Context from the `graft/` code graph, call traces, blast radius, file API. Preflight verifies the index exists. | Only in a graft-indexed repo, before grep/reading. |

The agents make 15 `skill://` references; 9 are here, 6 are declared in
[`unresolved-skills.txt`](unresolved-skills.txt). `eresus-guard` also passes
through from the orchestrator skill by plain name (no URI).

## Procedure graph

Skills are not independent documents, they are a call graph. Each one carries
a `## Hand off` section: in which situation you move to which procedure.

```
                      sol-luna-orchestrator   (grafın merkezi, 8'e bağlanır)
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   context-fetch        review-changes      empirical-validation
        │                   │                   │
        └─────┬─────────────┴────────┬──────────┘
              ▼                      ▼
        refactor-safely        debug-issue
              ▲                      ▲
              └──────────┬───────────┘
                         ▼
                     verifier
                         ▲
                    executor ──(DECISION_REQUEST)──► sol-luna-orchestrator
                         ▲
                         └── graft (yalnızca graft-indexed repo'da)
```

The rule: **the output of one procedure is the input of another.** `executor`
hands off to `refactor-safely`'s blast-radius step when the signature changes,
and to `empirical-validation`'s evidence ladder when reporting the result. When
this chain breaks, the agent invents the part.

`verify.sh` check 15 forces two things: every skill has a `## Hand off`
section, and no skill is an orphan (at least one other skill addresses it via
`skill://`). When the check was written it immediately found an orphan: nobody
referenced `sol-luna-orchestrator`, even though `executor`'s `DECISION_REQUEST`
flow is exactly its decision.

## How to install

These 9 skills can be installed with `npx skills add dontworryplz/agentic-orchestra-`;
they follow the `skills/<name>/SKILL.md` convention and the CLI discovers them
directly. Use `npx agentic-orchestra` when you also want the agent definitions
to come along, or to install into OMP. Details: [README](../README.md#install).

## Declared gaps (7)

`verify.sh` check 3 compares this list against the real reference set and goes
red on **divergence in both directions**: a reference not in the list, or a
record that now resolves.

| Skill | Why it is missing | How to close the gap |
|---|---|---|
| `eresus-guard` | nowhere at all | **authored.** Security gate procedure; the highest-value gap. |
| `caveman` | exists under `~/.agents/skills` and `~/.config/opencode/skills` | third party; a symlink instead of vendoring it here |
| `codebase-memory` | bound to the `codebase-memory-mcp` server | MCP-backed; not a portable `SKILL.md` |
| `context7-mcp` | bound to the context7 MCP server | MCP-backed |
| `gitnexus-exploring` | requires the gitnexus CLI + index | third party |
| `gsd-code-review` | part of the GSD skill set | third party |
| `no-ai-slop` | installed under `~/.omp/skills`, written elsewhere | third party |

Declaring a gap is better than inventing the skill: if the agent sees a valid
name and finds an empty procedure to follow, it produces one from its own head.

## Symlink setup

To follow a skill whose original lives somewhere else, together with its
updates:

```bash
mkdir -p ~/.omp/skills
ln -s ~/.agents/skills/caveman ~/.omp/skills/caveman
```

A symlink conflicts with `install.sh`'s copy behaviour: the install script
deletes the directory and copies. If you create the link, install that skill
with `--agents-only`, or run `install.sh` so that it never touches the skill.

## Optional dependencies

These skills are bound to an **external tool**; copying the file is not
enough.

| Skill | Required external interface | Status |
|---|---|---|
| `graft` | `graft/` index or the graft MCP server | binary not on PATH; index only in some repos |
| `codebase-memory` | the `codebase-memory-mcp` MCP server | bound on this machine |
| `gitnexus-exploring` | `gitnexus` CLI or MCP | needs a separate indexing step |
| `context7-mcp` | the context7 MCP server | must be added to the MCP config |

The agent body does not know this distinction; the `graft` skill carries its
own preflight, for the others see `docs/troubleshooting.md`.
