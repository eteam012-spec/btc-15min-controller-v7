(() => {
  const deck = document.getElementById('raccoonDeck');
  if (!deck) return;

  /*
   * Raccoon Crew v2
   * These are DOM-built characters, not stickers/emoji.
   * Each crew member treats real controller elements as scenery:
   * they climb panel edges, sit on cards, peek around controls and tap buttons.
   * The body is split into head/body/arms/legs/tail so motion can be fluid.
   */

  const crew = [
    {
      name:'Scout',
      role:'scout',
      home:'#window',
      path:['#window','#btcView','#targetView','#ticker'],
      lines:{
        idle:'Scanning the window…',
        up:'UP signal.',
        down:'DOWN signal.',
        ready:'Signal spotted.',
        risk:'Easy… risk is high.'
      }
    },
    {
      name:'Wrench',
      role:'mechanic',
      home:'#liveStatus',
      path:['#liveStatus','#paperOrder','#refreshContract','#autoStatus'],
      lines:{
        idle:'Checking the machinery.',
        up:'That quote moved.',
        down:'Watching the downside.',
        ready:'System ready.',
        risk:'I do not like that risk.'
      }
    },
    {
      name:'Bandit',
      role:'bandit',
      home:'#next',
      path:['#next','#capture','#paperOrder','#export'],
      lines:{
        idle:'I found a button.',
        up:'Hey! UP.',
        down:'Hey! DOWN.',
        ready:'Let’s see what happens.',
        risk:'Nope. I’m hiding.'
      }
    }
  ];

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));

  function make(c){
    const el=document.createElement('div');
    el.className='raccoon idle';
    el.dataset.role=c.role;
    el.innerHTML =
      '<div class="tail"></div>' +
      '<div class="body"><div class="belly"></div></div>' +
      '<div class="head"><div class="ear l"></div><div class="ear r"></div><div class="mask"></div>' +
        '<div class="eye l"></div><div class="eye r"></div>' +
        '<div class="snout"><div class="nose"></div><div class="mouth"></div></div>' +
      '</div>' +
      '<div class="leg l"></div><div class="leg r"></div>' +
      '<div class="arm l"></div><div class="arm r"></div>' +
      '<div class="hand l"></div><div class="hand r"></div>' +
      '<div class="paw l"></div><div class="paw r"></div>' +
      '<div class="bubble"></div>';
    deck.appendChild(el);
    return el;
  }

  const els=crew.map(make);

  function rectFor(selector){
    const el=document.querySelector(selector);
    if(!el) return null;
    const r=el.getBoundingClientRect();
    if(r.width<2 || r.height<2) return null;
    return r;
  }

  function setPos(el,x,y,instant=false){
    const pad=8;
    const maxX=Math.max(pad,window.innerWidth-112-pad);
    const maxY=Math.max(pad,window.innerHeight-104-pad);
    if(instant) el.style.transition='none';
    else el.style.transition='';
    el.style.left=clamp(x,pad,maxX)+'px';
    el.style.top=clamp(y,pad,maxY)+'px';
    if(instant) requestAnimationFrame(()=>el.style.transition='');
  }

  function onTop(el,selector,offset=0){
    const r=rectFor(selector); if(!r)return false;
    setPos(el,r.left+r.width*.50-56,r.top-67+offset);
    return true;
  }
  function onBottom(el,selector,offset=0){
    const r=rectFor(selector); if(!r)return false;
    setPos(el,r.left+r.width*.68-56,r.bottom-25+offset);
    return true;
  }
  function onLeft(el,selector,offset=0){
    const r=rectFor(selector); if(!r)return false;
    setPos(el,r.left-76,r.top+r.height*.48-52+offset);
    return true;
  }
  function onRight(el,selector,offset=0){
    const r=rectFor(selector); if(!r)return false;
    setPos(el,r.right-34,r.top+r.height*.50-52+offset);
    return true;
  }

  function bubble(el,text,show=true){
    const b=el.querySelector('.bubble');
    if(!b)return;
    b.textContent=text;
    el.classList.toggle('show-bubble',show);
  }

  function pose(el,classes){
    el.classList.remove('walk','climb','peek','sit','tap','excited','alert','point-up','point-down','sleep');
    classes.split(' ').filter(Boolean).forEach(c=>el.classList.add(c));
  }

  async function travel(el,to,mode='walk',ms=900){
    pose(el,mode);
    el.style.transitionDuration=Math.max(250,ms)+'ms';
    to();
    await wait(ms);
  }

  function state(){
    return {
      action:(document.getElementById('action')?.textContent||'').trim().toUpperCase(),
      risk:(document.getElementById('risk')?.textContent||'').trim().toUpperCase(),
      pick:(document.getElementById('pick')?.textContent||'').trim().toUpperCase(),
      ticker:(document.getElementById('ticker')?.textContent||'').trim()
    };
  }

  function reaction(c,el){
    const s=state();
    const high=s.risk.includes('HIGH')||s.risk.includes('CRITICAL');
    const ready=s.action.includes('PAPER READY');
    const line=high?c.lines.risk:ready?c.lines.ready:(s.pick==='UP'?c.lines.up:s.pick==='DOWN'?c.lines.down:c.lines.idle);
    bubble(el,line,high||ready);
    if(high) pose(el,'alert');
    else if(ready) pose(el,'excited');
    else if(s.pick==='UP') pose(el,'point-up idle');
    else if(s.pick==='DOWN') pose(el,'point-down idle');
    else pose(el,'idle');
  }

  async function scoutLoop(el){
    el.classList.add('visible');
    while(document.body.contains(el)){
      reaction(crew[0],el);
      if(onTop(el,'#window')){pose(el,'climb');bubble(el,'Climbing the window…',true);await wait(1300);}
      if(onTop(el,'#btcView')){pose(el,'sit');bubble(el,'Checking BTC.',true);await wait(1600);}
      if(onRight(el,'#btcView',-6)){pose(el,'peek');await wait(1100);}
      if(onTop(el,'#targetView')){pose(el,'sit');bubble(el,'Comparing target.',true);await wait(1600);}
      if(onLeft(el,'#ticker',-8)){pose(el,'peek');bubble(el,'Locked on the contract.',true);await wait(1500);}
      bubble(el,'',false);
      await wait(800);
    }
  }

  async function wrenchLoop(el){
    el.classList.add('visible');
    while(document.body.contains(el)){
      reaction(crew[1],el);
      if(onRight(el,'#liveStatus',-12)){pose(el,'climb');bubble(el,'Climbing the panel.',true);await wait(1500);}
      if(onTop(el,'#paperOrder')){pose(el,'sit');bubble(el,'Checking PAPER.',true);await wait(1200);}
      if(onTop(el,'#refreshContract',-4)){pose(el,'sit');bubble(el,'Keeping the contract fresh.',true);await wait(1300);}
      if(onLeft(el,'#autoStatus',-4)){pose(el,'peek');bubble(el,'Watching AUTO LIVE.',true);await wait(1300);}
      bubble(el,'',false);
      await wait(900);
    }
  }

  async function banditLoop(el){
    el.classList.add('visible');
    while(document.body.contains(el)){
      reaction(crew[2],el);
      if(onBottom(el,'#next',-7)){pose(el,'climb');bubble(el,'Hanging off NEXT MINUTE.',true);await wait(1200);}
      if(onTop(el,'#capture',-3)){pose(el,'sit');bubble(el,'I caught the signal.',true);await wait(1300);}
      if(onTop(el,'#paperOrder',-2)){pose(el,'tap');bubble(el,'Tap tap… paper only.',true);await wait(1500);}
      if(onTop(el,'#export',-2)){pose(el,'sit');bubble(el,'Records secured.',true);await wait(1200);}
      bubble(el,'',false);
      await wait(850);
    }
  }

  function watchEngine(){
    let last='';
    setInterval(()=>{
      const s=state();
      const key=s.action+'|'+s.risk+'|'+s.pick+'|'+s.ticker;
      if(key===last)return;
      last=key;
      els.forEach((el,i)=>reaction(crew[i],el));

      if(s.risk.includes('HIGH')||s.risk.includes('CRITICAL')){
        els[0].classList.add('alert'); bubble(els[0],crew[0].lines.risk,true);
        els[1].classList.add('alert'); bubble(els[1],crew[1].lines.risk,true);
        els[2].classList.add('peek'); bubble(els[2],crew[2].lines.risk,true);
      }
    },500);
  }

  // If the window is resized or the tablet changes orientation, the crew
  // immediately re-aligns to the controller rather than floating in space.
  let resizeTimer;
  addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      if(onTop(els[0],'#btcView')){}
      if(onRight(els[1],'#liveStatus',-12)){}
      if(onBottom(els[2],'#next',-7)){}
    },180);
  });

  // Start at the actual controller structure, then run the three different
  // personalities. No random teleporting: every move has a destination.
  setPos(els[0],18,120,true);
  setPos(els[1],window.innerWidth-150,window.innerHeight*.55,true);
  setPos(els[2],window.innerWidth*.45,window.innerHeight-130,true);
  els.forEach(e=>e.classList.add('visible'));

  watchEngine();
  scoutLoop(els[0]);
  wrenchLoop(els[1]);
  banditLoop(els[2]);
})();