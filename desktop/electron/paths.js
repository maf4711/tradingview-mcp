/**
 * Resolve paths to the tradingview-mcp bridge in dev vs packaged app.
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @param {import('electron').App} app */
export function getBridgeRoot(app) {
  // Packaged: extraResources → Resources/bridge
  if (app.isPackaged) {
    const packaged = join(process.resourcesPath, 'bridge');
    if (existsSync(join(packaged, 'src', 'core', 'index.js'))) return packaged;
  }

  // Dev: monorepo root (desktop/../)
  const monorepo = join(__dirname, '..', '..');
  if (existsSync(join(monorepo, 'src', 'core', 'index.js'))) return monorepo;

  throw new Error('Bridge not found. Run from repo or package with electron-builder.');
}

/** Dynamic import helper that works with absolute file URLs */
export async function importBridge(app, relPath) {
  const root = getBridgeRoot(app);
  const full = join(root, relPath);
  return import(full);
}

/** Require chrome-remote-interface etc. from bridge node_modules when packaged */
export function bridgeRequire(app) {
  const root = getBridgeRoot(app);
  const req = createRequire(join(root, 'package.json'));
  return req;
}
