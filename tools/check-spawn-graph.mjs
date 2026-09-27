#!/usr/bin/env node
// Assert that the nested-spawn graph in agents/ is safe.
//
// OMP treats `spawns` as a capability grant: an agent without the key cannot
// spawn at all ("none (spawns disabled for this agent)"). A malformed graph is
// therefore never a crash — it is an agent that silently cannot delegate, or a
// cycle that recurses until the budget dies. Neither surfaces as an error, so
// both are asserted here.
//
// Checks: targets exist, no self-spawn, acyclic, depth bounded, and every
// runtime conversion drops `spawns` rather than emitting a field it cannot
// honour.
//
// Run standalone:  node tools/check-spawn-graph.mjs
// Exits 0 on success, 1 with a report on failure.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Levels of *spawning hops* below any single agent. The shipped tree is:
//   level 0  the root session (Sol)
//   level 1  luna-coordinator, luna-integrator, luna-tester  (these have spawns)
//   level 2  the leaves (these do not)
// so a level-1 agent makes exactly one hop and the tree is two tiers deep.
// MAX_DEPTH is therefore 1, not 2. An off-by-one here lets a leaf grow a chain
// and nobody notices until the bill arrives.
const MAX_DEPTH = 1;

function readAgents() {
  const dir = path.join(ROOT, 'agents');
  const agents = new Map();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const text = readFileSync(path.join(dir, f), 'utf8');
    const name = (text.match(/^name:\s*(.+)$/m) || [])[1];
    const raw = (text.match(/^spawns:\s*(.+)$/m) || [])[1];
    let spawns = [];
    if (raw) {
      const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
      spawns = inner
        .split(',')
        .map((s) => s.trim().replace(/^["']/, '').replace(/["']$/, ''))
        .filter(Boolean);
    }
    if (name) agents.set(name, { file: f, spawns });
  }
  return agents;
}

const problems = [];
const agents = readAgents();

// 1. every spawn target exists
for (const [name, a] of agents) {
  for (const child of a.spawns) {
    if (child === '*') continue;
    if (!agents.has(child)) problems.push(`${name} spawns unknown agent "${child}"`);
  }
}

// 2. no self-spawn
for (const [name, a] of agents) {
  if (a.spawns.includes(name)) problems.push(`${name} spawns itself`);
}

// 3. acyclic, and depth bounded
const state = new Map();
const depthCache = new Map();
function visit(n, pathSeen) {
  if (state.get(n) === 'done') return depthCache.get(n) || 0;
  if (state.get(n) === 'open') {
    problems.push(`spawn cycle: ${[...pathSeen, n].join(' -> ')}`);
    return 0;
  }
  state.set(n, 'open');
  let max = 0;
  for (const child of (agents.get(n) || { spawns: [] }).spawns) {
    if (child === '*') continue;
    const d = visit(child, [...pathSeen, n]) + 1;
    if (d > max) max = d;
  }
  state.set(n, 'done');
  depthCache.set(n, max);
  return max;
}
for (const n of agents.keys()) visit(n, []);

let deepest = 0;
let deepestFrom = '';
for (const n of agents.keys()) {
  const d = depthCache.get(n) || 0;
  if (d > deepest) {
    deepest = d;
    deepestFrom = n;
  }
}
if (deepest > MAX_DEPTH) {
  problems.push(`spawn graph is ${deepest} levels deep (limit ${MAX_DEPTH}); deepest chain starts at ${deepestFrom}`);
}

// 4. conversion must drop spawns, and say so
const cli = path.join(ROOT, 'bin', 'agentic-orchestra.mjs');
if (existsSync(cli)) {
  for (const [name, a] of agents) {
    if (!a.spawns.length) continue;
    for (const rt of ['opencode', 'claude']) {
      // spawnSync, not execFileSync: the latter sends a child's stderr to the
      // parent's stderr by default, which floods this report, and on success
      // there is no error object to read stderr from — so a silent conversion
      // would look identical to a reported one.
      const res = spawnSync('node', [cli, 'show', name, '--runtime', rt], { encoding: 'utf8' });
      const out = res.stdout || '';
      const err = res.stderr || '';
      if (/^spawns:/m.test(out)) {
        problems.push(`${rt} output for ${name} kept a spawns field it cannot honour`);
      }
      if (!/dropped spawns=/.test(err)) {
        problems.push(`${rt} conversion for ${name} dropped spawns without reporting it`);
      }
    }
  }
}

if (problems.length) {
  for (const p of problems) process.stdout.write(`  FAIL  ${p}\n`);
  process.exit(1);
}

const spawners = [...agents].filter(([, a]) => a.spawns.length).map(([n]) => n);
process.stdout.write(
  `  PASS  ${agents.size} agents, ${spawners.length} can delegate (${spawners.join(', ')}), ` +
    `graph acyclic, max depth ${deepest}\n`
);
