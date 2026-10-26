import {dynamicStrategy,priceAnalysis} from './engine.mjs';
'use strict';
const STORE='fc27desk_v4',OLD_STORE='fc27desk_v2', $=id=>document.getElementById(id);
const money=x=>Math.round(x||0).toLocaleString('pl-PL');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=x=>x===null||!Number.isFinite(x)?'—':`${(x>0?'+':'')}${x.toFixed(1).replace('.',',')}%`;
function storeRead(key){try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return{}}}
const existing=storeRead(STORE),old=storeRead(OLD_STORE);
const state={balance:Number(existing.balance??old.balance??320000),workerUrl:existing.workerUrl||'',history:existing.history||{},quotes:[],view:'all',busy:false,lastFetch:null,lastError:null,failed:[],sourceAt:null};
function save(){try{localStorage.setItem(STORE,JSON.stringify({balance:state.balance,workerUrl:state.workerUrl,history:state.history}))}catch(e){$('source-detail').textContent='Nie udało się zapisać historii na urządzeniu: '+e.message}}
function strategyRender(){const strat=dynamicStrategy(state.balance);
 $('balance-display').innerHTML=money(state.balance)+' <span>◉</span>';$('tier').textContent=strat.tier;
 $('max-position').textContent=money(state.balance*strat.weight);$('strategy-title').textContent=`Plan: ${strat.tier}`;
 const a=state.balance;
 document.getElementById('strategy-text').textContent=`Automatycznie: ${strat.focus}. Oceniamy każdą kartę, która mieści się w saldzie. Droższe pozycje wymagają większego marginesu bezpieczeństwa.`;
 const bands=[{t:'Quick flipping / mass bid',frac:.24},{t:'Eventowe inwestycje 1–3 dni',frac:.32},{t:'Rezerwa na nowe SBC / promocje',frac:.44}];
 document.getElementById('strategy-blocks').innerHTML=bands.map(b=>`<div class="strategy-item"><span>${b.t}</span><strong>${money(a*b.frac)}</strong></div>`).join('');
}
function record(q){const key=String(q.id);const t=Date.parse(q.updatedAt);if(!Number.isFinite(t)||!Number.isFinite(q.price)||t>Date.now()+120000)return;
 const points=state.history[key]||[];const close=points.some(p=>Math.abs(p[0]-t)<10*60000);
 if(!close)points.push([t,q.price]);state.history[key]=points.filter(p=>p[0]>=Date.now()-14*86400000).sort((a,b)=>a[0]-b[0]).slice(-200);}
function evaluated(){return state.quotes.map(q=>({...q,analysis:priceAnalysis(q,state.history[q.id]||[],state.balance)}))
 .sort((a,b)=>b.analysis.score-a.analysis.score||a.price-b.price);}
