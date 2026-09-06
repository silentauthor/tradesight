/* TradeSight — application glue: search, analyze view, scanner, watchlist,
   journal, playbook. */
'use strict';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPx = (p) => p == null ? '—' : p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(2) : p.toPrecision(4);
const fmtPct = (p) => p == null ? '—' : `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
const tierColor = (score) =>
  score >= 72 ? { bg: '#16261e', fg: '#74a788' } :
  score >= 58 ? { bg: '#232012', fg: '#b0a25a' } :
  score >= 42 ? { bg: '#2b2013', fg: '#c9963f' } :
  { bg: '#271613', fg: '#bd6152' };

async function api(path) {
  const res = await fetch(path);
  const json = await res.json().catch(() => ({ error: 'bad response' }));
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/* ---------------- trading horizon (swing vs intraday) ----------------
   Swing runs the engine on daily candles with a weekly higher-timeframe check;
   intraday runs it on 15-minute candles with an hourly check (Zuckerman: always
   confirm one timeframe up — day trade → hourly, swing → weekly). Only the
   candle feed, a few volatility thresholds and the labels change; the rule base
   and its book attributions are identical. */
const MODES = {
  swing: {
    id: 'swing', label: 'Swing',
    primary: { interval: '1d', range: '2y' },
    higher: { interval: '1wk', range: '5y' },
    tide: { interval: '1d', range: '1y' },
    scanRange: '2y', scanLimit: 50, minBars: 200,
    tf: () => Engine.TF_SWING,
  },
  intraday: {
    id: 'intraday', label: 'Intraday',
    primary: { interval: '15m', range: '1mo' },
    higher: { interval: '1h', range: '3mo' },
    tide: { interval: '1h', range: '3mo' },
    scanRange: '1mo', scanLimit: 50, minBars: 200,
    tf: () => Engine.TF_INTRADAY,
  },
};

/* Solana SPL mint address (base58). */
const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/* Dhan instrument id: "<EXCHANGE_SEGMENT>:<securityId>", e.g. "NSE_EQ:2885". */
const DHAN_ADDR_RE = /^[A-Z_]{3,10}:\d{1,12}$/;
/* Wrapped SOL — the Birdeye market-tide anchor; this mint never changes. */
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/* Well-known Solana tokens — verified mints, so "SOL"/"BONK"/… resolve instantly
   without a search round-trip. Anything else is resolved via /api/search. */
const KNOWN_BIRDEYE = {
  SOL: SOL_MINT, WSOL: SOL_MINT, SOLANA: SOL_MINT,
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  JTO: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  KMNO: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS',
  JLP: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
  RENDER: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  PENGU: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
};
/* Common NSE large-caps — skip the scrip-master search round-trip. */
const KNOWN_DHAN = {
  RELIANCE: 'NSE_EQ:2885', TCS: 'NSE_EQ:11536', INFY: 'NSE_EQ:1594',
  HDFCBANK: 'NSE_EQ:1333', ICICIBANK: 'NSE_EQ:4963', SBIN: 'NSE_EQ:3045',
  ITC: 'NSE_EQ:1660', LT: 'NSE_EQ:11483', 'BHARTIARTL': 'NSE_EQ:10604',
  HINDUNILVR: 'NSE_EQ:1394', NIFTY: 'IDX_I:13',
};

/* ---------------- data source (Birdeye / Solana  vs  Dhan / NSE-BSE) ----------
   Switches token resolution and every /api/* feed. The engine, the Swing/
   Intraday toggle and the rule base are unchanged — only the market being
   analyzed, its currency and its tide anchor differ. */
const SOURCES = {
  jupiter: {
    id:'jupiter',label:'Jupiter Perps',sub:'SOL · BTC · ETH',ccy:'$',isCrypto:true,
    addrRe:/^(So11111111111111111111111111111111111111112|3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh|7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs)$/,
    known:{SOL:SOL_MINT,BTC:'3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',ETH:'7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs'},
    tideAddress:SOL_MINT,tideLabel:'SOL',placeholder:'Search Jupiter markets: SOL, BTC or ETH',quickSyms:['SOL','BTC','ETH'],noMatch:s=>`Jupiter Perps supports SOL, BTC and ETH; no market matches "${s}"`,
  },
  birdeye: {
    id: 'birdeye', label: 'Solana', sub: 'Birdeye', ccy: '$', isCrypto: true,
    addrRe: ADDR_RE, known: KNOWN_BIRDEYE,
    tideAddress: SOL_MINT, tideLabel: 'SOL',
    placeholder: 'Solana token — name, symbol or mint address (e.g. SOL, JUP, BONK, WIF…)',
    quickSyms: ['SOL', 'JUP', 'JTO', 'BONK', 'WIF', 'PYTH', 'JLP'],
    noMatch: (s) => `no Solana token matches "${s}"`,
  },
  dhan: {
    id: 'dhan', label: 'India', sub: 'Dhan · NSE/BSE', ccy: '₹', isCrypto: false,
    addrRe: DHAN_ADDR_RE, known: KNOWN_DHAN,
    tideAddress: 'IDX_I:13', tideLabel: 'NIFTY 50',
    placeholder: 'NSE / BSE stock — company name or ticker (e.g. RELIANCE, TCS, HDFC Bank…)',
    quickSyms: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC'],
    noMatch: (s) => `no NSE/BSE stock matches "${s}"`,
  },
};

/* ---------------- state ---------------- */
const state = {
  current: null,        // {asset, assessment, daily, weekly}
  mode:'intraday',
  side:'long',
  source:location.hash.startsWith('#crypto')?'jupiter':'dhan',
  marketCtx: {},        // regime for the ACTIVE mode+source
  marketCtxByMode: {},  // cached regime, keyed "<source>:<mode>"
  chart: null,
  scanCache: null,
};
const SRC = () => SOURCES[state.source];
const CCY = () => SRC().ccy;
const anyAddr = (a) => ADDR_RE.test(a) || DHAN_ADDR_RE.test(a);

const store = {
  // Watchlist holds mint addresses (Birdeye) and "<seg>:<id>" ids (Dhan).
  get watch() { try { return JSON.parse(localStorage.tsWatch || '[]').filter(anyAddr); } catch { return []; } },
  set watch(v) { localStorage.tsWatch = JSON.stringify(v); },
  get journal() { try { return JSON.parse(localStorage.tsJournal || '[]'); } catch { return []; } },
  set journal(v) { localStorage.tsJournal = JSON.stringify(v); },
};

/* Resolve a user-typed name / symbol / address to the active source's id. */
async function resolveToAddress(q, source = state.source) {
  const s = String(q || '').trim();
  const src = SOURCES[source];
  if (src.addrRe.test(s)) return s;
  const hit = src.known[s.toUpperCase()];
  if (hit) return hit;
  const { quotes } = await api(`/api/search?q=${encodeURIComponent(s)}&source=${source}`);
  if (quotes && quotes[0] && quotes[0].address) return quotes[0].address;
  throw new Error(src.noMatch(s));
}

/* ---------------- navigation ---------------- */
document.querySelectorAll('nav button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + btn.dataset.view));
    if (btn.dataset.view === 'watchlist') renderWatchlist();
    if (btn.dataset.view === 'journal') renderJournal();
  };
});
function gotoView(name) { document.querySelector(`nav button[data-view="${name}"]`).click(); }

/* ---------------- market context (the tide) ---------------- */
const ctxKey = (mode, source) => `${source}:${mode}`;

async function loadMarketContext(mode = state.mode, source = state.source) {
  const M = MODES[mode], S = SOURCES[source];
  try {
    const anchor = await api(`/api/chart?address=${encodeURIComponent(S.tideAddress)}&range=${M.tide.range}&interval=${M.tide.interval}&source=${source}`);
    const closed = DataQuality.completed(anchor.candles, M.tide.interval, source);
    const issue = DataQuality.issue(closed, M.tide.interval, source);
    const ctx = issue ? {regime:'unavailable', detail:issue} : Engine.marketRegime(TA.analyzeSeries(closed), S.tideLabel);
    ctx.fetchedAt = Date.now();
    ctx._anchor = anchor;
    state.marketCtxByMode[ctxKey(mode, source)] = ctx;
    if (mode === state.mode && source === state.source) {
      state.marketCtx = ctx;
      const chg = ((anchor.price - anchor.candles[anchor.candles.length - 2].c) / anchor.candles[anchor.candles.length - 2].c) * 100;
      $('marketChips').innerHTML =
        `<span class="chip"><b>${esc(S.tideLabel)}</b> ${S.ccy}${fmtPx(anchor.price)} <span class="${chg >= 0 ? 'pos' : 'neg'}">${fmtPct(chg)}</span></span>`
        + `<span class="chip">${M.label} tide: <b class="${ctx.regime === 'risk-on' ? 'pos' : ctx.regime === 'risk-off' ? 'neg' : ''}">${ctx.regime}</b></span>`;
    }
    return ctx;
  } catch (e) {
    if (mode === state.mode && source === state.source) {
      state.marketCtx = {};
      $('marketChips').innerHTML = `<span class="chip">market data unavailable${e && e.message ? ' — ' + esc(e.message) : ''}</span>`;
    }
    return {};
  }
}

/* The tide for the active source + a mode — from cache if already fetched. */
async function marketCtxFor(mode, source = state.source) {
  const cached = state.marketCtxByMode[ctxKey(mode, source)];
  return cached && cached.regime && cached.regime!=='unavailable' && Date.now()-cached.fetchedAt < 60000 ? cached : await loadMarketContext(mode, source);
}

// Scanner, watchlist and detail share identical input windows and snapshots.
const assessmentCache = new Map();
let analyzeRequest = 0, scanRequest = 0, watchRequest = 0;
async function assessAddress(address, mode, source, primaryData = null, context = null) {
  const side=state.side;
  const key = `${source}:${mode}:${side}:${address}`, old = assessmentCache.get(key);
  if(old && old.value.assessment.status!=='unavailable' && Date.now()-old.at < 60000) return old.value;
  const M=MODES[mode], S=SOURCES[source];
  const chart=(interval,range)=>api(`/api/chart?address=${encodeURIComponent(address)}&range=${range}&interval=${interval}&source=${source}`);
  const [raw, htf, dailyRaw, marketCtx] = await Promise.all([
    primaryData || chart(M.primary.interval,M.primary.range),
    source==='dhan'&&mode==='swing'?null:chart(M.higher.interval,M.higher.range).catch(()=>null),
    source==='dhan'&&mode==='intraday'?chart('1d','3mo').catch(()=>null):null,
    context || marketCtxFor(mode, source),
  ]);
  const candles=DataQuality.completed(raw.candles||[],M.primary.interval,source);
  if(candles.length<M.minBars)throw new Error(`Need ${M.minBars} completed ${M.primary.interval} candles; received ${candles.length}`);
  const hc=source==='dhan'&&mode==='swing'?DataQuality.completed(TA.resampleWeekly(candles),'1wk',source):DataQuality.completed(htf?.candles||[],M.higher.interval,source);
  const dc=mode==='swing'?candles:DataQuality.completed(dailyRaw?.candles||[],'1d',source);
  const dailyTurnover=dc.length>=20?dc.slice(-20).reduce((sum,c)=>sum+c.v*c.c,0)/20:null;
  const asset={...raw,candles,price:candles.at(-1).c,isCrypto:S.isCrypto,mode,source,side,dailyTurnover,
    dataIssue:DataQuality.issue(candles,M.primary.interval,source)};
  if(source==='dhan'&&dailyRaw&&DataQuality.issue(dc,'1d',source)) asset.dataIssue='Daily liquidity data is stale';
  if(!htf&&!(source==='dhan'&&mode==='swing'))asset.dataIssue='Higher-timeframe data could not be loaded; refresh to retry';
  if(htf&&DataQuality.issue(hc,M.higher.interval,source)&&M.higher.interval!=='1wk')asset.dataIssue='Higher-timeframe data is stale';
  const daily=TA.analyzeSeries(candles),weekly=hc.length>=30?TA.analyzeSeries(hc):null;
  const assessment=Engine.assess(asset,daily,weekly,marketCtx,M.tf());
  const value={asset,daily,weekly,assessment};
  if(assessmentCache.size>150)assessmentCache.delete(assessmentCache.keys().next().value);
  assessmentCache.set(key,{at:Date.now(),value});
  return value;
}

/* Explicit market pages and direction selection. Pending work cannot change pages. */
function invalidateWorkspace(){
  analyzeRequest++;scanRequest++;watchRequest++;
  state.scanCache=null;$('scanTable').style.display='none';$('scanStatus').textContent='';$('scanBtn').disabled=false;
}
function refreshWorkspace(){
  invalidateWorkspace();updateWorkspaceChrome();
  $('analyzeResult').style.display='none';
  if(document.querySelector('#view-analyze.active')&&state.current)analyze(state.current.asset.address);
  if(document.querySelector('#view-watchlist.active'))renderWatchlist();
}
function updateWorkspaceChrome(){
  const india=state.source==='dhan';
  document.querySelectorAll('#modeToggle input').forEach(r=>{r.checked=r.value===state.mode;r.disabled=false;});
  document.querySelectorAll('#sideToggle input').forEach(r=>r.checked=r.value===state.side);
  document.querySelectorAll('[data-market]').forEach(a=>a.classList.toggle('selected',a.dataset.market===(india?'dhan':'perps')));
  $('pageTitle').textContent=india?'Indian market':'Jupiter Perps';
  $('pageEyebrow').textContent=india?'NSE / BSE · EQUITIES':'CRYPTO · PERPETUAL FUTURES';
  $('pageDescription').textContent=india?'Research intraday and swing setups in NSE/BSE equities.':'Research long and short setups in SOL, BTC and ETH.';
  $('analysisScope').textContent=(state.side==='short'?'↓ Sell / Short':'↑ Buy / Long')+' · '+MODES[state.mode].label;
  $('marketNote').textContent=india
    ? (state.side==='short'&&state.mode==='intraday'
      ? 'Sell / Short means opening an intraday short, not selling an existing holding. Close before your broker’s square-off deadline.'
      : state.side==='short'
        ? 'Swing Sell / Short is directional research. Confirm that your selected instrument and broker product permit overnight short exposure before execution.'
        : 'Swing uses daily candles with a weekly higher-timeframe view; Intraday uses 15-minute candles with an hourly view.')
    : 'Jupiter live market prices · Birdeye underlying spot candles for technical signals. Borrow fees, liquidation and executable fills must be checked on Jupiter.';
  document.body.dataset.side=state.side;
}
async function switchMarket(){
  const next=location.hash.startsWith('#crypto')?'jupiter':'dhan';
  if(next===state.source)return;
  state.source=next;state.current=null;state.marketCtx={};
  clearTimeout(sugTimer);closeSug();
  invalidateWorkspace();applySourceChrome();restoreSizing();updateWorkspaceChrome();
  $('analyzeResult').style.display='none';$('analyzeStatus').textContent='';$('marketChips').textContent='Loading market context…';
  gotoView('scanner');await loadMarketContext();
}
window.addEventListener('hashchange',switchMarket);
document.querySelectorAll('#sideToggle input').forEach(r=>r.onchange=()=>{if(r.checked){state.side=r.value;refreshWorkspace();}});
document.querySelectorAll('#modeToggle input').forEach(r=>r.onchange=()=>{if(r.checked){state.mode=r.value;refreshWorkspace();loadMarketContext();}});

/* Swap search placeholder + quick-symbol chips for the active source. */
function applySourceChrome() {
  const S = SRC();
  $('searchInput').placeholder = S.placeholder;
  $('searchInput').value = '';
  $('quickSyms').innerHTML = 'Try: ' + S.quickSyms
    .map(s => `<button onclick="analyze('${S.known[s] || s}')">${esc(s)}</button>`).join('');
}

/* ---------------- search ---------------- */
let sugTimer = null, sugItems = [], sugSel = -1;
$('searchInput').addEventListener('input', (e) => {
  clearTimeout(sugTimer);
  const q = e.target.value.trim();
  if (!q) { closeSug(); return; }
  const searchSource=state.source;
  sugTimer = setTimeout(async () => {
    try {
      const { quotes } = await api(`/api/search?q=${encodeURIComponent(q)}&source=${searchSource}`);
      if(searchSource!==state.source||$('searchInput').value.trim()!==q)return;
      sugItems = quotes; sugSel = -1;
      const box = $('suggestions');
      box.innerHTML = quotes.map((s, i) =>
        `<div data-i="${i}"><span class="sym">${esc(s.symbol)}</span><span class="nm">${esc(s.name)}</span><span class="tp">${esc(s.exchange || SRC().label)}</span></div>`).join('');
      box.classList.toggle('open', quotes.length > 0);
      box.querySelectorAll('div').forEach(d => d.onclick = () => { const address=sugItems[+d.dataset.i].address; closeSug(); analyze(address); });
    } catch { closeSug(); }
  }, 250);
});
$('searchInput').addEventListener('keydown', (e) => {
  const box = $('suggestions');
  if (e.key === 'Enter') {
    e.preventDefault();
    if (sugSel >= 0 && sugItems[sugSel]) { const address=sugItems[sugSel].address; closeSug(); analyze(address); }
    else {
      const q = e.target.value.trim();
      if (q) { closeSug(); analyze(q); }
    }
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!sugItems.length) return;
    sugSel = (sugSel + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length;
    box.querySelectorAll('div').forEach((d, i) => d.classList.toggle('sel', i === sugSel));
  } else if (e.key === 'Escape') closeSug();
});
function closeSug() { $('suggestions').classList.remove('open'); sugItems = []; sugSel = -1; }

/* ---------------- analyze ---------------- */
async function analyze(query) {
  gotoView('analyze');
  const mode=state.mode, src=state.source, side=state.side, M=MODES[mode], request=++analyzeRequest;
  $('searchInput').value=query;
  $('analyzeResult').style.display='none';
  $('analyzeStatus').innerHTML='<div class="status-line"><span class="spinner"></span>Checking completed candles, two focused setups and higher-timeframe alignment…</div>';
  try {
    const address=await resolveToAddress(query,src);
    const result=await assessAddress(address,mode,src);
    if(request!==analyzeRequest||mode!==state.mode||src!==state.source||side!==state.side)return;
    state.current=result;
    const {asset}=result;
    renderAnalysis();
    $('searchInput').value = asset.symbol;
    $('analyzeStatus').innerHTML = '';
    $('analyzeResult').style.display = '';
  } catch (e) {
    if(request!==analyzeRequest||mode!==state.mode||src!==state.source||side!==state.side)return;
    const hint = SRC().id === 'dhan'
      ? 'Try an NSE/BSE ticker (RELIANCE, TCS, INFY…) or a company name.'
      : 'Try a Solana token symbol (SOL, JUP, BONK…) or paste its mint address.';
    $('analyzeStatus').innerHTML = `<div class="status-line err">Could not analyze "${esc(query)}": ${esc(e.message)}. ${hint}</div>`;
  }
}
window.analyze = analyze;

function renderAnalysis() {
  const { asset, assessment: R, daily } = state.current;
  const M = MODES[asset.mode || 'swing'];
  const prev = asset.candles[asset.candles.length - 2];
  const chg = prev ? ((asset.price - prev.c) / prev.c) * 100 : null;

  const cur = asset.currency === 'INR' ? '₹' : '$';
  const htfLabel = (asset.source === 'dhan' && M.higher.interval === '1wk') ? 'weekly (resampled)' : M.higher.interval;
  $('assetHead').innerHTML = `
    <span class="nm">${esc(asset.name)}</span>
    <span class="meta">${esc(asset.symbol)} · ${esc(asset.exchange || 'Solana')}${asset.type==='PERPETUAL'?' · $'+(asset.venueVolume24h/1e6).toFixed(1)+'M Jupiter 24h volume':asset.liquidity ? ' · $' + (asset.liquidity / 1e6).toFixed(1) + 'M liquidity' : ''}</span>
    <span class="px">${cur}${fmtPx(asset.price)} <span class="${chg >= 0 ? 'pos' : 'neg'}">${fmtPct(chg)}</span></span>
    <span class="meta">Range H/L: ${cur}${fmtPx(asset.low52)} – ${cur}${fmtPx(asset.high52)}</span>
    <span class="chip">${asset.side==='short'?'SELL / SHORT':'BUY / LONG'} · ${M.label} horizon · ${M.primary.interval} candles · ${esc(htfLabel)} higher-timeframe</span>${asset.venuePrice?`<span class="venue-price">Jupiter live price: $${fmtPx(asset.venuePrice)} · Chart: underlying spot</span>`:''}`;

  // score ring — instrument dial. Tick marks mark the actual tier thresholds
  // (42/58/72), so the ring encodes real information, not just a filled arc.
  const col = R.score >= 72 ? 'var(--up)' : R.score >= 58 ? 'var(--ok)' : R.score >= 42 ? 'var(--brass)' : 'var(--down)';
  const circ = 2 * Math.PI * 50;
  const tick = (s) => {
    const rad = (s / 100) * 2 * Math.PI;
    const [x1, y1] = [59 + 44 * Math.cos(rad), 59 + 44 * Math.sin(rad)];
    const [x2, y2] = [59 + 55 * Math.cos(rad), 59 + 55 * Math.sin(rad)];
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--line)" stroke-width="1.5"/>`;
  };
  $('scoreRing').innerHTML = `
    <svg width="118" height="118">
      <circle cx="59" cy="59" r="50" fill="none" stroke="var(--line-soft)" stroke-width="7"/>
      <circle cx="59" cy="59" r="50" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="butt"
        stroke-dasharray="${(R.score / 100) * circ} ${circ}"/>
      ${[42, 58, 72].map(tick).join('')}
    </svg>
    <div class="val" style="color:${col}">${R.score}<small>CHECKLIST</small></div>`;
  $('verdictText').innerHTML = `<span class="v ${R.verdictClass}">${esc(R.verdict)}</span>`;
  $('verdictSub').textContent=(asset.side==='short'?'SELL / SHORT · ':'BUY / LONG · ')+R.setup+' · '+M.label+' · checklist coverage, not win probability';
  $('regimeSub').textContent=`Market tide: ${R.marketCtx.regime||'unavailable'} · Closed candle: ${new Date(R.asOf).toLocaleString()} · Refresh to revalidate`;
  renderDecision();

  // watch button
  const watched = store.watch.includes(asset.address);
  $('watchBtn').textContent = watched ? '★ Watching' : '☆ Watch';
  $('watchBtn').onclick = () => {
    const w = store.watch;
    store.watch = watched ? w.filter(s => s !== asset.address) : [...w, asset.address];
    renderAnalysis();
  };

  // chart
  if (!state.chart) state.chart = new CandleChart($('chartCanvas'));
  const lines = [];
  if (R.plan) {
    lines.push({ price: R.plan.stop, color: '#bd6152', label: 'STOP' });
    lines.push({ price: (R.plan.entryLow + R.plan.entryHigh) / 2, color: '#c9963f', label: 'ENTRY' });
    R.plan.targets.forEach((t, i) => lines.push({ price: t.price, color: '#74a788', label: 'T' + (i + 1) }));
  }
  state.chart.setData({
    candles: asset.candles,
    overlays: [
      { name: 'EMA 20', series: TA.ema(asset.candles.map(c=>c.c),20), color: '#d1a552' },
      { name: 'SMA 50', series: daily.ind.sma50, color: '#7391a0' },
      { name: 'SMA 200', series: daily.ind.sma200, color: '#9c7a94' },
    ],
    zones: R.sr.support || R.sr.resistance ? daily.srZones.filter(z => z.touches >= 2) : [],
    lines, annotations:R.annotations, timezone:asset.source==='dhan'?'Asia/Kolkata':'UTC', interval:M.primary.interval,
    markers: R.patterns.filter(p => p.ageBars <= 12 && p.dir !== 'neutral').map(p => ({ i: p.i, dir: p.dir, label: p.name })),
  });
  $('chartLegend').innerHTML = [
    ['#d1a552', 'EMA 20'], ['#7391a0', 'SMA 50'], ['#9c7a94', 'SMA 200'],
    ['rgba(116,167,136,.5)', 'support zone'], ['rgba(189,97,82,.5)', 'resistance zone'],
  ].map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');

  // plan
  if (R.plan) {
    $('planRows').innerHTML = `
      <div class="plan-row entry"><span class="k">Entry zone</span><span class="p">${cur}${fmtPx(R.plan.entryLow)} – ${cur}${fmtPx(R.plan.entryHigh)}</span><span class="why">${esc(R.plan.entryNote)}</span></div>
      <div class="plan-row stop"><span class="k">Stop loss</span><span class="p">${cur}${fmtPx(R.plan.stop)} (${asset.side==='short'?'+':'−'}${R.plan.stopPct.toFixed(2)}%)</span><span class="why">${esc(R.plan.stopNote)}</span></div>
      ${R.plan.targets.map(t => `<div class="plan-row target"><span class="k">Exit</span><span class="p">${cur}${fmtPx(t.price)}</span><span class="rr-badge">${Number(t.rr).toFixed(2)}R</span><span class="why">${esc(t.label)}</span></div>`).join('')}
      <div style="margin-top:6px"><button class="star-btn" id="logTradeBtn">Log to journal</button></div>`;
    $('planExitRules').innerHTML = '<b>Exit rules:</b><br>' + R.plan.exitRules.map(r => '• ' + esc(r)).join('<br>');
    $('logTradeBtn').onclick = () => {
      const j = store.journal;
      const entry = (R.plan.entryLow + R.plan.entryHigh) / 2;
      const riskPct = +$('calcRisk').value || KB.riskManagement.maxRiskPerTradePct;
      j.unshift({
        date: new Date().toISOString().slice(0, 10), symbol: asset.symbol, name: asset.name,
        entry, stop: R.plan.stop, target: R.plan.targets[0].price,
        side:asset.side,address:asset.address,source:asset.source,currency:asset.currency,mode:asset.mode,setup:R.setup,version:R.version,
        snapshot:JSON.parse(JSON.stringify({plan:R.plan,asOf:R.asOf,status:R.status})),
        rr: R.plan.rr2, status: 'planned', resultR: null, riskPct,
      });
      store.journal = j;
      $('logTradeBtn').textContent = '✓ Logged';
    };
    // prefill calculator
    $('calcEntry').value = String(R.plan.entryLow);
    $('calcStop').value = R.plan.stop;
    runCalc();
  } else {
    $('planRows').innerHTML = '<div class="status-line">No qualifying plan for the selected direction. Wait for a new formation.</div>';
    $('planExitRules').innerHTML = '';
    $('calcEntry').value=''; $('calcStop').value=''; runCalc();
  }

  // risks
  $('riskList').innerHTML = R.riskFactors.slice(0, 10).map(r =>
    `<li class="${r.hard ? 'hard' : 'con'}"><span class="pts">${r.hard ? '⛔' : '⚠'}</span><span>${esc(r.text)}</span><span class="src-tag">${esc(r.src)}</span></li>`).join('')
    + (asset.type==='PERPETUAL'?'<li class="con">Perpetual positions incur borrowing and execution costs. This is an underlying-price setup, not a liquidation or leveraged-margin calculation.</li>':asset.isCrypto ? KB.cryptoRisks.slice(0, 4).map(r => `<li class="con"><span class="pts">₿</span><span>${esc(r.risk)}</span><span class="src-tag">${esc(r.src)}</span></li>`).join('') : '');

  // pros/cons
  $('prosList').innerHTML = R.pros.map(p => `<li class="pro"><span class="pts">+${p.pts||'✓'}</span><span>${esc(p.text)}</span><span class="src-tag">${esc(p.src)}</span></li>`).join('') || '<li>Nothing constructive right now.</li>';
  $('consList').innerHTML = R.cons.map(c => `<li class="con"><span class="pts">${c.pts||'!'} </span><span>${esc(c.text)}</span><span class="src-tag">${esc(c.src)}</span></li>`).join('') || '<li>No negatives detected.</li>';

  // patterns
  const patHtml = R.patterns.slice(0, 8).map(p => {
    const note = KB.patternNotes[p.key];
    return `<li class="${p.dir === 'up' ? 'pro' : p.dir === 'down' ? 'con' : ''}">
      <span class="pts">${p.dir === 'up' ? '▲' : p.dir === 'down' ? '▼' : '◆'}</span>
      <span><b>${esc(p.name)}</b> — ${p.ageBars === 0 ? 'latest completed bar' : p.ageBars + ' bar(s) ago'}${p.atLevel ? ', at a key level' : ''}${p.confirmed === true ? ', confirmed' : p.confirmed === false ? ', unconfirmed' : ''}.
      ${note ? `<br><small style="color:var(--muted)">${esc(note.entry)} Stop: ${esc(note.stop)}</small>` : ''}</span>
      <span class="src-tag">${esc(note ? note.src : '')}</span></li>`;
  }).join('');
  $('patternList').innerHTML = patHtml || '<li>No notable candlestick patterns in the last 12 bars.</li>';

  // chart patterns (multi-bar) + gaps + no-demand/no-supply
  const stats = (key) => KB.bulkowskiStats[key];
  const cpHtml = R.chartPatterns.map(p => {
    const s = null; // Published statistics do not estimate this detector’s outcomes.
    const statText = s ? `Backtested failure rate ${(s.failureRate * 100).toFixed(0)}%, avg move ${(s.avgMove * 100).toFixed(0)}%, rank ${s.rank}/${s.of}. ${esc(s.note)}` : '';
    const confText = p.confirmed === true ? 'confirmed' : p.confirmed === false ? 'forming, unconfirmed' : 'still consolidating';
    const noteText = p.note ? ` ${esc(p.note)}` : '';
    return `<li class="${p.dir === 'up' ? 'pro' : p.dir === 'down' ? 'con' : ''}">
      <span class="pts">${p.dir === 'up' ? '▲' : p.dir === 'down' ? '▼' : '◆'}</span>
      <span><b>${esc(p.name)}</b> — ${p.ageBars} bar(s) ago, ${confText}.
      ${statText || noteText ? `<br><small style="color:var(--muted)">${statText}${noteText}</small>` : ''}</span>
      <span class="src-tag">${esc(s ? 'Bulkowski' : 'Edwards & Magee')}</span></li>`;
  }).join('');
  const gapHtml = R.gaps.map(g => {
    const scored = g.classification !== 'common';
    const commonNote = !scored ? ' Occurred inside a trading range — Edwards & Magee say these carry no forecasting significance, so it doesn\'t move the score.' : '';
    return `<li class="${scored ? (g.dir === 'up' ? 'pro' : 'con') : ''}">
    <span class="pts">${g.dir === 'up' ? '▲' : '▼'}</span>
    <span><b>${esc(g.classification.charAt(0).toUpperCase() + g.classification.slice(1))} gap ${g.dir}</b> — ${g.ageBars} bar(s) ago (${(g.sizePct * 100).toFixed(1)}% gap).${commonNote ? `<br><small style="color:var(--muted)">${commonNote}</small>` : ''}</span>
    <span class="src-tag">Edwards &amp; Magee</span></li>`;
  }).join('');
  const ndnsHtml = R.noDemandSupply.map(x => `<li class="${x.dir === 'up' ? 'pro' : 'con'}">
    <span class="pts">${x.dir === 'up' ? '▲' : '▼'}</span>
    <span><b>${esc(x.name)}</b> — ${x.ageBars} bar(s) ago. Narrow range on below-average volume; the expected side isn't showing up.</span>
    <span class="src-tag">Anna Coulling</span></li>`).join('');
  $('chartPatternList').innerHTML = (cpHtml + gapHtml + ndnsHtml) || '<li>No multi-bar chart patterns, gaps, or no-demand/no-supply bars detected right now.</li>';
}

