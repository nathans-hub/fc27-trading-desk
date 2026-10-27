/** FC27 v7: signal rules based ONLY on timestamped real observations.
 * This is not a forecast model. It assigns conservative monitoring states. */
const HOUR = 3600000;
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export function historySignal(quote, observations=[], now=Date.now()) {
  const pts=(Array.isArray(observations)?observations:[])
    .filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[1]>0&&p[0]>=now-14*24*HOUR&&p[0]<=now+120000)
    .sort((a,b)=>a[0]-b[0]);
  const latest=pts.at(-1);
  const fresh=latest&&now-latest[0]<=2*HOUR;
  const first=pts[0], span=first&&latest?(latest[0]-first[0])/HOUR:0;
  const recent=pts.filter(p=>p[0]>=now-48*HOUR);
  const last=recent.at(-1), low=recent.length?Math.min(...recent.map(p=>p[1])):null;
  const lowIdx=recent.findIndex(p=>p[1]===low);
  const fromLow=low&&last?last[1]/low-1:0;
  const dayAnchor=pts.filter(p=>p[0]<=now-18*HOUR).at(-1);
  const dayTrend=dayAnchor&&latest?latest[1]/dayAnchor[1]-1:null;
  const seriesAfterLow=recent.slice(Math.max(0,lowIdx));
  let increases=0;
  for(let i=1;i<seriesAfterLow.length;i++)if(seriesAfterLow[i][1]>seriesAfterLow[i-1][1])increases++;
  const trustworthy=Boolean(fresh&&pts.length>=4&&span>=2&&recent.length>=3);
  const severeFall=dayTrend!==null&&dayTrend<=-0.25 || Number(quote?.changePercent)<=-35;
  let code='insufficient',title='Za mało historii',description='Dalsze odczyty są potrzebne, by sprawdzić, czy spadek się kończy.';
  if(!fresh){code='stale';title='Brak świeżej wyceny';description='Ostatni zapis jest zbyt stary na sygnał.';}
  else if(severeFall){code='falling';title='Silny spadek';description='Duża przecena sama w sobie nie jest potwierdzeniem odbicia.';}
  else if(trustworthy&&increases>=2&&fromLow>=0.035&&lowIdx<recent.length-2&&(!Number.isFinite(dayTrend)||dayTrend<0.32)){
    code='reversal';title='Możliwe wczesne odbicie';description='Kolejne niezależne odczyty rosną po lokalnym minimum. Sprawdź katalizator i płynność.';
  }else if(trustworthy&&dayTrend!==null&&dayTrend<=-0.10){
    code='falling';title='Trend wciąż słaby';description='Cena pozostaje niżej niż wcześniejsze obserwacje; nie prognozujemy powrotu.';
  }else if(trustworthy){code='observe';title='Historia obserwowana';description='Zmiana ceny nie potwierdza jeszcze korzystnego punktu wejścia.';}
  return {code,title,description,historyCount:pts.length,spanHours:span,trend24:dayTrend,fromLow,low,latestPrice:latest?.[1]??null, fresh:Boolean(fresh)};
}
export function catalystMatches(position,newCards=[]){
  // A new special version of the SAME player may affect base-card pack supply.
  // Without EA inventory/requirements this is a hypothesis only.
  const p=norm(position?.name);if(!p)return [];
  const pieces=p.split(' ').filter(x=>x.length>=3);
  if(!pieces.length)return [];
  return newCards.filter(x=>{
    const s=norm(x.title);return pieces.every(word=>s.includes(word));
  }).map(x=>({title:x.title,publishedAt:x.publishedAt,reason:'Wprowadzono nową wersję zawodnika. Możliwa zmiana podaży wersji bazowej — wymaga potwierdzenia.',url:x.url||''}));
}
export function exitSignal(position,quote,history=[],now=Date.now()){
  const listing=Number(position?.listingPrice)||null, buy=Number(position?.buyPrice),q=quote?.price;
  if(!Number.isFinite(buy)||buy<=0)return {code:'unknown',text:'Brak ceny zakupu.'};
  const netAtListing=listing?Math.floor(listing*.95)-buy:null;
  if(!quote||!Number.isFinite(q)||q<=0)return {code:'unpriced',text:listing?`Wystawiona za ${listing.toLocaleString('pl-PL')}. Brak bieżącej ceny tej wersji w feedzie.`:'Nie ma bieżącej ceny w feedzie.',netAtListing};
  const realisedIfNow=Math.floor(q*.95)-buy;
  const pct=realisedIfNow/buy;
  const sig=historySignal(quote,history,now);
  if(listing&&q>=listing*.98)return {code:'near-listing',text:'Rynek zbliża się do Twojej ceny wystawienia. Sprawdź listę transferową w EA.',netAtListing,netAtMarket:realisedIfNow};
  if(pct>=.12&&sig.code==='falling')return {code:'take-profit',text:'Zysk netto jest dodatni, a impet słabnie. Rozważ obniżenie oczekiwań lub sprzedaż.',netAtListing,netAtMarket:realisedIfNow};
  if(pct>=.12)return {code:'profit',text:'Pozycja ma dodatni zysk netto. Obserwuj kolejne odczyty i katalizator.',netAtListing,netAtMarket:realisedIfNow};
  return {code:'hold',text:'Brak wystarczającego potwierdzenia wyjścia. Aktualną cenę sprawdź w EA.',netAtListing,netAtMarket:realisedIfNow};
}
export function labelCatalyst(entry,kind){
  const title=String(entry?.title||'');
  const age=(Date.now()-Date.parse(entry?.publishedAt||''))/HOUR;
  if(!Number.isFinite(age)||age>72||age< -1)return {level:'archive',label:'Starszy wpis',text:'Informacja historyczna — nie tworzy samodzielnie sygnału kupna.'};
  if(kind==='sbc')return {level:'context',label:'Nowe SBC',text:'Sprawdź dokładne wymagania składu (liga/narodowość/rating). Sam tytuł nie wskazuje, co kupić.'};
  return {level:'context',label:'Nowa karta',text:'Nowa wersja może zmienić podaż bazowego zawodnika; wpływ należy zweryfikować.'};
}
