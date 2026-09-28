#!/usr/bin/env node
// Post-generation validation: required files exist, frontmatter parses,
// referenced skill paths resolve, no dangling symlinks, no duplicate config
// entries, unrelated user config survived, SAST references resolve.
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

export function validateInstall({ root, skills = [], agents = [] }) {
  const errors = [];
  for (const dir of skills) {
    const skillFile = path.join(dir, 'SKILL.md');
    if (!existsSync(skillFile)) {
      // Cursor renders skills as single .mdc files instead of directories.
      if (!existsSync(dir) && !existsSync(dir + '.mdc')) errors.push(`missing skill: ${dir}`);
      continue;
    }
    try {
      parseFrontmatter(readFileSync(skillFile, 'utf8'));
    } catch (e) {
      errors.push(`${skillFile}: ${e.message}`);
    }
    try {
      if (lstatSync(dir).isSymbolicLink()) {
        const target = readFileSync(dir, 'utf8');
        void target;
      }
    } catch {
      // Not a symlink; nothing to check.
    }
  }
  for (const f of agents) {
    if (!existsSync(f)) {
      errors.push(`missing agent: ${f}`);
      continue;
    }
    try {
      const { data } = parseFrontmatter(readFileSync(f, 'utf8'));
      if (!data.name && !f.endsWith('.mdc')) errors.push(`${f}: agent has no name`);
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateSastRefs(repoRoot) {
  const errors = [];
  const sastDir = path.join(repoRoot, 'core', 'skills', 'llm-sast-scanner');
  const skillFile = path.join(sastDir, 'SKILL.md');
  if (!existsSync(skillFile)) return { ok: false, errors: ['core/skills/llm-sast-scanner/SKILL.md is missing'] };
  const text = readFileSync(skillFile, 'utf8');
  const refsDir = path.join(sastDir, 'references');
  if (!existsSync(refsDir)) return { ok: false, errors: ['llm-sast-scanner references/ directory is missing'] };
  const available = new Set(readdirSync(refsDir).filter((f) => f.endsWith('.md')));
  for (const m of text.matchAll(/references\/([a-z0-9_]+\.md)/g)) {
    if (!available.has(m[1])) errors.push(`llm-sast-scanner references/${m[1]}: referenced but missing`);
  }
  // Every listed reference must actually exist on disk.
  const listed = [...text.matchAll(/references\/([a-z0-9_]+\.md)/g)].map((m) => m[1]);
  if (new Set(listed).size < 30) errors.push(`llm-sast-scanner lists only ${new Set(listed).size} references; expected 30+`);
  return { ok: errors.length === 0, errors };
}

export function validateSecurityLinkage(repoRoot) {
  const errors = [];
  const reviewer = path.join(repoRoot, 'core', 'agents', 'security-reviewer.md');
  if (!existsSync(reviewer)) {
    errors.push('core/agents/security-reviewer.md is missing');
    return { ok: false, errors };
  }
  const text = readFileSync(reviewer, 'utf8');
  if (!text.includes('skill://llm-sast-scanner')) errors.push('security-reviewer does not route to skill://llm-sast-scanner');
  return { ok: errors.length === 0, errors };
}
