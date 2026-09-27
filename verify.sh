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
for f in agents/*.md skills/*/SKILL.md; do
  [ -e "$f" ] || continue
  if ! head -1 "$f" | grep -q '^---$'; then
    bad "no opening --- : $f"; fm_bad=1
  elif ! awk 'NR>1 && /^---$/{found=1; exit} END{exit !found}' "$f"; then
    bad "no closing --- : $f"; fm_bad=1
  fi
done
[ "$fm_bad" -eq 0 ] && ok "all $(ls agents/*.md skills/*/SKILL.md | wc -l | tr -d ' ') runtime files have frontmatter"

# --- 2. name matches its file/directory name ---------------------------------
# Break it: rename a file without editing its frontmatter name.
note_check "name matches location"
nm_bad=0
for f in agents/*.md; do
  n="$(awk '/^name:/{sub(/^name: */,""); print; exit}' "$f")"
  b="$(basename "$f" .md)"
  [ "$n" = "$b" ] || { bad "agents/$b.md declares name '$n'"; nm_bad=1; }
done
for d in skills/*/; do
  n="$(awk '/^name:/{sub(/^name: */,""); print; exit}' "$d/SKILL.md")"
  b="$(basename "$d")"
  [ "$n" = "$b" ] || { bad "skills/$b/ declares name '$n'"; nm_bad=1; }
done
[ "$nm_bad" -eq 0 ] && ok "every name matches its path"

# --- 3. Every skill:// reference resolves, or is a declared gap -------------
# Break it: add a skill:// line naming a skill that is neither shipped nor
# listed in docs/unresolved-skills.txt.
note_check "skill:// references resolve or are declared gaps"
ref_total="$(grep -ohE 'skill://[a-z0-9-]+' agents/*.md skills/*/SKILL.md | sed 's|skill://||' | sort -u | wc -l | tr -d ' ')"
actual_gaps="$(comm -23 \
  <(grep -ohE 'skill://[a-z0-9-]+' agents/*.md skills/*/SKILL.md | sed 's|skill://||' | sort -u) \
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

# --- 4. Runtime files are English, docs are not ------------------------------
# Break it: write a Turkish runtime prompt into any agents/ or skills/ file.
note_check "language split"
rt_bad=0
for f in agents/*.md skills/*/SKILL.md; do
  if grep -qE '(^|[^[:alpha:]])(ve|ile|icin|olarak|ancak|cunku)([^[:alpha:]]|$)' "$f" \
     || grep -qE '(^|[^[:alpha:]])(için|olarak|ancak|çünkü)([^[:alpha:]]|$)' "$f"; then
    bad "Turkish text in runtime file: $f"; rt_bad=1
  fi
done
[ "$rt_bad" -eq 0 ] && ok "no Turkish prose in runtime files"

# --- 5. Read-only roles cannot gain write access through conversion ----------
# Break it: add `edit` to the tools line of any explorer/reviewer.
note_check "read-only invariant survives conversion"
ro_bad=0
for f in agents/*explorer.md agents/*reviewer.md agents/luna-researcher.md; do
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
for f in agents/*.md skills/*/SKILL.md install*.sh uninstall.sh; do
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
  for d in skills/*/; do
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
[ "$sa_bad" -eq 0 ] && ok "skills/ layout matches the \`npx skills add\` discovery convention ($(ls -d skills/*/ | wc -l | tr -d ' ') skills)"

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
  node --check lib/convert.mjs >/dev/null 2>&1 || { bad "lib/convert.mjs is not valid JS"; ent_bad=1; }
  node --check lib/verify.mjs >/dev/null 2>&1 || { bad "lib/verify.mjs is not valid JS"; ent_bad=1; }
  node --check lib/frontmatter.mjs >/dev/null 2>&1 || { bad "lib/frontmatter.mjs is not valid JS"; ent_bad=1; }
  node --check lib/paths.mjs >/dev/null 2>&1 || { bad "lib/paths.mjs is not valid JS"; ent_bad=1; }
fi
[ "$ent_bad" -eq 0 ] && ok "bin/ has a shebang, exec bit, and valid JS in every lib file"

# --- 7. Scripts are syntactically valid --------------------------------------
# Break it: introduce an unbalanced quote in any script.
note_check "shell syntax"
sh_bad=0
for s in install.sh install-opencode.sh install-claude.sh uninstall.sh verify.sh; do
  [ -e "$s" ] || continue
  bash -n "$s" 2>/dev/null || { bad "bash -n $s"; sh_bad=1; }
done
[ "$sh_bad" -eq 0 ] && ok "all scripts pass bash -n"

