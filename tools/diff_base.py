#!/usr/bin/env python3
"""Print the exact review base for the current working tree, for skill://review-changes.

A review of the wrong bytes is worse than no review. This script establishes
which bytes are under review and emits the commands to read them, so the
reviewer does not have to decide that — or get it wrong.

Exit status is 0 when exactly one base is established, 1 when the tree is in a
mixed state that cannot be reviewed as one unit, or when there is nothing to
review. The mixed-state refusal is the point.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def git(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], capture_output=True, text=True, cwd=cwd or Path.cwd())


def die(message: str) -> int:
    print(f"error: {message}", file=sys.stderr)
    return 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="diff_base.py", description="Establish the review base.")
    ap.add_argument("--staged", action="store_true")
    ap.add_argument("--worktree", action="store_true")
    ap.add_argument("--branch", default="", metavar="BASE")
    ap.add_argument("--sha", default="")
    args = ap.parse_args(argv)

    if git("rev-parse", "--git-dir").returncode != 0:
        return die("not inside a git repository")

    staged = len(git("diff", "--cached", "--name-only").stdout.split())
    unstaged = len(git("diff", "--name-only").stdout.split())
    untracked = len(git("ls-files", "--others", "--exclude-standard").stdout.split())

    def report(base: str, commands: str) -> int:
        print(f"base: {base}\nreview with:\n{commands}")
        return 0

    if args.staged or (not args.branch and not args.sha and not args.worktree and staged and not unstaged and not untracked):
        if staged == 0:
            return die("staged index is empty; nothing to review. Stage first, or review the worktree instead.")
        if unstaged > 0:
            print(f"warning: {unstaged} unstaged file(s) also differ. The staged bytes are what will ship;\n"
                  "review them only with `git show :path`, never the on-disk file.\n")
        return report("staged index", "  git diff --cached\n  git show :<path>   # the staged blob, not the worktree file")

    if args.sha:
        if git("cat-file", "-e", args.sha).returncode != 0:
            return die(f"no such commit: {args.sha}")
        if git("diff", "--cached", "--quiet").returncode == 0 and git("diff", "--quiet").returncode == 0:
            return report(f"commit {args.sha}", f"  git show {args.sha}")
        print("warning: the tree is dirty. The commit under review is clean, but do\n"
              "not confuse working-tree content with the committed bytes.\n")
        return report(f"commit {args.sha}", f"  git show {args.sha}")

    if args.branch:
        base = git("merge-base", "HEAD", args.branch)
        if base.returncode != 0:
            return die(f"no merge base with {args.branch}")
        return report(f"merge base {base.stdout.strip()} (HEAD vs {args.branch})",
                      f"  git diff {base.stdout.strip()}...HEAD")

    parts = sum([staged > 0, unstaged > 0, untracked > 0])
    if parts == 0:
        return die("tree is clean; nothing to review.")
    if parts > 1:
        print(f"error: mixed state — {staged} staged, {unstaged} unstaged, {untracked} untracked file(s).\n"
              "Review each set separately: --staged for the index, or stage and commit\n"
              "first and review the branch. A mixed review produces confident findings\n"
              "about code that will never ship.")
        return 1
    if unstaged:
        return report("unstaged worktree", "  git diff")
    return report("untracked files (list only; untracked content has no base)",
                  "  git ls-files --others --exclude-standard")


if __name__ == "__main__":
    sys.exit(main())
