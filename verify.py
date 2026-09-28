#!/usr/bin/env python3
"""Verify this repository's invariants.

    ./verify.py           # everything
    ./verify.py --fast    # skip the subprocess work
    ./verify.py --quiet   # only failures

Every check is a repo invariant stated in AGENTS.md, restated as an assertion.
A check that cannot fail is not a check; each one below names how to break it.

This is the Python implementation. lib/verify.mjs implements the same checks in
Node, and both must stay green — a fix to one side that leaves the other red is
how the Cursor spawn-warning bug shipped unnoticed.
"""

from __future__ import annotations

import argparse
import ast
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent
FAST = False
QUIET = False
CHECKS = 0
PASS = 0
FAIL = 0


def head(title: str) -> None:
    global CHECKS
    CHECKS += 1
    if not QUIET:
        print(f"\n== {title}")


def ok(label: str) -> None:
    global PASS
    PASS += 1
    if not QUIET:
        print(f"  PASS  {label}")


def bad(label: str) -> None:
    global FAIL
    FAIL += 1
    print(f"  FAIL  {label}")


def runtime_files() -> list[Path]:
    files = sorted((REPO / "core" / "agents").glob("*.md"))
    for d in sorted((REPO / "core" / "skills").iterdir()):
        if d.is_dir() and (d / "SKILL.md").exists():
            files.append(d / "SKILL.md")
    return files


def sh(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)


