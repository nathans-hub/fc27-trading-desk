/** Pure analytics helpers — no price guessing, no EA endpoints. */
export const median = values => {const a=[...values].filter(Number.isFinite).sort((x,y)=>x-y);return a.length?(a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2):null};
export const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
export function dynamicStrategy(balance){
 if(balance<30000)return {tier:'Start',weight:0.24,focus:'Tanie flipy i mass bidding',minProfit:300};
 if(balance<100000)return {tier:'Budowanie kapitału',weight:0.3,focus:'Flip + fodder',minProfit:600};
 if(balance<300000)return {tier:'Rozwój',weight:0.42,focus:'Karty meta + SBC/EVO',minProfit:1200};
 if(balance<500000)return {tier:'Balanced',weight:0.6,focus:'Quick flip + event + większe pozycje',minProfit:1800};
 if(balance<1000000)return {tier:'Zaawansowany',weight:0.55,focus:'Eventy + karty promocyjne',minProfit:3000};
 return {tier:'Duży portfel',weight:0.55,focus:'Dywersyfikacja i rotacja',minProfit:5000};
}
export function priceAnalysis(card,history,balance){
 const now=Date.now(),age=(now-Date.parse(card.updatedAt))/60000;
 const fresh=Number.isFinite(age)&&age>=-2&&age<=45;
 const points=history.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]<=now+120000&&p[0]>now-14*86400000).sort((a,b)=>a[0]-b[0]);
 const last24=points.filter(x=>x[0]>=now-24*3600000),last7=points.filter(x=>x[0]>=now-7*86400000);
 const oldest=points[0]?.[0]||now,span=(now-oldest)/3600000;
 const histPrices=last7.map(x=>x[1]);const med=median(histPrices);
 const deviation=med?(card.price/med-1)*100:null;
 const getWindow=(hours)=>{const targ=now-hours*3600000;const m=points.filter(p=>Math.abs(p[0]-targ)<Math.max(2,hours*.15)*3600000);if(!m.length)return null;const prev=m.reduce((a,b)=>Math.abs(a[0]-targ)<Math.abs(b[0]-targ)?a:b)[1];return 100*(card.price/prev-1)};
 const p6=getWindow(6),p24=getWindow(24),p7=getWindow(168);
 const falling=(p6!==null&&p6<=-9)||(p24!==null&&p24<=-7)||(p7!==null&&p7<=-13)||(p24!==null&&p7!==null&&p24< -3&&p7< -7);
 const stable=(p24!==null&&Math.abs(p24)<=4)&&(p7===null||Math.abs(p7)<=11);
 const strat=dynamicStrategy(balance),exposure=card.price/Math.max(balance,1),affordable=card.price<=balance;
 const quickSell=card.price>=1000?Math.floor(card.price*.985/50)*50:card.price;
 const breakEven=Math.ceil(card.price/.95);
 const minProfit=clamp(strat.minProfit,300,8000);
 const targetBid=Math.max(0,Math.floor(Math.min((quickSell*.95-minProfit),(quickSell*.95)/(1+.055))/50)*50);
 const possibleFlipProfit=quickSell-Math.floor(quickSell*.05)-targetBid;
 const histSufficient=points.length>=8&&span>=18;
 const possibleRecovery=!falling&&histSufficient&&med!==null&&deviation!==null&&deviation<=-4&&deviation>=-18;
 const potentialSell=possibleRecovery?Math.floor(Math.min(med,card.price*1.12)/50)*50:null;
 const potentialProfit=potentialSell?potentialSell-Math.floor(potentialSell*.05)-card.price:null;
 const recoveryPlausible=potentialProfit!==null&&potentialProfit>=minProfit&&potentialProfit/card.price>=.035;
 let signal='monitor',why='Brak wystarczających danych do prognozy przyszłego wzrostu.';
 if(!fresh){signal='stale';why='Odrzucono: cena starsza niż 45 minut.';}
 else if(!affordable){signal='budget';why='Karta poza aktualnym budżetem, pozostaje w obserwacji.';}
 else if(falling){signal='risk';why='Potwierdzony trend spadkowy; nie zakładamy automatycznego odbicia.';}
 else if(recoveryPlausible){signal='candidate';why='Cena poniżej lokalnej mediany i brak silnego trendu spadkowego. To scenariusz, nie pewna prognoza.';}
 else if(stable){signal='flip';why='Stabilniejszy rynek; sprawdź aukcje poniżej wskazanego limitu zakupu.';}
 else if(histSufficient){signal='monitor';why='Brak czytelnego sygnału. Nie warto zgadywać na podstawie jednego odczytu.';}
 const risk=exposure>.5?'bardzo wysokie':exposure>.35?'wysokie':exposure>.18?'średnie':'umiarkowane';
 const score=(signal==='candidate'?60:signal==='flip'?42:signal==='monitor'?20:signal==='risk'?5:0)+(recoveryPlausible?Math.min(20,Math.max(0,potentialProfit/card.price*200)):0)-(exposure>.5?18:exposure>.35?8:0);
 return {fresh,age,points,span,historyCount:points.length,deviation,p6,p24,p7,falling,stable,signal,why,risk,score,
   exposure,affordable,quickSell,targetBid,possibleFlipProfit,possibleRecovery:recoveryPlausible,potentialSell:recoveryPlausible?potentialSell:null,potentialProfit:recoveryPlausible?potentialProfit:null,breakEven,trendKnown:histSufficient};
}
