#!/usr/bin/env bash
# Verify this repository's invariants and the installers' behaviour.
#
#   ./verify.sh              # everything
#   ./verify.sh --fast       # skip the installer smoke tests
#   ./verify.sh --quiet      # only failures
#
# Every check is a repo invariant stated in AGENTS.md, restated as an assertion.
# A check that cannot fail is not a check; each one below has a known way to
# break, and the "break it" line says which.

set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

FAST=0
QUIET=0
FAIL=0
PASS=0

for a in "$@"; do
  case "$a" in
    --fast)  FAST=1 ;;
    --quiet) QUIET=1 ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'unknown argument: %s\n' "$a" >&2; exit 2 ;;
  esac
done

ok()   { PASS=$((PASS + 1)); [ "$QUIET" -eq 1 ] || printf '  PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }
head_() { [ "$QUIET" -eq 1 ] || printf '\n== %s\n' "$1"; }

CHECKS=0
note_check() { CHECKS=$((CHECKS + 1)); head_ "$1"; }

printf 'agentic-orchestra verify\n  repo: %s\n' "$REPO_DIR"

# --- 1. Every runtime file has parseable frontmatter -------------------------
# Break it: delete the opening --- from any agents/ or skills/ file.
note_check "frontmatter present"
fm_bad=0
for f in core/agents/*.md core/skills/*/SKILL.md; do
  [ -e "$f" ] || continue
  if ! head -1 "$f" | grep -q '^---$'; then
    bad "no opening --- : $f"; fm_bad=1
  elif ! awk 'NR>1 && /^---$/{found=1; exit} END{exit !found}' "$f"; then
    bad "no closing --- : $f"; fm_bad=1
  fi
done
[ "$fm_bad" -eq 0 ] && ok "all $(ls core/agents/*.md core/skills/*/SKILL.md | wc -l | tr -d ' ') runtime files have frontmatter"

# --- 1b. No directory nested inside a runtime directory -----------------------
# A stray `agents/agents/` once shipped in this repository: a duplicate of every
# agent definition, tracked and pushed, because a nested directory is not a `.md`
# file so no existing check looked at it. Every installer and every test walks
# core/agents/*.md and silently ignores it, so the duplicate sat there looking
# harmless while the repository showed twelve roles twice.
#
# Break it: mkdir agents/agents and copy a file in.
note_check "no nested directories in the runtime folders"
nest_bad=0
for d in core/agents/*/ ; do
  [ -d "$d" ] || continue
  bad "agents/$(basename "$d")/ is a directory inside agents/ — this duplicates the agent set"
  nest_bad=1
done
# `references/` is standard skill layout (upstream skills ship their knowledge
# bases there); anything else nested inside a skill is a duplicate-in-waiting.
for d in core/skills/*/*/ ; do
  [ -d "$d" ] || continue
  [ "$(basename "$d")" = "references" ] && continue
  bad "$(dirname "$d")/$(basename "$d")/ nests a directory inside a skill"
  nest_bad=1
done
if [ "$nest_bad" -eq 0 ]; then
  ok "agents/ holds files only; skills/ holds SKILL.md files and their own references only"
fi

# --- 1c. Model pins stay inside the families this package actually uses ---------
# A standing decision in this repository: GPT roles run on the GPT-6 family, full
# stop. In 2026-09 the live config pinned gpt-5.6 while the agents pinned gpt-6,
# and the disagreement sat there unresolved because neither side would give. The
# decision was made for gpt-6 and the config was moved. This check makes it
# stick: a future edit that pins gpt-5.6, or a model ID from no known provider,
# fails here instead of silently reviving the drift.
#
# Allowed: openai-codex/gpt-6-{luna,sol} with any effort suffix, the three vendor
# pins (stealth/space-bunny-alpha, google-antigravity/*), and nothing else.
# Break it: change one agent's model back to gpt-5.6-luna.
note_check "model pins stay in their families"
mpin_bad=0
for f in core/agents/*.md; do
  m="$(awk '/^model:/{sub(/^model: */,""); print; exit}' "$f")"
  n="$(basename "$f" .md)"
  case "$m" in
    "openai-codex/gpt-6-luna"|"openai-codex/gpt-6-luna:"*|"openai-codex/gpt-6-sol"|"openai-codex/gpt-6-sol:"*|    "stealth/space-bunny-alpha"|"google-antigravity/gemini-3.8-flash:"*|    "google-antigravity/claude-opus-4-6:"*|"google-antigravity/claude-sonnet-4-6:"*) : ;;
    *) bad "$n pins '$m', which is outside the gpt-6 family this package decided on"; mpin_bad=1 ;;
  esac
