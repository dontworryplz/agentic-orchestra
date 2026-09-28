#!/usr/bin/env bash
# Remove what the agentic-orchestra installers added.
#
#   ./uninstall.sh --runtime omp         # ~/.omp/agent/agents + ~/.omp/skills
#   ./uninstall.sh --runtime opencode    # ~/.config/opencode/{agents,skills}
#   ./uninstall.sh --runtime claude      # ~/.claude/{agents,skills}
#   ./uninstall.sh --dry-run             # list what would go, remove nothing
#   ./uninstall.sh --force               # remove even files you have since edited
#
# By default a file is removed ONLY if its current content still matches what the
# installer would write. If you edited an installed agent, it is reported and
# left in place — a tool that silently deletes your local work is worse than no
# tool. --force overrides that.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUNTIME=""
DRY_RUN=0
FORCE=0
REMOVED=0
KEPT=0
ABSENT=0

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
note() { printf '%s\n' "$1"; }

usage() { sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --runtime)   RUNTIME="${2:-}"; shift ;;
    --omp)       RUNTIME="omp"; shift ;;
    --opencode)  RUNTIME="opencode"; shift ;;
    --claude)    RUNTIME="claude"; shift ;;
    --dry-run)   DRY_RUN=1 ;;
    --force|-f)  FORCE=1 ;;
    -h|--help)   usage ;;
    *)           die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

[ -n "$RUNTIME" ] || die "--runtime is required: omp | opencode | claude"
case "$RUNTIME" in
  omp)
    AGENTS_DEST="${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}/agents"
    SKILLS_DEST="$HOME/.omp/skills"
    INSTALLER="$REPO_DIR/install.sh"
    ;;
  opencode)
    AGENTS_DEST="$HOME/.config/opencode/agents"
    SKILLS_DEST="$HOME/.config/opencode/skills"
    INSTALLER="$REPO_DIR/install-opencode.sh"
    ;;
  claude)
    AGENTS_DEST="$HOME/.claude/agents"
    SKILLS_DEST="$HOME/.claude/skills"
    INSTALLER="$REPO_DIR/install-claude.sh"
    ;;
  *) die "unknown runtime '$RUNTIME'" ;;
esac

# remove_if_ours <installed_file> <expected_file>
# Removes installed_file when it still matches expected_file, or when --force.
remove_if_ours() {
  installed="$1"
  expected="$2"

  if [ ! -e "$installed" ]; then
    note "  - $installed (absent)"
    ABSENT=$((ABSENT + 1))
    return 0
  fi

  if [ "$FORCE" -eq 0 ] && [ -f "$expected" ] && ! diff -q "$installed" "$expected" >/dev/null 2>&1; then
    note "  ! $installed modified since install — left in place (use --force to remove)"
    KEPT=$((KEPT + 1))
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    note "  x $installed (dry-run)"
    REMOVED=$((REMOVED + 1))
    return 0
  fi

  rm -f "$installed"
  note "  x $installed"
  REMOVED=$((REMOVED + 1))
}

note "agentic-orchestra uninstaller"
note "  runtime: $RUNTIME"
note "  agents:  $AGENTS_DEST"
note "  skills:  $SKILLS_DEST"
[ "$DRY_RUN" -eq 1 ] && note "  mode:    dry-run (nothing removed)"
[ "$FORCE" -eq 1 ] && note "  mode:    force (removes modified files too)"
note ""

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

note "agents"
for f in "$REPO_DIR"/core/agents/*.md; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"

  # Regenerate what the installer would have written, so the comparison is
  # against this repo's current content rather than a stale copy.
  expected="$TMP/$base"
  case "$RUNTIME" in
    omp)      cp "$f" "$expected" ;;
    opencode) "$INSTALLER" --show "${base%.md}" > "$expected" 2>/dev/null ;;
    claude)   "$INSTALLER" --show "${base%.md}" > "$expected" 2>/dev/null ;;
  esac

  remove_if_ours "$AGENTS_DEST/$base" "$expected"
done
note ""

note "skills"
for d in "$REPO_DIR"/core/skills/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  dest="$SKILLS_DEST/$name"

  if [ ! -e "$dest" ]; then
    note "  - $dest (absent)"
    ABSENT=$((ABSENT + 1))
    continue
  fi

  if [ "$FORCE" -eq 0 ] && ! diff -r "$d" "$dest" >/dev/null 2>&1; then
    note "  ! $dest modified since install — left in place (use --force to remove)"
    KEPT=$((KEPT + 1))
    continue
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    note "  x $dest/ (dry-run)"
  else
    rm -rf "$dest"
    note "  x $dest/"
  fi
  REMOVED=$((REMOVED + 1))
done
note ""

note "removed=$REMOVED  kept(modified)=$KEPT  absent=$ABSENT"
[ "$KEPT" -gt 0 ] && note "kept files still reference this orchestra; review them before deleting."
exit 0
