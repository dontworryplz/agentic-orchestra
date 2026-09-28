#!/usr/bin/env awk -f
# Read a value from this repository's frontmatter, tolerating both shapes OMP
# accepts for list-valued keys:
#
#   tools: read, grep, glob          # comma string
#   tools:                          # YAML list
#     - read
#     - grep
#
# Reads a comma-separated list and prints one item per line.
#
# Why this exists: the bundled agents OMP ships use the list form and the agents
# in this repository use the comma form, and a parser that only understands one
# of them does not fail — it reports an agent with no tools, which a converter
# then renders as "everything denied". That is a silent capability loss, so both
# shapes have to be readable, whichever one a given file happens to use.
#
# Usage:  awk -f tools/read-list.awk <file> <key>

BEGIN { key = ARGV[2]; ARGV[2] = ""; found = 0; in_list = 0 }

# `key: a, b, c` or `key:` followed by an indented list
$0 ~ "^" key ":" {
  line = $0
  sub("^" key ":[[:space:]]*", "", line)
  if (line != "") {
    n = split(line, parts, ",")
    for (i = 1; i <= n; i++) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", parts[i])
      gsub(/^["\x27]|["\x27]$/, "", parts[i])
      if (parts[i] != "") print parts[i]
    }
    found = 1
    in_list = 0
    next
  }
  found = 1
  in_list = 1
  next
}

# A `- item` line belonging to the list we just opened
in_list && $0 ~ /^[[:space:]]*-[[:space:]]/ {
  line = $0
  sub(/^[[:space:]]*-[[:space:]]*/, "", line)
  gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
  gsub(/^["\x27]|["\x27]$/, "", line)
  if (line != "") print line
  next
}

# Any other key ends the list
in_list && $0 ~ /^[A-Za-z_][A-Za-z0-9_-]*:/ { in_list = 0 }
