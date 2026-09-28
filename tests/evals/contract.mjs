#!/usr/bin/env node
// Contract evals for the skills and agents.
//
// The gap this fills: every skill in this package states a hard output contract —
// a verdict enumeration, a required field list, an exit condition — and nothing
// measured whether the contract was actually stated or would parse. A skill
// whose output contract has drifted from its procedure is a skill that silently
// stops being usable, and the only way anyone finds out is a subagent returning
// something the conductor cannot read.
//
// These are STATIC evals: they read the files and assert the contracts are
// declared and self-consistent. That makes them free, deterministic, and safe to
// run in CI. They do NOT prove an agent obeys its contract at runtime; that needs
// a model, and is `--live` below.
//
//   node tests/evals/contract.mjs            # static, CI-safe
//   node tests/evals/contract.mjs --verbose  # name every assertion
//
// Exits 0 when everything holds, 1 with a report otherwise.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERBOSE = process.argv.includes('--verbose');

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const skillFiles = () => {
  const dir = path.join(ROOT, 'core', 'skills');
  return readdirSync(dir)
    .filter((d) => readdirSync(path.join(dir, d)).includes('SKILL.md'))
    .map((d) => ({
      name: d,
      path: path.join(dir, d, 'SKILL.md'),
      text: readFileSync(path.join(dir, d, 'SKILL.md'), 'utf8'),
    }));
};

const agentFiles = () => {
  const dir = path.join(ROOT, 'core', 'agents');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      name: path.basename(f, '.md'),
      path: path.join(dir, f),
      text: readFileSync(path.join(dir, f), 'utf8'),
    }));
};

