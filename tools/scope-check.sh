#!/usr/bin/env bash
# Enforce an executor's file ownership against the working tree, for skill://executor.
#
# An executor may write only to the files and symbols its assignment names.
# "Every line must trace to the acceptance criterion" is easy to assert and easy
# to drift from, especially at the end of a slice when something adjacent looks
# tempting. This script makes the assertion mechanical.
#
#   ./tools/scope-check.sh --files agents/luna-worker.md,skills/verifier/SKILL.md
#   ./tools/scope-check.sh --files agents/luna-worker.md --staged
#   ./tools/scope-check.sh --files agents/luna-worker.md --base origin/main
#
# Exit status: 0 when every changed file is inside the list, 1 otherwise, with
# the offending paths named. There is no --force and no override flag. If a line
# outside the list is genuinely needed, the assignment — not this check — is
# what changes.
#
# Paths are matched exactly after normalizing away a leading ./ and a trailing
# slash, so `agents/x.md` and `./agents/x.md` are the same file.

set -uo pipefail

FILES=""
STAGED=0
BASE=""

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --files) FILES="${2:-}"; shift ;;
    --staged) STAGED=1 ;;
    --base)  BASE="${2:-}"; shift ;;
    -h|--help) sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)       die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

[ -n "$FILES" ] || die "--files is required: the comma-separated whitelist from the assignment"
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"

norm() { printf '%s' "$1" | sed 's|^\./||; s|/$||'; }

allowed=""
printf '%s' "$FILES" | tr ',' '\n' | while read -r f || [ -n "$f" ]; do
  [ -n "$f" ] || continue
  allowed="$allowed $(norm "$f")"
done
# The loop above runs in a pipeline subshell, so rebuild outside it.
allowed="$(printf '%s' "$FILES" | tr ',' '\n' | while read -r f || [ -n "$f" ]; do
  [ -n "$f" ] || continue
  printf ' %s' "$(norm "$f")"
done)"

if [ -n "$BASE" ]; then
  git rev-parse --verify "$BASE" >/dev/null 2>&1 || die "no such ref: $BASE"
  changed="$(git diff --name-only "$BASE"...HEAD 2>/dev/null; git diff --name-only; git diff --cached --name-only)"
else
  changed="$(git diff --name-only; git diff --cached --name-only)"
fi
if [ "$STAGED" -eq 1 ]; then
  changed="$(git diff --cached --name-only)"
fi
changed="$(printf '%s\n' "$changed" | awk 'NF && !seen[$0]++')"

if [ -z "$changed" ]; then
  printf 'scope: clean — no changed files, nothing to check\n'
  exit 0
fi

bad=0
for f in $changed; do
  n="$(norm "$f")"
  case "$allowed " in
    *" $n "*) : ;;
    *) printf 'OUT OF SCOPE: %s\n' "$f"; bad=1 ;;
  esac
done

if [ "$bad" -eq 0 ]; then
  printf 'scope: ok — %s changed file(s), all inside the assignment\n' "$(printf '%s\n' "$changed" | wc -l | tr -d ' ')"
  exit 0
fi

printf '\nThe files above are not in the assignment. Revert them, or stop and ask\nfor the assignment to change. Widening the whitelist after the fact turns\nthis check into decoration.\n'
exit 1
