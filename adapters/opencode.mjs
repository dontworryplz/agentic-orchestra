#!/usr/bin/env node
// OpenCode adapter: one supported target among many. Renders canonical agents
// into OpenCode's mode:subagent + explicit true/false tool map; skills copy
// verbatim. Model pins are dropped, never translated.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { toOpenCode } from '../lib/convert.mjs';

export const opencode = new RuntimeAdapter({
  id: 'opencode',
  displayName: 'OpenCode',
  binaryNames: ['opencode'],
  capabilities: { skills: true, agents: true, subagents: true, commands: true, rules: false, instructions: false, mcp: true, hooks: true },
  scopes: ['user', 'project'],
  nativeSupport: 'native',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: path.join(cwd, '.opencode', 'agent'), skills: path.join(cwd, '.agents', 'skills') };
    return {
      agents: home ? path.join(home, '.config', 'opencode', 'agents') : null,
      skills: home ? path.join(home, '.config', 'opencode', 'skills') : null,
    };
  },
  render(canonical, opts = {}) {
    return toOpenCode(canonical.sourceText, opts);
  },
});