function renderDecision() {
  const {assessment:R,asset}=state.current, p=R.plan,ccy=asset.currency==='INR'?'₹':'$';
  $('decisionCard').innerHTML=`<div class="decision-heading"><div><small>PRIMARY SETUP · ${esc(R.version)}</small><h2>${esc(R.setup)}</h2></div><button id="refreshAnalysis" class="star-btn">Refresh analysis</button></div>
    <p>${esc(R.selected?.reason||(asset.side==='short'?'Wait for a bearish rally rejection or a support breakdown and failed retest.':'Wait for a controlled trend pullback or a range breakout and retest.'))}</p>
    ${p?`<div class="decision-grid"><div><small>Conditional entry</small><b>${ccy}${fmtPx(p.entryLow)}</b></div><div><small>${p.side==='short'?'Minimum valid fill':'Maximum valid fill'}</small><b>${ccy}${fmtPx(p.side==='short'?p.minEntry:p.maxEntry)}</b></div><div><small>Protective stop</small><b>${ccy}${fmtPx(p.stop)}</b></div><div><small>Structural target</small><b>${ccy}${fmtPx(p.targets[0].price)}</b></div><div><small>Gross reward / risk</small><b>${p.rr1.toFixed(2)}R</b></div><div><small>Trigger distance</small><b>${R.entryDistance.toFixed(2)}%</b></div></div><p>${esc(p.entryNote)}</p>`:''}
    <div class="checklist">${R.checks.map(c=>`<span class="${c.pass?'pos':'neg'}">${c.pass?'✓':'○'} ${esc(c.label)}</span>`).join('')}</div>
    <p class="footnote">${esc(R.selected?.source||'Stewie / Edwards & Magee')} · Directional rules are research adaptations, not validated trading edges. Re-evaluate next candle; levels are conditional, not guaranteed fills.</p>
    <details class="edu"><summary>Other strategy interpretation</summary><div class="body">${['pullback','breakout'].map(key=>{const c=R.candidates.find(x=>x.key===key);return `<p><b>${key==='pullback'?(asset.side==='short'?'EMA20 bearish rally':'EMA20 trend pullback'):(asset.side==='short'?'Range breakdown / retest':'Range breakout / retest')}</b>: ${esc(c?c.status+' — '+(c.blockers.join('; ')||c.reason):'Formation conditions not met')}</p>`;}).join('')}</div></details>`;
  $('refreshAnalysis').onclick=()=>{assessmentCache.delete(`${asset.source}:${asset.mode}:${asset.side}:${asset.address}`);analyze(asset.address);};
}

