'use strict';
// Market identifiers and read-only endpoint from jup-ag/cli's PerpsClient and Asset.
const MARKETS = {
  SOL:'So11111111111111111111111111111111111111112',
  BTC:'3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  ETH:'7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
};
const cache=new Map();
function market(address){const symbol=Object.keys(MARKETS).find(s=>MARKETS[s]===address);if(!symbol)throw new Error('Unsupported Jupiter Perps market');return symbol;}
async function stats(address){
  market(address);const hit=cache.get(address);if(hit&&Date.now()-hit.at<30000)return hit.value;
  const r=await fetch('https://perps-api.jup.ag/v2/market-stats?mint='+address,{signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Jupiter market data unavailable ('+r.status+')');
  const d=await r.json(),price=Number(d.price),volume24h=Number(d.volume);
  if(!(price>0)||!Number.isFinite(volume24h))throw new Error('Invalid Jupiter market response');
  const value={price,volume24h,change24h:Number(d.priceChange24H),fetchedAt:Date.now()};cache.set(address,{at:Date.now(),value});return value;
}
function list(){return Object.entries(MARKETS).map(([symbol,address])=>({symbol,address,name:symbol+' perpetual',exchange:'Jupiter Perps',type:'PERPETUAL'}));}
module.exports={market,stats,list,MARKETS};
