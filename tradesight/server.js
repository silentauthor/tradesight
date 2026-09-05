#!/usr/bin/env node
/**
 * TradeSight server — zero-dependency Node.js (v18+).
 * Serves the static frontend and proxies Solana token market data from the
 * Birdeye Data API (https://public-api.birdeye.so) with in-memory caching so
 * the browser never hits CORS walls or rate limits.
 *
 * Requires a Birdeye API key:  BIRDEYE_API_KEY=<key> node server.js
 * or drop it in tradesight/.env and run:  node --env-file=.env server.js
 *
 * Run: node server.js   (then open http://localhost:8742)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const dhanSrc = require('./dhan'); // Dhan (Indian NSE/BSE) data source

const PORT = process.env.PORT || 8742;
const PUBLIC_DIR = path.join(__dirname, 'public');

const BIRDEYE_BASE = 'https://public-api.birdeye.so';
const BIRDEYE_KEY = process.env.BIRDEYE_API_KEY || '';
const CHAIN = 'solana';
// Wrapped SOL — the market-tide anchor. This mint never changes.
const SOL_MINT = 'So11111111111111111111111111111111111111112';
// Base58 SPL mint address.
const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ---------- tiny TTL cache ----------
const cache = new Map(); // key -> {expires, value}
function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) cache.delete(key);
  return null;
}
function cacheSet(key, value, ttlMs) {
  if (cache.size > 500) { // simple bound
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { expires: Date.now() + ttlMs, value });
}

// ---------- Birdeye client ----------
async function birdeye(pathAndQuery, ttlMs) {
  if (!BIRDEYE_KEY) throw new Error('BIRDEYE_API_KEY not set — see README (put it in tradesight/.env)');
  const url = BIRDEYE_BASE + pathAndQuery;
  const cached = cacheGet(url);
  if (cached) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { 'X-API-KEY': BIRDEYE_KEY, 'x-chain': CHAIN, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (res.status === 401) throw new Error('Birdeye rejected the API key (401) — check BIRDEYE_API_KEY');
    if (res.status === 429) throw new Error('Birdeye rate limit hit (429) — slow down or wait a minute');
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = await res.json();
    if (json && json.success === false) throw new Error(json.message || 'birdeye error');
    cacheSet(url, json, ttlMs);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- data normalization ----------
const VALID_RANGE = new Set(['3d', '5d', '10d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max']);
const RANGE_DAYS = { '3d': 3, '5d': 5, '10d': 10, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825, 'max': 3650 };
// Frontend interval token -> Birdeye `type`.
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
    // Birdeye has no 52-week field — these are the high/low over the fetched window.
    high52: hi,
    low52: lo,
    liquidity: od.liquidity ?? null,
    marketCap: od.marketCap ?? null,
    candles,
  };
}

async function getChart(address, range = '1y', interval = '1d', source = 'birdeye') {
  if (source === 'dhan') return dhanSrc.getChartDhan(address, range, interval);
  if (!ADDR_RE.test(address)) throw new Error('invalid Solana token address');
  if (!VALID_RANGE.has(range)) range = '1y';
  const type = INTERVAL_MAP[interval] || '1D';
  const days = RANGE_DAYS[range] || 365;
  const timeTo = Math.floor(Date.now() / 1000);
  const timeFrom = timeTo - days * 86400;
  const higherTf = interval === '1d' || interval === '1wk';
  const ttl = higherTf ? 5 * 60 * 1000 : 60 * 1000; // intraday candles refresh faster
  const [ohlcv, overview] = await Promise.all([
    birdeye(`/defi/v3/ohlcv?address=${address}&type=${type}&time_from=${timeFrom}&time_to=${timeTo}`, ttl),
    birdeye(`/defi/token_overview?address=${address}`, 60 * 1000).catch(() => null),
  ]);
  return normalizeChart(address, ohlcv, overview);
}

// Stablecoins / SOL liquid-staking derivatives / obvious junk that pollute a
// volume-sorted feed and are meaningless to run technical analysis on.
const STABLE_RE = /^(USD[CTGP1]?|USDT|USDG|PYUSD|USDS|FDUSD|DAI|EUR[CS]|USDE|USDY|UXD|USH|USDR|USDD)$/i;
const LST_RE = /^[a-zA-Z]{1,7}SOL$/; // jitoSOL, bnSOL, mSOL, dSOL, bbSOL, jupSOL, …
function tradeable(t) {
  const sym = (t.symbol || '');
  const up = sym.toUpperCase();
  if (STABLE_RE.test(sym)) return false;
  if (/USD$/.test(up) && t.price != null && Math.abs(t.price - 1) < 0.05) return false; // *USD peg (JupUSD, …)
  if (LST_RE.test(sym) && up !== 'SOL') return false;
  if (t.price != null && Math.abs(t.price - 1) < 0.015) return false; // any unnamed peg
  if (Math.abs(t.change24h ?? 0) > 90) return false; // rug / mispriced
  return true;
}

// ---------- request handlers ----------
async function apiSearch(params) {
  const q = (params.get('q') || '').slice(0, 60).trim();
  if (!q) return { quotes: [] };
  if ((params.get('source') || 'birdeye') === 'dhan') return dhanSrc.searchDhan(q);

  // A pasted mint address — resolve it directly.
  if (ADDR_RE.test(q)) {
    const ov = await birdeye(`/defi/token_overview?address=${q}`, 10 * 60 * 1000).catch(() => null);
    const d = ov?.data;
    if (!d) return { quotes: [] };
    return { quotes: [{ symbol: d.symbol || short(q), name: d.name || d.symbol || 'token', type: 'CRYPTOCURRENCY', exchange: 'Solana', address: q, sector: null }] };
  }

  const json = await birdeye(
    `/defi/v3/search?keyword=${encodeURIComponent(q)}&chain=${CHAIN}&target=token&sort_by=liquidity&sort_type=desc&offset=0&limit=15`,
    10 * 60 * 1000,
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
  // Exact symbol match first, then by liquidity — Birdeye's raw order buries
  // the obvious pick under staked / wrapped variants.
  const want = q.toUpperCase();
  quotes.sort((a, b) => (b.symbol.toUpperCase() === want) - (a.symbol.toUpperCase() === want) || (b.liquidity - a.liquidity));
  return { quotes: quotes.slice(0, 8).map(({ liquidity, ...q }) => q) };
}

async function apiChart(params) {
  const source = params.get('source') || 'birdeye';
  return getChart(params.get('address') || params.get('symbol') || '', params.get('range') || '1y', params.get('interval') || '1d', source);
}

// Batch endpoint for the scanner / watchlist: compact OHLCV for many instruments,
// limited concurrency to stay under the upstream rate limit.
async function apiBatch(params) {
  const source = params.get('source') || 'birdeye';
  const valid = source === 'dhan' ? dhanSrc.DHAN_ADDR_RE : ADDR_RE;
  const addrs = (params.get('addresses') || params.get('symbols') || '')
    .split(',').map(s => s.trim()).filter(s => valid.test(s)).slice(0, 50);
  const range = params.get('range') || '6mo';
  const interval = params.get('interval') || '1d';
  const out = {};
  const queue = [...addrs];
  const concurrency = source === 'dhan' ? 3 : 5; // Dhan data APIs: 5 req/s
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const addr = queue.shift();
      try {
        out[addr] = await getChart(addr, range, interval, source);
      } catch (e) {
        out[addr] = { error: String(e.message || e) };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

// Scanner universe. Birdeye: trending Solana tokens by 24h volume, curated.
// Dhan: NIFTY 50 constituents (Dhan has no "most active" feed).
async function apiTokenList(params) {
  const limit = Math.min(Math.max(+params.get('limit') || 30, 1), 50);
  if ((params.get('source') || 'birdeye') === 'dhan') return dhanSrc.niftyList(limit);
  const minLiq = Math.max(+params.get('min_liquidity') || 500000, 0);
  const json = await birdeye(
    `/defi/v3/token/list?sort_by=volume_24h_usd&sort_type=desc&min_liquidity=${minLiq}&offset=0&limit=100`,
    10 * 60 * 1000,
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

function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const handler = ROUTES[url.pathname];
  if (handler) {
    try {
      const data = await handler(url.searchParams);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch (e) {
      const msg = String(e.message || e);
      res.writeHead(/not found|invalid|no price history/i.test(msg) ? 404 : 502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }
  if (req.method === 'GET') return serveStatic(req, res, url.pathname);
  res.writeHead(405); res.end();
});

server.listen(PORT, () => {
  console.log(`TradeSight running → http://localhost:${PORT}`);
  if (!BIRDEYE_KEY) console.warn('⚠  BIRDEYE_API_KEY is not set — Birdeye (Solana) /api calls will fail. Put it in tradesight/.env');
  if (!dhanSrc.dhanConfigured()) console.warn('ℹ  DHAN_ACCESS_TOKEN is not set — the Dhan (NSE/BSE) source is unavailable until you add it to tradesight/.env');
});
