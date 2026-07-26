#!/usr/bin/env node
/**
 * tt — Trading Tool built on tradesdontlie/tradingview-mcp
 *
 * High-level workflows for session prep, multi-symbol scan, and chart analysis.
 * Requires TradingView Desktop with CDP on port 9222.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig, ensureUserConfig, resolveOutputDir } from '../lib/config.js';
import { formatBriefText } from '../lib/analysis.js';
import * as tv from '../lib/tv.js';
import {
  printJson,
  printStatus,
  printAnalyze,
  printScan,
} from '../lib/format.js';

const HELP = `
tt — Trading Tool (TradingView Desktop via CDP)

Usage:
  tt <command> [options]

Commands:
  status                 Check connection to TradingView (CDP :9222)
  launch                 Launch TradingView with remote debugging
  analyze [symbol]       Full analysis of active chart (or switch symbol first)
  brief                  Morning brief: active chart + watchlist scan
  scan [sym ...]         Scan watchlist (or given symbols)
  setup [sym ...]        Multi-pane layout + assign symbols
  levels [--draw]        List S/R from Pine lines/labels; optional draw H-lines
  snapshot               Analyze + save screenshot + markdown report
  config                 Show / init user config (~/.trading-tool/config.json)
  help                   Show this help

Options:
  --json                 Machine-readable JSON output
  --config <path>        Config file path
  --tf <resolution>      Timeframe (e.g. 15, 60, D)
  --layout <grid>        Pane layout for setup (e.g. 2x2, 3x1)
  --draw                 With levels: draw nearest lines on chart
  --save                 Write report to output_dir

Examples:
  tt launch
  tt status
  tt analyze
  tt analyze BTCUSDT --tf 15
  tt scan
  tt scan ES1! NQ1! GC1! --tf 60
  tt brief --save
  tt setup BTCUSDT ETHUSDT SOLUSDT --layout 2x2
  tt levels --draw
  tt snapshot --save

Requires: TradingView Desktop + paid subscription. Local CDP only.
Not affiliated with TradingView Inc. Not financial advice.
`.trim();

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    json: false,
    save: false,
    draw: false,
    config: null,
    tf: null,
    layout: null,
  };
  const positionals = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') flags.json = true;
    else if (a === '--save') flags.save = true;
    else if (a === '--draw') flags.draw = true;
    else if (a === '--config') flags.config = args[++i];
    else if (a === '--tf') flags.tf = args[++i];
    else if (a === '--layout') flags.layout = args[++i];
    else if (a === '--help' || a === '-h') positionals.unshift('help');
    else if (a.startsWith('--')) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    } else positionals.push(a);
  }

  return { cmd: positionals[0] || 'help', rest: positionals.slice(1), flags };
}

async function shutdown(code = 0) {
  try {
    const { disconnect } = await import('../../src/connection.js');
    await disconnect();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

async function main() {
  const { cmd, rest, flags } = parseArgs(process.argv);
  const cfg = loadConfig(flags.config);
  if (flags.tf) cfg.default_timeframe = flags.tf;
  if (flags.layout) cfg.layout = flags.layout;

  try {
    switch (cmd) {
      case 'help':
        console.log(HELP);
        await shutdown(0);
        break;

      case 'config': {
        const path = ensureUserConfig();
        const c = loadConfig(path);
        if (flags.json) printJson({ path, config: c });
        else {
          console.log(`Config: ${c._source}`);
          console.log(`User file ensured at: ${path}`);
          printJson({ ...c, _source: undefined });
        }
        await shutdown(0);
        break;
      }

      case 'status': {
        const st = await tv.status();
        if (flags.json) printJson(st);
        else printStatus(st);
        await shutdown(st.ok ? 0 : 2);
        break;
      }

      case 'launch': {
        console.log('Launching TradingView with CDP…');
        const r = await tv.launchTv({ kill_existing: true });
        if (flags.json) printJson(r);
        else console.log(JSON.stringify(r, null, 2));
        await shutdown(0);
        break;
      }

      case 'analyze': {
        const { chart } = await import('../../src/core/index.js');
        if (rest[0]) await chart.setSymbol({ symbol: rest[0] });
        if (flags.tf) await chart.setTimeframe({ timeframe: String(flags.tf) });
        const a = await tv.analyzeCurrent(cfg);
        if (flags.json) printJson(a);
        else printAnalyze(a);
        if (flags.save) {
          const dir = resolveOutputDir(cfg);
          const file = join(dir, `analyze_${(a.symbol || 'chart').replace(/[^\w.-]+/g, '_')}_${Date.now()}.json`);
          writeFileSync(file, JSON.stringify(a, null, 2));
          console.log(`Saved: ${file}`);
        }
        await shutdown(0);
        break;
      }

      case 'scan': {
        const symbols = rest.length ? rest : cfg.watchlist;
        if (!symbols.length) {
          console.error('No symbols. Pass args or set watchlist in config.');
          await shutdown(1);
        }
        console.error(`Scanning ${symbols.length} symbols (tf=${cfg.default_timeframe})…`);
        const rows = await tv.scanSymbols(symbols, cfg);
        if (flags.json) printJson({ timeframe: cfg.default_timeframe, results: rows });
        else printScan(rows);
        if (flags.save) {
          const dir = resolveOutputDir(cfg);
          const file = join(dir, `scan_${Date.now()}.json`);
          writeFileSync(file, JSON.stringify({ timeframe: cfg.default_timeframe, results: rows }, null, 2));
          console.log(`Saved: ${file}`);
        }
        await shutdown(0);
        break;
      }

      case 'brief': {
        console.error('Building morning brief…');
        const connection = await tv.status();
        let current = null;
        if (connection.ok) {
          try {
            current = await tv.analyzeCurrent(cfg);
          } catch (e) {
            current = { error: e.message };
          }
        }
        const scan = connection.ok
          ? await tv.scanSymbols(cfg.watchlist, cfg)
          : [];

        const report = {
          generated_at: new Date().toISOString(),
          connection: {
            ok: connection.ok,
            symbol: connection.symbol,
            resolution: connection.resolution,
            error: connection.error,
          },
          current: current && !current.error
            ? {
                symbol: current.symbol,
                timeframe: current.timeframe,
                price: current.price,
                change_pct: current.change_pct,
                bias: current.bias,
                signals: current.signals,
                levels: current.levels,
              }
            : current,
          scan,
        };

        if (flags.json) printJson(report);
        else {
          console.log(formatBriefText(report));
          if (scan.length) printScan(scan);
        }

        if (flags.save) {
          const dir = resolveOutputDir(cfg);
          const base = `brief_${Date.now()}`;
          writeFileSync(join(dir, `${base}.json`), JSON.stringify(report, null, 2));
          writeFileSync(join(dir, `${base}.md`), formatBriefText(report));
          console.log(`Saved: ${join(dir, base)}.json|.md`);
        }
        await shutdown(connection.ok ? 0 : 2);
        break;
      }

      case 'setup': {
        const symbols = rest.length ? rest : cfg.watchlist.slice(0, 4);
        const layout = flags.layout || cfg.layout;
        console.error(`Setup layout=${layout} symbols=${symbols.join(', ')}`);
        const r = await tv.setupWorkspace({
          layout,
          symbols,
          timeframe: flags.tf || cfg.default_timeframe,
        });
        if (flags.json) printJson(r);
        else {
          console.log(`Layout: ${layout}`);
          for (const s of r.symbols) {
            console.log(`  pane ${s.index}: ${s.symbol} ${s.ok ? '✓' : '✗ ' + (s.error || '')}`);
          }
        }
        await shutdown(0);
        break;
      }

      case 'levels': {
        const a = await tv.analyzeCurrent(cfg);
        const payload = {
          symbol: a.symbol,
          price: a.price,
          nearest: a.levels,
          all_levels: a.all_levels,
        };
        if (flags.draw) {
          const toDraw = [
            ...(a.levels.resistance || []).slice(0, 2),
            ...(a.levels.support || []).slice(0, 2),
          ];
          payload.drawn = await tv.drawKeyLevels(toDraw, { max: 4 });
        }
        if (flags.json) printJson(payload);
        else {
          console.log(`Levels for ${a.symbol} @ ${a.price}`);
          console.log('\nResistance:');
          for (const r of a.levels.resistance || []) console.log(`  ${r.price}  ${r.text || r.source || ''}`);
          console.log('Support:');
          for (const s of a.levels.support || []) console.log(`  ${s.price}  ${s.text || s.source || ''}`);
          if (payload.drawn) {
            console.log('\nDrawn:');
            for (const d of payload.drawn) console.log(`  ${d.price} ${d.ok ? '✓' : d.error}`);
          }
          if (!a.all_levels?.length) {
            console.log('\n(No Pine levels found — load indicators that draw lines/labels.)');
          }
        }
        await shutdown(0);
        break;
      }

      case 'snapshot': {
        console.error('Snapshot: analyze + screenshot…');
        const a = await tv.analyzeCurrent(cfg);
        let shot = null;
        try {
          shot = await tv.takeScreenshot('chart');
        } catch (e) {
          shot = { error: e.message };
        }
        const dir = resolveOutputDir(cfg);
        const base = `snapshot_${(a.symbol || 'chart').replace(/[^\w.-]+/g, '_')}_${Date.now()}`;
        const jsonPath = join(dir, `${base}.json`);
        const mdPath = join(dir, `${base}.md`);
        const out = { analysis: a, screenshot: shot };
        writeFileSync(jsonPath, JSON.stringify(out, null, 2));
        writeFileSync(
          mdPath,
          formatBriefText({
            generated_at: a.generated_at,
            connection: { ok: true, symbol: a.symbol, resolution: a.timeframe },
            current: {
              symbol: a.symbol,
              timeframe: a.timeframe,
              price: a.price,
              change_pct: a.change_pct,
              bias: a.bias,
              signals: a.signals,
              levels: a.levels,
            },
            scan: [],
          }) + (shot?.file_path ? `\n\nScreenshot: ${shot.file_path}\n` : '')
        );
        if (flags.json) printJson({ ...out, report_json: jsonPath, report_md: mdPath });
        else {
          printAnalyze(a);
          console.log(`JSON: ${jsonPath}`);
          console.log(`MD:   ${mdPath}`);
          if (shot?.file_path) console.log(`PNG:  ${shot.file_path}`);
          if (shot?.error) console.log(`Screenshot error: ${shot.error}`);
        }
        await shutdown(0);
        break;
      }

      default:
        console.error(`Unknown command: ${cmd}\n`);
        console.log(HELP);
        await shutdown(1);
    }
  } catch (err) {
    if (flags.json) printJson({ success: false, error: err.message });
    else {
      console.error(`Error: ${err.message}`);
      if (/ECONNREFUSED|9222|CDP|connect/i.test(err.message)) {
        console.error('Hint: tt launch   # start TradingView with debug port');
      }
    }
    await shutdown(1);
  }
}

main();
