const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controllerAPI', {
  readRecords: () => ipcRenderer.invoke('records:read'),
  writeRecords: records => ipcRenderer.invoke('records:write', records),
  kalshiStatus: () => ipcRenderer.invoke('kalshi:status'),
  kalshiConfigure: (apiKeyId, privateKey) => ipcRenderer.invoke('kalshi:configure', {apiKeyId, privateKey}),
  kalshiClearCredentials: () => ipcRenderer.invoke('kalshi:clearCredentials'),
  kalshiArm: () => ipcRenderer.invoke('kalshi:arm'),
  kalshiDisarm: () => ipcRenderer.invoke('kalshi:disarm'),
  kalshiBalance: () => ipcRenderer.invoke('kalshi:balance'),
  kalshiPositions: ticker => ipcRenderer.invoke('kalshi:positions', ticker),
  kalshiOrder: order => ipcRenderer.invoke('kalshi:order', order),
  kalshiMarkets: params => ipcRenderer.invoke('kalshi:markets', params),
  kalshiMarket: ticker => ipcRenderer.invoke('kalshi:market', ticker),
  kalshiOrderbook: ticker => ipcRenderer.invoke('kalshi:orderbook', ticker),
  kalshiSnapshot: ticker => ipcRenderer.invoke('kalshi:snapshot', ticker),
  btcSpot: () => ipcRenderer.invoke('btc:spot')
});