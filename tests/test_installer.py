"""Installer tests: detection, selection, merge safety, idempotency, fallback.

Every test runs in a temporary HOME and a temporary project directory. Nothing
here touches the developer's real configuration — a test that writes to the
real HOME is a test that deletes someone's agents.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "installer"))

from adapters import (  # noqa: E402
    all_providers,
    detect,
    get_provider,
    install_provider,
    render_agent,
)
from custom import load_custom, save_provider  # noqa: E402


def make_env():
    home = Path(tempfile.mkdtemp())
    cwd = Path(tempfile.mkdtemp())
    return home, cwd


def destroy(home, cwd):
    shutil.rmtree(home, ignore_errors=True)
    shutil.rmtree(cwd, ignore_errors=True)


OPTS = {"temperature": "", "steps": "", "model": "inherit"}


class Detection(unittest.TestCase):
    def test_detection_marks_without_installing(self):
        home, cwd = make_env()
        try:
            found = dict((p["id"], d) for p, d in detect(home))
            # Binaries resolve through PATH, not HOME, so an empty HOME can
            # still detect installed CLIs. What must hold: detection writes
            # nothing, and a provider with no binary and no config dir (the
            # generic fallback) is never "detected".
            self.assertEqual(list(home.iterdir()), [])
            self.assertFalse(found["generic"])
            self.assertFalse(found["amp"] and not any(
                __import__("shutil").which(b) for b in ("amp",)))
        finally:
            destroy(home, cwd)

    def test_detection_sees_a_config_dir(self):
        home, cwd = make_env()
        try:
            (home / ".claude").mkdir(parents=True)
            found = dict((p["id"], d) for p, d in detect(home))
            self.assertTrue(found["claude-code"])
            self.assertFalse(found["qwen"])
        finally:
            destroy(home, cwd)

    def test_registry_lists_every_required_provider(self):
        ids = {p["id"] for p in all_providers()}
        for required in ("opencode", "omp", "claude-code", "codex", "gemini", "copilot",
                         "cursor", "qwen", "aider", "amp", "continue", "generic"):
            self.assertIn(required, ids, f"registry is missing {required}")


class SingleProvider(unittest.TestCase):
    def test_install_omp_agents_and_skills(self):
        home, cwd = make_env()
        try:
            res = install_provider("omp", scope="global", components={"agents", "skills", "sast"},
                                   options=OPTS, cwd=cwd, home=home)
            agents = list((home / ".omp" / "agent" / "agents").glob("*.md"))
            skills = list((home / ".omp" / "skills").iterdir())
            self.assertEqual(len(agents), 13, f"expected 13 agents, got {len(agents)}")
            self.assertEqual(len(skills), 10, f"expected 10 skills, got {len(skills)}")
            self.assertEqual(res["counts"]["blocked"], 0)
        finally:
            destroy(home, cwd)

    def test_project_scope_stays_in_the_project(self):
        home, cwd = make_env()
        try:
            install_provider("opencode", scope="project", components={"agents", "skills", "sast"},
                             options=OPTS, cwd=cwd, home=home)
            self.assertTrue((cwd / ".opencode" / "agent").exists())
            self.assertFalse((home / ".config").exists(), "project install leaked into HOME")
        finally:
            destroy(home, cwd)


class MultiProvider(unittest.TestCase):
    def test_three_providers_in_one_operation(self):
        home, cwd = make_env()
        try:
            for pid in ("omp", "claude-code", "codex"):
                install_provider(pid, scope="global", components={"agents", "skills", "sast"},
                                 options=OPTS, cwd=cwd, home=home)
            self.assertTrue((home / ".omp" / "agent" / "agents" / "luna-worker.md").exists())
            self.assertTrue((home / ".claude" / "agents" / "luna-worker.md").exists())
            self.assertTrue((home / ".codex" / "skills" / "graft").exists())
            # And codex honestly took no agents.
            self.assertFalse((home / ".codex" / "agents").exists())
        finally:
            destroy(home, cwd)


class MergeSafety(unittest.TestCase):
    def test_existing_agents_md_is_merged_not_overwritten(self):
        home, cwd = make_env()
        try:
            target = cwd / "AGENTS.md"
            target.write_text("# My project\n\nMy own rules.\n")
            from adapters import merge_rules_file
            counts = {"written": 0, "skipped": 0, "blocked": 0}
            merge_rules_file("amp", "project", cwd, home, dry_run=False, force=False,
                             counts=counts, warnings=[])
            text = target.read_text()
            self.assertIn("# My project", text)
            self.assertIn("My own rules.", text)
            self.assertIn("agentic-orchestra:begin", text)
            # Second run is a no-op.
            counts2 = {"written": 0, "skipped": 0, "blocked": 0}
            merge_rules_file("amp", "project", cwd, home, dry_run=False, force=False,
                             counts=counts2, warnings=[])
            self.assertEqual(counts2["skipped"], 1)
            self.assertEqual(counts2["written"], 0)
            # A backup exists.
            self.assertTrue((cwd / "AGENTS.md.agentic-orchestra.bak").exists())
        finally:
            destroy(home, cwd)

    def test_local_edits_survive_reinstall(self):
        home, cwd = make_env()
        try:
            install_provider("omp", scope="global", components={"agents", "skills", "sast"},
                             options=OPTS, cwd=cwd, home=home)
            target = home / ".omp" / "agent" / "agents" / "luna-worker.md"
            target.write_text(target.read_text() + "\n# mine\n")
            res = install_provider("omp", scope="global", components={"agents", "skills", "sast"},
                                   options=OPTS, cwd=cwd, home=home)
            self.assertIn("# mine", target.read_text())
            self.assertGreater(res["counts"]["blocked"], 0)
        finally:
            destroy(home, cwd)

    def test_dry_run_writes_nothing(self):
        home, cwd = make_env()
        try:
            install_provider("omp", scope="global", components={"agents", "skills", "sast"},
                             options=OPTS, cwd=cwd, home=home, dry_run=True)
            self.assertEqual(list(home.iterdir()), [])
        finally:
            destroy(home, cwd)


class Fallback(unittest.TestCase):
    def test_codex_refuses_agents_by_name(self):
        with self.assertRaises(ValueError) as ctx:
            render_agent(get_provider("codex"), "---\nname: x\ntools: read\n---\n\nbody\n", OPTS)
        self.assertIn("skills", str(ctx.exception).lower())

    def test_unknown_cli_gets_a_rules_wrapper_not_native(self):
        text, warnings = render_agent(get_provider("aider"), "---\nname: x\ndescription: Does things.\ntools: read\n---\n\nbody\n", OPTS)
        self.assertIn("compatibility", text.lower())
        self.assertIn("Does things.", text)
        self.assertTrue(any("no native agent format" in w for w in warnings))

    def test_cursor_renders_rules_not_agents(self):
        text, _ = render_agent(get_provider("cursor"), "---\nname: x\ndescription: D.\ntools: read\n---\n\nbody text\n", OPTS)
        self.assertNotIn("---\nname:", text)
        self.assertIn("body text", text)


class GenericAdapter(unittest.TestCase):
    def test_custom_provider_persists_without_source_changes(self):
        home, cwd = make_env()
        try:
            entry = {
                "id": "testtool", "displayName": "TestTool", "binaries": [], "configDirs": [],
                "skills": {"project": ".mytool/skills", "global": None},
                "agents": {"support": "rules-wrapper", "format": "agents-md", "reason": "test"},
                "scopes": ["project"],
                "capabilities": {"skills": True, "agents": False, "subagents": False, "commands": False,
                                 "rules": False, "instructions": True, "mcp": False, "hooks": False},
                "source": "user",
            }
            from custom import config_path
            saved = save_provider(entry, home)
            self.assertTrue(saved.exists())
            self.assertEqual(load_custom(home)[0]["id"], "testtool")
            # And the installer honors it.
            res = install_provider("testtool", scope="project", components={"skills"},
                                   options=OPTS, cwd=cwd, home=home)
            self.assertTrue((cwd / ".mytool" / "skills" / "graft").exists())
            self.assertEqual(res["counts"]["blocked"], 0)
        finally:
            destroy(home, cwd)


class SastIntegration(unittest.TestCase):
    def test_sast_skill_installs_where_selected(self):
        home, cwd = make_env()
        try:
            install_provider("claude-code", scope="global", components={"sast"},
                             options=OPTS, cwd=cwd, home=home)
            sast = home / ".claude" / "skills" / "llm-sast-scanner"
            self.assertTrue((sast / "SKILL.md").exists())
            self.assertTrue((sast / "references" / "sql_injection.md").exists())
            # But nothing else was installed.
            self.assertEqual(sorted(d.name for d in (home / ".claude" / "skills").iterdir()),
                             ["llm-sast-scanner"])
        finally:
            destroy(home, cwd)

    def test_security_reviewer_routes_to_the_sast_skill(self):
        src = (REPO / "core" / "agents" / "security-reviewer.md").read_text()
        self.assertIn("skill://llm-sast-scanner", src)
        sast = REPO / "core" / "skills" / "llm-sast-scanner" / "SKILL.md"
        self.assertTrue(sast.exists())
        self.assertTrue((sast.parent / "references").is_dir())

    def test_sast_references_resolve(self):
        refs = REPO / "core" / "skills" / "llm-sast-scanner" / "references"
        missing = [f for f in refs.glob("*.md") if not f.exists()]
        self.assertEqual(missing, [])
        self.assertGreaterEqual(len(list(refs.glob("*.md"))), 30)


class Uninstall(unittest.TestCase):
    def test_uninstall_keeps_foreign_files(self):
        home, cwd = make_env()
        try:
            install_provider("omp", scope="global", components={"agents", "skills", "sast"},
                             options=OPTS, cwd=cwd, home=home)
            foreign = home / ".omp" / "skills" / "someone-elses-skill"
            foreign.mkdir(parents=True)
            (foreign / "SKILL.md").write_text("---\nname: someone-elses-skill\n---\n\nx\n")
            r = subprocess.run(
                [sys.executable, str(REPO / "uninstall.py"), "--runtime", "omp"],
                capture_output=True, text=True, cwd=REPO,
                env={**os.environ, "HOME": str(home),
                     "PI_CODING_AGENT_DIR": str(home / ".omp" / "agent")},
            )
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertTrue((foreign / "SKILL.md").exists(), "uninstall deleted a foreign skill")
            self.assertFalse((home / ".omp" / "agent" / "agents" / "luna-worker.md").exists())
        finally:
            destroy(home, cwd)


if __name__ == "__main__":
    unittest.main(verbosity=1)
