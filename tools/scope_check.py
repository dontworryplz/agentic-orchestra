#!/usr/bin/env python3
"""Enforce an executor's file ownership against the working tree, for skill://executor.

An executor may write only to the files and symbols its assignment names.
This script makes "every line must trace to the acceptance criterion" mechanical.

Exit status is 0 when every changed file is inside the list, 1 otherwise, with
the offending paths named. There is no --force and no override flag. If a line
outside the list is genuinely needed, the assignment — not this check — is what
changes.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True)


def die(message: str) -> int:
    print(f"error: {message}", file=sys.stderr)
    return 1


def norm(path: str) -> str:
    path = path[2:] if path.startswith("./") else path
    return path.rstrip("/")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="scope_check.py", description="Enforce executor file ownership.")
    ap.add_argument("--files", required=True, help="comma-separated whitelist from the assignment")
    ap.add_argument("--staged", action="store_true")
    ap.add_argument("--base", default="")
    args = ap.parse_args(argv)

    if git("rev-parse", "--git-dir").returncode != 0:
        return die("not inside a git repository")

    allowed = {norm(f) for f in args.files.split(",") if f.strip()}
    if not allowed:
        return die("--files is required: the comma-separated whitelist from the assignment")

    if args.base:
        if git("rev-parse", "--verify", args.base).returncode != 0:
            return die(f"no such ref: {args.base}")
        out = git("diff", "--name-only", f"{args.base}...HEAD").stdout
        out += git("diff", "--name-only").stdout + git("diff", "--cached", "--name-only").stdout
    elif args.staged:
        out = git("diff", "--cached", "--name-only").stdout
    else:
        out = git("diff", "--name-only").stdout + git("diff", "--cached", "--name-only").stdout

    seen: list[str] = []
    for line in out.splitlines():
        line = line.strip()
        if line and line not in seen:
            seen.append(line)

    if not seen:
        print("scope: clean — no changed files, nothing to check")
        return 0

    bad = [f for f in seen if norm(f) not in allowed]
    if not bad:
        print(f"scope: ok — {len(seen)} changed file(s), all inside the assignment")
        return 0

    for f in bad:
        print(f"OUT OF SCOPE: {f}")
    print("\nThe files above are not in the assignment. Revert them, or stop and ask\n"
          "for the assignment to change. Widening the whitelist after the fact turns\n"
          "this check into decoration.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
