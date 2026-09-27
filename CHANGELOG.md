# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are not semver: this repository ships agent and skill *definitions*,
whose compatibility is "does the runtime still load it", not "does an API stay
backward compatible".

## [Unreleased]

- `npx skills add dontworryplz/agentic-orchestra-` desteği. Depo zaten
  konvansiyona uyuyordu; doğrulandı (yerel yol ve GitHub yolu). Ek
  yapılandırma gerekmiyor.
- `npx agentic-orchestra` — platformlar arası kurulum/kaldırma/doğrulama
  girişi: `install`, `uninstall`, `verify`, `list`, `show`, `doctor`.
- İki kurulum yolunun birlikte kullanılması durumundaki sembolik bağ /
  kopya çakışması README ve troubleshooting'de uyarı olarak belgelendi.

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
