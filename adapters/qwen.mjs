#!/usr/bin/env node
// Qwen Code adapter (compatibility layer): skills install natively; agents
// render as instruction files via the shared rules-wrapper.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { renderRulesWrapper } from './rules-wrapper.mjs';

export const qwen = new RuntimeAdapter({
  id: 'qwen',
  displayName: 'Qwen Code',
  binaryNames: ['qwen'],
  capabilities: { skills: true, agents: false, subagents: false, commands: false, rules: false, instructions: true, mcp: true, hooks: false },
  scopes: ['user', 'project'],
  nativeSupport: 'rules-wrapper',
  notes: 'Agents render as instruction files; skills install natively.',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: path.join(cwd, '.qwen', 'skills'), skills: path.join(cwd, '.qwen', 'skills') };
    return { agents: null, skills: home ? path.join(home, '.qwen', 'skills') : null };
  },
  render(canonical, _opts = {}) {
    return renderRulesWrapper(canonical.sourceText, 'Qwen Code', canonical.name);
  },
});