/* Sizing is an execution estimate, separate from setup eligibility. */
const sizingIds=['calcAccount','calcRisk','calcAvailable','calcCosts','calcEntry','calcStop'];
for(const id of sizingIds)$(id).addEventListener('input',()=>{saveSizing();runCalc();});
function saveSizing(){try{localStorage['tsSizing:'+state.source]=JSON.stringify(Object.fromEntries(sizingIds.slice(0,4).map(id=>[id,$(id).value])));}catch{}}
function restoreSizing(){try{const p=JSON.parse(localStorage['tsSizing:'+state.source]||'{}');for(const id of sizingIds.slice(0,4))$(id).value=p[id]??({calcAccount:10000,calcRisk:.5,calcAvailable:10000,calcCosts:10}[id]);}catch{}}
function runCalc(){
  const acc=+$('calcAccount').value,risk=+$('calcRisk').value,entry=+$('calcEntry').value,stop=+$('calcStop').value;
  const out=Engine.positionSize(acc,risk,entry,stop,{side:state.side,isCrypto:state.current?.asset.isCrypto??SRC().isCrypto,available:+$('calcAvailable').value,costBps:+$('calcCosts').value});
  if(!out){$('calcOut').textContent='Enter positive account, entry and stop; stop must be below a long entry or above a short entry. Risk budget must be >0 and ≤1%.';return;}
  const openHeat=store.journal.filter(t=>t.status==='open'&&t.source===state.source).reduce((sum,t)=>sum+(Number(t.riskPct)||0),0);
  const remaining=Math.max(0,2-openHeat),plan=state.current?.assessment.plan;
  const netRR=plan?((state.side==='short'?entry-plan.targets[0].price:plan.targets[0].price-entry)-entry*(+$('calcCosts').value)/10000)/(Math.abs(entry-stop)+entry*(+$('calcCosts').value)/10000):null;
  const eligible=state.current?.assessment.status==='ready'&&out.units>0&&out.actualRiskPct<=remaining&&entry>=plan.entryLow&&entry<=plan.entryHigh&&netRR>=2;
  $('calcOut').innerHTML=`<b>${out.units}</b> ${SRC().isCrypto?'underlying units (notional estimate)':'whole shares'} · position <b>${CCY()}${fmtPx(out.value)}</b> · estimated risk <b>${CCY()}${fmtPx(out.riskAmt)} (${out.actualRiskPct.toFixed(2)}%)</b><br>Estimated round-trip costs: ${CCY()}${fmtPx(out.estimatedCosts)} · Remaining source-account risk budget: ${remaining.toFixed(2)}%${netRR!=null?' · Net R:R '+netRR.toFixed(2):''}<br><span class="${eligible?'pos':'neg'}">${eligible?'Sizing checks pass for the confirmed setup.':'Planning only — setup, fill range, net 2R, quantity or portfolio-risk checks do not pass.'}</span>`;
}
restoreSizing();

