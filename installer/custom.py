"""User-defined providers, persisted outside the repository.

Adding a CLI that is not in registry/providers.json must not require editing
this repository. `wizard.py --add-provider` asks the questions once and stores
the answer in ~/.config/agentic-orchestra/adapters.json, which the wizard and
the registry read on every run.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def config_path(home: Path | None = None) -> Path:
    home = home or Path.home()
    return home / ".config" / "agentic-orchestra" / "adapters.json"


def load_custom(home: Path | None = None) -> list[dict]:
    path = config_path(home)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return data.get("providers", [])


def save_provider(entry: dict, home: Path | None = None) -> Path:
    path = config_path(home)
    existing = load_custom(home)
    existing = [p for p in existing if p.get("id") != entry["id"]]
    existing.append(entry)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"providers": existing}, indent=2) + "\n")
    return path


def prompt(text: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        answer = input(f"{text}{suffix}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        sys.exit(1)
    return answer or default


def yes_no(text: str, default: bool = True) -> bool:
    answer = prompt(f"{text} (yes/no)", "yes" if default else "no").lower()
    return answer in ("y", "yes", "") if default else answer in ("y", "yes")


def add_provider_interactive(home: Path | None = None) -> dict:
    """Ask the questions from the spec and persist the answers."""
    print("\nAdd another AI tool\n")
    name = prompt("Name", "")
    if not name:
        print("error: a name is required", file=sys.stderr)
        sys.exit(1)
    pid = "".join(c.lower() if c.isalnum() else "-" for c in name).strip("-")
    while "--" in pid:
        pid = pid.replace("--", "-")

    binary = prompt("Binary (empty if none)", "")
    project_dir = prompt("Project config directory", ".agents")
    global_dir = prompt("Global config directory (empty if project-only)", "")
    supports_skills = yes_no("Supports Agent Skills?", True)
    supports_instructions = yes_no("Supports AGENTS.md / instructions?", True)
    custom_path = prompt("Custom output path (empty for the defaults above)", "")

    scopes = ["project"] + (["global"] if global_dir else [])
    entry = {
        "id": pid,
        "displayName": name,
        "binaries": [binary] if binary else [],
        "configDirs": [],
        "skills": {"project": f"{project_dir}/skills", "global": f"{global_dir}/skills" if global_dir else None},
        "agents": {
            "support": "rules-wrapper",
            "format": "agents-md",
            "reason": "user-defined provider: AGENTS.md section plus skills copy, the portable subset",
        },
        "scopes": scopes,
        "capabilities": {
            "skills": supports_skills,
            "agents": False,
            "subagents": False,
            "commands": False,
            "rules": False,
            "instructions": supports_instructions,
            "mcp": False,
            "hooks": False,
        },
        "customOutputPath": custom_path or None,
        "source": "user",
    }
    if not supports_skills:
        entry["skills"] = {"project": None, "global": None}
    path = save_provider(entry, home)
    print(f"\nsaved to {path}")
    print("It will appear in the wizard's tool list on the next run. No source changes needed.")
    return entry
