window.addEventListener('error',e=>{const el=document.getElementById('feed');if(el)el.textContent='BOOT ERROR: '+(e?.error?.message||e?.message||'renderer error')});
window.addEventListener('unhandledrejection',e=>{const el=document.getElementById('feed');if(el)el.textContent='BOOT ERROR: '+(e?.reason?.message||String(e?.reason||'promise error'))});
const DEFAULTS={btc:76753,target:76448.22};
const BASE_WEIGHTS={strike:1.0,market:1.0,orderbook:0.85,marketMomentum:0.75,btcMomentum:0.75,reversal:0.8};
let minute=1,windowNumber=1,windowId='',windowStart='',rows=[],allRecords=[];
let liveTicker=null, liveMarket=null, lastLiveAt=0, lastBtcAt=0, polling=null, switching=false;
let lastFeature=null, paperPosition=null, pendingWindows=new Map(), lastAutoObservationKey='';
let flipState=null, flipCount=0, flipUpToDown=0, flipDownToUp=0;
let learning={version:1,completed:0,weights:{...BASE_WEIGHTS},windows:[],accuracy:0};
const $=id=>document.getElementById(id);
const money=n=>'$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=n=>Number.isFinite(n)?`${n.toFixed(1)}%`:'—';
const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
let autoLive=false,noTradeWindow=false,autoBusy=false,autoEntryDoneTicker=null,autoPosition=null,lastAutoActionAt=0,dailyLossCents=0,autoDay=day();
let autoContinuous=true,autoRolloverPending=false;
let liveTrade={ticker:null,position:0,side:null,count:0,entryCents:null,markCents:null,pnlCents:null,balanceCents:null,fee:null,orderId:null,result:'PENDING',startedAt:null,points:[]};
let liveTradeBusy=false;
let liveSettlementQueue=new Map();
let lastLiveSettlement=null;
let assistantMessages=[],assistantLastKey="",assistantLastAt=0,assistantLastState="monitor",assistantInitialized=false;
function assistantPosition(){
  const p=Math.abs(Number(liveTrade?.position)||0);
  if(p>0)return {side:liveTrade.side||(liveTrade.position>0?"UP":"DOWN"),count:p,entry:Number(liveTrade.entryCents),mark:Number(liveTrade.markCents),pnl:Number(liveTrade.pnlCents)};
  if(autoPosition&&Number(autoPosition.yesPosition)!==0)return {side:autoPosition.yesPosition>0?"UP":"DOWN",count:Math.abs(Number(autoPosition.yesPosition)),entry:Number(liveTrade.entryCents),mark:Number(liveTrade.markCents),pnl:Number(liveTrade.pnlCents)};
  return null;
}
function assistantFormatTime(sec){if(!Number.isFinite(sec))return "time unavailable";if(sec<60)return Math.max(0,Math.floor(sec))+"s";return Math.floor(sec/60)+"m "+String(Math.floor(sec%60)).padStart(2,"0")+"s"}
function assistantAdd(message,type="monitor",key="",force=false){
  const now=Date.now();if(!force&&key&&key===assistantLastKey)return;if(!force&&now-assistantLastAt<3500)return;
  assistantLastKey=key||assistantLastKey;assistantLastAt=now;assistantMessages.unshift({message,type,ts:new Date().toISOString()});assistantMessages=assistantMessages.slice(0,10);
  const feed=$("assistantFeed");if(!feed)return;
  feed.innerHTML=assistantMessages.map((m,i)=>`<div class="assistant-msg ${m.type} ${i===0?"latest":""}"><span class="assistant-msg-time">${new Date(m.ts).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span><span class="assistant-msg-text">${m.message}</span></div>`).join("");
}
function assistantStateFor(f){
  const p=assistantPosition(),secs=f?.secondsToClose,kd=kalshiDirection(liveMarket),gate=kalshiOnlyLiveGate(f||{});
  if(!f)return {state:"monitor",headline:"SYSTEM ONLINE • MONITORING ENGINE",context:"Waiting for strategy data.",message:"Standing by for the first complete market snapshot.",type:"monitor",key:"boot"};
  if(p){
    const mark=Number.isFinite(p.mark)?p.mark:null,entry=Number.isFinite(p.entry)?p.entry:null,lossPct=entry>0&&mark!==null?Math.max(0,((entry-mark)/entry)*100):0,adverse=(p.side==="UP"&&f.pick==="DOWN")||(p.side==="DOWN"&&f.pick==="UP");
    if(lossPct>=80)return {state:"danger",headline:"SELL NOW • 80% LOSS GUARD",context:`${p.side} position • executable mark ${mark?.toFixed(1)||"—"}¢ • loss ${lossPct.toFixed(0)}% of entry`,message:"SELL NOW — the 80% loss guard has been reached. A reduce-only exit should be attempted immediately. This is a protection trigger, not a guaranteed fill.",type:"danger",key:`loss80:${liveTicker}`};
    if(secs!==null&&secs<20)return {state:"danger",headline:"SELL NOW • WINDOW CLOSING",context:`${p.side} position • ${assistantFormatTime(secs)} remaining`,message:"SELL NOW — less than 20 seconds remain. The controller prioritizes flattening the open position before contract close.",type:"danger",key:`close:${liveTicker}`};
    if(kd&&kd!==p.side)return {state:"flip",headline:"SELL NOW • KALSHI FLIP",context:`Position ${p.side} • Kalshi direction ${kd}`,message:`SELL NOW — Kalshi market direction has flipped against the open ${p.side} position. Reduce-only exit logic is active.`,type:"flip",key:`flip:${liveTicker}:${kd}`};
    if(adverse||f.risk==="CRITICAL"||f.risk==="HIGH")return {state:"warning",headline:"CONSIDER SELLING • RISK RISING",context:`${p.side} position • risk ${f.risk} • engine pick ${f.pick}`,message:`CONSIDER SELLING — the engine is detecting adverse conditions for the open ${p.side} position. Watch Kalshi direction, momentum, and executable exit price closely.`,type:"warning",key:`risk:${liveTicker}:${f.risk}:${f.pick}`};
    if(Number.isFinite(p.pnl)&&p.pnl>0)return {state:"profit",headline:"POSITION PROFITABLE • MONITOR EXIT",context:`${p.side} • unrealized ${money(p.pnl/100)} • ${assistantFormatTime(secs)}`,message:`POSITION UPDATE — the ${p.side} position is currently profitable. Continue monitoring for weakening momentum or a Kalshi reversal before the window closes.`,type:"profit",key:`profit:${liveTicker}:${Math.round(p.pnl)}`};
    return {state:"position",headline:"POSITION OPEN • MONITORING",context:`${p.side} • ${p.count.toFixed(0)} contract • ${assistantFormatTime(secs)} remaining`,message:`HOLD / MONITOR — the open ${p.side} position remains aligned with the current engine direction.`,type:"position",key:`hold:${liveTicker}:${f.pick}`};
  }
  if(gate)return {state:"warning",headline:"ENTRY BLOCKED • WAIT",context:`Engine ${f.pick} • Kalshi ${kd||"unresolved"} • ${assistantFormatTime(secs)}`,message:`WAIT — no new live entry. ${gate}. The assistant will keep monitoring for alignment.`,type:"warning",key:`gate:${liveTicker}:${gate}`};
  if(f.action==="PAPER READY"&&f.confidence>=65&&secs!==null&&secs>60)return {state:"buy",headline:`BUY SIGNAL • ${f.pick}`,context:`Confidence ${f.confidence.toFixed(0)} • risk ${f.risk} • ${assistantFormatTime(secs)} remaining`,message:`BUY CONDITIONS MET — engine pick ${f.pick}, confidence ${f.confidence.toFixed(0)}, and Kalshi direction agrees. Check the live quote and configured risk limits before entering.`,type:"buy",key:`buy:${liveTicker}:${f.pick}`};
  if(secs!==null&&secs<=60)return {state:"warning",headline:"FINAL MINUTE • NO NEW ENTRY",context:`${assistantFormatTime(secs)} remaining • Kalshi authority active`,message:"WAIT — final 60 seconds. New live entries are blocked; the controller is in position-protection mode.",type:"warning",key:`final:${liveTicker}`};
  if(f.risk==="HIGH"||f.action==="WAIT")return {state:"warning",headline:"WAIT • CONDITIONS NOT CLEAN",context:`Engine ${f.pick} • confidence ${f.confidence.toFixed(0)} • risk ${f.risk}`,message:"WAIT — the strategy engine does not currently have clean enough conditions for a live entry.",type:"warning",key:`wait:${liveTicker}:${f.risk}`};
  return {state:"monitor",headline:"MONITORING • NO ENTRY",context:`Engine ${f.pick} • confidence ${f.confidence.toFixed(0)} • ${assistantFormatTime(secs)} remaining`,message:"MONITOR — conditions are developing, but there is no live entry signal yet.",type:"monitor",key:`monitor:${liveTicker}:${f.pick}:${Math.floor((secs||0)/15)}`};
}
function updateAssistant(f){
  const orb=$("assistantOrb"),headline=$("assistantHeadline"),context=$("assistantContext"),stateEl=$("assistantOrbState"),data=$("assistantData"),clock=$("assistantClock");if(!orb||!headline)return;
  const a=assistantStateFor(f),now=Date.now();
  if(a.state!==assistantLastState){assistantLastState=a.state;orb.className=`assistant-orb state-${a.state}`;stateEl.textContent=a.state.toUpperCase();assistantAdd(a.message,a.type,a.key,true);}
  else if(!assistantInitialized||now-assistantLastAt>=12000)assistantAdd(a.message,a.type,a.key+"|pulse",true);
  headline.textContent=a.headline;context.textContent=a.context;data.textContent=f?`ENGINE DATA: ${f.action} • ${f.risk} • SCORE ${Number(f.score).toFixed(1)} • KALSHI ${kalshiDirection(liveMarket)||"UNRESOLVED"}`:"ENGINE DATA: WAITING";
  clock.textContent=new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});assistantInitialized=true;
}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const direction=n=>n>=0?'UP':'DOWN';
function minuteFromContractClock(closeTime){
  const closeMs=new Date(closeTime||0).getTime();
  if(!Number.isFinite(closeMs)||closeMs<=0)return null;
  const remaining=Math.max(0,(closeMs-Date.now())/1000);
  const elapsed=Math.max(0,900-remaining);
  return clamp(Math.floor(elapsed/60)+1,1,15);
}
function syncMinuteFromContractClock(){
  const m=minuteFromContractClock(liveMarket?.closeTime||liveMarket?.expirationTime);
  if(m!==null) minute=m;
  return minute;
}

