#!/usr/bin/env node
// Provider registry: one adapter + one registry entry + tests per provider.
// Callers use capabilities, never provider-name conditionals.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { RuntimeAdapter } from './base.mjs';
import { omp } from './omp.mjs';
import { opencode } from './opencode.mjs';
import { claude } from './claude.mjs';
import { codex } from './codex.mjs';
import { cursor } from './cursor.mjs';
import { gemini } from './gemini.mjs';
import { copilot } from './copilot.mjs';
import { qwen } from './qwen.mjs';
import { aider } from './aider.mjs';
import { amp } from './amp.mjs';
import { cont as continueAdapter } from './continue.mjs';
import { generic } from './generic.mjs';

const BUILTINS = [omp, opencode, claude, codex, cursor, gemini, copilot, qwen, aider, amp, continueAdapter, generic];

export const PROVIDER_IDS = BUILTINS.map((a) => a.id);

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function loadCustom(home = homedir()) {
  const p = path.join(home, '.config', 'agentic-orchestra', 'adapters.json');
  if (!existsSync(p)) return [];
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const list = data.providers || [];
    return list.map(
      (e) =>
        new RuntimeAdapter({
          id: e.id,
          displayName: e.displayName || e.id,
          binaryNames: e.binaries || [],
          capabilities: e.capabilities || { skills: true, instructions: true },
          scopes: e.scopes || ['project'],
          nativeSupport: 'fallback',
          notes: 'User-defined provider.',
          configLocations({ project = false, cwd = process.cwd(), home: h = home } = {}) {
            const skills = e.skills || {};
            if (project) return { agents: null, skills: skills.project ? path.join(cwd, skills.project) : null };
            return { agents: null, skills: skills.global ? path.join(h, skills.global.replace(/^~\//, '')) : null };
          },
          render(canonical, _opts = {}) {
            return { text: canonical.body, warnings: [`${canonical.name}: installed via user-defined provider '${e.id}'`] };
          },
        })
    );
  } catch {
    return [];
  }
}

export function allAdapters(home = homedir()) {
  return [...BUILTINS, ...loadCustom(home)];
}

export function getAdapter(id, home = homedir()) {
  const all = allAdapters(home);
  const exact = all.find((a) => a.id === id);
  if (exact) return exact;
  const matches = all.filter((a) => a.id.startsWith(id) || id === a.displayName.toLowerCase().replace(/[\s-]+/g, ''));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`ambiguous provider '${id}': could be ${matches.map((m) => m.id).join(', ')}`);
  throw new Error(`unknown provider '${id}' (expected one of: ${all.map((a) => a.id).join(', ')})`);
}

function binaryOnPath(name) {
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(path.delimiter);
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE').split(';') : [''];
  return dirs.some((d) => exts.some((e) => existsSync(path.join(d, name + e))));
}

// Detection only marks; it never installs anything.
export function detect(home = homedir()) {
  let registry = [];
  try {
    registry = JSON.parse(readFileSync(path.join(repoRoot(), 'registry', 'providers.json'), 'utf8')).providers;
  } catch {
    registry = [];
  }
  const byId = new Map(registry.map((p) => [p.id, p]));
  return allAdapters(home).map((adapter) => {
    const entry = byId.get(adapter.id);
    const configDirs = (entry && entry.configDirs) || [];
    const foundBinary = (adapter.binaryNames || []).some(binaryOnPath);
    const foundDir = configDirs.some((d) => {
      const expanded = d.startsWith('~/') ? path.join(home, d.slice(2)) : d;
      return existsSync(expanded);
    });
    return { adapter, detected: Boolean(foundBinary || foundDir) };
  });
}
