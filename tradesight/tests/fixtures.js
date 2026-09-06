/* Synthetic candles for deterministic regression checks. Never market data. */
(function(root){
  function candles(n=300, step=86400000, source='birdeye') {
    let times=[];
    if(source==='dhan') {
      let d=new Date();d.setUTCHours(0,0,0,0);
      for(let k=0;times.length<n+5;k++) {let t=d.getTime()-k*86400000,day=new Date(t).getUTCDay();if(day===0||day===6)continue;
        if(step<86400000){for(let j=24;j>=0;j--){const start=t+13500000+j*900000;if(start+step<Date.now())times.push(start);}}
        else if(t+36000000<Date.now())times.push(t);
      }
      times=times.sort((a,b)=>a-b).slice(-n);
    }else {const end=Math.floor(Date.now()/step)*step;times=Array.from({length:n},(_,i)=>end-(n-i)*step);}
    const c=times.map((t,i)=>{const p=90+i*.2+Math.sin(i*.3)*2;return{t,o:p-.2,h:p+.8,l:p-.8,c:p,v:1000000};});
    const start=n-36;
    for(let i=start;i<n-5;i++){const p=153+Math.sin((i-start)*Math.PI/4)*2.5;c[i]={t:times[i],o:p-.15,h:p+.7,l:p-.7,c:p,v:900000};}
    const values=[{o:155.5,h:157.6,l:155.3,c:157.3,v:2300000},{o:157.3,h:157.4,l:156,c:156.5,v:700000},{o:156.5,h:156.8,l:155.9,c:156.3,v:650000},{o:156.3,h:156.7,l:155.95,c:156.4,v:600000},{o:156.4,h:157.1,l:156.2,c:156.9,v:1100000}];
    values.forEach((b,i)=>c[n-5+i]={t:times[n-5+i],...b});
    return c;
  }
  root.fixtureCandles=candles;
  if(typeof module!=='undefined')module.exports=candles;
})(typeof window==='undefined'?globalThis:window);
