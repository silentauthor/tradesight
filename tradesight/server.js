#!/usr/bin/env node
/**
 * TradeSight server — zero-dependency Node.js (v18+).
 * Serves the static frontend and proxies market data (Yahoo Finance + CoinGecko)
 * with in-memory caching so the browser never hits CORS walls or rate limits.
 *
 * Run: node server.js   (then open http://localhost:8742)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8742;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' };

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

async function fetchJson(url, ttlMs) {
  const cached = cacheGet(url);
  if (cached) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = await res.json();
    cacheSet(url, json, ttlMs);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- data normalization ----------
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
    type: m.instrumentType, // EQUITY | CRYPTOCURRENCY | ETF | INDEX ...
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

async function getChart(symbol, range = '1y', interval = '1d') {
  if (!SYM_RE.test(symbol)) throw new Error('invalid symbol');
  if (!VALID_RANGE.has(range)) range = '1y';
  if (!VALID_INTERVAL.has(interval)) interval = '1d';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const ttl = interval === '1d' || interval === '1wk' ? 5 * 60 * 1000 : 90 * 1000;
  return normalizeChart(await fetchJson(url, ttl));
}

// ---------- request handlers ----------
async function apiSearch(params) {
  const q = (params.get('q') || '').slice(0, 60);
  if (!q) return { quotes: [] };
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
  const json = await fetchJson(url, 10 * 60 * 1000);
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

async function apiChart(params) {
  return getChart(params.get('symbol') || '', params.get('range') || '1y', params.get('interval') || '1d');
}

// Batch endpoint for the scanner: compact OHLCV for many symbols, limited concurrency.
async function apiBatch(params) {
  const symbols = (params.get('symbols') || '').split(',').map(s => s.trim()).filter(s => SYM_RE.test(s)).slice(0, 60);
  const range = params.get('range') || '6mo';
  const out = {};
  const queue = [...symbols];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const sym = queue.shift();
      try {
        out[sym] = await getChart(sym, range, '1d');
      } catch (e) {
        out[sym] = { error: String(e.message || e) };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function apiCryptoMarkets() {
  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h,7d';
  const json = await fetchJson(url, 5 * 60 * 1000);
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
      res.writeHead(/not found|invalid/i.test(msg) ? 404 : 502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }
  if (req.method === 'GET') return serveStatic(req, res, url.pathname);
  res.writeHead(405); res.end();
});

server.listen(PORT, () => {
  console.log(`TradeSight running → http://localhost:${PORT}`);
});
