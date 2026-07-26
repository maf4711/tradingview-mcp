const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (partial) => ipcRenderer.invoke('config:save', partial),
  getConfigPath: () => ipcRenderer.invoke('config:path'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  platform: process.platform,

  status: () => ipcRenderer.invoke('tv:status'),
  launch: () => ipcRenderer.invoke('tv:launch'),
  analyze: (opts) => ipcRenderer.invoke('tv:analyze', opts),
  scan: (symbols) => ipcRenderer.invoke('tv:scan', symbols),
  brief: () => ipcRenderer.invoke('tv:brief'),
  setup: (payload) => ipcRenderer.invoke('tv:setup', payload),
  levels: (opts) => ipcRenderer.invoke('tv:levels', opts),
  snapshot: () => ipcRenderer.invoke('tv:snapshot'),
  setSymbol: (symbol) => ipcRenderer.invoke('tv:setSymbol', symbol),
  setTimeframe: (tf) => ipcRenderer.invoke('tv:setTimeframe', tf),

  onLog: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('log', handler);
    return () => ipcRenderer.removeListener('log', handler);
  },
  onStatus: (cb) => {
    const handler = (_e, st) => cb(st);
    ipcRenderer.on('status', handler);
    return () => ipcRenderer.removeListener('status', handler);
  },
  onMenu: (channel, cb) => {
    const handler = () => cb();
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
