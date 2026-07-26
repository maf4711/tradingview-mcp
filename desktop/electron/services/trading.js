/**
 * Trading workflows — same logic as trading-tool, for Electron main process.
 */
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createTradingService({ core, analysis, bridgeRoot }) {
  const { chart, data, health, capture, drawing } = core;
  // pane is not re-exported from core index in all builds
  let pane;
  async function getPane() {
    if (pane) return pane;
    pane = await import(join(bridgeRoot, 'src/core/pane.js'));
    return pane;
  }

  const {
    parseChangePct,
    interpretStudies,
    summarizeLevels,
    nearestLevels,
    overallBias,
    biasFromChange,
    formatBriefText,
  } = analysis;

  async function status() {
    try {
      const h = await health.healthCheck();
      return {
        ok: true,
        symbol: h.chart_symbol,
        resolution: h.chart_resolution,
        chart_type: h.chart_type,
        api_available: h.api_available,
        cdp_connected: h.cdp_connected,
        target_title: h.target_title,
        update: h.update,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function launch(opts = {}) {
    return health.launch({ kill_existing: true, ...opts });
  }

  async function analyzeCurrent(cfg) {
    const state = await chart.getState();
    const [quote, ohlcv, studiesRaw, lines, labels, tables] = await Promise.all([
      data.getQuote().catch((e) => ({ error: e.message })),
      data.getOhlcv({ count: 100, summary: true }).catch((e) => ({ error: e.message })),
      data.getStudyValues().catch((e) => ({ studies: [], error: e.message })),
      data.getPineLines({}).catch((e) => ({ studies: [], error: e.message })),
      data.getPineLabels({ max_labels: 50 }).catch((e) => ({ studies: [], error: e.message })),
      data.getPineTables({}).catch((e) => ({ studies: [], error: e.message })),
    ]);

    const changePct = parseChangePct(ohlcv.change_pct);
    const { signals } = interpretStudies(studiesRaw.studies || []);
    const allLevels = summarizeLevels(lines, labels);
    const price = quote.last ?? quote.close ?? ohlcv.close;
    const near = nearestLevels(allLevels, price, 3);
    const bias = overallBias(changePct, signals, cfg.bias);

    return {
      symbol: state.symbol,
      timeframe: state.resolution,
      chart_type: state.chartType,
      studies_on_chart: (state.studies || []).map((s) => s.name),
      price,
      quote,
      ohlcv,
      change_pct: ohlcv.change_pct ?? null,
      change_pct_num: changePct,
      bias,
      signals,
      levels: near,
      all_levels: allLevels.slice(0, 40),
      tables: tables.studies || tables,
      studies_raw: studiesRaw.studies || [],
      generated_at: new Date().toISOString(),
    };
  }

  async function setSymbol(symbol) {
    return chart.setSymbol({ symbol });
  }

  async function setTimeframe(timeframe) {
    return chart.setTimeframe({ timeframe: String(timeframe) });
  }

  async function scanSymbols(symbols, cfg = {}) {
    const delay = cfg.scan_delay_ms ?? 1500;
    const tf = cfg.default_timeframe || null;
    const results = [];

    let original = null;
    try {
      const st = await chart.getState();
      original = { symbol: st.symbol, resolution: st.resolution };
    } catch {
      /* ignore */
    }

    if (tf) {
      try {
        await chart.setTimeframe({ timeframe: String(tf) });
        await sleep(400);
      } catch {
        /* keep */
      }
    }

    for (const symbol of symbols) {
      const row = { symbol, success: false };
      try {
        await chart.setSymbol({ symbol });
        await sleep(delay);
        const [quote, ohlcv] = await Promise.all([
          data.getQuote().catch((e) => ({ error: e.message })),
          data.getOhlcv({ count: 50, summary: true }).catch((e) => ({ error: e.message })),
        ]);
        const changePct = parseChangePct(ohlcv.change_pct);
        row.success = !quote.error && !ohlcv.error;
        row.price = quote.last ?? quote.close ?? ohlcv.close ?? null;
        row.high = ohlcv.high;
        row.low = ohlcv.low;
        row.change = ohlcv.change;
        row.change_pct = ohlcv.change_pct;
        row.change_pct_num = changePct;
        row.avg_volume = ohlcv.avg_volume;
        row.bias = biasFromChange(changePct, cfg.bias);
        row.timeframe = tf || original?.resolution;
      } catch (err) {
        row.error = err.message;
        row.bias = 'unknown';
      }
      results.push(row);
    }

    if (original?.symbol) {
      try {
        await chart.setSymbol({ symbol: original.symbol });
        if (original.resolution) {
          await chart.setTimeframe({ timeframe: String(original.resolution) });
        }
      } catch {
        /* leave */
      }
    }

    return results;
  }

  async function brief(cfg) {
    const connection = await status();
    let current = null;
    if (connection.ok) {
      try {
        current = await analyzeCurrent(cfg);
      } catch (e) {
        current = { error: e.message };
      }
    }
    const scan = connection.ok ? await scanSymbols(cfg.watchlist || [], cfg) : [];
    const report = {
      generated_at: new Date().toISOString(),
      connection,
      current,
      scan,
    };
    report.markdown = formatBriefText({
      generated_at: report.generated_at,
      connection: {
        ok: connection.ok,
        symbol: connection.symbol,
        resolution: connection.resolution,
        error: connection.error,
      },
      current:
        current && !current.error
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
    });
    return report;
  }

  async function setupWorkspace({ layout, symbols, timeframe }) {
    const p = await getPane();
    const result = { layout, symbols: [], timeframe };
    if (layout) result.layout_result = await p.setLayout({ layout });
    const list = symbols || [];
    for (let i = 0; i < list.length; i++) {
      try {
        const r = await p.setSymbol({ index: i, symbol: list[i] });
        result.symbols.push({ index: i, symbol: list[i], ok: true, result: r });
      } catch (err) {
        result.symbols.push({ index: i, symbol: list[i], ok: false, error: err.message });
      }
      await sleep(600);
    }
    if (timeframe) {
      try {
        await chart.setTimeframe({ timeframe: String(timeframe) });
        result.timeframe_set = timeframe;
      } catch (e) {
        result.timeframe_error = e.message;
      }
    }
    return result;
  }

  async function levels(cfg, { draw = false } = {}) {
    const a = await analyzeCurrent(cfg);
    const payload = {
      symbol: a.symbol,
      price: a.price,
      nearest: a.levels,
      all_levels: a.all_levels,
      bias: a.bias,
    };
    if (draw) {
      let time = Math.floor(Date.now() / 1000);
      try {
        const q = await data.getQuote();
        if (q.time) time = q.time;
      } catch {
        /* */
      }
      const toDraw = [
        ...(a.levels.resistance || []).slice(0, 2),
        ...(a.levels.support || []).slice(0, 2),
      ];
      payload.drawn = [];
      for (const lv of toDraw) {
        try {
          const r = await drawing.drawShape({
            shape: 'horizontal_line',
            point: { time, price: lv.price },
            text: lv.text || String(lv.price),
          });
          payload.drawn.push({ price: lv.price, ok: true, result: r });
        } catch (err) {
          payload.drawn.push({ price: lv.price, ok: false, error: err.message });
        }
      }
    }
    return payload;
  }

  async function snapshot(cfg) {
    const a = await analyzeCurrent(cfg);
    let shot = null;
    try {
      shot = await capture.captureScreenshot({ region: 'chart' });
    } catch (e) {
      shot = { error: e.message };
    }
    const dir = join(homedir(), '.tv-trading-desk', 'reports');
    mkdirSync(dir, { recursive: true });
    const base = `snapshot_${(a.symbol || 'chart').replace(/[^\w.-]+/g, '_')}_${Date.now()}`;
    const jsonPath = join(dir, `${base}.json`);
    writeFileSync(jsonPath, JSON.stringify({ analysis: a, screenshot: shot }, null, 2));
    return { analysis: a, screenshot: shot, report_json: jsonPath };
  }

  async function disconnect() {
    try {
      const { disconnect } = await import(join(bridgeRoot, 'src/connection.js'));
      await disconnect();
    } catch {
      /* */
    }
  }

  return {
    status,
    launch,
    analyzeCurrent,
    setSymbol,
    setTimeframe,
    scanSymbols,
    brief,
    setupWorkspace,
    levels,
    snapshot,
    disconnect,
  };
}
