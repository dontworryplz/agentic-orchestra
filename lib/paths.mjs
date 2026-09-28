#!/usr/bin/env node
// Provider paths: thin backward-compatible facade over adapters/.
// New code should import from adapters/index.mjs and use capabilities;
// this module preserves the historical RUNTIMES/resolvePaths API.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIMES = [
  'omp',
  'opencode',
  'claude-code',
  'codex',
  'cursor',
  'gemini',
  'copilot',
  'qwen',
  'aider',
  'amp',
  'continue',
  'generic',
];

// Historical alias: the JS converter used 'claude', the registry id is
// 'claude-code'. Both resolve to the same adapter.
const ALIASES = { claude: 'claude-code' };

async function adapterFor(runtime, home) {
  const { getAdapter } = await import('../adapters/index.mjs');
  return getAdapter(ALIASES[runtime] || runtime, home);
}

export function resolvePathsSync(runtime, { project = false, cwd = process.cwd(), home = homedir(), env = process.env } = {}) {
  const id = ALIASES[runtime] || runtime;
  // Static table mirrors adapters/*/configLocations so synchronous callers
  // (drift, verify, uninstall) keep working without a dynamic import.
  const agentHome = env.PI_CODING_AGENT_DIR || path.join(home, '.omp', 'agent');
  const table = {
    omp: () => (project
      ? { agents: path.join(cwd, '.omp', 'agents'), skills: path.join(cwd, '.omp', 'skills') }
      : { agents: path.join(agentHome, 'agents'), skills: path.join(home, '.omp', 'skills') }),
    opencode: () => (project
      ? { agents: path.join(cwd, '.opencode', 'agent'), skills: path.join(cwd, '.agents', 'skills') }
      : { agents: path.join(home, '.config', 'opencode', 'agents'), skills: path.join(home, '.config', 'opencode', 'skills') }),
    'claude-code': () => (project
      ? { agents: path.join(cwd, '.claude', 'agents'), skills: path.join(cwd, '.claude', 'skills') }
      : { agents: path.join(home, '.claude', 'agents'), skills: path.join(home, '.claude', 'skills') }),
    codex: () => (project
      ? { agents: null, skills: path.join(cwd, '.agents', 'skills') }
      : { agents: null, skills: path.join(home, '.codex', 'skills') }),
    cursor: () => (project
      ? { agents: path.join(cwd, '.cursor', 'rules'), skills: path.join(cwd, '.agents', 'skills') }
      : { agents: path.join(home, '.cursor', 'rules'), skills: path.join(home, '.cursor', 'skills') }),
    gemini: () => (project
      ? { agents: null, skills: path.join(cwd, '.agents', 'skills') }
      : { agents: null, skills: path.join(home, '.gemini', 'skills') }),
    copilot: () => (project
      ? { agents: null, skills: path.join(cwd, '.agents', 'skills') }
      : { agents: null, skills: path.join(home, '.copilot', 'skills') }),
    qwen: () => (project
      ? { agents: null, skills: path.join(cwd, '.qwen', 'skills') }
      : { agents: null, skills: path.join(home, '.qwen', 'skills') }),
    aider: () => (project
      ? { agents: null, skills: path.join(cwd, '.aider-desk', 'skills') }
      : { agents: null, skills: path.join(home, '.aider-desk', 'skills') }),
    amp: () => (project
      ? { agents: null, skills: path.join(cwd, '.agents', 'skills') }
      : { agents: null, skills: path.join(home, '.config', 'agents', 'skills') }),
    continue: () => (project
      ? { agents: null, skills: path.join(cwd, '.continue', 'skills') }
      : { agents: null, skills: path.join(home, '.continue', 'skills') }),
    generic: () => (project
      ? { agents: null, skills: path.join(cwd, '.agents', 'skills') }
      : { agents: null, skills: path.join(home, '.config', 'agents', 'skills') }),
  };
  const fn = table[id];
  if (!fn) throw new Error(`unknown runtime '${runtime}' (expected ${RUNTIMES.join(', ')})`);
  return fn();
}

export function resolvePaths(runtime, opts = {}) {
  return resolvePathsSync(ALIASES[runtime] || runtime, opts);
}

export { adapterFor };

// Repo root = the directory holding core/, adapters/, registry/. Resolved from
// this module's own location, so it works from a clone, an npm install, and an
// npx cache directory alike.
export function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function isRuntimeInstalled(runtime, options) {
  const { agents, skills } = resolvePaths(runtime, options);
  return {
    agents: agents ? existsSync(agents) : false,
    skills: existsSync(skills),
    agentsDir: agents,
    skillsDir: skills,
  };
}

// Targets that cannot take task agents natively, and what they get instead.
// Reported rather than silently skipped: "13 agents installed" into a runtime
// that holds none of them is a lie.
export const AGENTLESS_RUNTIMES = {
  codex: 'no verified task-agent format in Codex; skills only',
  cursor: 'Cursor takes .mdc rules, not agent definitions; agents render as rules',
  gemini: 'no verified native agent format; agents render as instruction blocks, skills install natively',
  copilot: 'agents render as Copilot instruction files; skills install natively',
  qwen: 'agents render as instruction files; skills install natively',
  aider: 'Aider reads repo conventions, not agent definitions; agents render as convention files',
  amp: 'agents render into the shared AGENTS.md convention; skills install natively',
  continue: 'agents render as instruction files; skills install natively',
  generic: 'unknown CLI fallback: AGENTS.md section plus .agents/skills/ copy',
};
