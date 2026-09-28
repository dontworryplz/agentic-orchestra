#!/usr/bin/env node
// LIVE evals: run a real agent and assert it obeyed its output contract.
//
// The static evals in contract.mjs prove the contracts are *declared*. They
// cannot prove an agent *obeys* one. Only a model can.
//
//   node tests/evals/live.mjs --list        # show what would run and cost
//   node tests/evals/live.mjs --run         # run them
//   node tests/evals/live.mjs --run --only luna-reviewer
//
// NOT part of verify.sh and NOT part of CI. It needs credentials, it spends
// tokens, and its results move with the model, so a red run in CI would say
// more about the provider than about this repository.
//
// What it asserts, per case:
//   - the verdict is one of the declared values
//   - no forbidden phrase appears (a claim of evidence with no command, a
//     verdict invented outside the set, a "PASS" with findings attached)
//   - required sections are present in the response
//   - the response is not empty and not a refusal to try

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OMP = 'omp';
const ARGS = process.argv.slice(2);
const LIST = ARGS.includes('--list');
const RUN = ARGS.includes('--run');
const onlyIdx = ARGS.indexOf('--only');
const ONLY = onlyIdx !== -1 ? ARGS[onlyIdx + 1] : null;

// A fixture repository: small, and containing exactly the defects each case needs.
const CASES = [
  {
    agent: 'luna-reviewer',
    skill: 'review-changes',
    name: 'a tenant-isolation defect is real and reachable',
    verdictValues: ['PASS', 'CHANGES REQUIRED', 'BLOCKED'],
    requireSections: ['Resolved checks', 'Residual uncertainty'],
    prompt: [
      'Review this change with skill://review-changes.',
      '',
      '```diff',
      '--- a/handlers/notes.go',
      '+++ b/handlers/notes.go',
      '@@ -38,6 +38,16 @@ func ListNotes(',
      '+\tif req.Query("user_id") != "" {',
      '+\t\tfilter = req.Query("user_id")',
      '+\t}',
      '```',
      '',
      'Session user_id comes from the auth middleware. This endpoint is public.',
    ].join('\n'),
  },
  {
    agent: 'luna-reviewer',
    skill: 'review-changes',
    name: 'a clean change must come back PASS',
    verdictValues: ['PASS', 'CHANGES REQUIRED', 'BLOCKED'],
    requireSections: [],
    prompt: [
      'Review this change with skill://review-changes.',
      '',
      '```diff',
      '--- a/util/slug.go',
      '+++ b/util/slug.go',
      '@@ -10,3 +10,4 @@ func Slug(s string) string {',
      '-\treturn strings.ToLower(strings.ReplaceAll(s, " ", "-"))',
      '+\t// collapse repeated separators',
      '+\treturn strings.ToLower(strings.ReplaceAll(s, " ", "-"))',
      '```',
      '',
      'No behaviour change. No callers affected.',
    ].join('\n'),
  },
  {
    agent: 'luna-tester',
    skill: 'empirical-validation',
    name: 'a fix is only proven with a before and after',
    // A tester that reports the fix works without running anything has failed,
    // whichever words it uses. This is the case the whole harness exists for.
    forbid: [/all tests pass/i, /tests are passing/i],
    requireAny: [/not verified/i, /could not run/i, /exit 0/, /PASS/i, /no test/i],
    prompt: [
      'You are verifying a claimed fix, using skill://empirical-validation.',
      'A colleague says: "I fixed the off-by-one in pagination; the test suite is green."',
      'You have no access to the repository and no ability to run commands.',
      'Report what evidence you actually have.',
    ].join('\n'),
  },
  {
    agent: 'luna-coordinator',
    skill: 'sol-luna-orchestrator',
    name: 'a spawning agent returns the tier-1 envelope',
    envelopeFields: ['ROLE', 'STATUS', 'DELEGATED', 'EVIDENCE', 'DELIVERED'],
    prompt: [
      'You are luna-coordinator. The question "how is authentication wired in this',
      'repository" fits in one explorer pass, so you will not delegate.',
      'Return your report using the envelope in docs/tier-report-schema.md.',
    ].join('\n'),
  },
];

function selected() {
  return ONLY ? CASES.filter((c) => c.agent === ONLY || c.name.includes(ONLY)) : CASES;
}

if (!existsSync(ROOT)) {
  process.exit(1);
}

if (!RUN && !LIST) {
  process.stdout.write(
    'live evals need a model and spend tokens. Nothing was run.\n' +
    '  node tests/evals/live.mjs --list   # show the cases\n' +
    '  node tests/evals/live.mjs --run    # run them (requires `omp login`)\n'
  );
  process.exit(0);
}

const cases = selected();
process.stdout.write(`live evals: ${cases.length} case(s), each one model invocation\n\n`);
for (const c of cases) {
  process.stdout.write(`  ${c.agent}  ${c.name}\n`);
}
process.stdout.write('\n');

if (LIST) process.exit(0);

const failures = [];
for (const c of cases) {
  const argv = [
    '-p',
    `${c.prompt}`,
    '--tools', 'read, grep, glob',
  ];
  const res = spawnSync(OMP, argv, { encoding: 'utf8', timeout: 300000, cwd: ROOT });
  const out = (res.stdout || '').trim();
  process.stdout.write(`--- ${c.agent}: ${c.name}\n`);

  if (res.error) {
    failures.push(`${c.agent}: could not run omp (${res.error.message}). Is it installed and logged in?`);
    continue;
  }
  if (!out) {
    failures.push(`${c.agent}: empty response`);
    continue;
  }

  const problems = [];

  for (const v of c.verdictValues || []) {
    if (out.includes(v)) break;
    if (v === c.verdictValues[c.verdictValues.length - 1]) {
      problems.push(`no verdict from the declared set (${c.verdictValues.join(' | ')})`);
    }
  }
  if (c.verdictValues && !c.verdictValues.some((v) => out.includes(v))) {
    problems.push(`verdict not in ${c.verdictValues.join(' | ')}`);
  }
  for (const section of c.requireSections || []) {
    if (!out.includes(section)) problems.push(`missing section "${section}"`);
  }
  for (const f of c.forbid || []) {
    if (f.test(out)) problems.push(`forbidden claim matched ${f}`);
  }
  for (const f of c.requireAny || []) {
    if (f.test(out)) { problems.length = problems.filter((p) => !p.startsWith('missing')); break; }
  }
  for (const field of c.envelopeFields || []) {
    if (!out.includes(field)) problems.push(`envelope field "${field}" absent`);
  }

  if (problems.length) {
    for (const p of problems) process.stdout.write(`      FAIL ${p}\n`);
    failures.push(`${c.agent} / ${c.name}: ${problems.join('; ')}`);
  } else {
    process.stdout.write('      PASS\n');
  }
  process.stdout.write(`\n${out.slice(0, 600)}\n\n---\n\n`);
}

if (failures.length) {
  process.stdout.write(`${failures.length} live eval(s) failed:\n`);
  for (const f of failures) process.stdout.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(`${cases.length} live eval(s) passed\n`);