/* ---------------- scanner ---------------- */
$('scanBtn').onclick=runScan;
$('scanFilter').onchange=renderScanRows;
async function runScan(){
  const mode=state.mode,src=state.source,M=MODES[mode],request=++scanRequest;
  $('scanBtn').disabled=true;$('scanTable').style.display='none';
  $('scanStatus').innerHTML='<div class="status-line"><span class="spinner"></span>Loading universe and completed-candle assessments…</div>';
  const active=()=>request===scanRequest&&src===state.source&&mode===state.mode;
  try{
    const [list,ctx]=await Promise.all([api(`/api/tokenlist?limit=${M.scanLimit}&source=${src}`),marketCtxFor(mode,src)]);
    if(!list.length)throw new Error('No instruments returned');
    const batch=await api(`/api/batch?addresses=${list.map(t=>encodeURIComponent(t.address)).join(',')}&range=${M.primary.range}&interval=${M.primary.interval}&source=${src}`);
    const rows=[],queue=[...list];
    await Promise.all(Array.from({length:3},async()=>{while(queue.length&&active()){
      const t=queue.shift();try{
        if(batch[t.address]?.error)throw new Error(batch[t.address].error);
        const value=await assessAddress(t.address,mode,src,batch[t.address],ctx);
        rows.push({addr:t.address,sym:value.asset.symbol,name:value.asset.name,value});
      }catch(e){rows.push({addr:t.address,sym:t.symbol,name:t.name,error:e.message});}
      if(active())$('scanStatus').textContent=`Assessed ${rows.length} of ${list.length} · ${M.label}`;
    }}));
    if(!active())return;
    rows.sort((a,b)=>(Engine.statusOrder[a.value?.assessment.status||'unavailable']-Engine.statusOrder[b.value?.assessment.status||'unavailable'])||Math.abs(a.value?.assessment.entryDistance??Infinity)-Math.abs(b.value?.assessment.entryDistance??Infinity));
    state.scanCache=rows;renderScanRows();
    $('scanStatus').textContent=`${rows.length} instruments · ${rows.filter(r=>r.value?.assessment.status==='ready').length} technically ready (verify sizing and live fill) · ${rows.filter(r=>r.error||r.value?.assessment.status==='unavailable').length} unavailable. Click a row to inspect the same snapshot.`;
  }catch(e){if(active())$('scanStatus').textContent='Scan failed: '+e.message;}
  finally{if(request===scanRequest)$('scanBtn').disabled=false;}
}
function renderScanRows(){
  const filter=$('scanFilter').value;
  const rows=(state.scanCache||[]).filter(r=>filter==='all'||r.value?.assessment.status===filter);
  $('scanBody').innerHTML=rows.map((r,i)=>{
    const a=r.value?.asset,R=r.value?.assessment;
    return `<tr class="row" data-address="${esc(r.addr)}"><td>${i+1}</td><td><b>${esc(r.sym)}</b><br><small>${esc(r.name)}</small></td><td>${a?CCY()+fmtPx(a.price):'—'}</td><td>${esc(R?.setup||'—')}</td><td><span class="badge ${R?.verdictClass||'avoid'}">${esc(R?.verdict||'Unavailable')}</span></td><td>${R?R.htfAligned?'Aligned':'Conflicting / unknown':'—'}</td><td>${R?.entryDistance!=null?R.entryDistance.toFixed(2)+'%':'—'}</td><td>${R?.plan?R.plan.rr1.toFixed(2)+'R':'—'}</td><td>${R?R.liquidityOK?'Pass':'Fail / unknown':'—'}</td><td>${R?esc(new Date(R.asOf).toLocaleString()):esc(r.error)}</td></tr>`;
  }).join('');
  $('scanBody').querySelectorAll('[data-address]').forEach(row=>row.onclick=()=>analyze(row.dataset.address));
  $('scanTable').style.display='';
}
/* ---------------- watchlist ---------------- */
async function renderWatchlist(){
  const mode=state.mode,src=state.source,request=++watchRequest;
  const addrs=store.watch.filter(a=>SOURCES[src].addrRe.test(a));
  $('wlTable').style.display='none';$('wlStatus').textContent=addrs.length?'Refreshing watched setups…':'No watched setups for this market.';
  const rows=[];
  for(const addr of addrs){try{rows.push({addr,value:await assessAddress(addr,mode,src)});}catch(e){rows.push({addr,error:e.message});}}
  if(request!==watchRequest||mode!==state.mode||src!==state.source)return;
  $('wlBody').innerHTML=rows.map(r=>`<tr data-address="${esc(r.addr)}"><td>${esc(r.value?.asset.symbol||r.addr)}</td><td>${r.value?CCY()+fmtPx(r.value.asset.price):'—'}</td><td>${esc(r.value?.assessment.setup||'—')}</td><td>${esc(r.value?.assessment.verdict||'Unavailable')}</td><td>${esc(r.error||'')}</td><td><button class="star-btn remove-watch" data-remove="${esc(r.addr)}">Remove</button></td></tr>`).join('');
  $('wlBody').querySelectorAll('[data-address]').forEach(row=>row.onclick=()=>analyze(row.dataset.address));
  $('wlBody').querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();unwatch(btn.dataset.remove);});
  if(rows.length){$('wlStatus').textContent='Refresh occurs when opening Watchlist. No background alerts are running.';$('wlTable').style.display='';}
}
window.unwatch=addr=>{store.watch=store.watch.filter(a=>a!==addr);renderWatchlist();};

