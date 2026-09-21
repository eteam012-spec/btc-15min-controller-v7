const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controllerAPI', {
  readRecords: () => ipcRenderer.invoke('records:read'),
  writeRecords: records => ipcRenderer.invoke('records:write', records),
  kalshiStatus: () => ipcRenderer.invoke('kalshi:status'),
  kalshiMarkets: params => ipcRenderer.invoke('kalshi:markets', params),
  kalshiMarket: ticker => ipcRenderer.invoke('kalshi:market', ticker),
  kalshiOrderbook: ticker => ipcRenderer.invoke('kalshi:orderbook', ticker),
  kalshiSnapshot: ticker => ipcRenderer.invoke('kalshi:snapshot', ticker)
});