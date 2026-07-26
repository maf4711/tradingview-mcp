# TV Trading Desk — macOS App

Native-feeling **Electron** desktop app for macOS that wraps [tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) and the local `tt` trading workflows.

Controls **your** TradingView Desktop via Chrome DevTools Protocol (port 9222). No broker execution. Not affiliated with TradingView Inc.

## Features

| View | Action |
|------|--------|
| Dashboard | Connection status, chart symbol, shortcuts |
| Analyze | Quote, OHLCV summary, bias, indicator signals, S/R |
| Scan | Multi-symbol watchlist scan |
| Brief | Morning brief (markdown + scan table) |
| Levels | Read Pine levels, optionally draw H-lines |
| Setup | Multi-pane layout + assign symbols |
| Snapshot | Analyze + screenshot path + JSON report |
| Settings | Watchlist, thresholds, poll interval |

Menu: **Trading → Launch / Analyze / Brief** (⌘L, ⌘A, ⌘B).

## Requirements

- macOS
- Node.js 18+
- TradingView Desktop (with subscription)
- Repo root dependencies installed (`npm install` in monorepo root)

## Run (development)

```bash
# once, from monorepo root
cd /path/to/tradingviewmcp
npm install

cd desktop
npm install
npm start
```

Then in the app: **Launch TV** → wait until the status pill is green → **Analyze**.

## Build macOS .app

```bash
cd desktop
npm install
npm run dist
```

Output:

- `desktop/dist/mac-arm64/TV Trading Desk.app` (or `mac/` on Intel)
- optional DMG via `npm run dist:dmg`

Unsigned local build (`identity: null`). First open: right-click → Open if Gatekeeper blocks.

## Config

`~/.tv-trading-desk/config.json`  
Reports: `~/.tv-trading-desk/reports/`

## Architecture

```
TV Trading Desk (Electron)
  renderer  →  IPC  →  main
                         └── services/trading.js
                                └── monorepo src/core/*  (CDP bridge)
                                       └── TradingView :9222
```

## Disclaimer

Chart interaction only. You are responsible for compliance with TradingView Terms of Use. Not financial advice.
