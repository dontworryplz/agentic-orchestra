#!/usr/bin/env bash
# Install the agentic-orchestra agents and skills into a **Claude Code** runtime.
#
#   ./install-claude.sh                    # user scope   (~/.claude/...)
#   ./install-claude.sh --project          # project scope (./.claude/...)
#   ./install-claude.sh --dry-run          # print the plan, touch nothing
#   ./install-claude.sh --force            # overwrite files that already exist
#   ./install-claude.sh --show <agent>     # print the converted file, install nothing
#   ./install-claude.sh --model sonnet     # override the model field (default: inherit)
#
# SKILL.md files are format-identical across runtimes and are copied verbatim.
# Agent files are NOT: Claude Code uses Title-case tool names in a comma list,
# plus `effort`/`color` fields OMP has no equivalent for. This script converts.
#
# Model pins are deliberately NOT converted. OMP pins provider-qualified IDs
# (openai-codex/gpt-6-luna:max); Claude Code accepts only inherit/sonnet/opus/
# haiku. Emitting `inherit` is the honest default: the pin is reported as
# dropped rather than guessed into a wrong four-value enum.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCOPE="user"
DRY_RUN=0
FORCE=0
SHOW=""
MODEL="inherit"
DO_AGENTS=1
DO_SKILLS=1
WARNINGS=0

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
note() { printf '%s\n' "$1"; }
warn() { WARNINGS=$((WARNINGS + 1)); printf '  ! %s\n' "$1" >&2; }

usage() { sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --user)        SCOPE="user" ;;
    --project)     SCOPE="project" ;;
    --dry-run)     DRY_RUN=1 ;;
    --force|-f)    FORCE=1 ;;
    --show)        SHOW="${2:-}"; shift ;;
    --model)       MODEL="${2:-}"; shift ;;
    --agents-only) DO_SKILLS=0 ;;
    --skills-only) DO_AGENTS=0 ;;
    -h|--help)     usage ;;
    *)             die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

case "$MODEL" in
  inherit|sonnet|opus|haiku) : ;;
  *) die "--model must be one of: inherit, sonnet, opus, haiku (got '$MODEL')" ;;
esac

if [ "$SCOPE" = "user" ]; then
  AGENTS_DEST="$HOME/.claude/agents"
  SKILLS_DEST="$HOME/.claude/skills"
else
  AGENTS_DEST="$PWD/.claude/agents"
  SKILLS_DEST="$PWD/.claude/skills"
fi

# OMP tool name -> Claude Code tool name
omp_tool_to_claude() {
  case "$1" in
    read)       echo "Read" ;;
    grep)       echo "Grep" ;;
    glob)       echo "Glob" ;;
    bash)       echo "Bash" ;;
    edit)       echo "Edit" ;;
    write)      echo "Write" ;;
    web_search) echo "WebSearch" ;;
    webfetch)   echo "WebFetch" ;;
    task)       echo "Task" ;;
    *)          echo "" ;;
  esac
}

# OMP reasoning suffix -> Claude effort. Claude has no `max`; it is capped at
# xhigh, so :max is reported as high. This is an approximation, not a pin.
omp_effort() {
  case "$1" in
    *:max)  echo "high" ;;
    *:high) echo "high" ;;
    *:low)  echo "low" ;;
    *)      echo "medium" ;;
  esac
}

