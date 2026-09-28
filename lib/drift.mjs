// Drift detection: what has changed between what is installed and what this
// version of the repository would install.
//
// Three states, and the difference between them is the whole point:
//
//   current   the installed file is byte-identical to what this version installs
//   stale     the installed file differs and is still ours — an update
//   local     the installed file differs and the difference is not ours — a user
//             edit, which is never touched without --force
//   extra     installed under our name but no longer in the repository — a role
//             that was removed upstream
//
// The `local` case is the one that matters. Two agents and a spawn grant have
// been added since 0.2.0, so an installation from that release is silently
// missing a coordinator, an integrator, and the ability for three agents to
// delegate. Nothing in the previous version would have told you.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { convert } from './convert.mjs';
import { repoRoot, resolvePaths } from './paths.mjs';

export const STATE = { CURRENT: 'current', STALE: 'stale', LOCAL: 'local', EXTRA: 'extra', ABSENT: 'absent' };

function walk(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .sort();
}

// The content this version would install for one runtime.
function desired(root, runtime) {
  const agentsDir = path.join(root, 'agents');
  const skillsDir = path.join(root, 'skills');
  const out = new Map();

  const agentsDest = resolvePaths(runtime, {}).agents;
  if (agentsDest) {
    for (const f of walk(agentsDir, '.md')) {
      const source = readFileSync(path.join(agentsDir, f), 'utf8');
      try {
        const { text } = convert(source, runtime, {});
        out.set(path.join(agentsDest, f), { kind: 'agent', name: path.basename(f, '.md'), text });
      } catch (error) {
        out.set(path.join(agentsDest, f), { kind: 'agent', name: path.basename(f, '.md'), error: error.message });
      }
    }
  }

  const skillsDest = resolvePaths(runtime, {}).skills;
  const ext = runtime === 'cursor' ? '.mdc' : '';
  for (const d of readdirSync(skillsDir, { withFileTypes: true }).filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const skillFile = path.join(skillsDir, d.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    if (ext) {
      const { text } = convert(readFileSync(skillFile, 'utf8'), 'cursor', {});
      out.set(path.join(skillsDest, `${d.name}.mdc`), { kind: 'skill', name: d.name, text });
    } else {
      out.set(path.join(skillsDest, d.name), { kind: 'skill', name: d.name, dir: true, source: path.join(skillsDir, d.name) });
    }
  }
  return out;
}

function dirMatches(sourceDir, destDir) {
  const srcFiles = readdirSync(sourceDir).sort();
  const dstFiles = existsSync(destDir) ? readdirSync(destDir).sort() : [];
  if (srcFiles.join(',') !== dstFiles.join(',')) return false;
  return srcFiles.every((f) => readFileSync(path.join(sourceDir, f), 'utf8') === readFileSync(path.join(destDir, f), 'utf8'));
}

export function driftFor(runtime, root = repoRoot(), opts = {}) {
  const report = { runtime, stale: [], local: [], extra: [], absent: [], current: [], unrecognized: [] };

  const want = desired(root, runtime);
  const { agents, skills } = resolvePaths(runtime, opts);

  for (const [dest, info] of want) {
    if (!existsSync(dest)) {
      report.absent.push(dest);
      continue;
    }
    if (info.dir) {
      (dirMatches(info.source, dest) ? report.current : report.stale).push(dest);
      continue;
    }
    const actual = readFileSync(dest, 'utf8');
    if (actual === info.text) {
      report.current.push(dest);
    } else if (looksLikeOurs(dest, info.text)) {
      // Our file, edited. Not an update target.
      report.local.push(dest);
    } else {
      report.stale.push(dest);
    }
  }

  // Anything installed under a name we ship that is no longer in the repository.
  // The agents directory is a dedicated deployment target documented by this
  // package, so ownership IS provable there and a name we no longer ship really
  // is ours to remove.
  if (agents && existsSync(agents)) {
    const shipped = new Set([...want.keys()].map((p) => path.basename(p)));
    for (const f of walk(agents, runtime === 'cursor' ? '.mdc' : '.md')) {
      if (!shipped.has(f)) report.extra.push(path.join(agents, f));
    }
  }
  if (skills && existsSync(skills)) {
    for (const d of readdirSync(skills, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      if (!want.has(path.join(skills, d.name))) {
        // The skills directory is SHARED. Other tools install into it, and a
        // first version of this check reported every unfamiliar skill as "no
        // longer shipped" — which on a real machine pointed at the user's own
        // hand-installed skills and offered to remove them. Ownership is not
        // provable here, so nothing is: unfamiliar directories are listed for
        // information and are never removal candidates.
        report.unrecognized.push(path.join(skills, d.name));
      }
    }
  }

  return report;
}

// A file is "ours but edited" when it still carries our name, even though the
// content differs. A file whose name does
// not match is somebody else's, and a mismatch of the name field is the signal
// that this is a local fork rather than a stale copy.
function looksLikeOurs(dest, expected) {
  const nameFrom = (text) => (text.match(/^name:\s*(.+)$/m) || [])[1];
  const actualName = nameFrom(readFileSync(dest, 'utf8'));
  const expectedName = nameFrom(expected);
  if (!actualName || !expectedName) return false;
  // Same identity, different content: a local edit. A different name means it is
  // somebody's file entirely, not a stale copy of ours.
  return actualName === expectedName;
}

export function isClean(report) {
  return report.stale.length === 0 && report.local.length === 0 && report.extra.length === 0 && report.absent.length === 0;
}

export function summarize(report) {
  return `${report.runtime}: ${report.current.length} current, ${report.stale.length} stale, ` +
    `${report.local.length} locally edited, ${report.extra.length} removed upstream, ` +
    `${report.absent.length} missing, ${report.unrecognized.length} not ours`;
}
