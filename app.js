import {dynamicStrategy} from './engine.mjs';
import {analyzeFeed} from './market-engine.mjs';
import {rankOpportunities,proceeds,pnl,positionValue} from './investment-engine.mjs';
import {historySignal,catalystMatches,exitSignal,labelCatalyst} from './signal-engine.mjs';
'use strict';
const VERSION='fc27desk_v7', DEFAULT_WORKER='https://fc27-market-proxy.pk4r5rj7mn.workers.dev';
const $=id=>document.getElementById(id);
const n=x=>Math.round(Number(x)||0).toLocaleString('pl-PL');
const pct=x=>Number.isFinite(x)?`${x>0?'+':''}${x.toFixed(1).replace('.',',')}%`:'—';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}};
const legacy=load('fc27desk_v5'), prev=load('fc27desk_v4'), v6=load('fc27desk_v6'), own=load(VERSION);
const recovered = Object.keys(own).length ? own : v6;
const normalName = text => String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const state={balance:Number(recovered.balance??legacy.balance??prev.balance??320000),workerUrl:recovered.workerUrl||legacy.workerUrl||prev.workerUrl||DEFAULT_WORKER,
 history:recovered.history||legacy.history||{}, positions:Array.isArray(recovered.positions)?recovered.positions:[], sales:Array.isArray(recovered.sales)?recovered.sales:[],
 model:null, ranked:[], filter:'candidates', lastError:null, busy:false, selectedSale:null};