function cardElement(c){const a=c.analysis;const badge={candidate:'SCENARIUSZ',flip:'QUICK FLIP',risk:'TREND SPADKOWY',stale:'STARE DANE',budget:'POZA BUDŻETEM',monitor:'OBSERWUJ'}[a.signal];
 return `<article class="signal ${a.signal==='candidate'?'good':a.falling?'bearish':''}" data-card="${esc(c.id)}" tabindex="0" role="button">
  <div class="signal-top"><div class="who"><div class="avatar">${esc(c.name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase())}</div><div><strong>${esc(c.name)}</strong><small>${c.rating||'—'} OVR · FUTBIN PS/Xbox · ${Math.round(a.age)} min temu</small></div></div><span class="tag ${a.signal==='candidate'?'good':a.signal==='risk'?'risk':a.signal==='budget'?'budget':'watch'}">${badge}</span></div>
  <div class="stats"><div><small>Cena referencyjna</small><strong>${money(c.price)}</strong></div><div><small>24h</small><strong>${percent(a.p24)}</strong></div><div><small>7 dni</small><strong>${percent(a.p7)}</strong></div></div>
  <p class="reason">${esc(a.why)}</p><div class="quick-limit"><div><small>Limit zakupu do flipa</small><strong>${money(a.targetBid)}</strong></div><div style="text-align:right"><small>Potencjał netto przy limicie*</small><strong>+${money(a.possibleFlipProfit)}</strong></div></div><div class="signal-foot"><span>Ekspozycja ${percent(a.exposure*100)}</span><span>Ryzyko: ${a.risk}</span></div>
  <p class="block-note">*To nie jest wykryta oferta. Limit wyliczony z ceny referencyjnej, a sprzedaż nie jest gwarantowana.</p>
 </article>`;
}
function render(){strategyRender();
 $('data-pill').textContent=state.busy?'◌ Pobieram':state.lastError?'! Błąd źródła':state.quotes.length?'● Notowania pobrane':'○ Nie połączono';
 $('data-pill').className='pill '+(state.lastError||!state.quotes.length?'warn':'');
 $('refresh').disabled=state.busy;$('refresh').textContent=state.busy?'⏳ Pobieram strony i sprawdzam ceny…':'↻   Pobierz świeże ceny i analizuj';
 const e=evaluated(),filtered=e.filter(c=>state.view==='all'||c.analysis.signal===state.view);
 $('market-summary').textContent=state.lastFetch?`${e.length} kart; ${e.filter(c=>c.analysis.fresh).length} ze świeżą ceną. ${e.filter(c=>c.analysis.signal==='candidate').length} scenariuszy odbicia, ${e.filter(c=>c.analysis.signal==='flip').length} kart o stabilniejszej cenie.`:'Przed pierwszym skanem — historia zacznie zapisywać się automatycznie po każdym pobraniu.';
 $('cards').innerHTML=filtered.length?filtered.map(cardElement).join(''):'<div class="empty">'+(state.lastError?'Źródło nie zwróciło wiarygodnych cen. Zobacz szczegóły poniżej.':'Brak kart w wybranej kategorii. Zmiana filtra nie wymaga kolejnego pobrania.')+'</div>';
 document.querySelectorAll('[data-card]').forEach(el=>el.addEventListener('click',()=>show(el.dataset.card)));
 $('freshness-strip').hidden=!state.lastError;$('freshness-strip').textContent=state.lastError||'';
 $('source-detail').textContent=state.lastError?`BŁĄD: ${state.lastError}\nAdres: ${state.workerUrl||'nie skonfigurowano'}\nNie tworzymy cen zastępczych. Jeśli FUTBIN blokuje dostęp, Worker powinien zwrócić błąd.`:
    state.lastFetch?`Pobranie: ${new Date(state.lastFetch).toLocaleString('pl-PL')}\nŹródło: FUTBIN przez Cloudflare Worker\nKarty: ${state.quotes.length}\nNieodczytane strony: ${state.failed.length}\nHistoria jest na tym urządzeniu (lokalna), nie jest synchronizowana z innymi telefonami.`:'Worker: '+(state.workerUrl||'niepodłączony');
}
function show(id){const c=evaluated().find(x=>x.id===id);if(!c)return;const a=c.analysis;
 $('card-detail').innerHTML=`<div class="eyebrow">ANALIZA KARTY</div><h2>${esc(c.name)}</h2><div class="details-sub">FUTBIN · ${esc(c.url)} · ${Math.round(a.age)} min od notowania</div>
 <div class="detail-grid"><div class="detail-cell"><small>Cena dziś</small><strong>${money(c.price)}</strong></div><div class="detail-cell"><small>Zakup / maks. quick flip</small><strong>${money(a.targetBid)}</strong></div><div class="detail-cell"><small>Sprzedaż referencyjna −1,5%</small><strong>${money(a.quickSell)}</strong></div><div class="detail-cell"><small>Zysk po podatku przy zakupie ≤ limit</small><strong>+${money(a.possibleFlipProfit)}</strong></div></div>
 <div class="list-note"><strong>Wniosek:</strong> ${esc(a.why)}</div>
 <div class="list-note">Historia: ${a.historyCount} punktów w ostatnich 14 dniach. 24h: ${percent(a.p24)} • 7d: ${percent(a.p7)}. ${a.possibleRecovery?`<strong>Scenariusz powrotu do lokalnego poziomu:</strong> ${money(a.potentialSell)} i ${money(a.potentialProfit)} netto. NIE jest to prognoza.`:'Brak dowodu na prawdopodobne odbicie w 1–3 dni.'}</div>
 <div class="list-note">Udział w saldzie: ${percent(a.exposure*100)}. Ryzyko koncentracji: ${a.risk}. Cena z FUTBIN nie oznacza, że istnieje dostępna aukcja po tej kwocie.</div>
 <div class="btnline"><a class="secondary" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" style="text-align:center">Otwórz na FUTBIN ↗</a></div>`;
 $('card-modal').showModal();}
