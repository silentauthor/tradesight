/**
 * TradeSight — Cloudflare Worker.
 * Serves the static frontend (via the `assets` binding) and proxies market
 * data (Yahoo Finance + CoinGecko) with edge caching so the browser never
 * hits CORS walls or rate limits. Port of server.js for the Workers runtime:
 * the only real change is swapping the Node in-memory Map cache for the
 * platform Cache API (caches.default).
 */

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' };

// ---------- cached fetch via the Workers Cache API ----------
async function fetchJson(url, ttlSeconds, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url, { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit.json();

  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = await res.json();
  const cacheRes = new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttlSeconds}` },
  });
  ctx.waitUntil(cache.put(cacheKey, cacheRes));
  return data;
}

// ---------- data normalization (identical to server.js) ----------
function normalizeChart(yahooJson) {
  const r = yahooJson?.chart?.result?.[0];
  if (!r) {
    const err = yahooJson?.chart?.error?.description || 'symbol not found';
    throw new Error(err);
  }
  const q = r.indicators?.quote?.[0] || {};
  const ts = r.timestamp || [];
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    candles.push({ t: ts[i] * 1000, o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  const m = r.meta || {};
  return {
    symbol: m.symbol,
    name: m.longName || m.shortName || m.symbol,
    currency: m.currency,
    exchange: m.fullExchangeName || m.exchangeName,
    type: m.instrumentType,
    price: m.regularMarketPrice,
    prevClose: m.chartPreviousClose,
    high52: m.fiftyTwoWeekHigh,
    low52: m.fiftyTwoWeekLow,
    candles,
  };
}

const VALID_RANGE = new Set(['1mo', '3mo', '6mo', '1y', '2y', '5y', 'max']);
const VALID_INTERVAL = new Set(['1d', '1wk', '1h', '30m', '15m']);
const SYM_RE = /^[A-Za-z0-9.\-^=]{1,15}$/;

async function getChart(symbol, range = '1y', interval = '1d', ctx) {
  if (!SYM_RE.test(symbol)) throw new Error('invalid symbol');
  if (!VALID_RANGE.has(range)) range = '1y';
  if (!VALID_INTERVAL.has(interval)) interval = '1d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const ttl = interval === '1d' || interval === '1wk' ? 300 : 90;
  return normalizeChart(await fetchJson(url, ttl, ctx));
}

// ---------- route handlers (identical logic to server.js) ----------
async function apiSearch(params, ctx) {
  const q = (params.get('q') || '').slice(0, 60);
  if (!q) return { quotes: [] };
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
  const json = await fetchJson(url, 600, ctx);
  const quotes = (json.quotes || [])
    .filter(x => x.symbol && ['EQUITY', 'CRYPTOCURRENCY', 'ETF', 'INDEX'].includes(x.quoteType))
    .map(x => ({
      symbol: x.symbol,
      name: x.longname || x.shortname || x.symbol,
      type: x.quoteType,
      exchange: x.exchDisp || x.exchange,
      sector: x.sectorDisp || null,
    }));
  return { quotes };
}

async function apiChart(params, ctx) {
  return getChart(params.get('symbol') || '', params.get('range') || '1y', params.get('interval') || '1d', ctx);
}

async function apiBatch(params, ctx) {
  const symbols = (params.get('symbols') || '').split(',').map(s => s.trim()).filter(s => SYM_RE.test(s)).slice(0, 60);
  const range = params.get('range') || '6mo';
  const out = {};
  const queue = [...symbols];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const sym = queue.shift();
      try {
        out[sym] = await getChart(sym, range, '1d', ctx);
      } catch (e) {
        out[sym] = { error: String(e.message || e) };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function apiCryptoMarkets(_params, ctx) {
  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h,7d';
  const json = await fetchJson(url, 300, ctx);
  return json.map(c => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    price: c.current_price,
    marketCap: c.market_cap,
    rank: c.market_cap_rank,
    volume24h: c.total_volume,
    change24h: c.price_change_percentage_24h,
    change7d: c.price_change_percentage_7d_in_currency,
    ath: c.ath,
    athChangePct: c.ath_change_percentage,
  }));
}

const ROUTES = {
  '/api/search': apiSearch,
  '/api/chart': apiChart,
  '/api/batch': apiBatch,
  '/api/crypto/markets': apiCryptoMarkets,
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
        const data = await handler(url.searchParams, ctx);
        return jsonResponse(data, 200);
      } catch (e) {
        const msg = String(e.message || e);
        return jsonResponse({ error: msg }, /not found|invalid/i.test(msg) ? 404 : 502);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