// Migration only once. Known user position was already purchased BEFORE this version.
// Starting balance is whatever the user currently has; no double subtraction.
if (!own.migratedV7) {
 const hadSzoboszlai=state.positions.some(x=>normalName(x.name).includes('szoboszlai'))||state.sales.some(x=>normalName(x.name).includes('szoboszlai'));
 if(!hadSzoboszlai) state.positions.push({
  uid:'reported_szoboszlai_20261023',name:'Dominik Szoboszlai',rating:86,version:'Gold',quantity:1,
  buyPrice:7000,approxBuyPrice:true,url:'',date:'2026-10-23',
  status:'listed',listingPrice:16000,listingDate:'2026-10-27',alreadyOwned:true,
  thesis:'Objective z wymogiem Węgra: potencjalny opóźniony popyt po Champions. Hipoteza użytkownika.'
 });
}
function save(){try{localStorage.setItem(VERSION,JSON.stringify({balance:state.balance,workerUrl:state.workerUrl,history:state.history,positions:state.positions,sales:state.sales,migratedV7:true}))}catch(e){$('status-note').textContent='Nie mogę zapisać danych na urządzeniu. Sprawdź miejsce i ustawienia przeglądarki.'}}
function fmtTime(s){if(/^\d{4}-\d{2}-\d{2}$/.test(s||''))return `${s.slice(8,10)}.${s.slice(5,7)}`;let t=Date.parse(s||'');return Number.isFinite(t)?new Date(t).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}
function strategy(){const b=state.balance,s=dynamicStrategy(b);
 $('balance-display').innerHTML=n(b)+' <span>◉</span>';
 $('tier').textContent=s.tier;
 $('max-position').textContent=n(Math.floor(b*.5))+'+';
 $('strategy-title').textContent='Plan: '+s.tier;
 $('strategy-text').textContent=`${s.focus}. Aplikacja nie odrzuca automatycznie kart za 100–200k. Przy większej ekspozycji wymaga mocniejszych dowodów i ostrożniejszej ceny wejścia.`;
 const allocated=[['Szybkie flipy · 30%',.30],['Pozycje 1–3 dni · 30%',.30],['Rezerwa i okazje · 40%',.40]];
 $('strategy-blocks').innerHTML=allocated.map(([l,w])=>`<div class="strategy-item"><span>${safe(l)}</span><strong>${n(Math.floor(b*w))}</strong></div>`).join('');
}
function noteHistory(m){const id=String(m.id),stamp=Date.parse(m.publishedAt||'');if(!Number.isFinite(stamp)||!Number.isFinite(m.price)||stamp>Date.now()+120000)return;
 let obs=state.history[id]||[];
 if(!obs.some(x=>Math.abs(x[0]-stamp)<10*60000))obs.push([stamp,m.price]);
 state.history[id]=obs.filter(x=>x[0]>=Date.now()-14*86400000).sort((a,b)=>a[0]-b[0]).slice(-170);
}
function getCurrentQuote(pos){
 if(!state.model?.usable)return null;
 const exact=state.model?.movers.find(m=>m.url&&pos.url&&m.url===pos.url&&m.rating===pos.rating);
 const pn=normalName(pos.name);
 const candidates=(state.model?.movers||[]).filter(m=>{const mn=normalName(m.name);return (mn===pn||pn.endsWith(' '+mn)||mn.endsWith(' '+pn))&&Number(m.rating)===Number(pos.rating);});
 const found=exact||(candidates.length===1?candidates[0]:null);
 if(!found)return null;
 const age=(Date.now()-Date.parse(found.publishedAt))/60000;
 return Number.isFinite(age)&&age<=120&&age>=-2?found:null;
}
function renderPortfolio(){
 const p=state.positions, realised=state.sales.reduce((s,v)=>s+Number(v.profit||0),0);
 const known=p.map(pos=>({pos,quote:getCurrentQuote(pos)}));
 const marketWorth=known.length&&known.every(x=>x.quote)?known.reduce((s,x)=>s+proceeds(x.quote.price)*x.pos.quantity,0):null;
 const cost=p.reduce((s,x)=>s+x.buyPrice*x.quantity,0);
 const pending=p.filter(pos=>pos.status==='listed');
 $('portfolio-summary').innerHTML=`<div><small>Koszt otwartych pozycji</small><strong>${n(cost)}</strong></div><div><small>Zysk zrealizowany</small><strong class="${realised<0?'negative':'positive'}">${realised>0?'+':''}${n(realised)}</strong></div><div><small>Pozycje wystawione</small><strong>${pending.length} / ${p.length}</strong></div>`;
 $('portfolio-alerts').innerHTML=pending.length?`<div class="owned-alert"><strong>Na liście transferowej: ${pending.length} ${pending.length===1?'pozycja':'pozycje'}</strong><p>Wystawienie nie oznacza sprzedaży. Saldo zwiększy się dopiero po potwierdzeniu transakcji.</p></div>`:'';
 $('portfolio-cards').innerHTML=p.length?p.map(pos=>{
 const quote=getCurrentQuote(pos),profit=quote?positionValue(pos,quote.price):null;
 const listing=pos.status==='listed'&&pos.listingPrice>0;
 const projected=listing?pnl(pos.buyPrice,pos.listingPrice,pos.quantity):null;
 const exit=exitSignal(pos,quote,quote?state.history[String(quote.id)]||[]:[]);
 const catalysts=catalystMatches(pos,state.model?.newCards||[]);
 return `<article class="portfolio-card ${listing?'listed':''}"><div class="signal-top"><div class="who"><div class="avatar">${safe(pos.name.slice(0,2).toUpperCase())}</div><div><strong>${safe(pos.name)} ${pos.rating}</strong><small>${safe(pos.version||'Nieokreślona wersja')} · ${n(pos.quantity)} szt. · zakup ${fmtTime(pos.date)}</small></div></div><span class="investment-pill ${listing?'warn':''}">${listing?'WYSTAWIONA':'W PORTFELU'}</span></div>
 <div class="stats"><div><small>Zakup / szt.</small><strong>${pos.approxBuyPrice?'~':''}${n(pos.buyPrice)}</strong></div><div><small>${listing?'Wystawiony BIN':'Wycena RSS'}</small><strong>${listing?n(pos.listingPrice):quote?n(quote.price):'—'}</strong></div><div><small>${listing?'Zysk po sprzedaży*':'Zysk wg RSS'}</small><strong class="${(listing?projected:profit)>=0?'positive':'negative'}">${(listing?projected:profit)===null?'Brak danych':`${listing&&pos.approxBuyPrice?'~':''}${(listing?projected:profit)>0?'+':''}${n(listing?projected:profit)}`} </strong></div></div>
 <p class="portfolio-reason">${safe(exit.text)}</p>
 ${pos.thesis?`<p class="small"><strong>Hipoteza inwestycji:</strong> ${safe(pos.thesis)}</p>`:''}
 ${catalysts.length?`<p class="small">Nowa wersja zawodnika w feedzie: ${safe(catalysts[0].title)}. Możliwy wpływ na podaż — niepotwierdzony.</p>`:''}
 <p class="small">${quote?`Odczyt RSS ${fmtTime(quote.publishedAt)} — nie jest to oferta w EA.`:'Brak świeżego odczytu tej dokładnej karty w feedzie 40 największych ruchów. Nie zakładamy jej aktualnej ceny.'}</p>
 ${listing?'<p class="block-note">*Kwota jest potencjalna, nie dodana do salda. Uwzględnia 5% podatku EA; jeśli zakup był orientacyjny, również wynik jest przybliżony.</p>':''}
 <div class="card-actions"><button class="action-btn" data-listing="${safe(pos.uid)}">${listing?'Zmień BIN':'Oznacz jako wystawioną'}</button><button class="action-btn primary-alt" data-sell="${safe(pos.uid)}">Potwierdź sprzedaż</button>${pos.url&&pos.url.startsWith('https://futzip.com/')?`<a class="action-btn" target="_blank" rel="noopener noreferrer" href="${safe(pos.url)}">Karta ↗</a>`:''}</div></article>`;
 }).join(''):'<div class="empty">Brak zapisanych inwestycji. Wybierz „Zapisz zakup”, aby prowadzić portfel.</div>';
 $('portfolio-cards').querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>openSale(b.dataset.sell));
 $('portfolio-cards').querySelectorAll('[data-listing]').forEach(b=>b.onclick=()=>openListing(b.dataset.listing));
}
function badge(o){if(o.status==='candidate')return '<span class="investment-pill">KANDYDAT</span>';
 if(o.status==='verify')return '<span class="investment-pill warn">WSTĘPNY</span>';
 if(o.status==='risk')return '<span class="investment-pill negative">RYZYKO SPADKU</span>';
 return `<span class="investment-pill warn">${o.status==='budget'?'POZA BUDŻETEM':o.status==='stale'?'STARA CENA':'OBSERWUJ'}</span>`}
