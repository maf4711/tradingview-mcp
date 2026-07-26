/**
 * TV Trading Desk — Electron main process (macOS)
 */
import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  nativeTheme,
} from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { getBridgeRoot } from './paths.js';
import { loadConfig, saveConfig, configPath } from './services/config-store.js';
import { createTradingService } from './services/trading.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.argv.includes('--dev');

let mainWindow = null;
let trading = null;
let statusTimer = null;

function log(msg, level = 'info') {
  const entry = { t: new Date().toISOString(), level, msg: String(msg) };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', entry);
  }
  if (isDev) console.log(`[${level}]`, msg);
}

async function initTrading() {
  const bridgeRoot = getBridgeRoot(app);
  // Ensure bridge node_modules resolve when we import core
  const coreUrl = pathToFileURL(join(bridgeRoot, 'src/core/index.js')).href;
  const analysisUrl = pathToFileURL(
    join(bridgeRoot, 'trading-tool/lib/analysis.js')
  ).href;

  // Packaged layout uses bridge/src and bridge/trading-tool
  let core;
  let analysis;
  try {
    core = await import(coreUrl);
  } catch (e) {
    // try packaged paths
    const altCore = pathToFileURL(join(bridgeRoot, 'src/core/index.js')).href;
    core = await import(altCore);
  }
  try {
    analysis = await import(analysisUrl);
  } catch {
    analysis = await import(
      pathToFileURL(join(bridgeRoot, 'trading-tool/lib/analysis.js')).href
    );
  }

  trading = createTradingService({ core, analysis, bridgeRoot });
  log(`Bridge ready: ${bridgeRoot}`);
  return trading;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0b0f14',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Trading',
      submenu: [
        {
          label: 'Launch TradingView',
          accelerator: 'CmdOrCtrl+L',
          click: async () => {
            try {
              await trading.launch();
              log('TradingView launched');
              pushStatus();
            } catch (e) {
              log(e.message, 'error');
            }
          },
        },
        {
          label: 'Refresh Status',
          accelerator: 'CmdOrCtrl+R',
          click: () => pushStatus(),
        },
        {
          label: 'Analyze Chart',
          accelerator: 'CmdOrCtrl+A',
          click: () => mainWindow?.webContents.send('menu:analyze'),
        },
        {
          label: 'Morning Brief',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('menu:brief'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function pushStatus() {
  if (!trading || !mainWindow) return;
  try {
    const st = await trading.status();
    mainWindow.webContents.send('status', st);
  } catch (e) {
    mainWindow.webContents.send('status', { ok: false, error: e.message });
  }
}

function startStatusPoll() {
  stopStatusPoll();
  const cfg = loadConfig();
  if (!cfg.auto_refresh_status) return;
  const ms = Math.max(2000, cfg.poll_interval_ms || 5000);
  statusTimer = setInterval(pushStatus, ms);
  pushStatus();
}

function stopStatusPoll() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

function registerIpc() {
  ipcMain.handle('config:get', () => loadConfig());
  ipcMain.handle('config:save', (_e, partial) => {
    const next = saveConfig(partial || {});
    startStatusPoll();
    return next;
  });
  ipcMain.handle('config:path', () => configPath());
  ipcMain.handle('shell:open', (_e, url) => shell.openExternal(url));
  ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));

  const wrap = (fn) => async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      log(err.message, 'error');
      return { ok: false, error: err.message };
    }
  };

  ipcMain.handle(
    'tv:status',
    wrap(async () => trading.status())
  );
  ipcMain.handle(
    'tv:launch',
    wrap(async () => {
      log('Launching TradingView…');
      const r = await trading.launch();
      log('Launch complete');
      setTimeout(pushStatus, 1500);
      return r;
    })
  );
  ipcMain.handle(
    'tv:analyze',
    wrap(async (opts = {}) => {
      const cfg = loadConfig();
      if (opts?.symbol) await trading.setSymbol(opts.symbol);
      if (opts?.timeframe) await trading.setTimeframe(opts.timeframe);
      log(`Analyze ${opts?.symbol || 'current'}…`);
      return trading.analyzeCurrent(cfg);
    })
  );
  ipcMain.handle(
    'tv:scan',
    wrap(async (symbols) => {
      const cfg = loadConfig();
      const list = symbols?.length ? symbols : cfg.watchlist;
      log(`Scan ${list.length} symbols…`);
      return trading.scanSymbols(list, cfg);
    })
  );
  ipcMain.handle(
    'tv:brief',
    wrap(async () => {
      log('Building brief…');
      return trading.brief(loadConfig());
    })
  );
  ipcMain.handle(
    'tv:setup',
    wrap(async (payload) => {
      const cfg = loadConfig();
      return trading.setupWorkspace({
        layout: payload?.layout || cfg.layout,
        symbols: payload?.symbols || cfg.watchlist.slice(0, 4),
        timeframe: payload?.timeframe || cfg.default_timeframe,
      });
    })
  );
  ipcMain.handle(
    'tv:levels',
    wrap(async (opts) => trading.levels(loadConfig(), { draw: !!opts?.draw }))
  );
  ipcMain.handle(
    'tv:snapshot',
    wrap(async () => trading.snapshot(loadConfig()))
  );
  ipcMain.handle(
    'tv:setSymbol',
    wrap(async (symbol) => trading.setSymbol(symbol))
  );
  ipcMain.handle(
    'tv:setTimeframe',
    wrap(async (tf) => trading.setTimeframe(tf))
  );
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  try {
    await initTrading();
  } catch (e) {
    console.error('Bridge init failed', e);
  }
  registerIpc();
  buildMenu();
  createWindow();
  startStatusPoll();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  stopStatusPoll();
  try {
    await trading?.disconnect();
  } catch {
    /* */
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  stopStatusPoll();
  try {
    await trading?.disconnect();
  } catch {
    /* */
  }
});
