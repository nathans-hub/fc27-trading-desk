import {median,dynamicStrategy} from './engine.mjs';

export const taxAmount = (sell) => Math.floor(Number(sell||0)*0.05);
export const proceeds = (sell) => Math.max(0, Number(sell||0)-taxAmount(sell));
export const pnl = (buy,sell,quantity=1) => Math.round((proceeds(sell)-Number(buy||0))*Number(quantity||0));
export const portfolioExposure = (price,balance) => balance>0 ? price/balance : Infinity;
const roundTick = price => {
  const step=price>=100000?1000:price>=50000?500:price>=10000?250:price>=1000?50:10;
  return Math.floor(price/step)*step;
};

// The feed contains selected 24h movers, NOT a complete quote book, and prices
// don't prove that a listing exists on EA's market.
export function evaluateOpportunity(m, balance, history=[], now=Date.now()) {
  const price=Number(m.price), previous=Number(m.previousPrice), change=Number(m.changePercent),
        age=(now-Date.parse(m.publishedAt||''))/60000;
  const finite=Number.isFinite(price)&&price>0&&Number.isFinite(previous)&&previous>0;
  const affordable=finite&&price<=balance;
  const exposure=portfolioExposure(price, balance);
  const obs=(Array.isArray(history)?history:[]).filter(a=>Array.isArray(a)&&Number.isFinite(a[0])&&Number.isFinite(a[1])&&a[1]>0&&a[0]<=now+120000)
     .sort((a,b)=>a[0]-b[0]);
  const oldest=obs[0]?.[0]||now, days=(now-oldest)/86400000;
  const recent=obs.filter(x=>x[0]>=now-7*86400000);
  const sufficient=recent.length>=8&&days>=4;
  const med=sufficient?median(recent.map(x=>x[1])):null;
  const first=recent[0]?.[1];
  const baselineTrend=sufficient&&first?price/first-1:null;
  const fallTrend=baselineTrend!==null&&baselineTrend<-0.12;
  const downward=change<=-30 || fallTrend;
  const stale=!Number.isFinite(age)||age< -2||age>120;
  const strat=dynamicStrategy(balance);
  const minProfit=Math.max(250,Math.min(3500,strat.minProfit*.65));
  // Previous-day price is ONLY a hypothetical benchmark. Never a forecast.
  const reference=med||previous;
  const recoveryCeiling=finite?roundTick(Math.min(reference,price*(sufficient?1.15:1.12))):null;
  const potential=recoveryCeiling?proceeds(recoveryCeiling)-price:null;
  const roi=potential&&finite?potential/price:0;
  const enoughRoom=Number.isFinite(potential)&&potential>=minProfit && roi>=0.055;
  const discounted=med!==null ? price<=med*.93 : change<=-9;
  let status='watch', reason='Brak wystarczającego potencjału po podatku lub potwierdzenia przeceny.';
  if(!finite){status='invalid';reason='Nieprawidłowa lub brakująca cena.';}
  else if(!affordable){status='budget';reason='Cena przekracza dostępne coinsy.';}
  else if(stale){status='stale';reason='Odczyt tej karty jest starszy niż 120 minut — brak bieżącej wyceny.';}
  else if(downward){status='risk';reason='Silny spadek ceny — historyczna cena nie oznacza, że karta odbije.';}
  else if(!discounted){status='watch';reason='Karta nie jest aktualnie dostatecznie przeceniona.';}
  else if(enoughRoom){status=sufficient?'candidate':'verify';reason=sufficient?
    'Cena poniżej własnej historycznej mediany; brak potwierdzonego gwałtownego trendu spadkowego.':
    'Cena niższa niż 24h temu. Warto sprawdzić wykres 7-dniowy — to jeszcze nie sygnał kupna.';}
  else {status='watch';reason='Po podatku i konserwatywnym limicie odbicia potencjalna marża jest zbyt mała.';}
  const evidence=sufficient?'4+ dni lokalnej historii':'Tylko porównanie z 24h';
  const score=(status==='candidate'?300:status==='verify'?180:status==='watch'?80:status==='risk'?10:0)+
    Math.min(60,Math.max(0,roi*300)) - Math.max(0,exposure-.3)*90 - (stale?400:0);
  return {status,reason,score,price,previous,change,age,affordable,exposure,downward,evidence,historyCount:recent.length,
    median7:med,daysObserved:days,referencePrice:reference,referenceType:med!==null?'mediana lokalnej historii':'cena 24h wcześniej',
    scenarioSell:recoveryCeiling,scenarioProfit:potential,scenarioRoi:roi,minProfit};
}
export function rankOpportunities(movers,balance,histories,now=Date.now()){
  return (Array.isArray(movers)?movers:[]).map(m=>({...m,opportunity:evaluateOpportunity(m,balance,histories?.[String(m.id)]||[],now)}))
    .sort((a,b)=>b.opportunity.score-a.opportunity.score);
}
export const positionValue=(position, currentPrice)=>Number.isFinite(currentPrice)&&currentPrice>0 ?
  Math.round((proceeds(currentPrice)-position.buyPrice)*position.quantity) : null;
