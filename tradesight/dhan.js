'use strict';
/**
 * TradeSight — Dhan (Indian NSE/BSE) data source.
 * Zero-dependency companion to server.js. Proxies the DhanHQ Data API v2
 * (https://api.dhan.co/v2) so the browser gets the same normalized shape it
 * already gets from Birdeye — {symbol,name,address,currency,exchange,type,
 * price,prevClose,high52,low52,liquidity,candles:[{t,o,h,l,c,v}]}.
 *
 * Scope: NSE/BSE cash equities + the NIFTY 50 index (the market-tide anchor).
 * Requires:  DHAN_ACCESS_TOKEN  (and DHAN_CLIENT_ID for /marketfeed/*)
 * Needs an active Dhan "Data" plan on the account. No order APIs are used.
 */

const DHAN_BASE = 'https://api.dhan.co/v2';
const TOKEN = () => process.env.DHAN_ACCESS_TOKEN || '';
const CLIENT = () => process.env.DHAN_CLIENT_ID || '';
const SCRIP_URL = 'https://images.dhan.co/api-data/api-scrip-master.csv';

// NIFTY 50 index — the tide anchor. exchangeSegment IDX_I, instrument INDEX.
const NIFTY_INDEX_ID = '13';
const NIFTY_ADDRESS = 'IDX_I:13';

// NIFTY 50 constituent trading symbols (NSE). Security IDs are resolved from the
// live scrip master, so this list only has to stay roughly current — a symbol
// that no longer resolves is silently skipped. Dhan has no "most active" feed,
// so this is the Market Scanner universe under the Dhan source.
const NIFTY50_SYMBOLS = [
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'ITC', 'LT', 'KOTAKBANK',
  'AXISBANK', 'SBIN', 'BHARTIARTL', 'BAJFINANCE', 'HINDUNILVR', 'ASIANPAINT',
  'MARUTI', 'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'WIPRO', 'NESTLEIND', 'ONGC',
  'NTPC', 'POWERGRID', 'TATAMOTORS', 'TATASTEEL', 'JSWSTEEL', 'ADANIENT',
  'ADANIPORTS', 'COALINDIA', 'GRASIM', 'HINDALCO', 'BAJAJFINSV', 'HCLTECH',
  'TECHM', 'DRREDDY', 'CIPLA', 'EICHERMOT', 'HEROMOTOCO', 'BAJAJ-AUTO',
  'BRITANNIA', 'APOLLOHOSP', 'INDUSINDBK', 'M&M', 'SHRIRAMFIN', 'LTIM',
  'SBILIFE', 'HDFCLIFE', 'BPCL', 'TATACONSUM', 'DIVISLAB',
];

// Frontend interval token -> Dhan intraday `interval` (minutes). '1d' means daily.
const INTRADAY_MIN = { '15m': 15, '30m': 25, '1h': 60 };
const RANGE_DAYS = {
  '3d': 3, '5d': 5, '10d': 10, '1mo': 30, '3mo': 90, '6mo': 180,
  '1y': 365, '2y': 730, '5y': 1825, 'max': 3650,
};

const CCY = 'INR';
const dhanConfigured = () => !!TOKEN();

// ---------- tiny TTL cache (independent of server.js's) ----------
const cache = new Map();
function cacheGet(k) {
  const h = cache.get(k);
  if (h && h.expires > Date.now()) return h.value;
  if (h) cache.delete(k);
  return null;
}
function cacheSet(k, v, ttlMs) {
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  cache.set(k, { expires: Date.now() + ttlMs, value: v });
}

// ---------- HTTP client ----------
// Global pace-limiter — Dhan's Data APIs cap at 5 req/s and reject bursts with
// DH-904. Space every outgoing request ~220ms apart (≈4.5 req/s) regardless of
// how many callers (scanner batch, analyze, tide) fire at once.
let _nextSlot = 0;
function pace() {
  const gap = 220;
  const now = Date.now();
  const wait = Math.max(0, _nextSlot - now);
  _nextSlot = Math.max(now, _nextSlot) + gap;
  return wait ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
}