function showSource(){if(!state.workerUrl){$('settings').hidden=false;$('worker-url').focus();}}
async function refresh(){if(state.busy)return;
 if(!state.workerUrl){state.lastError='Najpierw jednorazowo podłącz adres darmowego Workera w ustawieniach źródła.';showSource();render();return;}
 state.busy=true;state.lastError=null;$('status-note').textContent='Pobieram stronę FUTBIN teraz, nie korzystam ze starego feedu…';render();
 try{const controller=new AbortController(),tid=setTimeout(()=>controller.abort(),50000);
  let res;try{res=await fetch(state.workerUrl.replace(/\/$/,'')+'/scan?count=16&t='+Date.now(),{cache:'no-store',signal:controller.signal});}finally{clearTimeout(tid);}
  const payload=await res.json();if(!res.ok)throw Error(payload.error||payload.errors?.[0]||`Worker HTTP ${res.status}`);
  if(!Array.isArray(payload.cards)||!payload.cards.length)throw Error('Nie pobrano poprawnych kart. Sprawdź źródło.');
  if(payload.platform!=='console'||payload.source!=='FUTBIN')throw Error('Źródło nie wskazuje rynku konsolowego FUTBIN');
  const clean=payload.cards.filter(c=>c.id&&c.name&&Number.isFinite(c.price)&&c.price>=200&&Number.isFinite(Date.parse(c.updatedAt))&&Date.now()-Date.parse(c.updatedAt)<=45*60000&&Date.now()-Date.parse(c.updatedAt)>=-2*60000);
  if(!clean.length)throw Error('Wszystkie notowania były nieaktualne, brak poprawnych czasów aktualizacji.');
  state.quotes=clean;state.lastFetch=Date.now();state.failed=payload.errors||[];
  for(const q of clean)record(q);save();
  $('status-note').textContent=`Odświeżono ${clean.length} cen. Historia zapisuje się automatycznie; po kilku sesjach porównamy schematy.`;
 }catch(e){state.lastError=String(e.message||e);$('status-note').textContent='Nie udało się pobrać bieżących cen. Nie wyświetlam fikcyjnych rekomendacji.';state.quotes=[];}
 finally{state.busy=false;render();}
}
function calc(){const buy=Number($('calc-buy').value),sell=Number($('calc-sell').value),tax=Math.floor(sell*.05),profit=sell-tax-buy;
 $('calc-output').textContent=buy>0&&sell>0?`Podatek EA: ${money(tax)} • Zysk netto: ${profit>0?'+':''}${money(profit)} coins • ROI: ${percent(profit/buy*100)}`:'Podaj poprawne ceny.';}
$('edit-balance').onclick=()=>{const s=prompt('Aktualne saldo coinsów:',String(state.balance));if(s===null)return;const v=Number(s.replaceAll(' ',''));if(!Number.isFinite(v)||v<0||v>100000000)return alert('Nieprawidłowe saldo');state.balance=v;save();render()};
$('refresh').onclick=refresh;
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden};
$('save-settings').onclick=()=>{const value=$('worker-url').value.trim().replace(/\/$/,'');try{const u=new URL(value);if(u.protocol!=='https:'||(!u.hostname.endsWith('.workers.dev')&&!u.hostname.endsWith('.pages.dev')&&!u.hostname.endsWith('.cloudflareworkers.com')))throw Error('Oczekiwany HTTPS Cloudflare Worker (*.workers.dev)');state.workerUrl=u.origin;save();state.lastError=null;$('settings').hidden=true;render();}catch(e){alert('Niepoprawny adres. '+e.message)}};
$('worker-url').value=state.workerUrl;
for(const el of document.querySelectorAll('[data-filter]'))el.onclick=()=>{state.view=el.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===el));render()};
$('close-modal').onclick=()=>$('card-modal').close();
for(const id of ['calc-buy','calc-sell'])$(id).addEventListener('input',calc);
$('export-data').onclick=()=>{const rows=['id,timestamp,price'];for(const [id,ps]of Object.entries(state.history))for(const [t,p] of ps)rows.push(`${id},${new Date(t).toISOString()},${p}`);const blob=new Blob([rows.join('\n')],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fc27-trading-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)};
const ev=[['29','PAŹ','Rivals Rewards','Podaż po nagrodach; weryfikujemy, czy następuje odbicie'],['30','PAŹ','Nowa promocja','Więcej paczek może obniżyć ceny części kart'],['01','LIS','Squad Battles','Potencjalna podaż po nagrodach, nie pewna przecena']];$('events').innerHTML=ev.map(x=>`<div class="event"><div class="datebox"><strong>${x[0]}</strong><small>${x[1]}</small></div><div><strong>${x[2]}</strong><p>${x[3]}</p></div></div>`).join('');
for(const el of document.querySelectorAll('[data-jump]'))el.onclick=()=>document.querySelector(el.dataset.jump).scrollIntoView({behavior:'smooth'});
calc();render();if(!state.workerUrl)$('settings').hidden=false;
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js?v=4.0.0',{updateViaCache:'none'}).catch(()=>{});
let touchStart=null;window.addEventListener('touchstart',e=>{touchStart=window.scrollY<4?e.touches?.[0]?.clientY:null},{passive:true});window.addEventListener('touchend',e=>{if(touchStart!==null&&e.changedTouches[0].clientY-touchStart>110)refresh();touchStart=null},{passive:true});
