#!/usr/bin/env node
// Capability model: adapters expose capabilities, callers never branch on provider name.

export const CAPABILITY_KEYS = ['skills', 'agents', 'subagents', 'commands', 'rules', 'instructions', 'mcp', 'hooks'];

export function fallbackFor(adapter, kind) {
  // kind: 'agents' | 'skills'
  if (kind === 'agents') {
    if (adapter.capabilities.agents === true) return 'native';
    if (adapter.capabilities.subagents === true) return 'native-subagent';
    if (adapter.capabilities.rules || adapter.capabilities.instructions) return 'rule-wrapper';
    return 'generic-fallback';
  }
  if (kind === 'skills') {
    if (adapter.capabilities.skills === true) return 'native';
    if (adapter.capabilities.rules || adapter.capabilities.instructions) return 'rule-wrapper';
    return 'generic-fallback';
  }
  return 'generic-fallback';
}

export function supportedScopes(adapter) {
  return adapter.scopes || ['user', 'project'];
}
