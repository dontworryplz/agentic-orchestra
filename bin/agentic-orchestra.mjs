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

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { convert } from '../lib/convert.mjs';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { AGENTLESS_RUNTIMES, isRuntimeInstalled, repoRoot, resolvePaths, RUNTIMES } from '../lib/paths.mjs';
import { dirMatches as treesEqual } from '../lib/drift.mjs';
import { driftFor, isClean, summarize } from '../lib/drift.mjs';
import { runChecks } from '../lib/verify.mjs';

const VERSION = '0.4.0';

const log = (msg = '') => process.stdout.write(`${msg}\n`);
const warn = (msg) => process.stderr.write(`  ! ${msg}\n`);
const fail = (msg) => {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
};

const USAGE = `agentic-orchestra ${VERSION} — one agent toolkit, every AI coding tool

USAGE
  agentic-orchestra [install] [providers...] [options]
  agentic-orchestra update [providers...] [--dry-run] [--force]
  agentic-orchestra drift [providers...]
  agentic-orchestra uninstall <provider> [--dry-run] [--force]
  agentic-orchestra verify [--fast] [--quiet]
  agentic-orchestra list
  agentic-orchestra show <name> [--runtime <provider>]
  agentic-orchestra doctor

PROVIDERS (pick any number; detection only marks, never installs)
  omp         OMP                  native agents + skills
  opencode    OpenCode             native agents + skills
  claude-code Claude Code          native agents + skills
  codex       Codex CLI            skills only (no verified agent format)
  cursor      Cursor               .mdc rules wrapper (compatibility)
  gemini      Gemini CLI           skills + instruction wrapper (compatibility)
  copilot     Copilot CLI          skills + instruction wrapper (compatibility)
  qwen        Qwen Code            skills + instruction wrapper (compatibility)
  aider       Aider                skills + conventions wrapper (compatibility)
  amp         Amp                  skills + AGENTS.md wrapper (compatibility)
  continue    Continue             skills + instruction wrapper (compatibility)
  generic     Generic Agent Skills .agents/skills + AGENTS.md (fallback)
  all         every provider with a config directory already present

UPDATE AND DRIFT
  drift reports five states per runtime, and the difference between them is the
  point: current, stale (ours from an older version), local (ours, but you
  edited it), extra (installed under a name this version no longer ships), and
  absent (in this version, not installed). update adds what is absent, refreshes
  what is stale, and never touches what is local without --force.

  The skills directory is shared with other tools, so an unfamiliar skill there is
  reported as "not ours" and is never a removal candidate. Only the agents
  directory belongs to this package, so only there is 'extra' actionable.

OPTIONS
  --target <id>       provider to configure; repeatable (alias: --runtime)
  --scope <s>         project | global | both (only scopes every selection supports)
  --project           shortcut for --scope project
  --components <list> comma list: agents,skills,sast,rules (default: capabilities)
  --dry-run           print the plan, write nothing
  --force             overwrite files that already exist
  --agents-only       install agents only
  --skills-only       install skills only
  --sast-only         install the SAST skill only
  --temperature <n>   OpenCode only: emit a temperature field
  --steps <n>         OpenCode only: emit a steps field
  --model <m>         Claude only: inherit | sonnet | opus | haiku (default inherit)
  --yes, -y           do not prompt (non-interactive)
  --wizard            force the interactive multi-select wizard
  -h, --help          this text
  -v, --version       print the version

Model pins are never invented. OMP pins provider-qualified model IDs that the
other providers cannot express, so the pin is dropped and reported on stderr.

EXAMPLES
  npx agentic-orchestra --wizard                 # detected tools, pick any number
  npx agentic-orchestra install --target claude-code --target codex --scope global
  npx agentic-orchestra install opencode --scope project --dry-run
  npx agentic-orchestra show luna-reviewer --runtime claude-code
  npx agentic-orchestra show security-reviewer --runtime generic
`;