/* ---------------- journal ---------------- */
function renderJournal() {
  const j = store.journal;
  const rMultiples = j.filter(t=>['won','lost','scratched'].includes(t.status)&&t.source===state.source).map(t => t.resultR).filter(Number.isFinite);
  const s = Engine.sqn(rMultiples);
  const maxHeat = 2; // Tharp's "Average" tier as a default until enough trades exist
  const openHeat = j.filter(t => t.status === 'open' && t.source === state.source).reduce((sum, t) => sum + (t.riskPct || 0), 0);
  const heatOver = openHeat > maxHeat;
  const sqnLine = s
    ? `SQN = <b>${s.value}</b> — <b>${esc(s.rating)}</b> (${s.sampleSize} trade${s.sampleSize === 1 ? '' : 's'} with a logged result)`
    : `SQN not yet available — log ±R results on at least 5 closed trades (Tharp wants 20+ before trusting it).`;
  $('sqnPanel').innerHTML = `
    <div class="calc-out">
      ${sqnLine}<br>
      Current portfolio heat (sum of risk% across OPEN positions): <b class="${heatOver ? 'neg' : 'pos'}">${openHeat.toFixed(1)}%</b>
      — app risk budget (not increased by SQN): <b>${maxHeat}%</b>${heatOver ? ' <b class="neg">— OVER the recommended cap</b>' : ''}
    </div>
    ${s?.note ? `<div class="footnote">${esc(s.note)}</div>` : ''}
    <div class="footnote">SQN = (mean R-multiple ÷ stdev R-multiple) × √trades. Portfolio heat only counts trades marked "open" below — mark a trade open once you've actually entered it.</div>`;
  if (!j.length) { $('jrStatus').innerHTML = '<div class="status-line">No trades logged yet. Build a plan in Analyze and press "Log to journal".</div>'; $('jrTable').style.display = 'none'; return; }
  $('jrStatus').innerHTML = '';
  $('jrTable').style.display = '';
  $('jrBody').innerHTML = j.map((t, i) => `
    <tr>
      <td>${esc(t.date)}</td>
      <td><b>${esc(t.symbol)} <small>${esc(t.side||'long')}</small></b><br><small>${esc(t.source||'legacy')} · ${esc(t.mode||'unknown')} · ${esc(t.setup||'legacy plan')}</small></td>
      <td>${fmtPx(t.entry)}</td>
      <td style="color:var(--down)">${fmtPx(t.stop)}</td>
      <td style="color:var(--up)">${fmtPx(t.target)}</td>
      <td><input value="${t.riskPct ?? ''}" placeholder="%" style="width:48px;background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:3px" onchange="jrRisk(${i}, this.value)"></td>
      <td>${Number(t.rr).toFixed(2)}R</td>
      <td>
        <select onchange="jrStatus(${i}, this.value)" style="background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:3px">
          ${['planned', 'open', 'won', 'lost', 'scratched'].map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input value="${t.resultR ?? ''}" placeholder="±R" style="width:60px;background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:3px" onchange="jrResult(${i}, this.value)"></td>
      <td><button class="star-btn" onclick="jrDel(${i})">✕</button></td>
    </tr>`).join('');
}
window.jrStatus = (i, v) => { const j = store.journal; j[i].status = v; store.journal = j; renderJournal(); };
window.jrResult = (i, v) => { const j = store.journal; j[i].resultR = v === '' ? null : +v; store.journal = j; renderJournal(); };
window.jrRisk = (i, v) => { const j = store.journal; j[i].riskPct = v === '' ? null : +v; store.journal = j; renderJournal(); };
window.jrDel = (i) => { const j = store.journal; j.splice(i, 1); store.journal = j; renderJournal(); };

