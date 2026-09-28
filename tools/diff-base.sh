#!/usr/bin/env bash
# Print the exact review base for the current working tree, for skill://review-changes.
#
# A review of the wrong bytes is worse than no review. This script establishes
# which bytes are under review and emits the commands to read them, so the
# reviewer does not have to decide that — or get it wrong.
#
#   ./tools/diff-base.sh               # describe the current state
#   ./tools/diff-base.sh --staged      # pre-commit: assert the staged index is what to review
#   ./tools/diff-base.sh --branch main # branch review: diff against the merge base
#   ./tools/diff-base.sh --sha <sha>   # single-commit review
#
# Exit status: 0 when exactly one base is established, 1 when the tree is in a
# mixed state that cannot be reviewed as one unit, or when there is nothing to
# review. The mixed-state refusal is the point — a diff that fixes a bug and
# reformats a file cannot be judged as one unit.

set -uo pipefail

SCOPE="auto"
SHA=""
AGAINST="main"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --staged)  SCOPE="staged" ;;
    --worktree) SCOPE="worktree" ;;
    --branch)  SCOPE="branch"; AGAINST="${2:-}"; shift ;;
    --sha)     SCOPE="sha"; SHA="${2:-}"; shift ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)         die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a git repository"

staged="$(git diff --cached --name-only | wc -l | tr -d ' ')"
unstaged="$(git diff --name-only | wc -l | tr -d ' ')"
untracked="$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')"

report() {
  printf 'base: %s\n' "$1"
  printf 'review with:\n%s\n' "$2"
}

case "$SCOPE" in
  staged)
    if [ "$staged" -eq 0 ]; then
      die "staged index is empty; nothing to review. Stage first, or review the worktree instead."
    fi
    if [ "$unstaged" -gt 0 ]; then
      printf 'warning: %s unstaged file(s) also differ. The staged bytes are what will ship;\n' "$unstaged"
      printf 'review them only with `git show :path`, never the on-disk file.\n\n'
    fi
    report "staged index" "$(printf '  git diff --cached\n  git show :<path>   # the staged blob, not the worktree file')"
    ;;

  sha)
    [ -n "$SHA" ] || die "--sha needs a commit"
    git cat-file -e "$SHA" 2>/dev/null || die "no such commit: $SHA"
    if git diff --cached --quiet && git diff --quiet; then
      report "commit $SHA" "  git show $SHA"
    else
      printf 'warning: the tree is dirty. The commit under review is clean, but do\n'
      printf 'not confuse working-tree content with the committed bytes.\n\n'
      report "commit $SHA" "  git show $SHA"
    fi
    ;;

  branch)
    base="$(git merge-base HEAD "$AGAINST" 2>/dev/null)" || die "no merge base with $AGAINST"
    report "merge base $base (HEAD vs $AGAINST)" "  git diff $base...HEAD"
    ;;

  *)
    # auto: exactly one dirty set, or refuse
    sets=0
    [ "$staged" -gt 0 ] && sets=$((sets + 1))
    [ "$unstaged" -gt 0 ] && sets=$((sets + 1))
    [ "$untracked" -gt 0 ] && sets=$((sets + 1))

    if [ "$sets" -eq 0 ]; then
      die "tree is clean; nothing to review."
    fi
    if [ "$sets" -gt 1 ]; then
      printf 'error: mixed state — %s staged, %s unstaged, %s untracked file(s).\n' \
        "$staged" "$unstaged" "$untracked"
      printf 'Review each set separately: --staged for the index, or stage and commit\n'
      printf 'first and review the branch. A mixed review produces confident findings\n'
      printf 'about code that will never ship.\n'
      exit 1
    fi
    if [ "$staged" -gt 0 ]; then
      report "staged index" "$(printf '  git diff --cached\n  git show :<path>')"
    elif [ "$unstaged" -gt 0 ]; then
      report "unstaged worktree" "  git diff"
    else
      report "untracked files (list only; untracked content has no base)" "  git ls-files --others --exclude-standard"
    fi
    ;;
esac
