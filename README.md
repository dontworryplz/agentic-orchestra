# agentic-orchestra

One AI-agent toolkit, every AI coding tool. Canonical agent and skill
definitions render into whatever each CLI natively consumes.

13 agents. 11 skills (incl. the full security-review with 34 references, plus calibrated-judgment).
12 providers: OMP, OpenCode, Claude Code, Codex, Cursor, Gemini, Copilot,
Qwen, Aider, Amp, Continue, and a generic Agent Skills fallback. Supported
tools, capability differences, and the SAST integration are documented in
`docs/providers.md`.

```bash
python3 installer/wizard.py        # pick any number of tools, scope, components
```

```bash
npx skills add dontworryplz/agentic-orchestra -g
```

```bash
npx agentic-orchestra --wizard     # same multi-select through the Node CLI
```

The wizard detects installed CLIs (detection only marks, never installs),
offers project/global/both scopes per capability, and prints a per-tool
matrix when done. The `skills` CLI installs skills only; the wizard installs
skills plus agent definitions, and is the only path that covers OMP. Do not
use both for the same skill: `skills` symlinks by default, the wizard copies.

## Layout

```
core/agents/     13 canonical agent definitions, one file each (source of truth)
core/skills/     10 procedures, one SKILL.md each (source of truth)
skills/          symlink to core/skills for `npx skills add` discovery
.agents/skills/  portable Agent Skills copy consumed by generic-compatible tools
adapters/        one module per provider: paths, capabilities, render, validate
registry/        provider registry (add a tool with one entry + tests)
installer/       universal wizard, capability-driven install, custom providers
bin/             npx entry point: install, update, drift, uninstall, verify, list, show, doctor
lib/             conversion, paths, detection, validation, drift, Node-side checks
tools/           one script per procedure step that rots when done by hand
tests/           adapter tests, golden conversions, contract and install-behaviour evals
docs/            providers matrix, architecture, skill reference, troubleshooting
install.py       legacy single-runtime installer (use installer/wizard.py)
uninstall.py     removes what was installed; keeps files you edited
verify.py        the checks
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
| `--target <id>` (repeatable) | provider to configure; any number at once |
| `--scope project\|global\|both` | where to install (only supported scopes offered) |
| `--components agents,skills,sast,rules` | what to install; defaults follow capabilities |
| `--dry-run` | print the plan, write nothing |
| `--force` | overwrite existing files |
| `--agents-only` / `--skills-only` / `--sast-only` | install one slice |
| `--temperature N` / `--steps N` | OpenCode knobs, omitted unless given |
| `--model inherit\|sonnet\|opus\|haiku` | Claude Code field, default `inherit` |
| `--yes` | non-interactive; detected tools and capability defaults |

Canonical definitions are rendered per provider because frontmatter schemas
differ; there is exactly one source of truth and no hand-maintained
per-provider copies. Skill directories copy verbatim, except Cursor where
both agents and skills become `.mdc` rules, Codex which takes skills only,
and the instruction-style CLIs where agents become labeled compatibility
wrappers (see `docs/providers.md`).

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
