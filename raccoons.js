(() => {
  const deck = document.getElementById('raccoonDeck');
  if (!deck) return;

  const crew = [
    {name:'Scout', role:'scout', targets:['#window','#btcView','#targetView','#ticker']},
    {name:'Wrench', role:'mechanic', targets:['#liveStatus','#paperOrder','#liveExecute','#autoStatus']},
    {name:'Bandit', role:'bandit', targets:['#next','#capture','#paperOrder','#export']}
  ];

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));

  function characterSVG(){
    const ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 220 180');
    svg.classList.add('raccoon-art');
    svg.innerHTML =
      '<defs>'+
      '<linearGradient id="rf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b4aea2"/><stop offset=".5" stop-color="#817d76"/><stop offset="1" stop-color="#5d5a55"/></linearGradient>'+
      '<linearGradient id="rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eee4d1"/><stop offset="1" stop-color="#c9bca8"/></linearGradient>'+
      '<filter id="softShadow"><feGaussianBlur stdDeviation="2.8"/></filter></defs>'+
      '<ellipse class="rac-shadow" cx="111" cy="165" rx="58" ry="7" fill="#000" opacity=".35" filter="url(#softShadow)"/>'+
      '<g class="rac-tail"><path d="M73 122 C42 148,17 137,27 112 C35 92,56 92,79 108" fill="none" stroke="#393734" stroke-width="24" stroke-linecap="round"/><path d="M73 122 C42 148,17 137,27 112 C35 92,56 92,79 108" fill="none" stroke="#a49f96" stroke-width="17" stroke-linecap="round" stroke-dasharray="18 16"/></g>'+
      '<g class="rac-body"><ellipse cx="112" cy="116" rx="48" ry="42" fill="url(#rf)" stroke="#252422" stroke-width="3"/><ellipse class="rac-belly" cx="112" cy="125" rx="29" ry="30" fill="url(#rb)"/></g>'+
      '<g class="rac-leg rac-leg-l"><path d="M83 132 C76 146,77 157,88 161" fill="none" stroke="#3f3d39" stroke-width="14" stroke-linecap="round"/><ellipse cx="88" cy="161" rx="13" ry="6" fill="#e1d7c5" stroke="#252422" stroke-width="2"/></g>'+
      '<g class="rac-leg rac-leg-r"><path d="M136 132 C143 146,144 157,134 161" fill="none" stroke="#3f3d39" stroke-width="14" stroke-linecap="round"/><ellipse cx="134" cy="161" rx="13" ry="6" fill="#e1d7c5" stroke="#252422" stroke-width="2"/></g>'+
      '<g class="rac-arm rac-arm-l"><path d="M76 103 C61 111,59 126,67 135" fill="none" stroke="#66625c" stroke-width="13" stroke-linecap="round"/><ellipse cx="68" cy="136" rx="8" ry="6" fill="#e1d7c5"/></g>'+
      '<g class="rac-arm rac-arm-r"><path d="M148 103 C164 111,165 126,156 136" fill="none" stroke="#66625c" stroke-width="13" stroke-linecap="round"/><ellipse cx="155" cy="137" rx="8" ry="6" fill="#e1d7c5"/></g>'+
      '<g class="rac-head"><path d="M72 78 Q74 42 111 37 Q148 42 151 78 L145 104 Q112 122 79 104Z" fill="url(#rf)" stroke="#252422" stroke-width="3"/>'+
      '<path d="M82 58 L82 38 Q91 27 101 41 L101 55 M121 55 L121 41 Q132 27 141 39 L140 59" fill="#918c84" stroke="#252422" stroke-width="3" stroke-linejoin="round"/>'+
      '<ellipse cx="91" cy="43" rx="7" ry="5" fill="#d4a4a0"/><ellipse cx="132" cy="43" rx="7" ry="5" fill="#d4a4a0"/>'+
      '<path d="M78 68 Q111 50 145 68 Q145 88 111 91 Q78 88 78 68Z" fill="#292826"/>'+
      '<ellipse class="rac-eye rac-eye-l" cx="96" cy="73" rx="6" ry="7" fill="#ffd86a"/><ellipse class="rac-eye rac-eye-r" cx="126" cy="73" rx="6" ry="7" fill="#ffd86a"/>'+
      '<ellipse cx="111" cy="90" rx="19" ry="13" fill="#eee4d1"/><ellipse cx="111" cy="86" rx="7" ry="4.5" fill="#1c1b1a"/>'+
      '<path class="rac-mouth" d="M103 94 Q111 101 119 94" fill="none" stroke="#252422" stroke-width="2.5" stroke-linecap="round"/></g>';
    return svg;
  }

  function make(c){
    const el=document.createElement('div');
    el.className='raccoon v3';
    el.dataset.role=c.role;
    el.innerHTML='<div class="rac-scene"></div><div class="bubble"></div>';
    el.querySelector('.rac-scene').appendChild(characterSVG());
    deck.appendChild(el);
    return el;
  }

  const els=crew.map(make);

  function rectFor(sel){
    const n=document.querySelector(sel);
    if(!n)return null;
    const r=n.getBoundingClientRect();
    return r.width>2&&r.height>2?r:null;
  }

  function targetPoint(sel,i){
    const r=rectFor(sel);
    if(!r)return null;
    const p=[
      [r.left+r.width*.50-85,r.top-104,-3],
      [r.left+r.width*.22-85,r.top+r.height*.50-90,90],
      [r.right-12,r.top+r.height*.50-90,-90],
      [r.left+r.width*.70-85,r.bottom-42,0]
    ][i%4];
    return p;
  }

  function setXY(el,x,y,instant=false){
    const w=170,h=145,p=5;
    x=clamp(x,p,innerWidth-w-p); y=clamp(y,p,innerHeight-h-p);
    if(instant)el.style.transition='none';
    el.style.left=x+'px'; el.style.top=y+'px';
    if(instant)requestAnimationFrame(()=>el.style.transition='');
  }

  function moveTo(el,pt,duration=1250){
    if(!pt)return Promise.resolve();
    el.style.setProperty('--travel-rot',pt[2]+'deg');
    el.style.transitionDuration=duration+'ms';
    el.classList.add('traveling');
    setXY(el,pt[0],pt[1]);
    return wait(duration);
  }

  function pose(el,name){
    el.dataset.pose=name;
    el.classList.remove('walking','climbing','sitting','peeking','tapping','watching','alerting','celebrate');
    if(name)el.classList.add(name);
  }

  function say(el,text,show=true){
    const b=el.querySelector('.bubble');
    b.textContent=text;
    el.classList.toggle('show-bubble',show);
  }

  function state(){
    const t=id=>(document.getElementById(id)?.textContent||'').trim().toUpperCase();
    return {action:t('action'),risk:t('risk'),pick:t('pick'),ticker:t('ticker')};
  }

  function reaction(el,who){
    const s=state();
    if(s.risk.includes('HIGH')||s.risk.includes('CRITICAL')){pose(el,'alerting');say(el,who.role==='bandit'?'I’m hiding.':'Risk spike!',true);return;}
    if(s.action.includes('PAPER READY')){pose(el,'celebrate');say(el,'Signal spotted!',true);return;}
    if(s.pick==='UP'){pose(el,'watching');say(el,'UP.',false);return;}
    if(s.pick==='DOWN'){pose(el,'watching');say(el,'DOWN.',false);return;}
    pose(el,'watching');say(el,'',false);
  }

  async function routine(el,who,index){
    el.classList.add('visible');
    let n=0;
    while(document.body.contains(el)){
      reaction(el,who);
      const pt=targetPoint(who.targets[n%who.targets.length],n);
      if(pt){
        pose(el,'walking');
        say(el,index===0?'Checking BTC…':index===1?'Working the panel…':'What’s this button?',true);
        await moveTo(el,pt,1200+((n*173)%400));
        pose(el,n%4===0?'climbing':n%4===1?'sitting':n%4===2?'peeking':'tapping');
        await wait(1100+((n*137)%700));
        say(el,'',false);
      }
      n++;
      await wait(450);
    }
  }

  let phase=0;
  function frame(now){
    phase=now*.001;
    els.forEach((el,i)=>{
      const svg=el.querySelector('.raccoon-art'); if(!svg)return;
      const sway=Math.sin(phase*2.1+i*1.7)*1.7;
      const breathe=Math.sin(phase*2.7+i)*1.4;
      const body=svg.querySelector('.rac-body'),head=svg.querySelector('.rac-head'),tail=svg.querySelector('.rac-tail');
      const al=svg.querySelector('.rac-arm-l'),ar=svg.querySelector('.rac-arm-r'),ll=svg.querySelector('.rac-leg-l'),lr=svg.querySelector('.rac-leg-r');
      if(body)body.style.transform='translateY('+breathe.toFixed(2)+'px) rotate('+sway.toFixed(2)+'deg)';
      if(head)head.style.transform='translateY('+(-breathe*.45).toFixed(2)+'px) rotate('+(-sway*.45).toFixed(2)+'deg)';
      if(tail)tail.style.transform='rotate('+(Math.sin(phase*2.4+i)*7).toFixed(2)+'deg)';
      if(el.classList.contains('walking')){
        const step=Math.sin(phase*12+i);
        if(al)al.style.transform='rotate('+(step*18).toFixed(1)+'deg)';
        if(ar)ar.style.transform='rotate('+(-step*18).toFixed(1)+'deg)';
        if(ll)ll.style.transform='rotate('+(-step*16).toFixed(1)+'deg)';
        if(lr)lr.style.transform='rotate('+(step*16).toFixed(1)+'deg)';
        if(body)body.style.transform+=' scaleY('+(1+Math.abs(step)*.025).toFixed(3)+')';
      }else{
        if(al)al.style.transform=''; if(ar)ar.style.transform=''; if(ll)ll.style.transform=''; if(lr)lr.style.transform='';
      }
    });
    requestAnimationFrame(frame);
  }

  let resizeTimer;
  addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>els.forEach((el,i)=>{const pt=targetPoint(crew[i].targets[0],0);if(pt)setXY(el,pt[0],pt[1]);}),120);
  });

  els.forEach((el,i)=>{
    setXY(el,40+i*190,120+i*30,true);
    el.addEventListener('pointerenter',()=>{el.classList.add('attention');say(el,i===0?'I see it.':i===1?'On it.':'Found you!',true);});
    el.addEventListener('pointerleave',()=>el.classList.remove('attention'));
  });

  requestAnimationFrame(frame);
  els.forEach((el,i)=>routine(el,crew[i],i));
})();