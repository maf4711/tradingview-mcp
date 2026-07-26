/**
 * Pure analysis helpers — no CDP dependency.
 */

export function parseChangePct(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const s = String(value).replace('%', '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function biasFromChange(changePct, thresholds = {}) {
  const bull = thresholds.bull_threshold_pct ?? 0.35;
  const bear = thresholds.bear_threshold_pct ?? -0.35;
  if (changePct == null) return 'unknown';
  if (changePct >= bull) return 'bullish';
  if (changePct <= bear) return 'bearish';
  return 'neutral';
}

/** Extract common indicator signals from study value payloads. */
export function interpretStudies(studies = []) {
  const signals = [];
  const flat = {};

  for (const study of studies) {
    const name = (study.name || '').toLowerCase();
    const values = study.values || {};
    flat[study.name || 'unknown'] = values;

    // RSI
    if (name.includes('relative strength') || name === 'rsi' || name.includes('rsi')) {
      const rsiKey = Object.keys(values).find(k => /rsi|plot/i.test(k)) || Object.keys(values)[0];
      const rsi = Number(String(values[rsiKey]).replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(rsi)) {
        let signal = 'neutral';
        if (rsi >= 70) signal = 'overbought';
        else if (rsi <= 30) signal = 'oversold';
        signals.push({ indicator: 'RSI', value: rsi, signal });
      }
    }

    // MACD
    if (name.includes('macd')) {
      const macd = pickNumeric(values, ['MACD', 'macd', 'Plot']);
      const signal = pickNumeric(values, ['Signal', 'signal']);
      const hist = pickNumeric(values, ['Histogram', 'histogram', 'Hist']);
      if (macd != null && signal != null) {
        signals.push({
          indicator: 'MACD',
          value: { macd, signal, histogram: hist },
          signal: macd > signal ? 'bullish_cross_bias' : 'bearish_cross_bias',
        });
      }
    }

    // Moving averages — simple price vs MA if both present
    if (/moving average|ema|sma|vwap/i.test(name)) {
      const ma = pickNumeric(values, ['MA', 'EMA', 'SMA', 'VWAP', 'Plot', 'Median']);
      if (ma != null) {
        signals.push({ indicator: study.name, value: ma, signal: 'level' });
      }
    }
  }

  return { signals, by_name: flat };
}

function pickNumeric(values, keys) {
  for (const k of keys) {
    if (values[k] != null) {
      const n = Number(String(values[k]).replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  // fallback first numeric
  for (const v of Object.values(values)) {
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function summarizeLevels(linesResult, labelsResult) {
  const levels = [];

  for (const study of linesResult?.studies || []) {
    // tradingview-mcp: horizontal_levels is number[]
    for (const price of study.horizontal_levels || study.prices || study.levels || []) {
      const p = typeof price === 'object' ? price.price ?? price.y : price;
      if (p != null) levels.push({ price: Number(p), source: study.name, type: 'line' });
    }
    for (const item of study.all_lines || study.lines || study.items || []) {
      const y = item.price ?? item.y1 ?? item.y;
      if (y != null) levels.push({ price: Number(y), source: study.name, type: 'line' });
    }
  }

  for (const study of labelsResult?.studies || []) {
    for (const lab of study.labels || study.items || []) {
      const price = lab.price ?? lab.y;
      const text = lab.text || lab.label || '';
      if (price != null) {
        levels.push({
          price: Number(price),
          source: study.name,
          type: 'label',
          text: String(text).slice(0, 80),
        });
      }
    }
  }

  // dedupe by rounded price
  const seen = new Map();
  for (const lv of levels) {
    if (!Number.isFinite(lv.price)) continue;
    const key = Math.round(lv.price * 1e6) / 1e6;
    if (!seen.has(key)) seen.set(key, lv);
  }

  return [...seen.values()].sort((a, b) => b.price - a.price);
}

export function nearestLevels(levels, price, n = 3) {
  if (price == null || !levels.length) return { support: [], resistance: [] };
  const below = levels.filter(l => l.price < price).slice(0, n);
  const above = levels.filter(l => l.price > price).sort((a, b) => a.price - b.price).slice(0, n);
  return { support: below, resistance: above };
}

export function overallBias(changePct, studySignals, thresholds) {
  const priceBias = biasFromChange(changePct, thresholds);
  const votes = { bullish: 0, bearish: 0, neutral: 0 };

  if (priceBias === 'bullish') votes.bullish += 2;
  else if (priceBias === 'bearish') votes.bearish += 2;
  else votes.neutral += 1;

  for (const s of studySignals) {
    if (s.signal === 'overbought' || s.signal === 'bearish_cross_bias') votes.bearish += 1;
    else if (s.signal === 'oversold' || s.signal === 'bullish_cross_bias') votes.bullish += 1;
  }

  if (votes.bullish > votes.bearish && votes.bullish > votes.neutral) return 'bullish';
  if (votes.bearish > votes.bullish && votes.bearish > votes.neutral) return 'bearish';
  return 'neutral';
}

export function formatBriefText(report) {
  const lines = [];
  lines.push(`# Trading Brief — ${report.generated_at}`);
  lines.push('');
  if (report.connection) {
    lines.push(`Connection: ${report.connection.ok ? 'OK' : 'FAIL'} | Chart: ${report.connection.symbol || '—'} ${report.connection.resolution || ''}`);
    lines.push('');
  }
  if (report.current) {
    const c = report.current;
    lines.push(`## Active Chart: ${c.symbol} @ ${c.timeframe}`);
    lines.push(`Price: ${c.price} | Change: ${c.change_pct} | Bias: **${c.bias}**`);
    if (c.signals?.length) {
      lines.push('Signals:');
      for (const s of c.signals) {
        lines.push(`  - ${s.indicator}: ${JSON.stringify(s.value)} → ${s.signal}`);
      }
    }
    if (c.levels?.support?.length || c.levels?.resistance?.length) {
      lines.push('Nearest levels:');
      for (const r of c.levels.resistance || []) lines.push(`  R ${r.price}${r.text ? ` (${r.text})` : ''}`);
      for (const s of c.levels.support || []) lines.push(`  S ${s.price}${s.text ? ` (${s.text})` : ''}`);
    }
    lines.push('');
  }
  if (report.scan?.length) {
    lines.push('## Watchlist Scan');
    lines.push('| Symbol | Price | Change | Bias |');
    lines.push('|--------|------:|-------:|------|');
    for (const row of report.scan) {
      lines.push(`| ${row.symbol} | ${row.price ?? '—'} | ${row.change_pct ?? '—'} | ${row.bias} |`);
    }
    lines.push('');
    const counts = report.scan.reduce((a, r) => {
      a[r.bias] = (a[r.bias] || 0) + 1;
      return a;
    }, {});
    lines.push(`Market tone: ${JSON.stringify(counts)}`);
  }
  lines.push('');
  lines.push('_Not financial advice. Chart interaction only via local TradingView Desktop._');
  return lines.join('\n');
}
