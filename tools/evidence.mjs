// Evidence receipts for skill://empirical-validation.
//
// The skill demands that every claim cite an observation: the exact command,
// the working directory, the exit status, and the decisive output line. Stated
// as prose, that requirement rots — an agent paraphrases instead of quoting,
// rounds an exit code to "it worked", or reports a command from memory.
// This tool makes the requirement mechanical: run the command through it, and
// the receipt is the evidence.
//
//   node tools/evidence.mjs run --tier 4 --claim "the seam returns the tenant's rows" -- node server.mjs
//   node tools/evidence.mjs show
//   node tools/evidence.mjs show --claim seam
//
// A receipt is a JSON line in ./.evidence.jsonl. It is a local artifact of one
// task, not a repository file: recording an observation and committing it as
// project history are different acts, and the second one needs a human.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RECEIPT_FILE = '.evidence.jsonl';

function usage() {
  process.stdout.write(
    'evidence — mechanical proof capture for skill://empirical-validation\n\n' +
    '  node tools/evidence.mjs run --tier <1-5> --claim "<falsifiable claim>" -- <command...>\n' +
    '  node tools/evidence.mjs show [--claim <substring>]\n' +
    '  node tools/evidence.mjs verify   # every NOT VERIFIED receipt names its missing tier\n\n' +
    'Tiers are the proof ladder in skill://empirical-validation. A receipt that\n' +
    'cannot state its tier is an anecdote with formatting, not evidence.\n'
  );
  process.exit(1);
}

function splitArgs(argv) {
  // Everything after `--` is the command; everything before is options.
  const sep = argv.indexOf('--');
  const flags = sep === -1 ? argv : argv.slice(0, sep);
  const command = sep === -1 ? [] : argv.slice(sep + 1);
  const opts = {};
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i].startsWith('--')) {
      opts[flags[i].slice(2)] = flags[i + 1] && !flags[i + 1].startsWith('--') ? flags[++i] : true;
    }
  }
  return { opts, command };
}

function writeReceipt(entry) {
  appendFileSync(RECEIPT_FILE, `${JSON.stringify(entry)}\n`);
}

if (process.argv[2] === 'run') {
  const { opts, command } = splitArgs(process.argv.slice(3));
  if (!command.length) usage();

  const tier = Number(opts.tier);
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
    process.stderr.write('error: --tier 1-5 is required. The tier decides what the observation can prove.\n');
    process.exit(2);
  }
  if (!opts.claim) {
    process.stderr.write('error: --claim is required. A measurement without the claim it falsifies is trivia.\n');
    process.exit(2);
  }

  const res = spawnSync(command[0], command.slice(1), { encoding: 'utf8', shell: false });
  const output = [res.stdout || '', res.stderr || ''].join('').split('\n');
  const decisive = output.filter((l) => l.trim()).slice(-5).join('\n');

  const receipt = {
    claim: opts.claim,
    tier,
    command: command.join(' '),
    cwd: process.cwd(),
    status: res.status,
    signal: res.signal || null,
    decisive,
    at: new Date().toISOString(),
  };
  writeReceipt(receipt);

  process.stdout.write(`tier ${tier}  exit ${res.status}\n${decisive}\n`);
  process.stdout.write(`\nreceipt appended to ${RECEIPT_FILE}\n`);
  process.exit(res.status === 0 ? 0 : 1);
}

if (process.argv[2] === 'show') {
  if (!existsSync(RECEIPT_FILE)) {
    process.stdout.write('no receipts yet\n');
    process.exit(0);
  }
  const { opts } = splitArgs(process.argv.slice(3));
  const lines = readFileSync(RECEIPT_FILE, 'utf8').trim().split('\n').filter(Boolean);
  let shown = 0;
  for (const line of lines) {
    const r = JSON.parse(line);
    if (opts.claim && !String(r.claim).includes(String(opts.claim))) continue;
    shown += 1;
    process.stdout.write(
      `claim:   ${r.claim}\n` +
      `tier:    ${r.tier}  exit: ${r.status}  at: ${r.at}\n` +
      `command: ${r.command}  (in ${r.cwd})\n` +
      `--- decisive output ---\n${r.decisive}\n\n`
    );
  }
  process.stdout.write(`${shown}/${lines.length} receipt(s)\n`);
  process.exit(0);
}

if (process.argv[2] === 'verify') {
  if (!existsSync(RECEIPT_FILE)) {
    process.stdout.write('no receipts yet\n');
    process.exit(0);
  }
  const lines = readFileSync(RECEIPT_FILE, 'utf8').trim().split('\n').filter(Boolean);
  const bad = [];
  lines.forEach((line, i) => {
    const r = JSON.parse(line);
    if (!Number.isInteger(r.tier) || r.tier < 1 || r.tier > 5) bad.push(`line ${i + 1}: no valid tier`);
    if (!r.claim || r.claim.length < 10) bad.push(`line ${i + 1}: claim is not falsifiable ("${r.claim}")`);
    if (r.status === undefined) bad.push(`line ${i + 1}: no exit status recorded`);
    if (!r.decisive || !r.decisive.trim()) bad.push(`line ${i + 1}: no decisive output`);
  });
  if (bad.length) {
    for (const b of bad) process.stdout.write(`  FAIL  ${b}\n`);
    process.exit(1);
  }
  process.stdout.write(`  PASS  ${lines.length} receipt(s), each with tier, claim, status and output\n`);
  process.exit(0);
}

usage();
