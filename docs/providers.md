# Supported tools

One toolkit, every AI coding tool. Install once, select any number of targets.
Detection only marks — it never installs anything.

## Install

```bash
python3 installer/wizard.py              # interactive: pick tools, scope, components
python3 installer/wizard.py --yes --target claude-code --target codex --scope global
python3 installer/wizard.py --dry-run    # preview, write nothing
npx agentic-orchestra --wizard           # same wizard through the Node CLI
```

```bash
python3 -m unittest tests.test_installer -v   # adapter + merge + SAST tests (isolated HOME)
```

## Uninstall

```bash
python3 installer/uninstall.py --target gemini --scope global   # every scope: project|global|both
npx agentic-orchestra uninstall amp --scope both --dry-run
```

Agent and skill files are removed only when they still match what the
installer wrote (or with `--force`); edited files are reported and kept.
The rules-file marker block is removed while everything outside the markers
is preserved — if only our block remains, the file goes with it.

## Provider matrix

Support levels are stated honestly. Compatibility layers are labeled as such —
never advertised as native support.

Live-verified on macOS: `~/.gemini/skills/<name>/SKILL.md`,
`~/.copilot/skills/<name>/SKILL.md` (+`references/`, +`scripts/`),
`~/.qwen/skills/`, `~/.aider-desk/skills/`, `~/.continue/skills/`,
`~/.codex/skills/<name>/SKILL.md` all exist with the Agent Skills layout;
Gemini `settings.json` carries `hooks` + `mcpServers`; Copilot reads
`mcp-config.json` and `AGENTS.md` custom instructions with `--agent` custom
agents. Project-side paths follow each tool's documented convention and are
not live-verified. Cursor and Amp have no install on this machine — their
rows stay research-based compatibility claims.

| Tool | Detected via | Agents | Skills | SAST | Scope | Level |
|---|---|---|---|---|---|---|
| OMP | `omp` binary / `~/.omp/agent` | native (`model`+`tools`+`spawns`) | copy | yes | project / global | native |
| OpenCode | `opencode` / `~/.config/opencode` | native (`mode: subagent` + explicit tool map) | copy | yes | project / global | native |
| Claude Code | `claude` / `~/.claude` | native (Title-case tools, `effort`, `inherit`) | copy | yes | project / global | native |
| Codex CLI | `codex` / `~/.codex` | refused by name (no verified format) | copy to `.agents/skills` | yes (skill) | project / global | skills-only |
| Cursor | `cursor` / `~/.cursor` | `.mdc` rule wrapper | `.mdc` rule wrapper | via wrapper | project / global | compatibility |
| Gemini CLI | `gemini` / `~/.gemini` | instruction wrapper | copy | via skill | project / global | compatibility |
| Copilot CLI | `copilot` / `~/.copilot` | instruction wrapper | copy | via skill | project / global | compatibility |
| Qwen Code | `qwen` / `~/.qwen` | instruction wrapper | copy | via skill | project / global | compatibility |
| Aider | `aider` | conventions wrapper | copy | via skill | project / global | compatibility |
| Amp | `amp` / `~/.config/agents` | AGENTS.md wrapper | copy | via skill | project / global | compatibility |
| Continue | `cn` / `~/.continue` | instruction wrapper | copy | via skill | project / global | compatibility |
| Generic Agent Skills | — (never auto-detected) | AGENTS.md section | `.agents/skills` copy | via skill | project / global | fallback |

## Capability differences that are genuinely unavoidable

- **Model pins are dropped, never translated.** OMP pins provider-qualified IDs
  (`openai-codex/gpt-6-luna:max`) that no other target can express. Every
  adapter reports the drop on stderr.
- **`spawns` is OMP-only.** No other target has a nested-spawn capability
  grant, so tier-2 delegation is reported as lost wherever it cannot be
  honored. The spawn graph stays safe by construction.
- **Codex takes skills, not agents.** The adapter refuses agent installs by
  name instead of guessing a schema the runtime would silently ignore.
- **Cursor reads rules, not agents.** Both agents and skills become `.mdc`
  rule bodies with the frontmatter stripped.
- **Wrappers lose per-agent tool grants and lazy loading.** An instruction
  block cannot express `read-only vs write` the way a native agent format
  can. The wrapper header always says so.

## Generic adapter and custom tools

A CLI that is not in the registry needs no source change:

```bash
python3 installer/wizard.py --add-provider
```

It asks for name, binary, project/global config directories, Agent Skills
support, AGENTS.md support, and an optional custom output path, then persists
the entry to `~/.config/agentic-orchestra/adapters.json`. The wizard lists it
on the next run.

## Adding a new adapter (maintainers)

1. Add one entry to `registry/providers.json` (paths, capabilities, support
   level, honest reason for wrappers).
2. If its agent format is new, add one render function in
   `installer/adapters.py` plus one `adapters/<id>.mjs` module that calls the
   same mapping. Most instruction-style CLIs need no code — the generic
   rules-wrapper covers them.
3. Add fixtures to `tests/test_installer.py` (install, merge, idempotency,
   fallback label).
4. Document the row in the matrix above with its real level.

No provider-name conditionals outside the adapter. Callers use capabilities.

## SAST integration

`core/skills/security-review/` is a first-party skill (forked from upstream
MIT, see `ATTRIBUTION.md`) carrying the full SAST procedure: 34 references,
source→sink taint tracking in two passes (sink-first sweep, then source-first
trace), business-logic and auth analysis, mandatory Judge re-verification,
and file:line remediation reporting. References load on demand per
vulnerability class — never preloaded into every prompt.

`core/agents/security-reviewer.md` is the provider-neutral wrapper. It runs
`skill://security-review` as its procedure and renders as a native subagent
where subagents exist, as a skill wrapper where only skills exist, and as a
rule/instruction block elsewhere. Only `CONFIRMED` and `LIKELY` findings are
reported; anything else is `NEEDS CONTEXT` or dropped as a false positive
with cited evidence.
