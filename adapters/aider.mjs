#!/usr/bin/env node
// Aider adapter (compatibility layer): Aider reads repo conventions, not agent
// definitions. Agents render as convention files; skills install natively.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { renderRulesWrapper } from './rules-wrapper.mjs';

export const aider = new RuntimeAdapter({
  id: 'aider',
  displayName: 'Aider',
  binaryNames: ['aider'],
  capabilities: { skills: true, agents: false, subagents: false, commands: false, rules: true, instructions: false, mcp: false, hooks: false },
  scopes: ['user', 'project'],
  nativeSupport: 'rules-wrapper',
  notes: 'Agents render as convention files; skills install natively.',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: path.join(cwd, '.aider-desk', 'skills'), skills: path.join(cwd, '.aider-desk', 'skills') };
    return { agents: null, skills: home ? path.join(home, '.aider-desk', 'skills') : null };
  },
  render(canonical, _opts = {}) {
    return renderRulesWrapper(canonical.sourceText, 'Aider', canonical.name);
  },
});