function parseArgs(argv) {
  const opts = {
    command: 'install',
    runtimes: [],
    project: false,
    scope: '',
    components: '',
    dryRun: false,
    force: false,
    agentsOnly: false,
    skillsOnly: false,
    sastOnly: false,
    installRules: false,
    rulesOnly: false,
    wizard: false,
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
    '--sast-only', '--wizard', '--yes', '-y', '--quiet', '-q', '--fast',
    '-h', '--help', '-v', '--version',
  ]);
  const valued = new Set(['--temperature', '--steps', '--model', '--runtime', '--target', '--scope', '--components']);

  while (rest.length) {
    const arg = rest.shift();
    if (valued.has(arg)) {
      const value = rest.shift();
      if (value === undefined) fail(`${arg} requires a value`);
      if (arg === '--runtime' || arg === '--target') opts.runtimes.push(value);
      else if (arg === '--temperature') opts.temperature = value;
      else if (arg === '--steps') opts.steps = value;
      else if (arg === '--model') opts.model = value;
      else if (arg === '--scope') opts.scope = value;
      else if (arg === '--components') opts.components = value;
      continue;
    }
    if (known.has(arg)) {
      if (arg === '--project') opts.project = true;
      else if (arg === '--dry-run') opts.dryRun = true;
      else if (arg === '--force' || arg === '-f') opts.force = true;
      else if (arg === '--agents-only') opts.agentsOnly = true;
      else if (arg === '--skills-only') opts.skillsOnly = true;
      else if (arg === '--sast-only') opts.sastOnly = true;
      else if (arg === '--wizard') opts.wizard = true;
      else if (arg === '--yes' || arg === '-y') opts.yes = true;
      else if (arg === '--quiet' || arg === '-q') opts.quiet = true;
      else if (arg === '--fast') opts.fast = true;
      else if (arg === '-h' || arg === '--help') opts.command = 'help';
      else if (arg === '-v' || arg === '--version') opts.command = 'version';
      continue;
    }
    if (arg.startsWith('-')) fail(`unknown option '${arg}' (try --help)`);
    if (['install', 'uninstall', 'update', 'drift', 'verify', 'list', 'show', 'doctor', 'help'].includes(arg) && opts.runtimes.length === 0 && opts.command === 'install') {
      opts.command = arg;
      continue;
    }
    opts.runtimes.push(arg);
  }
  return opts;
}

