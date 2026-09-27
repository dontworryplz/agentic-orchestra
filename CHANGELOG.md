# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are not semver: this repository ships agent and skill *definitions*,
whose compatibility is "does the runtime still load it", not "does an API stay
backward compatible".

## [Unreleased]

### Added

- **Nested delegation.** Two new tier-1 agents carry a `spawns` whitelist, so an
  agent can now delegate to agents that report upward:
  - `luna-coordinator` — read-only. Splits one question too wide for a single
    explorer's context into at most three non-overlapping sub-questions and
    synthesizes the answers. It keeps the synthesis; relaying a child's
    conclusion instead of its evidence would add a hop and lose the thread.
  - `luna-integrator` — the seam owner the routing table had been referring to
    but nothing defined. Fixes the interface and the file partition *before*
    fanning out, integrates in dependency order, runs the check that exercises
    the seam, then hands the combined diff to a reviewer that did not write it.
- `luna-tester` gains a read-only `spawns` whitelist. It is the only tier-1
  agent that writes, and both children are read-only, so a fan-out cannot create
  a write conflict.
- `tools/check-spawn-graph.mjs`, wired into `verify.sh` as check 16. OMP's
  `spawns` failure mode is never a crash: a malformed graph is either an agent
  that silently cannot delegate, or a cycle that recurses until the budget is
  gone. The check fails on an unknown target, a self-reference, a cycle, a third
  level, or a conversion that drops `spawns` without reporting it.

### Changed

- The routing table's "integration owner" is now a real role. Before this,
  `sol-luna-orchestrator` told Sol to serialize shared mutation through an
  integration owner that did not exist as an agent.
- `sol-luna-orchestrator` gained the nesting policy: the tier table, why the
  leaves stay leaves (a worker that spawns destroys the file partition; a
  reviewer that spawns is no longer an independent gate), the cost ceiling, and
  the four conditions under which a leaf may be promoted.
- Conversion drops `spawns` for OpenCode and Claude Code and reports it on
  stderr. Neither runtime can honour a nested-spawn grant, and silently emitting
  or silently dropping it would both mislead.

### Fixed

- The install smoke test hardcoded 10 agents and 9 skills, so adding two agents
  produced seven unrelated-looking failures. The expected counts now come from
  the repository.
- Check 10 lost a real assertion to a `grep -q` plus `pipefail` interaction:
  `grep -q` closes the pipe on first match, SIGPIPEs the writer, and a successful
  match reads as a failed check. It only surfaced once the warning output grew
  past the pipe buffer, which is why it looked like a flaky regression rather
  than a broken test.
- `MAX_DEPTH` in the spawn-graph check was one too permissive (2 instead of 1),
  which let a leaf grow a chain and pass. A mutation test caught it.

### Added

- `npx skills add dontworryplz/agentic-orchestra-` works. The repository already
  followed the convention; verified against both the local path and the GitHub
  URL. No extra configuration.
- `npx agentic-orchestra` — a cross-platform install/uninstall/verify entry
  point: `install`, `uninstall`, `verify`, `list`, `show`, `doctor`.
- The symlink-versus-copy conflict from using both install paths for one skill is
  documented as a warning in the README and troubleshooting.

### Changed

- **The procedure graph now exists.** The nine skills were independent
  documents with 4 `skill://` edges between them; there are now 44. An agent
  handed one skill had no way to know the other eight existed, so it reinvented
  their procedures. Every skill now ends with a Hand off section naming the
  sibling procedures and the trigger for each.
- `verify.sh` check 15 enforces both halves: every skill has a Hand off section,
  and no skill is an orphan. It found a real orphan the moment it was written.
  `sol-luna-orchestrator` was referenced by nothing, even though `executor`'s
  `DECISION_REQUEST` flow exists to ask it for a scope decision. That link is now
  explicit, and `executor`'s stop conditions route to it.
- `empirical-validation`: a **degraded mode** section. When the tier that would
  prove a claim is unreachable, the claim does not survive it. The mode names
  the tier reached, the tier needed, the specific missing access, the command
  that would produce the evidence, and which claims are downgraded. The failure
  it prevents is an agent quietly dropping the word "verified" and shipping the
  rest with the same confidence.
- `debug-issue`: a **symptom-to-first-probe triage table**. The most common waste
  is choosing a probe by habit; two disqualifiers are named — do not clear
  caches first, and do not start by reading more code.
- `review-changes`: one P1 finding worked end to end, so the output contract is
  concrete rather than a list of fields. It shows what qualifies as a finding and
  what falls into residual uncertainty instead.
- `graft`: the claim "There are six of them" was ambiguous — six sections
  covering seven commands, since `build` and `check` are separate. The count is
  now explicit.
- The Turkish-prose check now covers the docs and root markdown as well as the
  runtime files. The whole repository is English; this stops that from quietly
  splitting again.

