#!/usr/bin/env node
// OMP adapter: reference implementation of the canonical agent schema.
// Agents install verbatim; skills copy as directories.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';

export const omp = new RuntimeAdapter({
  id: 'omp',
  displayName: 'OMP',
  binaryNames: ['omp'],
  capabilities: { skills: true, agents: true, subagents: true, commands: false, rules: false, instructions: false, mcp: false, hooks: true },
  scopes: ['user', 'project'],
  nativeSupport: 'native',
  configLocations({ project = false, cwd = process.cwd(), home = null, env = process.env } = {}) {
    const agentHome = (env && env.PI_CODING_AGENT_DIR) || (home ? path.join(home, '.omp', 'agent') : path.join('.omp', 'agent'));
    if (project) return { agents: path.join(cwd, '.omp', 'agents'), skills: path.join(cwd, '.omp', 'skills') };
    return { agents: path.join(agentHome, 'agents'), skills: home ? path.join(home, '.omp', 'skills') : path.join('.omp', 'skills') };
  },
  render(canonical, _opts = {}) {
    if (canonical.kind !== 'agent') return { text: canonical.body, warnings: [] };
    return { text: canonical.sourceText, warnings: [] };
  },
});
