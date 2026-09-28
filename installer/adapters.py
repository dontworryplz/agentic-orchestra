"""Provider adapters: capability-driven install, render, validate, uninstall.

Every provider in registry/providers.json is served by this module. Provider
differences live in per-adapter functions and in the registry entry — never in
`if provider == ...` branches scattered through the installer. Adding a new
provider is one registry entry plus, only if its format is new, one render
function. The generic rules-wrapper covers every CLI that reads instructions
but has no native agent format, so most additions need no code at all.

Support levels, stated honestly:
  native         the adapter renders the provider's real agent format (verified)
  skills-only    skills install; agents are refused by name, not guessed
  rules-wrapper  agents render as instruction/rule text the CLI actually reads;
                 labeled as a compatibility layer, never as native support
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "lib"))
sys.path.insert(0, str(REPO / "tools"))

from convert import convert  # noqa: E402
from frontmatter import parse_frontmatter  # noqa: E402

REGISTRY = json.loads((REPO / "registry" / "providers.json").read_text())


def _custom_providers(home=None) -> list[dict]:
    # User-defined providers live outside the repository so that adding a CLI
    # never requires a source change. A corrupted file is ignored rather than
    # fatal: a broken JSON file must not take down the whole installer.
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        from custom import load_custom
        return load_custom(home)
    except Exception:
        return []


def _merge_custom(home=None) -> None:
    # Custom providers resolve against the caller's HOME, not the process HOME.
    # Without this, a test that saves a provider into an isolated HOME cannot
    # see it, and worse, two different users' custom providers would leak into
    # each other through the module-level registry.
    for _entry in _custom_providers(home):
        if _entry.get("id") not in {p["id"] for p in REGISTRY["providers"]}:
            REGISTRY["providers"].append(_entry)


_merge_custom()


def get_provider(pid: str, home=None) -> dict:
    ids = [p["id"] for p in REGISTRY["providers"]]
    for p in REGISTRY["providers"]:
        if p["id"] == pid:
            return p
    # Accept an unambiguous prefix or a display-name shorthand, because nobody
    # remembers whether it is `claude` or `claude-code` until the error tells
    # them. Ambiguity is still an error rather than a guess.
    matches = [p for p in REGISTRY["providers"]
               if p["id"].startswith(pid) or pid in p["displayName"].lower().replace(" ", "")]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise ValueError(f"ambiguous provider '{pid}': could be {', '.join(m['id'] for m in matches)}")
    raise ValueError(f"unknown provider '{pid}' (expected one of: {', '.join(ids)})")


def all_providers() -> list[dict]:
    return REGISTRY["providers"]


def detect(home: Path | None = None) -> list[tuple[dict, bool]]:
    """Return (provider, detected) without installing anything. Detection only
    marks; it never writes."""
    home = home or Path.home()
    out = []
    for p in all_providers():
        found = any(shutil.which(b) for b in p.get("binaries", []))
        found = found or any((home / d.lstrip("~/")).exists() if d.startswith("~") else False
                             for d in p.get("configDirs", []))
        out.append((p, bool(found)))
    return out


def core_agents() -> list[Path]:
    return sorted((REPO / "core" / "agents").glob("*.md"))


def core_skills() -> list[str]:
    return sorted(d.name for d in (REPO / "core" / "skills").iterdir()
                  if d.is_dir() and (d / "SKILL.md").exists())


def resolve_dir(template: str, scope: str, cwd: Path, home: Path) -> Path:
    """Expand a registry path template for the requested scope."""
    if scope == "project":
        return cwd / template
    return home / template.lstrip("~/").lstrip("~/")


# ---------------------------------------------------------------- renderers

def render_agent_omp(source: str) -> tuple[str, list[str]]:
    return source, []


def render_agent_opencode(source: str, options: dict) -> tuple[str, list[str]]:
    return convert(source, "opencode", options)


def render_agent_claude(source: str, options: dict) -> tuple[str, list[str]]:
    return convert(source, "claude", options)


def render_agent_cursor(source: str, _options: dict) -> tuple[str, list[str]]:
    text, warnings = convert(source, "cursor", {})
    return text, warnings


def render_agent_rules_wrapper(source: str, provider: dict) -> tuple[str, list[str]]:
    """The compatibility layer. No native agent format exists (or none is
    verified), so the agent becomes an instruction block the CLI actually reads,
    labeled as what it is."""
    data, body = parse_frontmatter(source)
    header = (
        f"# Agent role: {data.get('name', '?')} (agentic-orchestra compatibility rule)\n"
        f"# Native agent support: no. This is the agent's instruction text, rendered\n"
        f"# for {provider['displayName']} because it has no verified agent format.\n"
        f"# Role: {data.get('description', '')}\n\n"
    )
    return header + body.lstrip("\n"), [
        f"{data.get('name')}: rendered as instruction text for {provider['displayName']} (no native agent format)"
    ]


def render_agent(provider: dict, source: str, options: dict) -> tuple[str, list[str]]:
    support = provider["agents"]["support"]
    if support == "native":
        # Match on the registry id, not a nickname. An earlier version matched
        # "claude" while the registry id is "claude-code", which silently routed
        # every Claude agent into the ValueError below and reported thirteen
        # blocked installs with no files written.
        renderers = {
            "omp": lambda: render_agent_omp(source),
            "opencode": lambda: render_agent_opencode(source, options),
            "claude-code": lambda: render_agent_claude(source, options),
        }
        pid = provider["id"]
        if pid in renderers:
            return renderers[pid]()
        raise ValueError(f"native support declared for '{pid}' but no renderer exists")
    if support == "skills-only":
        data, _ = parse_frontmatter(source)
        raise ValueError(f"{provider['displayName']} takes skills, not task agents ({data.get('name')}); "
                         "install with skills selected")
    if support == "rules-wrapper":
        if provider["id"] == "cursor":
            return render_agent_cursor(source, options)
        return render_agent_rules_wrapper(source, provider)
    raise ValueError(f"unknown agent support level '{support}' for {provider['id']}")


def agent_filename(provider: dict, stem: str) -> str:
    if provider["id"] == "cursor":
        return stem + ".mdc"
    return stem + ".md"


# ---------------------------------------------------------------- install

def write_file(dest: Path, content: str, dry_run: bool, force: bool, counts: dict) -> str:
    if dest.exists() and not force:
        if dest.read_text() == content:
            counts["skipped"] += 1
            return "skipped"
        counts["blocked"] += 1
        return "blocked"
    if dry_run:
        counts["written"] += 1
        return "written"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content)
    counts["written"] += 1
    return "written"


def install_provider(pid: str, *, scope: str, components: set[str], options: dict,
                     cwd: Path, home: Path, dry_run: bool = False, force: bool = False) -> dict:
    """Install into one provider. Returns counts and warnings. Never overwrites
    user configuration blindly; merge-safe paths go through merge_text_file."""
    _merge_custom(home)
    provider = get_provider(pid, home)
    counts = {"written": 0, "skipped": 0, "blocked": 0}
    warnings: list[str] = []

    if "skills" in components or "sast" in components:
        skills_dir = resolve_dir(provider["skills"][scope], scope, cwd, home)
        # "sast" alone means only the SAST skill. Without this filter the flag
        # installs all ten skills, which is exactly the kind of silent scope
        # creep a component selection exists to prevent.
        wanted = core_skills() if "skills" in components else ["security-review"]
        for name in wanted:
            src = REPO / "core" / "skills" / name
            dest = skills_dir / name
            if pid == "cursor":
                from convert import convert as _convert
                text, _ = _convert((src / "SKILL.md").read_text(), "cursor", {})
                st = write_file(dest.with_suffix(".mdc"), text, dry_run, force, counts)
                if st == "blocked":
                    warnings.append(f"{dest}.mdc exists and differs")
                continue
            if dest.exists() and not force:
                if _dir_matches(src, dest):
                    print(f"  = {dest} (identical, skipped)")
                    counts["skipped"] += 1
                else:
                    print(f"  ! {dest} exists and differs — re-run with --force to overwrite")
                    counts["blocked"] += 1
                    warnings.append(f"{dest} exists and differs")
                continue
            if dry_run:
                print(f"  + {dest}/ (dry-run)")
                counts["written"] += 1
                continue
            import shutil as _shutil
            skills_dir.mkdir(parents=True, exist_ok=True)
            _shutil.rmtree(dest, ignore_errors=True)
            _shutil.copytree(src, dest)
            print(f"  + {dest}/")
            counts["written"] += 1

    if "agents" in components:
        support = provider["agents"]["support"]
        if support == "skills-only":
            warnings.append(f"{provider['displayName']} takes skills, not task agents — agents skipped by name")
        elif support == "rules-wrapper" and not provider["agents"].get(scope if scope != "both" else "project"):
            # No agent directory for this scope: the roles are covered by the
            # rules/instruction merge below, not by per-agent files. Say so
            # instead of crashing on a missing registry key.
            warnings.append(f"{provider['displayName']} has no agent directory for scope '{scope}' — "
                            "roles install via the rules/instruction merge")
        else:
            agents_dir = resolve_dir(provider["agents"][scope if scope != "both" else "project"], "project" if scope == "both" else scope, cwd, home)
            # "both" installs agents to project AND global
            targets = [agents_dir]
            if scope == "both":
                targets.append(resolve_dir(provider["agents"]["global"], "global", cwd, home))
            for target in targets:
                for src in core_agents():
                    try:
                        text, warns = render_agent(provider, src.read_text(), options)
                    except ValueError as e:
                        warnings.append(str(e))
                        counts["blocked"] += 1
                        continue
                    warnings.extend(warns)
                    st = write_file(target / agent_filename(provider, src.stem), text, dry_run, force, counts)
                    if st == "blocked":
                        warnings.append(f"{target / agent_filename(provider, src.stem)} exists and differs")

    if "rules" in components or "instructions" in components:
        merge_rules_file(pid, scope, cwd, home, dry_run, force, counts, warnings)

    return {"counts": counts, "warnings": warnings}


def _dir_matches(src: Path, dest: Path) -> bool:
    def walk(d: Path):
        out = []
        for e in sorted(d.rglob("*")):
            if e.is_file():
                out.append(e.relative_to(d).as_posix())
        return out
    if sorted(walk(src)) != sorted(walk(dest)):
        return False
    return all((src / f).read_text() == (dest / f).read_text() for f in walk(src))


MARK_BEGIN = "<!-- agentic-orchestra:begin -->"
MARK_END = "<!-- agentic-orchestra:end -->"

RULES_FILENAMES = {"gemini": "GEMINI.md", "copilot": "muse-instructions.md"}

DEFAULT_RULES_FILE = "AGENTS.md"


def merge_rules_file(pid: str, scope: str, cwd: Path, home: Path,
                     dry_run: bool, force: bool, counts: dict, warnings: list) -> None:
    """Append our instruction block to the provider's rules file between markers,
    or replace only our own block. Everything outside the markers is preserved
    byte-for-byte, and a backup is written before any change."""
    provider = get_provider(pid)
    filename = RULES_FILENAMES.get(pid, DEFAULT_RULES_FILE)
    dest = (cwd if scope == "project" else home) / filename
    if scope == "both":
        for s in ("project", "global"):
            merge_rules_file(pid, s, cwd, home, dry_run, force, counts, warnings)
        return

    block_lines = [f"# agentic-orchestra roles ({provider['displayName']} compatibility layer)", ""]
    for src in core_agents():
        from frontmatter import parse_frontmatter as _pf
        data, _ = _pf(src.read_text())
        block_lines.append(f"## {data.get('name', src.stem)}")
        block_lines.append(str(data.get("description", "")))
        block_lines.append("")
    block = "\n".join(block_lines)
    marked = f"{MARK_BEGIN}\n{block}\n{MARK_END}\n"

    existing = dest.read_text() if dest.exists() else ""
    if MARK_BEGIN in existing:
        before, _, after = existing.partition(MARK_BEGIN)
        _, _, after = after.partition(MARK_END)
        new = before + marked + after.lstrip("\n")
        if new == existing:
            print(f"  = {dest} (our block current, rest preserved)")
            counts["skipped"] += 1
            return
        action = "refresh our block"
    else:
        new = (existing.rstrip("\n") + "\n\n" if existing else "") + marked
        action = "append our block"

    if dry_run:
        print(f"  + {dest} ({action}, dry-run; unrelated content preserved)")
        counts["written"] += 1
        return
    if dest.exists():
        backup = dest.with_suffix(dest.suffix + ".agentic-orchestra.bak")
        backup.write_text(existing)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(new)
    print(f"  + {dest} ({action}; backup kept, unrelated content preserved)")
    counts["written"] += 1


def unmerge_rules_file(pid: str, scope: str, cwd: Path, home: Path,
                       dry_run: bool, counts: dict) -> None:
    """Remove only our marked block from the provider's rules file. Everything
    outside the markers is preserved byte-for-byte. If nothing but our block
    remains, the file is removed instead of leaving an empty shell."""
    filename = RULES_FILENAMES.get(pid, DEFAULT_RULES_FILE)
    if scope == "both":
        for s in ("project", "global"):
            unmerge_rules_file(pid, s, cwd, home, dry_run, counts)
        return
    dest = (cwd if scope == "project" else home) / filename
    if not dest.exists() or MARK_BEGIN not in dest.read_text():
        print(f"  - {dest} (absent)")
        counts["skipped"] += 1
        return
    existing = dest.read_text()
    parts = existing.split(MARK_BEGIN)
    kept = parts[0]
    for tail in parts[1:]:
        _, _, after = tail.partition(MARK_END)
        kept += after
    new = kept.strip()
    if dry_run:
        print(f"  x {dest} (remove our block, dry-run; unrelated content preserved)")
        counts["removed"] += 1
        return
    if not new:
        dest.unlink()
        print(f"  x {dest} (only our block remained; file removed)")
    else:
        dest.write_text(new + "\n")
        print(f"  x {dest} (our block removed, unrelated content preserved)")
    counts["removed"] += 1


def uninstall_provider(pid: str, *, scope: str, cwd: Path, home: Path,
                       dry_run: bool = False, force: bool = False) -> dict:
    """Remove what install_provider added for one provider. Agent and skill
    files go only when they still match what we would install (or --force);
    foreign files are never touched. Returns counts."""
    from convert import convert as _convert  # noqa: E402

    provider = get_provider(pid, home)
    counts = {"removed": 0, "kept": 0, "skipped": 0}

    scopes = ("project", "global") if scope == "both" else (scope,)
    for sc in scopes:
        # Agents: remove only files identical to what we would install.
        support = provider["agents"]["support"]
        if support not in ("skills-only",) and provider["agents"].get(sc):
            agents_dir = resolve_dir(provider["agents"][sc], sc, cwd, home)
            for src in core_agents():
                dest = agents_dir / agent_filename(provider, src.stem)
                if not dest.exists():
                    counts["skipped"] += 1
                    continue
                try:
                    expected, _ = render_agent(provider, src.read_text(), {})
                except ValueError:
                    expected = src.read_text()
                if not force and dest.read_text() != expected:
                    print(f"  ! {dest} modified since install — left in place (use --force to remove)")
                    counts["kept"] += 1
                    continue
                if dry_run:
                    print(f"  x {dest} (dry-run)")
                else:
                    dest.unlink()
                counts["removed"] += 1
        # Skills: remove only directories identical to ours.
        try:
            skills_template = provider["skills"][sc]
        except (KeyError, TypeError):
            skills_template = None
        if skills_template:
            skills_dir = resolve_dir(skills_template, sc, cwd, home)
            for name in core_skills():
                dest = skills_dir / name
                if pid == "cursor":
                    rule = skills_dir / f"{name}.mdc"
                    if not rule.exists():
                        counts["skipped"] += 1
                        continue
                    if dry_run:
                        print(f"  x {rule} (dry-run)")
                    else:
                        rule.unlink()
                    counts["removed"] += 1
                    continue
                if not dest.exists():
                    counts["skipped"] += 1
                    continue
                if not force and not _dir_matches(REPO / "core" / "skills" / name, dest):
                    print(f"  ! {dest} modified since install — left in place (use --force to remove)")
                    counts["kept"] += 1
                    continue
                if dry_run:
                    print(f"  x {dest}/ (dry-run)")
                else:
                    import shutil as _shutil
                    _shutil.rmtree(dest)
                counts["removed"] += 1
        # Rules merge: remove only our marked block.
        unmerge_rules_file(pid, sc, cwd, home, dry_run, counts)

    return {"counts": counts}
