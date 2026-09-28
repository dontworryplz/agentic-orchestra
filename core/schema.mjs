#!/usr/bin/env node
// Canonical vendor-neutral schema: single source of truth.
// core/agents/*.md and core/skills/*/SKILL.md are authored once in OMP-compatible
// frontmatter; adapters render. Never maintain per-provider copies.

import { parseFrontmatter, asList } from '../lib/frontmatter.mjs';

export const CANONICAL_TOOLS = ['read', 'grep', 'glob', 'bash', 'edit', 'write', 'web_search', 'webfetch', 'task', 'lsp'];
export const CANONICAL_KINDS = ['agent', 'subagent', 'skill', 'command', 'rule', 'instruction'];

export function effortFor(model) {
  if (!model) return 'medium';
  if (/:max$/.test(model)) return 'high';
  if (/:high$/.test(model)) return 'high';
  if (/:low$/.test(model)) return 'low';
  return 'medium';
}

export function parseCanonicalAgent(source, { file = '' } = {}) {
  const { data, body } = parseFrontmatter(source);
  if (!data.name) throw new Error(`frontmatter has no name (${file})`);
  if (!data.tools) throw new Error(`frontmatter has no tools (${data.name})`);
  const tools = asList(data.tools).map((t) => t.replace(/\s/g, ''));
  const filesystemWrite = tools.includes('edit') || tools.includes('write');
  return {
    kind: 'agent',
    name: data.name,
    description: data.description || '',
    version: data.version || '',
    body: body.replace(/^\n+/, ''),
    sourceText: source,
    capabilities: {
      tools,
      spawns: asList(data.spawns),
      network: tools.includes('web_search') || tools.includes('webfetch'),
      filesystemWrite,
    },
    model: { pinned: data.model || '', effort: effortFor(data.model || ''), portable: false },
    source: { file, origin: 'core' },
    readOnly: !filesystemWrite,
  };
}

export function parseCanonicalSkill(source, { dir = '', name = '' } = {}) {
  const { data, body } = parseFrontmatter(source);
  const skillName = data.name || name;
  if (!skillName) throw new Error(`skill has no name (${dir})`);
  const handoffs = [...body.matchAll(/skill:\/\/([a-z0-9-]+)/g)].map((m) => m[1]);
  return {
    kind: 'skill',
    name: skillName,
    description: data.description || '',
    version: (data.metadata && data.metadata.version) || data.version || '',
    body: body.replace(/^\n+/, ''),
    sourceText: source,
    capabilities: { tools: [], spawns: [], handoffs },
    source: { dir, origin: 'core' },
  };
}
