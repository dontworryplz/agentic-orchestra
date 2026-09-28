"""OMP agent conversion to the other runtimes.

Mirrors lib/convert.mjs exactly. The two implementations are duplicated on
purpose — Python is the dependency-free path for people who clone the repo,
Node is the npx path — and tools/golden.py asserts every Python conversion is
byte-identical to the reviewed golden, which the Node converter also matches.
Change a mapping here without changing it there and the build goes red.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from frontmatter import as_list, parse_frontmatter, serialize_frontmatter, yaml_quote

OMP_TO_OPENCODE = {
    "read": "read",
    "grep": "grep",
    "glob": "glob",
    "bash": "bash",
    "edit": "edit",
    "write": "write",
    "web_search": "webfetch",
    "webfetch": "webfetch",
    "task": "task",
}

# Emitted for every OpenCode agent, granted or not. The false entries stop a
# read-only role from inheriting write access from a runtime default.
OPENCODE_TOOL_ORDER = ["read", "grep", "glob", "edit", "write", "patch", "bash", "webfetch", "task"]

OMP_TO_CLAUDE = {
    "read": "Read",
    "grep": "Grep",
    "glob": "Glob",
    "bash": "Bash",
    "edit": "Edit",
    "write": "Write",
    "web_search": "WebSearch",
    "webfetch": "WebFetch",
    "task": "Task",
}

CLAUDE_MODELS = ["inherit", "sonnet", "opus", "haiku"]
RUNTIMES = ["omp", "opencode", "claude", "cursor", "codex"]


def granted_tools(tools_value) -> list[str]:
    return [t.replace(" ", "") for t in as_list(tools_value)]


def effort_for(model: str) -> str:
    if model.endswith(":max"):
        return "high"
    if model.endswith(":high"):
        return "high"
    if model.endswith(":low"):
        return "low"
    return "medium"


def _frontmatter_only(source: str):
    data, body = parse_frontmatter(source)
    if not data.get("name"):
        raise ValueError("frontmatter has no name")
    return data, body


def _base(source: str):
    data, body = _frontmatter_only(source)
    if not data.get("tools"):
        raise ValueError(f"frontmatter has no tools ({data.get('name')})")
    return data, body, granted_tools(data["tools"])


def to_opencode(source: str, temperature: str = "", steps: str = "") -> tuple[str, list[str]]:
    data, body, granted = _base(source)
    warnings: list[str] = []

    granted_set: set[str] = set()
    for tool in granted:
        mapped = OMP_TO_OPENCODE.get(tool)
        if mapped:
            granted_set.add(mapped)
        else:
            warnings.append(f"{data['name']}: OMP tool '{tool}' has no OpenCode equivalent; dropped")

    tools_block = "\n".join(f"  {t}: {'true' if t in granted_set else 'false'}" for t in OPENCODE_TOOL_ORDER)
    fields: list[tuple[str, str | None]] = [
        ("description", yaml_quote(data.get("description", ""))),
        ("mode", "subagent"),
        ("tools", "\n" + tools_block),
    ]
    if temperature:
        fields.append(("temperature", str(temperature)))
    if steps:
        fields.append(("steps", str(steps)))
    fields.append(("model", None))  # never emitted: OMP pins are not portable
    fields.append(("spawns", None))  # never emitted: no nested-spawn equivalent

    if data.get("model"):
        warnings.append(
            f"{data['name']}: dropped OMP model pin '{data['model']}' — set it in OpenCode config, not in the agent file"
        )
    if data.get("spawns"):
        warnings.append(
            f"{data['name']}: dropped spawns='{data['spawns']}' — OpenCode has no nested-spawn equivalent; "
            "this agent loses its tier-2 delegation"
        )
    return serialize_frontmatter(fields, body), warnings


def to_claude(source: str, model: str = "inherit") -> tuple[str, list[str]]:
    if model not in CLAUDE_MODELS:
        raise ValueError(f"--model must be one of: {', '.join(CLAUDE_MODELS)} (got '{model}')")
    data, body, granted = _base(source)
    warnings: list[str] = []

    seen: set[str] = set()
    ordered: list[str] = []
    for tool in granted:
        mapped = OMP_TO_CLAUDE.get(tool)
        if not mapped:
            warnings.append(f"{data['name']}: OMP tool '{tool}' has no Claude Code equivalent; dropped")
            continue
        if mapped in seen:
            continue
        seen.add(mapped)
        ordered.append(mapped)

    fields = [
        ("name", data["name"]),
        ("description", yaml_quote(data.get("description", ""))),
        ("tools", ",".join(ordered)),
        ("effort", effort_for(data.get("model", ""))),
        ("model", model),
    ]
    if data.get("model") and model == "inherit":
        warnings.append(
            f"{data['name']}: dropped OMP model pin '{data['model']}' — emitted 'model: inherit'. "
            "Pass --model to pin explicitly."
        )
    if data.get("spawns"):
        warnings.append(
            f"{data['name']}: dropped spawns='{data['spawns']}' — Claude Code has no nested-spawn equivalent; "
            "this agent loses its tier-2 delegation"
        )
    return serialize_frontmatter(fields, body), warnings


def to_cursor(source: str) -> tuple[str, list[str]]:
    data, body = _frontmatter_only(source)
    warnings: list[str] = []
    dropped = [k for k in ("model", "spawns", "read-summarize", "thinkingLevel", "tools") if data.get(k)]
    if dropped:
        warnings.append(
            f"{data['name']}: Cursor rules carry no frontmatter, so {', '.join(dropped)} did not survive; "
            "the rule body is unchanged"
        )
    description = (data.get("description", "") + "\n\n") if data.get("description") else ""
    return description + body.lstrip("\n"), warnings


def to_codex(_source: str) -> tuple[str, list[str]]:
    raise ValueError("Codex takes skills, not task agents; install with --skills-only")


def convert(source: str, runtime: str, options: dict | None = None) -> tuple[str, list[str]]:
    options = options or {}
    if runtime == "omp":
        return source, []
    if runtime == "opencode":
        return to_opencode(source, temperature=options.get("temperature", ""), steps=options.get("steps", ""))
    if runtime == "claude":
        return to_claude(source, model=options.get("model", "inherit"))
    if runtime == "cursor":
        return to_cursor(source)
    if runtime == "codex":
        return to_codex(source)
    raise ValueError(f"unknown runtime '{runtime}' (expected {', '.join(RUNTIMES)})")
