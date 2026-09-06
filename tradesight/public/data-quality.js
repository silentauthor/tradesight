/* Market-specific candle completion and freshness. Exchange holidays are not
   inferred: a missing weekday session is explicitly shown as unavailable. */
'use strict';
const DataQuality = (() => {
  const DAY=86400000, IST=19800000;
  const midnight=t=>Math.floor((t+IST)/DAY)*DAY-IST;
  function closeTime(c,interval,source) {
    if(source==='dhan'&&interval==='1d')return midnight(c.t)+15.5*3600000;
    if(source==='dhan'&&interval==='1wk')return c.t+4*DAY+10*3600000;
    const size={'15m':900000,'30m':1800000,'1h':3600000,'1d':DAY,'1wk':7*DAY}[interval];
    return source==='dhan'?Math.min(c.t+size,midnight(c.t)+15.5*3600000):c.t+size;
  }
  function completed(candles,interval,source,now=Date.now()) {
    const seen=new Set();
    return candles.filter(c=>[c.t,c.o,c.h,c.l,c.c,c.v].every(Number.isFinite)&&c.t>0&&c.l>0&&c.h>=Math.max(c.o,c.c)&&c.l<=Math.min(c.o,c.c)&&c.v>=0)
      .sort((a,b)=>a.t-b.t).filter(c=>{if(seen.has(c.t)||closeTime(c,interval,source)>now)return false;seen.add(c.t);return true;});
  }
  function issue(candles,interval,source,now=Date.now()) {
    if(!candles.length)return 'No valid completed candles';
    const latest=closeTime(candles.at(-1),interval,source);
    if(source==='dhan') {
      let day=midnight(now),dow=new Date(day+IST).getUTCDay();
      if(now<day+15.5*3600000||dow===0||dow===6)day-=DAY;
      while([0,6].includes(new Date(day+IST).getUTCDay()))day-=DAY;
      const sessionClose=day+15.5*3600000;
      const today=midnight(now),weekday=new Date(today+IST).getUTCDay();
      const inSession=weekday>0&&weekday<6&&now>=today+9.25*3600000&&now<=today+15.5*3600000;
      const tolerance=interval==='1d'?DAY:interval==='1h'?7200000:1800000;
      if(interval!=='1d'&&inSession&&now>=today+10.25*3600000&&now-latest>tolerance)return 'Intraday candles are stale';
      if(latest<sessionClose-3600000)return 'Latest completed exchange session is missing (check holidays or data feed)';
    } else {
      const tolerance=interval==='1d'?2*DAY:interval==='1wk'?8*DAY:interval==='1h'?7200000:1800000;
      if(now-latest>tolerance)return 'Latest completed candles are stale';
    }
    return null;
  }
  return {completed,issue,closeTime};
})();
