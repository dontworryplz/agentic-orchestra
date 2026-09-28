#!/usr/bin/env node
// Codex adapter: skills-only. There is no verified task-agent format, so agent
// rendering is an explicit refusal naming the fallback, never a guessed schema.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { toCodex } from '../lib/convert.mjs';

export const codex = new RuntimeAdapter({
  id: 'codex',
  displayName: 'OpenAI Codex CLI',
  binaryNames: ['codex'],
  capabilities: { skills: true, agents: false, subagents: false, commands: false, rules: false, instructions: true, mcp: true, hooks: true },
  scopes: ['user', 'project'],
  nativeSupport: 'skills-only',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: null, skills: path.join(cwd, '.agents', 'skills') };
    return { agents: null, skills: home ? path.join(home, '.codex', 'skills') : null };
  },
  render(_canonical, _opts = {}) {
    return toCodex();
  },
});