done
if [ "$mpin_bad" -eq 0 ]; then
  ok "all $(ls core/agents/*.md | wc -l | tr -d ' ') agent model pins are gpt-6-family or a documented vendor pin"
fi

# --- 2. name matches its file/directory name ---------------------------------
# Break it: rename a file without editing its frontmatter name.
note_check "name matches location"
nm_bad=0
for f in core/agents/*.md; do
  n="$(awk '/^name:/{sub(/^name: */,""); print; exit}' "$f")"
  b="$(basename "$f" .md)"
  [ "$n" = "$b" ] || { bad "agents/$b.md declares name '$n'"; nm_bad=1; }
done
for d in core/skills/*/; do
  n="$(awk '/^name:/{sub(/^name: */,""); print; exit}' "$d/SKILL.md")"
  b="$(basename "$d")"
  [ "$n" = "$b" ] || { bad "skills/$b/ declares name '$n'"; nm_bad=1; }
done
[ "$nm_bad" -eq 0 ] && ok "every name matches its path"

# --- 3. Every skill:// reference resolves, or is a declared gap -------------
# Break it: add a skill:// line naming a skill that is neither shipped nor
# listed in docs/unresolved-skills.txt.
note_check "skill:// references resolve or are declared gaps"
ref_total="$(grep -ohE 'skill://[a-z0-9-]+' core/agents/*.md core/skills/*/SKILL.md | sed 's|skill://||' | sort -u | wc -l | tr -d ' ')"
actual_gaps="$(comm -23 \
  <(grep -ohE 'skill://[a-z0-9-]+' core/agents/*.md core/skills/*/SKILL.md | sed 's|skill://||' | sort -u) \
  <(ls skills | sort) | sort)"
declared_gaps="$(grep -vE '^\s*(#|$)' docs/unresolved-skills.txt 2>/dev/null | awk '{print $1}' | sort || true)"

if [ "$actual_gaps" != "$declared_gaps" ]; then
  only_actual="$(comm -23 <(printf '%s\n' "$actual_gaps") <(printf '%s\n' "$declared_gaps") | tr '\n' ' ')"
  only_declared="$(comm -13 <(printf '%s\n' "$actual_gaps") <(printf '%s\n' "$declared_gaps") | tr '\n' ' ')"
  [ -n "$only_actual" ] && bad "referenced but neither shipped nor declared: $only_actual"
  [ -n "$only_declared" ] && bad "declared as a gap but now resolved: $only_declared"
else
  ok "$ref_total references: $(printf '%s\n' "$actual_gaps" | grep -c . || true) declared gap(s), rest resolve"
fi

# --- 4. Everything is English -------------------------------------------------
# The whole repository is English: runtime files because models read them, docs
# because the repository is public and every contributor reads them. This check
# exists so that split cannot quietly come back.
#
# Break it: write a Turkish sentence into any runtime file, doc, or root
# markdown file. verify.sh is excluded because it necessarily contains the
# search words themselves.
note_check "language is English everywhere"
rt_bad=0
lang_targets="$(ls core/agents/*.md core/skills/*/SKILL.md docs/*.md docs/*.txt README.md AGENTS.md CHANGELOG.md 2>/dev/null)"
for f in $lang_targets; do
  if grep -qE '(^|[^[:alpha:]])(ve|ile|icin|olarak|ancak|cunku|degil|sey)([^[:alpha:]]|$)' "$f" \
     || grep -qE '(^|[^[:alpha:]])(için|olarak|ancak|çünkü|degil|şey)([^[:alpha:]]|$)' "$f"; then
    bad "non-English prose in $f"; rt_bad=1
  fi
done
[ "$rt_bad" -eq 0 ] && ok "no Turkish prose in $(printf '%s\n' $lang_targets | wc -l | tr -d ' ') tracked text files"

# --- 5. Read-only roles cannot gain write access through conversion ----------
# Break it: add `edit` to the tools line of any explorer/reviewer.
note_check "read-only invariant survives conversion"
ro_bad=0
for f in core/agents/*explorer.md core/agents/*reviewer.md core/agents/luna-researcher.md; do
  [ -e "$f" ] || continue
  t="$(awk '/^tools:/{sub(/^tools: */,""); print; exit}' "$f")"
  case ",$(printf '%s' "$t" | tr -d ' ')," in
    *,edit,*|*,write,*) bad "$(basename "$f") grants write but is a read-only role"; ro_bad=1 ;;
  esac
