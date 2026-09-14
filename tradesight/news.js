'use strict';
/**
 * TradeSight — Indian-market stock news insight.
 * Zero-dependency companion to server.js (Node 18+).
 *
 * Two jobs:
 *   1. getStockNews(name, symbol) — pull recent headlines for one NSE/BSE stock
 *      from Google News RSS (per-company query, all Indian portals) plus a set
 *      of curated Indian markets/business RSS feeds for the market backdrop.
 *      No API key needed — these are public RSS endpoints.
 *   2. scoreNews({asset, headlines, market}) — send the headlines to the Claude
 *      API and get back a structured sentiment + price-impact estimate.
 *      Requires ANTHROPIC_API_KEY. Model override: TRADESIGHT_NEWS_MODEL
 *      (default claude-opus-5).
 *
 * This is a heuristic decision-support read, not a market forecast. The engine
 * never places orders and the news score does not feed the technical verdict.
 */

const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY || '';
const NEWS_MODEL = () => process.env.TRADESIGHT_NEWS_MODEL || 'claude-opus-5';
const newsConfigured = () => !!ANTHROPIC_KEY();

const UA = 'Mozilla/5.0 (compatible; TradeSight/1.0; +https://localhost)';

// Curated Indian markets / business RSS feeds — the market backdrop pool. Also
// scanned for mentions of the analyzed company. A feed that fails is skipped.
const MARKET_FEEDS = [
  { source: 'ET Markets', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { source: 'Moneycontrol Business', url: 'https://www.moneycontrol.com/rss/business.xml' },
  { source: 'Moneycontrol Markets', url: 'https://www.moneycontrol.com/rss/marketreports.xml' },
  { source: 'Business Standard Markets', url: 'https://www.business-standard.com/rss/markets-106.rss' },
  { source: 'LiveMint Markets', url: 'https://www.livemint.com/rss/markets' },
  { source: 'BusinessLine Markets', url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss' },
];

// ---------- tiny TTL cache (independent of server.js's) ----------
const cache = new Map();
function cacheGet(k) {
  const h = cache.get(k);
  if (h && h.expires > Date.now()) return h.value;
  if (h) cache.delete(k);
  return null;
}
function cacheSet(k, v, ttlMs) {
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(k, { expires: Date.now() + ttlMs, value: v });
}

// ---------- RSS parsing (regex, no XML dependency) ----------
function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'").replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
const stripTags = (s) => decodeEntities(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() : '';
};

function parseRss(xml, fallbackSource) {
  const items = [];
  const blocks = String(xml || '').split(/<item[\s>]/i).slice(1);
  for (const raw of blocks) {
    const block = raw.slice(0, raw.search(/<\/item>/i) === -1 ? undefined : raw.search(/<\/item>/i));
    const title = stripTags(tag(block, 'title'));
    if (!title) continue;
    let link = tag(block, 'link');
    if (!link) { const m = block.match(/<link[^>]*href=["']([^"']+)["']/i); if (m) link = m[1]; }
    const pubDate = tag(block, 'pubDate') || tag(block, 'dc:date') || tag(block, 'published');
    const srcM = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const source = (srcM ? stripTags(srcM[1]) : '') || fallbackSource || '';
    const description = stripTags(tag(block, 'description') || tag(block, 'content:encoded')).slice(0, 400);
    items.push({ title, link: link.trim(), pubDate: pubDate.trim(), source, description });
  }
  return items;
}

async function fetchText(url, ttlMs = 10 * 60 * 1000) {
  const cached = cacheGet('GET ' + url);
  if (cached != null) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const text = await res.text();
    cacheSet('GET ' + url, text, ttlMs);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- headline collection ----------
const CORP_SUFFIX = /\b(ltd\.?|limited|corporation|corp\.?|inc\.?|company|industries|enterprises|india)\b/gi;
function cleanName(name) {
  return String(name || '').replace(/\s*[-–].*$/, '').replace(CORP_SUFFIX, '').replace(/\s+/g, ' ').trim();
}
function nameTokens(name, symbol) {
  const toks = new Set();
  for (const t of cleanName(name).toLowerCase().split(/\s+/)) if (t.length >= 4) toks.add(t);
  if (symbol && symbol.length >= 3) toks.add(String(symbol).toLowerCase());
  return [...toks];
}
function ageDays(pubDate) {
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? (Date.now() - t) / 86400000 : null;
}
function dedupe(items) {
  const seen = new Set(), out = [];
  for (const it of items) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function getStockNews(name, symbol) {
  const clean = cleanName(name) || String(symbol || '').trim();
  const cacheKey = `news:${clean}:${symbol || ''}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const query = `"${clean}" (stock OR share OR shares OR NSE OR BSE OR results OR earnings OR order OR profit)`;
  const gnewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' when:14d')}&hl=en-IN&gl=IN&ceid=IN:en`;

  const settled = await Promise.allSettled([
    fetchText(gnewsUrl, 15 * 60 * 1000),
    ...MARKET_FEEDS.map((f) => fetchText(f.url).then((t) => ({ ...f, text: t }))),
  ]);

  // Per-company headlines from Google News.
  let stock = [];
  if (settled[0].status === 'fulfilled') {
    stock = parseRss(settled[0].value, 'Google News').map((it) => {
      // Google News titles are "Headline - Publisher"; split the publisher out.
      const m = it.title.match(/^(.*?)\s+[-–]\s+([^-–]{2,40})$/);
      return m ? { ...it, title: m[1].trim(), source: it.source || m[2].trim() } : it;
    });
  }

  // Market backdrop + extra company mentions from curated feeds.
  const tokens = nameTokens(name, symbol);
  const mentions = (it) => {
    const hay = (it.title + ' ' + it.description).toLowerCase();
    return tokens.some((t) => hay.includes(t));
  };
  let market = [];
  for (let i = 1; i < settled.length; i++) {
    if (settled[i].status !== 'fulfilled') continue;
    const { source, text } = settled[i].value;
    const parsed = parseRss(text, source).map((it) => ({ ...it, source: it.source || source }));
    for (const it of parsed) if (mentions(it)) stock.push(it);
    market.push(...parsed.slice(0, 8));
  }

  const recent = (it) => { const d = ageDays(it.pubDate); return d == null || d <= 21; };
  stock = dedupe(stock).filter(recent)
    .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
    .slice(0, 28);
  market = dedupe(market).filter(recent)
    .filter((m) => !stock.some((s) => s.title === m.title))
    .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
    .slice(0, 16);

  const out = { query: clean, fetchedAt: Date.now(), stock, market, feedsOk: settled.filter((s) => s.status === 'fulfilled').length };
  cacheSet(cacheKey, out, 15 * 60 * 1000);
  return out;
}

// ---------- Claude API scoring ----------
// NOTE: structured outputs does not support `minimum`/`maximum`/`maxItems` — the
// numeric ranges below live in `description` and are clamped after parsing.
const ASSESSMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['direction', 'newsScore', 'confidence', 'expectedMovePct', 'horizon', 'headline', 'rationale', 'keyDrivers', 'marketBackdrop', 'caveats'],
  properties: {
    direction: { type: 'string', enum: ['bullish', 'bearish', 'neutral', 'mixed'] },
    newsScore: { type: 'integer', description: 'Intensity/materiality of stock-moving news flow, integer 0-100. 0 = nothing notable, 100 = major price-moving event.' },
    confidence: { type: 'number', description: '0.0 to 1.0 — your confidence in this read given coverage quality.' },
    expectedMovePct: {
      type: 'object', additionalProperties: false, required: ['low', 'high', 'basis'],
      properties: {
        low: { type: 'number', description: 'Low end of the estimated near-term price impact, in percent; negative for a drop.' },
        high: { type: 'number', description: 'High end of the estimated near-term price impact, in percent; negative for a drop.' },
        basis: { type: 'string', description: 'One line on how this range was anchored (e.g. vs the stock\'s recent daily range).' },
      },
    },
    horizon: { type: 'string', enum: ['intraday', '1-3 days', '1-2 weeks', 'weeks or more', 'already priced in'] },
    headline: { type: 'string', description: 'One-sentence plain-English summary of the news picture.' },
    rationale: { type: 'string', description: '2-4 sentences explaining the direction and score.' },
    keyDrivers: {
      type: 'array',
      description: 'Only the items that actually move the assessment, most important first — typically 2 to 6.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['headline', 'source', 'date', 'eventType', 'sentiment', 'materiality', 'impact', 'note'],
        properties: {
          headline: { type: 'string' },
          source: { type: 'string' },
          date: { type: 'string', description: 'As given, or "unknown".' },
          eventType: { type: 'string', description: 'e.g. earnings, order win, upgrade/downgrade, regulatory/SEBI, management change, M&A, buyback, block/bulk deal, fundraise, litigation, guidance, macro, other.' },
          sentiment: { type: 'number', description: '-1.0 (very negative) to 1.0 (very positive) for the stock.' },
          materiality: { type: 'number', description: '0.0 to 1.0 — how price-relevant this specific item is.' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          note: { type: 'string', description: 'Short reasoning for this item.' },
        },
      },
    },
    marketBackdrop: { type: 'string', description: '1-2 sentences on the broader market tone from the curated feeds.' },
    caveats: { type: 'string', description: 'Key uncertainties: stale/thin coverage, rumor vs confirmed, etc.' },
  },
};

const clamp = (n, lo, hi, dflt) => Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
function normalizeAssessment(a) {
  a.newsScore = Math.round(clamp(a.newsScore, 0, 100, 0));
  a.confidence = clamp(a.confidence, 0, 1, 0.5);
  if (a.expectedMovePct) {
    a.expectedMovePct.low = clamp(a.expectedMovePct.low, -50, 50, 0);
    a.expectedMovePct.high = clamp(a.expectedMovePct.high, -50, 50, 0);
  }
  for (const d of a.keyDrivers || []) {
    d.sentiment = clamp(d.sentiment, -1, 1, 0);
    d.materiality = clamp(d.materiality, 0, 1, 0.5);
  }
  return a;
}

function buildPrompt(asset, news) {
  const px = asset && Number.isFinite(asset.price)
    ? [
        `Current price: ₹${asset.price}`,
        Number.isFinite(asset.chg1d) ? `1-day change: ${asset.chg1d.toFixed(2)}%` : '',
        Number.isFinite(asset.chg5d) ? `5-day change: ${asset.chg5d.toFixed(2)}%` : '',
        Number.isFinite(asset.chg20d) ? `20-day change: ${asset.chg20d.toFixed(2)}%` : '',
        Number.isFinite(asset.atrPct) ? `Typical daily range (ATR): ~${asset.atrPct.toFixed(2)}% of price` : '',
      ].filter(Boolean).join('\n')
    : 'Live price data unavailable — estimate impact in relative terms.';

  const fmt = (list) => list.map((h, i) =>
    `${i + 1}. [${h.source || 'unknown'}${h.pubDate ? ' · ' + h.pubDate : ''}] ${h.title}${h.description ? '\n   ' + h.description.slice(0, 240) : ''}`
  ).join('\n');

  return `You are a sell-side equity news analyst covering Indian (NSE/BSE) equities. Assess how the recent news flow below is likely to affect this stock's price in the near term.

STOCK: ${asset.name} (${asset.symbol}) — ${asset.exchange || 'NSE'}
${px}

STOCK-SPECIFIC HEADLINES (most recent first):
${news.stock.length ? fmt(news.stock) : '(none found in the last ~2 weeks)'}

BROADER MARKET HEADLINES (context only):
${news.market.length ? fmt(news.market.slice(0, 12)) : '(none)'}

Instructions:
- Judge only what these headlines support. Distinguish confirmed events from rumor/speculation, and note when an item looks already priced in or is stale.
- Weight by materiality: earnings surprises, large order wins/losses, regulatory action, management churn, M&A, guidance changes and credible analyst rating moves matter most; routine coverage barely moves the needle.
- Anchor expectedMovePct to this stock's own typical daily range where a number is given — most single-headline reactions are a fraction of a percent to a few percent; only a genuine step-change (major beat/miss, big deal, fraud/regulatory shock) justifies a double-digit move.
- If coverage is thin or immaterial, say so: low newsScore, direction "neutral", a near-zero move range.
- keyDrivers: include only the items that actually move your view (typically 2-6), most important first.
- Be precise and non-promotional. This is decision support, not advice.`;
}

async function scoreNews(asset, news) {
  if (!newsConfigured()) throw new Error('ANTHROPIC_API_KEY not set — the news-scoring model is unavailable. Add it to tradesight/.env (see README).');

  if (!news.stock.length && !news.market.length) {
    return {
      direction: 'neutral', newsScore: 0, confidence: 0.2,
      expectedMovePct: { low: 0, high: 0, basis: 'No recent coverage found.' },
      horizon: 'already priced in', headline: 'No recent news coverage found for this stock.',
      rationale: 'No stock-specific or relevant market headlines were retrieved in the last ~2 weeks, so there is no news catalyst to assess.',
      keyDrivers: [], marketBackdrop: 'No market headlines retrieved.', caveats: 'RSS coverage can be incomplete; check a news portal directly.',
      model: null, headlineCount: 0,
    };
  }

  const body = {
    model: NEWS_MODEL(),
    max_tokens: 8000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ASSESSMENT_SCHEMA } },
    messages: [{ role: 'user', content: buildPrompt(asset, news) }],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  let res, json;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    json = await res.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const msg = (json && json.error && json.error.message) || `Claude API ${res.status}`;
    if (res.status === 401) throw new Error('Claude API rejected the key (401) — check ANTHROPIC_API_KEY.');
    if (res.status === 429) throw new Error('Claude API rate limit hit (429) — wait a moment and retry.');
    throw new Error(msg);
  }

  if (json.stop_reason === 'refusal') throw new Error('The news-scoring model declined to answer for this request.');
  const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (json.stop_reason === 'max_tokens' && !text.trimEnd().endsWith('}')) throw new Error('The news-scoring response was truncated — try again.');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Claude API returned an unparseable response.');
    parsed = JSON.parse(m[0]);
  }
  normalizeAssessment(parsed);
  parsed.model = json.model || NEWS_MODEL();
  parsed.headlineCount = news.stock.length;
  return parsed;
}

module.exports = { newsConfigured, getStockNews, scoreNews, parseRss, cleanName, dedupe };