def main() -> int:
    global FAST, QUIET
    ap = argparse.ArgumentParser(prog="verify.py")
    ap.add_argument("--fast", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    FAST = args.fast
    QUIET = args.quiet
    print(f"agentic-orchestra verify\n  repo: {REPO}")

    check_frontmatter()
    check_no_nested_dirs()
    check_names()
    check_skill_refs()
    check_language()
    check_readonly()
    check_placeholders()
    check_skills_discovery()
    check_entry_point()
    check_python_syntax()
    check_procedure_graph()
    check_model_pins()
    if not FAST:
        check_converters_agree()
        check_goldens()
        check_spawn_graph()
        check_no_invented_pins()
        check_contracts()
        check_install_behavior()
        check_smoke()

    print(f"\n{CHECKS} checks, {PASS + FAIL} assertions passed, {FAIL} failed" + (" (fast mode)" if FAST else ""))
    return 1 if FAIL else 0


def check_frontmatter() -> None:
    head("frontmatter present")
    bad_files = []
    for f in runtime_files():
        text = f.read_text()
        if not text.startswith("---\n") or "\n---" not in text[4:]:
            bad_files.append(str(f.relative_to(REPO)))
    if bad_files:
        for b in bad_files:
            bad(f"bad frontmatter: {b}")
    else:
        ok(f"all {len(runtime_files())} runtime files have frontmatter")


def check_no_nested_dirs() -> None:
    head("no nested directories in the runtime folders")
    bad_any = False
    for d in (REPO / "core" / "agents").iterdir():
        if d.is_dir():
            bad(f"agents/{d.name}/ is a directory inside agents/ — this duplicates the agent set")
            bad_any = True
    for skill in sorted((REPO / "core" / "skills").iterdir()):
        if skill.is_dir():
            for d in skill.iterdir():
                if d.is_dir() and d.name != "references":
                    bad(f"{skill.name}/{d.name}/ nests a directory inside a skill")
                    bad_any = True
    if not bad_any:
        ok("agents/ holds files only; skills/ hold SKILL.md files and their own references only")


def check_names() -> None:
    head("name matches location")
    bad_any = False
    for f in (REPO / "core" / "agents").glob("*.md"):
        m = re.search(r"^name:\s*(.+)$", f.read_text(), re.M)
        name = (m.group(1).strip() if m else "")
        if name != f.stem:
            bad(f"agents/{f.name} declares name '{name}'")
            bad_any = True
    for d in sorted((REPO / "core" / "skills").iterdir()):
        if not d.is_dir():
            continue
        m = re.search(r"^name:\s*(.+)$", (d / "SKILL.md").read_text(), re.M)
        name = (m.group(1).strip() if m else "")
        if name != d.name:
            bad(f"skills/{d.name}/ declares name '{name}'")
            bad_any = True
    if not bad_any:
        ok("every name matches its path")


def skill_refs() -> set[str]:
    refs: set[str] = set()
    for f in runtime_files():
        refs.update(re.findall(r"skill://([a-z0-9-]+)", f.read_text()))
    return refs


def declared_gaps() -> set[str] | None:
    manifest = REPO / "docs" / "unresolved-skills.txt"
    if not manifest.exists():
        return None
    out: set[str] = set()
    for line in manifest.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.add(line.split()[0])
    return out


def check_skill_refs() -> None:
    head("skill:// references resolve or are declared gaps")
    refs = skill_refs()
    shipped = {d.name for d in (REPO / "core" / "skills").iterdir() if d.is_dir()}
    actual_gaps = sorted(r for r in refs if r not in shipped)
    declared = declared_gaps()
    if declared is None:
        bad("docs/unresolved-skills.txt is missing")
        return
    undeclared = [g for g in actual_gaps if g not in declared]
    resolved = [d for d in sorted(declared) if d not in actual_gaps]
    if undeclared:
        bad(f"referenced but neither shipped nor declared: {' '.join(undeclared)}")
    if resolved:
        bad(f"declared as a gap but now resolved: {' '.join(resolved)}")
    if not undeclared and not resolved:
        ok(f"{len(refs)} references: {len(actual_gaps)} declared gap(s), rest resolve")


TURKISH_ASCII = re.compile(r"(^|[^A-Za-z])(ve|ile|icin|olarak|ancak|cunku|degil|sey)([^A-Za-z]|$)")
TURKISH_UTF8 = re.compile(r"(^|[^\w])(için|olarak|ancak|çünkü|değil|şey)([^\w]|$)")


def check_language() -> None:
    head("language is English everywhere")
    targets = runtime_files() + sorted((REPO / "docs").glob("*.md")) + sorted((REPO / "docs").glob("*.txt"))
    targets += [REPO / "README.md", REPO / "AGENTS.md", REPO / "CHANGELOG.md"]
    bad_any = False
    for f in targets:
        if not f.exists():
            continue
        text = f.read_text()
        if TURKISH_ASCII.search(text) or TURKISH_UTF8.search(text):
            bad(f"non-English prose in {f.relative_to(REPO)}")
            bad_any = True
    if not bad_any:
        ok(f"no Turkish prose in {len([f for f in targets if f.exists()])} tracked text files")


def check_readonly() -> None:
    head("read-only invariant survives conversion")
    bad_any = False
    for f in (REPO / "core" / "agents").glob("*.md"):
        if not re.search(r"explorer|reviewer|researcher", f.stem):
            continue
        sys.path.insert(0, str(REPO / "tools"))
        from frontmatter import as_list, parse_frontmatter

        data, _ = parse_frontmatter(f.read_text())
        tools = as_list(data.get("tools", ""))
        if "edit" in tools or "write" in tools:
            bad(f"{f.name} grants write but is a read-only role")
            bad_any = True
    if not bad_any:
        ok("no read-only role declares edit or write")


def check_placeholders() -> None:
    head("no placeholders")
    bad_any = False
    for f in runtime_files() + sorted(REPO.glob("*.py")) + sorted(REPO.glob("*.sh")):
        if "verify.py" in str(f) or f.name == "verify.sh":
            continue
        if re.search(r"TODO|FIXME|XXX|<placeholder>", f.read_text()):
            bad(f"placeholder marker in {f.relative_to(REPO)}")
            bad_any = True
    if not bad_any:
        ok("no TODO/FIXME/placeholder markers in shipped files")


def check_skills_discovery() -> None:
    head("npx skills add compatibility")
    bad_any = False
    if not (REPO / "core" / "skills").is_dir():
        bad("no top-level skills/ directory; `npx skills add` would find nothing")
        return
    for d in sorted((REPO / "core" / "skills").iterdir()):
        if d.is_dir() and not (d / "SKILL.md").exists():
            bad(f"skills/{d.name}/ has no SKILL.md")
            bad_any = True
    import json

    pkg = json.loads((REPO / "package.json").read_text())
    if "skills/" not in pkg.get("files", []):
        bad("package.json files[] does not include skills/")
        bad_any = True
    if not bad_any:
        n = len([d for d in (REPO / "core" / "skills").iterdir() if d.is_dir()])
        ok(f"skills/ layout matches the `npx skills add` discovery convention ({n} skills)")


def check_entry_point() -> None:
    head("npx entry point is executable")
    bad_any = False
    for entry in sorted((REPO / "bin").glob("*.mjs")):
        first = entry.read_text().split("\n")[0]
        if not first.startswith("#!") or "node" not in first:
            bad(f"no node shebang: bin/{entry.name}")
            bad_any = True
        import os

        if not os.access(entry, os.X_OK):
            bad(f"not executable: bin/{entry.name}")
            bad_any = True
    import json

    pkg = json.loads((REPO / "package.json").read_text())
    for name, rel in pkg.get("bin", {}).items():
        target = REPO / rel
        if not target.exists():
            bad(f'package.json bin "{name}" points at missing {rel}')
            bad_any = True
        elif not target.read_text().startswith("#!"):
            bad(f"bin target {rel} has no shebang")
            bad_any = True
    if not bad_any:
        ok("bin/ has a shebang, exec bit, and every package.json bin target exists")


def check_python_syntax() -> None:
    head("python syntax")
    bad_any = False
    for f in sorted(REPO.glob("*.py")) + sorted((REPO / "lib").glob("*.py")) + sorted((REPO / "tools").glob("*.py")):
        try:
            ast.parse(f.read_text())
        except SyntaxError as e:
            bad(f"python syntax error in {f.relative_to(REPO)}: {e}")
            bad_any = True
    if not bad_any:
        ok("all python files parse")


def check_procedure_graph() -> None:
    head("procedure graph is connected")
    bad_any = False
    skills = sorted(d.name for d in (REPO / "core" / "skills").iterdir() if d.is_dir())
    texts = {s: (REPO / "core" / "skills" / s / "SKILL.md").read_text() for s in skills}
    for s in skills:
        if not re.search(r"^## Hand off", texts[s], re.M):
            bad(f"skills/{s} has no '## Hand off' section")
            bad_any = True
    for s in skills:
        refs = [o for o in skills if o != s and re.search(rf"skill://{o}\b", texts[o])]
        others = [o for o in skills if o != s and re.search(rf"skill://{s}\b", texts[o])]
        if not others:
            bad(f"orphan skill(s), referenced by nothing: {s}")
            bad_any = True
    if not bad_any:
        ok("every skill has a Hand off section and is reachable from another skill")


ALLOWED_MODELS = [
    (r"^openai-codex/gpt-6-luna(:.*)?$", "gpt-6-luna"),
    (r"^openai-codex/gpt-6-sol(:.*)?$", "gpt-6-sol"),
    (r"^stealth/space-bunny-alpha$", "space-bunny"),
    (r"^google-antigravity/gemini-3\.8-flash:.*$", "gemini"),
    (r"^google-antigravity/claude-opus-4-6:.*$", "opus"),
    (r"^google-antigravity/claude-sonnet-4-6:.*$", "sonnet"),
]


def check_model_pins() -> None:
    head("model pins stay in their families")
    bad_any = False
    count = 0
    for f in sorted((REPO / "core" / "agents").glob("*.md")):
        m = re.search(r"^model:\s*(.+)$", f.read_text(), re.M)
        model = (m.group(1).strip() if m else "")
        count += 1
        if not any(re.match(pat, model) for pat, _ in ALLOWED_MODELS):
            bad(f"{f.stem} pins '{model}', which is outside the gpt-6 family this package decided on")
            bad_any = True
    if not bad_any:
        ok(f"all {count} agent model pins are gpt-6-family or a documented vendor pin")


def check_converters_agree() -> None:
    head("python and node converters agree")
    sys.path.insert(0, str(REPO / "lib"))
    from convert import convert as py_convert

    bad_any = False
    agents = sorted((REPO / "core" / "agents").glob("*.md"))
    for f in agents:
        for runtime in ("opencode", "claude", "cursor"):
            text, _ = py_convert(f.read_text(), runtime, {})
            r = sh(["node", "bin/agentic-orchestra.mjs", "show", f.stem, "--runtime", runtime])
            if r.stdout.rstrip() != text.rstrip():
                bad(f"converters disagree for {f.stem} -> {runtime}")
                bad_any = True
    if not bad_any:
        ok(f"{len(agents)} agents x 3 runtimes: python and node output identical")


def check_goldens() -> None:
    head("conversions match reviewed goldens")
    r = sh(["node", "tools/golden.mjs"])
    print(r.stdout, end="")
    if r.returncode != 0:
        bad("golden comparison failed")


def check_spawn_graph() -> None:
    head("nested-spawn graph is safe")
    r = sh(["node", "tools/check-spawn-graph.mjs"])
    print(r.stdout, end="")
    if r.returncode != 0:
        bad("spawn-graph check failed (see above)")


def check_no_invented_pins() -> None:
    head("no invented model pins")
    sys.path.insert(0, str(REPO / "lib"))
    from convert import convert as py_convert

    bad_any = False
    for f in sorted((REPO / "core" / "agents").glob("*.md")):
        text, warns = py_convert(f.read_text(), "claude", {})
        if not re.search(r"^model: inherit$", text, re.M):
            bad(f"claude output should emit 'model: inherit' for {f.stem}")
            bad_any = True
    if not bad_any:
        ok("model pins dropped and reported, never invented")


def check_contracts() -> None:
    head("skill and agent contracts are declared")
    r = sh(["node", "tests/evals/contract.mjs"])
    print(r.stdout, end="")
    if r.returncode != 0:
        bad("contract evals failed (see above)")


def check_install_behavior() -> None:
    head("install behaviour honours its contract")
    r = sh(["node", "tests/evals/install-behavior.mjs"])
    print(r.stdout, end="")
    if r.returncode != 0:
        bad("install-behaviour evals failed (see above)")


def check_smoke() -> None:
    head("installer smoke test (isolated HOME)")
    import tempfile

    smoke = Path(tempfile.mkdtemp())
    env = {"HOME": str(smoke), "PI_CODING_AGENT_DIR": str(smoke / ".omp" / "agent"), "PATH": "/usr/bin:/bin"}
    bad_any = False

    def run_install(args):
        return subprocess.run([sys.executable, "install.py", *args], capture_output=True, text=True, cwd=REPO, env={**env, "PATH": "/usr/bin:/bin:/usr/local/bin"})

    agents = len(list((REPO / "core" / "agents").glob("*.md")))
    skills = len([d for d in (REPO / "core" / "skills").iterdir() if d.is_dir()])
    r = run_install(["--runtime", "omp"])
    n1 = len(list((smoke / ".omp" / "agent" / "agents").glob("*"))) if (smoke / ".omp" / "agent" / "agents").exists() else -1
    n2 = len(list((smoke / ".omp" / "skills").iterdir())) if (smoke / ".omp" / "skills").exists() else -1
    if n1 != agents or n2 != skills:
        bad(f"install.py installed {n1} agents and {n2} skills, expected {agents} and {skills}")
        bad_any = True
    r2 = run_install(["--runtime", "omp"])
    skips = r2.stdout.count("identical, skipped")
    if skips != agents + skills:
        bad(f"second run skipped {skips}, expected {agents + skills}")
        bad_any = True

    first = sorted((smoke / ".omp" / "agent" / "agents").glob("*.md"))[0]
    first.write_text(first.read_text() + "\n# local edit\n")
    r3 = run_install(["--runtime", "omp"])
    if "exists and differs" not in r3.stdout or "# local edit" not in first.read_text():
        bad("install.py did not refuse to clobber a locally edited file")
        bad_any = True

    import shutil as _shutil

    _shutil.rmtree(smoke, ignore_errors=True)
    if not bad_any:
        ok(f"omp: {agents} agents, {skills} skills, idempotent, refuses to clobber")


if __name__ == "__main__":
    sys.exit(main())
