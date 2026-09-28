#!/usr/bin/env node
// GitHub Copilot CLI adapter (compatibility layer): skills install natively;
// agents render as Copilot instruction files via the shared rules-wrapper.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { renderRulesWrapper } from './rules-wrapper.mjs';

export const copilot = new RuntimeAdapter({
  id: 'copilot',
  displayName: 'GitHub Copilot CLI',
  binaryNames: ['copilot'],
  capabilities: { skills: true, agents: false, subagents: false, commands: false, rules: false, instructions: true, mcp: true, hooks: false },
  scopes: ['user', 'project'],
  nativeSupport: 'rules-wrapper',
  notes: 'Agents render as Copilot instruction files; skills install natively.',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: path.join(cwd, '.agents', 'skills'), skills: path.join(cwd, '.agents', 'skills') };
    return { agents: null, skills: home ? path.join(home, '.copilot', 'skills') : null };
  },
  render(canonical, _opts = {}) {
    return renderRulesWrapper(canonical.sourceText, 'GitHub Copilot CLI', canonical.name);
  },
});