### Fixed

- `sol-luna-orchestrator` referred to `eresus-autonomous`, `graft`, and
  `empirical-validation` as bare names, which an agent cannot resolve. Replaced
  with a concrete pre-delegation gate built on resolvable `skill://` URIs, and
  the section now states plainly that this package ships no security-review
  procedure — a missing procedure is a place to stop, not a place to improvise
  one.

## [0.2.0] — 2026-09-27

Second pass: cross-runtime installers, seven new skills, and a verification
harness that asserts the repo's own invariants.

### Added

**Skills (7 new, 9 total)**

- `debug-issue` — reproduce, characterize, localize, explain, fix cause, prove
  the same scenario, guard the bug class. Each step has an exit condition; the
  skill exists to stop fixes being written before reproduction.
- `empirical-validation` — the proof ladder, the falsification test ("if I
  reverted the fix, would this test go red?"), command hygiene, and a table of
  eleven things routinely reported as evidence that are not.
- `review-changes` — establishing the exact diff base (staged index vs worktree
  vs merge base), the six-level review priority order, P0–P3 severity, and a
  mandatory self-refutation pass before reporting.
- `context-fetch` — cheapest-sufficient-surface-first ordering, a "read nothing
  yet" gate before the first read, and disambiguation before reading.
- `executor` — the ownership contract, precedence rules, and the stop-and-report
  conditions for bounded task execution.
- `verifier` — spec clause to falsifying observation, three verdicts with no
  partial credit, and nine high-value surfaces specs habitually omit.
- `refactor-safely` — blast radius before edit, risk classification, the
  widen/migrate/narrow sequence, and "no references found" needing two search
  methods before deletion.

**Installers (3 new)**

- `install-opencode.sh` — converts OMP agent frontmatter to the OpenCode
  schema (`mode`, `tools` as a boolean map, optional `temperature`/`steps`).
- `install-claude.sh` — converts to the Claude Code schema (`name`, Title-case
  `tools` list, `effort`, `model`).
- `uninstall.sh` — removes installed files, and refuses to remove any file whose
  content has changed since install unless `--force`.

All three support `--dry-run`, `--force`, `--user`/`--project`, and
`--agents-only`/`--skills-only`. The two converters add `--show <agent>` to
print a conversion without writing.

**Verification**

- `verify.sh` — 11 checks: frontmatter, name/path agreement, `skill://`
  resolution against a declared-gap manifest, the English-runtime/Turkish-docs
  split, the read-only invariant, placeholder markers, shell syntax, duplicate
  YAML keys in converted output, all-agents-convert-to-all-runtimes, no invented
  model pins, and an isolated-HOME installer smoke test that asserts
  idempotency and refusal to clobber.
- `.github/workflows/ci.yml` — runs `verify.sh` on push and pull request.
- `docs/unresolved-skills.txt` — machine-readable declared-gap manifest that
  `verify.sh` check 3 diffs against.

### Changed

- `graft` skill: description is now conditional on the repo actually being
  indexed, and a preflight checks for a `graft/` index or the graft MCP server
  before any query, with an explicit fallback order.
- `sol-luna-orchestrator` skill: added a preflight that reads both live model
  sources (`config.yml` `task.agentModelOverrides` and agent frontmatter)
  instead of asserting hardcoded IDs; added the Space Bunny roles to the
  routing table, which were previously unreachable from the skill's own
  procedure.
- `space-bunny-{worker,reviewer}`: descriptions said "Luna". They run on
  `stealth/space-bunny-alpha` (1M context), not Luna (272K), so the description
  routed work to the wrong role. Each body now states when to prefer it.

### Fixed

- `install-opencode.sh` emitted a duplicated `webfetch` key for agents holding
  both `web_search` and `webfetch`, because both map to the same OpenCode tool.
  YAML keeps the last value, so the granted capability was silently dropped.
- The tool-mapping loop dropped the final entry of the OMP `tools:` list, since
  the list was piped without a trailing newline and `read` stopped at EOF.

## [0.1.0] — 2026-09-27

Initial import.

- 10 OMP task agents: `luna-{explorer,researcher,worker,tester,reviewer}`,
  `space-bunny-{worker,reviewer}`,
  `antigravity-{gemini-explorer,sonnet-worker,opus-reviewer}`.
- 2 skills: `graft`, `sol-luna-orchestrator`.
- `install.sh` for the OMP runtime, idempotent and non-clobbering.
- `README.md` install guide, `docs/architecture.md`,
  `docs/skills-reference.md`, `docs/troubleshooting.md`, `AGENTS.md`.

[Unreleased]: https://github.com/dontworryplz/agentic-orchestra-/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dontworryplz/agentic-orchestra-/compare/0a3f428...v0.2.0
[0.1.0]: https://github.com/dontworryplz/agentic-orchestra-/releases/tag/v0.1.0
