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
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
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
