#!/usr/bin/env node
// Frontmatter parse/serialize for the subset of YAML these files use.
//
// The repo's runtime files are deliberately flat: `key: value` and `key: a, b`
// only. A full YAML parser would be a dependency for no benefit, and would
// accept shapes the runtimes do not.

export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) {
    throw new Error('missing opening --- delimiter');
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    throw new Error('missing closing --- delimiter');
  }
  const raw = text.slice(4, end + 1);
  const body = text.slice(text.indexOf('\n', end + 1) + 1);

  const data = {};
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();

    // OMP accepts two shapes for list-valued keys, and the agents it bundles
    // use the block form while this repository ships the comma form:
    //
    //   tools: read, grep, glob
    //   tools:
    //     - read
    //     - grep
    //
    // A parser that understands only one of them does not fail. It reports no
    // tools at all, and a converter then renders that as "everything denied" —
    // a silent capability loss on every agent in the file.
    if (value === '') {
      const items = [];
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const next = lines[j];
        if (!next.trim()) continue;
        const m = next.match(/^\s+-\s+(.*)$/);
        if (!m) break;
        items.push(m[1].trim().replace(/^["']|["']$/g, ''));
      }
      if (items.length) {
        data[key] = items;
        i = j - 1;
        continue;
      }
      data[key] = '';
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body };
}

// Double-quote a scalar for YAML output: escape backslash and quote, and drop
// any control character that would break the line.
export function yamlQuote(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, ' ');
  return `"${escaped}"`;
}

export function serializeFrontmatter(fields, body) {
  const out = ['---'];
  for (const [key, value] of fields) {
    if (value === undefined || value === null || value === '') continue;
    // A value beginning with a newline is a nested block: emit the bare key so
    // the line is `tools:` and not `tools: ` with a trailing space. The two
    // differ byte-for-byte, and verify.sh check 12 diffs against the bash
    // converters, so the trailing space would be a real failure.
    out.push(value.startsWith('\n') ? `${key}:${value}` : `${key}: ${value}`);
  }
  out.push('---', '');
  return `${out.join('\n')}\n${body.replace(/^\n+/, '')}`;
}

// A frontmatter value as a list, whichever shape it was written in. Comma
// strings and block lists normalize to the same array so callers never have to
// branch on how a file was authored.
export function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string' || !value) return [];
  return value
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}