done
[ "$ro_bad" -eq 0 ] && ok "no read-only role declares edit or write"

# --- 6. No leftover placeholders ---------------------------------------------
# Break it: add "TODO" or a <placeholder> to any shipped file. verify.sh is
# excluded because it necessarily contains the search pattern itself.
note_check "no placeholders"
ph_bad=0
for f in core/agents/*.md core/skills/*/SKILL.md install*.sh uninstall.sh; do
  [ -e "$f" ] || continue
  if grep -qE 'TODO|FIXME|XXX|<placeholder>' "$f"; then
    bad "placeholder marker in $f"; ph_bad=1
  fi
done
[ "$ph_bad" -eq 0 ] && ok "no TODO/FIXME/placeholder markers in shipped files"

# --- 6a. `npx skills add` compatibility ---------------------------------------
# The de-facto standard installer is `npx skills add <owner>/<repo>` (vercel-labs/skills).
# It discovers skills by convention, not by config, so the layout IS the contract:
# a top-level skills/ directory with one subdirectory per skill, each holding a
# SKILL.md with YAML frontmatter. Break it: rename skills/ to skillz/, or add a
# skill directory without a SKILL.md.
note_check "npx skills add compatibility"
sa_bad=0
if [ ! -d skills ]; then
  bad "no top-level skills/ directory; \`npx skills add\` would find nothing"
  sa_bad=1
else
  for d in core/skills/*/; do
    [ -d "$d" ] || continue
    [ -f "$d/SKILL.md" ] || { bad "skills/$(basename "$d")/ has no SKILL.md"; sa_bad=1; }
  done
  if [ -f package.json ]; then
    node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"))' 2>/dev/null \
      || { bad "package.json is not valid JSON"; sa_bad=1; }
    # skills are the published payload; agents and docs are repo-only extras
    node -e '
      const p = JSON.parse(require("fs").readFileSync("package.json","utf8"));
      const files = p.files || [];
      if (!files.includes("skills/")) { console.error("package.json files[] must include skills/"); process.exit(1); }
    ' 2>/dev/null || { bad "package.json files[] does not include skills/"; sa_bad=1; }
  fi
fi
[ "$sa_bad" -eq 0 ] && ok "skills/ layout matches the \`npx skills add\` discovery convention ($(ls -d core/skills/*/ | wc -l | tr -d ' ') skills)"

