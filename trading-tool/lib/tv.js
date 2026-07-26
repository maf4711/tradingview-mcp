/**
 * Thin wrappers around tradingview-mcp core for the trading tool.
 */
import { chart, data, health, capture, drawing } from '../../src/core/index.js';
import * as pane from '../../src/core/pane.js';
import {
  parseChangePct,
  interpretStudies,
  summarizeLevels,
  nearestLevels,
  overallBias,
  biasFromChange,
} from './analysis.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function status() {
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

export async function launchTv(opts = {}) {
  return health.launch(opts);
}

/**
 * Full snapshot of the currently visible chart.
 */
export async function analyzeCurrent(cfg) {
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
    bias,
    signals,
    levels: near,
    all_levels: allLevels.slice(0, 40),
    tables: tables.studies || tables,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Scan multiple symbols: switch chart, read quote + ohlcv summary, restore optional.
 */
export async function scanSymbols(symbols, cfg = {}) {
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
      /* keep current TF */
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
      row.open = ohlcv.open;
      row.high = ohlcv.high;
      row.low = ohlcv.low;
      row.change = ohlcv.change;
      row.change_pct = ohlcv.change_pct;
      row.change_pct_num = changePct;
      row.avg_volume = ohlcv.avg_volume;
      row.bias = biasFromChange(changePct, cfg.bias);
      row.timeframe = tf || original?.resolution;
      if (quote.error) row.quote_error = quote.error;
      if (ohlcv.error) row.ohlcv_error = ohlcv.error;
    } catch (err) {
      row.error = err.message;
      row.bias = 'unknown';
    }
    results.push(row);
  }

  if (original?.symbol) {
    try {
      await chart.setSymbol({ symbol: original.symbol });
      if (original.resolution) await chart.setTimeframe({ timeframe: String(original.resolution) });
    } catch {
      /* leave on last scanned */
    }
  }

  return results;
}

/**
 * Multi-pane setup: layout + symbols into panes.
 */
export async function setupWorkspace({ layout, symbols, timeframe }) {
  const result = { layout, symbols: [], timeframe };

  if (layout) {
    result.layout_result = await pane.setLayout({ layout });
  }

  const panes = await pane.list();
  const paneCount = panes.panes?.length || panes.count || symbols.length;
  const list = symbols.slice(0, paneCount);

  // pane indexes are 0-based (see core/pane.js)
  for (let i = 0; i < list.length; i++) {
    try {
      const r = await pane.setSymbol({ index: i, symbol: list[i] });
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

export async function takeScreenshot(region = 'chart') {
  return capture.captureScreenshot({ region });
}

export async function drawKeyLevels(levels, { max = 4 } = {}) {
  // createShape requires { time, price }; use last bar time as anchor
  let time = Math.floor(Date.now() / 1000);
  try {
    const q = await data.getQuote();
    if (q.time) time = q.time;
  } catch {
    /* keep now */
  }

  const drawn = [];
  const toDraw = levels.slice(0, max);
  for (const lv of toDraw) {
    try {
      const r = await drawing.drawShape({
        shape: 'horizontal_line',
        point: { time, price: lv.price },
        text: lv.text || String(lv.price),
      });
      drawn.push({ price: lv.price, ok: true, result: r });
    } catch (err) {
      drawn.push({ price: lv.price, ok: false, error: err.message });
    }
  }
  return drawn;
}
