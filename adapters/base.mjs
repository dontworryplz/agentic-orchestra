#!/usr/bin/env node
// Adapter base class: every provider implements detect/configLocations/scopes/
// capabilities/install/render/validate/uninstall. No provider conditionals elsewhere.

export class RuntimeAdapter {
  constructor(def) {
    this.id = def.id;
    this.displayName = def.displayName || def.id;
    this.binaryNames = def.binaryNames || [];
    this.configLocations = def.configLocations;
    this.capabilities = def.capabilities;
    this.scopes = def.scopes || ['user', 'project'];
    this.notes = def.notes || '';
    this.nativeSupport = def.nativeSupport || 'native';
    this._render = def.render;
    this._detect = def.detect;
  }

  detect(ctx = {}) {
    if (this._detect) return this._detect(ctx);
    return { detected: false, reason: 'no detector' };
  }

  paths({ project = false, cwd = process.cwd(), home = null, env = process.env } = {}) {
    return this.configLocations({ project, cwd, home, env });
  }

  render(canonical, opts = {}) {
    return this._render(canonical, opts);
  }

  validate() {
    return { ok: true, errors: [] };
  }
}
