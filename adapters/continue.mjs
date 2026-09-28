#!/usr/bin/env node
// Continue adapter (compatibility layer): agents render as instruction files;
// skills install natively.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { renderRulesWrapper } from './rules-wrapper.mjs';

export const cont = new RuntimeAdapter({
  id: 'continue',
  displayName: 'Continue',
  binaryNames: ['cn'],
  capabilities: { skills: true, agents: false, subagents: false, commands: false, rules: false, instructions: true, mcp: true, hooks: false },
  scopes: ['user', 'project'],
  nativeSupport: 'rules-wrapper',
  notes: 'Agents render as instruction files; skills install natively.',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: path.join(cwd, '.continue', 'skills'), skills: path.join(cwd, '.continue', 'skills') };
    return { agents: null, skills: home ? path.join(home, '.continue', 'skills') : null };
  },
  render(canonical, _opts = {}) {
    return renderRulesWrapper(canonical.sourceText, 'Continue', canonical.name);
  },
});
export { cont as continueAdapter };
