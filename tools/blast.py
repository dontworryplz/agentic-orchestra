#!/usr/bin/env python3
"""Enumerate the blast radius of a symbol before editing it, for skill://refactor-safely.

Two independent methods — a plain text search and a word-boundary search —
because a rename that survives one method and dies on the other is the common
way a "no references found" claim turns out to be wrong.

Exit status is always 0. Zero hits means "nothing found by either method",
which is a datum to check, not a licence to delete.

If a graft/ index or the graft CLI exists, the first line says so and defers
to it — a precomputed edge is better than a text search.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path


def git(*args: str, cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True, cwd=cwd)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="blast.py", description="Enumerate a symbol's blast radius.")
    ap.add_argument("symbol")
    ap.add_argument("--in", dest="scope", default="")
    ap.add_argument("--fixed", action="store_true")
    args = ap.parse_args(argv)

    top = git("rev-parse", "--show-toplevel")
    if top.returncode != 0:
        print("error: not inside a git repository", file=sys.stderr)
        return 1
    root = Path(top.stdout.strip())
    if args.scope:
        root = root / args.scope
        if not root.is_dir():
            print(f"error: no such directory: {root}", file=sys.stderr)
            return 1

    if Path("graft").is_dir() or shutil.which("graft"):
        print(f"# a graft index or CLI is present: prefer `graft callers {args.symbol} --depth all`.")
        print("# What follows is the text-search corroboration, not the answer.\n")

    m1 = git("grep", "-n", "--no-color", "-e", args.symbol, "--", ".", cwd=root)
    hits1 = [l for l in m1.stdout.splitlines() if l.strip()]
    if args.fixed:
        m2 = git("grep", "-n", "--no-color", "-F", "-e", args.symbol, "--", ".", cwd=root)
    else:
        m2 = git("grep", "-n", "--no-color", "-w", "-e", args.symbol, "--", ".", cwd=root)
    hits2 = [l for l in m2.stdout.splitlines() if l.strip()]

    if not hits1:
        print(f'no hits for "{args.symbol}" by either method.')
        print("That is a search result, not a finding. Corroborate before deleting.")
        return 0

    print(f'hits for "{args.symbol}", grouped by file (method1/method2 counts):\n')
    files1 = Counter(h.split(":", 1)[0] for h in hits1)
    files2 = Counter(h.split(":", 1)[0] for h in hits2)
    for path, n in files1.most_common():
        print(f"  {n}  {path}  (substring {n}, word-boundary {files2.get(path, 0)})")

    print(f"\ncorroboration: ", end="")
    if len(hits1) == len(hits2):
        print(f"both methods agree on {len(hits1)} hit(s).")
    else:
        print(f"method 1 found {len(hits1)}, method 2 found {len(hits2)}. The difference is occurrences\n"
              "inside longer identifiers — read each one before counting it.")

    decl = re.compile(r"(func|function|class|def |fn |const .*=|let .*=|var .*=|type |interface |struct )", re.I)
    defs = [h for h in hits1 if decl.search(h.split(":", 2)[-1])]
    if defs:
        print("\ncandidate definitions:")
        print("\n".join(defs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
