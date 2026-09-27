// The repo's invariants, as assertions.
//
// These mirror the checks in verify.sh that can run without a shell. The two
// files overlap on purpose: verify.sh is the dependency-free path, this is the
// path `npx agentic-orchestra verify` takes. Each check is stated in AGENTS.md
// and restated here as something that can fail.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { convert } from './convert.mjs';
import { parseFrontmatter } from './frontmatter.mjs';

const TURKISH = /(^|[^\p{L}])(ve|ile|icin|olarak|ancak|cunku)(?![\p{L}])/u;
const TURKISH_UTF8 = /(^|[^\p{L}])(için|olarak|ancak|çünkü)(?![\p{L}])/u;
const PLACEHOLDER = /TODO|FIXME|XXX|<placeholder>/;

function runtimeFiles(root) {
  const files = [];
  const agentsDir = path.join(root, 'agents');
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort()) {
      files.push(path.join('agents', f));
    }
  }
  const skillsDir = path.join(root, 'skills');
  if (existsSync(skillsDir)) {
    for (const d of readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join('skills', d.name, 'SKILL.md');
      if (existsSync(path.join(root, p))) files.push(p);
    }
  }
  return files;
}

function skillNames(root) {
  const dir = path.join(root, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

function referencedSkills(root) {
  const refs = new Set();
  for (const rel of runtimeFiles(root)) {
    const text = readFileSync(path.join(root, rel), 'utf8');
    for (const m of text.matchAll(/skill:\/\/([a-z0-9-]+)/g)) refs.add(m[1]);
  }
  return [...refs].sort();
}

export function runChecks(root, { fast = false, quiet = false } = {}) {
  const results = [];
  let checks = 0;
  const say = (msg) => {
    if (!quiet) process.stdout.write(`${msg}\n`);
  };
  const record = (ok, label) => {
    results.push({ ok, label });
    say(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    return ok;
  };

  // 1. frontmatter parses
  checks += 1;
  say('\n== frontmatter parses');
  {
    const files = runtimeFiles(root);
    const bad = [];
    for (const rel of files) {
      try {
        parseFrontmatter(readFileSync(path.join(root, rel), 'utf8'));
      } catch (error) {
        bad.push(`${rel}: ${error.message}`);
      }
    }
    record(bad.length === 0, bad.length ? bad.join('; ') : `all ${files.length} runtime files parse`);
  }

  // 2. name matches its path
  checks += 1;
  say('\n== name matches path');
  {
    const bad = [];
    for (const rel of runtimeFiles(root)) {
      const { data } = parseFrontmatter(readFileSync(path.join(root, rel), 'utf8'));
      const expected = path.basename(rel) === 'SKILL.md' ? path.basename(path.dirname(rel)) : path.basename(rel, '.md');
      if (data.name !== expected) bad.push(`${rel} declares name '${data.name}'`);
    }
    record(bad.length === 0, bad.length ? bad.join('; ') : 'every name matches its path');
  }

  // 3. skill:// references resolve or are a declared gap
  checks += 1;
  say('\n== skill:// references resolve or are declared gaps');
  {
    const shipped = new Set(skillNames(root));
    const refs = referencedSkills(root);
    const actualGaps = refs.filter((r) => !shipped.has(r)).sort();
    const manifest = path.join(root, 'docs', 'unresolved-skills.txt');
    const declared = existsSync(manifest)
      ? readFileSync(manifest, 'utf8')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
          .map((l) => l.split(/\s+/)[0])
          .sort()
      : null;

    if (declared === null) {
      record(false, 'docs/unresolved-skills.txt is missing');
    } else {
      const undeclared = actualGaps.filter((g) => !declared.includes(g));
      const resolved = declared.filter((d) => !actualGaps.includes(d));
      const parts = [];
      if (undeclared.length) parts.push(`referenced but neither shipped nor declared: ${undeclared.join(' ')}`);
      if (resolved.length) parts.push(`declared as a gap but now resolved: ${resolved.join(' ')}`);
      record(parts.length === 0, parts.length ? parts.join(' | ') : `${refs.length} references, ${actualGaps.length} declared gap(s), rest resolve`);
    }
  }

  // 4. runtime files are English
  checks += 1;
  say('\n== runtime files are English');
  {
    const bad = runtimeFiles(root).filter((rel) => {
      const text = readFileSync(path.join(root, rel), 'utf8');
      return TURKISH.test(text) || TURKISH_UTF8.test(text);
    });
    record(bad.length === 0, bad.length ? `Turkish prose in: ${bad.join(', ')}` : 'no Turkish prose in runtime files');
  }

  // 5. read-only roles declare no write tool
  checks += 1;
  say('\n== read-only invariant');
  {
    const agentsDir = path.join(root, 'agents');
    const readOnly = readdirSync(agentsDir)
      .filter((f) => f.endsWith('.md') && /explorer|reviewer|researcher/.test(f))
      .sort();
    const bad = [];
    for (const f of readOnly) {
      const { data } = parseFrontmatter(readFileSync(path.join(agentsDir, f), 'utf8'));
      const tools = String(data.tools || '').replace(/\s/g, '').split(',');
      if (tools.includes('edit') || tools.includes('write')) bad.push(`${f} grants write`);
    }
    record(bad.length === 0, bad.length ? bad.join('; ') : `no read-only role declares edit or write (${readOnly.length} roles)`);
  }

  // 6. no placeholders
  checks += 1;
  say('\n== no placeholders');
  {
    // verify.sh is excluded because it necessarily contains this search
    // pattern itself; the bash check excludes it for the same reason.
    const targets = [
      ...runtimeFiles(root),
      ...readdirSync(root)
        .filter((f) => f.endsWith('.sh') && f !== 'verify.sh')
        .map((f) => f),
    ].filter((rel) => existsSync(path.join(root, rel)));
    const bad = targets.filter((rel) => PLACEHOLDER.test(readFileSync(path.join(root, rel), 'utf8')));
    record(bad.length === 0, bad.length ? `placeholder marker in: ${bad.join(', ')}` : 'no TODO/FIXME/placeholder markers in shipped files');
  }

  // 7. the npx entry point is executable
  checks += 1;
  say('\n== npx entry point is executable');
  {
    const binDir = path.join(root, 'bin');
    const entries = existsSync(binDir) ? readdirSync(binDir).filter((f) => f.endsWith('.mjs')) : [];
    const bad = [];
    for (const f of entries) {
      const p = path.join(binDir, f);
      const first = readFileSync(p, 'utf8').split('\n')[0];
      if (!/^#!.*node/.test(first)) bad.push(`${f}: no node shebang`);
    }
    // A bin entry without a shebang becomes a symlink the shell tries to
    // interpret, so `npx` fails with "import: command not found" rather than
    // anything actionable. It happened once.
    const pkgPath = path.join(root, 'package.json');
    if (existsSync(pkgPath)) {
      let bin = {};
      try {
        bin = JSON.parse(readFileSync(pkgPath, 'utf8')).bin || {};
      } catch (error) {
        bad.push(`package.json is not valid JSON: ${error.message}`);
      }
      for (const [name, rel] of Object.entries(bin)) {
        if (!existsSync(path.join(root, rel))) bad.push(`package.json bin "${name}" points at missing ${rel}`);
        else if (!readFileSync(path.join(root, rel), 'utf8').startsWith('#!')) bad.push(`bin target ${rel} has no shebang`);
      }
    }
    record(bad.length === 0, bad.length ? bad.join('; ') : `bin/ has a shebang and every package.json bin target exists (${entries.length} entries)`);
  }

  if (fast) {
    return { checks, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }

  // 7. every agent converts to every runtime
  checks += 1;
  say('\n== every agent converts to every runtime');
  {
    const agentsDir = path.join(root, 'agents');
    const agents = readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort();
    const bad = [];
    for (const f of agents) {
      const source = readFileSync(path.join(agentsDir, f), 'utf8');
      for (const runtime of ['opencode', 'claude']) {
        try {
          const { text, warnings } = convert(source, runtime, {});
          // A capability the target cannot honour must be dropped AND reported.
          const { data } = parseFrontmatter(source);
          if (data.spawns) {
            if (/^spawns:/m.test(text)) bad.push(`${runtime}/${f}: kept a spawns field it cannot honour`);
            if (!warnings.some((w) => w.includes('dropped spawns='))) bad.push(`${runtime}/${f}: dropped spawns without reporting it`);
          }
        } catch (error) {
          bad.push(`${runtime}/${f}: ${error.message}`);
        }
      }
    }
    // Counts come from the repository. Hardcoding them made adding two agents
    // look like an unrelated failure.
    record(bad.length === 0, bad.length ? bad.join('; ') : `${agents.length} agents x 2 runtimes convert cleanly`);
  }

  // 8. no invented model pins
  checks += 1;
  say('\n== no invented model pins');
  {
    const agentsDir = path.join(root, 'agents');
    const bad = [];
    for (const f of readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort()) {
      const source = readFileSync(path.join(agentsDir, f), 'utf8');
      const { data } = parseFrontmatter(source);
      const oc = convert(source, 'opencode', {});
      if (/^model:/m.test(oc.text)) bad.push(`opencode output invents a model for ${f}`);
      const cl = convert(source, 'claude', {});
      if (!/^model: inherit$/m.test(cl.text)) bad.push(`claude output should be 'model: inherit' for ${f}`);
      const reported = cl.warnings.some((w) => w.includes(`dropped OMP model pin '${data.model}'`));
      if (data.model && !reported) bad.push(`dropped pin not reported for ${f}`);
    }
    record(bad.length === 0, bad.length ? bad.join('; ') : 'model pins dropped and reported, never invented');
  }

  // 9. converted frontmatter has no duplicate keys
  checks += 1;
  say('\n== no duplicate YAML keys in conversions');
  {
    const agentsDir = path.join(root, 'agents');
    const bad = [];
    for (const f of readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort()) {
      const source = readFileSync(path.join(agentsDir, f), 'utf8');
      for (const runtime of ['opencode', 'claude']) {
        const text = convert(source, runtime, {}).text;
        const block = text.split('---')[1] || '';
        const keys = [...block.matchAll(/^\s+([a-zA-Z_]+):/gm)].map((m) => m[1]);
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        if (dupes.length) bad.push(`${runtime}/${f}: ${[...new Set(dupes)].join(',')}`);
      }
    }
    record(bad.length === 0, bad.length ? bad.join('; ') : 'no duplicate tools keys in any converted agent');
  }

  // 10. the procedure graph is connected
  checks += 1;
  say('\n== procedure graph is connected');
  {
    // Nine skills that reference nothing are nine procedures an agent runs in
    // isolation and partly reinvents. Mirrors verify.sh check 11b.
    const bad = [];
    const skills = skillNames(root);
    for (const s of skills) {
      const text = readFileSync(path.join(root, 'skills', s, 'SKILL.md'), 'utf8');
      if (!/^## Hand off/m.test(text)) bad.push(`skills/${s} has no '## Hand off' section`);
    }
    const orphans = skills.filter((s) => {
      const needle = new RegExp(`skill://${s}\\b`);
      return !skills.some((other) => other !== s && needle.test(readFileSync(path.join(root, 'skills', other, 'SKILL.md'), 'utf8')));
    });
    if (orphans.length) bad.push(`orphan skill(s), referenced by nothing: ${orphans.join(' ')}`);
    record(bad.length === 0, bad.length ? bad.join(' | ') : `every skill has a Hand off section and is reachable (${skills.length} skills)`);
  }

  return { checks, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}