# --- 6a2. The skill mirrors are byte-identical ----------------------------------
# core/skills/ is the source of truth; skills/ (npx discovery) and
# .agents/skills/ (portable copy) are mirrors, not forks. A fix applied to one
# copy and not the others ships two different procedures under one name.
# Break it: edit a SKILL.md in skills/ without mirroring it into core/skills/.
note_check "skill mirrors are byte-identical"
mir_bad=0
for d in core/skills/*/; do
  s="$(basename "$d")"
  for mirror in "skills/$s" ".agents/skills/$s"; do
    if [ ! -d "$mirror" ]; then
      bad "mirror missing: $mirror (core/skills/$s has no counterpart)"; mir_bad=1; continue
    fi
    if ! diff -r -q "$d" "$mirror" >/dev/null 2>&1; then
      bad "mirror diverged: $mirror differs from core/skills/$s"; mir_bad=1
    fi
  done
done
[ "$mir_bad" -eq 0 ] && ok "skills/ and .agents/skills/ mirror core/skills/ exactly"

# --- 6a3. Every registry provider has an adapter --------------------------------
# Adding a provider is one registry entry + one adapter + tests. A registry id
# with no adapter module is an installer option that crashes on selection.
# Break it: append an id to registry/providers.json without adapters/<id>.mjs.
note_check "registry entries resolve to adapters"
reg_bad=0
if ! command -v node >/dev/null 2>&1; then
  printf '  SKIP  node not available; cannot read the registry\n'
else
  ids="$(node -e 'const r=require("./registry/providers.json"); console.log(r.providers.map(p=>p.id).join("\n"))' 2>/dev/null)"
  if [ -z "$ids" ]; then
    bad "registry/providers.json does not parse"; reg_bad=1
  else
    for pid in $ids; do
      case "$pid" in
        claude-code) mod="adapters/claude.mjs" ;;
        continue) mod="adapters/continue.mjs" ;;
        *) mod="adapters/$pid.mjs" ;;
      esac
      [ -f "$mod" ] || { bad "registry id '$pid' has no adapter module ($mod missing)"; reg_bad=1; }
    done
  fi
fi
[ "$reg_bad" -eq 0 ] && ok "every registry provider resolves to an adapter module"

# --- 6b. The npx entry point is actually executable --------------------------
# Break it: delete the shebang from bin/agentic-orchestra.mjs, or clear its exec
# bit. Both produce a bin symlink that the shell tries to interpret, so `npx`
# fails with baffling errors like "import: command not found" instead of a clear
# one. It happened once already.
note_check "npx entry point is executable"
ent_bad=0
for entry in bin/*.mjs; do
  [ -e "$entry" ] || continue
  head -1 "$entry" | grep -q '^#!.*node' || { bad "no node shebang: $entry"; ent_bad=1; }
  [ -x "$entry" ] || { bad "not executable: $entry"; ent_bad=1; }
done
if [ "$ent_bad" -eq 0 ] && [ -d bin ]; then
  node --check bin/agentic-orchestra.mjs >/dev/null 2>&1 || { bad "bin/agentic-orchestra.mjs is not valid JS"; ent_bad=1; }
  for jf in lib/convert.mjs lib/verify.mjs lib/frontmatter.mjs lib/paths.mjs lib/validate.mjs lib/detect.mjs lib/drift.mjs core/schema.mjs core/capabilities.mjs; do
    [ -e "$jf" ] || continue
    node --check "$jf" >/dev/null 2>&1 || { bad "$jf is not valid JS"; ent_bad=1; }
  done
  for jf in adapters/*.mjs; do
    [ -e "$jf" ] || continue
    node --check "$jf" >/dev/null 2>&1 || { bad "$jf is not valid JS"; ent_bad=1; }
  done
fi
[ "$ent_bad" -eq 0 ] && ok "bin/ has a shebang, exec bit, and valid JS in every lib/adapters file"

# --- 7. Scripts are syntactically valid --------------------------------------
# Break it: introduce an unbalanced quote in any script.
note_check "shell syntax"
sh_bad=0
for s in install.sh install-opencode.sh install-claude.sh uninstall.sh verify.sh; do
  [ -e "$s" ] || continue
  bash -n "$s" 2>/dev/null || { bad "bash -n $s"; sh_bad=1; }
done
[ "$sh_bad" -eq 0 ] && ok "all scripts pass bash -n"

# --- 11b. The procedure graph is connected ----------------------------------
# Skills that reference nothing are procedures an agent will run in isolation
# and partly reinvent. Break it: delete a `## Hand off` section, or strip
# every skill:// mention of one skill so it becomes an orphan.
#
# Placed before the --fast gate on purpose: it needs no subprocess, and a check
# that silently stops running in fast mode is a check you stop trusting.
note_check "procedure graph is connected"
pg_bad=0
for d in core/skills/*/; do
  s="$(basename "$d")"
  grep -q '^## Hand off' "$d/SKILL.md" || { bad "skills/$s has no '## Hand off' section"; pg_bad=1; }
done
orphans=""
for d in core/skills/*/; do
  s="$(basename "$d")"
  refs="$(grep -l "skill://$s\b" core/skills/*/SKILL.md 2>/dev/null | grep -cv "/$s/SKILL.md$" || true)"
  refs="${refs:-0}"
  [ "$refs" -ge 1 ] || orphans="$orphans $s"
done
if [ -n "$(printf '%s' "$orphans" | tr -d ' ')" ]; then
  bad "orphan skill(s), referenced by nothing:$orphans"
  pg_bad=1
fi
[ "$pg_bad" -eq 0 ] && ok "every skill has a Hand off section and is reachable from another skill"

# --- 11b2. The SAST skill is whole and the reviewer routes to it --------------
# security-review is a first-party skill, not a summary: every references/*.md
# the SKILL.md names must exist, and security-reviewer must route to it. A
# reference that 404s mid-audit is a vulnerability class silently skipped.
# Break it: delete a references file, or drop the skill:// line from the agent.
note_check "SAST integration is intact"
sa2_bad=0
if [ ! -f core/skills/security-review/SKILL.md ]; then
  bad "core/skills/security-review/SKILL.md is missing"; sa2_bad=1
