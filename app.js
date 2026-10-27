import {dynamicStrategy} from './engine.mjs';
import {analyzeFeed,feedAge} from './market-engine.mjs';
'use strict';
const V='fc27desk_v5', F='https://fc27-market-proxy.pk4r5rj7mn.workers.dev';
const $=id=>document.getElementById(id);
const n=x=>Math.round(x||0).toLocaleString('pl-PL');
const fmtPercent=x=>Number.isFinite(x)?`${x>0?'+':''}${x.toFixed(1).replace('.',',')}%`:'—';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(id){try{return JSON.parse(localStorage.getItem(id)||'{}')}catch{return {}}}
const last=load(V),previous=load('fc27desk_v4'),previous2=load('fc27desk_v2');
const state={balance:Number(last.balance??previous.balance??previous2.balance??320000),workerUrl:last.workerUrl||previous.workerUrl||F,
  history:last.history||{},payload:null,model:null,lastError:null,busy:false,filter:'all',lastFetch:null};
function save(){try{localStorage.setItem(V,JSON.stringify({balance:state.balance,workerUrl:state.workerUrl,history:state.history}))}catch{}}
function strategy(){const s=dynamicStrategy(state.balance),b=state.balance;
 $('balance-display').innerHTML=n(b)+' <span>◉</span>';
 $('tier').textContent=s.tier;
 $('max-position').textContent=n(b*.5)+'+';
 $('strategy-title').textContent='Plan: '+s.tier;
 $('strategy-text').textContent=`${s.focus}. Dla salda ${n(b)} oceniamy tanie flipy i większe pozycje. Nie kupujemy po samym spadku. `+
  'Karta za 150k może być sensowna, ale zajmuje niemal połowę portfela.';
 const items=[['Szybkie flipy (orientacyjnie 30%)',.30],['Inwestycje 1–3 dni (30%)',.30],['Rezerwa (40%)',.40]];
 $('strategy-blocks').innerHTML=items.map(([title,p])=>`<div class="strategy-item"><span>${title}</span><strong>${n(b*p)}</strong></div>`).join('');
}
function fmtTime(value){const t=Date.parse(value||'');return Number.isFinite(t)?new Date(t).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'brak daty';}
function noteHistory(m){const id=String(m.id||`${m.name}-${m.rating}`),t=Date.parse(m.publishedAt||'');
 if(!Number.isFinite(t)||!Number.isFinite(m.price)||t>Date.now()+120000)return;
 const a=state.history[id]||[];
 if(!a.some(x=>Math.abs(x[0]-t)<10*60000))a.push([t,m.price]);
 state.history[id]=a.filter(x=>x[0]>=Date.now()-14*86400000).sort((x,y)=>x[0]-y[0]).slice(-140);
}
function moverCard(m){const a=m.analysis,kind=a.kind,change=m.changePercent,down=change<0;
 const isAlert=['spike','crash'].includes(kind),className=down?'bearish':'';
 const link=m.url&&/^https:\/\/futzip\.com\//.test(m.url)?`<a class="textbtn" href="${safe(m.url)}" target="_blank" rel="noopener noreferrer">Karta FUTZIP ↗</a>`:'';
 return `<article class="signal ${className}" data-move="${safe(m.id)}" tabindex="0" role="button">
 <div class="signal-top"><div class="who"><div class="avatar">${safe(m.name.slice(0,2).toUpperCase())}</div><div><strong>${safe(m.name)}</strong><small>${n(m.rating)} OVR · konsola · ${fmtTime(m.publishedAt)}</small></div></div><span class="tag ${isAlert?'risk':'watch'}">${safe(a.kind==='budget'?'POZA BUDŻETEM':down?'SPADEK':'WZROST')}</span></div>
 <div class="stats"><div><small>Odczyt ceny</small><strong>${n(m.price)}</strong></div><div><small>Zmiana w 24h</small><strong class="${down?'negative':'positive'}">${fmtPercent(change)}</strong></div><div><small>Poprzednio</small><strong>${n(m.previousPrice)}</strong></div></div>
 <p class="reason">${safe(a.title)}. Ekspozycja na saldo: ${fmtPercent(a.exposure*100)}.</p>
 <div class="signal-foot"><span>Ryzyko koncentracji: ${safe(a.risk)}</span><span>${link||'Kliknij: szczegóły'}</span></div>
 <p class="block-note">Nie jest to potwierdzona okazja ani prognoza. Wzrost/spadek już nastąpił.</p>
 </article>`;
}
function filteredMovers(movers){return movers.filter(m=>state.filter==='all'||
 (state.filter==='falls'&&m.changePercent<0)||
 (state.filter==='rises'&&m.changePercent>0)||
 (state.filter==='premium'&&m.price>=50000)||
 (state.filter==='budget'&&!m.analysis.available));}