function listAgents(root) {
  const dir = path.join(root, 'core', 'agents');
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
  const dir = path.join(root, 'core', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

const RUNTIME_ALIASES = { claude: 'claude-code' };

function resolveRuntimes(requested, opts) {
  const canonical = requested.map((r) => RUNTIME_ALIASES[r] || r);
  if (canonical.includes('all')) return [...RUNTIMES];
  if (canonical.length) {
    for (const r of canonical) {
      if (!RUNTIMES.includes(r)) fail(`unknown provider '${r}' (expected ${RUNTIMES.join(', ')}, or all)`);
    }
    return canonical;
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
  } else if (!opts.skillsOnly && !opts.sastOnly) {
    for (const agent of listAgents(root)) {
      const source = readFileSync(path.join(root, 'core', 'agents', agent.file), 'utf8');
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
    const wanted = opts.sastOnly ? listSkills(root).filter((s) => s === 'security-review') : listSkills(root);
    for (const skill of wanted) {
      if (runtime === 'cursor') {
        // A skill is a procedure, which is what a Cursor rule is. Same shape as
        // an agent rule: the body with the frontmatter stripped.
        const source = readFileSync(path.join(root, 'core', 'skills', skill, 'SKILL.md'), 'utf8');
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
      const status = copySkill(path.join(root, 'core', 'skills', skill), dest, opts);
      if (status === 'written') written += 1;
      else if (status === 'skipped') skipped += 1;
      else blocked += 1;
    }
  }

  if (opts.installRules || opts.rulesOnly) {
    const r = mergeRulesFile(runtime, root, opts);
    written += r.written;
    skipped += r.skipped;
    blocked += r.blocked;
  }

  log(`  ${written} written, ${skipped} unchanged, ${blocked} left alone${warningCount ? `, ${warningCount} warning(s)` : ''}`);
  return { written, skipped, blocked, warningCount };
}

const RULES_BEGIN = '<!-- agentic-orchestra:begin -->';
const RULES_END = '<!-- agentic-orchestra:end -->';

// Append our instruction block to the provider's rules file between markers,
// replacing only our own block. Everything outside the markers is preserved
// byte-for-byte, with a backup before any change. Mirrors
// installer/adapters.py::merge_rules_file.
function mergeRulesFile(runtime, root, opts) {
  const counts = { written: 0, skipped: 0, blocked: 0 };
  const filename = runtime === 'gemini' ? 'GEMINI.md' : runtime === 'copilot' ? 'muse-instructions.md' : 'AGENTS.md';
  const scopes = opts.project ? ['project'] : ['global'];
  // 'both' is expanded by the caller into two installOne passes.
  for (const scope of scopes) {
    const dest = scope === 'project' ? path.join(process.cwd(), filename) : path.join(repoHome(), filename);
    const lines = [`# agentic-orchestra roles (${runtime} compatibility layer)`, ''];
    for (const agent of listAgents(root)) {
      lines.push(`## ${agent.name}`);
      lines.push(agent.description || '');
      lines.push('');
    }
    const marked = `${RULES_BEGIN}\n${lines.join('\n')}\n${RULES_END}\n`;
    const existing = existsSync(dest) ? readFileSync(dest, 'utf8') : '';
    let next;
    let action;
    if (existing.includes(RULES_BEGIN)) {
      const before = existing.slice(0, existing.indexOf(RULES_BEGIN));
      const after = existing.slice(existing.indexOf(RULES_BEGIN));
      const tail = after.slice(after.indexOf(RULES_END) + RULES_END.length).replace(/^\n+/, '');
      next = before + marked + tail;
      if (next === existing) {
        log(`  = ${dest} (our block current, rest preserved)`);
        counts.skipped += 1;
        continue;
      }
      action = 'refresh our block';
    } else {
      next = existing ? `${existing.replace(/\n+$/, '\n')}\n${marked}` : marked;
      action = 'append our block';
    }
    if (opts.dryRun) {
      log(`  + ${dest} (${action}, dry-run; unrelated content preserved)`);
      counts.written += 1;
      continue;
    }
    if (existsSync(dest)) {
      writeFileSync(`${dest}.agentic-orchestra.bak`, existing);
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, next);
    log(`  + ${dest} (${action}; backup kept, unrelated content preserved)`);
    counts.written += 1;
  }
  return counts;
}

function repoHome() {
  return process.env.HOME || process.cwd();
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
    if (treesEqual(srcDir, destDir)) {
      log(`  = ${destDir} (identical, skipped)`);
      return 'skipped';
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
    const source = readFileSync(path.join(root, 'core', 'agents', agent.file), 'utf8');
    let expected;
    try {
      expected = convert(source, RUNTIME_ALIASES[runtime] || runtime, { temperature: opts.temperature, steps: opts.steps, model: opts.model }).text;
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
      const src = path.join(root, 'core', 'skills', skill);
      const same = treesEqual(src, dest);
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

  const unmerged = unmergeRulesFile(runtime, opts);
  removed += unmerged.removed;
  absent += unmerged.absent;

  log(`  removed=${removed}  kept(modified)=${kept}  absent=${absent}`);
  return { removed, kept, absent };
}

// Remove only our marked block from the provider's rules file, preserving
// everything outside the markers byte-for-byte. Mirrors mergeRulesFile and
// installer/adapters.py::unmerge_rules_file.
function unmergeRulesFile(runtime, opts) {
  const filename = runtime === 'gemini' ? 'GEMINI.md' : runtime === 'copilot' ? 'muse-instructions.md' : 'AGENTS.md';
  const dest = opts.project ? path.join(process.cwd(), filename) : path.join(repoHome(), filename);
  if (!existsSync(dest) || !readFileSync(dest, 'utf8').includes(RULES_BEGIN)) {
    log(`  - ${dest} (absent)`);
    return { removed: 0, absent: 1 };
  }
  const existing = readFileSync(dest, 'utf8');
  const kept = existing.split(RULES_BEGIN).map((chunk, i) => {
    if (i === 0) return chunk;
    const end = chunk.indexOf(RULES_END);
    return end === -1 ? chunk : chunk.slice(end + RULES_END.length);
  }).join('');
  if (opts.dryRun) {
    log(`  x ${dest} (remove our block, dry-run; unrelated content preserved)`);
    return { removed: 1, absent: 0 };
  }
  if (!kept.trim()) {
    rmSync(dest, { force: true });
    log(`  x ${dest} (only our block remained; file removed)`);
  } else {
    writeFileSync(dest, `${kept.trim()}\n`);
    log(`  x ${dest} (our block removed, unrelated content preserved)`);
  }
  return { removed: 1, absent: 0 };
}

async function main(argv) {
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

  if (opts.command === 'update') {
    const runtimes = resolveRuntimes(opts.runtimes, opts);
    log(`agentic-orchestra ${VERSION} update`);
    let staleTotal = 0;
    let localTotal = 0;
    for (const runtime of runtimes) {
      const report = driftFor(runtime, root, { project: opts.project });
      log(`\n${runtime}`);
      for (const f of report.stale) log(`  update  ${f}`);
      for (const f of report.absent) log(`  add     ${f}`);
      for (const f of report.extra) log(`  remove  ${f} (no longer in this version)`);
      for (const f of report.local) log(`  keep    ${f} (edited locally, not ours to overwrite)`);
      if (report.current.length) log(`  =       ${report.current.length} already current`);
      staleTotal += report.stale.length + report.absent.length + report.extra.length;
      localTotal += report.local.length;

      if (opts.dryRun) {
        log('  (dry-run: nothing written)');
        continue;
      }
      // Reuse the installer's own non-clobbering contract rather than writing
      // files here, so `update` and `install` can never disagree about what
      // "don't touch my edits" means.
      const flags = ['--yes'];
      if (opts.project) flags.push('--project');
      if (opts.force) flags.push('--force');
      if (opts.agentsOnly) flags.push('--agents-only');
      if (opts.skillsOnly) flags.push('--skills-only');
      const res = spawnSync(process.execPath, [path.join(root, 'bin', 'agentic-orchestra.mjs'), 'install', runtime, ...flags], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      });
      process.stdout.write(res.stdout || '');
      process.stderr.write(res.stderr || '');
    }
    log('');
    log(staleTotal === 0 ? 'already up to date' : `${staleTotal} item(s) updated`);
    if (localTotal) log(`${localTotal} locally edited file(s) were left alone; --force overwrites them`);
    return 0;
  }

  if (opts.command === 'drift') {
    const runtimes = resolveRuntimes(opts.runtimes, opts);
    let dirty = 0;
    for (const runtime of runtimes) {
      const report = driftFor(runtime, root, { project: opts.project });
      log(summarize(report));
      for (const f of report.stale) log(`  stale   ${f}`);
      for (const f of report.local) log(`  local   ${f}  (edited since install)`);
      for (const f of report.extra) log(`  extra   ${f}  (no longer shipped)`);
      for (const f of report.absent) log(`  missing ${f}`);
      if (!isClean(report)) dirty += 1;
    }
    log('');
    log(dirty === 0 ? 'every runtime is current' : `${dirty} runtime(s) differ from this version; run: npx agentic-orchestra update`);
    return dirty === 0 ? 0 : 1;
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
      const installed = state.agents && state.agentsDir && existsSync(state.agentsDir)
        ? readdirSync(state.agentsDir).filter((f) => f.endsWith('.md') || f.endsWith('.mdc')).length
        : 0;
      log(`  agent files present: ${installed}`);
      if (state.agents || state.skills) {
        const report = driftFor(runtime, root, { project: opts.project });
        log(`  drift: ${report.current.length} current, ${report.stale.length} stale, ` +
            `${report.local.length} local, ${report.extra.length} extra, ${report.absent.length} missing`);
      }
    }
    log('');
    log(`  node ${process.version}`);
    return 0;
  }

  if (opts.command === 'show') {
    const name = opts.runtimes[0];
    if (!name) fail('show needs a name, e.g. `show luna-worker` or `show debug-issue`');
    // `--runtime`/`--target` wins; otherwise `--model` implies Claude Code,
    // since that is the only target it affects.
    const flagIdx = argv.findIndex((a) => a === '--runtime' || a === '--target');
    const explicitRaw = flagIdx !== -1
      ? argv[flagIdx + 1]
      : opts.model !== 'inherit'
        ? 'claude-code'
        : 'opencode';
    const explicit = RUNTIME_ALIASES[explicitRaw] || explicitRaw;
    if (!RUNTIMES.includes(explicit)) fail(`unknown provider '${explicit}' (expected ${RUNTIMES.join(', ')})`);
    const file = path.join(root, 'core', 'agents', `${name}.md`);
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
    const uninstallScope = opts.scope || (opts.project ? 'project' : 'global');
    if (!['project', 'global', 'both'].includes(uninstallScope)) fail(`unknown scope '${uninstallScope}'`);
    const scopes = uninstallScope === 'both' ? ['project', 'global'] : [uninstallScope];
    log(`agentic-orchestra uninstaller${opts.dryRun ? ' (dry-run)' : ''}`);
    for (const runtime of runtimes) {
      for (const scope of scopes) uninstallOne(runtime, root, { ...opts, project: scope === 'project' });
    }
    return 0;
  }

  // install
  if (opts.scope && !['project', 'global', 'both'].includes(opts.scope)) {
    fail(`unknown scope '${opts.scope}' (expected project, global, or both)`);
  }
  if (opts.project && opts.scope && opts.scope !== 'project') {
    fail('--project conflicts with --scope ' + opts.scope);
  }
  const effectiveScope = opts.scope || (opts.project ? 'project' : 'global');
  if (opts.components) {
    const knownComponents = new Set(['agents', 'skills', 'sast', 'rules']);
    for (const c of opts.components.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!knownComponents.has(c)) fail(`unknown component '${c}' (expected agents,skills,sast,rules)`);
    }
    const set = new Set(opts.components.split(',').map((s) => s.trim()).filter(Boolean));
    if (set.has('agents')) opts.agentsOnly = false;
    if (!set.has('agents')) opts.skillsOnly = true;
    if (!set.has('skills') && !set.has('sast')) opts.agentsOnly = true;
    if (set.has('sast') && !set.has('skills')) opts.sastOnly = true;
    if (set.has('rules')) opts.installRules = true;
  }

  let runtimes = resolveRuntimes(opts.runtimes, opts);
  let wizardScope = '';
  // Interactive multi-select wizard: detection marks, the user selects any
  // number, then scope, then components. Triggered by --wizard, or by a bare
  // install on a TTY without explicit targets and without --yes.
  const wantWizard = opts.wizard || (!opts.runtimes.length && !opts.yes && process.stdin.isTTY && process.stdout.isTTY);
  if (wantWizard && opts.command === 'install') {
    const answers = await runWizard(root, runtimes);
    if (!answers.runtimes.length) {
      log('Nothing selected. Nothing installed.');
      return 1;
    }
    runtimes = answers.runtimes;
    if (answers.scope) wizardScope = answers.scope;
    if (answers.components) {
      const set = new Set(answers.components);
      opts.agentsOnly = !set.has('skills') && !set.has('sast');
      opts.skillsOnly = !set.has('agents');
      opts.sastOnly = set.has('sast') && !set.has('skills');
      opts.rulesOnly = set.has('rules');
    }
  }
  const finalScope = wizardScope || effectiveScope;
  log(`agentic-orchestra ${VERSION} installer`);
  log(`  repo:   ${root}`);
  log(`  scope:  ${finalScope}`);
  log(`  target: ${runtimes.join(', ')}`);
  if (opts.dryRun) log('  mode:   dry-run (no writes)');
  if (opts.force) log('  mode:   force (overwrite existing)');

  if (!runtimes.length) {
    log('');
    log('No provider config directory found. Pass targets explicitly, e.g. --target claude-code --target codex.');
    return 1;
  }

  const scopesFor = () => (finalScope === 'both' ? ['project', 'global'] : [finalScope]);

  const rows = [];
  let totals = { written: 0, skipped: 0, blocked: 0, warningCount: 0 };
  for (const runtime of runtimes) {
    for (const scope of scopesFor()) {
      const scopedOpts = { ...opts, project: scope === 'project' };
      const r = installOne(RUNTIME_ALIASES[runtime] || runtime, root, scopedOpts, convertOptions);
      rows.push({ runtime, scope, ...r });
      totals = {
        written: totals.written + r.written,
        skipped: totals.skipped + r.skipped,
        blocked: totals.blocked + r.blocked,
        warningCount: totals.warningCount + r.warningCount,
      };
    }
  }

  log('');
  log(`  ${'Tool'.padEnd(14)}${'Scope'.padEnd(9)}${'Written'.padEnd(9)}${'Unchanged'.padEnd(11)}Left alone`);
  for (const row of rows) {
    log(`  ${row.runtime.padEnd(14)}${row.scope.padEnd(9)}${String(row.written).padEnd(9)}${String(row.skipped).padEnd(11)}${row.blocked}`);
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

async function runWizard(root, fallbackRuntimes) {
  const { detect } = await import('../adapters/index.mjs');
  const { homedir } = await import('node:os');
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(`${q}: `, (a) => resolve(a.trim())));
  try {
    const found = detect(homedir());
    log('');
    log('AI Agent Toolkit Setup');
    log('');
    log('Detected (detection only marks — nothing is installed yet):');
    found.forEach(({ adapter, detected }, i) => {
      log(`  ${String(i + 1).padStart(2)}) [${detected ? 'x' : ' '}] ${adapter.displayName.padEnd(22)} ${detected ? 'detected' : ''}`);
    });
    log('');
    log('Select AI coding tools to configure (any number):');
    log("  Enter numbers (1,3,5), ranges (1-4), 'all', or nothing to keep marks.");
    const raw = await ask('Select');
    let picked;
    if (!raw) {
      picked = found.filter((f) => f.detected).map((f) => f.adapter.id);
    } else if (raw.toLowerCase() === 'all') {
      picked = found.map((f) => f.adapter.id);
    } else {
      const nums = new Set();
      for (const part of raw.split(',')) {
        const t = part.trim();
        if (/^\d+-\d+$/.test(t)) {
          const [a, b] = t.split('-').map(Number);
          for (let n = a; n <= b; n += 1) nums.add(n);
        } else if (/^\d+$/.test(t)) {
          nums.add(Number(t));
        }
      }
      picked = found.filter((_, i) => nums.has(i + 1)).map((f) => f.adapter.id);
    }
    if (!picked.length && fallbackRuntimes.length) picked = fallbackRuntimes;
    if (picked.length) log(`Selected: ${picked.join(', ')}`);
    else return { runtimes: [], scope: '', components: [] };

    // Scope step: only scopes every selection supports.
    const { getAdapter } = await import('../adapters/index.mjs');
    const common = picked
      .map((id) => getAdapter(id, homedir()).scopes)
      .reduce((a, b) => a.filter((s) => b.includes(s)));
    let scope = '';
    if (common.length === 1) {
      scope = common[0];
    } else if (common.length > 1) {
      const ordered = ['project', 'global', 'both'].filter((s) => common.includes(s));
      log('');
      log('Where should the toolkit be installed?');
      ordered.forEach((s, i) => log(`  ${i + 1}) ${s}`));
      const choice = await ask('Scope [1]');
      scope = ordered[Number(choice || '1') - 1] || ordered[0];
    }

    // Component step: defaults follow each tool's capabilities.
    const byId = new Map(found.map((f) => [f.adapter.id, f.adapter]));
    const defaults = new Set();
    for (const id of picked) {
      const caps = (byId.get(id) || getAdapter(id, homedir())).capabilities;
      if (caps.agents || caps.subagents) defaults.add('agents');
      if (caps.skills) defaults.add('skills');
    }
    defaults.add('sast');
    const all = ['agents', 'skills', 'sast', 'rules'];
    log('');
    log('What should be installed (defaults follow capabilities)?');
    all.forEach((c, i) => log(`  ${i + 1}) [${defaults.has(c) ? 'x' : ' '}] ${c}`));
    log("  Enter numbers, 'all', or nothing to keep marks.");
    const craw = await ask('Components');
    let components;
    if (!craw) components = [...defaults];
    else if (craw.toLowerCase() === 'all') components = all;
    else {
      const nums = new Set();
      for (const part of craw.split(',')) {
        const t = part.trim();
        if (/^\d+$/.test(t)) nums.add(Number(t));
      }
      components = all.filter((_, i) => nums.has(i + 1));
    }
    if (components.length) log(`Components: ${components.join(', ')}`);
    void root;
    return { runtimes: picked, scope, components };
  } finally {
    rl.close();
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = typeof code === 'number' ? code : 0;
  },
  (error) => {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  }
);
