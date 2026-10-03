const $=id=>document.getElementById(id);
let market=null,btc=null,lastProb=null,lastAlertKey='',lead=3,topic=localStorage.getItem('btc15_topic')||'',timer=null,lastTick=Date.now();
const money=n=>Number.isFinite(n)?'$'+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const pct=n=>Number.isFinite(n)?n.toFixed(1)+'%':'—';

function addAlert(msg,type='info',key=''){
  if(key&&key===lastAlertKey)return;
  lastAlertKey=key;
  const box=$('alerts'),e=document.createElement('div');
  e.className='alert-item '+type;
  e.innerHTML='<time>'+new Date().toLocaleTimeString()+'</time>'+msg;
  const empty=box.querySelector('.empty');if(empty)empty.remove();
  box.prepend(e);while(box.children.length>8)box.lastChild.remove();
  notifyExternal(msg,type);
}

async function notifyExternal(msg,type){
  if(topic){try{await fetch('https://ntfy.sh/'+encodeURIComponent(topic),{method:'POST',headers:{Title:'BTC 15-Minute Controller',Priority:type==='danger'?'urgent':type==='good'?'default':'high',Tags:type==='danger'?'warning':type==='good'?'chart_with_upwards_trend':'bell'},body:msg})}catch{}}
  if('Notification'in window&&Notification.permission==='granted'){try{new Notification('BTC 15-Minute Controller',{body:msg,tag:'btc15m'})}catch{}}
}

async function requestNotify(){
  if(!('Notification'in window)){alert('This browser does not support notifications.');return}
  const p=await Notification.requestPermission();
  $('notify').textContent=p==='granted'?'PHONE ALERTS: ON':'ENABLE PHONE ALERTS';
  if(p==='granted')addAlert('Phone alerts enabled.','good','notify-on');
}

async function fetchJSON(url){
  const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r.json();
}