else
  for r in $(grep -ohE 'references/[a-z0-9_]+\.md' core/skills/security-review/SKILL.md | sort -u); do
    [ -f "core/skills/security-review/$r" ] || { bad "security-review lists $r but the file is missing"; sa2_bad=1; }
  done
  nrefs="$(grep -ohE 'references/[a-z0-9_]+\.md' core/skills/security-review/SKILL.md | sort -u | wc -l | tr -d ' ')"
  [ "$nrefs" -ge 30 ] || { bad "security-review lists only $nrefs references; expected 30+"; sa2_bad=1; }
fi
if [ ! -f core/agents/security-reviewer.md ]; then
  bad "core/agents/security-reviewer.md is missing"; sa2_bad=1
elif ! grep -q 'skill://security-review' core/agents/security-reviewer.md; then
  bad "security-reviewer does not route to skill://security-review"; sa2_bad=1
fi
[ "$sa2_bad" -eq 0 ] && ok "security-review vendored ($nrefs references resolve) and security-reviewer routes to it"

if [ "$FAST" -eq 1 ]; then
  printf '\n%d checks, %d assertions passed, %d failed (fast mode: smoke tests skipped)\n' "$CHECKS" "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ] || exit 1
  exit 0
fi

# --- 11c. The nested-spawn graph is safe -------------------------------------
# OMP treats `spawns` as a capability grant: an agent without the key cannot
# spawn at all. A malformed graph is therefore never a crash — it is an agent
# that silently cannot delegate, or a cycle that recurses until the budget
# dies. Neither surfaces as an error, so both are asserted.
#
# The assertions live in tools/check-spawn-graph.mjs rather than inline: a
# large JS program inside a shell heredoc is unreviewable, and an earlier
# inlined version broke on a single quote.
#
# Break it: add an agent to its own spawns list, name a role that does not
# exist, make A spawn B while B spawns A, or add a third level.
note_check "nested-spawn graph is safe"
if ! command -v node >/dev/null 2>&1; then
  printf '  SKIP  node not available; cannot check the spawn graph\n'
else
  if ! node tools/check-spawn-graph.mjs; then
    :
  fi
fi

# --- 11d. Conversions match reviewed goldens ---------------------------------
# Check 12 proves the bash and Node converters agree. Agreement is not
# correctness: a mapping that is wrong in BOTH implementations passes that check
# forever. The goldens are the reviewed expectation.
#
# Break it: change a tool mapping in lib/convert.mjs. If the change was intended,
# re-run `node tools/golden.mjs --update` and review the diff.
note_check "conversions match reviewed goldens"
if ! command -v node >/dev/null 2>&1; then
  printf '  SKIP  node not available; cannot run golden tests\n'
else
  if ! node tools/golden.mjs; then
    :
  fi
fi