emit_agent() {
  src="$1"
  name="$(awk '/^name:/{sub(/^name: */,""); print; exit}' "$src")"
  desc="$(awk '/^description:/{sub(/^description: */,""); print; exit}' "$src")"
  omp_model="$(awk '/^model:/{sub(/^model: */,""); print; exit}' "$src")"
  tools_list="$(awk -f "$REPO_DIR/tools/read-list.awk" "$src" tools)"
  spawns_list="$(awk -f "$REPO_DIR/tools/read-list.awk" "$src" spawns | tr '\n' ',')"
  body_start="$(awk 'NR>1 && /^---$/{print NR+1; exit}' "$src")"

  # Both OMP shapes are read: the comma string this repository ships and the
  # block list OMP's own bundled agents use. tools/read-list.awk normalizes
  # either into one item per line. A single-shape parser does not fail here — it
  # reports an agent with no tools, and the converter renders that as
  # "everything denied", which is a silent capability loss.
  if [ -z "$name" ] || [ -z "$tools_list" ] || [ -z "$body_start" ]; then
    die "$src: cannot parse OMP frontmatter (need name: and a non-empty tools:)"
  fi

# `read` returns non-zero at EOF even when it has just read a final field that
# has no trailing newline, and `$(...)` strips trailing newlines. Iterating with
# a bare `while read -r t` therefore silently drops the LAST tool of every
# agent — which showed up as an agent that lost exactly one capability, with no
# error anywhere. The `|| [ -n "$t" ]` guard is what makes the final field count.

  granted=";$(printf '%s' "$tools_list" | tr '\n' ';')"
  claude_tools="$(printf '%s' "$tools_list" | while read -r t || [ -n "$t" ]; do
    if [ -n "$t" ]; then omp_tool_to_claude "$t"; fi
  done | awk 'NF && !seen[$0]++' | paste -sd, -)"
  # Report every unmapped tool, not the ones someone remembered. `lsp` had a
  # dedicated warning while `find` was dropped in silence.
  dropped_tools="$(printf '%s' "$tools_list" | while read -r t || [ -n "$t" ]; do
    if [ -n "$t" ] && [ -z "$(omp_tool_to_claude "$t")" ]; then printf '%s ' "$t"; fi
  done)"

  echo "---"
  echo "name: $name"
  printf 'description: "%s"\n' "$(printf '%s' "$desc" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  echo "tools: $claude_tools"
  echo "effort: $(omp_effort "$omp_model")"
  echo "model: $MODEL"
  echo "---"
  echo
  awk -v s="$body_start" 'NR>=s { if (!started && $0 ~ /^[[:space:]]*$/) next; started=1; print }' "$src"

  if [ -n "$(printf '%s' "$dropped_tools" | tr -d ' ')" ]; then
    warn "$name: dropped unmapped OMP tool(s):$dropped_tools (no Claude Code equivalent)"
  fi
  if [ -n "$omp_model" ] && [ "$MODEL" = "inherit" ]; then
    warn "$name: dropped OMP model pin '$omp_model' — emitted 'model: inherit'. Pass --model to pin explicitly."
  fi
  if [ -n "$spawns_list" ]; then
    warn "$name: dropped spawns=$spawns_list — Claude Code has no nested-spawn equivalent; this agent loses its tier-2 delegation"
  fi
  return 0
}

convert_agent() {
  src="$1"
  dest="$2"
  base="$(basename "$src" .md)"

  if [ "$SHOW" = "$base" ]; then
    emit_agent "$src"
    return 0
  fi

  if [ -e "$dest" ] && [ "$FORCE" -eq 0 ]; then
    if diff -q <(emit_agent "$src" 2>/dev/null) "$dest" >/dev/null 2>&1; then
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

  mkdir -p "$(dirname "$dest")"
  emit_agent "$src" > "$dest"
  note "  + $dest"
}

copy_skill() {
  name="$1"
  src="$REPO_DIR/skills/$name"
  dest="$SKILLS_DEST/$name"

  [ -f "$src/SKILL.md" ] || die "missing skill: $src/SKILL.md"

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

if [ -n "$SHOW" ]; then
  found=0
  for f in "$REPO_DIR"/agents/*.md; do
    [ -e "$f" ] || continue
    if [ "$(basename "$f" .md)" = "$SHOW" ]; then
      emit_agent "$f"
      found=1
    fi
  done
  [ "$found" -eq 0 ] && die "no agent named '$SHOW'"
  exit 0
fi

note "agentic-orchestra -> Claude Code installer"
note "  repo:   $REPO_DIR"
note "  scope:  $SCOPE"
note "  agents: $AGENTS_DEST"
note "  skills: $SKILLS_DEST"
note "  model:  $MODEL"
[ "$DRY_RUN" -eq 1 ] && note "  mode:   dry-run (no writes)"
[ "$FORCE" -eq 1 ] && note "  mode:   force (overwrite existing)"
note ""

if [ "$DO_AGENTS" -eq 1 ]; then
  note "agents"
  for f in "$REPO_DIR"/agents/*.md; do
    [ -e "$f" ] || continue
    convert_agent "$f" "$AGENTS_DEST/$(basename "$f")"
  done
  note ""
fi

if [ "$DO_SKILLS" -eq 1 ]; then
  note "skills"
  for d in "$REPO_DIR"/skills/*/; do
    [ -d "$d" ] || continue
    copy_skill "$(basename "$d")"
  done
  note ""
fi

note "Verify with:"
note "  claude --print 'list your available agents and skills' 2>/dev/null || claude -p 'list your agents'"
note ""
if [ "$WARNINGS" -gt 0 ]; then
  note "$WARNINGS conversion warning(s) above — read them; nothing was invented to fill the gap."
fi
