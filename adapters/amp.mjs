#!/usr/bin/env node
// Amp adapter (compatibility layer): agents render into the shared AGENTS.md
// convention; skills install natively into .agents/skills.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { renderRulesWrapper } from './rules-wrapper.mjs';

export const amp = new RuntimeAdapter({
  id: 'amp',
  displayName: 'Amp',
  binaryNames: ['amp'],
  capabilities: { skills: true, agents: false, subagents: false, commands: false, rules: false, instructions: true, mcp: false, hooks: false },
  scopes: ['user', 'project'],
  nativeSupport: 'rules-wrapper',
  notes: 'Agents render into the shared AGENTS.md convention; skills install natively.',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: path.join(cwd, '.agents', 'skills'), skills: path.join(cwd, '.agents', 'skills') };
    return { agents: null, skills: home ? path.join(home, '.config', 'agents', 'skills') : null };
  },
  render(canonical, _opts = {}) {
    return renderRulesWrapper(canonical.sourceText, 'Amp', canonical.name);
  },
});
