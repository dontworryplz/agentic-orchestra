// Where each runtime keeps its agents and skills, and how to reach the repo
// root whether this was `npm install`ed or run straight from a clone.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIMES = ['omp', 'opencode', 'claude', 'cursor', 'codex'];

// Directory names differ per runtime and were read off a live install, not
// guessed. `project` entries follow each runtime's documented convention; only
// the user-scope paths were verified on the machine this was built on.
export function resolvePaths(runtime, { project = false, cwd = process.cwd(), home = homedir(), env = process.env } = {}) {
  const agentHome = env.PI_CODING_AGENT_DIR || path.join(home, '.omp', 'agent');

  if (runtime === 'omp') {
    return project
      ? { agents: path.join(cwd, '.omp', 'agents'), skills: path.join(cwd, '.omp', 'skills') }
      : { agents: path.join(agentHome, 'agents'), skills: path.join(home, '.omp', 'skills') };
  }
  if (runtime === 'opencode') {
    return project
      ? { agents: path.join(cwd, '.opencode', 'agent'), skills: path.join(cwd, '.opencode', 'skill') }
      : { agents: path.join(home, '.config', 'opencode', 'agents'), skills: path.join(home, '.config', 'opencode', 'skills') };
  }
  if (runtime === 'claude') {
    return project
      ? { agents: path.join(cwd, '.claude', 'agents'), skills: path.join(cwd, '.claude', 'skills') }
      : { agents: path.join(home, '.claude', 'agents'), skills: path.join(home, '.claude', 'skills') };
  }
  // Cursor takes rules, not agents: one .mdc per role, holding the body with the
  // frontmatter stripped. That is the convention Nutlope/hallmark documents.
  if (runtime === 'cursor') {
    return project
      ? { agents: path.join(cwd, '.cursor', 'rules'), skills: path.join(cwd, '.cursor', 'rules') }
      : { agents: path.join(home, '.cursor', 'rules'), skills: path.join(home, '.cursor', 'rules') };
  }
  // Codex takes skills. There is no verified format for a task agent in Codex, so
  // this target installs skills only and says so rather than inventing a schema.
  // The paths match the `skills` CLI: .agents/skills/ project, ~/.codex/skills/
  // global.
  if (runtime === 'codex') {
    return project
      ? { agents: null, skills: path.join(cwd, '.agents', 'skills') }
      : { agents: null, skills: path.join(home, '.codex', 'skills') };
  }
  throw new Error(`unknown runtime '${runtime}' (expected ${RUNTIMES.join(', ')})`);
}

// Repo root = the directory holding agents/ and skills/. Resolved from this
// module's own location, so it works from a clone, an npm install, and an
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

// Targets that cannot take task agents, and why. Reported rather than silently
// skipped, because "12 agents installed" into a runtime that holds none of them
// is a lie.
export const AGENTLESS_RUNTIMES = {
  codex: 'no verified task-agent format in Codex; skills only',
  cursor: 'Cursor takes .mdc rules, not agent definitions; see the cursor target',
};
