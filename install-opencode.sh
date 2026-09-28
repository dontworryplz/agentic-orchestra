#!/usr/bin/env bash
# Install the agentic-orchestra agents and skills into an **OpenCode** runtime.
#
#   ./install-opencode.sh                    # user scope   (~/.config/opencode/...)
#   ./install-opencode.sh --project          # project scope (./.opencode/...)
#   ./install-opencode.sh --dry-run          # print the plan, touch nothing
#   ./install-opencode.sh --force            # overwrite files that already exist
#   ./install-opencode.sh --show <agent>     # print the converted file, install nothing
#   ./install-opencode.sh --temperature 0.2 --steps 40   # pin knobs OpenCode has, OMP does not
#
# SKILL.md files are format-identical across runtimes and are copied verbatim.
# Agent files are NOT: OMP and OpenCode use different frontmatter schemas, so
# this script converts them. See docs/troubleshooting.md for the schema table.
#
# Model pins are deliberately NOT converted. OMP pins provider-qualified IDs
# (openai-codex/gpt-6-luna:max); OpenCode accepts short aliases (haiku) and
# Claude accepts a four-value enum. There is no mechanical mapping, so the pin
# is dropped and reported rather than guessed. Set the model in OpenCode's own
# config.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCOPE="user"
DRY_RUN=0
FORCE=0
SHOW=""
TEMPERATURE=""
STEPS=""
DO_AGENTS=1
DO_SKILLS=1
WARNINGS=0

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
note() { printf '%s\n' "$1"; }
warn() { WARNINGS=$((WARNINGS + 1)); printf '  ! %s\n' "$1" >&2; }

usage() { sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --user)         SCOPE="user" ;;
    --project)      SCOPE="project" ;;
    --dry-run)      DRY_RUN=1 ;;
    --force|-f)     FORCE=1 ;;
    --show)         SHOW="${2:-}"; shift ;;
    --temperature)  TEMPERATURE="${2:-}"; shift ;;
    --steps)        STEPS="${2:-}"; shift ;;
    --agents-only)  DO_SKILLS=0 ;;
    --skills-only)  DO_AGENTS=0 ;;
    -h|--help)      usage ;;
    *)              die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

if [ "$SCOPE" = "user" ]; then
  AGENTS_DEST="$HOME/.config/opencode/agents"
  SKILLS_DEST="$HOME/.config/opencode/skills"
else
  AGENTS_DEST="$PWD/.opencode/agent"
  # Project skills follow the Agent Skills standard (.agents/skills), matching
  # lib/paths.mjs, the registry, and the other project-scope targets — not a
  # parallel .opencode/skill tree that no resolver reads.
  SKILLS_DEST="$PWD/.agents/skills"
fi

# --- OMP -> OpenCode tool mapping -------------------------------------------
# OMP grants a comma list. OpenCode takes a map of tool -> bool, and an absent
# key is ambiguous, so every capability that matters is stated explicitly.
# Anything not granted is pinned false, which is what preserves the read-only
# invariant of the explorer/reviewer roles.
omp_tool_to_opencode() {
  case "$1" in
    read)      echo "read: true" ;;
    grep)      echo "grep: true" ;;
    glob)      echo "glob: true" ;;
    lsp)       echo "" ;;                     # no OpenCode equivalent
    bash)      echo "bash: true" ;;
    edit)      echo "edit: true" ;;
    write)     echo "write: true" ;;
    web_search) echo "webfetch: true" ;;
    webfetch)  echo "webfetch: true" ;;
    task)      echo "task: true" ;;
    *)         echo "" ;;
  esac
}

ALL_OPENCODE_TOOLS="read grep glob edit write patch bash webfetch task"

# convert_agent <src> <dest_file>
# Writes the OpenCode-formatted agent to dest_file unless --dry-run.
convert_agent() {
  src="$1"
  dest="$2"
  name="$(awk '/^name:/{sub(/^name: */,""); print; exit}' "$src")"
  desc="$(awk '/^description:/{sub(/^description: */,""); print; exit}' "$src")"
  model="$(awk '/^model:/{sub(/^model: */,""); print; exit}' "$src")"
  tools_list="$(awk -f "$REPO_DIR/tools/read-list.awk" "$src" tools)"
  spawns_list="$(awk -f "$REPO_DIR/tools/read-list.awk" "$src" spawns | tr '\n' ',')"
  body_start="$(awk 'NR>1 && /^---$/{print NR+1; exit}' "$src")"

  if [ -z "$name" ] || [ -z "$tools_list" ]; then
    die "$src: cannot parse OMP frontmatter (need name: and a non-empty tools:)"
  fi
  if [ -z "$body_start" ]; then
    die "$src: no closing --- delimiter; body not found"
  fi

  # Both OMP shapes are read: the comma string this repository ships and the
  # block list OMP's own bundled agents use. tools/read-list.awk normalizes
  # either into one item per line. A single-shape parser does not fail here — it
  # reports an agent with no tools, and the converter renders that as
  # "everything denied", which is a silent capability loss.
  granted=";$(printf '%s' "$tools_list" | tr '\n' ';')"
  can_write=0
  case "$granted" in
    *";edit;"|*";write;") can_write=1 ;;
  esac

  if [ "$SHOW" = "$(basename "$src" .md)" ] || [ "$SHOW" = "$name" ]; then
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