function investmentCard(m){const a=m.opportunity;
 const trend=historySignal(m,state.history[String(m.id)]||[]);
 const scope=a.median7!==null?`Mediana z lokalnej historii: ${n(a.median7)}`:`Cena 24h wcześniej: ${n(m.previousPrice)} (nie mediana)`;
 const canScenario=Number.isFinite(a.scenarioProfit)&&['candidate','verify'].includes(a.status);
 const displayedBadge=trend.code==='reversal'&&canScenario?'<span class="investment-pill">WCZESNE ODBICIE</span>':badge(a);
 const extra=canScenario?`<div class="kpi-grid"><div><small>Scenariusz sprzedaży</small><strong>${n(a.scenarioSell)}</strong></div><div><small>Zysk netto*</small><strong class="${a.scenarioProfit>0?'positive':'negative'}">${a.scenarioProfit>0?'+':''}${n(a.scenarioProfit)}</strong></div><div><small>ROI netto*</small><strong>${pct(a.scenarioRoi*100)}</strong></div></div>`:'';
 return `<article class="signal ${a.status==='risk'?'bearish':''}"><div class="signal-top"><div class="who"><div class="avatar">${safe(m.name.slice(0,2).toUpperCase())}</div><div><strong>${safe(m.name)}</strong><small>${n(m.rating)} OVR · PS/Xbox · ${fmtTime(m.publishedAt)}</small></div></div>${displayedBadge}</div>
 <div class="stats"><div><small>Ostatnia cena z RSS</small><strong>${n(m.price)}</strong></div><div><small>Zmiana 24h</small><strong class="${m.changePercent<0?'negative':'positive'}">${pct(m.changePercent)}</strong></div><div><small>Udział w portfelu</small><strong>${pct(a.exposure*100)}</strong></div></div>
 <p class="opportunity-description">${safe(a.reason)} ${safe(scope)}. Dane: ${safe(a.evidence)}. <strong>${safe(trend.title)}</strong>: ${safe(trend.description)}</p>
 ${extra}<div class="signal-actions">${m.url&&/^https:\/\/futzip\.com\//.test(m.url)?`<a class="action-btn" target="_blank" rel="noopener noreferrer" href="${safe(m.url)}">Wykres ↗</a>`:''}<button class="action-btn primary-alt" data-buy="${safe(m.id)}">Zapisz zakup</button></div>
 ${canScenario?'<p class="block-note">*Scenariusz: ograniczony powrót w kierunku punktu odniesienia, a NIE prognoza ani aktualna oferta kupna. Po odjęciu 5% podatku EA.</p>':'<p class="block-note">Nie traktuj tego jako sygnału do kupna bez sprawdzenia wykresu i faktycznej oferty na EA.</p>'}</article>`;
}
function visibleCards(){if(!state.model?.usable)return [];
 if(state.filter==='momentum')return state.ranked.filter(m=>historySignal(m,state.history[String(m.id)]||[]).code==='reversal'&&['candidate','verify'].includes(m.opportunity.status));
 if(state.filter==='candidates')return state.ranked.filter(m=>['candidate','verify'].includes(m.opportunity.status));
 if(state.filter==='verify')return state.ranked.filter(m=>['verify','watch'].includes(m.opportunity.status));
 if(state.filter==='risk')return state.ranked.filter(m=>['risk','stale'].includes(m.opportunity.status));
 return state.ranked;
}
function renderCatalysts(){
 const model=state.model;
 const target=$('catalyst-summary');if(!model){target.innerHTML='<div class="empty">Odśwież rynek, żeby zobaczyć aktualne wydarzenia.</div>';return;}
 const recent=[...model.sbcs.slice(0,6).map(x=>({...x,kind:'sbc'})),...model.newCards.slice(0,6).map(x=>({...x,kind:'card'}))]
  .filter(x=>Number.isFinite(Date.parse(x.publishedAt))&&Date.now()-Date.parse(x.publishedAt)<72*3600000)
  .sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,7);
 target.innerHTML=`<div class="objective-example"><span class="investment-pill">SCHEMAT: ODROCZONY POPYT</span><strong>Przykład Szoboszlai</strong><p>Nowy objective z wymogiem Węgra → zakup przed Weekend League → możliwa fala popytu po rozgrywkach. To zaobserwowana sytuacja z Twojej transakcji, a nie automatycznie zweryfikowany nowy objective.</p></div>`+
 (recent.length?recent.map(x=>{const a=labelCatalyst(x,x.kind);return `<article class="catalyst-item"><div class="signal-top"><strong>${safe(x.title)}</strong><span class="investment-pill warn">${safe(a.label)}</span></div><small>${fmtTime(x.publishedAt)}</small><p>${safe(a.text)}</p></article>`}).join(''):'<p class="hint">Brak nowych wydarzeń w ostatnich 72 godzinach.</p>');
}
function renderNews(id,list,count){$(id).innerHTML=list.length?list.slice(0,count).map(x=>`<div class="news-item"><strong>${safe(x.title)}</strong><small class="time">${fmtTime(x.publishedAt)}${x.url&&x.url.startsWith('https://futzip.com/')?` · <a href="${safe(x.url)}" target="_blank" rel="noopener noreferrer">Źródło ↗</a>`:''}</small><small>${safe(x.description)}</small></div>`).join(''):'<div class="empty">Brak aktualnych wpisów.</div>'}
function render(){strategy();renderPortfolio();renderCatalysts();
 $('refresh').disabled=state.busy;
 $('refresh').textContent=state.busy?'⏳ Pobieram dane…':'↻   Szukaj okazji na rynku';
 const model=state.model;
 $('data-pill').textContent=state.busy?'◌ Skanowanie':state.lastError?'! Błąd':model?.usable?'● Dane aktywne':model?'! Stare dane':'○ Gotowy';
 $('data-pill').className='pill '+(state.lastError||(model&&!model.usable)?'warn':'');
 $('freshness-strip').hidden=!(state.lastError||(model&&!model.usable));
 $('freshness-strip').textContent=state.lastError||(!model?.usable&&model?'Zbyt stary feed RSS; bieżące inwestycje są wstrzymane.':'');
 if(!model){$('market-summary').textContent='Naciśnij odświeżanie. Zobaczysz kandydatów do zakupów i sytuację zapisanych pozycji.';
 $('cards').innerHTML='<div class="empty">Brak analizy. Użyj przycisku u góry.</div>';return}
 const candidates=state.ranked.filter(x=>['candidate','verify'].includes(x.opportunity.status)).length;
 const reversals=state.ranked.filter(x=>historySignal(x,state.history[String(x.id)]||[]).code==='reversal'&&['candidate','verify'].includes(x.opportunity.status)).length;
 $('market-summary').textContent=`Dane FUTZIP: ${fmtTime(model.feedSummary.movers?.updatedAt)} · ${model.movers.length} wybranych kart, ${candidates} wstępnych kandydatów, ${reversals} z oznakami odbicia. ${model.usable?'To nie wszystkie karty rynku, ani lista dostępnych aukcji.':'Źródło zbyt stare.'}`;
 const cards=visibleCards();
 $('cards').innerHTML=!model.usable?'<div class="empty">Feed nie jest aktualny — nie pokazujemy przeterminowanych okazji.</div>':cards.length?cards.slice(0,45).map(investmentCard).join(''):'<div class="empty">W tym skanie nie ma kandydatów spełniających kryteria marży i ryzyka. To normalne — nie każda przecena jest okazją. Sprawdź zakładkę „Do obserwacji”.</div>';
 $('cards').querySelectorAll('[data-buy]').forEach(button=>button.onclick=()=>prefillPurchase(button.dataset.buy));
 renderNews('new-cards',model.newCards,8);renderNews('live-sbcs',model.sbcs,9);
 $('source-detail').textContent=`FUTZIP RSS · PS/Xbox\nOdczyt: ${fmtTime(model.checkedAt)}\nAktualizacja kanału: ${fmtTime(model.feedSummary.movers?.updatedAt)}\nŹródło obejmuje tylko wybrane ruchy cen 24h. Nie jest to kompletna baza ani potwierdzona oferta na EA.\nHistoria zbierana lokalnie wyłącznie dla kart pojawiających się w RSS; kilka powtórzeń nie zastępuje 7 dni danych.\nNie przyznajemy pozornej pewności prognozom.`;
}
async function refresh(){if(state.busy)return;state.busy=true;state.lastError=null;render();$('status-note').textContent='Pobieram ceny i wydarzenia, analizuję spadki oraz Twoje pozycje…';
 try {const ac=new AbortController(),t=setTimeout(()=>ac.abort(),25000);
  let response;try{response=await fetch(state.workerUrl.replace(/\/$/,'')+'/scan?t='+Date.now(),{cache:'no-store',signal:ac.signal})}finally{clearTimeout(t)}
  if(!response.ok)throw Error('Worker HTTP '+response.status);
  const data=await response.json(),model=analyzeFeed(data,state.balance);
  state.model=model;
  for(const m of model.movers)noteHistory(m);
  state.ranked=rankOpportunities(model.movers,state.balance,state.history);
  save();
  const good=state.ranked.filter(x=>['candidate','verify'].includes(x.opportunity.status)).length;
  $('status-note').textContent=model.usable?`Zanalizowano ${model.movers.length} zmian cen. Wybrano ${good} kandydatów do sprawdzenia oraz odświeżono znane wyceny portfela.`:'Zbyt stare dane do podejmowania decyzji.';
 }catch(e){state.lastError=String(e.message||e);$('status-note').textContent='Brak aktualizacji. Wyceny kart bez nowych danych nie są udawane.'}finally{state.busy=false;render()}
}
function showBuy(){ $('buy-form').hidden=false;$('holdings-section').scrollIntoView({behavior:'smooth',block:'start'});$('buy-name').focus(); }
function prefillPurchase(id){const item=state.ranked.find(x=>String(x.id)===String(id));if(!item)return;
 $('buy-name').value=item.name;$('buy-rating').value=item.rating;$('buy-version').value='';$('buy-quantity').value=1;$('buy-price').value=item.price;$('buy-link').value=item.url||'';showBuy(); }