function renderNews(id,list,count){$(id).innerHTML=list.length?list.slice(0,count).map(item=>{
 const url=item.url&&/^https:\/\/futzip\.com\//.test(item.url)?` <a href="${safe(item.url)}" target="_blank" rel="noopener noreferrer">Źródło ↗</a>`:'';
 return `<div class="news-item"><strong>${safe(item.title)}</strong><small class="time">${fmtTime(item.publishedAt)}${url}</small><small>${safe(item.description)}</small></div>`;
 }).join(''):'<div class="empty">Brak wpisów z tego kanału.</div>';
}
function render(){strategy();
 $('refresh').disabled=state.busy;
 $('refresh').textContent=state.busy?'⏳ Pobieram 3 kanały RSS…':'↻   Odśwież rynek FUTZIP';
 const m=state.model;
 $('data-pill').textContent=state.busy?'◌ Pobieram':state.lastError?'! Błąd':m&&m.usable?'● FUTZIP • aktywny':m?'! Dane opóźnione':'○ Gotowy';
 $('data-pill').className='pill '+(state.lastError||(m&&!m.usable)?'warn':'');
 $('freshness-strip').hidden=!(state.lastError||(m&&!m.usable));
 $('freshness-strip').textContent=state.lastError|| (m&&!m.usable?`Kanał zmian cen ma ${m.age===null?'nieznany wiek':Math.round(m.age)+' min'}. Wstrzymano ocenę bieżącej sytuacji (>90 min lub błąd).`:'');
 if(!m){$('market-summary').textContent='Naciśnij przycisk powyżej. Skan pokaże ruchy z ostatnich 24 godzin, nowe karty i SBC.';
 $('cards').innerHTML='<div class="empty">Nie pobrano jeszcze danych z FUTZIP.</div>';return;}
 const mv=filteredMovers(m.movers);
 $('market-summary').textContent=`${m.movers.length} zmian cen • feed aktualizowany ${fmtTime(m.feedSummary.movers?.updatedAt)} (${m.age===null?'brak godziny':Math.round(m.age)+' min temu'}). ${m.usable?'Wyniki do analizy — nie rekomendacje zakupu.':'Dane nie są wystarczająco aktualne do oceny.'}`;
 $('cards').innerHTML=!m.usable?'<div class="empty">Źródło ruchów cen jest za stare do wyświetlania jako bieżący rynek. Spróbuj ponownie później.</div>':mv.length?mv.slice(0,50).map(moverCard).join(''):'<div class="empty">Brak pasujących kart w bieżącym zestawie RSS. Źródło publikuje tylko wybrane ruchy cen.</div>';
 $('cards').querySelectorAll('[data-move]').forEach(el=>el.onclick=e=>{if(e.target.closest('a'))return;showMover(el.dataset.move)});
 $('cards').querySelectorAll('[data-move]').forEach(el=>el.onkeydown=e=>{if(e.key==='Enter')showMover(el.dataset.move)});
 renderNews('new-cards',m.newCards,8);renderNews('live-sbcs',m.sbcs,10);
 const statuses=Object.entries(m.feedSummary).map(([k,v])=>`${k}: ${v.status} (${v.count??'?'} wpisów), aktualizacja: ${fmtTime(v.updatedAt)}`).join('\n');
 $('source-detail').textContent=`Źródło: FUTZIP RSS (konsola)\nOstatnia próba: ${fmtTime(m.checkedAt)}\n${statuses}\nHistoria zapisywana tylko na tym urządzeniu; nie jest to pełny feed cen.\n`+
  'Wyniki RSS dotyczą ruchów, które już miały miejsce; brak informacji o dostępnych ofertach EA.';
}
function showMover(id){const m=state.model?.movers.find(x=>String(x.id)===String(id));if(!m)return;
 const a=m.analysis;
 $('card-detail').innerHTML=`<div class="eyebrow">RUCH CEN • FUTZIP</div><h2>${safe(m.name)} ${m.rating}</h2>
 <div class="details-sub">Odczyt ${fmtTime(m.publishedAt)} · rynek PS/Xbox</div>
 <div class="detail-grid"><div class="detail-cell"><small>Aktualna cena feedu</small><strong>${n(m.price)}</strong></div><div class="detail-cell"><small>Poprzednia cena</small><strong>${n(m.previousPrice)}</strong></div><div class="detail-cell"><small>Zmiana zakończona</small><strong>${fmtPercent(m.changePercent)}</strong></div><div class="detail-cell"><small>Ryzyko portfela</small><strong>${safe(a.risk)}</strong></div></div>
 <div class="list-note"><strong>Interpretacja:</strong> ${safe(a.title)}. Wypatrzony ruch ceny nie oznacza, że taka oferta kupna istnieje teraz.</div>
 <div class="list-note"><strong>Próg hipotetycznego flipa:</strong> jeśli dałoby się sprzedać po ok. ${n(a.assumedSell)} (tylko przyjęcie do rachunku), zakup nie powinien przekroczyć ${n(a.maxBid)}, aby uzyskać ok. ${n(a.profit)} netto po 5% podatku. To filtr, nie wykryta okazja.</div>
 <div class="list-note"><strong>Historia:</strong> lokalnie zapisane ${state.history[String(m.id)]?.length||0} odczytów. Bez wystarczającej historii nie prognozujemy wzrostu za 1–7 dni.</div>`;
 $('card-modal').showModal();
}
async function refresh(){if(state.busy)return;state.busy=true;state.lastError=null;
 $('status-note').textContent='Łączę się z Workerem i sprawdzam daty RSS…';render();
 try {let timer;const ac=new AbortController();timer=setTimeout(()=>ac.abort(),25000);
 let response;try{response=await fetch(state.workerUrl.replace(/\/$/,'')+'/scan?t='+Date.now(),{signal:ac.signal,cache:'no-store'});}finally{clearTimeout(timer)}
 const payload=await response.json();if(!response.ok)throw Error('Worker HTTP '+response.status+' — '+(payload.error||'brak dostępnych kanałów'));
 const model=analyzeFeed(payload,state.balance);
 state.model=model;state.payload=payload;state.lastFetch=Date.now();
 for(const m of model.movers)noteHistory(m);save();
 $('status-note').textContent=model.usable?`Skan ukończony: ${model.movers.length} ruchów, ${model.newCards.length} nowych kart, ${model.sbcs.length} SBC. Sprawdź sygnały, nie kupuj po samym ruchu ceny.`:'Feed zwrócił dane, ale nie są dostatecznie świeże do interpretacji rynku.';
 }catch(err){state.lastError=String(err.message||err);$('status-note').textContent='Nie udało się pobrać danych. Nie pokazujemy wymyślonych cen.';}
 finally{state.busy=false;render()}
}
function calc(){const b=Number($('calc-buy').value),s=Number($('calc-sell').value);$('calc-output').textContent=b>0&&s>0?`Podatek EA: ${n(Math.floor(s*.05))} • Zysk netto: ${n(s-Math.floor(s*.05)-b)} coins • ROI: ${fmtPercent((s-Math.floor(s*.05)-b)/b*100)}`:'Podaj poprawne ceny.';}
$('refresh').onclick=refresh;
$('edit-balance').onclick=()=>{const raw=prompt('Saldo coinsów:',String(state.balance));if(raw===null)return;const value=Number(raw.replace(/[\s\u00a0]/g,''));if(!Number.isFinite(value)||value<0||value>100000000)return alert('Błędne saldo');state.balance=value;save();if(state.payload)state.model=analyzeFeed(state.payload,value);render();};
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden};
$('worker-url').value=state.workerUrl;
$('save-settings').onclick=()=>{try{const url=new URL($('worker-url').value.trim());if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev'))throw Error('Wymagany https://...workers.dev');state.workerUrl=url.origin;save();$('settings').hidden=true;render();}catch(err){alert(err.message)}};
document.querySelectorAll('[data-filter]').forEach(el=>el.onclick=()=>{state.filter=el.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===el));render()});
$('close-modal').onclick=()=>$('card-modal').close();
for(const id of ['calc-buy','calc-sell'])$(id).addEventListener('input',calc);
$('export-data').onclick=()=>{const rows=['card_id,timestamp,price'];Object.entries(state.history).forEach(([id,ps])=>ps.forEach(([t,p])=>rows.push(`${JSON.stringify(id)},${new Date(t).toISOString()},${p}`)));const blob=new Blob([rows.join('\n')],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fc27-market-pulse-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)};
const ev=[['29','PAŹ','Rivals Rewards','Większa podaż kart; analizuj reakcję rynku, nie zakładaj automatycznie dołka'],['30','PAŹ','Nowe promo','Możliwe zwiększenie podaży; weryfikuj przeceny względem dotychczasowych cen'],['01','LIS','Squad Battles','Potencjalne zmiany cen po nagrodach']];
$('events').innerHTML=ev.map(x=>`<div class="event"><div class="datebox"><strong>${x[0]}</strong><small>${x[1]}</small></div><div><strong>${x[2]}</strong><p>${x[3]}</p></div></div>`).join('');
document.querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>document.querySelector(el.dataset.jump).scrollIntoView({behavior:'smooth'}));
calc();render();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js?v=5.0.0',{updateViaCache:'none'}).catch(()=>{});
let start=null;addEventListener('touchstart',e=>{start=scrollY<3?e.touches?.[0]?.clientY:null},{passive:true});addEventListener('touchend',e=>{if(start!==null&&e.changedTouches[0].clientY-start>110)refresh();start=null},{passive:true});
