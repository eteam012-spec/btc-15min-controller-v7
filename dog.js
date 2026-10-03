(() => {
  const deck = document.getElementById('dogDeck');
  if (!deck) return;
  const ns='http://www.w3.org/2000/svg';
  const wrap=document.createElement('div');
  wrap.className='dog-mascot';
  wrap.innerHTML='<div class="dog-bubble"></div>';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 260 210');
  svg.classList.add('dog-art');
  svg.innerHTML=`
    <defs>
      <linearGradient id="dogBlack" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#303236"/><stop offset=".45" stop-color="#111316"/><stop offset="1" stop-color="#050608"/></linearGradient>
      <radialGradient id="dogChest"><stop offset="0" stop-color="#fbfbf7"/><stop offset=".8" stop-color="#d7d7d2"/><stop offset="1" stop-color="#a8aaa6"/></radialGradient>
      <filter id="dogGlow"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <ellipse cx="132" cy="196" rx="76" ry="9" fill="#000" opacity=".55" filter="url(#dogGlow)"/>
    <path class="dog-tail" d="M62 138 C25 165,22 125,48 116" fill="none" stroke="#090a0c" stroke-width="18" stroke-linecap="round"/>
    <path class="dog-body" d="M66 91 Q104 66 163 87 Q194 103 185 153 Q174 178 123 178 Q72 175 58 144Z" fill="url(#dogBlack)" stroke="#030406" stroke-width="4"/>
    <path class="dog-chest" d="M110 104 Q137 91 159 110 Q164 139 145 168 Q122 173 106 153 Q99 130 110 104Z" fill="url(#dogChest)" opacity=".96"/>
    <path class="dog-leg dog-leg-l" d="M84 140 Q77 168 82 187" fill="none" stroke="#0a0b0d" stroke-width="18" stroke-linecap="round"/>
    <path class="dog-leg dog-leg-r" d="M157 140 Q164 169 159 187" fill="none" stroke="#0a0b0d" stroke-width="18" stroke-linecap="round"/>
    <ellipse cx="82" cy="188" rx="15" ry="9" fill="#f2f2ee" stroke="#08090b" stroke-width="3"/>
    <ellipse cx="159" cy="188" rx="15" ry="9" fill="#f2f2ee" stroke="#08090b" stroke-width="3"/>
    <path class="dog-head" d="M72 88 Q70 39 119 29 Q171 34 182 84 L169 116 Q128 135 87 113Z" fill="url(#dogBlack)" stroke="#030406" stroke-width="4"/>
    <path d="M78 58 Q66 28 91 18 Q112 25 109 53Z" fill="#0a0b0d" stroke="#030406" stroke-width="4"/>
    <path d="M145 51 Q153 22 179 28 Q194 40 177 65Z" fill="#0a0b0d" stroke="#030406" stroke-width="4"/>
    <path d="M84 74 Q126 50 169 73 Q164 104 128 109 Q92 103 84 74Z" fill="#07080a"/>
    <ellipse class="dog-eye dog-eye-l" cx="105" cy="75" rx="6" ry="7" fill="#e9f6ff"/>
    <ellipse class="dog-eye dog-eye-r" cx="148" cy="75" rx="6" ry="7" fill="#e9f6ff"/>
    <ellipse cx="127" cy="94" rx="23" ry="17" fill="#d8d9d5"/>
    <ellipse cx="127" cy="89" rx="10" ry="6" fill="#020304"/>
    <path class="dog-mouth" d="M112 101 Q127 111 142 101" fill="none" stroke="#050608" stroke-width="3" stroke-linecap="round"/>
    <path class="dog-ear dog-ear-l" d="M82 55 Q76 36 91 29" fill="none" stroke="#4a4d52" stroke-width="4" opacity=".55"/>
    <path class="dog-ear dog-ear-r" d="M166 52 Q174 37 180 39" fill="none" stroke="#4a4d52" stroke-width="4" opacity=".55"/>
  `;
  wrap.querySelector('.dog-bubble').textContent='Monitoring…';
  wrap.insertBefore(svg,wrap.firstChild);
  deck.appendChild(wrap);

  const bubble=wrap.querySelector('.dog-bubble');
  const say=(text,show=true)=>{bubble.textContent=text;wrap.classList.toggle('show-bubble',show)};
  const state=()=>{
    const t=id=>(document.getElementById(id)?.textContent||'').trim().toUpperCase();
    return {action:t('action'),risk:t('risk'),pick:t('pick'),confidence:t('confidence')};
  };
  const react=()=>{
    const s=state();
    if(s.risk.includes('HIGH')||s.risk.includes('CRITICAL')){wrap.dataset.state='alert';say('Watch the risk!',true);}
    else if(s.action.includes('PAPER READY')){wrap.dataset.state='ready';say(s.pick+' signal.',true);}
    else if(s.pick==='UP'){wrap.dataset.state='up';say('Watching UP.',false);}
    else if(s.pick==='DOWN'){wrap.dataset.state='down';say('Watching DOWN.',false);}
    else{wrap.dataset.state='monitor';say('Monitoring…',false);}
  };
  wrap.addEventListener('click',()=>{react();say('I’m on it.',true);setTimeout(()=>react(),1800)});
  setInterval(react,2500);
  let t=0,last=performance.now();
  function frame(now){
    const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;
    const breathe=Math.sin(t*2.1)*1.3,tail=Math.sin(t*2.5)*8;
    const body=svg.querySelector('.dog-body'),head=svg.querySelector('.dog-head'),tailEl=svg.querySelector('.dog-tail'),legs=svg.querySelectorAll('.dog-leg');
    body.style.transform=`translateY(${breathe}px) scale(${1+Math.abs(breathe)*.003})`;
    head.style.transform=`rotate(${Math.sin(t*1.7)*1.2}deg) translateY(${breathe*.35}px)`;
    tailEl.style.transform=`rotate(${tail/4}deg)`;
    legs[0].style.transform=`rotate(${Math.sin(t*2.1)*2}deg)`;
    legs[1].style.transform=`rotate(${-Math.sin(t*2.1)*2}deg)`;
    if(Math.sin(t*.65)>.995){svg.querySelectorAll('.dog-eye').forEach(e=>e.style.transform='scaleY(.12)');setTimeout(()=>svg.querySelectorAll('.dog-eye').forEach(e=>e.style.transform=''),90)}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();