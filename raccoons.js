(() => {
  const deck=document.getElementById('raccoonDeck');
  if(!deck) return;
  const crew=[
    {name:'Scout',role:'scout',x:4,y:20,side:'left',line:'I’m watching the tape.'},
    {name:'Wrench',role:'mechanic',x:78,y:58,side:'right',line:'Systems look good.'},
    {name:'Bandit',role:'bandit',x:46,y:88,side:'bottom',line:'I found something.'}
  ];
  const make=(c,i)=>{
    const el=document.createElement('div');
    el.className='raccoon idle';
    el.dataset.role=c.role;
    el.innerHTML='<div class="tail"></div><div class="body"><div class="belly"></div></div><div class="head"><div class="ear l"></div><div class="ear r"></div><div class="mask"></div><div class="eye l"></div><div class="eye r"></div><div class="snout"><div class="nose"></div><div class="mouth"></div></div></div><div class="arm l"></div><div class="arm r"></div><div class="paw l"></div><div class="paw r"></div><div class="bubble"></div>';
    el.style.left=c.x+'vw'; el.style.top=c.y+'vh';
    el.addEventListener('pointerenter',()=>{el.classList.add('show-bubble','wiggle'); el.querySelector('.bubble').textContent=i===0?'You found me.':i===1?'Keep it running.':'Hey! Watch this!';});
    el.addEventListener('pointerleave',()=>{el.classList.remove('show-bubble','wiggle');});
    el.addEventListener('pointerdown',()=>{el.classList.add('excited','show-bubble');el.querySelector('.bubble').textContent='RACCOON MODE: ON';setTimeout(()=>el.classList.remove('excited'),900);});
    deck.appendChild(el); return el;
  };
  const els=crew.map(make);
  const setState=()=>{
    const action=(document.getElementById('action')?.textContent||'').trim().toUpperCase();
    const risk=(document.getElementById('risk')?.textContent||'').trim().toUpperCase();
    const pick=(document.getElementById('pick')?.textContent||'').trim().toUpperCase();
    const ticker=(document.getElementById('ticker')?.textContent||'').trim();
    els.forEach(e=>e.classList.remove('alert','excited','sleep','point-up','point-down'));
    if(risk.includes('HIGH')||risk.includes('CRITICAL')){
      els[0].classList.add('alert','show-bubble'); els[0].querySelector('.bubble').textContent='Easy… risk is high.';
      els[1].classList.add('alert'); els[2].classList.add('alert');
    } else if(action.includes('PAPER READY')){
      els[0].classList.add('excited'); els[1].classList.add('wiggle'); els[2].classList.add('excited');
      els[0].classList.add('show-bubble'); els[0].querySelector('.bubble').textContent='Signal spotted!';
    } else if(action.includes('WAIT')){
      els[2].classList.add('sleep'); els[2].classList.add('show-bubble'); els[2].querySelector('.bubble').textContent='I’ll wait…';
    }
    if(pick==='UP') els[1].classList.add('point-up');
    if(pick==='DOWN') els[1].classList.add('point-down');
    if(ticker && ticker!=='SEARCHING…') els[0].querySelector('.bubble').textContent='Locked on '+ticker;
  };
  let lastAction='';
  setInterval(()=>{const a=document.getElementById('action')?.textContent||''; if(a!==lastAction){lastAction=a;setState();}},700);
  setState();

  // Ambient crew movement: each raccoon occasionally relocates to another safe edge.
  setInterval(()=>{
    els.forEach((el,i)=>{
      const c=crew[i];
      if(Math.random()<0.55){
        if(i===0){el.style.left=(2+Math.random()*18).toFixed(1)+'vw';el.style.top=(15+Math.random()*28).toFixed(1)+'vh';}
        if(i===1){el.style.left=(68+Math.random()*24).toFixed(1)+'vw';el.style.top=(38+Math.random()*34).toFixed(1)+'vh';}
        if(i===2){el.style.left=(30+Math.random()*40).toFixed(1)+'vw';el.style.top=(78+Math.random()*12).toFixed(1)+'vh';}
        el.classList.add('scurry');
        setTimeout(()=>el.classList.remove('scurry'),1400);
      }
    });
  },7000);
})();