if [ "$FAST" -eq 1 ]; then
  printf '\n%d checks, %d assertions passed, %d failed (fast mode: smoke tests skipped)\n' "$CHECKS" "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ] || exit 1
  exit 0
fi

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
  for f in agents/*.md; do
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
  [ "$xcheck_bad" -eq 0 ] && ok "10 agents x 2 runtimes: bash and node output identical"
fi

# --- 8. Converted frontmatter has no duplicate keys --------------------------
# Break it: make omp_tool_to_opencode map two OMP tools onto one OpenCode key
# without deduping. YAML keeps the last value, so a granted tool goes missing.
note_check "conversion emits no duplicate YAML keys"
dup_bad=0
for f in agents/*.md; do
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
for f in agents/*.md; do
  n="$(basename "$f" .md)"
  for rt in opencode claude; do
    ./install-$rt.sh --show "$n" >/dev/null 2>&1 || { bad "$rt conversion failed for $n"; conv_bad=1; }
  done
done
[ "$conv_bad" -eq 0 ] && ok "10 agents x 2 runtimes convert cleanly"

# --- 10. Model pins are never silently invented -----------------------------
# Break it: make an installer emit a model: field derived from the OMP pin.
note_check "no invented model pins"
mp_bad=0
for f in agents/*.md; do
  n="$(basename "$f" .md)"
  omp_model="$(awk '/^model:/{sub(/^model: */,""); print; exit}' "$f")"
  oc="$(./install-opencode.sh --show "$n" 2>/dev/null | grep '^model:' || true)"
  [ -z "$oc" ] || { bad "opencode output invents a model pin for $n: $oc"; mp_bad=1; }
  cl="$(./install-claude.sh --show "$n" 2>/dev/null | grep '^model:' || true)"
  [ "$cl" = "model: inherit" ] || { bad "claude output should emit 'model: inherit' for $n, got: ${cl:-<none>}"; mp_bad=1; }
  # and the drop must be reported, not silent
  if ! ./install-claude.sh --show "$n" 2>&1 >/dev/null | grep -q "dropped OMP model pin"; then
    bad "dropped pin not reported for $n"; mp_bad=1
  fi
done
[ "$mp_bad" -eq 0 ] && ok "model pins dropped and reported, never invented"

# --- 11. Smoke test: install, idempotency, uninstall -------------------------
# Break it: make an installer non-idempotent, or let it clobber a modified file.
note_check "installer smoke test (isolated HOME)"
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
  [ "$n1" = "10" ] || { bad "$(basename "$inst") installed $n1 agents, expected 10"; smoke_bad=1; }
  [ "$n2" = "9" ] || { bad "$(basename "$inst") installed $n2 skills, expected 9"; smoke_bad=1; }

  # second run must skip everything
  skips="$(env HOME="$SMOKE/home" PI_CODING_AGENT_DIR="$SMOKE/home/.omp/agent" \
           bash "$inst" 2>/dev/null | grep -c 'identical, skipped')"
  [ "$skips" = "19" ] || { bad "$(basename "$inst") second run skipped $skips, expected 19"; smoke_bad=1; }

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
[ "$smoke_bad" -eq 0 ] && ok "omp: 10 agents, 9 skills, idempotent, refuses to clobber, uninstall is safe"

# opencode + claude write to $HOME/.config and $HOME/.claude
for rt in opencode claude; do
  smoke_bad_r=0
  case "$rt" in
    opencode) adir="$SMOKE/home/.config/opencode/agents"; sdir="$SMOKE/home/.config/opencode/skills" ;;
    claude)   adir="$SMOKE/home/.claude/agents";             sdir="$SMOKE/home/.claude/skills" ;;
  esac
  env HOME="$SMOKE/home" bash "./install-$rt.sh" >/dev/null 2>&1 \
    || { bad "install-$rt.sh run 1 failed"; smoke_bad_r=1; }
  [ "$(ls "$adir" 2>/dev/null | wc -l | tr -d ' ')" = "10" ] || { bad "install-$rt.sh agent count wrong"; smoke_bad_r=1; }
  [ "$(ls "$sdir" 2>/dev/null | wc -l | tr -d ' ')" = "9" ] || { bad "install-$rt.sh skill count wrong"; smoke_bad_r=1; }
  [ "$smoke_bad_r" -eq 0 ] && ok "$rt: 10 agents, 9 skills installed into an isolated HOME"
  smoke_bad=$((smoke_bad + smoke_bad_r))
done

printf '\n%d checks, %d assertions passed, %d failed\n' "$CHECKS" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