/* ---------------- playbook ---------------- */
function renderPlaybook() {
  const sec = (title, items, fmt) => `
    <details class="edu"><summary>${title}</summary><div class="body"><ul>
      ${items.map(fmt).join('')}</ul></div></details>`;
  const li = (r) => `<li>${esc(r.rule || r.risk || r.w || r.text)} <span class="src-tag">${esc(r.src)}</span></li>`;
  $('learnBody').innerHTML =
    sec('Active rules — the selected playbook (v2)', KB.selectedRules, li) +
    sec('The core framework — Trend → Level → Signal', KB.trendLevelSignal, li) +
    sec('Candlestick filters — when NOT to trust a pattern', KB.candlestickFilters, li) +
    sec('Risk management — the non-negotiables', KB.riskManagement.notes, li) +
    sec('Stop-loss placement', KB.stopRules, li) +
    sec('Exits & profit-taking', KB.exitRules, li) +
    sec('Reading the market regime', KB.marketRegime, li) +
    sec('Core signals the engine scores', Object.values(KB.signals), li) +
    sec('Smart-money concepts', KB.smartMoney, li) +
    sec('Wyckoff & volume-price analysis', KB.wyckoff, li) +
    sec('Reading multiple signals together (confluence)', KB.confluenceRules, li) +
    sec('Swing trading & options rules', KB.swingRules, li) +
    sec('Position sizing beyond flat 1% risk', KB.positionSizingModels, li) +
    sec('Crypto-specific dangers', KB.cryptoRisks, li) +
    sec('Picking which crypto to trade', KB.coinSelection, li) +
    sec('Psychology & discipline', KB.psychology, li) +
    sec('Trading in the Zone — the five fundamental truths', KB.psychologyDeep.fiveFundamentalTruths.map(t => ({ rule: t, src: KB.psychologyDeep.src })), li) +
    sec('Trading in the Zone — seven principles of consistency', KB.psychologyDeep.sevenPrinciplesOfConsistency.map(t => ({ rule: t, src: KB.psychologyDeep.src })), li) +
    sec('Market Wizards — cross-trader consensus', KB.marketWizardsConsensus, li) +
    sec('Livermore maxims', KB.livermoreMaxims, li) +
    sec('This engine\'s own limitations', KB.engineSelfCritique, li);
}

$('chartReset').onclick=()=>state.chart?.resetView();
$('chartTools').querySelectorAll('[data-layer]').forEach(input=>input.onchange=()=>state.chart?.setLayer(input.dataset.layer,input.checked));
/* ---------------- init ---------------- */
$('disclaimer').textContent = KB.disclaimer;
renderPlaybook();
applySourceChrome();
updateWorkspaceChrome();
loadMarketContext();
