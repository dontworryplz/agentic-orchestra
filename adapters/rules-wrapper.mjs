#!/usr/bin/env node
// Shared compatibility-layer renderer: no native agent format exists (or none
// is verified), so the agent becomes an instruction block the CLI actually
// reads, labeled as what it is. Never presented as native support.
import { parseFrontmatter } from '../lib/frontmatter.mjs';

export function renderRulesWrapper(source, providerDisplayName, agentName = 'agent') {
  const { data, body } = parseFrontmatter(source);
  const name = data.name || agentName;
  const header =
    `# Agent role: ${name} (agentic-orchestra compatibility rule)\n` +
    `# Native agent support: no. This is the agent's instruction text, rendered\n` +
    `# for ${providerDisplayName} because it has no verified agent format.\n` +
    `# Role: ${data.description || ''}\n\n`;
  return {
    text: header + body.replace(/^\n+/, ''),
    warnings: [`${name}: rendered as instruction text for ${providerDisplayName} (no native agent format)`],
  };
}
