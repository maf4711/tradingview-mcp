/* TV Trading Desk — renderer */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let config = null;
let lastBriefMd = '';
let logLines = [];

function toast(msg, type = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2800);
}

function setBusy(on, text = 'Working…') {
  const el = $('#busy');
  $('#busy-text').textContent = text;
  el.classList.toggle('hidden', !on);
}

function biasBadge(bias) {
  const b = (bias || 'unknown').toLowerCase();
  return `<span class="bias ${b}">${b}</span>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function appendLog(entry) {
  const line = `[${entry.t?.slice(11, 19) || ''}] ${entry.msg}`;
  logLines.push({ ...entry, line });
  if (logLines.length > 400) logLines.shift();
  const view = $('#log-view');
  if (!view) return;
  const cls = entry.level === 'error' ? 'err' : 'info';
  view.innerHTML += `<div class="${cls}">${escapeHtml(line)}</div>`;
  view.scrollTop = view.scrollHeight;
}

function showView(name) {
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
}

function updateConnectionUI(st) {
  const pill = $('#conn-pill');
  const ok = !!st?.ok;
  pill.dataset.ok = ok ? 'true' : 'false';
  $('#conn-text').textContent = ok
    ? `${st.symbol || 'connected'} · ${st.resolution || ''}`
    : st?.error
      ? 'Disconnected'
      : 'Disconnected';

  $('#dash-conn').textContent = ok ? 'Connected' : 'Offline';
  $('#dash-conn').style.color = ok ? 'var(--green)' : 'var(--red)';
  $('#dash-window').textContent = ok
    ? st.target_title || 'TradingView API available'
    : st?.error || 'Launch TradingView with CDP';
  $('#dash-symbol').textContent = ok ? st.symbol || '—' : '—';
  $('#dash-tf').textContent = ok
    ? `Timeframe ${st.resolution || '—'} · type ${st.chart_type ?? '—'}`
    : 'No chart';
}

async function withBusy(label, fn) {
  setBusy(true, label);
  try {
    const res = await fn();
    if (res && res.ok === false) {
      toast(res.error || 'Failed', 'error');
      appendLog({ t: new Date().toISOString(), level: 'error', msg: res.error });
      return null;
    }
    return res?.data !== undefined ? res.data : res;
  } catch (e) {
    toast(e.message, 'error');
    appendLog({ t: new Date().toISOString(), level: 'error', msg: e.message });
    return null;
  } finally {
    setBusy(false);
  }
}

function renderAnalyze(a) {
  if (!a) return;
  const o = a.ohlcv || {};
  const signals = (a.signals || [])
    .map(
      (s) =>
        `<div class="signal-row"><span>${escapeHtml(s.indicator)}</span><span>${escapeHtml(
          typeof s.value === 'object' ? JSON.stringify(s.value) : s.value
        )} · ${escapeHtml(s.signal)}</span></div>`
    )
    .join('');

  const res = a.levels?.resistance || [];
  const sup = a.levels?.support || [];

  $('#analyze-result').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="k">Symbol</div><div class="v">${escapeHtml(a.symbol)}</div></div>
      <div class="kpi"><div class="k">Price</div><div class="v">${escapeHtml(a.price)}</div></div>
      <div class="kpi"><div class="k">Change</div><div class="v">${escapeHtml(a.change_pct)}</div></div>
      <div class="kpi"><div class="k">Bias</div><div class="v">${biasBadge(a.bias)}</div></div>
      <div class="kpi"><div class="k">Range</div><div class="v" style="font-size:14px">${escapeHtml(o.low)} – ${escapeHtml(o.high)}</div></div>
      <div class="kpi"><div class="k">Avg Vol</div><div class="v" style="font-size:14px">${escapeHtml(o.avg_volume)}</div></div>
    </div>
    <p class="muted small">TF ${escapeHtml(a.timeframe)} · Studies: ${escapeHtml((a.studies_on_chart || []).join(', ') || '—')}</p>
    ${signals ? `<h3 style="margin:16px 0 8px;font-size:13px;color:var(--muted)">Signals</h3><div class="signals">${signals}</div>` : ''}
    <div class="level-cols">
      <div>
        <h3 style="margin:0 0 8px;font-size:12px;color:var(--muted)">RESISTANCE</h3>
        <ul class="level-list">${
          res.length
            ? res.map((l) => `<li><span>${escapeHtml(l.price)}</span><span class="muted">${escapeHtml(l.text || l.source || '')}</span></li>`).join('')
            : '<li class="muted">—</li>'
        }</ul>
      </div>
      <div>
        <h3 style="margin:0 0 8px;font-size:12px;color:var(--muted)">SUPPORT</h3>
        <ul class="level-list">${
          sup.length
            ? sup.map((l) => `<li><span>${escapeHtml(l.price)}</span><span class="muted">${escapeHtml(l.text || l.source || '')}</span></li>`).join('')
            : '<li class="muted">—</li>'
        }</ul>
      </div>
    </div>
  `;
  $('#analyze-result').classList.remove('empty-hint');
}

