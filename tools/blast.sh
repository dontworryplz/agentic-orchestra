#!/usr/bin/env bash
# Enumerate the blast radius of a symbol before editing it, for skill://refactor-safely.
#
# "Enumerate every caller before editing" is the step that gets skipped, because
# it is tedious. This script does the tedious part, twice, with two independent
# methods — a plain text search and a word-boundary search — because a rename
# that survives one method and dies on the other is the common way a "no
# references found" claim turns out to be wrong.
#
#   ./tools/blast.sh HandleNotes
#   ./tools/blast.sh Class.method --in src/
#   ./tools/blast.sh pkg.Fn --fixed
#
# Output: hits grouped by file, one path per line, with the enclosing symbol
# where cheap to determine, plus the two-method corroboration line at the end.
#
# Exit status is always 0. This is an enumeration, not a gate: zero hits means
# "nothing found by either method", which is a datum to check, not a licence
# to delete. skill://refactor-safely step 3 says what a deletion additionally
# requires.
#
# If a graft/ index or the graft CLI exists, the first line says so and defers
# to it — a precomputed edge is better than a text search. The text search below
# is the fallback, not the replacement.

set -uo pipefail

SYMBOL=""
SCOPE=""
FIXED=0

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --in)    SCOPE="${2:-}"; shift ;;
    --fixed) FIXED=1 ;;
    -h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)      die "unknown flag: $1 (try --help)" ;;
    *)       [ -z "$SYMBOL" ] || die "one symbol only"; SYMBOL="$1" ;;
  esac
  shift
done

[ -n "$SYMBOL" ] || die "a symbol is required"
git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"

if [ -d graft ] || command -v graft >/dev/null 2>&1; then
  printf '# a graft index or CLI is present: prefer `graft callers %s --depth all`.\n' "$SYMBOL"
  printf '# What follows is the text-search corroboration, not the answer.\n\n'
fi

root="$(git rev-parse --show-toplevel)"
[ -n "$SCOPE" ] && root="$root/$SCOPE"
[ -d "$root" ] || die "no such directory: $root"

# Method 1: substring search, highest recall.
m1="$(git grep -n --no-color -e "$SYMBOL" -- "$root" 2>/dev/null || true)"
# Method 2: word-boundary search, highest precision for renames. A bare name
# that appears only inside longer identifiers is a candidate the first method
# counts and the second does not.
if [ "$FIXED" -eq 1 ]; then
  m2="$(git grep -n --no-color -F -e "$SYMBOL" -- "$root" 2>/dev/null || true)"
else
  m2="$(git grep -n --no-color -w -e "$SYMBOL" -- "$root" 2>/dev/null || true)"
fi

if [ -z "$m1" ]; then
  printf 'no hits for "%s" by either method.\n' "$SYMBOL"
  printf 'That is a search result, not a finding. Corroborate before deleting.\n'
  exit 0
fi

# Group by file, with the count per file.
printf 'hits for "%s", grouped by file (method1/method2 counts):\n\n' "$SYMBOL"
printf '%s\n' "$m1" | awk -F: '{print $1}' | sort | uniq -c | sort -rn | while read -r n f || [ -n "$f" ]; do
  m2n="$(printf '%s\n' "$m2" | awk -F: -v file="$f" '$1 == file' | wc -l | tr -d ' ')"
  printf '  %s  %s  (substring %s, word-boundary %s)\n' "$n" "$f" "$n" "$m2n"
done

printf '\ncorroboration: '
n1="$(printf '%s\n' "$m1" | wc -l | tr -d ' ')"
n2="$(printf '%s\n' "$m2" | wc -l | tr -d ' ')"
if [ "$n1" = "$n2" ]; then
  printf 'both methods agree on %s hit(s).\n' "$n1"
else
  printf 'method 1 found %s, method 2 found %s. The difference is occurrences\ninside longer identifiers — read each one before counting it.\n' "$n1" "$n2"
fi

# Definitions first, so the rename has somewhere to start from.
defs="$(printf '%s\n' "$m1" | grep -iE '^\s*[^:]+:[0-9]+:.*(func|function|class|def |fn |const .*=|let .*=|var .*=|type |interface |struct )' || true)"
if [ -n "$defs" ]; then
  printf '\ncandidate definitions:\n%s\n' "$defs"
fi
