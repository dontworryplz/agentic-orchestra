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
  SKILLS_DEST="$PWD/.opencode/skill"
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
  tools_line="$(awk '/^tools:/{sub(/^tools: */,""); print; exit}' "$src")"
  spawns="$(awk '/^spawns:/{sub(/^spawns: */,""); print; exit}' "$src")"
  body_start="$(awk 'NR>1 && /^---$/{print NR+1; exit}' "$src")"

  if [ -z "$name" ] || [ -z "$tools_line" ]; then
    die "$src: cannot parse OMP frontmatter (need name: and tools:)"
  fi
  if [ -z "$body_start" ]; then
    die "$src: no closing --- delimiter; body not found"
  fi

  granted="$(printf '%s' "$tools_line" | tr -d ' ')"
  can_write=0
  case ",$granted," in
    *,edit,*|*,write,*) can_write=1 ;;
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
  tools_line="$(awk '/^tools:/{sub(/^tools: */,""); print; exit}' "$src")"
  spawns="$(awk '/^spawns:/{sub(/^spawns: */,""); print; exit}' "$src")"
  body_start="$(awk 'NR>1 && /^---$/{print NR+1; exit}' "$src")"

  granted="$(printf '%s' "$tools_line" | tr -d ' ')"

  # Collapse OMP tools onto OpenCode tool keys, dedupe, and emit each key exactly
  # once. OMP's web_search and webfetch both land on webfetch, so a naive loop
  # emits that key twice and the later `false` silently wins in YAML.
  granted_oc="$(printf '%s\n' "$granted" | tr ',' '\n' | while read -r t; do
    if [ -n "$t" ]; then omp_tool_to_opencode "$t"; fi
  done | sed 's/:.*//' | awk 'NF && !seen[$0]++' | tr '\n' ' ')"

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

  case ",$granted," in *,lsp,*) warn "$name: OMP tool 'lsp' has no OpenCode equivalent; dropped" ;; esac
  if [ -n "$model" ]; then
    warn "$name: dropped OMP model pin '$model' — set it in OpenCode config, not in the agent file"
  fi
  return 0
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
note "  opencode agent list 2>/dev/null || opencode run 'list your available agents'"
note ""
if [ "$WARNINGS" -gt 0 ]; then
  note "$WARNINGS conversion warning(s) above — read them; nothing was invented to fill the gap."
fi