function renderScan(rows) {
  if (!rows) return;
  const body = rows
    .map(
      (r) => `<tr>
      <td>${escapeHtml(r.symbol)}</td>
      <td class="num">${escapeHtml(r.price ?? '—')}</td>
      <td class="num">${escapeHtml(r.change_pct ?? '—')}</td>
      <td>${biasBadge(r.bias)}</td>
      <td>${r.success ? '✓' : '✗'}</td>
    </tr>`
    )
    .join('');
  const counts = rows.reduce((a, r) => {
    a[r.bias] = (a[r.bias] || 0) + 1;
    return a;
  }, {});
  $('#scan-result').innerHTML = `
    <table class="data">
      <thead><tr><th>Symbol</th><th style="text-align:right">Price</th><th style="text-align:right">Change</th><th>Bias</th><th>OK</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="muted small mt">Tone: ${escapeHtml(JSON.stringify(counts))}</p>
  `;
  $('#scan-result').classList.remove('empty-hint');
}

function renderLevels(p) {
  if (!p) return;
  const all = p.all_levels || [];
  $('#levels-result').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="k">Symbol</div><div class="v">${escapeHtml(p.symbol)}</div></div>
      <div class="kpi"><div class="k">Price</div><div class="v">${escapeHtml(p.price)}</div></div>
      <div class="kpi"><div class="k">Bias</div><div class="v">${biasBadge(p.bias)}</div></div>
      <div class="kpi"><div class="k">Levels found</div><div class="v">${all.length}</div></div>
    </div>
    <div class="level-cols">
      <div>
        <h3 style="margin:0 0 8px;font-size:12px;color:var(--muted)">NEAREST R</h3>
        <ul class="level-list">${
          (p.nearest?.resistance || [])
            .map((l) => `<li><span>${escapeHtml(l.price)}</span><span class="muted">${escapeHtml(l.text || '')}</span></li>`)
            .join('') || '<li class="muted">—</li>'
        }</ul>
      </div>
      <div>
        <h3 style="margin:0 0 8px;font-size:12px;color:var(--muted)">NEAREST S</h3>
        <ul class="level-list">${
          (p.nearest?.support || [])
            .map((l) => `<li><span>${escapeHtml(l.price)}</span><span class="muted">${escapeHtml(l.text || '')}</span></li>`)
            .join('') || '<li class="muted">—</li>'
        }</ul>
      </div>
    </div>
    ${
      p.drawn
        ? `<p class="muted small mt">Drawn: ${p.drawn.map((d) => `${d.price}${d.ok ? '✓' : '✗'}`).join(', ')}</p>`
        : ''
    }
    ${!all.length ? '<p class="muted mt">Keine Pine-Levels — Indikatoren mit line.new/label.new auf den Chart legen.</p>' : ''}
  `;
  $('#levels-result').classList.remove('empty-hint');
}

async function loadSettingsUI() {
  config = await window.desk.getConfig();
  $('#cfg-watchlist').value = (config.watchlist || []).join('\n');
  $('#cfg-tf').value = config.default_timeframe || '15';
  $('#cfg-delay').value = config.scan_delay_ms ?? 1500;
  $('#cfg-layout').value = config.layout || '2x2';
  $('#cfg-bull').value = config.bias?.bull_threshold_pct ?? 0.35;
  $('#cfg-bear').value = config.bias?.bear_threshold_pct ?? -0.35;
  $('#cfg-poll').value = config.poll_interval_ms ?? 5000;
  $('#cfg-auto').checked = !!config.auto_refresh_status;
  $('#setup-symbols').value = (config.watchlist || []).slice(0, 4).join(', ');
  $('#setup-layout').value = config.layout || '2x2';
  $('#setup-tf').value = config.default_timeframe || '15';
  const path = await window.desk.getConfigPath();
  $('#settings-path').textContent = path;
}

function wire() {
  $$('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
  $$('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.go));
  });

  $('#btn-refresh').addEventListener('click', async () => {
    const res = await window.desk.status();
    if (res.ok) updateConnectionUI(res.data);
    else updateConnectionUI(res);
  });

  $('#btn-launch').addEventListener('click', async () => {
    const data = await withBusy('Launching TradingView…', () => window.desk.launch());
    if (data) toast('TradingView gestartet');
  });

  $('#btn-analyze').addEventListener('click', async () => {
    const symbol = $('#analyze-symbol').value.trim() || undefined;
    const timeframe = $('#analyze-tf').value || undefined;
    const data = await withBusy('Analyzing chart…', () =>
      window.desk.analyze({ symbol, timeframe })
    );
    if (data) {
      renderAnalyze(data);
      toast('Analyze complete');
    }
  });

  $('#btn-scan').addEventListener('click', async () => {
    const raw = $('#scan-symbols').value.trim();
    const symbols = raw
      ? raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
      : undefined;
    const data = await withBusy('Scanning watchlist…', () => window.desk.scan(symbols));
    if (data) {
      renderScan(data);
      toast(`Scan: ${data.length} symbols`);
    }
  });

  $('#btn-brief').addEventListener('click', async () => {
    const data = await withBusy('Building morning brief…', () => window.desk.brief());
    if (data) {
      lastBriefMd = data.markdown || '';
      $('#btn-brief-copy').disabled = !lastBriefMd;
      let html = `<div class="markdown">${escapeHtml(lastBriefMd)}</div>`;
      if (data.scan?.length) {
        html += '<div class="mt"></div>';
        $('#brief-result').innerHTML = html;
        // also table
        const tmp = document.createElement('div');
        renderScan(data.scan);
        html += $('#scan-result').innerHTML;
        // restore scan view message? leave scan result as is from brief is ok
      }
      $('#brief-result').innerHTML = html;
      if (data.scan?.length) {
        const tableHost = document.createElement('div');
        tableHost.className = 'mt';
        const prev = $('#scan-result').innerHTML;
        renderScan(data.scan);
        tableHost.innerHTML = $('#scan-result').innerHTML;
        // put scan result back empty-ish - actually keep scan filled is fine
        $('#brief-result').appendChild(tableHost);
      }
      $('#brief-result').classList.remove('empty-hint');
      toast('Brief ready');
    }
  });

  $('#btn-brief-copy').addEventListener('click', async () => {
    if (!lastBriefMd) return;
    try {
      await navigator.clipboard.writeText(lastBriefMd);
      toast('Markdown kopiert');
    } catch {
      toast('Copy failed', 'error');
    }
  });

  $('#btn-levels').addEventListener('click', async () => {
    const data = await withBusy('Reading levels…', () => window.desk.levels({ draw: false }));
    if (data) {
      renderLevels(data);
      toast('Levels gelesen');
    }
  });

  $('#btn-levels-draw').addEventListener('click', async () => {
    const data = await withBusy('Drawing levels…', () => window.desk.levels({ draw: true }));
    if (data) {
      renderLevels(data);
      toast('Levels gezeichnet');
    }
  });

  $('#btn-setup').addEventListener('click', async () => {
    const symbols = $('#setup-symbols').value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      layout: $('#setup-layout').value,
      timeframe: $('#setup-tf').value,
      symbols,
    };
    const data = await withBusy('Applying layout…', () => window.desk.setup(payload));
    if (data) {
      $('#setup-result').innerHTML = `<pre class="markdown">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
      $('#setup-result').classList.remove('empty-hint');
      toast('Setup applied');
    }
  });

  $('#btn-snapshot').addEventListener('click', async () => {
    const data = await withBusy('Snapshot…', () => window.desk.snapshot());
    if (data) {
      renderAnalyze(data.analysis);
      let extra = '';
      if (data.screenshot?.file_path) {
        // file:// may be blocked; show path
        extra = `<p class="muted small mt">Screenshot: <code>${escapeHtml(data.screenshot.file_path)}</code></p>
          <p class="muted small">Report: <code>${escapeHtml(data.report_json)}</code></p>`;
      } else if (data.screenshot?.error) {
        extra = `<p class="muted mt">Screenshot: ${escapeHtml(data.screenshot.error)}</p>`;
      }
      $('#snapshot-result').innerHTML = $('#analyze-result').innerHTML + extra;
      $('#snapshot-result').classList.remove('empty-hint');
      toast('Snapshot saved');
    }
  });

  $('#btn-open-reports').addEventListener('click', async () => {
    // open home reports dir via path constructed in main is better; use config path parent
    const p = await window.desk.getConfigPath();
    const dir = p.replace(/config\.json$/, 'reports');
    await window.desk.openPath(dir);
  });

  $('#btn-save-cfg').addEventListener('click', async () => {
    const watchlist = $('#cfg-watchlist').value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const next = await window.desk.saveConfig({
      watchlist,
      default_timeframe: $('#cfg-tf').value.trim() || '15',
      scan_delay_ms: Number($('#cfg-delay').value) || 1500,
      layout: $('#cfg-layout').value.trim() || '2x2',
      bias: {
        bull_threshold_pct: Number($('#cfg-bull').value),
        bear_threshold_pct: Number($('#cfg-bear').value),
      },
      poll_interval_ms: Number($('#cfg-poll').value) || 5000,
      auto_refresh_status: $('#cfg-auto').checked,
    });
    config = next;
    $('#cfg-saved').textContent = 'Gespeichert ✓';
    toast('Settings saved');
    setTimeout(() => ($('#cfg-saved').textContent = ''), 2000);
  });

  $('#btn-clear-logs').addEventListener('click', () => {
    logLines = [];
    $('#log-view').innerHTML = '';
  });

  window.desk.onStatus((st) => updateConnectionUI(st));
  window.desk.onLog((entry) => appendLog(entry));
  window.desk.onMenu?.('menu:analyze', () => {
    showView('analyze');
    $('#btn-analyze').click();
  });
  window.desk.onMenu?.('menu:brief', () => {
    showView('brief');
    $('#btn-brief').click();
  });
}

async function boot() {
  wire();
  await loadSettingsUI();
  const res = await window.desk.status();
  if (res.ok) updateConnectionUI(res.data);
  else updateConnectionUI({ ok: false, error: res.error });
  appendLog({ t: new Date().toISOString(), level: 'info', msg: 'TV Trading Desk ready' });
}

boot();