async function startApp(){
 if(!window.controllerAPI)throw new Error('controller API unavailable — preload did not initialize');
 const read=window.controllerAPI.readRecords();
 allRecords=await Promise.race([read,new Promise((_,rej)=>setTimeout(()=>rej(new Error('records read timed out after 5s')),5000))]);
 // Window numbers are a daily session counter, not a permanent counter.
 // Never carry yesterday's window number into a new trading day.
 const todayRecords=allRecords.filter(r=>r.date===day()&&Number.isFinite(Number(r.windowNumber)));
 const savedWindowNumbers=todayRecords.map(r=>Number(r.windowNumber));
 if(savedWindowNumbers.length)windowNumber=Math.max(1,...savedWindowNumbers);
 loadLearning();
lastLiveSettlement=allRecords.slice().reverse().find(r=>r.type==='LIVE_SETTLEMENT')||null;
 // Repair legacy PAPER_ORDER results that were compared using r.pick instead of r.side.
 let repaired=false;
 for(const r of allRecords){
   if(r.type==='PAPER_ORDER'&&r.officialSettlement&&r.settlement){
     const next=r.side===r.settlement?'CORRECT':'INCORRECT';
     if(r.result!==next){r.result=next;repaired=true;}
   }
 }
 if(repaired)await window.controllerAPI.writeRecords(allRecords);
 await recoverLearningFromRecords();
 renderLearning();
 $('feed').textContent='LIVE ADAPTER: CONNECTING…';
 refreshBtc();
 refreshKalshi(true).finally(()=>{polling= polling || setInterval(()=>refreshKalshi(false),3000);});
setTimeout(()=>refreshLiveTradeWindow(),1200);
}
function loadLearning(){
 const m=allRecords.slice().reverse().find(r=>r.type==='LEARNING_MODEL');
 if(m&&m.weights){learning={version:Number(m.version)||1,completed:Number(m.completed)||0,weights:{...BASE_WEIGHTS,...m.weights},windows:Array.isArray(m.windows)?m.windows:[],accuracy:Number(m.accuracy)||0};}
}
function modelRecord(){return {type:'LEARNING_MODEL',version:learning.version,completed:learning.completed,weights:learning.weights,accuracy:learning.accuracy,updatedAt:new Date().toISOString(),windows:learning.windows.slice(-250)}}
async function recoverLearningFromRecords(){
 const groups=new Map();
 for(const r of allRecords){
   if(r.type!=='OBSERVATION'||!r.officialSettlement||!r.settlement||!r.components||!r.windowId)continue;
   if(!groups.has(r.windowId))groups.set(r.windowId,[]);
   groups.get(r.windowId).push(r);
 }
 let changed=0;
 for(const rs of groups.values()){
   const settlement=String(rs.find(r=>r.settlement)?.settlement||'').toUpperCase();
   if(settlement!=='UP'&&settlement!=='DOWN')continue;
   const summary=summarizeWindow(rs,settlement);
   if(!summary)continue;
   const idx=learning.windows.findIndex(w=>w.windowId===summary.windowId);
   if(idx<0){learning.windows.push(summary);changed++;}
   else{
     const prev=learning.windows[idx];
     if(prev.flipCount!==summary.flipCount||prev.flipUpToDown!==summary.flipUpToDown||prev.flipDownToUp!==summary.flipDownToUp||prev.observations!==summary.observations){
       learning.windows[idx]={...prev,...summary};changed++;
     }
   }
 }
 learning.windows=learning.windows.slice(-250);
 learning.completed=learning.windows.length;
 learning.accuracy=learning.completed
   ? 100*learning.windows.filter(w=>w.correct).length/learning.completed
   : 0;
 if(changed){
   learning.version++;
   await window.controllerAPI.writeRecords(upsertRecords(allRecords,[modelRecord()]));
 }
 return changed;
}
function startWindow(market){assistantLastState='monitor';assistantLastKey='';minute=1;windowId='W-'+Date.now();windowStart=new Date().toISOString();rows=[];paperPosition=null;autoPosition=null;autoEntryDoneTicker=null;noTradeWindow=false;lastAutoObservationKey='';flipState=null;flipCount=0;flipUpToDown=0;flipDownToUp=0;liveMarket=market||liveMarket;$('btc').value='';$('target').value=extractTarget(liveMarket) ?? DEFAULTS.target;render();calc()}
function extractTarget(m){if(!m)return null;for(const x of [m.strike,m.raw?.floor_strike,m.raw?.strike,m.raw?.floor_strike_dollars]){const n=Number(x);if(Number.isFinite(n)&&n>1000)return n}return null}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function pctPrice(v){const n=num(v);return n===null?null:(n<=1?n*100:n)}
function marketPrice(m){if(!m)return null;for(const v of [m.lastPrice,m.raw?.last_price_dollars,m.raw?.last_price]){const n=num(v);if(n!==null)return n<=1?n*100:n}const bid=pctPrice(m.yesBid),ask=pctPrice(m.yesAsk);return bid!==null&&ask!==null?(bid+ask)/2:null}
function parseLevel(x){if(Array.isArray(x)){const p=num(x[0]),s=num(x[1]);return p!==null&&s!==null?{price:p<=1?p*100:p,size:s}:null}if(x&&typeof x==='object'){const p=num(x.price??x.price_dollars??x.yes_price??x.no_price),s=num(x.quantity??x.size??x.count);return p!==null&&s!==null?{price:p<=1?p*100:p,size:s}:null}return null}
function bookStats(m){const yes=(m?.orderbook?.yes||[]).map(parseLevel).filter(Boolean),no=(m?.orderbook?.no||[]).map(parseLevel).filter(Boolean);const depth=a=>a.reduce((s,x)=>s+x.size,0);const yesDepth=depth(yes),noDepth=depth(no);const yb=pctPrice(m?.yesBid),ya=pctPrice(m?.yesAsk),nb=pctPrice(m?.noBid),na=pctPrice(m?.noAsk);return {yesDepth,noDepth,imbalance:(yesDepth+noDepth)>0?(yesDepth-noDepth)/(yesDepth+noDepth):null,spread:yb!==null&&ya!==null?Math.max(0,ya-yb):null,yesBid:yb,yesAsk:ya,noBid:nb,noAsk:na}}
function kalshiDirection(m){const yb=pctPrice(m?.yesBid),ya=pctPrice(m?.yesAsk),nb=pctPrice(m?.noBid),na=pctPrice(m?.noAsk);const ymid=yb!==null&&ya!==null?(yb+ya)/2:null;const nmid=nb!==null&&na!==null?(nb+na)/2:null;const yesProb=ymid!==null?ymid:(nmid!==null?100-nmid:null);if(yesProb===null)return null;if(yesProb>=52)return 'UP';if(yesProb<=48)return 'DOWN';return null}
function kalshiOnlyLiveGate(feature){const d=kalshiDirection(liveMarket);if(!d)return 'KALSHI MARKET DIRECTION UNRESOLVED';if(feature?.pick!==d)return `KALSHI DIRECTION ${d} CONFLICTS WITH ENGINE PICK ${feature?.pick}`;if(Number.isFinite(feature?.secondsToClose)&&feature.secondsToClose<=60)return 'FINAL 60 SECONDS: NEW LIVE ENTRIES BLOCKED';return null}
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
function historicalFlipStats(){const vals=learning.windows.map(w=>Number(w.flipCount)).filter(Number.isFinite);if(!vals.length)return {count:0,average:null,median:null};const sorted=[...vals].sort((a,b)=>a-b);const median=sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;return {count:vals.length,average:vals.reduce((s,n)=>s+n,0)/vals.length,median};}
function regimeFromPrices(up,down){const u=Number(up),d=Number(down);if(!Number.isFinite(u)||!Number.isFinite(d))return null;const yesEquivalent=100-d;const mid=(u+yesEquivalent)/2;if(mid>=52)return 'UP';if(mid<=48)return 'DOWN';return null;}
function deriveFlipStats(obs){let state=null,flips=0,upToDown=0,downToUp=0;for(const r of obs){const next=regimeFromPrices(r.marketUpPct,r.downPct);if(next&&state&&next!==state){flips++;if(state==='UP'&&next==='DOWN')upToDown++;if(state==='DOWN'&&next==='UP')downToUp++;}if(next)state=next;}return {flipCount:flips,flipUpToDown:upToDown,flipDownToUp:downToUp};}
function updateFlipState(up,down){const next=regimeFromPrices(up,down);if(!next)return;if(next&&flipState&&next!==flipState){flipCount++;if(flipState==='UP'&&next==='DOWN')flipUpToDown++;if(flipState==='DOWN'&&next==='UP')flipDownToUp++;}flipState=next;}
function calc(){syncMinuteFromContractClock();
 const btc=num($('btc').value)||0,target=num($('target').value)||0,up=num($('up').value)||0,down=num($('down').value)||0;
 const above=target>0?btc>=target:null,marketUp=up>=down,bs=bookStats(liveMarket);
 const close=new Date(liveMarket?.closeTime||liveMarket?.expirationTime||0).getTime(),secondsToClose=close?Math.max(0,(close-Date.now())/1000):null,distancePct=target?((btc-target)/target)*100:null;
 const prev=lastFeature;const dt=prev?Math.max(.1,(Date.now()-prev.ts)/1000):null;
 const marketVelocity=prev&&Number.isFinite(up)?(up-prev.marketUpPct)/dt*60:null,btcVelocity=prev&&prev.btc!=null?(btc-prev.btc)/dt*60:null;
 updateFlipState(up,down);const flipStats=historicalFlipStats();const c=componentSignals({above,up,down,imbalance:bs.imbalance,marketVelocity,btcVelocity,distancePct,secondsToClose});const w=learnedWeights();
 let score=0,reasons=[];for(const [k,v] of Object.entries(c))score += v*(w[k]||1)*100/6;
 if(above!==null)reasons.push(above?'BTC above strike':'BTC below strike');if(Math.abs(up-down)>8)reasons.push(up>down?'market strongly UP':'market strongly DOWN');if(Math.abs(bs.imbalance??0)>=.20)reasons.push(bs.imbalance>0?'orderbook favors UP':'orderbook favors DOWN');if(Math.abs(marketVelocity??0)>1)reasons.push(marketVelocity>0?'UP price momentum':'DOWN price momentum');if(Math.abs(btcVelocity??0)>1)reasons.push(btcVelocity>0?'BTC short-term momentum UP':'BTC short-term momentum DOWN');if(distancePct!==null&&Math.abs(distancePct)<.10)reasons.push('BTC very close to strike');
 const disagreement=above!==null&&(direction(above?1:-1)!==direction(up-down));if(disagreement){score*=.55;reasons.push('price/market disagreement')}
 const flipChop=flipStats.average!==null&&flipCount>flipStats.average+2&&flipStats.count>=3;if(flipChop){score*=.82;reasons.push(`market flipping ${flipCount}x vs ${flipStats.average.toFixed(1)}x historical avg`)}if(secondsToClose!==null&&secondsToClose<120){score*=.65;reasons.push('late-window caution')}
 const dataFresh=lastLiveAt>0&&Date.now()-lastLiveAt<10000&&lastBtcAt>0&&Date.now()-lastBtcAt<10000;let pick=score>=0?'UP':'DOWN',confidence=clamp(50+Math.abs(score)*1.25,0,99),risk='MODERATE',action='WATCH';
 const priceSane=up>=0&&up<=100&&down>=0&&down<=100&&(up+down>1);
 if(!liveTicker||!liveMarket||!dataFresh){risk='CRITICAL';action='WAIT';confidence=0;reasons=['live market data missing or stale']}else if(!priceSane){risk='CRITICAL';action='WAIT';confidence=0;reasons=['market price data failed sanity check']}else if(confidence<62){risk='HIGH';action='WAIT'}else if(disagreement||(bs.spread!==null&&bs.spread>8)){risk='HIGH';action='WATCH'}else if(secondsToClose!==null&&secondsToClose<60){risk='HIGH';action='WATCH'}else{risk='LOW';action='PAPER READY'}
 const kd=kalshiDirection(liveMarket);if(kd)reasons.push(`KALSHI MARKET DIRECTION: ${kd}`);else reasons.push('KALSHI MARKET DIRECTION: UNRESOLVED');
 if(action==='PAPER READY'&&kd&&pick!==kd){risk='HIGH';action='WATCH';reasons.push(`LIVE SAFETY: Kalshi direction ${kd} conflicts with engine pick`)}
 if(action==='PAPER READY'&&secondsToClose!==null&&secondsToClose<=60){risk='HIGH';action='WATCH';reasons.push('LIVE SAFETY: final 60 seconds — no new live entries')}
 const feature={ts:Date.now(),btc,target,marketUpPct:up,downPct:down,pick,score,confidence,risk,action,distancePct,secondsToClose,marketVelocity,btcVelocity,...bs,flipCount,flipUpToDown,flipDownToUp,historicalFlipAverage:flipStats.average,historicalFlipMedian:flipStats.median,flipSamples:flipStats.count,components:c,weights:w,marketTicker:liveTicker};lastFeature=feature;
 $('flipCount').textContent=`${flipCount}`;$('flipAverage').textContent=flipStats.average===null?'—':flipStats.average.toFixed(1);$('flipTrend').textContent=flipStats.count<3?'COLLECTING':`${flipCount} current • ${flipStats.average.toFixed(1)} avg`;
 // CONTRACT WINDOW is the minute position inside the active 15-minute contract.
 // windowNumber remains an internal daily sequence for persisted records.
 syncMinuteFromContractClock();
 $('window').textContent=`${minute} / 15`;$('btcView').textContent=money(btc);$('targetView').textContent=money(target);$('pick').textContent=pick;$('confidence').textContent=pct(confidence);$('risk').textContent=risk;$('action').textContent=action;$('score').textContent=score.toFixed(1);$('spread').textContent=bs.spread===null?'—':bs.spread.toFixed(1)+'¢';$('imbalance').textContent=bs.imbalance===null?'—':bs.imbalance.toFixed(2);$('countdown').textContent=secondsToClose===null?'—':`${Math.floor(secondsToClose/60)}:${String(Math.floor(secondsToClose%60)).padStart(2,'0')}`;$('alert').textContent=action==='WAIT'?'WAIT — engine does not have enough clean data to act.':reasons.join(' • ');$('reason').textContent=`Adaptive score ${score.toFixed(1)} using learned weights after ${learning.completed} completed windows.`;updateAssistant(feature);return feature;
}
async function record(){const r=calc();const row={id:`${windowId}:${Date.now()}`,type:'OBSERVATION',date:day(),timestamp:new Date().toISOString(),windowNumber,windowId,windowStart,minute,...r,result:'PENDING'};rows.push(row);render();await persist()}
async function recordObservationIfNeeded(){if(!liveTicker||!liveMarket)return;syncMinuteFromContractClock();const key=`${liveTicker}:${minute}`;if(key===lastAutoObservationKey)return;const r=calc();const row={id:`${windowId}:OBS:${minute}`,type:'OBSERVATION',date:day(),timestamp:new Date().toISOString(),windowNumber,windowId,windowStart,minute,...r,result:'PENDING'};rows.push(row);lastAutoObservationKey=key;render();await persist()}
function upsertRecords(base,add){const map=new Map();for(const r of base||[]){if(r.id)map.set(r.id,r)}for(const r of add||[]){if(r.id)map.set(r.id,r)}return [...map.values()]}
async function persist(){allRecords=upsertRecords(allRecords,rows);await window.controllerAPI.writeRecords(upsertRecords(allRecords,[modelRecord()]));render()}
function summarizeWindow(rs,settlement){const obs=rs.filter(r=>r.type==='OBSERVATION'&&r.components).sort((a,b)=>new Date(a.timestamp||0)-new Date(b.timestamp||0));if(!obs.length)return null;const last=obs[obs.length-1],flips=deriveFlipStats(obs),avg=k=>obs.reduce((s,r)=>s+(Number(r[k])||0),0)/obs.length;const comps={};for(const k of Object.keys(BASE_WEIGHTS))comps[k]=avgComp(obs,k);const pick=last.pick;const correct=pick===settlement;return {windowNumber:last.windowNumber||windowNumber,windowId:last.windowId,windowStart:last.windowStart,ticker:last.marketTicker,settlement,pick,correct,score:last.score,confidence:last.confidence,flipCount:flips.flipCount,flipUpToDown:flips.flipUpToDown,flipDownToUp:flips.flipDownToUp,components:comps,observations:obs.length,completedAt:new Date().toISOString()}}
function avgComp(obs,k){return obs.reduce((s,r)=>s+(Number(r.components?.[k])||0),0)/obs.length}
async function learnFromWindow(summary){if(!summary)return;learning.completed++;learning.windows=learning.windows.filter(w=>w.windowId!==summary.windowId);learning.windows.push(summary);const completed=learning.windows.length;learning.accuracy=100*learning.windows.filter(w=>w.correct).length/Math.max(1,completed);
 if(completed>=10){for(const k of Object.keys(BASE_WEIGHTS)){const usable=learning.windows.slice(-50);const signals=usable.filter(w=>Math.abs(w.components?.[k]||0)>=0.05);if(signals.length<5)continue;let hits=0;for(const w of signals){const pred=(w.components[k]>=0?'UP':'DOWN');if(pred===w.settlement)hits++;}const acc=hits/signals.length;const edge=(acc-.5)*2;const target=clamp(1+edge,0.4,1.8);learning.weights[k]=clamp(learning.weights[k]*0.8+target*0.2,0.4,1.8)}}
 learning.version++;await window.controllerAPI.writeRecords(upsertRecords(allRecords,[modelRecord()]));renderLearning();
}
async function finalizePending(ticker,snapshot){const entry=pendingWindows.get(ticker);if(!entry)return false;const result=String(snapshot?.result||'').toLowerCase();if(result!=='yes'&&result!=='no')return false;const settlement=result==='yes'?'UP':'DOWN';const summary=summarizeWindow(entry.rows,settlement);entry.rows.forEach(r=>{r.settlement=settlement;r.result=(r.type==='PAPER_ORDER'?r.side:r.pick)===settlement?'CORRECT':'INCORRECT';r.officialSettlement=true;if(r.type==='PAPER_ORDER'){const win=r.side===settlement;r.paperPnlCents=win?Math.round(100-r.entryPriceCents):Math.round(-r.entryPriceCents);r.paperOutcome=win?'WIN':'LOSS'}});allRecords=upsertRecords(allRecords,entry.rows);pendingWindows.delete(ticker);if(summary)await learnFromWindow(summary);await persist();return true}
async function finalizeWindowIfOfficial(){if(!liveMarket||!rows.length)return false;const ticker=liveTicker;pendingWindows.set(ticker,{windowId,windowStart,rows:[...rows]});rows=[];return await finalizePending(ticker,liveMarket)}
async function paperExecute(){const f=calc();if(f.action!=='PAPER READY'){$('orderStatus').textContent='PAPER ORDER BLOCKED — '+f.action;return}if(paperPosition&&paperPosition.ticker===liveTicker){$('orderStatus').textContent='PAPER POSITION ALREADY OPEN';return}paperPosition={ticker:liveTicker,side:f.pick,entryPct:f.pick==='UP'?f.marketUpPct:100-f.marketUpPct,ts:new Date().toISOString(),windowId,minute};$('orderStatus').textContent=`PAPER ORDER FILLED: ${f.pick} @ ${paperPosition.entryPct.toFixed(1)}¢`;rows.push({id:`${windowId}:ORDER:${Date.now()}`,date:day(),timestamp:new Date().toISOString(),windowId,windowStart,minute,marketTicker:liveTicker,type:'PAPER_ORDER',side:f.pick,entryPriceCents:paperPosition.entryPct,confidence:f.confidence,score:f.score,result:'PENDING'});await persist()}
async function rollover(){if(switching)return;switching=true;try{if(rows.length===0)await record();if(liveMarket&&!['yes','no'].includes(String(liveMarket.result||'').toLowerCase())){$('contractState').textContent='EXPIRED / AWAITING OFFICIAL RESULT';return}if(liveMarket)await finalizeWindowIfOfficial();await persist();await refreshKalshi(true)}finally{switching=false}}
function renderLearning(){const w=learning.windows;const weights=learnedWeights();$('learnWindows').textContent=learning.completed;$('learnAccuracy').textContent=w.length?pct(learning.accuracy):'—';$('learnMode').textContent=learning.completed<10?'BASELINE / COLLECTING':`ADAPTIVE / ${learning.completed} WINDOWS`;$('modelVersion').textContent=String(learning.version);$('learnSummary').textContent=learning.completed<10?`Collecting completed windows before adaptive weighting. ${Math.max(0,10-learning.completed)} more window${10-learning.completed===1?'':'s'} needed.`:`Learning active. Weights adapt from recent completed-window component accuracy; no single window can dominate the model.`;$('weights').textContent='Weights: '+Object.entries(weights).map(([k,v])=>`${k} ${v.toFixed(2)}`).join(' • ')}
function render(){const stored=allRecords.filter(r=>r.type!=='LEARNING_MODEL').length+rows.length;$('daily').textContent=`Today: ${allRecords.filter(r=>r.date===day()&&r.type!=='LEARNING_MODEL').length+rows.filter(r=>r.date===day()).length} records • Total stored: ${stored}`;$('history').innerHTML=rows.slice().reverse().map(r=>`<div class="row">${r.type==='PAPER_ORDER'?'ORDER':'M'+r.minute} • ${r.side||r.pick||'—'} • ${r.risk||'—'} • ${r.action||'—'} • ${r.result||'PENDING'}</div>`).join('');if(paperPosition&&paperPosition.ticker===liveTicker){$('orderStatus').textContent=`OPEN PAPER POSITION: ${paperPosition.side} @ ${Number(paperPosition.entryPct).toFixed(1)}¢ • WINDOW ${paperPosition.windowId}`}renderLearning()}
function exportCSV(){const data=allRecords.filter(r=>r.type!=='LEARNING_MODEL').concat(rows);const headers=['date','timestamp','windowId','windowStart','minute','btc','target','marketUpPct','downPct','pick','score','confidence','risk','action','distancePct','secondsToClose','marketVelocity','btcVelocity','yesDepth','noDepth','imbalance','spread','flipCount','flipUpToDown','flipDownToUp','historicalFlipAverage','historicalFlipMedian','flipSamples','marketTicker','settlement','result','officialSettlement','type','side','entryPriceCents','count','orderId','fee','positionAtClose','closedAt','pnlCents','status','paperOutcome','paperPnlCents'];const csv=[headers.join(','),...data.map(r=>headers.map(h=>`"${String(r[h]??'').replaceAll('"','""')}"`).join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`BTC_15M_${day()}.csv`;a.click()}
function isOpen(m){const s=String(m?.status||'').toLowerCase();return s==='open'||s==='active'}
function candidate(markets){const arr=(markets||[]).filter(m=>{const t=((m.title||'')+' '+(m.subtitle||'')+' '+(m.ticker||'')+' '+(m.event_ticker||'')).toLowerCase();return(t.includes('bitcoin')||t.includes('btc'))&&/15\s*min|15-minute|15minute/.test(t)&&isOpen(m)});arr.sort((a,b)=>new Date(a.close_time||a.expiration_time||0)-new Date(b.close_time||b.expiration_time||0));return arr.find(m=>new Date(m.close_time||m.expiration_time||0)>new Date())||null}
async function refreshBtc(){try{const r=await window.controllerAPI.btcSpot();if(Number.isFinite(Number(r.price))){$('btc').value=Number(r.price).toFixed(2);lastBtcAt=Date.now();$('btcSource').textContent='LIVE BTC REFERENCE: '+(r.sources||[]).map(x=>x.source).join(' + ')+' • DISPLAY ONLY — KALSHI IS LIVE EXECUTION AUTHORITY';calc()}}catch(e){$('btcSource').textContent='LIVE BTC REFERENCE: UNAVAILABLE • KALSHI LIVE DATA REMAINS AUTHORITATIVE';calc()}}
function contractStartMs(m){const close=new Date(m?.closeTime||m?.expirationTime||0).getTime();return Number.isFinite(close)&&close>0?close-15*60*1000:null}
function syncWindowNumberForContract(m){
 const currentStart=contractStartMs(m);if(currentStart===null)return;
 const todayRows=allRecords.filter(r=>r.date===day()&&r.type!=='LEARNING_MODEL'&&r.windowStart);
 if(!todayRows.length){windowNumber=1;return}
 const latest=todayRows.reduce((a,b)=>new Date(a.windowStart).getTime()>new Date(b.windowStart).getTime()?a:b);
 const lastStart=new Date(latest.windowStart).getTime();
 if(!Number.isFinite(lastStart))return;
 const buckets=Math.max(0,Math.floor((currentStart-lastStart)/(15*60*1000)));
 windowNumber=Math.max(1,(Number(latest.windowNumber)||1)+buckets);
}
async function refreshKalshiInternal(force=false){try{
 for(const ticker of Array.from(liveSettlementQueue.keys())){try{const snap=await window.controllerAPI.kalshiSnapshot(ticker);await finalizeLiveSettlement(ticker,snap)}catch(_){ }}
 for(const ticker of Array.from(pendingWindows.keys())){try{const snap=await window.controllerAPI.kalshiSnapshot(ticker);await finalizePending(ticker,snap)}catch(_){ }}
 if(liveTicker&&liveMarket){
   const old=await window.controllerAPI.kalshiSnapshot(liveTicker);
   const oldClose=new Date(old.closeTime||old.expirationTime||0).getTime();
   if(oldClose&&Date.now()>=oldClose){
     pendingWindows.set(liveTicker,pendingWindows.get(liveTicker)||{windowId,windowStart,rows:[...rows]});rows=[];
     await lockLiveSettlement(liveTicker,old);await finalizePending(liveTicker,old);await finalizeLiveSettlement(liveTicker,old);
   }
 }
 const resp=await window.controllerAPI.kalshiMarkets({limit:1000,status:'open',seriesTicker:'KXBTC15M'}),m=candidate(resp.markets||[]);
 if(!m){$('feed').textContent='LIVE ADAPTER: NO OPEN BTC 15-MINUTE CONTRACT FOUND — NOT GUESSING';$('contractState').textContent='NO ACTIVE CONTRACT';liveTicker=null;liveMarket=null;calc();return}
 const snap=await window.controllerAPI.kalshiSnapshot(m.ticker),hadTicker=Boolean(liveTicker),changed=liveTicker!==snap.ticker;
 if(changed){
   if(hadTicker)windowNumber=Math.max(1,windowNumber+1);else syncWindowNumberForContract(snap);
   const wasAutoLive=autoLive;
   liveTicker=snap.ticker;liveMarket=snap;startWindow(snap);if(wasAutoLive)autoRolloverPending=true;renderSettlementStatus();
 }else{liveTicker=snap.ticker;liveMarket=snap}
 const last=marketPrice(snap),yesAsk=pctPrice(snap.yesAsk),noAsk=pctPrice(snap.noAsk),yesBid=pctPrice(snap.yesBid),noBid=pctPrice(snap.noBid);
 const executableUp=yesAsk??(noBid!==null?100-noBid:null),executableDown=noAsk??(yesBid!==null?100-yesBid:null);
 if(executableUp!==null)$('up').value=executableUp.toFixed(1);else if(last!==null)$('up').value=last.toFixed(1);
 if(executableDown!==null)$('down').value=executableDown.toFixed(1);else if(last!==null)$('down').value=(100-last).toFixed(1);
 const strike=extractTarget(snap);if(strike!==null)$('target').value=strike;lastLiveAt=Date.now();$('ticker').textContent=liveTicker;$('feed').textContent='LIVE ADAPTER: CONNECTED • PUBLIC KALSHI MARKET DATA';$('contractState').textContent=String(snap.status||'UNKNOWN').toUpperCase();$('officialResult').textContent=snap.result||'PENDING';
 const close=new Date(snap.closeTime||snap.expirationTime||0);$('closeAt').textContent=isNaN(close.getTime())?'—':close.toLocaleTimeString();calc();render();
 }catch(e){$('feed').textContent='LIVE ADAPTER: STALE / UNAVAILABLE — NOT GUESSING';$('contractState').textContent='STALE';calc();render()}}

let kalshiRefreshBusy=false;
async function refreshKalshi(force=false){if(kalshiRefreshBusy)return;kalshiRefreshBusy=true;try{return await refreshKalshiInternal(force)}finally{kalshiRefreshBusy=false}}
setInterval(()=>{if(lastLiveAt)$('age').textContent=Math.floor((Date.now()-lastLiveAt)/1000)+'s';calc();recordObservationIfNeeded().catch(e=>{$('feed').textContent='OBSERVATION ERROR: '+(e?.message||e)})},1000);
setInterval(()=>{if(autoLive)refreshDailyLoss()},10000);
setInterval(()=>refreshBtc(),3000);
setInterval(()=>refreshKalshi(false),3000);
setInterval(()=>refreshLiveTradeWindow(),3000);
$('update').onclick=record;$('next').onclick=async()=>{await refreshKalshi(true);await record();syncMinuteFromContractClock();calc();render()};$('newWindow').onclick=()=>refreshKalshi(true);$('paperOrder').onclick=paperExecute;$('export').onclick=exportCSV;
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
async function liveBalance(){try{const exchangeIndex=Number.isInteger(liveMarket?.exchangeIndex)?liveMarket.exchangeIndex:undefined;const r=await window.controllerAPI.kalshiBalance(exchangeIndex);const cents=Number(r.balance);const tradingCents=Number(r.exchange_balance);const displayCents=Number.isFinite(cents)?cents:tradingCents;$('liveStatus').textContent=Number.isFinite(displayCents)?`LIVE BALANCE: ${(displayCents/100).toFixed(2)}${Number.isFinite(tradingCents)&&exchangeIndex!==undefined?` • EXCHANGE ${exchangeIndex}: ${(tradingCents/100).toFixed(2)}`:''}`:'BALANCE RESPONSE RECEIVED';return Number.isFinite(tradingCents)?tradingCents:displayCents}catch(e){$('liveStatus').textContent='BALANCE ERROR: '+e.message;return null}}
function liveQuoteCents(outcome){
  // For an immediate-or-cancel buy, use the actual ask for the outcome.
  // Deriving the price from the opposite-side bid can overstate the price
  // when the book has a spread (e.g. UP ask 91.6¢ but 100-NO bid = 99¢).
  const yesAsk=pctPrice(liveMarket?.yesAsk);
  const noAsk=pctPrice(liveMarket?.noAsk);
  const yes=(liveMarket?.orderbook?.yes||[]).map(parseLevel).filter(Boolean);
  const no=(liveMarket?.orderbook?.no||[]).map(parseLevel).filter(Boolean);
  const bestYesAsk=yes.length?Math.min(...yes.map(x=>x.price)):null;
  const bestNoAsk=no.length?Math.min(...no.map(x=>x.price)):null;
  if(outcome==='UP'){
    const p=yesAsk??bestYesAsk;
    if(p!==null)return clamp(Math.ceil(p),1,99);
  }
  if(outcome==='DOWN'){
    const p=noAsk??bestNoAsk;
    if(p!==null)return clamp(Math.ceil(p),1,99);
  }
  return null;
}
async function liveExecute(){
  try{
    if(autoLive)throw new Error('Manual live test is locked while AUTO LIVE is ON. Disarm AUTO first.');
    const f=calc();
    if(f.action!=='PAPER READY')throw new Error('Engine is not ready: '+f.action);
    const kalshiGate=kalshiOnlyLiveGate(f);if(kalshiGate)throw new Error('KALSHI-ONLY LIVE SAFETY BLOCK: '+kalshiGate);
    if(!liveTicker||!liveMarket)throw new Error('No active Kalshi contract');
    const maxSpend=Math.max(0.01,Number($('liveMaxSpend').value)||2);
    const priceCents=liveQuoteCents(f.pick);
    const maxEntryPrice=clamp(Number($('liveMaxEntryPrice').value)||85,1,99);
    if(priceCents!==null&&priceCents>maxEntryPrice)throw new Error(`Entry price ${priceCents}¢ exceeds max entry ${maxEntryPrice.toFixed(0)}¢ — no chase`);
    if(priceCents===null)throw new Error('No executable live quote available');
    // Manual diagnostic mode is intentionally hard-capped at exactly one contract.
    // The dollar limit remains a safety check, but can never cause multiple contracts.
    const count=1;
    const estimatedCost=priceCents/100;
    if(estimatedCost>maxSpend)throw new Error(`One contract at ${priceCents}¢ exceeds max spend ${maxSpend.toFixed(2)}`);
    $('liveStatus').textContent=`LIVE ORDER PREVIEW: ${f.pick} • 1 contract • ${priceCents}¢ max • ${estimatedCost.toFixed(2)} max cost • ${liveTicker}`;
    const r=await window.controllerAPI.kalshiOrder({ticker:liveTicker,outcome:f.pick,count,priceCents,exchangeIndex:Number.isInteger(liveMarket?.exchangeIndex)?liveMarket.exchangeIndex:-1});
    const filled=Number(r.fill_count??r.filled_count??r.fill_count_fp??0);
    const remaining=Number(r.remaining_count??r.remaining_count_fp??0);
    const avg=Number(r.average_fill_price??r.average_fill_price_dollars);
    const fee=Number(r.average_fee_paid??r.average_fee_paid_dollars);
    if(filled>0){
      $('liveStatus').textContent=`LIVE FILLED • ${f.pick} • ${filled.toFixed(2)} contract • avg ${Number.isFinite(avg)?(avg*100).toFixed(2)+'¢':'quote n/a'} • fee ${Number.isFinite(fee)?fee.toFixed(4):'n/a'} • order ${r.order_id||'accepted'}`;
    }else{
      $('liveStatus').textContent=`LIVE ORDER ACCEPTED • NO FILL • ${f.pick} • requested 1 • remaining ${Number.isFinite(remaining)?remaining.toFixed(2):'n/a'} • order ${r.order_id||'accepted'}`;
    }
    rows.push({id:windowId+':LIVE:'+Date.now(),date:day(),timestamp:new Date().toISOString(),windowId,windowStart,minute,marketTicker:liveTicker,type:'LIVE_ORDER',side:f.pick,entryPriceCents:priceCents,count,orderId:r.order_id||'',clientOrderId:r.clientOrderId||'',fillCount:filled,remainingCount:remaining,averageFillPrice:r.average_fill_price||'',averageFeePaid:r.average_fee_paid||'',result:filled>0?'FILLED':'NO_FILL'});
    await persist();
    await liveBalance();
  }catch(e){$('liveStatus').textContent='LIVE ORDER BLOCKED/FAILED: '+e.message}
}
function openSellWindow(){
  const pos=Number(liveTrade.position)||0;
  if(!liveTicker||!liveMarket||pos===0){
    $('liveStatus').textContent='SELL BLOCKED — NO OPEN LIVE POSITION';
    return;
  }
  const outcome=pos>0?'UP':'DOWN';
  const qty=Math.max(1,Math.floor(Math.abs(pos)));
  const yesBid=pctPrice(liveMarket?.yesBid), yesAsk=pctPrice(liveMarket?.yesAsk);
  const exitQuote=outcome==='UP'?yesBid:(yesAsk!==null?100-yesAsk:null);
  const entry=Number(liveTrade.entryCents);
  const fee=Number(liveTrade.fee);
  $('sellTicker').textContent=liveTicker;
  $('sellPosition').textContent=`${outcome} • ${qty} contract${qty===1?'':'s'}`;
  $('sellQuote').textContent=exitQuote===null?'—':exitQuote.toFixed(1)+'¢';
  $('sellProceeds').textContent=exitQuote===null?'—':money(exitQuote*qty/100);
  $('sellEntry').textContent=Number.isFinite(entry)?entry.toFixed(1)+'¢':'—';
  const estPnl=exitQuote!==null&&Number.isFinite(entry)?(exitQuote-entry)*qty-(Number.isFinite(fee)?fee*100:0):null;
  $('sellPnl').textContent=Number.isFinite(estPnl)?(estPnl>=0?'+':'')+money(estPnl/100):'—';
  $('sellPnl').className=estPnl>0?'sell-positive':(estPnl<0?'sell-negative':'');
  $('sellQty').max=String(qty);$('sellQty').value=String(qty);
  $('sellWarning').textContent=`Displayed quote is informational. The controller will refresh the Kalshi position and executable quote again before submitting ${qty} contract${qty===1?'':'s'}.`;
  $('sellModal').hidden=false;
  setTimeout(()=>{$('sellQty').focus();$('sellQty').select()},50);
}
function closeSellWindow(){$('sellModal').hidden=true}
async function confirmSell(){
  const pos=Number(liveTrade.position)||0;
  if(!liveTicker||pos===0){closeSellWindow();return}
  const outcome=pos>0?'UP':'DOWN';
  const maxQty=Math.floor(Math.abs(pos));
  const count=Math.floor(Number($('sellQty').value));
  if(!Number.isInteger(count)||count<1||count>maxQty){$('sellWarning').textContent=`Enter a whole number from 1 to ${maxQty}.`;return}
  $('sellConfirm').disabled=true;$('sellCancel2').disabled=true;
  $('sellWarning').textContent='Refreshing Kalshi position and executable quote…';
  try{
    const r=await window.controllerAPI.kalshiSell({ticker:liveTicker,outcome,count,exchangeIndex:Number.isInteger(liveMarket?.exchangeIndex)?liveMarket.exchangeIndex:-1});
    const filled=Number(r.fill_count??r.fill_count_fp??r.filled_count??0);
    const remaining=Number(r.remaining_count??r.remaining_count_fp??0);
    $('liveStatus').textContent=filled>0
      ?`LIVE SELL FILLED • ${r.outcome||outcome} • ${filled.toFixed(2)} contract • exit ${Number(r.priceCents).toFixed(1)}¢ • order ${r.order_id||'accepted'}`
      :`LIVE SELL ACCEPTED • NO FILL • requested ${count} • remaining ${Number.isFinite(remaining)?remaining.toFixed(2):'n/a'} • order ${r.order_id||'accepted'}`;
    rows.push({id:windowId+':LIVE_EXIT:'+Date.now(),date:day(),timestamp:new Date().toISOString(),windowId,windowStart,minute,marketTicker:liveTicker,type:'LIVE_EXIT',side:outcome,entryPriceCents:liveTrade.entryCents??null,exitPriceCents:Number(r.priceCents),count,fillCount:filled,remainingCount:remaining,orderId:r.order_id||'',clientOrderId:r.clientOrderId||'',result:filled>0?'FILLED':'NO_FILL'});
    await persist();
    await refreshLiveTradeWindow();
    closeSellWindow();
  }catch(e){
    $('sellWarning').textContent='SELL BLOCKED/FAILED: '+(e?.message||e);
  }finally{$('sellConfirm').disabled=false;$('sellCancel2').disabled=false}
}
$('sellPositionBtn').onclick=openSellWindow;
$('sellCancel').onclick=closeSellWindow;
$('sellCancel2').onclick=closeSellWindow;
$('sellConfirm').onclick=confirmSell;
$('sellModal').addEventListener('click',e=>{if(e.target===$('sellModal'))closeSellWindow()});
$('saveCreds').onclick=saveLiveCredentials;
$('armLive').onclick=armLive;
$('disarmLive').onclick=disarmLive;
$('liveBalance').onclick=liveBalance;
$('liveExecute').onclick=liveExecute;

startApp().catch(e=>{const msg='BOOT ERROR: '+(e?.message||e);$('feed').textContent=msg;$('btcSource').textContent='LIVE BTC: NOT STARTED';$('ticker').textContent='BOOT FAILED';$('contractState').textContent='BOOT FAILED';});
liveSetup().catch(e=>{$('liveStatus').textContent='LIVE SETUP ERROR: '+(e?.message||e)});

function latestLiveOrder(ticker){
 const pool=allRecords.concat(rows);
 return pool.filter(r=>r&&r.marketTicker===ticker&&['LIVE_ORDER','AUTO_ENTRY'].includes(r.type)&&Number(r.fillCount||0)>0)
   .sort((a,b)=>new Date(b.timestamp||0)-new Date(a.timestamp||0))[0]||null;
}
function settlementResultFromMarket(snapshot){
 const result=String(snapshot?.result||'').toLowerCase();
 return result==='yes'?'UP':(result==='no'?'DOWN':null);
}
function settlementRecordId(ticker){return 'LIVE_SETTLEMENT:'+String(ticker||'');}
async function persistLiveSettlement(s){
 const row={id:settlementRecordId(s.ticker),type:'LIVE_SETTLEMENT',date:day(),timestamp:new Date().toISOString(),marketTicker:s.ticker,orderId:s.orderId,side:s.side,count:s.count,entryPriceCents:s.entryCents,fee:s.fee,positionAtClose:s.positionAtClose,closedAt:s.closedAt,settlement:s.outcome||'PENDING',result:s.outcome||'PENDING',officialSettlement:Boolean(s.outcome),pnlCents:s.pnlCents,status:s.status};
 allRecords=upsertRecords(allRecords,[row]);
 await window.controllerAPI.writeRecords(upsertRecords(allRecords,[modelRecord()]));
}
async function lockLiveSettlement(ticker,snapshot){
 if(!ticker||liveSettlementQueue.has(ticker))return liveSettlementQueue.get(ticker)||null;
 const order=latestLiveOrder(ticker);if(!order)return null;
 let position=0;try{const ex=Number.isInteger(snapshot?.exchangeIndex)?snapshot.exchangeIndex:undefined;position=parseLivePosition(await window.controllerAPI.kalshiPositions(ticker,ex),ticker)}catch(_){ }
 const count=Number(order.fillCount||order.count||0)||Math.abs(position)||0;if(count<=0)return null;
 const entry=Number(order.entryPriceCents),fee=Number(order.averageFeePaid);
 const locked={ticker,orderId:order.orderId||null,side:order.side||null,count,entryCents:Number.isFinite(entry)?entry:null,fee:Number.isFinite(fee)?fee:null,positionAtClose:position,closedAt:new Date(snapshot?.closeTime||snapshot?.expirationTime||Date.now()).toISOString(),outcome:null,pnlCents:null,status:'CLOSED / AWAITING OFFICIAL RESULT'};
 liveSettlementQueue.set(ticker,locked);lastLiveSettlement=locked;await persistLiveSettlement(locked);return locked;
}
async function finalizeLiveSettlement(ticker,snapshot){
 const s=liveSettlementQueue.get(ticker);if(!s)return false;const outcome=settlementResultFromMarket(snapshot);if(!outcome)return false;
 const entry=Number(s.entryCents),count=Number(s.count),fee=Number(s.fee);if(!Number.isFinite(entry)||!Number.isFinite(count)||count<=0)return false;
 const win=s.side===outcome;s.outcome=outcome;s.pnlCents=(win?(100-entry):(-entry))*count-(Number.isFinite(fee)?fee*100:0);s.status='SETTLED';s.settledAt=new Date().toISOString();lastLiveSettlement=s;
 liveSettlementQueue.delete(ticker);try{s.balanceCents=await liveBalance()}catch(_){ }await persistLiveSettlement(s);return true;
}
function renderSettlementStatus(){
 const s=lastLiveSettlement;if(!s)return;const pnl=Number(s.pnlCents);const pnlText=Number.isFinite(pnl)?(pnl>=0?'+':'')+money(pnl/100):'PENDING';const result=s.outcome||'PENDING';
 if(s.status==='SETTLED')$('tradeMessage').textContent='PREVIOUS WINDOW SETTLED • '+result+' • P/L '+pnlText+' • BALANCE REFRESHED';
 else $('tradeMessage').textContent='PREVIOUS WINDOW CLOSED • AWAITING OFFICIAL SETTLEMENT';
}
function parseLivePosition(resp,ticker){
 const list=Array.isArray(resp?.market_positions)?resp.market_positions:Array.isArray(resp?.positions)?resp.positions:[];
 const x=list.find(v=>String(v.ticker||v.market_ticker||'')===ticker);
 if(!x)return 0;
 const n=Number(x.position_fp??x.position??x.yes_position??0);
 return Number.isFinite(n)?n:0;
}
function formatTradeTime(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return '—';
 const s=Math.floor(seconds); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}
function renderTradeWindow(){
 const t=liveTrade;
 $('tradeTicker').textContent=t.ticker||'Waiting for a live position…';
 const open=Math.abs(Number(t.position)||0)>0;
 $('sellPositionBtn').disabled=!open;
 $('sellHint').textContent=open?`Open ${Math.abs(Number(t.position)).toFixed(0)} contract${Math.abs(Number(t.position)===1)?'':'s'} • click to review exit`:'No open live position';
 const order=latestLiveOrder(t.ticker||liveTicker);
 const hasOrder=Boolean(order);
 $('tradeState').textContent=open?'POSITION OPEN':(hasOrder?'POSITION FLAT / AWAITING SETTLEMENT':'NO LIVE POSITION');
 $('tradeBalance').textContent=Number.isFinite(t.balanceCents)?money(t.balanceCents/100):'—';
 $('tradePosition').textContent=open?`${t.side||'POSITION'} • ${Math.abs(t.position).toFixed(2)}`:(hasOrder?'FLAT':'—');
 $('tradeEntry').textContent=Number.isFinite(t.entryCents)?t.entryCents.toFixed(1)+'¢':'—';
 $('tradeMark').textContent=Number.isFinite(t.markCents)?t.markCents.toFixed(1)+'¢':'—';
 const pnlText=Number.isFinite(t.pnlCents)?`${t.pnlCents>=0?'+':''}${(t.pnlCents/100).toFixed(2)}`:'—';
 $('tradePnl').textContent=Number.isFinite(t.pnlCents)?(t.pnlCents>=0?'+':'')+money(t.pnlCents/100):'—';
 $('tradePnl').className=t.pnlCents>0?'trade-positive':(t.pnlCents<0?'trade-negative':'');
 $('tradeTime').textContent=formatTradeTime(t.secondsToClose);
 $('tradeBet').textContent=t.side&&Number.isFinite(t.count)?`${t.side} • ${t.count.toFixed(2)} contract${t.count===1?'':'s'}`:'—';
 $('tradeFill').textContent=Number.isFinite(t.entryCents)?t.entryCents.toFixed(2)+'¢':'—';
 $('tradeFee').textContent=Number.isFinite(t.fee)?t.fee.toFixed(4):'—';
 $('tradeOrder').textContent=t.orderId?t.orderId.slice(0,12)+'…':'—';
 $('tradeResult').textContent=t.result||'PENDING';
 const close=new Date(liveMarket?.closeTime||liveMarket?.expirationTime||0).getTime();
 const start=close?close-15*60*1000:null;
 const elapsed=start?clamp((Date.now()-start)/(15*60*1000),0,1):0;
 $('tradeProgressPct').textContent=Math.round(elapsed*100)+'%';
 $('tradeProgressBar').style.width=(elapsed*100)+'%';
 $('tradeMinute').textContent=`MINUTE ${minute} / 15`;
 const pts=t.points||[];
 $('tradeChart').innerHTML=pts.length?pts.map((p,i)=>`<div class="trade-point" style="left:${p.x}%;bottom:${p.y}%"><span>${p.value.toFixed(1)}¢</span></div>`).join(''):'<div class="trade-empty">Waiting for first live mark…</div>';
 if(t.result&&t.result!=='PENDING') $('tradeMessage').textContent=`WINDOW COMPLETE • OFFICIAL RESULT: ${t.result} • P/L ${t.pnlCents>=0?'+':''}${(t.pnlCents/100).toFixed(2)}`;
 else if(open) $('tradeMessage').textContent=`TRACKING LIVE • ${t.side} position • current mark ${Number.isFinite(t.markCents)?t.markCents.toFixed(1)+'¢':'—'} • ${formatTradeTime(t.secondsToClose)} remaining`;
 else if(hasOrder) $('tradeMessage').textContent='POSITION FLAT • tracking the completed order for its official settlement.';
 else if(lastLiveSettlement&&lastLiveSettlement.ticker!==t.ticker) renderSettlementStatus();
}
async function refreshLiveTradeWindow(){
 if(liveTradeBusy||!liveTicker||!liveMarket)return;
 liveTradeBusy=true;
 try{
   const exchangeIndex=Number.isInteger(liveMarket?.exchangeIndex)?liveMarket.exchangeIndex:undefined;
   const [posResp,balResp]=await Promise.all([
     window.controllerAPI.kalshiPositions(liveTicker,exchangeIndex),
     window.controllerAPI.kalshiBalance(exchangeIndex)
   ]);
   const pos=parseLivePosition(posResp,liveTicker);
   const order=latestLiveOrder(liveTicker);
   const bal=Number(balResp?.balance);
   const entry=order?Number(order.entryPriceCents):null;
   const fee=order?Number(order.averageFeePaid):null;
   const side=pos>0?'UP':(pos<0?'DOWN':(order?.side||null));
   const mark=pos>0?pctPrice(liveMarket?.yesBid):(pos<0?(pctPrice(liveMarket?.yesAsk)!==null?100-pctPrice(liveMarket?.yesAsk):null):null);
   const count=Math.abs(pos)||Number(order?.fillCount||0)||0;
   let pnl=null;
   if(pos!==0&&Number.isFinite(entry)&&Number.isFinite(mark)) pnl=(mark-entry)*count-(Number.isFinite(fee)?fee*100:0);
   const result=String(liveMarket?.result||'').toLowerCase();
   const official=result==='yes'?'UP':(result==='no'?'DOWN':'PENDING');
   if(pos===0&&order&&official!=='PENDING'){
     const win=order.side===official;
     pnl=(win?(100-entry):(-entry))*Number(order.fillCount||order.count||1)-(Number.isFinite(fee)?fee*100:0);
   }
   const close=new Date(liveMarket?.closeTime||liveMarket?.expirationTime||0).getTime();
   const secondsToClose=close?Math.max(0,(close-Date.now())/1000):null;
   liveTrade={ticker:liveTicker,position:pos,side, count,entryCents:Number.isFinite(entry)?entry:null,markCents:Number.isFinite(mark)?mark:null,pnlCents:Number.isFinite(pnl)?pnl:null,balanceCents:Number.isFinite(bal)?bal:null,fee:Number.isFinite(fee)?fee:null,orderId:order?.orderId||null,result:official,secondsToClose,startedAt:order?.timestamp||null,points:liveTrade.ticker===liveTicker?liveTrade.points||[]:[]};
   if(Number.isFinite(mark)){
     const pts=liveTrade.points.slice(-59);
     const values=pts.map(p=>p.value).concat(mark);const min=Math.min(...values),max=Math.max(...values);const span=Math.max(1,max-min);
     liveTrade.points=pts.concat([{x:clamp(((Date.now()-(close-15*60*1000))/(15*60*1000))*100,0,100),y:clamp(((mark-min)/span)*82+8,5,92),value:mark}]);
   }
   renderTradeWindow();
 }catch(e){$('tradeMessage').textContent='LIVE TRADE MONITOR: '+(e?.message||e)}
 finally{liveTradeBusy=false}
}
function autoResetDay(){if(autoDay!==day()){autoDay=day();dailyLossCents=0;}}
function autoSettings(){return {riskPct:clamp(Number($('liveRiskPct').value)||2,0.5,10),maxSpend:Math.max(0.01,Number($('liveMaxSpend').value)||1),maxExposure:Math.max(0.01,Number($('liveMaxExposure').value)||2),dailyLoss:Math.max(0.01,Number($('liveDailyLoss').value)||2),maxEntryPrice:clamp(Number($('liveMaxEntryPrice').value)||85,1,99)}}
function autoPositionFromResponse(p){const list=Array.isArray(p?.market_positions)?p.market_positions:Array.isArray(p?.positions)?p.positions:[];const x=list.find(v=>String(v.ticker||v.market_ticker||'')===liveTicker);if(!x)return null;const pos=Number(x.position_fp??x.position??x.yes_position??0);return Number.isFinite(pos)&&pos!==0?{ticker:liveTicker,yesPosition:pos}:null}
async function refreshDailyLoss(){try{const now=Math.floor(Date.now()/1000),start=new Date();start.setHours(0,0,0,0);const s=await window.controllerAPI.kalshiSettlements({min_ts:Math.floor(start.getTime()/1000),max_ts:now,limit:200});const arr=Array.isArray(s?.settlements)?s.settlements:[];dailyLossCents=Math.max(0,Math.round(arr.reduce((sum,x)=>{const revenue=Number(x.revenue)||0,cost=(Number(x.yes_total_cost)||0)+(Number(x.no_total_cost)||0),fee=Number(String(x.fee_cost||0))*100;return sum+Math.min(0,revenue-cost-fee)},0)));}catch(e){dailyLossCents=0;}}
async function autoReconcile(){if(!autoLive||!liveTicker)return;try{await refreshDailyLoss();const p=await window.controllerAPI.kalshiPositions(liveTicker, Number.isInteger(liveMarket?.exchangeIndex)?liveMarket.exchangeIndex:undefined);autoPosition=autoPositionFromResponse(p);$('autoStatus').textContent=`AUTO LIVE: ${autoLive?'ON':'OFF'} • NO-TRADE: ${noTradeWindow?'ON':'OFF'} • POSITION: ${autoPosition?(autoPosition.yesPosition>0?'YES/UP':'NO/DOWN'):'FLAT'}`;}catch(e){$('autoStatus').textContent='AUTO LIVE: '+e.message}}
function autoEntryPrice(outcome){
  const yesAsk=pctPrice(liveMarket?.yesAsk), noAsk=pctPrice(liveMarket?.noAsk);
  if(outcome==='UP'&&yesAsk!==null)return clamp(Math.ceil(yesAsk),1,99);
  if(outcome==='DOWN'&&noAsk!==null)return clamp(Math.ceil(noAsk),1,99);
  return null;
}
function autoExitPrice(outcome){
  const yesBid=pctPrice(liveMarket?.yesBid), yesAsk=pctPrice(liveMarket?.yesAsk);
  // Exit an UP/YES position by selling YES at the current YES bid.
  if(outcome==='UP'&&yesBid!==null)return clamp(Math.floor(yesBid),1,99);
  // Exit a DOWN/NO position by buying YES at the current YES ask.
  if(outcome==='DOWN'&&yesAsk!==null)return clamp(Math.ceil(yesAsk),1,99);
  return null;
}
function autoLossGuard(){
  // HARD LOSS GUARD: once the live position has lost 80% or more of its
  // entry cost at the executable mark, request a reduce-only exit immediately.
  // This is a safety target, not a guaranteed fill: a fast market can gap
  // through the threshold or have insufficient liquidity.
  if(!autoPosition||!liveTicker)return null;
  const order=latestLiveOrder(liveTicker);
  const entry=Number(order?.entryPriceCents);
  if(!Number.isFinite(entry)||entry<=0)return null;
  const outcome=autoPosition.yesPosition>0?'UP':'DOWN';
  const mark=outcome==='UP'?pctPrice(liveMarket?.yesBid):(pctPrice(liveMarket?.yesAsk)!==null?100-pctPrice(liveMarket?.yesAsk):null);
  if(mark===null)return null;
  const lossPct=Math.max(0,((entry-mark)/entry)*100);
  const flipImminent=(autoPosition.yesPosition>0&&(
      kalshiDirection(liveMarket)==='DOWN' ||
      (Number.isFinite(lastFeature?.marketVelocity)&&lastFeature.marketVelocity<=-1.5) ||
      (Number.isFinite(lastFeature?.btcVelocity)&&lastFeature.btcVelocity<=-1.5)
    ))||(autoPosition.yesPosition<0&&(
      kalshiDirection(liveMarket)==='UP' ||
      (Number.isFinite(lastFeature?.marketVelocity)&&lastFeature.marketVelocity>=1.5) ||
      (Number.isFinite(lastFeature?.btcVelocity)&&lastFeature.btcVelocity>=1.5)
    ));
  return {outcome,entry,mark,lossPct,flipImminent,trigger:lossPct>=80||flipImminent};
}
async function autoOrder(outcome,priceCents,count,reduceOnly=false){
  const side=reduceOnly ? (outcome==='UP'?'ask':'bid') : 'bid';
  // Strategy prices are expressed as the selected outcome's economic price.
  // V2 orders use the YES book, so a DOWN/NO entry is bid YES at 100-NO.
  const orderPrice=(!reduceOnly&&outcome==='DOWN')?clamp(100-priceCents,1,99):clamp(priceCents,1,99);
  const safeCount=autoSingleWindowTicker?1:count;const r=await window.controllerAPI.kalshiAutoOrder({ticker:liveTicker,side,count:safeCount,priceCents:orderPrice,reduceOnly,exchangeIndex:Number.isInteger(liveMarket?.exchangeIndex)?liveMarket.exchangeIndex:-1});
  const filled=Number(r.fill_count??r.fill_count_fp??r.filled_count??0);
  rows.push({id:`${windowId}:AUTO:${Date.now()}`,date:day(),timestamp:new Date().toISOString(),windowId,windowStart,minute,marketTicker:liveTicker,type:reduceOnly?'AUTO_EXIT':'AUTO_ENTRY',side:outcome,priceCents,orderPriceCents:orderPrice,count,fillCount:filled,orderId:r.order_id||'',result:filled>0?'FILLED':'UNFILLED'});
  await persist();return {...r,filled,orderPriceCents:orderPrice}
}
async function autoTradeTick(){
 autoResetDay();
 if(!autoLive||autoBusy||!liveTicker||!liveMarket)return;
 autoBusy=true;
 try{
   const f=calc(),s=autoSettings();
   if(Date.now()-lastLiveAt>7000){$('autoStatus').textContent='AUTO LIVE: PAUSED • STALE KALSHI DATA • NO NEW ENTRY';return}
   if(dailyLossCents>=s.dailyLoss*100){$('autoStatus').textContent='AUTO LIVE: HALTED • DAILY LOSS LIMIT';return}
   await autoReconcile();
   const secs=f.secondsToClose;

   // Dedicated loss/flip guard runs before the broader risk logic. It is
   // intentionally independent of the strategy score so a rapidly reversing
   // position can be flattened even when the score has not caught up.
   const lossGuard=autoLossGuard();
   if(lossGuard?.trigger){
     const p=autoExitPrice(lossGuard.outcome);
     const qty=Math.max(1,Math.floor(Math.abs(autoPosition.yesPosition)));
     const reason=lossGuard.lossPct>=80
       ? `LOSS GUARD ${lossGuard.lossPct.toFixed(0)}% OF ENTRY`
       : 'FLIP GUARD — REVERSAL DETECTED';
     $('autoStatus').textContent=`AUTO LIVE: ${reason} • CLOSING ${lossGuard.outcome}`;
     if(p!==null&&Date.now()-lastAutoActionAt>1500){
       await autoOrder(lossGuard.outcome,p,qty,true);
       lastAutoActionAt=Date.now();
       await autoReconcile();
     }
     return;
   }

   // Continuous mode: a ticker change is a normal rollover, not a reason to
   // disarm. startWindow() resets the per-window entry/no-trade state.
   if(autoRolloverPending){
     autoRolloverPending=false;
     $('autoStatus').textContent=`AUTO LIVE: ON • NEW WINDOW ${liveTicker} • EVALUATING`;
   }

   // Exits have priority. A meaningful reversal/high-risk signal or imminent
   // close flattens an existing position before any new entry is considered.
   if(autoPosition && (f.risk==='HIGH'||f.risk==='CRITICAL'||(autoPosition.yesPosition>0&&f.pick==='DOWN')||(autoPosition.yesPosition<0&&f.pick==='UP')||(secs!==null&&secs<20))){
     const exitOutcome=autoPosition.yesPosition>0?'UP':'DOWN';
     const p=autoExitPrice(exitOutcome);
     const qty=Math.max(1,Math.floor(Math.abs(autoPosition.yesPosition)));
     if(p!==null&&Date.now()-lastAutoActionAt>3000){await autoOrder(exitOutcome,p,qty,true);lastAutoActionAt=Date.now();await autoReconcile()}
     return;
   }

   // Never start a new position in a window while a position from that ticker
   // is still open. The current-window reconcile is the authoritative check.
   if(noTradeWindow||autoEntryDoneTicker===liveTicker)return;
   const kalshiGate=kalshiOnlyLiveGate(f);
   if(kalshiGate){$('autoStatus').textContent='AUTO LIVE: ENTRY BLOCKED • '+kalshiGate;return;}
   if(f.action!=='PAPER READY'||(secs!==null&&secs<90)||f.confidence<65)return;

   const balance=await liveBalance();if(!Number.isFinite(balance))return;
   const budgetCents=Math.floor(Math.min(s.maxSpend*100,(balance*s.riskPct/100),s.maxExposure*100));
   const p=autoEntryPrice(f.pick);
   if(p===null||p>s.maxEntryPrice){$('autoStatus').textContent=`AUTO LIVE: ENTRY BLOCKED • ${p===null?'NO QUOTE':`${p}¢ > ${s.maxEntryPrice.toFixed(0)}¢ MAX ENTRY`}`;return}
   if(budgetCents<p)return;
   const count=Math.max(1,Math.floor(budgetCents/p));
   const result=await autoOrder(f.pick,p,count,false);
   if(result.filled>0){autoEntryDoneTicker=liveTicker;await autoReconcile()}
   lastAutoActionAt=Date.now();
 }catch(e){
   $('autoStatus').textContent='AUTO LIVE ERROR • DISARMED: '+e.message;
   autoLive=false;
   try{await window.controllerAPI.kalshiAutoDisarm()}catch{}
 }finally{autoBusy=false}
}
async function armAuto(){
 try{
   if(!liveTicker||!liveMarket)throw new Error('No active Kalshi contract');
   autoSingleWindowTicker=null;
   autoContinuous=true;
   await window.controllerAPI.kalshiAutoArm();
   autoLive=true;
   noTradeWindow=false;
   autoRolloverPending=false;
   $('autoStatus').textContent=`AUTO LIVE: ON • CONTINUOUS • ${liveTicker} • WINDOW-BY-WINDOW`;
 }catch(e){$('autoStatus').textContent='AUTO ARM ERROR: '+e.message}
}
async function disarmAuto(){autoLive=false;autoSingleWindowTicker=null;autoContinuous=false;autoRolloverPending=false;try{await window.controllerAPI.kalshiAutoDisarm()}catch{}$('autoStatus').textContent='AUTO LIVE: OFF • NO-TRADE: '+(noTradeWindow?'ON':'OFF')}
function toggleNoTrade(){noTradeWindow=!noTradeWindow;$('autoStatus').textContent=`AUTO LIVE: ${autoLive?'ON':'OFF'} • NO-TRADE: ${noTradeWindow?'ON':'OFF'} • POSITION: ${autoPosition?'OPEN':'FLAT'}`;$('noTrade').textContent=noTradeWindow?'ALLOW TRADING THIS WINDOW':'NO-TRADE THIS WINDOW'}
$('autoArm').onclick=armAuto;$('autoDisarm').onclick=disarmAuto;$('noTrade').onclick=toggleNoTrade;
setInterval(autoTradeTick,1500);
setInterval(autoReconcile,5000);