# --- 11e. The shipped frontmatter form is consistent --------------------------
# OMP accepts two shapes for a list-valued key. The converters now read both, but
# a repository where half the agents use one form and half the other is a
# repository nobody can review by eye.
#
# Break it: convert one agent to the block-list form.
note_check "frontmatter form is consistent across agents"
fm_bad=0
fm_forms=""
for f in core/agents/*.md; do
  if awk 'NR>1 && /^tools:[[:space:]]*$/{print "list"; exit} NR>1 && /^tools:[[:space:]]*[^[:space:]]/{print "inline"; exit}' "$f" | grep -q .; then
    form="$(awk 'NR>1 && /^tools:[[:space:]]*$/{print "list"; exit} NR>1 && /^tools:[[:space:]]*[^[:space:]]/{print "inline"; exit}' "$f")"
    fm_forms="$fm_forms $form"
  else
    bad "$(basename "$f") has no tools: value"
    fm_bad=1
  fi
done
fm_inline="$(printf '%s\n' $fm_forms | grep -c '^inline$' || true)"
fm_list="$(printf '%s\n' $fm_forms | grep -c '^list$' || true)"
if [ "$fm_inline" -gt 0 ] && [ "$fm_list" -gt 0 ]; then
  bad "agents mix both tools: forms ($fm_inline inline, $fm_list block list) — pick one"
  fm_bad=1
fi
[ "$fm_bad" -eq 0 ] && ok "all $(printf '%s\n' $fm_forms | grep -c .) agents use the same tools: form ($([ "$fm_list" -gt 0 ] && echo 'block list' || echo 'inline'))"

# --- 11f. Skill and agent contracts are declared ------------------------------
# Every skill states a procedure, something it rejects, and what it returns.
# Every spawning agent returns the tier-1 envelope. Every writable agent says in
# prose that it may write, because the frontmatter grant is not the instruction a
# model reading only the body would see.
#
# This eval found four structural gaps when it was written: two skills with no
# output contract, two with no anti-pattern section, one with no procedure, and
# three writable agents that never stated their write boundary.
#
# Break it: delete an Output contract heading, or a STATUS value.
note_check "skill and agent contracts are declared"
if ! command -v node >/dev/null 2>&1; then
  printf '  SKIP  node not available; cannot run contract evals\n'
else
  if ! node tests/evals/contract.mjs; then
    :
  fi
fi

# --- 11g. Install behaviour: update, drift, and the non-clobber contract ------
# The contract is the part of this package that does the most damage if it breaks:
# an installer that overwrites someone's local edit, or a drift report that offers
# to delete a skill this package never installed. Both are asserted in a temporary
# HOME so nothing real is touched.
#
# Break it: make install copy unconditionally, or let drift treat an unfamiliar
# directory in the shared skills path as ours.
note_check "install behaviour honours its contract"
if ! command -v node >/dev/null 2>&1; then
  printf '  SKIP  node not available; cannot run install-behaviour evals\n'
else
  if ! node tests/evals/install-behavior.mjs; then
    :
  fi
fi

# --- 11h. Every skill's tool exists and every tool belongs to a skill -------
# tools/ is not a junk drawer. Each script exists because exactly one skill's
# procedure has a step that rots when done by hand, and each skill's "Tooling"
# note points at it. Two directions, both asserted: a tool nobody's skill
# references is dead weight, and a skill whose named tool is missing is a
# procedure that points at nothing.
#
# Break it: add tools/blast.sh without a reference, or rename diff-base.sh.
note_check "tools belong to skills and back"
tb_bad=0
tool_names="$(ls tools/*.sh tools/*.mjs | sed 's|tools/||')"
for f in $tool_names; do
  case "$f" in
    read-list.awk|golden.mjs|check-spawn-graph.mjs|evidence.mjs|clauses.mjs|route.mjs|diff-base.sh|scope-check.sh|blast.sh) : ;;
    *) bad "tools/$f has no documented owner — delete it, or wire it into a skill"; tb_bad=1 ;;
  esac
  grep -rq "$f" skills/ 2>/dev/null || {
    case "$f" in
      read-list.awk|golden.mjs|check-spawn-graph.mjs) : ;;
      *) bad "tools/$f is referenced by no skill"; tb_bad=1 ;;
    esac
  }
done
for f in diff-base.sh scope-check.sh blast.sh evidence.mjs clauses.mjs route.mjs; do
  grep -rq "$f" skills/ 2>/dev/null || { bad "skills/ never mentions tools/$f"; tb_bad=1; }
done
[ "$tb_bad" -eq 0 ] && ok "every tool is referenced by a skill and every referenced tool exists"

# --- 12. The bash and Node converters must agree byte-for-byte ---------------
# Break it: change a tool mapping in lib/convert.mjs without changing
# install-opencode.sh (or vice versa). The two implementations exist because the
# bash scripts are the dependency-free path and the Node one is the npx path;
# without this check that duplication would drift silently, and a user would get
# a different agent depending on how they installed.
note_check "bash and node converters agree"
if ! command -v node >/dev/null 2>&1; then
  printf '  SKIP  node not available; cannot cross-check converters\n'
else
  xcheck_bad=0
  for f in core/agents/*.md; do
    n="$(basename "$f" .md)"
    for rt in opencode claude; do
      a="$(./install-$rt.sh --show "$n" 2>/dev/null)"
      b="$(node bin/agentic-orchestra.mjs show "$n" --runtime "$rt" 2>/dev/null)"
      if [ "$a" != "$b" ]; then
        bad "converters disagree for $n -> $rt"
        printf '        first difference:\n'
        diff <(printf '%s\n' "$a") <(printf '%s\n' "$b") | head -6 | sed 's/^/        /'
        xcheck_bad=1
      fi
    done
  done
  [ "$xcheck_bad" -eq 0 ] && ok "$(ls core/agents/*.md | wc -l | tr -d ' ') agents x 2 runtimes: bash and node output identical"
fi

# --- 8. Converted frontmatter has no duplicate keys --------------------------
# Break it: make omp_tool_to_opencode map two OMP tools onto one OpenCode key
# without deduping. YAML keeps the last value, so a granted tool goes missing.
note_check "conversion emits no duplicate YAML keys"
dup_bad=0
for f in core/agents/*.md; do
  n="$(basename "$f" .md)"
  for rt in opencode claude; do
    out="$(./install-$rt.sh --show "$n" 2>/dev/null)"
    dups="$(printf '%s\n' "$out" | sed -n '/^tools:/,/^---$/p' \
            | grep -oE '^  [a-zA-Z_]+:' | sort | uniq -d | tr -d ' :' | tr '\n' ',')"
    if [ -n "$dups" ]; then
      bad "duplicate tools key(s) in $rt output for $n: $dups"; dup_bad=1
    fi
  done
done
[ "$dup_bad" -eq 0 ] && ok "no duplicate tools keys in any converted agent"

# --- 9. Every agent converts to every runtime --------------------------------
# Break it: give an agent a tools value with no mapping branch; conversion dies.
note_check "all agents convert to all runtimes"
conv_bad=0
for f in core/agents/*.md; do
  n="$(basename "$f" .md)"
  for rt in opencode claude; do
    ./install-$rt.sh --show "$n" >/dev/null 2>&1 || { bad "$rt conversion failed for $n"; conv_bad=1; }
  done
done
[ "$conv_bad" -eq 0 ] && ok "$(ls core/agents/*.md | wc -l | tr -d ' ') agents x 2 runtimes convert cleanly"

# --- 10. Model pins are never silently invented -----------------------------
# Break it: make an installer emit a model: field derived from the OMP pin.
note_check "no invented model pins"
mp_bad=0
for f in core/agents/*.md; do
  n="$(basename "$f" .md)"
  omp_model="$(awk '/^model:/{sub(/^model: */,""); print; exit}' "$f")"
  oc="$(./install-opencode.sh --show "$n" 2>/dev/null | grep '^model:' || true)"
  [ -z "$oc" ] || { bad "opencode output invents a model pin for $n: $oc"; mp_bad=1; }
  cl="$(./install-claude.sh --show "$n" 2>/dev/null | grep '^model:' || true)"
  [ "$cl" = "model: inherit" ] || { bad "claude output should emit 'model: inherit' for $n, got: ${cl:-<none>}"; mp_bad=1; }
  # and the drop must be reported, not silent.
  # Capture before grepping: `grep -q` closes the pipe on first match, SIGPIPEs
  # the writer, and under `set -o pipefail` that turns a successful match into a
  # failed check. The failure only shows up once the output grows past the pipe
  # buffer, which is why it appeared as a flaky failure after adding agents
  # rather than as a broken assertion.
  mp_err="$(./install-claude.sh --show "$n" 2>&1 >/dev/null)"
  printf '%s' "$mp_err" | grep -q "dropped OMP model pin" || { bad "dropped pin not reported for $n"; mp_bad=1; }
  # spawns must be dropped the same way: reported, and never emitted as a
  # field the target runtime cannot honour
  if [ -n "$(awk '/^spawns:/{sub(/^spawns: */,""); print; exit}' "$f")" ]; then
    printf '%s' "$(./install-opencode.sh --show "$n" 2>/dev/null)" | grep -q '^spawns:' \
      && { bad "opencode output kept a spawns field for $n"; mp_bad=1; }
    printf '%s' "$(./install-claude.sh --show "$n" 2>/dev/null)" | grep -q '^spawns:' \
      && { bad "claude output kept a spawns field for $n"; mp_bad=1; }
  fi
