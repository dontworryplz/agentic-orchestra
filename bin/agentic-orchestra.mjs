#!/usr/bin/env node
// The npx entry point. Cross-platform install/uninstall/verify for the same
// package the bash scripts install, with the same non-clobbering contract.
//
//   npx agentic-orchestra                      # install for every runtime found
//   npx agentic-orchestra install omp          # one runtime
//   npx agentic-orchestra install all --dry-run
//   npx agentic-orchestra uninstall omp
//   npx agentic-orchestra verify
//   npx agentic-orchestra list
//   npx agentic-orchestra show luna-worker --runtime opencode
//   npx agentic-orchestra doctor

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { convert } from '../lib/convert.mjs';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { AGENTLESS_RUNTIMES, isRuntimeInstalled, repoRoot, resolvePaths, RUNTIMES } from '../lib/paths.mjs';
import { runChecks } from '../lib/verify.mjs';

const VERSION = '0.3.0';

const log = (msg = '') => process.stdout.write(`${msg}\n`);
const warn = (msg) => process.stderr.write(`  ! ${msg}\n`);
const fail = (msg) => {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
};

const USAGE = `agentic-orchestra ${VERSION} — multi-agent roles and skill procedures for OMP, OpenCode, and Claude Code

USAGE
  agentic-orchestra [install] [runtimes...] [options]
  agentic-orchestra uninstall <runtime> [options]
  agentic-orchestra verify [--fast] [--quiet]
  agentic-orchestra list
  agentic-orchestra show <agent> [--runtime <omp|opencode|claude>]
  agentic-orchestra doctor

RUNTIMES
  omp         ~/.omp/agent/agents  +  ~/.omp/skills
  opencode    ~/.config/opencode/{agents,skills}
  claude      ~/.claude/{agents,skills}
  all         every runtime, skipping those with no config directory

OPTIONS
  --project           install into ./.omp, ./.opencode or ./.claude instead
  --dry-run           print the plan, write nothing
  --force             overwrite files that already exist
  --agents-only       skip skills
  --skills-only       skip agents
  --temperature <n>   OpenCode only: emit a temperature field
  --steps <n>         OpenCode only: emit a steps field
  --model <m>         Claude only: inherit | sonnet | opus | haiku (default inherit)
  --yes               do not prompt
  -h, --help          this text
  -v, --version       print the version

Model pins are never invented. OMP pins provider-qualified model IDs that the
other runtimes cannot express, so the pin is dropped and reported on stderr.

EXAMPLES
  npx agentic-orchestra                          # install everywhere available
  npx agentic-orchestra install omp --dry-run    # see what would happen
  npx agentic-orchestra install opencode --project
  npx agentic-orchestra show luna-reviewer --runtime claude
`;

function parseArgs(argv) {
  const opts = {
    command: 'install',
    runtimes: [],
    project: false,
    dryRun: false,
    force: false,
    agentsOnly: false,
    skillsOnly: false,
    temperature: '',
    steps: '',
    model: 'inherit',
    yes: false,
    quiet: false,
    fast: false,
    show: '',
  };
  const rest = [...argv];

  const known = new Set([
    '--project', '--dry-run', '--force', '-f', '--agents-only', '--skills-only',
    '--yes', '-y', '--quiet', '-q', '--fast', '-h', '--help', '-v', '--version',
  ]);
  const valued = new Set(['--temperature', '--steps', '--model', '--runtime']);

  while (rest.length) {
    const arg = rest.shift();
    if (valued.has(arg)) {
      const value = rest.shift();
      if (value === undefined) fail(`${arg} requires a value`);
      if (arg === '--runtime') opts.runtimes.push(value);
      else if (arg === '--temperature') opts.temperature = value;
      else if (arg === '--steps') opts.steps = value;
      else if (arg === '--model') opts.model = value;
      continue;
    }
    if (known.has(arg)) {
      if (arg === '--project') opts.project = true;
      else if (arg === '--dry-run') opts.dryRun = true;
      else if (arg === '--force' || arg === '-f') opts.force = true;
      else if (arg === '--agents-only') opts.agentsOnly = true;
      else if (arg === '--skills-only') opts.skillsOnly = true;
      else if (arg === '--yes' || arg === '-y') opts.yes = true;
      else if (arg === '--quiet' || arg === '-q') opts.quiet = true;
      else if (arg === '--fast') opts.fast = true;
      else if (arg === '-h' || arg === '--help') opts.command = 'help';
      else if (arg === '-v' || arg === '--version') opts.command = 'version';
      continue;
    }
    if (arg.startsWith('-')) fail(`unknown option '${arg}' (try --help)`);
    if (['install', 'uninstall', 'verify', 'list', 'show', 'doctor', 'help'].includes(arg) && opts.runtimes.length === 0 && opts.command === 'install') {
      opts.command = arg;
      continue;
    }
    opts.runtimes.push(arg);
  }
  return opts;
}

