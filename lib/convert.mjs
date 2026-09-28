// OMP -> other-runtime agent conversion.
//
// This mirrors install-opencode.sh and install-claude.sh exactly. The two
// implementations are duplicated on purpose: the bash scripts are the
// dependency-free path for people who clone the repo, this is the cross-platform
// path for people who `npx` it. Duplication would be a defect if it were
// unchecked, so verify.sh check 12 diffs the two byte-for-byte for every agent.
// If you change a mapping here, change it there in the same commit or the
// check goes red.

import { asList, parseFrontmatter, serializeFrontmatter, yamlQuote } from './frontmatter.mjs';

// OMP tool name -> OpenCode tool name. An OMP tool with no entry is dropped.
const OMP_TO_OPENCODE = {
  read: 'read',
  grep: 'grep',
  glob: 'glob',
  bash: 'bash',
  edit: 'edit',
  write: 'write',
  web_search: 'webfetch',
  webfetch: 'webfetch',
  task: 'task',
};

// Emitted for every OpenCode agent, granted or not. Emitting the false entries
// is what stops a read-only role from inheriting write access from a runtime
// default, and it makes the granted set readable at a glance.
const OPENCODE_TOOL_ORDER = ['read', 'grep', 'glob', 'edit', 'write', 'patch', 'bash', 'webfetch', 'task'];

// OMP tool name -> Claude Code tool name.
const OMP_TO_CLAUDE = {
  read: 'Read',
  grep: 'Grep',
  glob: 'Glob',
  bash: 'Bash',
  edit: 'Edit',
  write: 'Write',
  web_search: 'WebSearch',
  webfetch: 'WebFetch',
  task: 'Task',
};

export const CLAUDE_MODELS = ['inherit', 'sonnet', 'opus', 'haiku'];

// Accepts either `tools: read, grep, glob` or the block form OMP bundles use.
// Normalizing here means an agent authored in either shape converts identically.
const grantedTools = (toolsValue) => asList(toolsValue).map((t) => t.replace(/\s/g, ''));

// OMP reasoning suffix -> Claude effort. Claude has no `max`; it stops at
// xhigh, so :max is reported as high. Approximate, and visible in the output.
function effortFor(model) {
  if (/:max$/.test(model)) return 'high';
  if (/:high$/.test(model)) return 'high';
  if (/:low$/.test(model)) return 'low';
  return 'medium';
}

function base(source) {
  const { data, body } = parseFrontmatter(source);
  if (!data.name) throw new Error('frontmatter has no name');
  if (!data.tools) throw new Error(`frontmatter has no tools (${data.name})`);
  return { data, body, granted: grantedTools(data.tools) };
}

export function toOpenCode(source, { temperature, steps } = {}) {
  const { data, body, granted } = base(source);
  const warnings = [];

  // Collapse onto OpenCode tool keys and dedupe. OMP's web_search and webfetch
  // both land on webfetch; emitting the key twice lets the later `false` win in
  // YAML and silently drop a granted capability.
  const grantedSet = new Set();
  for (const tool of granted) {
    const mapped = OMP_TO_OPENCODE[tool];
    if (mapped) grantedSet.add(mapped);
    else warnings.push(`${data.name}: OMP tool '${tool}' has no OpenCode equivalent; dropped`);
  }

  const tools = OPENCODE_TOOL_ORDER.map((tool) => `  ${tool}: ${grantedSet.has(tool)}`).join('\n');

  const fields = [
    ['description', yamlQuote(data.description || '')],
    ['mode', 'subagent'],
    ['tools', `\n${tools}`],
  ];
  if (temperature) fields.push(['temperature', String(temperature)]);
  if (steps) fields.push(['steps', String(steps)]);
  fields.push(['model', undefined]); // never emitted: OMP pins are not portable
 // never emitted: no nested-spawn equivalent

  if (data.model) {
    warnings.push(
      `${data.name}: dropped OMP model pin '${data.model}' — set it in OpenCode config, not in the agent file`
    );
  }
  if (data.spawns) {
    warnings.push(
      `${data.name}: dropped spawns='${data.spawns}' — OpenCode has no nested-spawn equivalent; this agent loses its tier-2 delegation`
    );
  }

  return { text: serializeFrontmatter(fields, body), warnings };
}

export function toClaude(source, { model = 'inherit' } = {}) {
  const { data, body, granted } = base(source);
  if (!CLAUDE_MODELS.includes(model)) {
    throw new Error(`--model must be one of: ${CLAUDE_MODELS.join(', ')} (got '${model}')`);
  }
  const warnings = [];

  const seen = new Set();
  const claudeTools = [];
  for (const tool of granted) {
    const mapped = OMP_TO_CLAUDE[tool];
    if (!mapped) {
      warnings.push(`${data.name}: OMP tool '${tool}' has no Claude Code equivalent; dropped`);
      continue;
    }
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    claudeTools.push(mapped);
  }

  const fields = [
    ['name', data.name],
    ['description', yamlQuote(data.description || '')],
    ['tools', claudeTools.join(',')],
    ['effort', effortFor(data.model || '')],
    ['model', model],
  ];

  if (data.model && model === 'inherit') {
    warnings.push(
      `${data.name}: dropped OMP model pin '${data.model}' — emitted 'model: inherit'. Pass --model to pin explicitly.`
    );
  }
  if (data.spawns) {
    warnings.push(
      `${data.name}: dropped spawns='${data.spawns}' — Claude Code has no nested-spawn equivalent; this agent loses its tier-2 delegation`
    );
  }

  return { text: serializeFrontmatter(fields, body), warnings };
}

export function convert(source, runtime, options) {
  if (runtime === 'omp') return { text: source, warnings: [] };
  if (runtime === 'opencode') return toOpenCode(source, options);
  if (runtime === 'claude') return toClaude(source, options);
  throw new Error(`unknown runtime '${runtime}' (expected omp, opencode, or claude)`);
}
