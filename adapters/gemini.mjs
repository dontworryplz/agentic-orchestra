#!/usr/bin/env node
// Gemini CLI adapter (compatibility layer): skills install natively into
// .agents/skills; agents have no verified native format and render as
// GEMINI.md instruction blocks via the shared rules-wrapper.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { renderRulesWrapper } from './rules-wrapper.mjs';

export const gemini = new RuntimeAdapter({
  id: 'gemini',
  displayName: 'Gemini CLI',
  binaryNames: ['gemini'],
  capabilities: { skills: true, agents: false, subagents: false, commands: false, rules: false, instructions: true, mcp: true, hooks: false },
  scopes: ['user', 'project'],
  nativeSupport: 'rules-wrapper',
  notes: 'Agents render as GEMINI.md instruction blocks; skills install natively.',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: path.join(cwd, '.agents', 'skills'), skills: path.join(cwd, '.agents', 'skills') };
    return { agents: null, skills: home ? path.join(home, '.gemini', 'skills') : null };
  },
  render(canonical, _opts = {}) {
    return renderRulesWrapper(canonical.sourceText, 'Gemini CLI', canonical.name);
  },
});
