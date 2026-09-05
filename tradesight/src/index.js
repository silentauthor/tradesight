/**
 * TradeSight — Cloudflare Worker.
 * Serves the static frontend (via the `assets` binding) and proxies Solana
 * token market data from the Birdeye Data API (https://public-api.birdeye.so)
 * with edge caching so the browser never hits CORS walls or rate limits.
 * Port of server.js for the Workers runtime.
 *
 * Requires a secret:  wrangler secret put BIRDEYE_API_KEY
 * (for `wrangler dev`, put BIRDEYE_API_KEY=<key> in tradesight/.dev.vars)
 */

const BIRDEYE_BASE = 'https://public-api.birdeye.so';
const CHAIN = 'solana';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// ---------- Birdeye client via the Workers Cache API ----------
async function birdeye(pathAndQuery, ttlSeconds, ctx, key) {
  if (!key) throw new Error('BIRDEYE_API_KEY not set — wrangler secret put BIRDEYE_API_KEY');
  const url = BIRDEYE_BASE + pathAndQuery;
  const cache = caches.default;
  const cacheKey = new Request(url, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  const res = await fetch(url, {
    headers: { 'X-API-KEY': key, 'x-chain': CHAIN, accept: 'application/json' },
  });
  if (res.status === 401) throw new Error('Birdeye rejected the API key (401)');
  if (res.status === 429) throw new Error('Birdeye rate limit hit (429)');
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = await res.json();
  if (data && data.success === false) throw new Error(data.message || 'birdeye error');
  const cacheRes = new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttlSeconds}` },
  });
  ctx.waitUntil(cache.put(cacheKey, cacheRes));
  return data;
}

// ---------- data normalization (identical to server.js) ----------
const VALID_RANGE = new Set(['3d', '5d', '10d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max']);
const RANGE_DAYS = { '3d': 3, '5d': 5, '10d': 10, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825, 'max': 3650 };
const INTERVAL_MAP = { '1d': '1D', '1wk': '1W', '1h': '1H', '30m': '30m', '15m': '15m' };

const short = (a) => a.slice(0, 4) + '…' + a.slice(-4);

function normalizeChart(address, ohlcvJson, overviewJson) {
  const items = ohlcvJson?.data?.items || [];
  const candles = [];
  for (const it of items) {
    const t = it.unix_time ?? it.unixTime ?? it.time;
    const o = it.o, h = it.h, l = it.l, c = it.c;
    if (t == null || o == null || h == null || l == null || c == null) continue;
    candles.push({ t: t * 1000, o, h, l, c, v: it.v ?? it.volume ?? 0 });
  }
  candles.sort((a, b) => a.t - b.t);
  if (candles.length < 2) throw new Error('no price history for this token');

  const od = overviewJson?.data || {};
  let hi = -Infinity, lo = Infinity;
  for (const k of candles) { if (k.h > hi) hi = k.h; if (k.l < lo) lo = k.l; }
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  return {
    symbol: (od.symbol || short(address)).replace(/^\$/, ''),
    name: od.name || od.symbol || 'Unknown token',
    address,
    currency: 'USD',
    exchange: 'Solana',
    type: 'CRYPTOCURRENCY',
    price: od.price ?? last.c,
    prevClose: prev.c,
    high52: hi,
    low52: lo,
    liquidity: od.liquidity ?? null,
    marketCap: od.marketCap ?? null,
    candles,
  };
}

async function getChart(address, range, interval, ctx, key) {
  if (!ADDR_RE.test(address)) throw new Error('invalid Solana token address');
  if (!VALID_RANGE.has(range)) range = '1y';
  const type = INTERVAL_MAP[interval] || '1D';
  const days = RANGE_DAYS[range] || 365;
  const timeTo = Math.floor(Date.now() / 1000);
  const timeFrom = timeTo - days * 86400;
  const higherTf = interval === '1d' || interval === '1wk';
  const ttl = higherTf ? 300 : 60; // intraday candles refresh faster
  const [ohlcv, overview] = await Promise.all([
    birdeye(`/defi/v3/ohlcv?address=${address}&type=${type}&time_from=${timeFrom}&time_to=${timeTo}`, ttl, ctx, key),
    birdeye(`/defi/token_overview?address=${address}`, 60, ctx, key).catch(() => null),
  ]);
  return normalizeChart(address, ohlcv, overview);
}

const STABLE_RE = /^(USD[CTGP1]?|USDT|USDG|PYUSD|USDS|FDUSD|DAI|EUR[CS]|USDE|USDY|UXD|USH|USDR|USDD)$/i;
const LST_RE = /^[a-zA-Z]{1,7}SOL$/;
function tradeable(t) {
  const sym = (t.symbol || '');
  const up = sym.toUpperCase();
  if (STABLE_RE.test(sym)) return false;
  if (/USD$/.test(up) && t.price != null && Math.abs(t.price - 1) < 0.05) return false;
  if (LST_RE.test(sym) && up !== 'SOL') return false;
  if (t.price != null && Math.abs(t.price - 1) < 0.015) return false;
  if (Math.abs(t.change24h ?? 0) > 90) return false;
  return true;
}

// ---------- route handlers ----------
async function apiSearch(params, ctx, key) {
  const q = (params.get('q') || '').slice(0, 60).trim();
  if (!q) return { quotes: [] };

  if (ADDR_RE.test(q)) {
    const ov = await birdeye(`/defi/token_overview?address=${q}`, 600, ctx, key).catch(() => null);
    const d = ov?.data;
    if (!d) return { quotes: [] };
    return { quotes: [{ symbol: d.symbol || short(q), name: d.name || d.symbol || 'token', type: 'CRYPTOCURRENCY', exchange: 'Solana', address: q, sector: null }] };
  }

  const json = await birdeye(
    `/defi/v3/search?keyword=${encodeURIComponent(q)}&chain=${CHAIN}&target=token&sort_by=liquidity&sort_type=desc&offset=0&limit=15`,
    600, ctx, key,
  );
  const groups = json?.data?.items || [];
  const quotes = [];
  for (const g of groups) {
    if (g.type !== 'token') continue;
    for (const r of (g.result || [])) {
      if (r.network && r.network !== CHAIN) continue;
      if (!r.address || !ADDR_RE.test(r.address)) continue;
      quotes.push({
        symbol: (r.symbol || short(r.address)).replace(/^\$/, ''),
        name: r.name || r.symbol || 'token',
        type: 'CRYPTOCURRENCY',
        exchange: 'Solana',
        address: r.address,
        liquidity: r.liquidity ?? 0,
        sector: null,
      });
    }
  }
  const want = q.toUpperCase();
  quotes.sort((a, b) => (b.symbol.toUpperCase() === want) - (a.symbol.toUpperCase() === want) || (b.liquidity - a.liquidity));
  return { quotes: quotes.slice(0, 8).map(({ liquidity, ...q }) => q) };
}

async function apiChart(params, ctx, key) {
  return getChart(params.get('address') || params.get('symbol') || '', params.get('range') || '1y', params.get('interval') || '1d', ctx, key);
}

async function apiBatch(params, ctx, key) {
  const addrs = (params.get('addresses') || params.get('symbols') || '')
    .split(',').map(s => s.trim()).filter(s => ADDR_RE.test(s)).slice(0, 40);
  const range = params.get('range') || '6mo';
  const interval = params.get('interval') || '1d';
  const out = {};
  const queue = [...addrs];
  const workers = Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const addr = queue.shift();
      try {
        out[addr] = await getChart(addr, range, interval, ctx, key);
      } catch (e) {
        out[addr] = { error: String(e.message || e) };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function apiTokenList(params, ctx, key) {
  const limit = Math.min(Math.max(+params.get('limit') || 30, 1), 50);
  const minLiq = Math.max(+params.get('min_liquidity') || 500000, 0);
  const json = await birdeye(
    `/defi/v3/token/list?sort_by=volume_24h_usd&sort_type=desc&min_liquidity=${minLiq}&offset=0&limit=100`,
    600, ctx, key,
  );
  const rows = json?.data?.items || [];
  return rows
    .map(t => ({
      address: t.address,
      symbol: t.symbol,
      name: t.name || t.symbol,
      price: t.price,
      liquidity: t.liquidity,
      volume24h: t.volume_24h_usd ?? t.v24hUSD ?? null,
      marketCap: t.market_cap ?? t.mc ?? null,
      change24h: t.price_change_24h_percent ?? t.priceChange24hPercent ?? null,
    }))
    .filter(t => t.address && ADDR_RE.test(t.address) && tradeable(t))
    .slice(0, limit)
    .map((t, i) => ({ ...t, rank: i + 1 }));
}

const ROUTES = {
  '/api/search': apiSearch,
  '/api/chart': apiChart,
  '/api/batch': apiBatch,
  '/api/tokenlist': apiTokenList,
  '/api/crypto/markets': apiTokenList,
};

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const handler = ROUTES[url.pathname];
    if (handler) {
      try {
        const data = await handler(url.searchParams, ctx, env.BIRDEYE_API_KEY);
        return jsonResponse(data, 200);
      } catch (e) {
        const msg = String(e.message || e);
        return jsonResponse({ error: msg }, /not found|invalid|no price history/i.test(msg) ? 404 : 502);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