async function dhanPost(path, body, ttlMs) {
  if (!TOKEN()) throw new Error('DHAN_ACCESS_TOKEN not set — see README (put it in tradesight/.env)');
  const key = 'POST ' + path + ' ' + JSON.stringify(body);
  const cached = cacheGet(key);
  if (cached) return cached;

  for (let attempt = 0; ; attempt++) {
    await pace();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    let res, json = null, text = null;
    try {
      res = await fetch(DHAN_BASE + path, {
        method: 'POST',
        headers: {
          'access-token': TOKEN(),
          'client-id': CLIENT(),
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      try { text = await res.text(); json = JSON.parse(text); } catch { /* non-JSON error body */ }
    } finally {
      clearTimeout(timer);
    }

    const upMsg = (json && (json.errorMessage || json.message || json.error || json.remarks)) || (!json && text) || '';
    const failed = !res.ok || (json && json.status && json.status !== 'success' && !json.open && !(json.data && json.data.open));
    if (!failed) {
      cacheSet(key, json, ttlMs);
      return json;
    }

    const blob = `${(json && json.errorCode) || ''} ${upMsg} ${!json ? (text || '') : ''}`;
    const rateLimited = res.status === 429 || /DH-904|rate ?limit|too many request/i.test(blob);
    if (rateLimited && attempt < 3) {
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1))); // back off, then retry
      continue;
    }

    // Dhan returns 401 for BOTH a bad token AND a valid token whose account has
    // no Data-API subscription — disambiguate on the message so the user sees
    // the fix that actually applies.
    if (/not subscribed|subscribe to data|data api|unavailable for legal|\b451\b|DH-90[26]|\b80[67]\b/i.test(blob)) {
      throw new Error("Dhan: the token authenticated, but this account has no active Data API subscription — market data is a paid add-on. Subscribe to the Data APIs plan at web.dhan.co → Profile → DhanHQ APIs, then retry. (A Trading API token alone does not include market data.)");
    }
    if (rateLimited) throw new Error('Dhan rate limit hit (DH-904) — the scanner is fetching too fast; wait a minute and retry.');
    if (res.status === 401) throw new Error(`Dhan rejected the access token (401) — regenerate DHAN_ACCESS_TOKEN and check DHAN_CLIENT_ID${upMsg ? ' — ' + upMsg : ''}`);
    if (res.status === 403) throw new Error(`Dhan: access denied (403)${upMsg ? ' — ' + upMsg : ''}`);
    throw new Error(upMsg ? `Dhan: ${upMsg}` : `Dhan upstream ${res.status}`);
  }
}

// ---------- instrument master ----------
let instr = null; // { at, bySym: Map, list: [{symbol,name,securityId,seg,exch}] }

function csvSplitEquityRows(text) {
  // Compact scrip master: 16 comma-separated columns, no quoting in NSE/BSE
  // EQUITY rows (verified). Columns:
  // 0 SEM_EXM_EXCH_ID | 1 SEM_SEGMENT | 2 SEM_SMST_SECURITY_ID | 3 SEM_INSTRUMENT_NAME
  // 5 SEM_TRADING_SYMBOL | 7 SEM_CUSTOM_SYMBOL | 14 SEM_SERIES | 15 SM_SYMBOL_NAME
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 16) continue;
    if (p[1] !== 'E' || p[3] !== 'EQUITY') continue;
    if (p[0] !== 'NSE' && p[0] !== 'BSE') continue;
    if (p[14] && p[14] !== 'EQ') continue; // series: cash 'EQ' only (skip BE/BZ/…)
    out.push({
      exch: p[0],
      seg: p[0] === 'NSE' ? 'NSE_EQ' : 'BSE_EQ',
      securityId: p[2],
      symbol: p[5],
      name: (p[7] || p[15] || p[5]).trim(),
    });
  }
  return out;
}

async function loadInstruments() {
  if (instr && Date.now() - instr.at < 12 * 3600 * 1000) return instr;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let rows;
  try {
    const res = await fetch(SCRIP_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`scrip master download failed (${res.status})`);
    rows = csvSplitEquityRows(await res.text());
  } finally {
    clearTimeout(timer);
  }
  const bySym = new Map();
  for (const r of rows) {
    // NSE wins ties (deeper liquidity); don't overwrite an NSE row with a BSE one.
    const cur = bySym.get(r.symbol);
    if (!cur || (cur.exch === 'BSE' && r.exch === 'NSE')) bySym.set(r.symbol, r);
  }
  instr = { at: Date.now(), bySym, list: rows };
  return instr;
}

// ---------- address helpers ----------
// Address form for the Dhan source: "<EXCHANGE_SEGMENT>:<securityId>", e.g.
// "NSE_EQ:2885" (Reliance) or "IDX_I:13" (NIFTY 50).
const DHAN_ADDR_RE = /^[A-Z_]{3,10}:\d{1,12}$/;

function parseAddr(addr) {
  const m = String(addr || '').match(/^([A-Z_]{3,10}):(\d{1,12})$/);
  if (!m) throw new Error('invalid Dhan instrument id (expected "<SEGMENT>:<securityId>")');
  return { seg: m[1], securityId: m[2] };
}

// ---------- chart ----------
function fmtDate(d, withTime) {
  const p = (n) => String(n).padStart(2, '0');
  const s = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  return withTime ? `${s} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` : s;
}

function normalizeCandles(json) {
  const d = json && (json.data && json.data.open ? json.data : json) || {};
  const o = d.open || [], h = d.high || [], l = d.low || [], c = d.close || [];
  const v = d.volume || [], ts = d.timestamp || [];
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    if (o[i] == null || h[i] == null || l[i] == null || c[i] == null) continue;
    candles.push({ t: ts[i] * 1000, o: +o[i], h: +h[i], l: +l[i], c: +c[i], v: +(v[i] ?? 0) });
  }
  candles.sort((a, b) => a.t - b.t);
  return candles;
}

