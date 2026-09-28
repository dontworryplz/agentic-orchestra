#!/usr/bin/env python3
"""Remove what the agentic-orchestra installers added.

    ./uninstall.py --runtime omp
    ./uninstall.py --runtime opencode --dry-run
    ./uninstall.py --runtime cursor --force

A file is removed ONLY if its current content still matches what the installer
would write. An edited file is reported and left in place — a tool that silently
deletes local work is worse than no tool. --force overrides that.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from convert import convert  # noqa: E402
from install import AGENTLESS, ext_for, list_agents, list_skills, resolve_paths  # noqa: E402

REPO = Path(__file__).resolve().parent


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="uninstall.py", description="Remove installed agentic-orchestra files.")
    ap.add_argument("--runtime", required=True, choices=["omp", "opencode", "claude", "cursor", "codex"])
    ap.add_argument("--project", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", "-f", action="store_true")
    ap.add_argument("--temperature", default="")
    ap.add_argument("--steps", default="")
    ap.add_argument("--model", default="inherit")
    args = ap.parse_args(argv)

    agents_dir, skills_dir = resolve_paths(args.runtime, args.project, Path.cwd(), Path.home())
    print(f"agentic-orchestra uninstaller\n  runtime: {args.runtime}\n  agents:  {agents_dir}\n  skills:  {skills_dir}")
    if args.dry_run:
        print("  mode:    dry-run (nothing removed)")
    if args.force:
        print("  mode:    force (removes modified files too)")
    print()

    removed = kept = absent = 0

    def remove_file(installed: Path, expected: str) -> None:
        nonlocal removed, kept, absent
        if not installed.exists():
            print(f"  - {installed} (absent)")
            absent += 1
            return
        if not args.force and installed.read_text() != expected:
            print(f"  ! {installed} modified since install — left in place (use --force to remove)")
            kept += 1
            return
        if args.dry_run:
            print(f"  x {installed} (dry-run)")
        else:
            installed.unlink()
            print(f"  x {installed}")
        removed += 1

    print("agents")
    if agents_dir is None:
        print(f"  - not supported ({AGENTLESS.get(args.runtime, '')})")
    else:
        for src in list_agents():
            try:
                expected, _ = convert(src.read_text(), args.runtime,
                                      {"temperature": args.temperature, "steps": args.steps, "model": args.model})
            except ValueError:
                expected = src.read_text() if args.runtime == "omp" else ""
            remove_file(agents_dir / (src.stem + ext_for(args.runtime)), expected)

    print("\nskills")
    for name in list_skills():
        if args.runtime == "cursor":
            rule = skills_dir / (name + ".mdc")
            src = REPO / "skills" / name / "SKILL.md"
            expected, _ = convert(src.read_text(), "cursor", {})
            remove_file(rule, expected)
            continue
        dest = skills_dir / name
        src = REPO / "skills" / name
        if not dest.exists():
            print(f"  - {dest} (absent)")
            absent += 1
            continue
        same = sorted(p.name for p in src.iterdir()) == sorted(p.name for p in dest.iterdir()) and all(
            (src / p.name).read_text() == (dest / p.name).read_text()
            for p in src.iterdir() if p.is_file())
        if not args.force and not same:
            print(f"  ! {dest} modified since install — left in place (use --force to remove)")
            kept += 1
            continue
        if args.dry_run:
            print(f"  x {dest}/ (dry-run)")
        else:
            shutil.rmtree(dest)
            print(f"  x {dest}/")
        removed += 1

    print(f"\nremoved={removed}  kept(modified)={kept}  absent={absent}")
    if kept:
        print("kept files still reference this orchestra; review them before deleting.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
