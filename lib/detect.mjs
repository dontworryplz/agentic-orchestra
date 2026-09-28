#!/usr/bin/env node
// Re-export: detection lives in adapters/index.mjs; this module keeps the
// historical lib/ import path working.
export { detect } from '../adapters/index.mjs';
