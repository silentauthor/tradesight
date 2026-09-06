/* TradeSight — two explicit, long-side research setups. Numeric thresholds are
   application adaptations of the cited notes, not validated trading edges. */
'use strict';
const Engine = (() => {
  const TF_SWING = {
    mode: 'swing', regimeWord: 'long-term', htfName: 'weekly', barClose: 'daily close',
    maLong: '200-day MA', maShort: '20-day MA', volWindow: 'own 1-year',
    extPct: 15, atrHighPct: 8, near20Pct: 4,
    pullbackName: '"Holy Grail" pullback zone',
    flattenRule: null,
  };
  const TF_INTRADAY = {
    mode: 'intraday', regimeWord: 'intraday', htfName: 'hourly', barClose: '15-minute close',
    maLong: '200-bar MA', maShort: '20-bar MA', volWindow: 'recent',
    extPct: 5, atrHighPct: 3, near20Pct: 1.5,
    pullbackName: 'moving-average pullback zone',
    flattenRule: 'Day-trade discipline: set the stop and target at entry and leave them; skip names swinging more than ~2% a bar; flatten every position by the end of your trading session — never carry an intraday trade overnight',
  };


  const VERSION = 'focused-2.0';
  const mean = xs => xs.length ? xs.reduce((a,b) => a+b,0)/xs.length : 0;
  const precise = x => Number.isFinite(x) ? +x.toPrecision(12) : null;
  const statusOrder = {ready:0, waiting:1, extended:2, blocked:3, watching:4, unavailable:5};
  const statusLabels = {ready:'Ready — trigger confirmed', waiting:'Waiting for trigger', extended:'Extended — do not chase', blocked:'Blocked — conditions fail', watching:'Watching — no qualifying setup', unavailable:'Unavailable — incomplete data'};
  function nearestLevels(zones, price) {
    return {support:zones.filter(z=>z.price<price).sort((a,b)=>b.price-a.price)[0]||null,
      resistance:zones.filter(z=>z.price>price).sort((a,b)=>a.price-b.price)[0]||null};
  }
  // Lines use already confirmed pivots; third touch validates a two-point candidate.
  function geometry(candles, A) {
    const n=candles.length, atr=A.latest.atr, lines=[];
    if (!(atr>0)) return {lines, box:null};
    for (const [key,role,color] of [['lows','Support trend','#74a788'],['highs','Resistance trend','#bd6152']]) {
      const points=A.swingsPts[key].filter(p=>p.i>=n-80).slice(-6);
      let best=null;
      for(let a=0;a<points.length-1;a++) for(let b=a+1;b<points.length;b++) {
        const p=points[a],q=points[b]; if(q.i-p.i<5) continue;
        const slope=(q.price-p.price)/(q.i-p.i), value=i=>p.price+slope*(i-p.i);
        const broken=candles.slice(p.i).some((c,j)=>key==='lows'?c.c<value(p.i+j)-.35*atr:c.c>value(p.i+j)+.35*atr);
        if(broken || value(n-1)<=0) continue;
        const touches=points.filter(r=>r.i>=p.i && Math.abs(r.price-value(r.i))<=.25*atr).length;
        const line={from:{i:p.i,price:p.price},to:{i:n-1,price:value(n-1)},color,touches,kind:'trend',label:role+' · '+touches+' touches'+(touches<3?' (candidate)':'')};
        if(!best || touches>best.touches || (touches===best.touches && p.i<best.from.i)) best=line;
      }
      if(best) lines.push(best);
    }
    // Only range rectangles are promoted to actionable chart patterns. Other
    // legacy pattern detectors remain available as educational reference code.
    const end=n-6,start=Math.max(0,end-29),win=candles.slice(start,end+1);
    let box=null;
    if(win.length>=20) {
      const top=Math.max(...win.map(c=>c.h)),bottom=Math.min(...win.map(c=>c.l));
      const hs=A.swingsPts.highs.filter(p=>p.i>=start&&p.i<=end&&Math.abs(p.price-top)<=.5*atr);
      const ls=A.swingsPts.lows.filter(p=>p.i>=start&&p.i<=end&&Math.abs(p.price-bottom)<=.5*atr);
      if(hs.length>=2 && ls.length>=2 && hs.at(-1).i-hs[0].i>=5 && ls.at(-1).i-ls[0].i>=5 && top-bottom>=2*atr && top-bottom<=10*atr) {
        box={start,end,top,bottom};
        for(const [price,label] of [[top,'Range resistance'],[bottom,'Range support']]) lines.push({from:{i:start,price},to:{i:n-1,price},color:'#739fbd',kind:'pattern',label});
      }
    }
    return {lines,box};
  }
  function makePlan(candidate,A,tf) {
    const {trigger,stop,target}=candidate;
    if(![trigger,stop,target].every(Number.isFinite)||!(stop>0&&trigger>stop&&target>trigger)) return null;
    const risk=trigger-stop;
    // Worst permitted fill must retain 2R to the first structural objective.
    const maxEntry=Math.min(trigger+.25*A.latest.atr,(target+2*stop)/3);
    return {side:'long',entryLow:precise(trigger),entryHigh:precise(Math.max(trigger,maxEntry)),maxEntry:precise(maxEntry),
      entryNote:candidate.triggerNote,stop:precise(stop),stopNote:candidate.stopNote,
      stopPct:100*risk/trigger,rr1:(target-trigger)/risk,rr2:(target-trigger)/risk,
      targets:[{label:'T1 — structural objective; exit planned position',price:precise(target),rr:(target-trigger)/risk}],
      exitRules:['Stop is the protective invalidation level; do not wait for a candle close after it is breached.',
        'Exit at the planned structural objective. Trailing or partial exits require a separately tested policy.',
        tf.mode==='intraday'?'Flatten before the end of your chosen trading session.':'Check the event calendar before entry; do not carry equities through earnings.',
        'Re-evaluate after the next completed candle; this snapshot is not a standing order.'],};
  }
  function assess(asset,A,higher,marketCtx={},tf=TF_SWING) {
    if(asset.side==='short')return assessShort(asset,A,higher,marketCtx,tf);
    const c=asset.candles,n=c.length,L=A.latest,last=c[n-1],prev=c[n-2],atr=L.atr;
    const src='TradeSight adaptation · Stewie / Edwards & Magee';
    const geo=geometry(c,A),checks=[],candidates=[];
    const addCheck=(label,pass)=>checks.push({label,pass});
    const htfAligned=!!higher && higher.latest.sma20!=null && higher.latest.price>higher.latest.sma20 && higher.structure.trend!=='downtrend';
    const turnover=asset.dailyTurnover;
    const liquidityOK=asset.type==='PERPETUAL'?Number.isFinite(asset.venueVolume24h)&&asset.venueVolume24h>=1e6:asset.isCrypto?Number.isFinite(asset.liquidity)&&asset.liquidity>=1e6:Number.isFinite(turnover)&&turnover>=3e7;
    const unavailable=!!asset.dataIssue || !higher || n<200 || !(atr>0) || !marketCtx.regime || marketCtx.regime==='unavailable' || (asset.type==='PERPETUAL'?!Number.isFinite(asset.venueVolume24h):asset.isCrypto?!Number.isFinite(asset.liquidity):!Number.isFinite(turnover));
    addCheck('Completed, sufficiently warm and recent candle data',!unavailable);
    addCheck('Higher timeframe supports longs',htfAligned);
    addCheck('Market tide is not risk-off',!!marketCtx.regime&&marketCtx.regime!=='risk-off'&&marketCtx.regime!=='unavailable');
    addCheck(asset.type==='PERPETUAL'?'At least $1M Jupiter 24h market volume':asset.isCrypto?'At least $1M reported pool liquidity':'At least ₹3 crore average daily turnover',liquidityOK);
    addCheck('Supported market instrument (not a context-only index)',asset.type!=='INDEX');
    // EMA20 trend pullback: a short declining-volume retracement in an uptrend.
    // A first/second touch episode is counted since the latest 50-bar high.
    if(atr>0 && n>=60) {
      const ema=TA.ema(c.map(b=>b.c),20),before=c.slice(n-25,n-5);
      const baseVol=mean(before.map(b=>b.v)),pullback=c.slice(n-5,n-1);
      let peak=n-50; for(let i=n-50;i<n-5;i++) if(c[i].h>c[peak].h) peak=i;
      let touches=0,wasNear=false;
      for(let i=peak+1;i<n-1;i++){const near=ema[i]!=null&&c[i].l<=ema[i]+.25*atr; if(near&&!wasNear)touches++;wasNear=near;}
      const touched=pullback.some((b,i)=>b.l<=ema[n-5+i]+.35*atr&&b.c>=ema[n-5+i]-.5*atr);
      const up=A.structure.trend==='uptrend'&&L.sma200!=null&&L.price>L.sma200&&L.adx>=20&&ema[n-2]>ema[n-12];
      const controlled=mean(pullback.map(b=>b.v))<baseVol && pullback.at(-1).c<pullback[0].c && Math.max(...pullback.map(b=>b.h))-Math.min(...pullback.map(b=>b.l))<=4*atr;
      if(up&&touched&&controlled&&touches>0&&touches<=2) {
        const trigger=prev.h+.05*atr, stop=Math.min(...pullback.map(b=>b.l))-.25*atr;
        const resistance=A.srZones.filter(z=>z.price>trigger).sort((a,b)=>a.price-b.price)[0];
        const target=resistance?.price ?? Math.max(...c.slice(peak,n-5).map(b=>b.h));
        candidates.push({key:'pullback',name:'EMA20 trend pullback',trigger,stop,target,
          confirmed:last.c>trigger&&last.c>ema[n-1],invalid:last.c<=stop,
          triggerNote:'Wait for a completed '+tf.barClose+' above '+precise(trigger)+' and a reclaim of EMA20. Fill only inside the permitted entry band.',
          stopNote:'Below the four-bar pullback low, with a 0.25 ATR buffer.',
          reason:'Rising structure and EMA20; first/second touch episode with a controlled, lighter-volume pullback.',source:'Stewie · trend pullback (app adaptation)',
          annotation:{from:{i:n-5,price:trigger},to:{i:n-1,price:trigger},kind:'pattern',color:'#739fbd',label:'Pullback confirmation trigger'}});
      }
      if(geo.box){
        const b=geo.box;
        const baseVol=mean(c.slice(b.start,b.end+1).map(x=>x.v));
        const breakoutIndex=c.findIndex((x,i)=>i>b.end&&i<n-2&&x.c>b.top+.05*atr&&x.v>1.3*baseVol);
        const retest=breakoutIndex>=0?c.slice(breakoutIndex+1,n-1):[];
        const held=retest.length>0&&retest.some(x=>x.l<=b.top+.35*atr)&&retest.every(x=>x.c>=b.top-.25*atr)&&mean(retest.map(x=>x.v))<c[breakoutIndex].v;
        const trigger=held?Math.max(prev.h,b.top)+.05*atr:b.top+.05*atr;
        const stop=held?Math.min(...retest.map(x=>x.l))-.25*atr:b.bottom-.25*atr;
        const measured=b.top+(b.top-b.bottom);
        const obstacle=A.srZones.filter(z=>z.price>trigger).sort((a,b)=>a.price-b.price)[0]?.price;
        const target=obstacle?Math.min(obstacle,measured):measured;
        candidates.push({key:'breakout',name:'Range breakout / retest',trigger,stop,target,formationPending:!held,
          confirmed:held&&last.c>trigger,invalid:last.c<b.bottom,
          triggerNote:'After a volume-backed range breakout, wait for a lighter-volume retest to hold old resistance, then a completed '+tf.barClose+' above the retest high.',
          stopNote:held?'Below the retest low with a 0.25 ATR buffer.':'No execution stop until a successful retest forms.',
          reason:held?'A volume-backed breakout followed by a lighter-volume retest holding old resistance.':'Two touches on each range boundary; waiting for a volume-backed breakout and successful retest.',source:'Edwards & Magee / Stewie / Coulling · breakout retest (app adaptation)'});
      }
    }
    for(const s of candidates){
      s.plan=s.formationPending?null:makePlan(s,A,tf);s.blockers=[];
      if(!s.formationPending&&(!s.plan||s.plan.rr1<2))s.blockers.push('Less than 2R to the first structural objective');
      if(!htfAligned)s.blockers.push('Higher timeframe does not confirm');
      if(marketCtx.regime==='risk-off')s.blockers.push('Market tide is risk-off');
      if(!liquidityOK)s.blockers.push('Liquidity requirement not met');
      if(asset.type==='INDEX')s.blockers.push('Index is context only; no cash-share execution');
      s.status=unavailable?'unavailable':s.invalid?'blocked':s.blockers.length?'blocked':s.formationPending?'waiting':L.price>s.plan.maxEntry?'extended':s.confirmed?'ready':'waiting';
    }
    candidates.sort((a,b)=>statusOrder[a.status]-statusOrder[b.status]);
    const selected=candidates[0]||null;
    const status=unavailable?'unavailable':selected?.status||'watching';
    const plan=selected?.plan||null;
    const reasons=selected?[selected.reason,...checks.filter(x=>x.pass).map(x=>x.label)]:checks.filter(x=>x.pass).map(x=>x.label);
    const negatives=[...(asset.dataIssue?[asset.dataIssue]:[]),...checks.filter(x=>!x.pass).map(x=>x.label+' — not met'),...(selected?.blockers||[])];
    if(status==='extended')negatives.push('Price is beyond the permitted entry band. Wait for a new setup.');
    if(!selected)negatives.push('Neither focused setup meets its formation rules.');
    // Checklist coverage is for sorting, not a probability of winning.
    const score=Math.round(100*(checks.filter(x=>x.pass).length+(selected?1:0)+(selected?.confirmed?1:0))/7);
    const flags=negatives.map(text=>({text,src}));
    const pats=Patterns.detect(c,A.srZones,12);
    return {version:VERSION,score,status,verdict:statusLabels[status],verdictClass:status==='ready'?'strong':status==='waiting'?'ok':status==='watching'||status==='extended'?'wait':'avoid',
      setup:selected?.name||'No qualifying setup',selected,candidates,checks,plan,
      entryDistance:plan?100*(plan.entryLow-L.price)/L.price:null,
      asOf:last.t,htfAligned,liquidityOK,marketCtx,
      pros:reasons.map(text=>({pts:0,text,src})),cons:negatives.map(text=>({pts:0,text,src})),flags,
      riskFactors:flags.map(f=>({...f,hard:status==='blocked'||status==='unavailable'})),
      patterns:pats,chartPatterns:geo.box?[{key:'rectangle',name:'Range rectangle',dir:selected?.confirmed?'up':'neutral',ageBars:0,confirmed:candidates.find(s=>s.key==='breakout')?.confirmed||false,note:'Geometric candidate, not a historical win-rate estimate.'}]:[],
      annotations:[...geo.lines,...(selected?.annotation?[selected.annotation]:[])],gaps:[],noDemandSupply:[],volumeProfile:A.volumeProfile,
      divergence:null,sr:nearestLevels(A.srZones,L.price),atrPct:atr/L.price*100,structure:A.structure,latest:L,
      regime:L.adx>=25?'trending':L.adx<18?'ranging':'mixed'};
  }
  // Short setups are explicit app adaptations of bearish continuation and
  // support-break/retest concepts in Stewie and Edwards & Magee notes.
  function assessShort(asset,A,higher,marketCtx,tf) {
    const R=assess({...asset,side:'long'},A,higher,marketCtx,tf);
    const c=asset.candles,n=c.length,L=A.latest,atr=L.atr,last=c.at(-1),prev=c.at(-2),geo=geometry(c,A);
    const aligned=!!higher&&higher.latest.sma20!=null&&higher.latest.price<higher.latest.sma20&&higher.structure.trend!=='uptrend';
    const candidates=[],src='TradeSight short-side adaptation · Stewie / Edwards & Magee';
    const checks=R.checks.map(x=>({...x}));
    checks[1]={label:'Higher timeframe supports shorts',pass:aligned};
    checks[2]={label:'Market tide is not risk-on',pass:!!marketCtx.regime&&!['risk-on','unavailable'].includes(marketCtx.regime)};
    checks.push({label:'Short analysis supported for this instrument and horizon',pass:asset.type==='PERPETUAL'||(!asset.isCrypto&&asset.type!=='INDEX'&&tf.mode==='intraday')});
    const ema=TA.ema(c.map(x=>x.c),20),pull=c.slice(-5,-1),base=mean(c.slice(-25,-5).map(x=>x.v));
    if(n>=200&&atr>0&&A.structure.trend==='downtrend'&&L.price<L.sma200&&L.adx>=20&&ema[n-2]<ema[n-12]&&pull.at(-1).c>pull[0].c&&mean(pull.map(x=>x.v))<base&&Math.max(...pull.map(x=>x.h))-Math.min(...pull.map(x=>x.l))<=4*atr&&pull.some((x,i)=>x.h>=ema[n-5+i]-.35*atr&&x.c<=ema[n-5+i]+.5*atr)) {
      const trigger=prev.l-.05*atr,stop=Math.max(...pull.map(x=>x.h))+.25*atr;
      const target=A.srZones.filter(z=>z.price<trigger).sort((a,b)=>b.price-a.price)[0]?.price??Math.min(...c.slice(-50,-5).map(x=>x.l));
      candidates.push({key:'pullback',name:'EMA20 bearish rally',trigger,stop,target,confirmed:last.c<trigger&&last.c<ema[n-1],invalid:last.c>=stop,reason:'Falling structure and EMA20 with a controlled, lighter-volume rally.',triggerNote:'Wait for a completed '+tf.barClose+' below '+precise(trigger)+' and rejection of EMA20.',stopNote:'Above the four-bar rally high with a 0.25 ATR buffer.',source:src});
    }
    if(geo.box&&atr>0){
      const b=geo.box,baseVol=mean(c.slice(b.start,b.end+1).map(x=>x.v));
      const i=c.findIndex((x,i)=>i>b.end&&i<n-2&&x.c<b.bottom-.05*atr&&x.v>1.3*baseVol);
      const retest=i>=0?c.slice(i+1,n-1):[];
      const held=retest.length>0&&retest.some(x=>x.h>=b.bottom-.35*atr)&&retest.every(x=>x.c<=b.bottom+.25*atr)&&mean(retest.map(x=>x.v))<c[i].v;
      const trigger=(held?Math.min(prev.l,b.bottom):b.bottom)-.05*atr,stop=held?Math.max(...retest.map(x=>x.h))+.25*atr:b.top+.25*atr;
      const measured=b.bottom-(b.top-b.bottom),support=A.srZones.filter(z=>z.price<trigger).sort((a,b)=>b.price-a.price)[0]?.price;
      candidates.push({key:'breakout',name:'Range breakdown / retest',trigger,stop,target:support?Math.max(support,measured):measured,formationPending:!held,confirmed:held&&last.c<trigger,invalid:last.c>b.top,reason:held?'Support broke and a lighter-volume rally rejected it as resistance.':'Waiting for a support breakdown and failed reclaim of the range.',triggerNote:'After a volume-backed breakdown and failed retest, wait for a completed '+tf.barClose+' below '+precise(trigger)+'.',stopNote:'Above the retest high with a 0.25 ATR buffer.',source:src});
    }
    for(const s of candidates){
      const risk=s.stop-s.trigger,rr=(s.trigger-s.target)/risk;
      const floor=Math.max(s.trigger-.25*atr,(s.target+2*s.stop)/3);
      s.plan=!s.formationPending&&s.target>0&&risk>0&&s.target<s.trigger?{side:'short',entryLow:precise(Math.min(s.trigger,floor)),entryHigh:precise(s.trigger),minEntry:precise(floor),maxEntry:precise(s.trigger),entryNote:s.triggerNote,stop:precise(s.stop),stopNote:s.stopNote,stopPct:100*risk/s.trigger,rr1:rr,rr2:rr,targets:[{label:'Buy to cover at structural support',price:precise(s.target),rr}],exitRules:['Buy to cover if the protective stop above entry is reached.','Cover at the planned target; do not widen the stop.',asset.type==='PERPETUAL'?'Check Jupiter borrow fees, available liquidity and liquidation distance before any position.':'Close the intraday short before your broker’s square-off deadline.','Re-evaluate on the next completed candle.']}:null;
      s.blockers=checks.filter(x=>!x.pass).map(x=>x.label+' — not met');
      if(!s.formationPending&&(!s.plan||rr<2))s.blockers.push('Less than 2R to structural support');
      s.status=!checks[0].pass?'unavailable':s.invalid||s.blockers.length?'blocked':s.formationPending?'waiting':last.c<floor?'extended':s.confirmed?'ready':'waiting';
    }
    candidates.sort((a,b)=>statusOrder[a.status]-statusOrder[b.status]);
    const selected=candidates[0]||null,plan=selected?.plan||null,status=!checks[0].pass?'unavailable':!checks.at(-1).pass?'blocked':selected?.status||'watching';
    const negatives=[...(asset.dataIssue?[asset.dataIssue]:[]),...checks.filter(x=>!x.pass).map(x=>x.label+' — not met'),...(selected?.blockers||[])];
    if(!selected)negatives.push('No qualifying short formation.');
    const flags=[...new Set(negatives)].map(text=>({text,src}));
    return {...R,side:'short',status,verdict:statusLabels[status],verdictClass:status==='ready'?'strong':status==='waiting'?'ok':status==='watching'||status==='extended'?'wait':'avoid',setup:selected?.name||'No qualifying short setup',selected,candidates,checks,plan,htfAligned:aligned,score:Math.round(100*(checks.filter(x=>x.pass).length+(selected?1:0)+(selected?.confirmed?1:0))/8),entryDistance:plan?100*(L.price-plan.entryHigh)/L.price:null,pros:checks.filter(x=>x.pass).map(x=>({text:x.label,src,pts:0})),cons:flags.map(x=>({...x,pts:0})),flags,riskFactors:flags.map(x=>({...x,hard:status==='blocked'||status==='unavailable'})),annotations:geo.lines,chartPatterns:geo.box?[{key:'rectangle',name:'Range breakdown',dir:'down',ageBars:0,confirmed:!!selected?.confirmed}]:[]};
  }

  function positionSize(account,riskPct,entry,stop,options={}) {
    const {isCrypto=false,available=account,costBps=10,riskMultiplier=1,side='long'}=options;
    if(![account,riskPct,entry,stop,available,costBps].every(Number.isFinite)||account<=0||riskPct<=0||riskPct>1||stop<=0||entry<=0||(side==='short'?stop<=entry:entry<=stop)||available<0||costBps<0)return null;
    const budget=account*riskPct/100*riskMultiplier;
    const perUnit=Math.abs(entry-stop)+entry*costBps/10000;
    const maxValue=Math.min(available,account*KB.riskManagement.maxPositionPct/100);
    const raw=Math.min(budget/perUnit,maxValue/entry),step=isCrypto?1e-6:1;
    const units=precise(Math.floor(raw/step)*step),value=units*entry,riskAmt=units*perUnit;
    return {units,value:precise(value),riskAmt:precise(riskAmt),actualRiskPct:riskAmt/account*100,capped:raw<budget/perUnit,estimatedCosts:precise(units*entry*costBps/10000)};
  }
  function sqn(values) {
    const r=values.filter(Number.isFinite);if(r.length<5)return null;
    const avg=mean(r),sd=Math.sqrt(mean(r.map(x=>(x-avg)**2)));
    if(!sd)return null;
    const value=avg/sd*Math.sqrt(Math.min(r.length,100));
    return {value:+value.toFixed(2),rating:value<1?'Weak':value<2?'Average':value<3?'Good':'High — validate independently',sampleSize:r.length,reliable:r.length>=20,
      maxPortfolioHeatPct:2,note:'Research journal only. SQN does not increase the app’s 2% portfolio-risk budget; correlated positions and gap risk need separate review.'};
  }
  function marketRegime(a,label='SOL') {
    if(!a||a.latest.sma200==null)return {regime:'unavailable',detail:'Insufficient completed history for the 200-bar average',anchorTrend:null,anchorLabel:label};
    const L=a.latest,S=a.structure;
    const regime=S.trend==='downtrend'||L.price<L.sma200?'risk-off':L.price>L.sma50&&S.trend==='uptrend'?'risk-on':'mixed';
    return {regime,detail:label+' · '+S.trend,anchorTrend:regime==='risk-off'?'down':regime==='risk-on'?'up':null,anchorLabel:label};
  }
  return {assess,positionSize,sqn,marketRegime,nearestLevels,geometry,TF_SWING,TF_INTRADAY,statusOrder,VERSION};
})();