function listAgents(root) {
  const dir = path.join(root, 'agents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const { data } = parseFrontmatter(readFileSync(path.join(dir, f), 'utf8'));
      return { file: f, name: data.name, description: data.description, model: data.model, tools: data.tools };
    });
}

function listSkills(root) {
  const dir = path.join(root, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

function resolveRuntimes(requested, opts) {
  if (requested.includes('all')) return [...RUNTIMES];
  if (requested.length) {
    for (const r of requested) {
      if (!RUNTIMES.includes(r)) fail(`unknown runtime '${r}' (expected ${RUNTIMES.join(', ')}, or all)`);
    }
    return requested;
  }
  // Default: every runtime whose config directory already exists. Installing
  // into a runtime the user has never run would create directories they do not
  // use.
  const found = RUNTIMES.filter((r) => {
    const { agents, skills } = isRuntimeInstalled(r, { project: opts.project });
    return existsSync(agents) || existsSync(skills);
  });
  return found.length ? found : ['omp'];
}

function installOne(runtime, root, opts, convertOptions) {
  const { agents: agentsDir, skills: skillsDir } = resolvePaths(runtime, { project: opts.project });
  log(`\n${runtime}`);
  log(`  agents: ${agentsDir === null ? '(not supported by this runtime)' : agentsDir}`);
  log(`  skills: ${skillsDir}`);

  let written = 0;
  let skipped = 0;
  let blocked = 0;
  let warningCount = 0;

  if (agentsDir === null) {
    // A runtime that cannot hold task agents. Reported, not silently skipped:
    // "12 agents installed" into a runtime that holds none is a lie.
    log(`  - agents: not supported (${AGENTLESS_RUNTIMES[runtime] || `${runtime} takes no agents`})`);
  } else if (!opts.skillsOnly) {
    for (const agent of listAgents(root)) {
      const source = readFileSync(path.join(root, 'agents', agent.file), 'utf8');
      let converted;
      try {
        converted = convert(source, runtime, convertOptions);
      } catch (error) {
        warn(`conversion failed for ${agent.name}: ${error.message}`);
        blocked += 1;
        continue;
      }
      for (const w of converted.warnings) {
        warningCount += 1;
        warn(w);
      }
      const dest = path.join(agentsDir, agent.file.replace(/\.md$/, extFor(runtime)));
      const status = writeFile(dest, converted.text, opts);
      if (status === 'written') written += 1;
      else if (status === 'skipped') skipped += 1;
      else blocked += 1;
    }
  }

  if (!opts.agentsOnly) {
    for (const skill of listSkills(root)) {
      if (runtime === 'cursor') {
        // A skill is a procedure, which is what a Cursor rule is. Same shape as
        // an agent rule: the body with the frontmatter stripped.
        const source = readFileSync(path.join(root, 'skills', skill, 'SKILL.md'), 'utf8');
        let rule;
        try {
          rule = convert(source, 'cursor', {}).text;
        } catch (error) {
          // One bad item must not abort the run: the remaining skills would be
          // silently left uninstalled, and the report would look complete.
          warn(`conversion failed for skill ${skill}: ${error.message}`);
          blocked += 1;
          continue;
        }
        const status = writeFile(path.join(skillsDir, `${skill}${extFor(runtime)}`), rule, opts);
        if (status === 'written') written += 1;
        else if (status === 'skipped') skipped += 1;
        else blocked += 1;
        continue;
      }
      const dest = path.join(skillsDir, skill);
      const status = copySkill(path.join(root, 'skills', skill), dest, opts);
      if (status === 'written') written += 1;
      else if (status === 'skipped') skipped += 1;
      else blocked += 1;
    }
  }

  log(`  ${written} written, ${skipped} unchanged, ${blocked} left alone${warningCount ? `, ${warningCount} warning(s)` : ''}`);
  return { written, skipped, blocked, warningCount };
}

// Cursor reads .mdc rule files; every other target reads .md.
function extFor(runtime) {
  return runtime === 'cursor' ? '.mdc' : '.md';
}

function writeFile(dest, content, opts) {
  if (existsSync(dest) && !opts.force) {
    if (readFileSync(dest, 'utf8') === content) {
      log(`  = ${dest} (identical, skipped)`);
      return 'skipped';
    }
    log(`  ! ${dest} exists and differs — re-run with --force to overwrite`);
    return 'blocked';
  }
  if (opts.dryRun) {
    log(`  + ${dest} (dry-run)`);
    return 'written';
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  log(`  + ${dest}`);
  return 'written';
}

function copySkill(srcDir, destDir, opts) {
  if (existsSync(destDir) && !opts.force) {
    if (readdirSync(srcDir).sort().join() === readdirSync(destDir).sort().join()) {
      const same = readdirSync(srcDir).every((f) => {
        const a = path.join(srcDir, f);
        const b = path.join(destDir, f);
        return existsSync(b) && readFileSync(a, 'utf8') === readFileSync(b, 'utf8');
      });
      if (same) {
        log(`  = ${destDir} (identical, skipped)`);
        return 'skipped';
      }
    }
    log(`  ! ${destDir} exists and differs — re-run with --force to overwrite`);
    return 'blocked';
  }
  if (opts.dryRun) {
    log(`  + ${destDir}/ (dry-run)`);
    return 'written';
  }
  mkdirSync(path.dirname(destDir), { recursive: true });
  rmSync(destDir, { recursive: true, force: true });
  cpSync(srcDir, destDir, { recursive: true });
  log(`  + ${destDir}/`);
  return 'written';
}

function uninstallOne(runtime, root, opts) {
  const { agents: agentsDir, skills: skillsDir } = resolvePaths(runtime, { project: opts.project });
  log(`\n${runtime}`);

  let removed = 0;
  let kept = 0;
  let absent = 0;

  for (const agent of agentsDir === null ? [] : listAgents(root)) {
    const dest = path.join(agentsDir, agent.file.replace(/\.md$/, extFor(runtime)));
    if (!existsSync(dest)) {
      log(`  - ${dest} (absent)`);
      absent += 1;
      continue;
    }
    const source = readFileSync(path.join(root, 'agents', agent.file), 'utf8');
    let expected;
    try {
      expected = convert(source, runtime, { temperature: opts.temperature, steps: opts.steps, model: opts.model }).text;
    } catch {
      expected = source;
    }
    if (!opts.force && readFileSync(dest, 'utf8') !== expected) {
      log(`  ! ${dest} modified since install — left in place (use --force to remove)`);
      kept += 1;
      continue;
    }
    if (opts.dryRun) {
      log(`  x ${dest} (dry-run)`);
    } else {
      rmSync(dest, { force: true });
      log(`  x ${dest}`);
    }
    removed += 1;
  }

  for (const skill of listSkills(root)) {
    // Cursor wrote this skill as a .mdc rule, not a directory, so looking for the
    // directory would report nine absent files that are all really there.
    if (runtime === 'cursor') {
      const rule = path.join(skillsDir, `${skill}${extFor(runtime)}`);
      if (!existsSync(rule)) {
        log(`  - ${rule} (absent)`);
        absent += 1;
        continue;
      }
      if (opts.dryRun) {
        log(`  x ${rule} (dry-run)`);
      } else {
        rmSync(rule, { force: true });
        log(`  x ${rule}`);
      }
      removed += 1;
      continue;
    }
    const dest = path.join(skillsDir, skill);
    if (!existsSync(dest)) {
      log(`  - ${dest} (absent)`);
      absent += 1;
      continue;
    }
    if (!opts.force) {
      const src = path.join(root, 'skills', skill);
      const same = readdirSync(src).every((f) => {
        const a = path.join(src, f);
        const b = path.join(dest, f);
        return existsSync(b) && readFileSync(a, 'utf8') === readFileSync(b, 'utf8');
      });
      if (!same) {
        log(`  ! ${dest} modified since install — left in place (use --force to remove)`);
        kept += 1;
        continue;
      }
    }
    if (opts.dryRun) {
      log(`  x ${dest}/ (dry-run)`);
    } else {
      rmSync(dest, { recursive: true, force: true });
      log(`  x ${dest}/`);
    }
    removed += 1;
  }

  log(`  removed=${removed}  kept(modified)=${kept}  absent=${absent}`);
  return { removed, kept, absent };
}

function main(argv) {
  const opts = parseArgs(argv);
  const root = repoRoot();

  if (opts.command === 'help') {
    log(USAGE);
    return 0;
  }
  if (opts.command === 'version') {
    log(VERSION);
    return 0;
  }

  if (opts.command === 'list') {
    const agents = listAgents(root);
    const skills = listSkills(root);
    log(`agents (${agents.length})`);
    for (const a of agents) {
      const tools = String(a.tools || '').replace(/\s/g, '');
      const rw = /(^|,)(edit|write)(,|$)/.test(tools) ? 'write' : 'read-only';
      log(`  ${a.name.padEnd(30)} ${rw.padEnd(10)} ${a.model || '(runtime default)'}`);
    }
    log('');
    log(`skills (${skills.length})`);
    for (const s of skills) log(`  ${s}`);
    return 0;
  }

  if (opts.command === 'doctor') {
    log(`agentic-orchestra ${VERSION}`);
    log(`  repo: ${root}`);
    log('');
    for (const runtime of RUNTIMES) {
      const state = isRuntimeInstalled(runtime, { project: opts.project });
      log(`${runtime}`);
      log(`  agents ${state.agents ? 'present' : 'absent '}  ${state.agentsDir}`);
      log(`  skills ${state.skills ? 'present' : 'absent '}  ${state.skillsDir}`);
      const installed = state.agents ? readdirSync(state.agentsDir).filter((f) => f.endsWith('.md')).length : 0;
      log(`  agent files present: ${installed}`);
    }
    log('');
    log(`  node ${process.version}`);
    return 0;
  }

  if (opts.command === 'show') {
    const name = opts.runtimes[0];
    if (!name) fail('show needs a name, e.g. `show luna-worker` or `show debug-issue`');
    // `--runtime` wins; otherwise `--model` implies Claude Code, since that is
    // the only target it affects.
    const explicit = argv.includes('--runtime')
      ? argv[argv.indexOf('--runtime') + 1]
      : opts.model !== 'inherit'
        ? 'claude'
        : 'opencode';
    if (!RUNTIMES.includes(explicit)) fail(`unknown runtime '${explicit}' (expected ${RUNTIMES.join(', ')})`);
    const file = path.join(root, 'agents', `${name}.md`);
    if (!existsSync(file)) fail(`no agent named '${name}' (try \`list\`)`);
    const result = convert(readFileSync(file, 'utf8'), explicit, {
      temperature: opts.temperature,
      steps: opts.steps,
      model: opts.model,
    });
    process.stdout.write(result.text);
    for (const w of result.warnings) warn(w);
    return 0;
  }

  if (opts.command === 'verify') {
    const result = runChecks(root, { fast: opts.fast, quiet: opts.quiet });
    log('');
    log(`${result.checks} checks, ${result.passed} assertions passed, ${result.failed} failed`);
    return result.failed === 0 ? 0 : 1;
  }

  const convertOptions = {
    temperature: opts.temperature,
    steps: opts.steps,
    model: opts.model,
  };

  if (opts.command === 'uninstall') {
    const runtimes = resolveRuntimes(opts.runtimes, opts);
    log(`agentic-orchestra uninstaller${opts.dryRun ? ' (dry-run)' : ''}`);
    for (const runtime of runtimes) uninstallOne(runtime, root, opts);
    return 0;
  }

  // install
  const runtimes = resolveRuntimes(opts.runtimes, opts);
  log(`agentic-orchestra ${VERSION} installer`);
  log(`  repo:   ${root}`);
  log(`  scope:  ${opts.project ? 'project' : 'user'}`);
  log(`  target: ${runtimes.join(', ')}`);
  if (opts.dryRun) log('  mode:   dry-run (no writes)');
  if (opts.force) log('  mode:   force (overwrite existing)');

  if (!runtimes.length) {
    log('');
    log('No runtime config directory found. Pass one explicitly: omp, opencode, claude, or all.');
    return 1;
  }

  let totals = { written: 0, skipped: 0, blocked: 0, warningCount: 0 };
  for (const runtime of runtimes) {
    const r = installOne(runtime, root, opts, convertOptions);
    totals = {
      written: totals.written + r.written,
      skipped: totals.skipped + r.skipped,
      blocked: totals.blocked + r.blocked,
      warningCount: totals.warningCount + r.warningCount,
    };
  }

  log('');
  log(`total: ${totals.written} written, ${totals.skipped} unchanged, ${totals.blocked} left alone`);
  if (totals.warningCount) {
    log(`${totals.warningCount} conversion warning(s) on stderr — nothing was invented to fill those gaps.`);
  }
  log('');
  log('Verify with:');
  log('  omp -p "list your available task agents"                      # OMP');
  log('  opencode run "list your available agents"                     # OpenCode');
  log('  claude -p "list your available agents"                       # Claude Code');
  return 0;
}

process.exitCode = main(process.argv.slice(2));