$('buy-form').onsubmit=e=>{e.preventDefault();const name=$('buy-name').value.trim(),rating=Number($('buy-rating').value),qty=Number($('buy-quantity').value),buyPrice=Number($('buy-price').value),version=$('buy-version').value.trim(),url=$('buy-link').value.trim();
 if(!name||!Number.isInteger(rating)||rating<1||rating>99||!Number.isInteger(qty)||qty<1||qty>100||!Number.isFinite(buyPrice)||buyPrice<=0)return alert('Sprawdź nazwę, rating, ilość i cenę zakupu.');
 if(url&&!/^https:\/\//i.test(url))return alert('Link musi zaczynać się od https://');
 const cost=qty*buyPrice,alreadyOwned=$('buy-already-owned').checked;
 if(!alreadyOwned&&cost>state.balance)return alert('Za mało dostępnych coinsów. Zaktualizuj saldo, jeżeli zakup już odbył się na EA.');
 state.positions.push({uid:'p'+Date.now()+'_'+state.positions.length,name,rating,version,quantity:qty,buyPrice,url,date:new Date().toISOString(),alreadyOwned,status:'held'});
 if(!alreadyOwned)state.balance-=cost;$('buy-form').reset();$('buy-form').hidden=true;save();render();
 $('status-note').textContent=`Zapisano ${qty} × ${name}. ${alreadyOwned?'Saldo nie zostało ponownie pomniejszone.':`Saldo zmniejszono o ${n(cost)} coins.`}`;
};
let saleId=null;
function openSale(id){const pos=state.positions.find(x=>x.uid===id);if(!pos)return;saleId=id;
 $('sell-description').textContent=`${pos.name} ${pos.rating} · zakup ${n(pos.buyPrice)} za sztukę · pozostało ${pos.quantity} szt.`;
 $('sell-quantity').max=pos.quantity;$('sell-quantity').value=1;
 const quote=getCurrentQuote(pos);$('sell-price').value=pos.listingPrice||quote?.price||'';
 $('sell-modal').showModal(); }
$('sell-form').onsubmit=e=>{e.preventDefault();const pos=state.positions.find(x=>x.uid===saleId);if(!pos)return;
 const qty=Number($('sell-quantity').value),sellPrice=Number($('sell-price').value);
 if(!Number.isInteger(qty)||qty<1||qty>pos.quantity||sellPrice<=0)return alert('Błędna ilość lub cena sprzedaży.');
 const profit=pnl(pos.buyPrice,sellPrice,qty);
 state.balance+=proceeds(sellPrice)*qty;
 state.sales.push({name:pos.name,rating:pos.rating,version:pos.version,quantity:qty,buyPrice:pos.buyPrice,sellPrice,profit,date:new Date().toISOString(),approxBuyPrice:Boolean(pos.approxBuyPrice)});
 pos.quantity-=qty;if(pos.quantity===0)state.positions=state.positions.filter(x=>x.uid!==saleId);
 $('sell-modal').close();save();render();
 $('status-note').textContent=`Zapisano sprzedaż ${qty} × ${pos.name}. Zysk netto: ${profit>0?'+':''}${n(profit)} coins.`;
};
// Listing is not a sale. Never modify balance until user confirms a sale.
let listingId=null;
function openListing(id){
 const pos=state.positions.find(x=>x.uid===id);if(!pos)return;
 listingId=id;
 $('listing-description').textContent=`${pos.name} ${pos.rating} · ${n(pos.quantity)} szt. · zakup ${pos.approxBuyPrice?'około ':''}${n(pos.buyPrice)}`;
 $('listing-price').value=pos.listingPrice||'';
 $('listing-modal').showModal();
}
$('listing-form').onsubmit=e=>{
 e.preventDefault();const pos=state.positions.find(x=>x.uid===listingId);if(!pos)return;
 const val=Number($('listing-price').value);if(!Number.isFinite(val)||val<=0)return alert('Wpisz prawidłowy BIN.');
 pos.status='listed';pos.listingPrice=val;pos.listingDate=new Date().toISOString();
 $('listing-modal').close();save();render();$('status-note').textContent='Zapisano cenę wystawienia. To nadal niezrealizowany zysk.';
};
$('remove-listing').onclick=()=>{const pos=state.positions.find(x=>x.uid===listingId);if(!pos)return;pos.status='held';pos.listingPrice=null;$('listing-modal').close();save();render();};
$('cancel-listing').onclick=()=>$('listing-modal').close();
$('refresh').onclick=refresh;
$('show-buy').onclick=showBuy;
$('cancel-buy').onclick=()=>{$('buy-form').hidden=true};
$('cancel-sell').onclick=()=>$('sell-modal').close();
$('edit-balance').onclick=()=>{const raw=prompt('Dostępne coinsy w klubie (bez wartości kart w transfer list):',String(state.balance));if(raw===null)return;
 const val=Number(raw.replace(/[\s\u00a0]/g,''));if(!Number.isFinite(val)||val<0||val>100000000)return alert('Nieprawidłowe saldo.');state.balance=val;save();if(state.model)state.ranked=rankOpportunities(state.model.movers,val,state.history);render();};
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden};$('worker-url').value=state.workerUrl;
$('save-settings').onclick=()=>{try{const u=new URL($('worker-url').value.trim());if(u.protocol!=='https:'||!u.hostname.endsWith('.workers.dev'))throw Error('Podaj adres https://...workers.dev');state.workerUrl=u.origin;save();$('settings').hidden=true;render()}catch(e){alert(e.message)}};
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{state.filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===button));render()});
$('close-modal').onclick=()=>$('card-modal').close();
function calc(){const b=Number($('calc-buy').value),s=Number($('calc-sell').value);$('calc-output').textContent=b>0&&s>0?`Podatek EA: ${n(Math.floor(s*.05))} · Zysk netto: ${n(proceeds(s)-b)} coins · ROI: ${pct((proceeds(s)-b)/b*100)}`:'Podaj ceny do kalkulacji.'}
for(const id of ['calc-buy','calc-sell'])$(id).addEventListener('input',calc);
$('export-data').onclick=()=>{const rows=['card_id,timestamp,price'];Object.entries(state.history).forEach(([id,ps])=>ps.forEach(([t,p])=>rows.push(`${JSON.stringify(id)},${new Date(t).toISOString()},${p}`)));download('fc27-history.csv',rows.join('\n'),'text/csv')};
$('export-portfolio').onclick=()=>download('fc27-portfolio-backup.json',JSON.stringify({version:7,createdAt:new Date().toISOString(),balance:state.balance,positions:state.positions,sales:state.sales},null,2),'application/json');
function download(filename,data,type){const blob=new Blob([data],{type}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}
const ev=[['29','PAŹ','Rivals Rewards','Sprawdzamy wzrost podaży i ceny po nagrodach.'],['30','PAŹ','Nowa zawartość / promo','Nowa podaż może przeważyć nad popytem do Champions.'],['01','LIS','Squad Battles','Możliwe przeceny po nagrodach — potwierdź cenę na rynku.']];
$('events').innerHTML=ev.map(x=>`<div class="event"><div class="datebox"><strong>${x[0]}</strong><small>${x[1]}</small></div><div><strong>${x[2]}</strong><p>${x[3]}</p></div></div>`).join('');
document.querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>document.querySelector(el.dataset.jump)?.scrollIntoView({behavior:'smooth'}));
calc();save();render();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js?v=7.0.0',{updateViaCache:'none'}).catch(()=>{});
let start=null;addEventListener('touchstart',e=>{start=scrollY<3?e.touches?.[0]?.clientY:null},{passive:true});addEventListener('touchend',e=>{if(start!==null&&e.changedTouches[0].clientY-start>110)refresh();start=null},{passive:true});
