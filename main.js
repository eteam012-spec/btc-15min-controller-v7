const { app, BrowserWindow, ipcMain, session, safeStorage, dialog } = require('electron');
const https=require('https');const path=require('path');const fs=require('fs');const crypto=require('crypto');const {getBalance,getPositions,getFills,getSettlements,getOrder,placeIOC,placeOrder}=require('./live-client');
let mainWindow;let liveArmed=false;let autoLive=false;let liveFirstOrderConfirmed=false;const dataDir=path.join(app.getPath('userData'),'data');const recordsFile=path.join(dataDir,'records.json');const credentialsFile=path.join(dataDir,'kalshi.credentials');
function httpsJson(url,timeoutMs=7000){return new Promise((resolve,reject)=>{const req=https.get(url,{headers:{'User-Agent':'BTC-15M-Controller/9.4'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new Error(`HTTP ${res.statusCode}`));try{resolve(JSON.parse(d))}catch(e){reject(e)}})});req.setTimeout(timeoutMs,()=>req.destroy(new Error('Request timed out')));req.on('error',reject)})}
function ensureDataDir(){fs.mkdirSync(dataDir,{recursive:true})}
function saveCredentials(apiKeyId,privateKey){
  ensureDataDir();
  if(!safeStorage.isEncryptionAvailable()) throw new Error('OS secure storage is unavailable');
  const blob=safeStorage.encryptString(JSON.stringify({apiKeyId:String(apiKeyId||'').trim(),privateKey:String(privateKey||'')}));
  fs.writeFileSync(credentialsFile,blob.toString('base64'),{mode:0o600});
}
function loadCredentials(){
  try{
    if(!fs.existsSync(credentialsFile)||!safeStorage.isEncryptionAvailable()) return null;
    const raw=Buffer.from(fs.readFileSync(credentialsFile,'utf8'),'base64');
    return JSON.parse(safeStorage.decryptString(raw));
  }catch{return null}
}
function clearCredentials(){try{if(fs.existsSync(credentialsFile))fs.rmSync(credentialsFile,{force:true})}catch{}liveArmed=false;liveFirstOrderConfirmed=false}
function requireCreds(){const c=loadCredentials();if(!c?.apiKeyId||!c?.privateKey)throw new Error('Kalshi API credentials are not configured');return c}
function createWindow(){mainWindow=new BrowserWindow({width:1500,height:1050,minWidth:1150,minHeight:800,title:'BTC 15-Minute Controller — Strategy Engine',webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false}});mainWindow.setMenuBarVisibility(false);mainWindow.loadFile(path.join(__dirname,'index.html'));mainWindow.webContents.on('will-navigate',e=>e.preventDefault());mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}))}
app.whenReady().then(()=>{ensureDataDir();session.defaultSession.webRequest.onHeadersReceived((d,cb)=>cb({responseHeaders:{...d.responseHeaders,'Content-Security-Policy':["default-src 'self'; connect-src 'self' https://external-api.kalshi.com https://api.elections.kalshi.com https://api.coinbase.com https://api.kraken.com; img-src 'self' data:; style-src 'self'; script-src 'self'"]}}));
ipcMain.handle('kalshi:status',()=>({mode:liveArmed?'LIVE_ARMED':'LIVE_DISARMED',tradingEnabled:liveArmed,credentialStored:Boolean(loadCredentials()),secureStorage:safeStorage.isEncryptionAvailable(),firstOrderConfirmed:liveFirstOrderConfirmed}));
ipcMain.handle('kalshi:configure',(_e,{apiKeyId,privateKey})=>{if(!apiKeyId||!privateKey)throw new Error('API key ID and private key are required');saveCredentials(apiKeyId,privateKey);liveArmed=false;liveFirstOrderConfirmed=false;return {credentialStored:true,secureStorage:true}});
ipcMain.handle('kalshi:clearCredentials',()=>{clearCredentials();return {credentialStored:false}});
ipcMain.handle('kalshi:arm',()=>{requireCreds();liveArmed=true;return {armed:true}});
ipcMain.handle('kalshi:disarm',()=>{liveArmed=false;autoLive=false;return {armed:false}});
ipcMain.handle('kalshi:autoStatus',()=>({autoLive,liveArmed,credentialStored:Boolean(loadCredentials())}));
ipcMain.handle('kalshi:autoArm',()=>{requireCreds();if(!liveArmed)throw new Error('ARM LIVE first');autoLive=true;return {autoLive:true}});
ipcMain.handle('kalshi:autoDisarm',()=>{autoLive=false;return {autoLive:false}});
ipcMain.handle('kalshi:balance',async(_e,p={})=>{return await getBalance(requireCreds(),Number.isInteger(Number(p.exchangeIndex))?Number(p.exchangeIndex):undefined)});
ipcMain.handle('kalshi:fills',async(_e,p={})=>getFills(requireCreds(),p||{}));
ipcMain.handle('kalshi:settlements',async(_e,p={})=>getSettlements(requireCreds(),p||{}));
ipcMain.handle('kalshi:positions',async(_e,p)=>{const ticker=typeof p==='string'?p:p?.ticker;const exchangeIndex=typeof p==='object'&&p!==null&&Number.isInteger(Number(p.exchangeIndex))?Number(p.exchangeIndex):undefined;return await getPositions(requireCreds(),ticker,exchangeIndex)});
ipcMain.handle('kalshi:autoOrder',async(_e,p)=>{
  if(!liveArmed||!autoLive)throw new Error('AUTO LIVE is disarmed');
  const ticker=String(p?.ticker||''); const side=String(p?.side||''); const count=Number(p?.count); const priceCents=Number(p?.priceCents);
  if(!ticker||!['bid','ask'].includes(side)||!Number.isInteger(count)||count<1||!Number.isFinite(priceCents))throw new Error('Invalid auto order request');
  const clientOrderId='btc15-auto-'+crypto.randomUUID();
  return {...await placeOrder(requireCreds(),{ticker,side,count,priceCents,clientOrderId,reduceOnly:Boolean(p?.reduceOnly),exchangeIndex:Number.isInteger(Number(p?.exchangeIndex))?Number(p.exchangeIndex):-1}),clientOrderId};
});
ipcMain.handle('kalshi:order',async(_e,p)=>{
  if(!liveArmed)throw new Error('LIVE execution is disarmed');
  const ticker=String(p?.ticker||'');const outcome=String(p?.outcome||'');const count=Number(p?.count);const priceCents=Number(p?.priceCents);
  if(!ticker||!['UP','DOWN'].includes(outcome)||!Number.isInteger(count)||count<1||!Number.isFinite(priceCents))throw new Error('Invalid order request');
  const confirm=await dialog.showMessageBox(mainWindow,{type:'warning',buttons:['EXECUTE LIVE ORDER','CANCEL'],defaultId:1,cancelId:1,noLink:true,title:'CONFIRM LIVE KALSHI ORDER',message:`REAL MONEY ORDER\n\n${outcome} • ${count} contract(s) • max ${priceCents}¢ each\nTicker: ${ticker}\n\nThis will submit a live order to Kalshi.`,detail:'The controller will use an Immediate-or-Cancel order. Confirm only if the displayed contract, side, quantity and price are correct.'});
  if(confirm.response!==0)throw new Error('Live order canceled by user');
  const clientOrderId='btc15-v9.4-'+crypto.randomUUID();
  const result=await placeIOC(requireCreds(),{ticker,outcome,count,priceCents,clientOrderId});
  liveFirstOrderConfirmed=true;
  return {...result,clientOrderId};
});
ipcMain.handle('btc:spot',async()=>{const results=[];await Promise.allSettled([httpsJson('https://api.coinbase.com/v2/prices/BTC-USD/spot'),httpsJson('https://api.kraken.com/0/public/Ticker?pair=XBTUSD')]).then(xs=>{for(const x of xs){if(x.status!=='fulfilled')continue;const d=x.value;if(d?.data?.amount){const n=Number(d.data.amount);if(Number.isFinite(n))results.push({source:'Coinbase',price:n})}const r=d?.result;const key=r?Object.keys(r)[0]:null;const c=key?r[key]?.c?.[0]:null;const n2=Number(c);if(Number.isFinite(n2))results.push({source:'Kraken',price:n2})}});if(!results.length)throw new Error('No BTC spot source available');const prices=results.map(x=>x.price).sort((a,b)=>a-b);const median=prices.length%2?prices[(prices.length-1)/2]:(prices[prices.length/2-1]+prices[prices.length/2])/2;return {price:median,sources:results,updatedAt:Date.now()}});
ipcMain.handle('kalshi:markets',async(_e,p={})=>{const limit=Math.min(Number(p.limit)||100,1000);const u=new URL('https://external-api.kalshi.com/trade-api/v2/markets');u.searchParams.set('limit',String(limit));if(p.status)u.searchParams.set('status',String(p.status));if(p.seriesTicker)u.searchParams.set('series_ticker',String(p.seriesTicker));if(p.cursor)u.searchParams.set('cursor',String(p.cursor));return await httpsJson(u.toString())});
ipcMain.handle('kalshi:market',async(_e,t)=>{if(typeof t!=='string'||!t)throw new Error('Missing market ticker');return await httpsJson(`https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(t)}`)});
ipcMain.handle('kalshi:snapshot',async(_e,t)=>{if(typeof t!=='string'||!t)throw new Error('Missing market ticker');const s=encodeURIComponent(t);const [mr,br]=await Promise.all([httpsJson(`https://external-api.kalshi.com/trade-api/v2/markets/${s}`),httpsJson(`https://external-api.kalshi.com/trade-api/v2/markets/${s}/orderbook`)]);const m=mr.market||mr,b=br.orderbook_fp||br.orderbook||br;const pick=(...xs)=>{for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n}return null};
 const yesBid=pick(m.yes_bid,m.yes_bid_dollars),yesAsk=pick(m.yes_ask,m.yes_ask_dollars),noBid=pick(m.no_bid,m.no_bid_dollars),noAsk=pick(m.no_ask,m.no_ask_dollars),last=pick(m.last_price,m.last_price_dollars);
 return {ticker:m.ticker,eventTicker:m.event_ticker,seriesTicker:m.series_ticker,title:m.title,subtitle:m.subtitle,status:m.status,closeTime:m.close_time,openTime:m.open_time,expirationTime:m.expiration_time,result:m.result,exchangeIndex:Number.isInteger(Number(m.exchange_index))?Number(m.exchange_index):null,yesBid,yesAsk,noBid,noAsk,lastPrice:last,orderbook:{yes:Array.isArray(b?.yes_dollars)?b.yes_dollars:(Array.isArray(b?.yes)?b.yes:[]),no:Array.isArray(b?.no_dollars)?b.no_dollars:(Array.isArray(b?.no)?b.no:[])},strike:m.floor_strike??m.strike??null,raw:{...m}};
});
ipcMain.handle('kalshi:orderbook',async(_e,t)=>{if(typeof t!=='string'||!t)throw new Error('Missing market ticker');return await httpsJson(`https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(t)}/orderbook`)});
ipcMain.handle('records:read',()=>{ensureDataDir();if(!fs.existsSync(recordsFile))return [];try{const v=JSON.parse(fs.readFileSync(recordsFile,'utf8'));return Array.isArray(v)?v:[]}catch{return []}});
ipcMain.handle('records:write',(_e,r)=>{ensureDataDir();fs.writeFileSync(recordsFile,JSON.stringify(Array.isArray(r)?r:[]),{mode:0o600});return true});createWindow()});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});