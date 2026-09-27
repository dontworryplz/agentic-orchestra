# agentic-orchestra

[OMP](https://github.com/), an orchestration package for OpenCode and Claude
Code: **10 task agents + 9 skill procedures + 4 install/uninstall scripts + a
verification harness**.

The root session (conductor) splits the work into parts, hands each part to a
single specialist role, then verifies it itself. Specialists do not work on
their own; each one owns a single responsibility and returns with evidence.

> The trailing hyphen in the repo name is real: `agentic-orchestra-`.
> The name without it returns 404.

## Contents

```
agents/                        10 task agents (OMP agent format, source format)
  luna-explorer.md             discovery       · read-only · 272K
  luna-researcher.md           research        · read-only · 272K
  luna-worker.md               implementation · write     · 272K
  luna-tester.md               test            · write     · 272K
  luna-reviewer.md             review          · read-only · 272K
  space-bunny-worker.md        implementation · write     · 1M
  space-bunny-reviewer.md      review          · read-only · 1M
  antigravity-gemini-explorer.md   discovery   · read-only · 1M
  antigravity-sonnet-worker.md     implem.     · write     · 250K
  antigravity-opus-reviewer.md     review      · read-only · 250K

skills/                        9 skill procedures (SKILL.md, same across runtimes)
  sol-luna-orchestrator/       topology, routing table, delegation rules
  context-fetch/               context check starting from the cheapest sufficient surface
  debug-issue/                 repro → localize → explain → fix at the root → prove
  empirical-validation/        evidence ladder, falsification test, rejected evidence
  review-changes/              diff base, priority order, P0–P3, self-refutation
  executor/                    ownership contract, stop-and-report conditions
  verifier/                    spec clause → falsifying observation, 3 decision values
  refactor-safely/             blast radius, expand/migrate/contract
  graft/                       context/call/blast-radius queries from the code graph

package.json                   npx entry point (bin: agentic-orchestra) + skill metadata
bin/agentic-orchestra.mjs      install · uninstall · verify · list · show · doctor
lib/
  convert.mjs                  OMP → OpenCode / Claude Code conversion
  frontmatter.mjs              the YAML subset these files use
  paths.mjs                    runtime directory resolution
  verify.mjs                   invariant checks (Node side)

install.sh                     install for OMP (idempotent, never clobbers)
install-opencode.sh            OMP → OpenCode converter
install-claude.sh              OMP → Claude Code converter
uninstall.sh                   removes what was installed; leaves edited files alone
verify.sh                      15 checks + isolated-HOME install smoke test

docs/
  architecture.md              layers, roles, model wiring
  skills-reference.md          which skill exists, which is missing, why
  unresolved-skills.txt        machine-readable gap list (verify.sh reads it)
  troubleshooting.md           observed problems and diagnostic commands
AGENTS.md                      invariants for agents editing this repo
CHANGELOG.md
```

## Quick start

If you only want the **skills**, the ecosystem standard is enough:

```bash
npx skills add dontworryplz/agentic-orchestra- -g
```

If you want the skills **and the agents** (or you are installing to OMP):

```bash
npx agentic-orchestra install all
```

Both use the same files; see below for what goes which way.

## Installation

### Two paths, two scopes

This package carries two things and there are different paths for each:

| | Skills (9) | Agent definitions (10) |
|---|---|---|
| `npx skills add` | ✅ | ❌ |
| `npx agentic-orchestra` | ✅ | ✅ |

**`npx skills add dontworryplz/agentic-orchestra-`**

The [vercel-labs/skills](https://github.com/vercel-labs/skills) CLI — the
de-facto standard for agent skills (Nutlope/hallmark uses it too; it has no
installer of its own). It clones the repo, scans the `skills/` directory by
convention, and installs into the agents you pick. In this repo you do not
need to do anything extra.

```bash
npx skills add dontworryplz/agentic-orchestra- --list                    # what is there
npx skills add dontworryplz/agentic-orchestra- -g -y                     # global, all of it
npx skills add dontworryplz/agentic-orchestra- -g -y -a opencode claude-code
npx skills add dontworryplz/agentic-orchestra- -g -y -s debug-issue     # single skill
```

This path covers more than 80 agents (`opencode`, `claude-code`, `codex`,
`cursor`, `copilot`, `gemini-cli`, …) and sets up a **symlink** by default.

**`npx agentic-orchestra`**

```bash
npx agentic-orchestra                      # install into every runtime found
npx agentic-orchestra install omp          # OMP only
npx agentic-orchestra install all --dry-run
npx agentic-orchestra list                 # 10 agents + 9 skills
npx agentic-orchestra show luna-worker --runtime opencode
npx agentic-orchestra doctor               # show runtimes and state
npx agentic-orchestra verify               # verify the invariants
npx agentic-orchestra uninstall omp
```

This path adds two things:

1. **Agent definitions.** The `skills` standard carries skills; there is no
   standard way to carry task agents. Here you get 10 roles.
2. **OMP support.** `omp` is **not** in the agent table of `skills` v1.7.0 —
   `opencode` and `pi` are there, `omp` is not; the package also does not know
   `PI_CODING_AGENT_DIR`. OMP's directories are `~/.omp/skills` and
   `~/.omp/agent/agents`.

**Which one should I pick?**

| Situation | Path |
|---|---|
| Skills only, OpenCode/Claude/Codex/Cursor | `npx skills add` |
| I am using OMP | `npx agentic-orchestra` |
| I want the agent roles too | `npx agentic-orchestra` |
| `git clone` + script, version control | `install.sh` |

> **Do not use both paths for the same skill at the same time.** `skills`
> creates a symlink by default, `agentic-orchestra` copies. If the same skill
> sits in both places through two different mechanisms, it becomes unclear
> which one is authoritative. Pick one: either `skills` with `--copy`, or
> `agentic-orchestra`.

### Installing from the repo (by cloning)

```bash
git clone https://github.com/dontworryplz/agentic-orchestra-.git
cd agentic-orchestra-

./install.sh             # OMP
./install-opencode.sh    # OpenCode
./install-claude.sh      # Claude Code
./uninstall.sh --omp     # undo
```

These four scripts need neither bash nor Node dependencies — for those who do
not want to use `npx`. All three implement the same contract:

| Flag | Effect |
|---|---|
| `--dry-run` | writes nothing, only shows the plan |
| `--force` | clobbers existing files |
| `--user` (default) / `--project` | target scope |
| `--agents-only` / `--skills-only` | installs only part of it |
| `--show <agent>` | prints the conversion, writes nothing |
| `--temperature N` / `--steps N` | OpenCode knobs |
| `--model <inherit\|sonnet\|opus\|haiku>` | Claude Code `model:` field |

### Target directories

| Runtime | Agents | Skills |
|---|---|---|
| OMP | `~/.omp/agent/agents/` | `~/.omp/skills/` |
| OpenCode | `~/.config/opencode/agents/` | `~/.config/opencode/skills/` |
| Claude Code | `~/.claude/agents/` | `~/.claude/skills/` |

With `--project` it installs under `./.omp/`, `./.opencode/`, `./.claude/`
respectively.

### Why the scripts are idempotent and why they never clobber

They do not install the same file a second time, they skip it silently. If it
differs, they **do not clobber**, they warn and require `--force`.
`~/.omp/agent/agents` is not a source, it is a distribution target; an
installer that crushes your local edits is worse than no installer at all.
`uninstall.sh` applies the same contract in reverse: it does not delete a file
you edited after installing, it reports it.

This behavior is a test inside `verify.sh`: install into an isolated HOME, force
all 19 of them to say "identical, skipped" on the second run, then edit one
file and force the third run to say "exists and differs" and preserve the file.

### Manual installation

```bash
AGENTS=~/.omp/agent/agents
SKILLS=~/.omp/skills
mkdir -p "$AGENTS" "$SKILLS"
cp agents/*.md    "$AGENTS"/
cp -R skills/*/   "$SKILLS/"
```
## What the converters do and do not do

`agents/*.md` is in OMP format. When installing into other runtimes:

| Field | OMP | OpenCode | Claude Code |
|---|---|---|---|
| tools | `tools: read, grep, glob` (comma-separated list) | `tools:` → `read: true` map | `tools: Read,Grep,Glob` (Title-case list) |
| role | — | `mode: subagent` | — |
| model | `openai-codex/gpt-6-luna:max` | **dropped** | `inherit` |
| extra | `read-summarize: false` | `temperature`, `steps` | `effort` |

Two rules that are constraints, not options:

1. **The model pin is never fabricated.** OMP pins in `provider/model:effort`
   form; OpenCode accepts a short alias (`haiku`), Claude Code accepts a
   four-value enum (`inherit|sonnet|opus|haiku`). There is no common language.
   The scripts **drop the OMP pin and report it every time**; on the Claude
   side they write `inherit`. `verify.sh` enforces this as a separate check.
2. **Read-only-ness is preserved in conversion.** Every capability not given
   in the OpenCode output is explicitly written as `false` — including
   `edit`/`write`/`patch`. A discovery agent gaining write permission through
   a runtime default would be a silent privilege escalation.

The `lsp` tool has no OpenCode or Claude Code equivalent; it is dropped and
reported. `web_search` → `webfetch` in OpenCode, `WebSearch` in Claude Code.

To see the conversion:

```bash
./install-opencode.sh --show luna-explorer
./install-claude.sh   --show luna-worker
```

## Verification

### The package verifies itself

```bash
./verify.sh            # 15 checks, 17 assertions + isolated-HOME install smoke test
./verify.sh --fast     # skip the smoke tests (10 checks)
./verify.sh --quiet    # print only errors
```

Each check turns an invariant written in `AGENTS.md` into an assertion:

| # | Check | How to break it |
|---|---|---|
| 1 | Frontmatter exists | delete a file's leading `---` |
| 2 | Matches by `name` | rename the file, leave the frontmatter alone |
| 3 | `skill://` references resolve or a gap is declared | add a fabricated skill name |
| 4 | Runtime files are in English | add a Turkish sentence to an agent |
| 5 | A read-only role carries no write permission | add `edit` to a discovery agent |
| 6 | No placeholders | add `TODO` |
| 7 | Shell syntax | unbalance the quotes in a script |
| 8 | No duplicate YAML key in the conversion | map two OMP tools to one OpenCode key, do not dedupe |
| 9 | Every agent converts into every runtime | give a tool value with no mapping branch |
| 10 | The model pin is not fabricated | write a `model:` derived from the OMP pin into the converter |
| 11 | Install smoke test | take the installer out of idempotency |
| 12 | The bash and Node converters are identical | change a mapping in `lib/convert.mjs`, leave the bash counterpart alone |
| 13 | `npx skills add` compatibility | rename the `skills/` directory |
| 14 | The npx entry point is executable | delete the shebang |
| 15 | The procedure graph is connected | delete a `## Hand off` section |

All checks were verified by mutation testing: each one produces `FAIL` when
broken. Check 12 genuinely works — on the first run it found that the Node side
prints `tools: ` (trailing space) while bash prints `tools:`. The Turkish check
also does not produce false positives on English words like `Compile` or
`argument`.

`verify.sh` (bash) and `npx agentic-orchestra verify` (Node) check the same
invariants; the bash side runs all 15 checks, the Node side runs the 11 that do
not require a shell.

### After installation

```bash
# OMP
omp --skills='graft,review-changes' -p "list your available skills"
omp -p "list your available task agents"

# OpenCode
opencode run 'list your available agents and skills'

# Are the model IDs valid?
omp models | grep -E 'gpt-6-luna|gpt-6-sol|space-bunny-alpha|gemini-3.8-flash|opus-4-6|sonnet-4-6'
```

## Uninstall

```bash
npx agentic-orchestra uninstall omp --dry-run    # see what would be deleted first
npx agentic-orchestra uninstall omp              # delete

./uninstall.sh --omp --dry-run                   # same job, through the clone
```

Files you edited after installing are **not deleted**, they are reported. They
are deleted with `--force`.

If you installed with `npx skills add`, that CLI has its own path: `skills
remove`, or remove the symlink from the install directory.

## Model configuration

The `model:` lines in the agents are not enough on their own.
`task.agentModelOverrides` in `~/.omp/agent/config.yml` also applies
role-based pins and **the two can conflict**. The difference measured during
installation:

| Role | `config.yml` | agent frontmatter |
|---|---|---|
| `luna-*` | `openai-codex/gpt-5.6-luna:max` | `openai-codex/gpt-6-luna:max` |
| `space-bunny-*` | not defined | `stealth/space-bunny-alpha` |

Do not guess which one wins. `docs/architecture.md` has the full account of
this, `docs/troubleshooting.md` has the diagnostic commands.

On the OpenCode and Claude Code side the model is determined in the runtime
config, not in the agent file; this is why the converters do not write a pin.

## Known limit: 7 skill gaps

The agents reference 15 skills; 9 of them are here. The remaining 7 are
**declared** in `docs/unresolved-skills.txt` — `verify.sh` compares that list
against the real reference set and goes red on any two-sided deviation. Most
of the gaps depend on a third-party repo or an external MCP server; the single
real missing one is `eresus-guard`.

## Compatibility note

**The skill standard.** The skills use the `skills/<name>/SKILL.md` convention,
which is why they are discovered directly by `npx skills add` in this repo
(verified: local path and GitHub path). No extra configuration needed.

**The agent files.** OMP ↔ OpenCode ↔ Claude Code conversion is **a format
difference, not an opposition**: all three do the same job, only the frontmatter
schema differs. That is why the converters exist; use them instead of copying
by hand.

**Two implementations, one contract.** The bash scripts and the Node CLI are
two implementations doing the same work: bash is dependency-free for those who
clone, Node is cross-platform for `npx`. This duplication would be a problem
if it were not for `verify.sh` check 12, which compares the two **byte-for-byte,
agent by agent, runtime by runtime**.

## License

Boost Software License 1.0 — see [LICENSE](LICENSE).
