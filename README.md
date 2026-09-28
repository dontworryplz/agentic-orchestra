# agentic-orchestra

Task-agent definitions and skill procedures for coding-agent runtimes.

12 agents. 9 skills. Installs into OMP, OpenCode, Claude Code, Cursor, and
Codex. Verifies itself: 23 checks, all of which fail when the thing they guard
breaks.

```bash
npx skills add dontworryplz/agentic-orchestra -g
```

```bash
npx agentic-orchestra install all
```

The first command installs the skills through the standard `skills` CLI. The
second installs skills plus agent definitions through this package's own CLI,
which is the only path that covers OMP. Do not use both for the same skill:
`skills` symlinks by default, `agentic-orchestra` copies.

## Layout

```
agents/          12 task-agent definitions, OMP frontmatter format (source of truth)
skills/          9 procedures, one SKILL.md each
bin/             npx entry point: install, update, drift, uninstall, verify, list, show, doctor
lib/             conversion, paths, drift detection, Node-side checks
tools/           one script per procedure step that rots when done by hand
tests/           golden conversions, contract evals, install-behaviour evals, live evals
docs/            architecture, skill reference, troubleshooting, gap manifest
install.py       dependency-free installer for all runtimes
uninstall.py     removes what was installed; keeps files you edited
verify.py        the 23 checks
```

## Agents

| Role | File | Reads | Writes | Spawns |
|---|---|---|---|---|
| discovery | `luna-explorer` | yes | no | no |
| research | `luna-researcher` | yes | no | no |
| implementation | `luna-worker` | yes | owned files only | no |
| test | `luna-tester` | yes | tests only | explorers, researchers |
| review | `luna-reviewer` | yes | no | no |
| tier-2 fan-out | `luna-coordinator` | yes | no | explorers, researchers, one reviewer |
| tier-2 seam owner | `luna-integrator` | yes | integration points | workers, one reviewer |
| long-context implementation | `space-bunny-worker` | yes | owned files only | no |
| long-context review | `space-bunny-reviewer` | yes | no | no |
| large-read discovery | `antigravity-gemini-explorer` | yes | no | no |
| parallel slice | `antigravity-sonnet-worker` | yes | owned files only | no |
| second-opinion review | `antigravity-opus-reviewer` | yes | no | no |

Spawning is a capability grant. An agent without a `spawns` key cannot spawn;
the runtime reports it as disabled, it does not fail. Leaves stay leaves for
concrete reasons: a worker that spawns breaks the file partition that makes
parallel work safe, and a reviewer that spawns is no longer an independent
gate. The spawn graph is acyclic, at most one hop deep, and `verify.py`
asserts all of it.

## Skills

Each skill is a procedure with a stated trigger, numbered steps, rejected
anti-patterns, an output contract, and a handoff section naming the sibling
procedures it hands off to.

`sol-luna-orchestrator` holds the topology and the routing table.
`context-fetch` controls what enters the context window, cheapest surface
first. `debug-issue` runs reproduce to guard, in order, with an exit condition
per step. `empirical-validation` requires an observation for every claim and
defines what is not evidence. `review-changes` establishes the diff base first,
then reports only reachable defects with severity and a fix. `executor` bounds
one approved task: owned files, stop conditions, no widening. `verifier` turns
each spec clause into a falsifying observation. `refactor-safely` requires the
blast radius before the edit and the widen-migrate-narrow sequence.
`graft` queries a code-graph index where one exists, and says so when none does.

## Install

```bash
git clone https://github.com/dontworryplz/agentic-orchestra.git
cd agentic-orchestra
./install.py --dry-run
./install.py
```

| Flag | Effect |
|---|---|
| `--runtime omp\|opencode\|claude\|cursor\|codex\|all` | target, default `all` where config exists |
| `--project` | install into `./.omp`, `./.opencode`, etc. instead of home |
| `--dry-run` | print the plan, write nothing |
| `--force` | overwrite existing files |
| `--agents-only` / `--skills-only` | install half the package |
| `--temperature N` / `--steps N` | OpenCode knobs, omitted unless given |
| `--model inherit\|sonnet\|opus\|haiku` | Claude Code field, default `inherit` |

Agent files are converted per runtime because the frontmatter schemas differ.
Skill files are identical everywhere and copied verbatim, except Cursor where
both agents and skills become `.mdc` rules, and Codex which takes skills only.

Installed files are never overwritten. A second run skips identical files and
reports differing ones; `--force` is the only override. Uninstall keeps any
file you edited after installation and says so.

Model pins are dropped, never translated. OMP pins provider-qualified IDs that
the other runtimes cannot express, so the pin is reported on stderr instead of
guessed into the wrong field.

## Keeping an installation current

```bash
npx agentic-orchestra drift    # current, stale, local, extra, absent, not-ours
npx agentic-orchestra update   # add missing, refresh stale, never touch local
```

The skills directory is shared with other tools. A skill this package did not
install is reported as not-ours and is never a removal candidate. Only the
agents directory belongs to this package.

## Verify

```bash
./verify.py              # 23 checks
./verify.py --fast       # skip the subprocess work
npm run verify:all       # both verify paths, evals, goldens, spawn graph
node tests/evals/live.mjs --run   # real model, real cost, opt-in only
```

Each check states how to break it. Mutation-tested: file renames, removed
sections, orphaned skills, fabricated model IDs, third-level spawn chains,
silently dropped capabilities, and mixed frontmatter forms all fail loudly.

## License

Boost Software License 1.0. See `LICENSE`.