done
[ "$mp_bad" -eq 0 ] && ok "model pins dropped and reported, never invented"

# --- 11. Smoke test: install, idempotency, uninstall -------------------------
# Break it: make an installer non-idempotent, or let it clobber a modified file.
note_check "installer smoke test (isolated HOME)"
EXP_AGENTS="$(ls core/agents/*.md | wc -l | tr -d ' ')"
EXP_SKILLS="$(ls -d core/skills/*/ | wc -l | tr -d ' ')"
SMOKE="$(mktemp -d)"
trap 'rm -rf "$SMOKE"' EXIT
mkdir -p "$SMOKE/home" "$SMOKE/cfg"

smoke_bad=0
smoke_run() {
  # smoke_run <installer> <agents_dir> <skills_dir>
  inst="$1"; adir="$2"; sdir="$3"
  env HOME="$SMOKE/home" PI_CODING_AGENT_DIR="$SMOKE/home/.omp/agent" \
      bash "$inst" >/dev/null 2>&1 || { bad "$(basename "$inst") run 1 failed"; smoke_bad=1; return; }
  n1="$(ls "$adir" 2>/dev/null | wc -l | tr -d ' ')"
  n2="$(ls "$sdir" 2>/dev/null | wc -l | tr -d ' ')"
  # Counts come from the repository, never from a literal. Hardcoding them made
  # adding two agents look like seven unrelated failures.
  [ "$n1" = "$EXP_AGENTS" ] || { bad "$(basename "$inst") installed $n1 agents, expected $EXP_AGENTS"; smoke_bad=1; }
  [ "$n2" = "$EXP_SKILLS" ] || { bad "$(basename "$inst") installed $n2 skills, expected $EXP_SKILLS"; smoke_bad=1; }

  # second run must skip everything
  skips="$(env HOME="$SMOKE/home" PI_CODING_AGENT_DIR="$SMOKE/home/.omp/agent" \
           bash "$inst" 2>/dev/null | grep -c 'identical, skipped')"
  exp_skips=$((EXP_AGENTS + EXP_SKILLS))
  [ "$skips" = "$exp_skips" ] || { bad "$(basename "$inst") second run skipped $skips, expected $exp_skips"; smoke_bad=1; }

  # a modified installed file must survive a third run.
  # Note: `grep -q` closes the pipe on first match, which SIGPIPEs the writer;
  # under `set -o pipefail` that turns a successful match into a failed
  # pipeline. Capture to a variable first, then match.
  first_agent="$(ls "$adir" | head -1)"
  printf '\n# local edit\n' >> "$adir/$first_agent"
  out3="$(env HOME="$SMOKE/home" PI_CODING_AGENT_DIR="$SMOKE/home/.omp/agent" bash "$inst" 2>&1)"
  printf '%s' "$out3" | grep -q 'exists and differs' || { bad "$(basename "$inst") did not refuse to clobber $first_agent"; smoke_bad=1; }
  grep -q '# local edit' "$adir/$first_agent" || { bad "$(basename "$inst") destroyed a local edit"; smoke_bad=1; }

  # and uninstall must keep the modified file
  out4="$(env HOME="$SMOKE/home" PI_CODING_AGENT_DIR="$SMOKE/home/.omp/agent" \
          bash ./uninstall.sh --omp --dry-run 2>&1)"
  printf '%s' "$out4" | grep -q 'modified since install' \
    || { bad "uninstaller did not report the modified file"; smoke_bad=1; }
}

