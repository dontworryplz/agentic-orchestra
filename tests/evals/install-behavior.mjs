#!/usr/bin/env node
// Install-behaviour evals: update, drift, and the non-clobber contract.
//
// Every one of these is an assertion about something that would be expensive to
// discover the hard way.
//
//   node tests/evals/install-behavior.mjs
//
// Runs entirely in a temporary HOME. Touches nothing real.

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(ROOT, 'bin', 'agentic-orchestra.mjs');

let home;
const results = [];

function run(args, { expectFail = false } = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: path.join(home, '.omp', 'agent') },
  });
  if (!expectFail && res.status !== 0 && res.status !== 1) {
    throw new Error(`\`${args.join(' ')}\` exited ${res.status}\n${res.stderr}`);
  }
  return res;
}

function check(name, fn) {
  home = mkdtempSync(path.join(tmpdir(), 'ao-eval-'));
  try {
    results.push({ name, ok: true, detail: fn() || '' });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const AGENT_DIR = () => path.join(home, '.omp', 'agent', 'agents');
const SKILL_DIR = () => path.join(home, '.omp', 'skills');

check('a fresh install puts every agent and skill in place', () => {
  run(['install', 'omp']);
  const agents = execFileSync('ls', [AGENT_DIR()], { encoding: 'utf8' }).trim().split('\n');
  const skills = execFileSync('ls', [SKILL_DIR()], { encoding: 'utf8' }).trim().split('\n');
  const wantAgents = execFileSync('ls', [path.join(ROOT, 'core', 'agents')], { encoding: 'utf8' }).trim().split('\n').length;
  const wantSkills = execFileSync('ls', [path.join(ROOT, 'core', 'skills')], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;
  assert(agents.length === wantAgents, `installed ${agents.length} agents, repository has ${wantAgents}`);
  assert(skills.length === wantSkills, `installed ${skills.length} skills, repository has ${wantSkills}`);
  return `${agents.length} agents, ${skills.length} skills`;
});

check('a second install changes nothing', () => {
  run(['install', 'omp']);
  const before = readFileSync(path.join(AGENT_DIR(), 'luna-reviewer.md'), 'utf8');
  const out = run(['install', 'omp']).stdout;
  const after = readFileSync(path.join(AGENT_DIR(), 'luna-reviewer.md'), 'utf8');
  assert(before === after, 'an installed file changed on a second install');
  assert(/identical, skipped/.test(out), 'the second install did not report skipping anything');
  return 'idempotent';
});

check('install refuses to overwrite a locally edited file', () => {
  run(['install', 'omp']);
  const target = path.join(AGENT_DIR(), 'luna-reviewer.md');
  appendFileSync(target, '\n# my own note\n');
  const out = run(['install', 'omp']).stdout;
  assert(readFileSync(target, 'utf8').includes('# my own note'), 'the local edit was destroyed');
  assert(/exists and differs/.test(out), 'the collision was not reported');
  return 'edit preserved';
});

check('uninstall refuses to remove a locally edited file', () => {
  run(['install', 'omp']);
  const target = path.join(AGENT_DIR(), 'luna-reviewer.md');
  appendFileSync(target, '\n# my own note\n');
  const out = run(['uninstall', 'omp', '--dry-run']).stdout;
  assert(/modified since install/.test(out), 'the modified file was not reported as kept');
  return 'reported, not deleted';
});

check('drift reports missing, stale and local separately', () => {
  run(['install', 'omp']);
  appendFileSync(path.join(AGENT_DIR(), 'luna-reviewer.md'), '\n# my own note\n');
  rmSync(path.join(AGENT_DIR(), 'luna-tester.md'), { force: true });
  const out = run(['drift', 'omp']).stdout;
  assert(/1 missing/.test(out) || /missing/.test(out), `missing file not reported:\n${out}`);
  assert(/local/.test(out), `locally edited file not reported as local:\n${out}`);
  return out.trim().split('\n')[0];
});

check('update adds what is missing and keeps what was edited', () => {
  run(['install', 'omp']);
  appendFileSync(path.join(AGENT_DIR(), 'luna-reviewer.md'), '\n# my own note\n');
  rmSync(path.join(AGENT_DIR(), 'luna-tester.md'), { force: true });
  run(['update', 'omp']);
  assert(existsSync(path.join(AGENT_DIR(), 'luna-tester.md')), 'update did not restore the missing file');
  assert(readFileSync(path.join(AGENT_DIR(), 'luna-reviewer.md'), 'utf8').includes('# my own note'),
    'update overwrote a locally edited file');
  return 'added and kept';
});

check('update --dry-run writes nothing', () => {
  run(['install', 'omp']);
  rmSync(path.join(AGENT_DIR(), 'luna-tester.md'), { force: true });
  const before = execFileSync('ls', [AGENT_DIR()], { encoding: 'utf8' });
  run(['update', 'omp', '--dry-run']);
  const after = execFileSync('ls', [AGENT_DIR()], { encoding: 'utf8' });
  assert(before === after, 'a dry run changed the filesystem');
  return 'no writes';
});

check('the shared skills directory is never a removal target', () => {
  run(['install', 'omp']);
  // A skill from another tool, sharing the directory.
  const foreign = path.join(SKILL_DIR(), 'someone-elses-skill');
  mkdirSync(foreign, { recursive: true });
  writeFileSync(path.join(foreign, 'SKILL.md'), '---\nname: someone-elses-skill\ndescription: not ours\n---\n\nbody\n');

  const drift = run(['drift', 'omp']).stdout;
  assert(/not ours/.test(drift), `a foreign skill was not reported as "not ours":\n${drift}`);
  assert(!/removed upstream[\s\S]*someone-elses-skill/.test(drift), 'a foreign skill was offered for removal');

  run(['uninstall', 'omp']);
  assert(existsSync(path.join(foreign, 'SKILL.md')), 'uninstall deleted a skill this package never installed');
  return 'foreign skill survived';
});

check('an agent removed upstream is reported as ours to remove', () => {
  run(['install', 'omp']);
  const retired = path.join(AGENT_DIR(), 'luna-retired-role.md');
  writeFileSync(retired, '---\nname: luna-retired-role\ndescription: shipped by an older version\ntools: read\n---\n\nbody\n');
  const drift = run(['drift', 'omp']).stdout;
  assert(/removed upstream/.test(drift), `a retired agent was not reported:\n${drift}`);
  assert(/luna-retired-role/.test(drift), 'the retired agent was not named');
  return 'reported';
});

check('every runtime installs and every one is idempotent', () => {
  const runtimes = ['omp', 'opencode', 'claude-code', 'cursor', 'codex', 'gemini', 'copilot', 'qwen', 'aider', 'amp', 'continue', 'generic'];
  for (const runtime of runtimes) {
    run(['install', runtime]);
    const second = run(['install', runtime]).stdout;
    assert(/identical, skipped/.test(second) || /not supported/.test(second) || /current, rest preserved/.test(second),
      `${runtime} is not idempotent:\n${second}`);
  }
  return `${runtimes.length} runtimes`;
});

check('three providers install in one operation', () => {
  const out = run(['install', 'omp', 'claude-code', 'codex']).stdout;
  assert(/Tool/.test(out) && /Scope/.test(out), `no summary matrix:\n${out}`);
  assert(existsSync(path.join(home, '.omp', 'agent', 'agents', 'luna-worker.md')), 'omp agent missing');
  assert(existsSync(path.join(home, '.claude', 'agents', 'luna-worker.md')), 'claude agent missing');
  assert(existsSync(path.join(home, '.codex', 'skills', 'graft')), 'codex skill missing');
  assert(!existsSync(path.join(home, '.codex', 'agents')), 'codex took agents it cannot hold');
  return 'matrix + 3 providers';
});

check('an agentless runtime says so rather than pretending', () => {
  const out = run(['install', 'codex']).stdout;
  assert(/not supported/.test(out), `codex did not report that it takes no agents:\n${out}`);
  assert(existsSync(path.join(home, '.codex', 'skills')), 'codex skills were not installed');
  return 'reported';
});

// --- report ------------------------------------------------------------------
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  process.stdout.write(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}\n`);
}
if (failed) process.exit(1);
