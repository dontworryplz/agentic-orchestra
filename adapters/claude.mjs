#!/usr/bin/env node
// Claude Code adapter: native subagents with Title-case tools, effort derived
// from the OMP model suffix, model defaulting to inherit. Pins never invented.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { toClaude } from '../lib/convert.mjs';

export const claude = new RuntimeAdapter({
  id: 'claude-code',
  displayName: 'Claude Code',
  binaryNames: ['claude'],
  capabilities: { skills: true, agents: true, subagents: true, commands: true, rules: false, instructions: false, mcp: true, hooks: true },
  scopes: ['user', 'project'],
  nativeSupport: 'native',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: path.join(cwd, '.claude', 'agents'), skills: path.join(cwd, '.claude', 'skills') };
    return {
      agents: home ? path.join(home, '.claude', 'agents') : null,
      skills: home ? path.join(home, '.claude', 'skills') : null,
    };
  },
  render(canonical, opts = {}) {
    return toClaude(canonical.sourceText, opts);
  },
});
