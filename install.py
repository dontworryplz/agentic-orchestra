#!/usr/bin/env python3
"""Install the agentic-orchestra agents and skills into a runtime.

    ./install.py                                # every runtime with a config dir
    ./install.py --runtime omp                  # one runtime
    ./install.py --runtime opencode --project   # project scope
    ./install.py --dry-run                      # print the plan, write nothing
    ./install.py --force                        # overwrite existing files
    ./install.py --show luna-worker --runtime opencode

Idempotent by design: an identical file is skipped, a differing file is
reported and left alone unless --force. The install target is a deployment
destination, not a source — an installer that clobbers local edits is worse
than none.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from convert import RUNTIMES, convert  # noqa: E402

REPO = Path(__file__).resolve().parent
AGENTLESS = {"codex": "no verified task-agent format in Codex; skills only"}


def resolve_paths(runtime: str, project: bool, cwd: Path, home: Path):
    # Legacy single-runtime shim: this script serves the original five targets.
    # Anything else (gemini, copilot, qwen, aider, amp, continue, generic) lives
    # behind installer/wizard.py, which owns the full provider registry.
    if runtime == "claude-code":
        runtime = "claude"
    agent_home = Path(os.environ.get("PI_CODING_AGENT_DIR", home / ".omp" / "agent"))
    if runtime == "omp":
        return (cwd / ".omp" / "agents", cwd / ".omp" / "skills") if project else (agent_home / "agents", home / ".omp" / "skills")
    if runtime == "opencode":
        return (cwd / ".opencode" / "agent", cwd / ".opencode" / "skill") if project else (
            home / ".config" / "opencode" / "agents", home / ".config" / "opencode" / "skills")
    if runtime == "claude":
        return (cwd / ".claude" / "agents", cwd / ".claude" / "skills") if project else (
            home / ".claude" / "agents", home / ".claude" / "skills")
    if runtime == "cursor":
        return (cwd / ".cursor" / "rules", cwd / ".cursor" / "rules") if project else (
            home / ".cursor" / "rules", home / ".cursor" / "rules")
    if runtime == "codex":
        return (None, cwd / ".agents" / "skills") if project else (None, home / ".codex" / "skills")
    raise ValueError(f"unknown runtime '{runtime}'")


def ext_for(runtime: str) -> str:
    return ".mdc" if runtime == "cursor" else ".md"


def list_agents() -> list[Path]:
    return sorted((REPO / "core" / "agents").glob("*.md"))


def list_skills() -> list[str]:
    return sorted(d.name for d in (REPO / "core" / "skills").iterdir() if d.is_dir() and (d / "SKILL.md").exists())


def write_file(dest: Path, content: str, args, counts: dict) -> None:
    if dest.exists() and not args.force:
        if dest.read_text() == content:
            print(f"  = {dest} (identical, skipped)")
            counts["skipped"] += 1
        else:
            print(f"  ! {dest} exists and differs — re-run with --force to overwrite")
            counts["blocked"] += 1
        return
    if args.dry_run:
        print(f"  + {dest} (dry-run)")
        counts["written"] += 1
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content)
    print(f"  + {dest}")
    counts["written"] += 1


def install_one(runtime: str, args, counts: dict, warnings: list) -> None:
    agents_dir, skills_dir = resolve_paths(runtime, args.project, Path.cwd(), Path.home())
    print(f"\n{runtime}")
    print(f"  agents: {agents_dir if agents_dir else '(not supported by this runtime)'}")
    print(f"  skills: {skills_dir}")

    if agents_dir is None:
        print(f"  - agents: not supported ({AGENTLESS.get(runtime, runtime + ' takes no agents')})")
    elif not args.skills_only:
        for src in list_agents():
            try:
                text, warns = convert(src.read_text(), runtime,
                                      {"temperature": args.temperature or "", "steps": args.steps or "",
                                       "model": args.model})
            except ValueError as e:
                print(f"  ! conversion failed for {src.stem}: {e}", file=sys.stderr)
                warnings.append(str(e))
                counts["blocked"] += 1
                continue
            for w in warns:
                print(f"  ! {w}", file=sys.stderr)
                warnings.append(w)
            write_file(agents_dir / (src.stem + ext_for(runtime)), text, args, counts)

    if not args.agents_only:
        for name in list_skills():
            if runtime == "cursor":
                try:
                    text, _ = convert((REPO / "core" / "skills" / name / "SKILL.md").read_text(), "cursor", {})
                except ValueError as e:
                    print(f"  ! conversion failed for skill {name}: {e}", file=sys.stderr)
                    counts["blocked"] += 1
                    continue
                write_file(skills_dir / (name + ext_for(runtime)), text, args, counts)
                continue
            dest = skills_dir / name
            src = REPO / "core" / "skills" / name
            if dest.exists() and not args.force:
                same = sorted(p.name for p in src.iterdir()) == sorted(p.name for p in dest.iterdir()) and all(
                    (src / p.name).read_text() == (dest / p.name).read_text()
                    for p in src.iterdir() if p.is_file())
                if same:
                    print(f"  = {dest} (identical, skipped)")
                    counts["skipped"] += 1
                else:
                    print(f"  ! {dest} exists and differs — re-run with --force to overwrite")
                    counts["blocked"] += 1
                continue
            if args.dry_run:
                print(f"  + {dest}/ (dry-run)")
                counts["written"] += 1
                continue
            skills_dir.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(dest, ignore_errors=True)
            shutil.copytree(src, dest)
            print(f"  + {dest}/")
            counts["written"] += 1


LEGACY_RUNTIMES = ("omp", "opencode", "claude", "claude-code", "cursor", "codex")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="install.py", description="Legacy single-runtime installer. For the full provider set, use installer/wizard.py.")
    ap.add_argument("--runtime", action="append", default=[], choices=[*RUNTIMES, "all"])
    ap.add_argument("--project", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", "-f", action="store_true")
    ap.add_argument("--agents-only", action="store_true")
    ap.add_argument("--skills-only", action="store_true")
    ap.add_argument("--temperature", default="")
    ap.add_argument("--steps", default="")
    ap.add_argument("--model", default="inherit", choices=["inherit", "sonnet", "opus", "haiku"])
    ap.add_argument("--show", default="")
    args = ap.parse_args(argv)

    if args.show:
        src = REPO / "core" / "agents" / f"{args.show}.md"
        if not src.exists():
            print(f"error: no agent named '{args.show}'", file=sys.stderr)
            return 1
        runtime = args.runtime[0] if args.runtime else "opencode"
        text, warns = convert(src.read_text(), runtime,
                              {"temperature": args.temperature, "steps": args.steps, "model": args.model})
        sys.stdout.write(text)
        for w in warns:
            print(f"  ! {w}", file=sys.stderr)
        return 0

    wanted = args.runtime or []
    if "all" in wanted:
        runtimes = list(LEGACY_RUNTIMES)
    elif wanted:
        runtimes = wanted
    else:
        runtimes = [r for r in LEGACY_RUNTIMES
                    if resolve_paths(r, args.project, Path.cwd(), Path.home())[0] is not None
                    and (resolve_paths(r, args.project, Path.cwd(), Path.home())[0].exists()
                         or resolve_paths(r, args.project, Path.cwd(), Path.home())[1].exists())] or ["omp"]

    fresh = [r for r in runtimes if r in LEGACY_RUNTIMES]
    redirected = [r for r in runtimes if r not in LEGACY_RUNTIMES]
    for r in redirected:
        print(f"  - {r}: not served by install.py — use installer/wizard.py --target {r}", file=sys.stderr)
    if not fresh:
        if redirected:
            print("nothing installed. The universal wizard covers every provider: installer/wizard.py", file=sys.stderr)
            return 2
        runtimes = ["omp"]
    else:
        runtimes = fresh

    print(f"agentic-orchestra installer\n  repo:   {REPO}\n  scope:  {'project' if args.project else 'user'}")
    print(f"  target: {', '.join(runtimes)}")
    if args.dry_run:
        print("  mode:   dry-run (no writes)")
    if args.force:
        print("  mode:   force (overwrite existing)")

    counts = {"written": 0, "skipped": 0, "blocked": 0}
    warnings: list = []
    for runtime in runtimes:
        install_one(runtime, args, counts, warnings)

    print(f"\ntotal: {counts['written']} written, {counts['skipped']} unchanged, {counts['blocked']} left alone")
    if warnings:
        print(f"{len(warnings)} conversion warning(s) on stderr — nothing was invented to fill those gaps.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