async function getChartDhan(address, range = '1y', interval = '1d') {
  const { seg, securityId } = parseAddr(address);
  if (!RANGE_DAYS[range]) range = '1y';
  const instrument = seg === 'IDX_I' ? 'INDEX' : 'EQUITY';
  const days = RANGE_DAYS[range];
  // Floor "to" to a 5-minute boundary so repeated calls within a few minutes
  // share a cache key (the body is the cache key in dhanPost).
  const to = new Date(Math.floor(Date.now() / 3e5) * 3e5);
  const from = new Date(to.getTime() - days * 86400 * 1000);
  const intraday = interval !== '1d' && interval !== '1wk';

  let json;
  if (intraday) {
    const minutes = INTRADAY_MIN[interval] || 15;
    json = await dhanPost('/charts/intraday', {
      securityId, exchangeSegment: seg, instrument,
      interval: minutes, oi: false,
      fromDate: fmtDate(from, true), toDate: fmtDate(to, true),
    }, 60 * 1000);
  } else {
    json = await dhanPost('/charts/historical', {
      securityId, exchangeSegment: seg, instrument, expiryCode: 0, oi: false,
      fromDate: fmtDate(from, false), toDate: fmtDate(to, false),
    }, 5 * 60 * 1000);
  }

  const candles = normalizeCandles(json);
  if (candles.length < 2) throw new Error('no price history for this instrument');

  let name = seg === 'IDX_I' ? 'NIFTY 50' : null;
  let symbol = null;
  let exch = seg.startsWith('BSE') ? 'BSE' : 'NSE';
  if (seg !== 'IDX_I') {
    const { list } = await loadInstruments().catch(() => ({ list: [] }));
    const hit = list.find((r) => r.securityId === securityId && r.seg === seg);
    if (hit) { name = hit.name; symbol = hit.symbol; exch = hit.exch; }
  }
  if (seg === 'IDX_I') symbol = 'NIFTY';

  let hi = -Infinity, lo = Infinity;
  for (const k of candles) { if (k.h > hi) hi = k.h; if (k.l < lo) lo = k.l; }
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  return {
    symbol: symbol || address,
    name: name || symbol || 'Unknown instrument',
    address,
    currency: CCY,
    exchange: exch,
    type: seg === 'IDX_I' ? 'INDEX' : 'EQUITY',
    price: last.c,
    prevClose: prev.c,
    high52: hi,   // window high/low — Dhan has no 52-week field (same as Birdeye)
    low52: lo,
    liquidity: null, // no pooled-liquidity concept for exchange-listed equities
    marketCap: null,
    candles,
  };
}

// ---------- search ----------
async function searchDhan(q) {
  const s = String(q || '').trim();
  if (!s) return { quotes: [] };

  // Pasted "<SEG>:<id>" — resolve directly.
  if (DHAN_ADDR_RE.test(s)) {
    try {
      const { seg, securityId } = parseAddr(s);
      const { list } = await loadInstruments();
      const hit = list.find((r) => r.securityId === securityId && r.seg === seg);
      if (hit) return { quotes: [{ symbol: hit.symbol, name: hit.name, type: 'EQUITY', exchange: hit.exch, address: s }] };
      if (seg === 'IDX_I') return { quotes: [{ symbol: 'NIFTY', name: 'NIFTY 50', type: 'INDEX', exchange: 'NSE', address: s }] };
    } catch { /* fall through */ }
    return { quotes: [] };
  }

  const { bySym, list } = await loadInstruments();
  const up = s.toUpperCase();
  const scored = [];
  const exact = bySym.get(up);
  if (exact) scored.push({ r: exact, rank: 0 });
  for (const r of list) {
    if (r === exact) continue;
    const sym = r.symbol.toUpperCase();
    const nm = r.name.toUpperCase();
    if (sym.startsWith(up)) scored.push({ r, rank: 1 });
    else if (nm.startsWith(up)) scored.push({ r, rank: 2 });
    else if (sym.includes(up) || nm.includes(up)) scored.push({ r, rank: 3 });
    if (scored.length > 60) break;
  }
  scored.sort((a, b) => a.rank - b.rank || (a.r.exch === 'NSE' ? -1 : 1));
  const seen = new Set();
  const quotes = [];
  for (const { r } of scored) {
    const addr = `${r.seg}:${r.securityId}`;
    if (seen.has(r.symbol + r.exch)) continue;
    seen.add(r.symbol + r.exch);
    quotes.push({ symbol: r.symbol, name: r.name, type: 'EQUITY', exchange: r.exch, address: addr });
    if (quotes.length >= 8) break;
  }
  return { quotes };
}

// ---------- scanner universe ----------
async function niftyList(limit = 50) {
  const { bySym } = await loadInstruments();
  const out = [];
  for (const sym of NIFTY50_SYMBOLS) {
    const r = bySym.get(sym);
    if (!r) continue;
    out.push({
      address: `${r.seg}:${r.securityId}`,
      symbol: r.symbol,
      name: r.name,
      price: null, liquidity: null, volume24h: null, marketCap: null, change24h: null,
    });
    if (out.length >= limit) break;
  }
  return out.map((t, i) => ({ ...t, rank: i + 1 }));
}

module.exports = {
  dhanConfigured, getChartDhan, searchDhan, niftyList,
  NIFTY_ADDRESS, DHAN_ADDR_RE,
};
