// Split a specification into atomic clauses, for skill://verifier.
//
// The verifier's core move is converting every spec clause into an observable
// assertion before reading the implementation — and the step that gets skipped
// is the splitting itself. Compound sentences get checked as one unit, the
// violated member hides inside the group, and the traceability table silently
// drops the half nobody wrote down.
//
//   node tools/clauses.mjs SPEC.md
//   node tools/clauses.mjs SPEC.md --json
//
// Output: the clause table skeleton in the shape skill://verifier's
// clause-to-check section requires. Splitting is mechanical; the falsifier,
// the seam and the verdict still need a mind. A clause that cannot be split
// further and cannot be observed is exactly what the unverifiable verdict is
// for.

import { readFileSync } from 'node:fs';
import process from 'node:process';

const file = process.argv[2];
if (!file || file === '-h' || file === '--help') {
  process.stdout.write('usage: node tools/clauses.mjs SPEC.md [--json]\n');
  process.exit(file ? 0 : 1);
}
const asJson = process.argv.includes('--json');

const text = readFileSync(file, 'utf8');

// Headings, fences and tables are structure, not requirements.
const prose = text
  .split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n')
  .replace(/```[\s\S]*?```/g, '')
  .split('\n')
  .filter((l) => !/^\s*\|.*\|\s*$/.test(l) || !/---/.test(l))
  .join('\n');

const bullets = [];
for (const raw of prose.split('\n')) {
  const m = raw.match(/^\s*(?:[-*]|\d+[.)])\s+(.*\S)\s*$/);
  if (m) bullets.push(m[1]);
}

const clauses = [];
for (const b of bullets) {
  // Split compound sentences on coordinating conjunctions that introduce a new
  // requirement. Deliberately conservative: it under-splits on purpose, because
  // an un-split clause is visible in the output while a wrongly split one is
  // not. Whatever survives as one row can still be split by hand.
  const parts = b
    .split(/;(?=\s)|,\s+(?:and|or)\s+(?=[A-Z])/g)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) clauses.push(p);
}

if (!clauses.length) {
  process.stderr.write('no bullet or numbered requirements found; nothing to split.\n');
  process.exit(2);
}

if (asJson) {
  process.stdout.write(
    JSON.stringify(
      clauses.map((clause, i) => ({
        id: `C${String(i + 1).padStart(2, '0')}`,
        clause,
        type: 'observable',
        seam: '',
        preconditions: '',
        action: '',
        falsifier: '',
        verdict: '',
      })),
      null,
      2
    ) + '\n'
  );
  process.exit(0);
}

process.stdout.write('| id | clause | type | seam | falsifier | verdict |\n');
process.stdout.write('|---|---|---|---|---|---|\n');
clauses.forEach((c, i) => {
  const id = `C${String(i + 1).padStart(2, '0')}`;
  process.stdout.write(`| ${id} | ${c.replace(/\|/g, '\\|')} | observable |  |  |  |\n`);
});
process.stdout.write(`\n${clauses.length} clause(s). Fill the seam and falsifier before opening the implementation.\n`);
