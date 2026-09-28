#!/usr/bin/env node
// Cursor adapter (compatibility layer): Cursor reads .mdc rules, not agent
// definitions, so agents and skills both render as rule bodies with the
// frontmatter stripped. Labeled as a wrapper, never as native agent support.
import path from 'node:path';
import { RuntimeAdapter } from './base.mjs';
import { toCursor } from '../lib/convert.mjs';

export const cursor = new RuntimeAdapter({
  id: 'cursor',
  displayName: 'Cursor',
  binaryNames: ['cursor', 'cursor-agent'],
  capabilities: { skills: true, agents: false, subagents: false, commands: false, rules: true, instructions: false, mcp: true, hooks: false },
  scopes: ['user', 'project'],
  nativeSupport: 'rules-wrapper',
  configLocations({ project = false, cwd = process.cwd(), home = null } = {}) {
    if (project) return { agents: path.join(cwd, '.cursor', 'rules'), skills: path.join(cwd, '.agents', 'skills') };
    return {
      agents: home ? path.join(home, '.cursor', 'rules') : null,
      skills: home ? path.join(home, '.cursor', 'skills') : null,
    };
  },
  render(canonical, _opts = {}) {
    return toCursor(canonical.sourceText);
  },
});
