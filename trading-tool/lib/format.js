/** Human-friendly terminal formatting (also emits JSON with --json). */

export function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(rows, columns) {
  if (!rows.length) {
    console.log('(empty)');
    return;
  }
  const cols = columns || Object.keys(rows[0]);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length))
  );
  const line = (vals) => vals.map((v, i) => String(v ?? '').padEnd(widths[i])).join('  ');
  console.log(line(cols));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(line(cols.map((c) => row[c])));
  }
}

export function printStatus(st) {
  if (!st.ok) {
    console.log(`✗ TradingView not connected: ${st.error}`);
    console.log('  → Start with:  tt launch   or   ./scripts/launch_tv_debug_mac.sh');
    console.log('  → Then verify: tt status');
    return;
  }
  console.log('✓ CDP connected');
  console.log(`  Symbol:     ${st.symbol}`);
  console.log(`  Timeframe:  ${st.resolution}`);
  console.log(`  Chart type: ${st.chart_type}`);
  console.log(`  API:        ${st.api_available ? 'available' : 'missing'}`);
  if (st.target_title) console.log(`  Window:     ${st.target_title}`);
}

export function printAnalyze(a) {
  console.log(`\n══ Chart Analysis: ${a.symbol} (${a.timeframe}) ══`);
  console.log(`Price:  ${a.price}`);
  console.log(`Change: ${a.change_pct}  → Bias: ${a.bias.toUpperCase()}`);
  if (a.ohlcv && !a.ohlcv.error) {
    console.log(`Range:  ${a.ohlcv.low} – ${a.ohlcv.high}  (avg vol ${a.ohlcv.avg_volume})`);
  }
  if (a.signals?.length) {
    console.log('\nSignals:');
    for (const s of a.signals) {
      console.log(`  • ${s.indicator}: ${typeof s.value === 'object' ? JSON.stringify(s.value) : s.value} → ${s.signal}`);
    }
  }
  if (a.levels) {
    console.log('\nNearest levels:');
    for (const r of a.levels.resistance || []) {
      console.log(`  R ${r.price}${r.text ? `  ${r.text}` : ''}`);
    }
    for (const s of a.levels.support || []) {
      console.log(`  S ${s.price}${s.text ? `  ${s.text}` : ''}`);
    }
  }
  if (a.studies_on_chart?.length) {
    console.log(`\nStudies: ${a.studies_on_chart.join(', ')}`);
  }
  console.log('');
}

export function printScan(rows) {
  console.log('\n══ Watchlist Scan ══');
  printTable(
    rows.map((r) => ({
      symbol: r.symbol,
      price: r.price ?? '—',
      change: r.change_pct ?? '—',
      bias: r.bias,
      ok: r.success ? '✓' : '✗',
    })),
    ['symbol', 'price', 'change', 'bias', 'ok']
  );
  const counts = rows.reduce((a, r) => {
    a[r.bias] = (a[r.bias] || 0) + 1;
    return a;
  }, {});
  console.log(`\nTone: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ')}\n`);
}
