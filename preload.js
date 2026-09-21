const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controllerAPI', {
  authStatus: () => ipcRenderer.invoke('auth:status'),
  setPasscode: passcode => ipcRenderer.invoke('auth:set-passcode', passcode),
  resetPasscode: () => ipcRenderer.invoke('auth:reset-passcode'),
  verifyPasscode: passcode => ipcRenderer.invoke('auth:verify', passcode),
  readRecords: () => ipcRenderer.invoke('records:read'),
  writeRecords: records => ipcRenderer.invoke('records:write', records),
  kalshiStatus: () => ipcRenderer.invoke('kalshi:status'),
  kalshiMarkets: params => ipcRenderer.invoke('kalshi:markets', params),
  kalshiMarket: ticker => ipcRenderer.invoke('kalshi:market', ticker),
  kalshiOrderbook: ticker => ipcRenderer.invoke('kalshi:orderbook', ticker),
  kalshiSnapshot: ticker => ipcRenderer.invoke('kalshi:snapshot', ticker)
});
