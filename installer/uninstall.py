#!/usr/bin/env python3
"""Remove what the wizard installed, without touching anything else.

    ./installer/uninstall.py --target gemini --scope global
    ./installer/uninstall.py --target omp --target codex --scope both --dry-run
    ./installer/uninstall.py --yes --scope global   # every detected provider

Agent and skill files are removed only when they still match what the
installer would write (or with --force). The rules-file marker block is
removed while everything outside the markers is preserved byte-for-byte.
Foreign files are never removal candidates.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from adapters import detect, get_provider, uninstall_provider  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="uninstall.py", description="Remove toolkit files the wizard installed.")
    ap.add_argument("--target", action="append", default=[], help="provider id, repeatable")
    ap.add_argument("--scope", default="global", choices=["project", "global", "both"])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", "-f", action="store_true")
    ap.add_argument("--yes", "-y", action="store_true", help="skip confirmation")
    args = ap.parse_args(argv)

    cwd, home = Path.cwd(), Path.home()
    if args.target:
        try:
            selected = [get_provider(pid, home)["id"] for pid in args.target]
        except ValueError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
    else:
        selected = [p["id"] for p, found in detect(home) if found]
        if not selected:
            print("nothing detected. Pass --target explicitly.")
            return 1

    print(f"agentic-orchestra uninstaller{' (dry-run)' if args.dry_run else ''}")
    print(f"  target: {', '.join(selected)}\n  scope:  {args.scope}")
    if not args.yes and not args.dry_run:
        try:
            answer = input("Remove the toolkit files listed below? [y/N]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\naborted.")
            return 1
        if answer not in ("y", "yes"):
            print("aborted.")
            return 1

    totals = {"removed": 0, "kept": 0, "skipped": 0}
    for pid in selected:
        print(f"\n{get_provider(pid, home)['displayName']}  ({args.scope})")
        res = uninstall_provider(pid, scope=args.scope, cwd=cwd, home=home,
                                 dry_run=args.dry_run, force=args.force)
        for k in totals:
            totals[k] += res["counts"][k]

    print(f"\ntotal: {totals['removed']} removed, "
          f"{totals['kept']} kept(modified), {totals['skipped']} absent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
