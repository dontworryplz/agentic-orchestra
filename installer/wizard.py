#!/usr/bin/env python3
"""Interactive installer wizard: pick any number of AI tools, pick a scope,
pick components, preview, install.

    ./installer/wizard.py
    ./installer/wizard.py --yes --target codex --scope global
    ./installer/wizard.py --dry-run
    ./installer/wizard.py --target omp --target claude --scope both --yes

Detection marks tools; it never installs anything. Selection is always
explicit, and multi-select is the point: this is not "choose OMP or OpenCode",
it is "choose any number of AI tools".
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from adapters import all_providers, detect, get_provider, install_provider  # noqa: E402

COMPONENTS = [
    ("agents", "Agent definitions (roles that delegate and report)"),
    ("skills", "Skill procedures (numbered steps an agent follows)"),
    ("sast", "Security/SAST skill (llm-sast-scanner + security-reviewer routing)"),
    ("commands", "Slash commands"),
    ("rules", "Rules / instruction files (AGENTS.md, GEMINI.md, .mdc)"),
    ("mcp", "MCP server configuration"),
    ("hooks", "Hooks"),
]


def prompt(text: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        answer = input(f"{text}{suffix}: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        sys.exit(1)
    return answer or default


def multiselect(options: list[tuple[str, str, bool]]) -> list[str]:
    """options: (id, label, preselected). Returns selected ids."""
    print()
    for i, (pid, label, pre) in enumerate(options, 1):
        mark = "x" if pre else " "
        print(f"  {i:>2}) [{mark}] {label}")
    print("  Enter numbers (1,3,5), ranges (1-4), 'all', or nothing to keep marks.")
    raw = prompt("Select", "")
    if not raw:
        return [pid for pid, _, pre in options if pre]
    if raw.lower() == "all":
        return [pid for pid, _, _ in options]
    picked: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            try:
                picked.update(range(int(a), int(b) + 1))
            except ValueError:
                pass
        else:
            try:
                picked.add(int(part))
            except ValueError:
                pass
    ids = [pid for i, (pid, _, _) in enumerate(options, 1) if i in picked]
    if not ids:
        print("nothing selected.")
        sys.exit(1)
    return ids


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="wizard.py", description="Install the agent toolkit into your AI tools.")
    ap.add_argument("--target", action="append", default=[], help="provider id, repeatable")
    ap.add_argument("--scope", default="", choices=["", "project", "global", "both"])
    ap.add_argument("--components", default="", help="comma list: agents,skills,sast,commands,rules,mcp,hooks")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--yes", "-y", action="store_true", help="skip all prompts")
    ap.add_argument("--force", "-f", action="store_true")
    ap.add_argument("--add-provider", action="store_true", help="define a new AI tool and persist it")
    ap.add_argument("--temperature", default="")
    ap.add_argument("--steps", default="")
    ap.add_argument("--model", default="inherit")
    args = ap.parse_args(argv)

    cwd, home = Path.cwd(), Path.home()
    if args.add_provider:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from custom import add_provider_interactive
        add_provider_interactive(home)
        return 0
    print("AI Agent Toolkit Setup\n")

    detected = detect(home)
    print("Detected (detection only marks — nothing is installed yet):")
    for p, found in detected:
        print(f"  {'[x]' if found else '[ ]'} {p['displayName']:<22} {'detected' if found else ''}")
    print()

    # --- step 1: tools ---
    if args.target:
        selected = []
        for pid in args.target:
            try:
                selected.append(get_provider(pid)["id"])
            except ValueError as e:
                print(f"error: {e}", file=sys.stderr)
                return 1
    elif args.yes:
        selected = [p["id"] for p, found in detected if found] or ["omp"]
    else:
        print("Select AI coding tools to configure (any number):")
        selected = multiselect([(p["id"], f"{p['displayName']:<22} {'detected' if found else ''}", found)
                                for p, found in detected])
    print(f"\nSelected: {', '.join(selected)}\n")

    # --- step 2: scope, asked once for every selected tool ---
    # Asking per tool turns three selections into three identical questions.
    # The scope must be supported by all of them, which is checked up front.
    common = set.intersection(*[set(get_provider(pid)["scopes"]) for pid in selected])
    if not common:
        print("error: the selected tools share no installation scope", file=sys.stderr)
        return 1
    if args.scope:
        if args.scope not in common:
            print(f"error: scope '{args.scope}' is not supported by every selected tool", file=sys.stderr)
            return 1
        scope = args.scope
    elif args.yes:
        scope = "global" if "global" in common else sorted(common)[0]
    else:
        print("Where should the toolkit be installed?")
        ordered = ["project", "global", "both"]
        offered = [s for s in ordered if s in common]
        for i, s in enumerate(offered, 1):
            print(f"  {i}) {s}")
        choice = prompt("Scope", "1")
        try:
            scope = offered[int(choice) - 1]
        except (ValueError, IndexError):
            print("error: invalid scope", file=sys.stderr)
            return 1
    scopes: dict[str, str] = {pid: scope for pid in selected}

    # --- step 3: components, defaulted by capability ---
    defaults: set[str] = set()
    for pid in selected:
        caps = get_provider(pid)["capabilities"]
        if caps.get("agents") or get_provider(pid)["agents"]["support"] in ("native", "rules-wrapper"):
            defaults.add("agents")
        if caps.get("skills"):
            defaults.add("skills")
    defaults.add("sast")
    if args.components:
        components = set(args.components.split(","))
    elif args.yes:
        components = set(defaults)
    else:
        print("\nWhat should be installed (defaults follow each tool's capabilities):")
        picked = multiselect([(c, f"{c:<10} {label}", c in defaults) for c, label in COMPONENTS])
        components = set(picked)
    unsupported = [c for c in components if c in ("commands", "mcp", "hooks")]
    if unsupported:
        print(f"\nNote: this package ships no {', '.join(unsupported)} content — "
              "that selection installs nothing. It is listed so the choice is explicit.")
        components = {c for c in components if c not in ("commands", "mcp", "hooks")}
    print(f"\nComponents: {', '.join(sorted(components)) or '(none)'}\n")

    # --- step 4: preview + confirm ---
    options = {"temperature": args.temperature, "steps": args.steps, "model": args.model}
    print("Plan:")
    for pid in selected:
        print(f"  {pid}  scope={scopes[pid]}  components={','.join(sorted(components))}")
    print()
    if args.dry_run:
        print("(dry-run: showing what would happen)\n")
    if not args.yes and not args.dry_run:
        if prompt("Proceed?", "y").lower() not in ("y", "yes", ""):
            print("aborted.")
            return 1

    totals = {"written": 0, "skipped": 0, "blocked": 0}
    all_warnings: list[str] = []
    for pid in selected:
        provider = get_provider(pid)
        print(f"\n{provider['displayName']}  ({scopes[pid]})")
        res = install_provider(pid, scope=scopes[pid], components=components, options=options,
                               cwd=cwd, home=home, dry_run=args.dry_run, force=args.force)
        for k in totals:
            totals[k] += res["counts"][k]
        all_warnings.extend(res["warnings"])

    # --- summary matrix ---
    print("\nDone.\n")
    print(f"  {'Tool':<22}{'Scope':<10}{'Written':<9}{'Unchanged':<11}Left alone")
    for pid in selected:
        print(f"  {get_provider(pid)['displayName']:<22}{scopes[pid]:<10}{totals['written']:<9}{totals['skipped']:<11}{totals['blocked']}")
    if all_warnings:
        print("\nWarnings (nothing was invented to fill these gaps):")
        for w in sorted(set(all_warnings))[:15]:
            print(f"  ! {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