async function refreshBTC(){
  try{
    const [c,k]=await Promise.allSettled([
      fetchJSON('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
      fetchJSON('https://api.kraken.com/0/public/Ticker?pair=XBTUSD')
    ]);
    const a=[];
    if(c.status==='fulfilled')a.push(Number(c.value?.data?.amount));
    if(k.status==='fulfilled'){const key=Object.keys(k.value?.result||{})[0];a.push(Number(k.value?.result?.[key]?.c?.[0]))}
    const p=a.filter(Number.isFinite).sort((x,y)=>x-y);
    btc=p.length?(p.length%2?p[(p.length-1)/2]:(p[p.length/2-1]+p[p.length/2])/2):null;
    if(btc!==null)$('btc').textContent=money(btc);
  }catch{}
}

function targetOf(m){
  for(const x of [m?.floor_strike,m?.strike,m?.floor_strike_dollars]){
    const n=Number(x);if(Number.isFinite(n)&&n>1000)return n;
  }
  const title=String(m?.title||m?.subtitle||'');
  const x=title.match(/\$?([0-9]{5,6}(?:\.[0-9]+)?)/);
  return x?Number(x[1]):null;
}

function probOf(m){
  let y=Number(m?.yes_bid_dollars??m?.yes_bid),a=Number(m?.yes_ask_dollars??m?.yes_ask);
  if(Number.isFinite(y)&&y<=1)y*=100;
  if(Number.isFinite(a)&&a<=1)a*=100;
  if(Number.isFinite(y)&&Number.isFinite(a))return (y+a)/2;
  if(Number.isFinite(y))return y;
  if(Number.isFinite(a))return a;
  return null;
}

function activeMarketFromMarkets(ms){
  const now=Date.now();
  const candidates=(ms||[]).filter(m=>{
    const open=new Date(m.open_time||m.expected_expiration_time||0).getTime();
    const close=new Date(m.close_time||m.expiration_time||m.expected_expiration_time||0).getTime();
    return close>now && (!open || open<=now);
  }).filter(m=>String(m.ticker||'').startsWith('KXBTC15M-'));
  candidates.sort((a,b)=>new Date(a.close_time||a.expiration_time).getTime()-new Date(b.close_time||b.expiration_time).getTime());
  return candidates[0]||null;
}

async function refreshMarket(){
  const urls=[
    'https://external-api.kalshi.com/trade-api/v2/events?limit=50&status=open&with_nested_markets=true&series_ticker=KXBTC15M',
    'https://external-api.kalshi.com/trade-api/v2/markets?limit=200&status=open&series_ticker=KXBTC15M&mve_filter=exclude',
    'https://api.elections.kalshi.com/trade-api/v2/events?limit=50&status=open&with_nested_markets=true&series_ticker=KXBTC15M'
  ];
  let lastError='No active BTC 15M market';
  for(const url of urls){
    try{
      const d=await fetchJSON(url);
      const eventMarkets=(d.events||[]).flatMap(e=>(e.markets||[]).map(m=>({...m,event_ticker:m.event_ticker||e.event_ticker})));
      const found=activeMarketFromMarkets(eventMarkets.length?eventMarkets:d.markets||[]);
      if(!found){lastError='Kalshi returned no currently active BTC 15M market';continue}
      market=found;renderMarket();
      $('liveDot').textContent='LIVE';$('liveDot').style.color='#7ff2b5';
      $('signalText').textContent='Live Kalshi market connected.';
      return;
    }catch(e){lastError=e?.message||lastError}
  }
  $('liveDot').textContent='RETRYING';
  $('liveDot').style.color='';
  $('signalText').textContent='Kalshi market feed retrying…';
}

function renderMarket(){
  if(!market)return;
  const target=targetOf(market),p=probOf(market);
  const close=new Date(market.close_time||market.expiration_time).getTime();
  const open=new Date(market.open_time||close-900000).getTime();
  const remaining=Math.max(0,close-Date.now()),elapsed=Math.max(0,Date.now()-open);
  const mins=Math.floor(remaining/60000),secs=Math.floor((remaining%60000)/1000);
  const up=p??null,down=p!==null?100-p:null;
  const pick=p!==null?(p>=52?'UP':p<=48?'DOWN':'WAIT'):'WAIT';
  const confidence=p!==null?Math.min(94,50+Math.abs(p-50)*1.7):0;
  const distance=target&&btc?Math.abs(btc-target)/target*100:null;
  const risk=remaining<600?'HIGH':distance!==null?(distance<.15?'LOW':'MEDIUM'):'MEDIUM';
  const elapsedWindow=Math.max(1,Math.min(15,Math.ceil(elapsed/60000)));
  $('window').textContent=elapsedWindow+' / 15';
  $('target').textContent=money(target);$('pick').textContent=pick;
  $('confidence').textContent=pct(confidence);$('risk').textContent=risk;
  $('ticker').textContent=market.ticker||'—';
  $('closes').textContent=new Date(close).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  $('prob').textContent=(up??'—')+'% / '+(down??'—');
  $('countdown').textContent=mins+':'+String(secs).padStart(2,'0');
  $('progress').style.width=Math.min(100,elapsed/900000*100)+'%';
  $('score').textContent=(confidence*0.34).toFixed(1);
  $('spread').textContent=(Number.isFinite(p)?'—':'—');
  $('momentum').textContent=btc&&target?(btc>=target?'UP':'DOWN'):'—';
  $('signalTitle').textContent=pick==='WAIT'?'WAIT • MARKET NEUTRAL':pick+' • '+confidence.toFixed(0)+'% CONFIDENCE';
  $('signalText').textContent=pick==='WAIT'?'Kalshi is inside the neutral band; monitoring for a meaningful move.':('BTC is '+(btc>=target?'above':'below')+' target. Kalshi direction is '+pick+'.');
  checkAlerts(remaining,pick,up);lastProb=up;
}

function checkAlerts(rem,pick,up){
  const mins=Math.ceil(rem/60000);
  if(mins<=lead&&mins>=1)addAlert('Window closes in about '+mins+' minute'+(mins===1?'':'s')+'.',mins===1?'warn':'info','close:'+market.ticker+':'+mins);
  if(pick!=='WAIT'&&up!==null)addAlert('Meaningful market direction: '+pick+' ('+up.toFixed(1)+'% YES).','good','dir:'+market.ticker+':'+pick+':'+Math.floor(up));
  if(lastProb!==null&&pick!=='WAIT'&&((lastProb<48&&up>=52)||(lastProb>52&&up<=48)))addAlert('Market reversal detected: '+pick+'.','danger','flip:'+market.ticker+':'+pick);
}

let assistantMessages=[],assistantLastState='monitor',assistantLastAt=0,assistantInitialized=false;
function assistantTime(sec){if(!Number.isFinite(sec))return 'time unavailable';if(sec<60)return Math.max(0,Math.floor(sec))+'s';return Math.floor(sec/60)+'m '+String(Math.floor(sec%60)).padStart(2,'0')+'s'}
function assistantAdd(msg,type='monitor',key='',force=false){const now=Date.now();if(!force&&now-assistantLastAt<3500)return;assistantLastAt=now;assistantMessages.unshift({msg,type,ts:new Date()});assistantMessages=assistantMessages.slice(0,8);const feed=$('assistantFeed');if(feed)feed.innerHTML=assistantMessages.map((m,i)=>'<div class="assistant-msg '+m.type+' '+(i===0?'latest':'')+'"><span class="assistant-msg-time">'+m.ts.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'</span><span class="assistant-msg-text">'+m.msg+'</span></div>').join('')}
function updateAssistant(){const orb=$('assistantOrb');if(!orb)return;const secs=market?Math.max(0,new Date(market.close_time||market.expiration_time).getTime()-Date.now())/1000:null;const pick=$('pick').textContent||'WAIT';const conf=parseFloat($('confidence').textContent)||0;const risk=$('risk').textContent||'—';const up=lastProb;let a;if(!market)a={state:'monitor',headline:'SYSTEM ONLINE • MONITORING ENGINE',context:'Waiting for the first complete market snapshot…',msg:'MONITOR — connecting to the live Kalshi market feed.',type:'monitor'};else if(secs!==null&&secs<20)a={state:'danger',headline:'WINDOW CLOSING • PROTECT POSITION',context:pick+' • '+assistantTime(secs)+' remaining',msg:'CAUTION — less than 20 seconds remain. The controller is prioritizing the window close.',type:'danger'};else if(pick==='WAIT')a={state:'warning',headline:'ENTRY BLOCKED • WAIT',context:'Market neutral • '+assistantTime(secs)+' remaining',msg:'WAIT — the market is inside the neutral band. The assistant will keep monitoring for a meaningful move.',type:'warning'};else if(conf>=65&&risk!=='HIGH')a={state:'buy',headline:'SIGNAL DETECTED • '+pick,context:'Confidence '+conf.toFixed(0)+' • risk '+risk+' • '+assistantTime(secs),msg:'SIGNAL UPDATE — engine direction is '+pick+' with '+conf.toFixed(0)+'% confidence. This is a monitoring signal, not an order.',type:'buy'};else if(risk==='HIGH')a={state:'warning',headline:'HIGH RISK • WAIT',context:pick+' • '+conf.toFixed(0)+'% confidence • '+assistantTime(secs),msg:'WAIT — risk is elevated. The assistant is monitoring rather than treating this as a clean entry.',type:'warning'};else a={state:'monitor',headline:'MONITORING • NO ENTRY',context:'Engine '+pick+' • confidence '+conf.toFixed(0)+' • '+assistantTime(secs),msg:'MONITOR — conditions are developing, but there is no clean entry state.',type:'monitor'};if(a.state!==assistantLastState){assistantLastState=a.state;orb.className='assistant-orb state-'+a.state;$('assistantOrbState').textContent=a.state.toUpperCase();assistantAdd(a.msg,a.type,'',true)}else if(!assistantInitialized||Date.now()-assistantLastAt>12000)assistantAdd(a.msg,a.type,'',true);$('assistantHeadline').textContent=a.headline;$('assistantContext').textContent=a.context;$('assistantData').textContent='ENGINE DATA: '+(market?'LIVE':'WAITING');$('assistantClock').textContent=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});assistantInitialized=true}
function tick(){
  if(market){renderMarket();updateAssistant();}
  if(Date.now()-lastTick>12000){lastTick=Date.now();refreshBTC()}
  if(!market||Date.now()>=new Date(market.close_time||market.expiration_time).getTime())refreshMarket();
}

$('topic').value=topic;
$('notify').onclick=requestNotify;
$('refresh').onclick=()=>{market=null;$('liveDot').textContent='CONNECTING';$('ticker').textContent='SEARCHING…';refreshMarket()};
$('lead').onchange=e=>{lead=Number(e.target.value)};
$('topic').onchange=e=>{topic=e.target.value.trim();localStorage.setItem('btc15_topic',topic)};
$('paper').onclick=e=>{e.target.textContent='PAPER MODE: ON'};

window.addEventListener('load',()=>{
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  refreshBTC();refreshMarket();updateAssistant();
  timer=setInterval(tick,1000);
  setInterval(refreshMarket,15000);
  if('Notification'in window&&Notification.permission==='granted')$('notify').textContent='PHONE ALERTS: ON';
});