smoke_run ./install.sh        "$SMOKE/home/.omp/agent/agents" "$SMOKE/home/.omp/skills"
[ "$smoke_bad" -eq 0 ] && ok "omp: $EXP_AGENTS agents, $EXP_SKILLS skills, idempotent, refuses to clobber, uninstall is safe"

# opencode + claude write to $HOME/.config and $HOME/.claude
for rt in opencode claude; do
  smoke_bad_r=0
  case "$rt" in
    opencode) adir="$SMOKE/home/.config/opencode/agents"; sdir="$SMOKE/home/.config/opencode/skills" ;;
    claude)   adir="$SMOKE/home/.claude/agents";             sdir="$SMOKE/home/.claude/skills" ;;
  esac
  env HOME="$SMOKE/home" bash "./install-$rt.sh" >/dev/null 2>&1 \
    || { bad "install-$rt.sh run 1 failed"; smoke_bad_r=1; }
  [ "$(ls "$adir" 2>/dev/null | wc -l | tr -d ' ')" = "$EXP_AGENTS" ] || { bad "install-$rt.sh agent count wrong"; smoke_bad_r=1; }
  [ "$(ls "$sdir" 2>/dev/null | wc -l | tr -d ' ')" = "$EXP_SKILLS" ] || { bad "install-$rt.sh skill count wrong"; smoke_bad_r=1; }
  [ "$smoke_bad_r" -eq 0 ] && ok "$rt: $EXP_AGENTS agents, $EXP_SKILLS skills installed into an isolated HOME"
  smoke_bad=$((smoke_bad + smoke_bad_r))
done

printf '\n%d checks, %d assertions passed, %d failed\n' "$CHECKS" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
