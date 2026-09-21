(() => {
  const deck=document.getElementById('raccoonDeck');
  if(!deck)return;

  const W=132,H=112, PAD=10, GAP=7;
  const crew=[
    {name:'Scout',role:'scout',targets:['#btcView','#targetView','#window','#ticker']},
    {name:'Wrench',role:'mechanic',targets:['#liveStatus','#paperOrder','#liveExecute','#autoStatus']},
    {name:'Bandit',role:'bandit',targets:['#next','#capture','#paperOrder','#export']}
  ];

  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function characterSVG(){
    const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');
    s.setAttribute('viewBox','0 0 220 180');s.classList.add('raccoon-art');
    s.innerHTML='<defs>'+
      '<linearGradient id="rf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c2bbae"/><stop offset=".48" stop-color="#88837b"/><stop offset="1" stop-color="#5f5b56"/></linearGradient>'+
      '<linearGradient id="rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1e8d7"/><stop offset="1" stop-color="#c8baa5"/></linearGradient>'+
      '<filter id="softShadow"><feGaussianBlur stdDeviation="2.8"/></filter></defs>'+
      '<ellipse class="rac-shadow" cx="111" cy="165" rx="58" ry="7" fill="#000" opacity=".35" filter="url(#softShadow)"/>'+
      '<g class="rac-tail"><path d="M73 122 C42 148,17 137,27 112 C35 92,56 92,79 108" fill="none" stroke="#393734" stroke-width="24" stroke-linecap="round"/><path d="M73 122 C42 148,17 137,27 112 C35 92,56 92,79 108" fill="none" stroke="#aaa49a" stroke-width="17" stroke-linecap="round" stroke-dasharray="18 16"/></g>'+
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
    return s;
  }

  function make(c){
    const el=document.createElement('div');
    el.className='raccoon v4';el.dataset.role=c.role;
    el.innerHTML='<div class="rac-scene"></div><div class="bubble"></div>';
    el.querySelector('.rac-scene').appendChild(characterSVG());
    deck.appendChild(el);
    return el;
  }
  const els=crew.map(make);

  function rect(sel){
    const n=document.querySelector(sel);if(!n)return null;
    const r=n.getBoundingClientRect();
    return r.width>3&&r.height>3?r:null;
  }

  function uiObstacles(){
    const out=[];
    document.querySelectorAll('main header,.card,.panel,.marketbar,.feed,.alert,button,input,select').forEach(n=>{
      if(n.closest('#raccoonDeck'))return;
      const r=n.getBoundingClientRect();
      if(r.width>3&&r.height>3&&r.bottom>0&&r.right>0&&r.left<innerWidth&&r.top<innerHeight)out.push(r);
    });
    return out;
  }

  function overlap(x,y,r){
    return uiObstacles().some(o=>x<GAP+o.right&&x+W>o.left-GAP&&y<GAP+o.bottom&&y+H>o.top-GAP);
  }

  function candidatePoints(target){
    const r=rect(target);if(!r)return [];
    const cx=r.left+r.width/2,cy=r.top+r.height/2;
    return [
      [cx-W/2,r.top-H-GAP,-2],
      [cx-W/2,r.bottom+GAP,2],
      [r.left-W-GAP,cy-H/2,-90],
      [r.right+GAP,cy-H/2,90],
      [r.left+GAP,r.top-H-GAP,-5],
      [r.right-W-GAP,r.top-H-GAP,5],
      [r.left+GAP,r.bottom+GAP,5],
      [r.right-W-GAP,r.bottom+GAP,-5]
    ].map(p=>({x:clamp(p[0],PAD,innerWidth-W-PAD),y:clamp(p[1],PAD,innerHeight-H-PAD),rot:p[2]}));
  }

  function safePoint(target,index){
    const pts=candidatePoints(target).filter(p=>!overlap(p.x,p.y));
    if(pts.length)return pts[index%pts.length];
    // If the UI is dense, use a guaranteed screen gutter rather than covering a control.
    const gutters=[
      {x:PAD,y:PAD,rot:0},{x:innerWidth-W-PAD,y:PAD,rot:0},
      {x:PAD,y:innerHeight-H-PAD,rot:0},{x:innerWidth-W-PAD,y:innerHeight-H-PAD,rot:0}
    ];
    return gutters.find(p=>!overlap(p.x,p.y))||gutters[0];
  }

  function setXY(el,x,y,instant=false){
    x=clamp(x,PAD,innerWidth-W-PAD);y=clamp(y,PAD,innerHeight-H-PAD);
    if(instant){el.style.transition='none';el.style.left=x+'px';el.style.top=y+'px';requestAnimationFrame(()=>el.style.transition='');return;}
    el.style.left=x+'px';el.style.top=y+'px';
  }

  function moveTo(el,p,duration=1800){
    if(!p)return Promise.resolve();
    el.style.setProperty('--travel-rot',p.rot+'deg');
    el.style.transitionDuration=duration+'ms';
    el.classList.add('traveling');
    setXY(el,p.x,p.y);
    return wait(duration);
  }

  function pose(el,name){
    el.dataset.pose=name;
    el.classList.remove('walking','climbing','sitting','peeking','tapping','watching','alerting','celebrate');
    if(name)el.classList.add(name);
  }

  function say(el,text,show=true){
    const b=el.querySelector('.bubble');b.textContent=text;el.classList.toggle('show-bubble',show);
  }

  function state(){
    const t=id=>(document.getElementById(id)?.textContent||'').trim().toUpperCase();
    return {action:t('action'),risk:t('risk'),pick:t('pick')};
  }

  function reaction(el,who){
    const s=state();
    if(s.risk.includes('HIGH')||s.risk.includes('CRITICAL')){pose(el,'alerting');say(el,who.role==='bandit'?'Uh-oh…':'Risk spike!',true);return;}
    if(s.action.includes('PAPER READY')){pose(el,'celebrate');say(el,'Signal spotted!',true);return;}
    pose(el,'watching');say(el,s.pick==='UP'?'UP.':s.pick==='DOWN'?'DOWN.':'',false);
  }

  async function routine(el,who,index){
    el.classList.add('visible');
    let n=index;
    while(document.body.contains(el)){
      reaction(el,who);
      const p=safePoint(who.targets[n%who.targets.length],n);
      pose(el,'walking');
      say(el,index===0?'Checking BTC…':index===1?'Working the panel…':'Checking that control…',true);
      await moveTo(el,p,1850+((n*137)%550));
      // A short physical interaction at the edge: lean, reach, then settle.
      pose(el,n%4===0?'climbing':n%4===1?'peeking':n%4===2?'tapping':'sitting');
      await wait(1450+((n*181)%800));
      say(el,'',false);
      n++;
      await wait(700+((n*97)%700));
    }
  }

  const actors=els.map((el,i)=>({el,i,phase:i*2.07,last:performance.now()}));
  function T(node,rot,x=0,y=0,sx=1,sy=1){
    if(!node)return;
    node.style.transform='translate3d('+x.toFixed(2)+'px,'+y.toFixed(2)+'px,0) rotate('+rot.toFixed(2)+'deg) scale('+sx.toFixed(4)+','+sy.toFixed(4)+')';
  }

  function frame(now){
    actors.forEach(a=>{
      const dt=Math.min(.05,(now-a.last)/1000);a.last=now;a.phase+=dt;
      const t=a.phase,el=a.el,svg=el.querySelector('.raccoon-art');if(!svg)return;
      const gait=Math.sin(t*10.5+a.i*1.4),gait2=Math.sin(t*10.5+a.i*1.4+Math.PI);
      const breath=Math.sin(t*2.15+a.i)*1.05,sway=Math.sin(t*1.55+a.i)*1.15;
      const walking=el.classList.contains('walking'),climbing=el.classList.contains('climbing'),tapping=el.classList.contains('tapping'),alerting=el.classList.contains('alerting'),celebrate=el.classList.contains('celebrate');
      const body=svg.querySelector('.rac-body'),head=svg.querySelector('.rac-head'),tail=svg.querySelector('.rac-tail'),al=svg.querySelector('.rac-arm-l'),ar=svg.querySelector('.rac-arm-r'),ll=svg.querySelector('.rac-leg-l'),lr=svg.querySelector('.rac-leg-r');
      if(walking){
        T(body,sway+gait*1.1,0,breath-Math.abs(gait)*1.5,1+Math.abs(gait)*.012,1-Math.abs(gait)*.012);
        T(head,-sway*.45-gait*.8,0,-breath*.5-Math.abs(gait)*.7,1,1);
        T(tail,-gait*8,gait2*1.2,0,1,1);
        T(al,gait*17);T(ar,gait2*17);T(ll,gait2*14);T(lr,gait*14);
      }else if(climbing){
        const q=Math.sin(t*3.6+a.i);
        T(body,sway,0,breath,1.015,.99);T(head,-sway*.5,0,-breath*.3,1,1);
        T(tail,q*9,0,0,1,1);T(al,-52+q*12);T(ar,52-q*12);T(ll,18-q*8);T(lr,-18+q*8);
      }else if(tapping){
        const q=Math.sin(t*7.2+a.i);
        T(body,sway,0,breath,1,1);T(head,-sway*.5,0,breath*.2,1,1);
        T(tail,q*6);T(al,-10);T(ar,58+q*16,0,Math.max(0,q)*3,1,1);T(ll,0);T(lr,0);
      }else if(celebrate){
        const q=Math.sin(t*4.2+a.i);
        T(body,q*2,0,-Math.max(0,q)*5,1+Math.max(0,q)*.025,1-Math.max(0,q)*.02);
        T(head,-q*2,0,-Math.max(0,q)*2,1,1);T(tail,q*12);T(al,-35+q*18);T(ar,35-q*18);T(ll,q*9);T(lr,-q*9);
      }else if(alerting){
        const q=Math.sin(t*11+a.i);
        T(body,q*1.2,0,breath,1,1);T(head,q*3,0,0,1,1);T(tail,q*15);T(al,-8);T(ar,8);T(ll,0);T(lr,0);
      }else{
        T(body,sway,0,breath,1,1);T(head,-sway*.5,0,-breath*.35,1,1);T(tail,Math.sin(t*1.8+a.i)*6);T(al,Math.sin(t*1.25+a.i)*3);T(ar,Math.sin(t*1.25+a.i+1)*3);T(ll,0);T(lr,0);
      }
      const eyes=svg.querySelectorAll('.rac-eye');
      if(eyes.length){
        const blink=(Math.sin(t*.7+a.i*2.1)>.985)?0.08:1;
        eyes.forEach(e=>e.style.transform='scaleY('+blink+')');
      }
    });
    requestAnimationFrame(frame);
  }

  let resizeTimer;
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>els.forEach((el,i)=>{const p=safePoint(crew[i].targets[0],i);setXY(el,p.x,p.y);}),150);});

  els.forEach((el,i)=>{
    const p=safePoint(crew[i].targets[0],i);
    setXY(el,p.x,p.y,true);
    el.addEventListener('pointerenter',()=>{el.classList.add('attention');say(el,i===0?'I see it.':i===1?'On it.':'Found you!',true);});
    el.addEventListener('pointerleave',()=>el.classList.remove('attention'));
  });

  requestAnimationFrame(frame);
  els.forEach((el,i)=>routine(el,crew[i],i));
})();