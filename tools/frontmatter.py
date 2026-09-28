"""Frontmatter parsing for this repository's runtime files.

OMP accepts two shapes for a list-valued key, and both appear in the wild:
the comma string this repository ships and the block list OMP bundles:

    tools: read, grep, glob
    tools:
      - read
      - grep

A parser that understands only one of them does not fail. It reports an agent
with no tools, and a converter renders that as "everything denied" — a silent
capability loss. Everything here reads both shapes.
"""

from __future__ import annotations


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Split `text` into (fields, body). Raises ValueError on bad delimiters."""
    if not text.startswith("---\n"):
        raise ValueError("missing opening --- delimiter")
    end = text.index("\n---", 3)
    raw = text[4 : end + 1]
    body = text[text.index("\n", end + 1) + 1 :]

    data: dict = {}
    lines = raw.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            i += 1
            continue
        if ":" not in line:
            i += 1
            continue
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()

        if value == "":
            items: list[str] = []
            j = i + 1
            while j < len(lines):
                nxt = lines[j]
                if not nxt.strip():
                    j += 1
                    continue
                if nxt.lstrip().startswith("- ") or nxt.strip() == "-":
                    item = nxt.strip()[1:].strip().strip("\"'")
                    items.append(item)
                    j += 1
                    continue
                break
            if items:
                data[key] = items
                i = j
                continue
            data[key] = ""
            i += 1
            continue

        if len(value) > 1 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        data[key] = value
        i += 1
    return data, body


def as_list(value) -> list[str]:
    """A frontmatter value as a list, whichever shape it was written in."""
    if isinstance(value, list):
        return [v for v in value if v]
    if not isinstance(value, str) or not value:
        return []
    return [s.strip().strip("\"'") for s in value.split(",") if s.strip()]


def yaml_quote(value: str) -> str:
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    escaped = "".join(" " if ord(c) < 32 else c for c in escaped)
    return f'"{escaped}"'


def serialize_frontmatter(fields: list[tuple[str, str | None]], body: str) -> str:
    """Render fields then body. A value starting with newline is a nested block
    and gets a bare key (`tools:` not `tools: ` with a trailing space)."""
    out = ["---"]
    for key, value in fields:
        if value is None or value == "":
            continue
        if value.startswith("\n"):
            out.append(f"{key}:{value}")
        else:
            out.append(f"{key}: {value}")
    out += ["---", ""]
    return "\n".join(out) + "\n" + body.lstrip("\n")
