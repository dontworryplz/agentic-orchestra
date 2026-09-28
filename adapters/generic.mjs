#!/usr/bin/env node
// Generic fallback adapter (mandatory): the portable subset every Agent
// Skills-compatible tool reads — .agents/skills/ copy plus an AGENTS.md
// section. Never presented as native support for any specific CLI.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { renderRulesWrapper } from './rules-wrapper.mjs';

export const generic = new RuntimeAdapter({
  id: 'generic',
  displayName: 'Generic Agent Skills',
  binaryNames: [],
  capabilities: { skills: true, agents: false, subagents: false, commands: false, rules: false, instructions: true, mcp: false, hooks: false },
  scopes: ['user', 'project'],
  nativeSupport: 'fallback',
  notes: 'Unknown CLI fallback: AGENTS.md section plus .agents/skills/ copy.',
  configLocations({ project = false, cwd = process.cwd(), home = null, customPath = null } = {}) {
    if (customPath) return { agents: null, skills: path.resolve(cwd, customPath) };
    if (project) return { agents: null, skills: path.join(cwd, '.agents', 'skills') };
    return { agents: null, skills: home ? path.join(home, '.config', 'agents', 'skills') : null };
  },
  render(canonical, _opts = {}) {
    return renderRulesWrapper(canonical.sourceText, 'Generic Agent Skills', canonical.name);
  },
});
