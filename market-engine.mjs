import {dynamicStrategy} from './engine.mjs';
export function parseTime(value){const v=Date.parse(value||'');return Number.isFinite(v)?v:null}
export function feedAge(value,now=Date.now()) {const v=parseTime(value);return v===null?null:Math.max(0,(now-v)/60000)}
export function priceTick(p){if(p>=100000) return 1000;if(p>=10000) return 250;if(p>=1000) return 50;return 10}
export function classifyMover(m,balance){
 const price=Number(m.price),pct=Number(m.changePercent),available=Number.isFinite(price)&&price>0&&price<=balance;
 const exposure=balance>0?price/balance:Infinity;
 let kind='neutral',title='Zmiana ceny — obserwuj';
 if(pct>=40){kind='spike';title='Po dużym wzroście — nie gonić ceny';}
 else if(pct>=10){kind='rising';title='Cena już wzrosła — sprawdź powód';}
 else if(pct<=-25){kind='crash';title='Gwałtowna przecena — wysokie ryzyko';}
 else if(pct<=-10){kind='drop';title='Spadek do dalszej weryfikacji';}
 else if(pct<0){kind='dip';title='Niewielki spadek — obserwuj';}
 if(!available){kind='budget';title='Poza aktualnym saldem';}
 const risk=exposure>.5?'bardzo wysokie':exposure>.35?'wysokie':exposure>.18?'średnie':'umiarkowane';
 const quality = ['drop','dip'].includes(kind) && exposure<=.35 ? 3 : (kind==='crash'?2:kind==='neutral'?1:0);
 // Diagnostic only: max purchase price for a manually verified sell at current indexed price.
 const strat=dynamicStrategy(balance);
 const targetNet=Math.max(150,Math.min(strat.minProfit,price*.08));
 const assumedSell=price-priceTick(price); // Assumed 1+ tick of slippage, not guaranteed
 const maxBid=Math.max(0,Math.floor((assumedSell-Math.floor(assumedSell*.05)-targetNet)/priceTick(price))*priceTick(price));
 const profit=assumedSell-Math.floor(assumedSell*.05)-maxBid;
 return {kind,title,available,exposure,risk,quality,maxBid,assumedSell,profit,score: quality*100+Math.min(50,price/10000)-(exposure>.5?250:exposure>.35?50:0)};
}
export function analyzeFeed(payload,balance,now=Date.now()){
 if(payload?.version!==5||payload?.source!=='FUTZIP_RSS'||payload?.platform!=='console')throw Error('Nieobsługiwany format odpowiedzi Workera. Opublikuj worker.js z paczki v5.');
 if(!Array.isArray(payload.movers)||!Array.isArray(payload.newCards)||!Array.isArray(payload.sbcs))throw Error('Niekompletne dane z Workera.');
 const feed=payload.feeds?.movers||{},age=feedAge(feed.updatedAt,now);
 const usable = feed.status==='ok' && age!==null && age<=90;
 const movers=payload.movers.filter(m=>m.name&&Number.isFinite(m.price)&&Number.isFinite(m.changePercent)&&m.price>0).map(m=>({...m,analysis:classifyMover(m,balance)})).sort((a,b)=>b.analysis.score-a.analysis.score);
 return {usable,age,feedStatus:feed.status,movers,newCards:payload.newCards,sbcs:payload.sbcs,feedSummary:payload.feeds, checkedAt:payload.checkedAt};
}
