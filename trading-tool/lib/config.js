/**
 * Load trading-tool config from (first match wins):
 * 1. --config path
 * 2. ./trading-tool.config.json (cwd)
 * 3. ~/.trading-tool/config.json
 * 4. trading-tool/config.default.json
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', 'config.default.json');
const USER_PATH = join(homedir(), '.trading-tool', 'config.json');
const CWD_PATH = join(process.cwd(), 'trading-tool.config.json');

export function loadConfig(explicitPath) {
  const candidates = [explicitPath, CWD_PATH, USER_PATH, DEFAULT_PATH].filter(Boolean);
  let base = {};
  let source = null;

  for (const p of candidates) {
    if (p && existsSync(p)) {
      base = JSON.parse(readFileSync(p, 'utf8'));
      source = p;
      break;
    }
  }

  if (!source) {
    base = JSON.parse(readFileSync(DEFAULT_PATH, 'utf8'));
    source = DEFAULT_PATH;
  }

  return {
    ...base,
    _source: source,
    watchlist: base.watchlist || [],
    timeframes: base.timeframes || ['15', '60', 'D'],
    default_timeframe: base.default_timeframe || '15',
    scan_delay_ms: base.scan_delay_ms ?? 1500,
    layout: base.layout || '2x2',
    bias: {
      bull_threshold_pct: base.bias?.bull_threshold_pct ?? 0.35,
      bear_threshold_pct: base.bias?.bear_threshold_pct ?? -0.35,
    },
    output_dir: base.output_dir || './reports',
  };
}

export function ensureUserConfig() {
  if (existsSync(USER_PATH)) return USER_PATH;
  mkdirSync(dirname(USER_PATH), { recursive: true });
  const defaults = readFileSync(DEFAULT_PATH, 'utf8');
  writeFileSync(USER_PATH, defaults);
  return USER_PATH;
}

export function resolveOutputDir(cfg) {
  const dir = cfg.output_dir.startsWith('~')
    ? join(homedir(), cfg.output_dir.slice(1))
    : cfg.output_dir;
  mkdirSync(dir, { recursive: true });
  return dir;
}
