# Troubleshooting

Every item here was derived from a situation observed while installing this
repo, not predicted.

## "agentic-orchestra" returns 404

The **trailing dash in the repo name is real**: `dontworryplz/agentic-orchestra-`.
The name without the dash (`agentic-orchestra`) does not resolve on GitHub.

```bash
git clone https://github.com/dontworryplz/agentic-orchestra-.git
```

## `omp agents unpack` overwrites the agent files you edited

`omp agents unpack --user --force` overwrites the files
`~/.omp/agent/agents/*.md`. An agent definition you edited by hand is lost by
this command.

That is why the agents are versioned in this repo. After install,
`~/.omp/agent/agents` is a **distribution target**, not the source.

## The agent runs but not with the model you expected

Model pins are defined in two places and they can contradict each other:

- `~/.omp/agent/config.yml` → `task.agentModelOverrides`
- `agents/*.md` → frontmatter `model:`

The difference measured at install time: the `luna-*` roles were
`openai-codex/gpt-5.6-luna:max` in the config, `openai-codex/gpt-6-luna:max` in
the agent files. **Do not guess** which one is applied:

```bash
grep -A20 'agentModelOverrides' ~/.omp/agent/config.yml
grep -h '^model:' ~/.omp/agent/agents/luna-*.md
omp models | grep -E 'gpt-[56](\.6)?-luna'
```

If the two differ, report both and verify with a real `task` result which one
actually runs. The `space-bunny-*` roles are not defined in the config at all;
only frontmatter pins exist for them.

## The `graft` skill does not work

The `graft` skill is **conditional**: without a `graft/` directory at the repo
root or the graft MCP server, there is no tool to apply. Moving the skill does
not move the tool.

Situation observed during install: the `graft` binary was not on PATH and the
`graft/` index existed in only one repo (`~/eresus-guard`). So on most repos on
this machine the counterpart of this skill is `codebase-memory-mcp`.

Check:

```bash
ls -d graft 2>/dev/null || echo 'bu repo graft-indexed değil'
command -v graft || echo 'graft CLI yok'
```

If both are missing you should not expect the agent to follow its `graft`
routing; the skill preflight says to fall back to grep/`read` in that case.

## Skill installed but the agent says "skill not found"

Two separate skill directories are scanned and both are valid:

- `~/.omp/skills/<name>/SKILL.md` — user global skills (this is the install
  target)
- `~/.omp/agent/managed-skills/<name>/SKILL.md` — the managed skills under
  `PI_CODING_AGENT_DIR`

The install script uses the `~/.omp/skills/` target because `omp agents unpack`
only touches the `agents/` directory; it does not touch the skills directory.

Verification:

```bash
ls ~/.omp/skills
omp --skills='graft,sol-luna-orchestrator' -p 'list your available skills'
```

To turn off all skill discovery use `--no-skills`; to load only a subset use
`--skills='git-*,docker'`.

## I copied these files to OpenCode, the agents do not show up

**Agent file formats are incompatible across runtimes.** Copying does not
work.

OMP agent frontmatter:

```yaml
tools: read, grep, glob, lsp, bash, edit, write   # virgüllü liste
read-summarize: false
```

OpenCode agent frontmatter:

```yaml
mode: primary
temperature: 0.2
steps: 50
permission:
  "*": deny
  read: allow
```

Same `.md` extension, two different schemas. If you are transferring to the
OpenCode side you have to convert the `tools` list into the `permission` map
and drop the `read-summarize` field.

## `install.sh` does not write anything

By design. It does not overwrite existing files; if a file differs it only
warns. To overwrite:

```bash
./install.sh --force
```

To see what it would do first:

```bash
./install.sh --dry-run
```

## Agents cannot find `skill://` targets

14 skills are not in this repo (see `docs/skills-reference.md`). When the agent
body cannot load a skill, there is a risk it invents the procedure. Options:
copy the skill under `~/.omp/skills/`, create a symlink, or remove the
reference from the agent body.

## Is the install target a different directory?

The `PI_CODING_AGENT_DIR` environment variable changes the base (default
`~/.omp/agent`). `install.sh` reads this variable:

```bash
PI_CODING_AGENT_DIR=/tmp/omp-test ./install.sh --dry-run
```

## `npx skills add` cannot find this repo

It should. The convention is `skills/<name>/SKILL.md` and this repo follows
it. If it does not work, check these:

```bash
ls skills/*/SKILL.md            # her skill dizininde SKILL.md olmalı
npx skills add dontworryplz/agentic-orchestra- --list
```

Output verified for this repo: `Found 9 skills` from the local path, the same
from the GitHub path (after push). If it finds 0 skills, then the `skills/`
directory has moved, or one skill directory has no `SKILL.md` — `verify.sh`
check 13 asserts both.

## `npx skills add` does not install to OMP

It does not install, because it cannot: in the `skills` v1.7.0 agent table
there is no `omp` (`opencode` and `pi` exist). The package does not define
`PI_CODING_AGENT_DIR` either. For OMP use `npx agentic-orchestra install omp`
or `./install.sh`.

## The same skill is installed in two places, which one is valid?

`npx skills add` sets up a **symlink** by default; `agentic-orchestra`
**copies**. If both run at once it becomes unclear which one is read.

```bash
ls -la ~/.omp/skills/graft        # bağ mı, kopya mı?
npx skills add <repo> -g -y --copy   # kopyaya zorla
```

Pick one way. If you prefer the symlink, do not also install the agents with
`npx agentic-orchestra install <runtime> --skills-only`.

## `npx` runs but says "import: command not found"

The `bin/*.mjs` file has no shebang. In that case npm produces a symlink, the
shell reads it as bash and errors line by line. The exec bit is also required.

```bash
head -1 bin/agentic-orchestra.mjs    # #!/usr/bin/env node olmalı
ls -l bin/agentic-orchestra.mjs     # -rwxr-xr-x olmalı
```

`verify.sh` check 14 asserts these; we hit this error once.

## The bash and Node converters produce different agents

They should not. `verify.sh` check 12 compares the two byte-for-byte. If it is
red, one of the mappings stayed different on the two sides.

```bash
./verify.sh 2>&1 | grep -A6 'converters disagree'
diff <(./install-opencode.sh --show luna-explorer 2>/dev/null) \
     <(node bin/agentic-orchestra.mjs show luna-explorer --runtime opencode 2>/dev/null)
```

This check earned its keep: on the first run the Node side printed `tools: `
(trailing space) while bash printed `tools:`. In YAML that difference is fatal —
a later `webfetch: false` would override an earlier `webfetch: true`.

## Agents do not show up in OpenCode but the files were copied

OpenCode's agent schema is not the same as OMP's. The frontmatter the
converter produces contains this:

```yaml
mode: subagent
tools:
  read: true
  write: false
```

`tools` must be a key-value map, not a comma-separated list. If you copied by
hand that is why it did not load. Use the converter:

```bash
./install-opencode.sh --show luna-worker
```
