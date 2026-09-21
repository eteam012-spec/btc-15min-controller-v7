const DEFAULTS={btc:76753,target:76448.22};
const BASE_WEIGHTS={strike:1.0,market:1.0,orderbook:0.85,marketMomentum:0.75,btcMomentum:0.75,reversal:0.8};
let minute=1,windowNumber=1,windowId='',windowStart='',rows=[],allRecords=[];
let liveTicker=null, liveMarket=null, lastLiveAt=0, lastBtcAt=0, polling=null, switching=false;
let lastFeature=null, paperPosition=null, pendingWindows=new Map();
let learning={version:1,completed:0,weights:{...BASE_WEIGHTS},windows:[],accuracy:0};
let autoLive=false,noTradeWindow=false,autoBusy=false,autoEntryDoneTicker=null,autoPosition=null,lastAutoActionAt=0,dailyLossCents=0,autoDay=day();
const $=id=>document.getElementById(id);
const money=n=>'$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=n=>Number.isFinite(n)?`${n.toFixed(1)}%`:'—';
const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const direction=n=>n>=0?'UP':'DOWN';

async function startApp(){
 allRecords=await window.controllerAPI.readRecords();
 // Window numbers are a daily session counter, not a permanent counter.
 // Never carry yesterday's window number into a new trading day.
 const todayRecords=allRecords.filter(r=>r.date===day()&&Number.isFinite(Number(r.windowNumber)));
 const savedWindowNumbers=todayRecords.map(r=>Number(r.windowNumber));
 if(savedWindowNumbers.length)windowNumber=Math.max(1,...savedWindowNumbers);
 loadLearning();renderLearning();
 $('feed').textContent='LIVE ADAPTER: CONNECTING…';
 refreshBtc();
 refreshKalshi(true).finally(()=>{polling= polling || setInterval(()=>refreshKalshi(false),3000);});
}
function loadLearning(){
 const m=allRecords.slice().reverse().find(r=>r.type==='LEARNING_MODEL');
 if(m&&m.weights){learning={version:Number(m.version)||1,completed:Number(m.completed)||0,weights:{...BASE_WEIGHTS,...m.weights},windows:Array.isArray(m.windows)?m.windows:[],accuracy:Number(m.accuracy)||0};}
}
function modelRecord(){return {type:'LEARNING_MODEL',version:learning.version,completed:learning.completed,weights:learning.weights,accuracy:learning.accuracy,updatedAt:new Date().toISOString(),windows:learning.windows.slice(-250)}}
function startWindow(market){minute=1;windowId='W-'+Date.now();windowStart=new Date().toISOString();rows=[];paperPosition=null;autoPosition=null;autoEntryDoneTicker=null;noTradeWindow=false;liveMarket=market||liveMarket;$('btc').value='';$('target').value=extractTarget(liveMarket) ?? DEFAULTS.target;render();calc()}
function extractTarget(m){if(!m)return null;for(const x of [m.strike,m.raw?.floor_strike,m.raw?.strike,m.raw?.floor_strike_dollars]){const n=Number(x);if(Number.isFinite(n)&&n>1000)return n}return null}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function pctPrice(v){const n=num(v);return n===null?null:(n<=1?n*100:n)}
function marketPrice(m){if(!m)return null;for(const v of [m.lastPrice,m.raw?.last_price_dollars,m.raw?.last_price]){const n=num(v);if(n!==null)return n<=1?n*100:n}const bid=pctPrice(m.yesBid),ask=pctPrice(m.yesAsk);return bid!==null&&ask!==null?(bid+ask)/2:null}
function parseLevel(x){if(Array.isArray(x)){const p=num(x[0]),s=num(x[1]);return p!==null&&s!==null?{price:p<=1?p*100:p,size:s}:null}if(x&&typeof x==='object'){const p=num(x.price??x.price_dollars??x.yes_price??x.no_price),s=num(x.quantity??x.size??x.count);return p!==null&&s!==null?{price:p<=1?p*100:p,size:s}:null}return null}
function bookStats(m){const yes=(m?.orderbook?.yes||[]).map(parseLevel).filter(Boolean),no=(m?.orderbook?.no||[]).map(parseLevel).filter(Boolean);const depth=a=>a.reduce((s,x)=>s+x.size,0);const yesDepth=depth(yes),noDepth=depth(no);const yb=pctPrice(m?.yesBid),ya=pctPrice(m?.yesAsk),nb=pctPrice(m?.noBid),na=pctPrice(m?.noAsk);return {yesDepth,noDepth,imbalance:(yesDepth+noDepth)>0?(yesDepth-noDepth)/(yesDepth+noDepth):null,spread:yb!==null&&ya!==null?Math.max(0,ya-yb):null,yesBid:yb,yesAsk:ya,noBid:nb,noAsk:na}}
function componentSignals({above,up,down,imbalance,marketVelocity,btcVelocity,distancePct,secondsToClose}){
 const nearStrike=distancePct!==null&&Math.abs(distancePct)<0.10;
 const strike=above===null?0:(above?1:-1);
 const market=(up-down)/100;
 const book=imbalance??0;
 const mm=clamp((marketVelocity??0)/5,-1,1);
 const bm=clamp((btcVelocity??0)/5,-1,1);
 let reversal=0;
 if(secondsToClose!==null&&secondsToClose<180){reversal += (marketVelocity??0)<-0.75?-0.8:(marketVelocity??0)>0.75?0.8:0;reversal += nearStrike?0.15:0;}
 if(nearStrike) return {strike,market,orderbook:book,marketMomentum:mm,btcMomentum:bm,reversal};
 return {strike,market,orderbook:book,marketMomentum:mm,btcMomentum:bm,reversal};
}
function learnedWeights(){const n=learning.completed; if(n<10)return {...BASE_WEIGHTS}; return Object.fromEntries(Object.entries(learning.weights).map(([k,v])=>[k,clamp(v,0.4,1.8)]))}
function calc(){
 const btc=num($('btc').value)||0,target=num($('target').value)||0,up=num($('up').value)||0,down=num($('down').value)||0;
 const above=target>0?btc>=target:null,marketUp=up>=down,bs=bookStats(liveMarket);
 const close=new Date(liveMarket?.closeTime||liveMarket?.expirationTime||0).getTime(),secondsToClose=close?Math.max(0,(close-Date.now())/1000):null,distancePct=target?((btc-target)/target)*100:null;
 const prev=lastFeature;const dt=prev?Math.max(.1,(Date.now()-prev.ts)/1000):null;
 const marketVelocity=prev&&Number.isFinite(up)?(up-prev.marketUpPct)/dt*60:null,btcVelocity=prev&&prev.btc!=null?(btc-prev.btc)/dt*60:null;
 const c=componentSignals({above,up,down,imbalance:bs.imbalance,marketVelocity,btcVelocity,distancePct,secondsToClose});const w=learnedWeights();
 let score=0,reasons=[];for(const [k,v] of Object.entries(c))score += v*(w[k]||1)*100/6;
 if(above!==null)reasons.push(above?'BTC above strike':'BTC below strike');if(Math.abs(up-down)>8)reasons.push(up>down?'market strongly UP':'market strongly DOWN');if(Math.abs(bs.imbalance??0)>=.20)reasons.push(bs.imbalance>0?'orderbook favors UP':'orderbook favors DOWN');if(Math.abs(marketVelocity??0)>1)reasons.push(marketVelocity>0?'UP price momentum':'DOWN price momentum');if(Math.abs(btcVelocity??0)>1)reasons.push(btcVelocity>0?'BTC short-term momentum UP':'BTC short-term momentum DOWN');if(distancePct!==null&&Math.abs(distancePct)<.10)reasons.push('BTC very close to strike');
 const disagreement=above!==null&&(direction(above?1:-1)!==direction(up-down));if(disagreement){score*=.55;reasons.push('price/market disagreement')}if(secondsToClose!==null&&secondsToClose<120){score*=.65;reasons.push('late-window caution')}
 const dataFresh=lastLiveAt>0&&Date.now()-lastLiveAt<10000&&lastBtcAt>0&&Date.now()-lastBtcAt<10000;let pick=score>=0?'UP':'DOWN',confidence=clamp(50+Math.abs(score)*1.25,0,99),risk='MODERATE',action='WATCH';
 if(!liveTicker||!liveMarket||!dataFresh){risk='CRITICAL';action='WAIT';confidence=0;reasons=['live market data missing or stale']}else if(confidence<62){risk='HIGH';action='WAIT'}else if(disagreement||(bs.spread!==null&&bs.spread>8)){risk='HIGH';action='WATCH'}else if(secondsToClose!==null&&secondsToClose<60){risk='HIGH';action='WATCH'}else{risk='LOW';action='PAPER READY'}
 const feature={ts:Date.now(),btc,target,marketUpPct:up,downPct:down,pick,score,confidence,risk,action,distancePct,secondsToClose,marketVelocity,btcVelocity,...bs,components:c,weights:w,marketTicker:liveTicker};lastFeature=feature;
 $('window').textContent=`${windowNumber} / 15`;$('btcView').textContent=money(btc);$('targetView').textContent=money(target);$('pick').textContent=pick;$('confidence').textContent=pct(confidence);$('risk').textContent=risk;$('action').textContent=action;$('score').textContent=score.toFixed(1);$('spread').textContent=bs.spread===null?'—':bs.spread.toFixed(1)+'¢';$('imbalance').textContent=bs.imbalance===null?'—':bs.imbalance.toFixed(2);$('countdown').textContent=secondsToClose===null?'—':`${Math.floor(secondsToClose/60)}:${String(Math.floor(secondsToClose%60)).padStart(2,'0')}`;$('alert').textContent=action==='WAIT'?'WAIT — engine does not have enough clean data to act.':reasons.join(' • ');$('reason').textContent=`Adaptive score ${score.toFixed(1)} using learned weights after ${learning.completed} completed windows.`;return feature;
}
async function record(){const r=calc();const row={id:`${windowId}:${Date.now()}`,type:'OBSERVATION',date:day(),timestamp:new Date().toISOString(),windowNumber,windowId,windowStart,minute,...r,result:'PENDING'};rows.push(row);render();await persist()}
function upsertRecords(base,add){const map=new Map();for(const r of base||[]){if(r.id)map.set(r.id,r)}for(const r of add||[]){if(r.id)map.set(r.id,r)}return [...map.values()]}
async function persist(){allRecords=upsertRecords(allRecords,rows);await window.controllerAPI.writeRecords(upsertRecords(allRecords,[modelRecord()]));render()}
function summarizeWindow(rs,settlement){const obs=rs.filter(r=>r.type==='OBSERVATION'&&r.components);if(!obs.length)return null;const last=obs[obs.length-1],avg=k=>obs.reduce((s,r)=>s+(Number(r[k])||0),0)/obs.length;const comps={};for(const k of Object.keys(BASE_WEIGHTS))comps[k]=avgComp(obs,k);const pick=last.pick;const correct=pick===settlement;return {windowNumber:last.windowNumber||windowNumber,windowId:last.windowId,windowStart:last.windowStart,ticker:last.marketTicker,settlement,pick,correct,score:last.score,confidence:last.confidence,components:comps,observations:obs.length,completedAt:new Date().toISOString()}}
function avgComp(obs,k){return obs.reduce((s,r)=>s+(Number(r.components?.[k])||0),0)/obs.length}
async function learnFromWindow(summary){if(!summary)return;learning.completed++;learning.windows=learning.windows.filter(w=>w.windowId!==summary.windowId);learning.windows.push(summary);const completed=learning.windows.length;learning.accuracy=100*learning.windows.filter(w=>w.correct).length/Math.max(1,completed);
 if(completed>=10){for(const k of Object.keys(BASE_WEIGHTS)){const usable=learning.windows.slice(-50);const signals=usable.filter(w=>Math.abs(w.components?.[k]||0)>=0.05);if(signals.length<5)continue;let hits=0;for(const w of signals){const pred=(w.components[k]>=0?'UP':'DOWN');if(pred===w.settlement)hits++;}const acc=hits/signals.length;const edge=(acc-.5)*2;const target=clamp(1+edge,0.4,1.8);learning.weights[k]=clamp(learning.weights[k]*0.8+target*0.2,0.4,1.8)}}
 learning.version++;await window.controllerAPI.writeRecords(upsertRecords(allRecords,[modelRecord()]));renderLearning();
}
async function finalizePending(ticker,snapshot){const entry=pendingWindows.get(ticker);if(!entry)return false;const result=String(snapshot?.result||'').toLowerCase();if(result!=='yes'&&result!=='no')return false;const settlement=result==='yes'?'UP':'DOWN';const summary=summarizeWindow(entry.rows,settlement);entry.rows.forEach(r=>{r.settlement=settlement;r.result=r.pick===settlement?'CORRECT':'INCORRECT';r.officialSettlement=true});allRecords=upsertRecords(allRecords,entry.rows);pendingWindows.delete(ticker);if(summary)await learnFromWindow(summary);await persist();return true}
async function finalizeWindowIfOfficial(){if(!liveMarket||!rows.length)return false;const ticker=liveTicker;pendingWindows.set(ticker,{windowId,windowStart,rows:[...rows]});rows=[];return await finalizePending(ticker,liveMarket)}
async function paperExecute(){const f=calc();if(f.action!=='PAPER READY'){$('orderStatus').textContent='PAPER ORDER BLOCKED — '+f.action;return}if(paperPosition&&paperPosition.ticker===liveTicker){$('orderStatus').textContent='PAPER POSITION ALREADY OPEN';return}paperPosition={ticker:liveTicker,side:f.pick,entryPct:f.pick==='UP'?f.marketUpPct:100-f.marketUpPct,ts:new Date().toISOString(),windowId,minute};$('orderStatus').textContent=`PAPER ORDER FILLED: ${f.pick} @ ${paperPosition.entryPct.toFixed(1)}¢`;rows.push({id:`${windowId}:ORDER:${Date.now()}`,date:day(),timestamp:new Date().toISOString(),windowId,windowStart,minute,marketTicker:liveTicker,type:'PAPER_ORDER',side:f.pick,entryPriceCents:paperPosition.entryPct,confidence:f.confidence,score:f.score,result:'PENDING'});await persist()}
async function rollover(){if(switching)return;switching=true;try{if(rows.length===0)await record();if(liveMarket&&!['yes','no'].includes(String(liveMarket.result||'').toLowerCase())){$('contractState').textContent='EXPIRED / AWAITING OFFICIAL RESULT';return}if(liveMarket)await finalizeWindowIfOfficial();await persist();await refreshKalshi(true)}finally{switching=false}}
function renderLearning(){const w=learning.windows;const weights=learnedWeights();$('learnWindows').textContent=learning.completed;$('learnAccuracy').textContent=w.length?pct(learning.accuracy):'—';$('learnMode').textContent=learning.completed<10?'BASELINE / COLLECTING':`ADAPTIVE / ${learning.completed} WINDOWS`;$('modelVersion').textContent=String(learning.version);$('learnSummary').textContent=learning.completed<10?`Collecting completed windows before adaptive weighting. ${Math.max(0,10-learning.completed)} more window${10-learning.completed===1?'':'s'} needed.`:`Learning active. Weights adapt from recent completed-window component accuracy; no single window can dominate the model.`;$('weights').textContent='Weights: '+Object.entries(weights).map(([k,v])=>`${k} ${v.toFixed(2)}`).join(' • ')}
function render(){const stored=allRecords.filter(r=>r.type!=='LEARNING_MODEL').length+rows.length;$('daily').textContent=`Today: ${allRecords.filter(r=>r.date===day()&&r.type!=='LEARNING_MODEL').length+rows.filter(r=>r.date===day()).length} records • Total stored: ${stored}`;$('history').innerHTML=rows.slice().reverse().map(r=>`<div class="row">${r.type==='PAPER_ORDER'?'ORDER':'M'+r.minute} • ${r.side||r.pick||'—'} • ${r.risk||'—'} • ${r.action||'—'} • ${r.result||'PENDING'}</div>`).join('');renderLearning()}
function exportCSV(){const data=allRecords.filter(r=>r.type!=='LEARNING_MODEL').concat(rows);const headers=['date','timestamp','windowId','windowStart','minute','btc','target','marketUpPct','downPct','pick','score','confidence','risk','action','distancePct','secondsToClose','marketVelocity','btcVelocity','yesDepth','noDepth','imbalance','spread','marketTicker','settlement','result','officialSettlement','type','side','entryPriceCents'];const csv=[headers.join(','),...data.map(r=>headers.map(h=>`"${String(r[h]??'').replaceAll('"','""')}"`).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`BTC_15M_${day()}.csv`;a.click()}
function isOpen(m){const s=String(m?.status||'').toLowerCase();return s==='open'||s==='active'}
function candidate(markets){const arr=(markets||[]).filter(m=>{const t=((m.title||'')+' '+(m.subtitle||'')+' '+(m.ticker||'')+' '+(m.event_ticker||'')).toLowerCase();return(t.includes('bitcoin')||t.includes('btc'))&&/15\s*min|15-minute|15minute/.test(t)&&isOpen(m)});arr.sort((a,b)=>new Date(a.close_time||a.expiration_time||0)-new Date(b.close_time||b.expiration_time||0));return arr.find(m=>new Date(m.close_time||m.expiration_time||0)>new Date())||null}
async function refreshBtc(){try{const r=await window.controllerAPI.btcSpot();if(Number.isFinite(Number(r.price))){$('btc').value=Number(r.price).toFixed(2);lastBtcAt=Date.now();$('btcSource').textContent='LIVE BTC: '+(r.sources||[]).map(x=>x.source).join(' + ')+' median • SPOT PROXY';calc()}}catch(e){$('btcSource').textContent='LIVE BTC: UNAVAILABLE — WAITING FOR FRESH DATA';calc()}}
function contractStartMs(m){const close=new Date(m?.closeTime||m?.expirationTime||0).getTime();return Number.isFinite(close)&&close>0?close-15*60*1000:null}
function syncWindowNumberForContract(m){
 const currentStart=contractStartMs(m);if(currentStart===null)return;
 const todayRows=allRecords.filter(r=>r.date===day()&&r.type!=='LEARNING_MODEL'&&r.windowStart);
 if(!todayRows.length){windowNumber=1;return}
 const latest=todayRows.reduce((a,b)=>new Date(a.windowStart).getTime()>new Date(b.windowStart).getTime()?a:b);
 const lastStart=new Date(latest.windowStart).getTime();
 if(!Number.isFinite(lastStart))return;
 const buckets=Math.max(0,Math.floor((currentStart-lastStart)/(15*60*1000)));
 windowNumber=clamp((Number(latest.windowNumber)||1)+buckets,1,15);
}
async function refreshKalshi(force=false){try{let previousExpired=false;if(liveTicker&&liveMarket){const old=await window.controllerAPI.kalshiSnapshot(liveTicker);const oldClose=new Date(old.closeTime||old.expirationTime||0).getTime();if(oldClose&&Date.now()>=oldClose){previousExpired=true;pendingWindows.set(liveTicker,pendingWindows.get(liveTicker)||{windowId,windowStart,rows:[...rows]});rows=[];await finalizePending(liveTicker,old)}}const resp=await window.controllerAPI.kalshiMarkets({limit:1000,status:'open',seriesTicker:'KXBTC15M'}),m=candidate(resp.markets||[]);if(!m){$('feed').textContent='LIVE ADAPTER: NO OPEN BTC 15-MINUTE CONTRACT FOUND — NOT GUESSING';$('contractState').textContent='NO ACTIVE CONTRACT';liveTicker=null;liveMarket=null;calc();return}const snap=await window.controllerAPI.kalshiSnapshot(m.ticker),hadTicker=Boolean(liveTicker),changed=liveTicker!==snap.ticker;if(changed){
 if(hadTicker){
   // A new ticker is the authoritative rollover event. Do not depend on the
   // previous contract status check succeeding; polling can miss the exact close.
   windowNumber=Math.min(15,windowNumber+1);
 }else{
   // On startup/reload, recover the correct daily position from persisted records.
   syncWindowNumberForContract(snap);
 }
 liveTicker=snap.ticker;liveMarket=snap;startWindow(snap)
}else{liveTicker=snap.ticker;liveMarket=snap}const p=marketPrice(snap);if(p!==null)$('up').value=p.toFixed(1);const strike=extractTarget(snap);if(strike!==null)$('target').value=strike;lastLiveAt=Date.now();$('ticker').textContent=liveTicker;$('feed').textContent='LIVE ADAPTER: CONNECTED • PUBLIC KALSHI MARKET DATA';$('contractState').textContent=String(snap.status||'UNKNOWN').toUpperCase();$('officialResult').textContent=snap.result||'PENDING';const close=new Date(snap.closeTime||snap.expirationTime||0);$('closeAt').textContent=isNaN(close.getTime())?'—':close.toLocaleTimeString();calc();render()}catch(e){$('feed').textContent='LIVE ADAPTER: STALE / UNAVAILABLE — NOT GUESSING';$('contractState').textContent='STALE';calc();render()}}
setInterval(()=>{if(lastLiveAt)$('age').textContent=Math.floor((Date.now()-lastLiveAt)/1000)+'s';calc()},1000);
setInterval(()=>refreshBtc(),3000);
$('update').onclick=record;$('next').onclick=async()=>{if(minute<15){await record();minute++;calc();render()}else await rollover()};$('newWindow').onclick=()=>refreshKalshi(true);$('paperOrder').onclick=paperExecute;$('export').onclick=exportCSV;
async function liveSetup(){
  try{
    const s=await window.controllerAPI.kalshiStatus();
    $('liveStatus').textContent=s.credentialStored
      ? ('LIVE EXECUTION: '+(s.tradingEnabled?'ARMED':'DISARMED')+' • credentials stored in OS secure storage')
      : 'LIVE EXECUTION: DISARMED • configure credentials first';
  }catch(e){$('liveStatus').textContent='LIVE EXECUTION: '+e.message}
}
async function saveLiveCredentials(){
  try{
    const key=$('apiKeyId').value.trim(), pem=$('privateKey').value;
    if(!key||!pem)throw new Error('Enter the API key ID and private key');
    await window.controllerAPI.kalshiConfigure(key,pem);
    $('privateKey').value='';
    $('liveStatus').textContent='CREDENTIALS SAVED • OS secure storage • LIVE STILL DISARMED';
    await liveSetup();
  }catch(e){$('liveStatus').textContent='CREDENTIAL ERROR: '+e.message}
}
async function armLive(){
  try{const r=await window.controllerAPI.kalshiArm();$('liveStatus').textContent=r.armed?'LIVE EXECUTION: ARMED':'LIVE EXECUTION: DISARMED'}catch(e){$('liveStatus').textContent='ARM ERROR: '+e.message}
}
async function disarmLive(){try{await window.controllerAPI.kalshiDisarm();$('liveStatus').textContent='LIVE EXECUTION: DISARMED'}catch(e){$('liveStatus').textContent='DISARM ERROR: '+e.message}}
async function liveBalance(){try{const r=await window.controllerAPI.kalshiBalance(Number.isInteger(liveMarket?.exchangeIndex)?liveMarket.exchangeIndex:undefined);const cents=Number(r.balance);$('liveStatus').textContent=Number.isFinite(cents)?`LIVE BALANCE: ${(cents/100).toFixed(2)}`:'BALANCE RESPONSE RECEIVED';return cents}catch(e){$('liveStatus').textContent='BALANCE ERROR: '+e.message;return null}}
function liveQuoteCents(outcome){
  const yes=(liveMarket?.orderbook?.yes||[]).map(parseLevel).filter(Boolean);
  const no=(liveMarket?.orderbook?.no||[]).map(parseLevel).filter(Boolean);
  const bestYesBid=yes.length?Math.max(...yes.map(x=>x.price)):null;
  const bestNoBid=no.length?Math.max(...no.map(x=>x.price)):null;
  if(outcome==='UP' && bestNoBid!==null)return clamp(Math.ceil(100-bestNoBid),1,99);
  if(outcome==='DOWN' && bestYesBid!==null)return clamp(Math.ceil(100-bestYesBid),1,99);
  return null;
}
async function liveExecute(){
  try{
    const f=calc();
    if(f.action!=='PAPER READY')throw new Error('Engine is not ready: '+f.action);
    if(!liveTicker||!liveMarket)throw new Error('No active Kalshi contract');
    const maxSpend=Math.max(0.01,Number($('liveMaxSpend').value)||2);
    const priceCents=liveQuoteCents(f.pick);
    if(priceCents===null)throw new Error('No executable live quote available');
    const count=Math.floor((maxSpend*100)/priceCents);
    if(count<1)throw new Error(`Max spend ${maxSpend.toFixed(2)} is below one contract at ${priceCents}¢`);
    $('liveStatus').textContent=`LIVE ORDER PREVIEW: ${f.pick} • ${count} contract(s) • ${priceCents}¢ max • ${(count*priceCents/100).toFixed(2)} max cost • ${liveTicker}`;
    const r=await window.controllerAPI.kalshiOrder({ticker:liveTicker,outcome:f.pick,count,priceCents});
    const filled=Number(r.fill_count??r.filled_count??r.fill_count_fp??0);
    $('liveStatus').textContent='LIVE ORDER SUBMITTED • '+f.pick+' • '+count+' contracts • '+priceCents+'¢ • order '+(r.order_id||'accepted')+' • filled '+filled;
    rows.push({id:windowId+':LIVE:'+Date.now(),date:day(),timestamp:new Date().toISOString(),windowId,windowStart,minute,marketTicker:liveTicker,type:'LIVE_ORDER',side:f.pick,entryPriceCents:priceCents,count,orderId:r.order_id||'',clientOrderId:r.clientOrderId||'',fillCount:filled,result:'PENDING'});
    await persist();
  }catch(e){$('liveStatus').textContent='LIVE ORDER BLOCKED/FAILED: '+e.message}
}
$('saveCreds').onclick=saveLiveCredentials;
$('armLive').onclick=armLive;
$('disarmLive').onclick=disarmLive;
$('liveBalance').onclick=liveBalance;
$('liveExecute').onclick=liveExecute;

startApp();

function autoResetDay(){if(autoDay!==day()){autoDay=day();dailyLossCents=0;}}
function autoSettings(){return {riskPct:clamp(Number($('liveRiskPct').value)||2,0.5,10),maxSpend:Math.max(0.01,Number($('liveMaxSpend').value)||1),maxExposure:Math.max(0.01,Number($('liveMaxExposure').value)||2),dailyLoss:Math.max(0.01,Number($('liveDailyLoss').value)||2)}}
function autoPositionFromResponse(p){const list=p?.market_positions||p?.positions||p?.market_positions?.positions||[];const a=Array.isArray(list)?list:[p];const x=a.find(v=>String(v.ticker||v.market_ticker||'')===liveTicker)||a[0];if(!x)return null;const pos=Number(x.position??x.yes_position??x.position_fp??0);return Number.isFinite(pos)&&pos!==0?{ticker:liveTicker,yesPosition:pos}:null}
async function autoReconcile(){if(!autoLive||!liveTicker)return;try{const p=await window.controllerAPI.kalshiPositions(liveTicker, Number.isInteger(liveMarket?.exchangeIndex)?liveMarket.exchangeIndex:undefined);autoPosition=autoPositionFromResponse(p);$('autoStatus').textContent=`AUTO LIVE: ${autoLive?'ON':'OFF'} • NO-TRADE: ${noTradeWindow?'ON':'OFF'} • POSITION: ${autoPosition?(autoPosition.yesPosition>0?'YES/UP':'NO/DOWN'):'FLAT'}`;}catch(e){$('autoStatus').textContent='AUTO LIVE: '+e.message}}
function autoEntryPrice(outcome){const bs=bookStats(liveMarket);if(outcome==='UP'&&bs.noBid!==null)return clamp(Math.ceil(100-bs.noBid),1,99);if(outcome==='DOWN'&&bs.yesBid!==null)return clamp(Math.ceil(100-bs.yesBid),1,99);return null}
async function autoOrder(outcome,priceCents,count,reduceOnly=false){const side=outcome==='UP'?'bid':'ask';const r=await window.controllerAPI.kalshiAutoOrder({ticker:liveTicker,side,count,priceCents,reduceOnly,exchangeIndex:Number.isInteger(liveMarket?.exchangeIndex)?liveMarket.exchangeIndex:-1});const filled=Number(r.fill_count??0);rows.push({id:`${windowId}:AUTO:${Date.now()}`,date:day(),timestamp:new Date().toISOString(),windowId,windowStart,minute,marketTicker:liveTicker,type:reduceOnly?'AUTO_EXIT':'AUTO_ENTRY',side:outcome,priceCents,count,fillCount:filled,orderId:r.order_id||'',result:filled>0?'FILLED':'UNFILLED'});await persist();return {...r,filled}}
async function autoTradeTick(){autoResetDay();if(!autoLive||autoBusy||!liveTicker||!liveMarket)return;autoBusy=true;try{const f=calc();const s=autoSettings();if(Date.now()-lastLiveAt>7000||Date.now()-lastBtcAt>7000){$('autoStatus').textContent='AUTO LIVE: PAUSED • STALE DATA';return}if(dailyLossCents>=s.dailyLoss*100){$('autoStatus').textContent='AUTO LIVE: HALTED • DAILY LOSS LIMIT';return}await autoReconcile();
 const secs=f.secondsToClose;
 // Exits have priority. A meaningful reversal/high-risk signal flattens an existing position.
 if(autoPosition && (f.risk==='HIGH'||f.risk==='CRITICAL'||(autoPosition.yesPosition>0&&f.pick==='DOWN')||(autoPosition.yesPosition<0&&f.pick==='UP')||(secs!==null&&secs<20))){
   const exitOutcome=autoPosition.yesPosition>0?'DOWN':'UP';const p=autoEntryPrice(exitOutcome);const qty=Math.max(1,Math.floor(Math.abs(autoPosition.yesPosition)));if(p!==null&&Date.now()-lastAutoActionAt>3000){await autoOrder(exitOutcome,p,qty,true);lastAutoActionAt=Date.now();await autoReconcile()}return;
 }
 // No-trade blocks new entries, but does not block protective exits.
 if(noTradeWindow||autoEntryDoneTicker===liveTicker)return;
 if(f.action!=='PAPER READY'||(secs!==null&&secs<90)||f.confidence<65)return;
 const balance=await liveBalance();if(!Number.isFinite(balance))return;
 const budgetCents=Math.floor(Math.min(s.maxSpend*100,(balance*s.riskPct/100),s.maxExposure*100));const p=autoEntryPrice(f.pick);if(p===null||budgetCents<p)return;
 const count=Math.max(1,Math.floor(budgetCents/p));const result=await autoOrder(f.pick,p,count,false);if(result.filled>0){autoEntryDoneTicker=liveTicker;await autoReconcile()}lastAutoActionAt=Date.now();
 }catch(e){$('autoStatus').textContent='AUTO LIVE ERROR • DISARMED: '+e.message;autoLive=false;try{await window.controllerAPI.kalshiAutoDisarm()}catch{}}finally{autoBusy=false}}
async function armAuto(){try{await window.controllerAPI.kalshiAutoArm();autoLive=true;noTradeWindow=false;$('autoStatus').textContent='AUTO LIVE: ON • watching for eligible entries';}catch(e){$('autoStatus').textContent='AUTO ARM ERROR: '+e.message}}
async function disarmAuto(){autoLive=false;try{await window.controllerAPI.kalshiAutoDisarm()}catch{}$('autoStatus').textContent='AUTO LIVE: OFF • NO-TRADE: '+(noTradeWindow?'ON':'OFF')}
function toggleNoTrade(){noTradeWindow=!noTradeWindow;$('autoStatus').textContent=`AUTO LIVE: ${autoLive?'ON':'OFF'} • NO-TRADE: ${noTradeWindow?'ON':'OFF'} • POSITION: ${autoPosition?'OPEN':'FLAT'}`;$('noTrade').textContent=noTradeWindow?'ALLOW TRADING THIS WINDOW':'NO-TRADE THIS WINDOW'}
$('autoArm').onclick=armAuto;$('autoDisarm').onclick=disarmAuto;$('noTrade').onclick=toggleNoTrade;
setInterval(autoTradeTick,1500);
setInterval(autoReconcile,5000);
