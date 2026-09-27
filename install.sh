#!/usr/bin/env bash
# Install the agentic-orchestra agents and skills into an OMP runtime.
#
#   ./install.sh                    # user scope   (~/.omp/...)
#   ./install.sh --project          # project scope (./.omp/...)
#   ./install.sh --dry-run          # print what would happen, touch nothing
#   ./install.sh --force            # overwrite files that already exist
#   ./install.sh --agents-only      # skip skills
#   ./install.sh --skills-only      # skip agents
#
# Honors PI_CODING_AGENT_DIR if set; otherwise defaults to ~/.omp/agent.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_HOME="${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}"

SCOPE="user"
DRY_RUN=0
FORCE=0
DO_AGENTS=1
DO_SKILLS=1

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
note() { printf '%s\n' "$1"; }

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --user)       SCOPE="user" ;;
    --project)    SCOPE="project" ;;
    --dry-run)    DRY_RUN=1 ;;
    --force|-f)   FORCE=1 ;;
    --agents-only) DO_SKILLS=0 ;;
    --skills-only) DO_AGENTS=0 ;;
    -h|--help)    usage ;;
    *)            die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

if [ "$SCOPE" = "user" ]; then
  AGENTS_DEST="$AGENT_HOME/agents"
  SKILLS_DEST="$HOME/.omp/skills"
else
  AGENTS_DEST="$PWD/.omp/agents"
  SKILLS_DEST="$PWD/.omp/skills"
fi

# install_file <src> <dest_dir>
# Copies src into dest_dir, creating the directory. Refuses to clobber unless
# --force. In --dry-run nothing is written to disk.
install_file() {
  src="$1"
  dest_dir="$2"
  base="$(basename "$src")"
  dest="$dest_dir/$base"

  if [ -e "$dest" ] && [ "$FORCE" -eq 0 ]; then
    if cmp -s "$src" "$dest"; then
      note "  = $dest (identical, skipped)"
    else
      note "  ! $dest exists and differs — re-run with --force to overwrite"
    fi
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    note "  + $dest (dry-run)"
    return 0
  fi

  mkdir -p "$dest_dir"
  cp "$src" "$dest"
  note "  + $dest"
}

# install_skill <skill_name>
# A skill is a directory containing SKILL.md; copy the whole directory.
install_skill() {
  name="$1"
  src="$REPO_DIR/skills/$name"
  dest="$SKILLS_DEST/$name"

  if [ ! -f "$src/SKILL.md" ]; then
    die "missing skill: $src/SKILL.md"
  fi

  if [ -e "$dest" ] && [ "$FORCE" -eq 0 ]; then
    if diff -r "$src" "$dest" >/dev/null 2>&1; then
      note "  = $dest (identical, skipped)"
    else
      note "  ! $dest exists and differs — re-run with --force to overwrite"
    fi
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    note "  + $dest/ (dry-run)"
    return 0
  fi

  mkdir -p "$SKILLS_DEST"
  rm -rf "$dest"
  cp -R "$src" "$dest"
  note "  + $dest/"
}

note "agentic-orchestra installer"
note "  repo:    $REPO_DIR"
note "  scope:   $SCOPE"
[ "$DRY_RUN" -eq 1 ] && note "  mode:    dry-run (no writes)"
[ "$FORCE" -eq 1 ] && note "  mode:    force (overwrite existing)"
note ""

if [ "$DO_AGENTS" -eq 1 ]; then
  note "agents -> $AGENTS_DEST"
  found=0
  for f in "$REPO_DIR"/agents/*.md; do
    [ -e "$f" ] || continue
    found=1
    install_file "$f" "$AGENTS_DEST"
  done
  [ "$found" -eq 0 ] && note "  (no agent files found in $REPO_DIR/agents)"
  note ""
fi

if [ "$DO_SKILLS" -eq 1 ]; then
  note "skills -> $SKILLS_DEST"
  found=0
  for d in "$REPO_DIR"/skills/*/; do
    [ -d "$d" ] || continue
    found=1
    install_skill "$(basename "$d")"
  done
  [ "$found" -eq 0 ] && note "  (no skills found in $REPO_DIR/skills)"
  note ""
fi

note "Verify with:"
if [ "$SCOPE" = "user" ]; then
  note "  omp --skills='graft,sol-luna-orchestrator' -p \"list your available skills\""
else
  note "  omp --cwd \"$PWD\" -p \"list your available agents and skills\""
fi
