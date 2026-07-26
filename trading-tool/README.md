# Trading Tool (`tt`)

High-level trading workflows on top of [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp).

Talks **only** to your local TradingView Desktop via Chrome DevTools Protocol (port `9222`). No broker execution, no remote market data APIs.

> Not affiliated with TradingView Inc. Requires a valid TradingView subscription. Not financial advice.

## What you get

| Command | Purpose |
|---------|---------|
| `tt status` | CDP connection + active chart |
| `tt launch` | Start TradingView with `--remote-debugging-port=9222` |
| `tt analyze` | Full chart readout: quote, OHLCV summary, indicators, Pine levels, bias |
| `tt scan` | Multi-symbol watchlist scan with bull/bear/neutral bias |
| `tt brief` | Session prep: active chart analysis + full watchlist scan |
| `tt setup` | Multi-pane layout (e.g. 2×2) and assign symbols |
| `tt levels` | Nearest S/R from Pine lines/labels; optional `--draw` |
| `tt snapshot` | Analyze + screenshot + markdown/JSON report |
| `tt config` | Init/show `~/.trading-tool/config.json` |

## Setup

From the repo root (after `npm install`):

```bash
npm link          # installs global `tv` and `tt`
# or
npm run tt -- help
```

MCP (Claude Code + Grok) already points at `src/server.js` when installed via this project.

1. Launch TradingView in debug mode:
   ```bash
   tt launch
   # or
   ./scripts/launch_tv_debug_mac.sh
   ```
2. Verify:
   ```bash
   tt status
   ```
3. Customize watchlist:
   ```bash
   tt config
   # edit ~/.trading-tool/config.json
   ```

## Workflow examples

```bash
# Morning session
tt launch
tt brief --save

# Focus one market
tt analyze BINANCE:BTCUSDT --tf 15

# Custom scan
tt scan ES1! NQ1! CL1! --tf 60 --json

# 4-chart workspace
tt setup BINANCE:BTCUSDT BINANCE:ETHUSDT CME_MINI:ES1! COMEX:GC1! --layout 2x2

# Draw nearest Pine levels on chart
tt levels --draw

# Archive chart state
tt snapshot --save
```

Reports land in `./reports` (override with `output_dir` in config).

## Config

Default: `trading-tool/config.default.json`  
User: `~/.trading-tool/config.json` (created by `tt config`)  
Project: `./trading-tool.config.json` in cwd (wins over user)

```json
{
  "watchlist": ["BINANCE:BTCUSDT", "CME_MINI:ES1!"],
  "default_timeframe": "15",
  "scan_delay_ms": 1500,
  "layout": "2x2",
  "bias": {
    "bull_threshold_pct": 0.35,
    "bear_threshold_pct": -0.35
  },
  "output_dir": "./reports"
}
```

## Architecture

```
tt (CLI)
  └── trading-tool/lib/*   workflows + analysis
        └── src/core/*     tradingview-mcp CDP bridge
              └── TradingView Desktop :9222
```

Low-level chart control remains available via the original `tv` CLI and MCP tools (`tv_health_check`, `quote_get`, …).

## Disclaimer

Chart interaction only. No order routing. You are responsible for compliance with TradingView’s Terms of Use.