# emit_agent <src>   -> converted file on stdout, warnings on stderr
emit_agent() {
  src="$1"
  name="$(awk '/^name:/{sub(/^name: */,""); print; exit}' "$src")"
  desc="$(awk '/^description:/{sub(/^description: */,""); print; exit}' "$src")"
  model="$(awk '/^model:/{sub(/^model: */,""); print; exit}' "$src")"
  tools_list="$(awk -f "$REPO_DIR/tools/read-list.awk" "$src" tools)"
  spawns_list="$(awk -f "$REPO_DIR/tools/read-list.awk" "$src" spawns | tr '\n' ',')"
  body_start="$(awk 'NR>1 && /^---$/{print NR+1; exit}' "$src")"

  # Both OMP shapes are read: the comma string this repository ships and the
  # block list OMP's own bundled agents use. tools/read-list.awk normalizes
  # either into one item per line. A single-shape parser does not fail here — it
  # reports an agent with no tools, and the converter renders that as
  # "everything denied", which is a silent capability loss.
  granted=";$(printf '%s' "$tools_list" | tr '\n' ';')"

# `read` returns non-zero at EOF even when it has just read a final field that
# has no trailing newline, and `$(...)` strips trailing newlines. Iterating with
# a bare `while read -r t` therefore silently drops the LAST tool of every
# agent — which showed up as an agent that lost exactly one capability, with no
# error anywhere. The `|| [ -n "$t" ]` guard is what makes the final field count.

  # Collapse OMP tools onto OpenCode tool keys, dedupe, and emit each key exactly
  # once. OMP's web_search and webfetch both land on webfetch, so a naive loop
  # emits that key twice and the later `false` silently wins in YAML.
  granted_oc="$(printf '%s' "$tools_list" | while read -r t || [ -n "$t" ]; do
    if [ -n "$t" ]; then omp_tool_to_opencode "$t"; fi
  done | sed 's/:.*//' | awk 'NF && !seen[$0]++' | tr '\n' ' ')"
  # Every unmapped tool is reported, not just the ones someone remembered. A
  # dedicated warning per tool name is how `lsp` was covered while `find` — also
  # a real OMP tool, also unmapped — was dropped in silence.
  dropped_tools="$(printf '%s' "$tools_list" | while read -r t || [ -n "$t" ]; do
    if [ -n "$t" ] && [ -z "$(omp_tool_to_opencode "$t")" ]; then printf '%s ' "$t"; fi
  done)"

  echo "---"
  printf 'description: "%s"\n' "$(printf '%s' "$desc" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  echo "mode: subagent"
  echo "tools:"
  for t in $ALL_OPENCODE_TOOLS; do
    case " $granted_oc " in
      *" $t "*) printf '  %s: true\n' "$t" ;;
      *)          printf '  %s: false\n' "$t" ;;
    esac
  done
  if [ -n "$TEMPERATURE" ]; then echo "temperature: $TEMPERATURE"; fi
  if [ -n "$STEPS" ]; then echo "steps: $STEPS"; fi
  echo "---"
  echo
  # Body verbatim, minus the blank padding the OMP source carries after frontmatter.
  awk -v s="$body_start" 'NR>=s { if (!started && $0 ~ /^[[:space:]]*$/) next; started=1; print }' "$src"

  if [ -n "$(printf '%s' "$dropped_tools" | tr -d ' ')" ]; then
    warn "$name: dropped unmapped OMP tool(s):$dropped_tools (no OpenCode equivalent)"
  fi
  if [ -n "$model" ]; then
    warn "$name: dropped OMP model pin '$model' — set it in OpenCode config, not in the agent file"
  fi
  return 0
}

copy_skill() {
  name="$1"
  src="$REPO_DIR/core/skills/$name"
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
  for f in "$REPO_DIR"/core/agents/*.md; do
    [ -e "$f" ] || continue
    if [ "$(basename "$f" .md)" = "$SHOW" ]; then
      emit_agent "$f"
      found=1
    fi
  done
  [ "$found" -eq 0 ] && die "no agent named '$SHOW'"
  exit 0
fi

note "agentic-orchestra -> OpenCode installer"
note "  repo:   $REPO_DIR"
note "  scope:  $SCOPE"
note "  agents: $AGENTS_DEST"
note "  skills: $SKILLS_DEST"
[ "$DRY_RUN" -eq 1 ] && note "  mode:   dry-run (no writes)"
[ "$FORCE" -eq 1 ] && note "  mode:   force (overwrite existing)"
[ -n "$TEMPERATURE" ] && note "  temperature: $TEMPERATURE"
[ -n "$STEPS" ] && note "  steps: $STEPS"
note ""

if [ "$DO_AGENTS" -eq 1 ]; then
  note "agents"
  for f in "$REPO_DIR"/core/agents/*.md; do
    [ -e "$f" ] || continue
    convert_agent "$f" "$AGENTS_DEST/$(basename "$f")"
  done
  note ""
fi

if [ "$DO_SKILLS" -eq 1 ]; then
  note "skills"
  for d in "$REPO_DIR"/core/skills/*/; do
    [ -d "$d" ] || continue
    copy_skill "$(basename "$d")"
  done
  note ""
fi

note "Verify with:"
note "  opencode agent list 2>/dev/null || opencode run 'list your available agents'"
note ""
if [ "$WARNINGS" -gt 0 ]; then
  note "$WARNINGS conversion warning(s) above — read them; nothing was invented to fill the gap."
fi
