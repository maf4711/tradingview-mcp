import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DIR = join(homedir(), '.tv-trading-desk');
const FILE = join(DIR, 'config.json');

const DEFAULTS = {
  watchlist: [
    'BINANCE:BTCUSDT',
    'BINANCE:ETHUSDT',
    'CME_MINI:ES1!',
    'CME_MINI:NQ1!',
    'COMEX:GC1!',
  ],
  default_timeframe: '15',
  scan_delay_ms: 1500,
  layout: '2x2',
  bias: {
    bull_threshold_pct: 0.35,
    bear_threshold_pct: -0.35,
  },
  poll_interval_ms: 5000,
  auto_refresh_status: true,
};

export function loadConfig() {
  try {
    if (existsSync(FILE)) {
      const raw = JSON.parse(readFileSync(FILE, 'utf8'));
      return {
        ...DEFAULTS,
        ...raw,
        bias: { ...DEFAULTS.bias, ...(raw.bias || {}) },
      };
    }
  } catch {
    /* fall through */
  }
  return { ...DEFAULTS, bias: { ...DEFAULTS.bias } };
}

export function saveConfig(partial) {
  mkdirSync(DIR, { recursive: true });
  const next = {
    ...loadConfig(),
    ...partial,
    bias: { ...loadConfig().bias, ...(partial.bias || {}) },
  };
  writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}

export function configPath() {
  return FILE;
}