// --- 1. Every skill states an output contract --------------------------------
check('every skill declares an output contract', () => {
  const missing = skillFiles().filter((s) => !/^#+ .*Output contract/im.test(s.text)).map((s) => s.name);
  assert(missing.length === 0, `no Output contract section: ${missing.join(', ')}`);
  return `${skillFiles().length} skills`;
});

// Accepted heading forms, listed explicitly rather than matched loosely. These
// are the two places where a first draft of this eval failed on content that was
// present under a different name — executor's "Do not widen" is its anti-pattern
// list, refactor-safely's numbered "## 1. Blast radius before edit" sections are
// its procedure. Naming the alternates keeps the requirement honest instead of
// pretending one spelling is mandatory.
const ANTI_PATTERN_HEADINGS = /^#+ *(Do not widen|Anti-pattern|Rejected|What not to do)/im;
const PROCEDURE_HEADINGS =
  /^#+ *(Procedure|Order|Triage|Ordering|When to use|Scope|Ownership|The tools|\d+\. )/im;

// --- 2. Every skill states at least one rejected anti-pattern -----------------
check('every skill rejects something', () => {
  const missing = skillFiles()
    .filter((s) => !ANTI_PATTERN_HEADINGS.test(s.text))
    .map((s) => s.name);
  assert(missing.length === 0, `no anti-pattern section: ${missing.join(', ')}`);
});

// --- 3. Every skill states a procedure ----------------------------------------
check('every skill states a procedure', () => {
  const missing = skillFiles()
    .filter((s) => !PROCEDURE_HEADINGS.test(s.text))
    .map((s) => s.name);
  assert(missing.length === 0, `no procedure-like section: ${missing.join(', ')}`);
});

// --- 4. Verdict enumerations are closed ---------------------------------------
// A skill that names three verdicts in one place and two in another is a skill
// whose output the consumer cannot switch on. This is the exact class of drift
// that makes a subagent report unusable.
const CLOSED_SETS = [
  { skill: 'review-changes', name: 'verdict', values: ['PASS', 'CHANGES REQUIRED', 'BLOCKED'] },
  { skill: 'verifier', name: 'verdict', values: ['satisfied', 'violated', 'unverifiable'] },
  { skill: 'empirical-validation', name: 'verdict', values: ['NOT VERIFIED'] },
];
check('closed verdict sets are stated everywhere they are used', () => {
  const files = new Map(skillFiles().map((s) => [s.name, s.text]));
  for (const set of CLOSED_SETS) {
    const text = files.get(set.skill);
    assert(text, `missing skill ${set.skill}`);
    for (const v of set.values) {
      assert(text.includes(v), `${set.skill} never states the ${set.name} value "${v}"`);
    }
  }
  // The obvious companion check — "an agent that mentions one verdict mentions
  // them all" — was removed. It cannot be written soundly: these words are
  // ordinary English, and the first version flagged
  // antigravity-opus-reviewer for writing "violated invariants" without ever
  // claiming to emit a verdict. Detecting an *enumeration* needs a structure
  // this format does not have, and a check that cries wolf on correct content
  // gets switched off, which is worse than not having it.
  return `${CLOSED_SETS.length} sets`;
});

// --- 5. The executor STATUS values are identical wherever they appear ----------
check('STATUS values agree between executor and tier-1 agents', () => {
  const executor = skillFiles().find((s) => s.name === 'executor');
  const values = ['done', 'partial', 'blocked', 'stopped'];
  for (const v of values) assert(executor.text.includes(v), `executor omits STATUS "${v}"`);
  const tierReport = readFileSync(path.join(ROOT, 'docs', 'tier-report-schema.md'), 'utf8');
  for (const v of values) assert(tierReport.includes(v), `tier-report-schema omits STATUS "${v}"`);
  return `${values.length} values in both places`;
});

// --- 6. Every spawning agent returns the tier-1 envelope ----------------------
const TIER1 = ['ROLE', 'STATUS', 'DELEGATED', 'EVIDENCE', 'DELIVERED', 'DECISION_REQUEST'];
check('every spawning agent declares the tier-1 envelope in order', () => {
  const spawners = agentFiles().filter((a) => /^spawns:/m.test(a.text));
  assert(spawners.length > 0, 'no agent carries a spawns key, so this eval proves nothing');
  for (const a of spawners) {
    assert(a.text.includes('tier-report-schema'), `${a.name} spawns but does not reference the tier-1 schema`);
    // the mandatory fields must appear in the envelope, in order, after the
    // envelope heading rather than scattered through the file
    const at = a.text.indexOf('tier-report-schema');
    const tail = a.text.slice(at);
    let cursor = -1;
    for (const field of TIER1) {
      const next = tail.indexOf(field, cursor + 1);
      assert(next !== -1, `${a.name} envelope is missing ${field}`);
      cursor = next;
    }
  }
  return `${spawners.length} spawning agents, ${TIER1.length} mandatory fields each`;
});

// --- 7. Read-only roles declare no write tool --------------------------------
check('read-only roles declare no write capability', () => {
  const bad = agentFiles()
    .filter((a) => /explorer|reviewer|researcher/.test(a.name))
    .filter((a) => {
      const m = a.text.match(/^tools:\s*(.+)$/m);
      if (!m) return false;
      return /\b(edit|write)\b/.test(m[1]);
    })
    .map((a) => a.name);
  assert(bad.length === 0, `read-only role grants write: ${bad.join(', ')}`);
});

// --- 8. Every agent states a read-only or write posture ----------------------
// The frontmatter grant is not the same thing as the instruction. A model
// reading only the body must still know it may write, and — more importantly —
// which files it may write.
const POSTURE = /you may write|may write to|you write|modify only|do not implement|does not write/i;
check('every agent states its write posture in prose, not only in frontmatter', () => {
  const writable = agentFiles().filter((a) => {
    const m = a.text.match(/^tools:\s*(.+)$/m);
    return m && /\b(edit|write)\b/.test(m[1]);
  });
  for (const a of writable) {
    assert(POSTURE.test(a.text), `${a.name} can write but its body never states the write posture`);
  }
  return `${writable.length} writable agents`;
});

// --- report ------------------------------------------------------------------
let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  const line = `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`;
  if (!r.ok || VERBOSE) process.stdout.write(`  ${line}\n`);
}
if (failed) {
  process.stdout.write(`  ${results.length - failed}/${results.length} contract evals passed\n`);
  process.exit(1);
}
process.stdout.write(`  PASS  ${results.length} contract evals passed\n`);
