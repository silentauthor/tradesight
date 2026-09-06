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
    scanRange: '1y', scanLimit: 30, minBars: 60,
    tf: () => Engine.TF_SWING,
  },
  intraday: {
    id: 'intraday', label: 'Intraday',
    primary: { interval: '15m', range: '10d' },
    higher: { interval: '1h', range: '1mo' },
    tide: { interval: '1h', range: '1mo' },
    scanRange: '10d', scanLimit: 20, minBars: 60,
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
  mode: (() => { try { return MODES[localStorage.tsMode] ? localStorage.tsMode : 'swing'; } catch { return 'swing'; } })(),
  source: (() => { try { return SOURCES[localStorage.tsSource] ? localStorage.tsSource : 'birdeye'; } catch { return 'birdeye'; } })(),
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
async function resolveToAddress(q) {
  const s = String(q || '').trim();
  const src = SRC();
  if (src.addrRe.test(s)) return s;
  const hit = src.known[s.toUpperCase()];
  if (hit) return hit;
  const { quotes } = await api(`/api/search?q=${encodeURIComponent(s)}&source=${state.source}`);
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
    const ctx = Engine.marketRegime(TA.analyzeSeries(anchor.candles), S.tideLabel);
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
async function marketCtxFor(mode) {
  return state.marketCtxByMode[ctxKey(mode, state.source)] || await loadMarketContext(mode, state.source);
}

/* Re-run whatever analysis view is currently on screen. */
function rerunActiveView() {
  if (state.current) analyze(state.current.asset.address);
  if (state.scanCache) runScan();
  if (document.querySelector('#view-watchlist.active')) renderWatchlist();
}

/* ---------------- horizon + source toggles ---------------- */
function wireToggle(sel, key, storageKey, onChange) {
  document.querySelectorAll(`${sel} input`).forEach(r => { r.checked = r.value === state[key]; });
  document.querySelectorAll(`${sel} input`).forEach(radio => {
    radio.onchange = async () => {
      if (!radio.checked || radio.value === state[key]) return;
      state[key] = radio.value;
      try { localStorage[storageKey] = state[key]; } catch { /* ignore */ }
      await onChange();
    };
  });
}
wireToggle('#modeToggle', 'mode', 'tsMode', async () => {
  await loadMarketContext(state.mode);
  rerunActiveView();
});
wireToggle('#sourceToggle', 'source', 'tsSource', async () => {
  applySourceChrome();
  state.current = null; state.scanCache = null; // stale — different market
  $('analyzeResult').style.display = 'none';
  $('scanTable').style.display = 'none';
  $('scanStatus').innerHTML = '';
  if (document.querySelector('#view-analyze.active')) {
    $('analyzeStatus').innerHTML = `<div class="status-line">Data source is now <b>${esc(SRC().label)} · ${esc(SRC().sub)}</b> — search a ${state.source === 'dhan' ? 'NSE/BSE stock' : 'Solana token'} to analyze.</div>`;
  }
  await loadMarketContext(state.mode);
  if (document.querySelector('#view-watchlist.active')) renderWatchlist();
});

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
  sugTimer = setTimeout(async () => {
    try {
      const { quotes } = await api(`/api/search?q=${encodeURIComponent(q)}&source=${state.source}`);
      sugItems = quotes; sugSel = -1;
      const box = $('suggestions');
      box.innerHTML = quotes.map((s, i) =>
        `<div data-i="${i}"><span class="sym">${esc(s.symbol)}</span><span class="nm">${esc(s.name)}</span><span class="tp">${esc(s.exchange || SRC().label)}</span></div>`).join('');
      box.classList.toggle('open', quotes.length > 0);
      box.querySelectorAll('div').forEach(d => d.onclick = () => { closeSug(); analyze(sugItems[+d.dataset.i].address); });
    } catch { closeSug(); }
  }, 250);
});
$('searchInput').addEventListener('keydown', (e) => {
  const box = $('suggestions');
  if (e.key === 'Enter') {
    e.preventDefault();
    if (sugSel >= 0 && sugItems[sugSel]) { closeSug(); analyze(sugItems[sugSel].address); }
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
  const M = MODES[state.mode], src = state.source;
  // Dhan has no native weekly feed — resample the daily series for the swing HTF.
  const resampleHtf = src === 'dhan' && M.higher.interval === '1wk';
  $('searchInput').value = query;
  $('analyzeResult').style.display = 'none';
  $('analyzeStatus').innerHTML = `<div class="status-line"><span class="spinner"></span>Running the ${M.label.toLowerCase()} engine (${M.primary.interval} candles, ${M.higher.interval} higher-timeframe) on <b>${esc(query)}</b>…</div>`;
  try {
    const address = await resolveToAddress(query);
    const [primaryData, higherData, marketCtx] = await Promise.all([
      api(`/api/chart?address=${encodeURIComponent(address)}&range=${M.primary.range}&interval=${M.primary.interval}&source=${src}`),
      resampleHtf
        ? Promise.resolve({ candles: [] })
        : api(`/api/chart?address=${encodeURIComponent(address)}&range=${M.higher.range}&interval=${M.higher.interval}&source=${src}`).catch(() => ({ candles: [] })),
      marketCtxFor(state.mode),
    ]);
    if (!primaryData.candles || primaryData.candles.length < M.minBars) throw new Error(`not enough ${M.primary.interval} price history to analyze safely`);
    const asset = { ...primaryData, isCrypto: SRC().isCrypto, mode: state.mode, source: src };
    const daily = TA.analyzeSeries(asset.candles);
    const htfCandles = resampleHtf ? TA.resampleWeekly(asset.candles) : (higherData.candles || []);
    const weekly = htfCandles.length > 30 ? TA.analyzeSeries(htfCandles) : null;
    const assessment = Engine.assess(asset, daily, weekly, marketCtx, M.tf());
    state.current = { asset, assessment, daily, weekly };
    renderAnalysis();
    $('searchInput').value = asset.symbol;
    $('analyzeStatus').innerHTML = '';
    $('analyzeResult').style.display = '';
  } catch (e) {
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
    <span class="meta">${esc(asset.symbol)} · ${esc(asset.exchange || 'Solana')}${asset.liquidity ? ' · $' + (asset.liquidity / 1e6).toFixed(1) + 'M liquidity' : ''}</span>
    <span class="px">${cur}${fmtPx(asset.price)} <span class="${chg >= 0 ? 'pos' : 'neg'}">${fmtPct(chg)}</span></span>
    <span class="meta">Range H/L: ${cur}${fmtPx(asset.low52)} – ${cur}${fmtPx(asset.high52)}</span>
    <span class="chip">${M.label} horizon · ${M.primary.interval} candles · ${esc(htfLabel)} higher-timeframe</span>`;

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
    <div class="val" style="color:${col}">${R.score}<small>SETUP SCORE</small></div>`;
  $('verdictText').innerHTML = `<span class="v ${R.verdictClass}">${esc(R.verdict)}</span>`;
  if (R.flags.length) {
    $('verdictSub').textContent = `⚠ ${R.flags.length} hard red flag${R.flags.length > 1 ? 's' : ''} cap this score — see risk factors.`;
  } else {
    const above200 = R.latest.sma200 != null && R.latest.price > R.latest.sma200;
    const disagree = (R.structure.trend === 'downtrend' && above200) || (R.structure.trend === 'uptrend' && R.latest.sma200 != null && !above200);
    const structureTitle = `Based on the last few swing highs/lows — a shorter-term read, separate from the ${M.tf().maLong} regime shown in the score reasons below. The two can disagree.`;
    $('verdictSub').innerHTML = `<span title="${esc(structureTitle)}" style="border-bottom:1px dotted var(--paper-faint);cursor:help">Structure: ${esc(R.structure.trend)}</span> · RSI ${R.latest.rsi?.toFixed(0) ?? '—'} · ATR ${R.atrPct?.toFixed(1) ?? '—'}% of price`
      + (disagree ? ` <span style="color:var(--paper-faint)">(structure disagrees with the ${M.tf().maLong} regime — see reasons below)</span>` : '');
  }
  $('regimeSub').textContent = state.marketCtx.detail
    ? `Market tide: ${state.marketCtx.regime} (${state.marketCtx.detail})`
    : '';

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
      { name: 'SMA 20', series: daily.ind.sma20, color: '#d1a552' },
      { name: 'SMA 50', series: daily.ind.sma50, color: '#7391a0' },
      { name: 'SMA 200', series: daily.ind.sma200, color: '#9c7a94' },
    ],
    zones: R.sr.support || R.sr.resistance ? daily.srZones.filter(z => z.touches >= 2) : [],
    lines,
    markers: R.patterns.filter(p => p.ageBars <= 12 && p.dir !== 'neutral').map(p => ({ i: p.i, dir: p.dir, label: p.name })),
  });
  $('chartLegend').innerHTML = [
    ['#d1a552', 'SMA 20'], ['#7391a0', 'SMA 50'], ['#9c7a94', 'SMA 200'],
    ['rgba(116,167,136,.5)', 'support zone'], ['rgba(189,97,82,.5)', 'resistance zone'],
  ].map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');

  // plan
  if (R.plan) {
    $('planRows').innerHTML = `
      <div class="plan-row entry"><span class="k">Entry zone</span><span class="p">${cur}${fmtPx(R.plan.entryLow)} – ${cur}${fmtPx(R.plan.entryHigh)}</span><span class="why">${esc(R.plan.entryNote)}</span></div>
      <div class="plan-row stop"><span class="k">Stop loss</span><span class="p">${cur}${fmtPx(R.plan.stop)} (−${R.plan.stopPct}%)</span><span class="why">${esc(R.plan.stopNote)}</span></div>
      ${R.plan.targets.map(t => `<div class="plan-row target"><span class="k">Exit</span><span class="p">${cur}${fmtPx(t.price)}</span><span class="rr-badge">${t.rr}R</span><span class="why">${esc(t.label)}</span></div>`).join('')}
      <div style="margin-top:6px"><button class="star-btn" id="logTradeBtn">Log to journal</button></div>`;
    $('planExitRules').innerHTML = '<b>Exit rules:</b><br>' + R.plan.exitRules.map(r => '• ' + esc(r)).join('<br>');
    $('logTradeBtn').onclick = () => {
      const j = store.journal;
      const entry = (R.plan.entryLow + R.plan.entryHigh) / 2;
      const riskPct = +$('calcRisk').value || KB.riskManagement.maxRiskPerTradePct;
      j.unshift({
        date: new Date().toISOString().slice(0, 10), symbol: asset.symbol, name: asset.name,
        entry: +entry.toFixed(4), stop: R.plan.stop, target: R.plan.targets[1].price,
        rr: R.plan.rr2, status: 'planned', resultR: null, riskPct,
      });
      store.journal = j;
      $('logTradeBtn').textContent = '✓ Logged';
    };
    // prefill calculator
    $('calcEntry').value = ((R.plan.entryLow + R.plan.entryHigh) / 2).toFixed(asset.price < 1 ? 6 : 2);
    $('calcStop').value = R.plan.stop;
    runCalc();
  } else {
    $('planRows').innerHTML = '<div class="status-line">No coherent long plan can be built from current structure.</div>';
    $('planExitRules').innerHTML = '';
  }

  // risks
  $('riskList').innerHTML = R.riskFactors.slice(0, 10).map(r =>
    `<li class="${r.hard ? 'hard' : 'con'}"><span class="pts">${r.hard ? '⛔' : '⚠'}</span><span>${esc(r.text)}</span><span class="src-tag">${esc(r.src)}</span></li>`).join('')
    + (asset.isCrypto ? KB.cryptoRisks.slice(0, 4).map(r => `<li class="con"><span class="pts">₿</span><span>${esc(r.risk)}</span><span class="src-tag">${esc(r.src)}</span></li>`).join('') : '');

  // pros/cons
  $('prosList').innerHTML = R.pros.map(p => `<li class="pro"><span class="pts">+${p.pts}</span><span>${esc(p.text)}</span><span class="src-tag">${esc(p.src)}</span></li>`).join('') || '<li>Nothing constructive right now.</li>';
  $('consList').innerHTML = R.cons.map(c => `<li class="con"><span class="pts">${c.pts}</span><span>${esc(c.text)}</span><span class="src-tag">${esc(c.src)}</span></li>`).join('') || '<li>No negatives detected.</li>';

  // patterns
  const patHtml = R.patterns.slice(0, 8).map(p => {
    const note = KB.patternNotes[p.key];
    return `<li class="${p.dir === 'up' ? 'pro' : p.dir === 'down' ? 'con' : ''}">
      <span class="pts">${p.dir === 'up' ? '▲' : p.dir === 'down' ? '▼' : '◆'}</span>
      <span><b>${esc(p.name)}</b> — ${p.ageBars === 0 ? 'current bar' : p.ageBars + ' bar(s) ago'}${p.atLevel ? ', at a key level' : ''}${p.confirmed === true ? ', confirmed' : p.confirmed === false ? ', unconfirmed' : ''}.
      ${note ? `<br><small style="color:var(--muted)">${esc(note.entry)} Stop: ${esc(note.stop)}</small>` : ''}</span>
      <span class="src-tag">${esc(note ? note.src : '')}</span></li>`;
  }).join('');
  $('patternList').innerHTML = patHtml || '<li>No notable candlestick patterns in the last 12 bars.</li>';

  // chart patterns (multi-bar) + gaps + no-demand/no-supply
  const stats = (key) => KB.bulkowskiStats[key];
  const cpHtml = R.chartPatterns.map(p => {
    const s = stats(p.key);
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

/* calculator */
['calcAccount', 'calcRisk', 'calcEntry', 'calcStop'].forEach(id => $(id).addEventListener('input', runCalc));
function runCalc() {
  const acc = +$('calcAccount').value, risk = +$('calcRisk').value;
  const entry = +$('calcEntry').value, stop = +$('calcStop').value;
  const out = Engine.positionSize(acc, risk, entry, stop);
  if (!out) { $('calcOut').innerHTML = '<span style="color:var(--muted)">Enter account, entry and stop (stop must be below entry).</span>'; return; }
  $('calcOut').innerHTML =
    `Buy <b>${out.units}</b> units ≈ <b>${CCY()}${out.value.toLocaleString()}</b> position · risking <b>${CCY()}${out.riskAmt.toLocaleString()}</b> (${risk}% of account) if stopped out.` +
    (out.capped ? ` <span style="color:var(--warn)">Size capped at ${KB.riskManagement.maxPositionPct}% of account (Stewie's max-position rule).</span>` : '');
}

/* ---------------- scanner ---------------- */
$('scanBtn').onclick = runScan;
async function runScan() {
  const M = MODES[state.mode], src = state.source, S = SRC();
  $('scanBtn').disabled = true;
  $('scanTable').style.display = 'none';
  const universe = src === 'dhan' ? 'NIFTY 50 stocks' : 'most-traded Solana tokens';
  $('scanStatus').innerHTML = `<div class="status-line"><span class="spinner"></span>Fetching the ${universe}…</div>`;
  try {
    const [list, marketCtx] = await Promise.all([
      api(`/api/tokenlist?limit=${M.scanLimit}&source=${src}`),
      marketCtxFor(state.mode),
    ]);
    const addrs = list.map(t => t.address);
    if (!addrs.length) throw new Error('instrument list came back empty');
    $('scanStatus').innerHTML = `<div class="status-line"><span class="spinner"></span>Scanning ${addrs.length} on the ${M.label.toLowerCase()} horizon (${M.primary.interval} candles)…</div>`;
    const batch = await api(`/api/batch?addresses=${addrs.map(encodeURIComponent).join(',')}&range=${M.scanRange}&interval=${M.primary.interval}&source=${src}`);
    const rows = [];
    const skipped = [];
    for (const addr of addrs) {
      const d = batch[addr];
      if (!d || d.error || !d.candles || d.candles.length < M.minBars) {
        skipped.push(d && d.error ? d.error : 'not enough price history');
        continue;
      }
      try {
        const asset = { ...d, isCrypto: S.isCrypto, mode: state.mode, source: src };
        const daily = TA.analyzeSeries(asset.candles);
        const R = Engine.assess(asset, daily, null, marketCtx, M.tf());
        const prev = asset.candles[asset.candles.length - 2];
        rows.push({
          addr, sym: d.symbol, name: d.name, price: d.price,
          chg: prev ? ((d.price - prev.c) / prev.c) * 100 : null,
          score: R.score, verdict: R.verdict, verdictClass: R.verdictClass,
          trend: R.structure.trend, rsi: R.latest.rsi,
          top: (R.pros[0] || R.cons[0] || { text: '—' }).text,
        });
      } catch { /* skip token */ }
    }
    if (!rows.length) {
      const firstErr = addrs.map(a => batch[a]).find(d => d && d.error);
      throw new Error(firstErr ? firstErr.error : 'no instrument returned enough history to analyze');
    }
    rows.sort((a, b) => b.score - a.score);
    state.scanCache = rows;
    $('scanChgTh').textContent = state.mode === 'intraday' ? '15m' : 'Day';
    $('scanBody').innerHTML = rows.map((r, i) => `
      <tr class="row" onclick="analyze('${r.addr}')">
        <td>${i + 1}</td>
        <td><b>${esc(r.sym)}</b><br><small style="color:var(--muted)">${esc(r.name)}</small></td>
        <td>${S.ccy}${fmtPx(r.price)}</td>
        <td class="${r.chg >= 0 ? 'pos' : 'neg'}">${fmtPct(r.chg)}</td>
        <td><span class="score-pill" style="background:${tierColor(r.score).bg};color:${tierColor(r.score).fg}">${r.score}</span></td>
        <td><span class="badge ${r.verdictClass}">${esc(r.verdict.split(' — ')[0])}</span></td>
        <td>${esc(r.trend)}</td>
        <td>${r.rsi?.toFixed(0) ?? '—'}</td>
        <td style="max-width:320px"><small>${esc(r.top)}</small></td>
      </tr>`).join('');
    const best = rows.filter(r => r.score >= 58).length;
    let skipNote = '';
    if (skipped.length) {
      const common = skipped.sort((a, b) =>
        skipped.filter(v => v === a).length - skipped.filter(v => v === b).length).pop();
      skipNote = ` <span style="color:var(--paper-faint)">— ${skipped.length} skipped (${esc(String(common).slice(0, 90))})</span>`;
    }
    $('scanStatus').innerHTML = `<div class="status-line">Done — ${rows.length} analyzed, <b style="color:var(--up)">${best}</b> currently rate "tradeable".${skipNote}</div>`;
    $('scanTable').style.display = '';
  } catch (e) {
    $('scanStatus').innerHTML = `<div class="status-line err">Scan failed: ${esc(e.message)}</div>`;
  }
  $('scanBtn').disabled = false;
}

/* ---------------- watchlist ---------------- */
async function renderWatchlist() {
  const M = MODES[state.mode], src = state.source, S = SRC();
  const all = store.watch;
  const addrs = all.filter(a => S.addrRe.test(a)); // this source's entries only
  const otherN = all.length - addrs.length;
  const otherNote = otherN ? ` <span style="color:var(--paper-faint)">(${otherN} on the other data source — switch Source to see them)</span>` : '';
  if (!addrs.length) { $('wlStatus').innerHTML = `<div class="status-line">No ${S.label} watchlist entries — add them with the ☆ Watch button on any analysis.${otherNote}</div>`; $('wlTable').style.display = 'none'; return; }
  $('wlStatus').innerHTML = `<div class="status-line"><span class="spinner"></span>Refreshing ${addrs.length} on the ${M.label.toLowerCase()} horizon…${otherNote}</div>`;
  try {
    const [batch, marketCtx] = await Promise.all([
      api(`/api/batch?addresses=${addrs.map(encodeURIComponent).join(',')}&range=${M.scanRange}&interval=${M.primary.interval}&source=${src}`),
      marketCtxFor(state.mode),
    ]);
    const rows = [];
    for (const addr of addrs) {
      const d = batch[addr];
      if (!d || d.error || !d.candles || d.candles.length < M.minBars) { rows.push({ addr, sym: d && d.symbol || addr.slice(0, 6), err: true }); continue; }
      const asset = { ...d, isCrypto: S.isCrypto, mode: state.mode, source: src };
      const R = Engine.assess(asset, TA.analyzeSeries(asset.candles), null, marketCtx, M.tf());
      const prev = asset.candles[asset.candles.length - 2];
      rows.push({ addr, sym: d.symbol, price: d.price, chg: prev ? ((d.price - prev.c) / prev.c) * 100 : null, score: R.score, verdict: R.verdict.split(' — ')[0], verdictClass: R.verdictClass });
    }
    $('wlBody').innerHTML = rows.map(r => r.err
      ? `<tr><td><b>${esc(r.sym)}</b></td><td colspan="4" style="color:var(--muted)">no data</td><td><button class="wl-actions" onclick="unwatch('${r.addr}')">✕</button></td></tr>`
      : `<tr class="row" onclick="analyze('${r.addr}')">
          <td><b>${esc(r.sym)}</b></td>
          <td>${S.ccy}${fmtPx(r.price)}</td>
          <td class="${r.chg >= 0 ? 'pos' : 'neg'}">${fmtPct(r.chg)}</td>
          <td><b>${r.score}</b></td>
          <td><span class="badge ${r.verdictClass}">${esc(r.verdict)}</span></td>
          <td><button onclick="event.stopPropagation();unwatch('${r.addr}')" class="star-btn">✕</button></td>
        </tr>`).join('');
    $('wlStatus').innerHTML = '';
    $('wlTable').style.display = '';
  } catch (e) {
    $('wlStatus').innerHTML = `<div class="status-line err">${esc(e.message)}</div>`;
  }
}
window.unwatch = (sym) => { store.watch = store.watch.filter(s => s !== sym); renderWatchlist(); };

/* ---------------- journal ---------------- */
function renderJournal() {
  const j = store.journal;
  const rMultiples = j.map(t => t.resultR).filter(r => typeof r === 'number');
  const s = Engine.sqn(rMultiples);
  const maxHeat = s ? s.maxPortfolioHeatPct : 8; // Tharp's "Average" tier as a default until enough trades exist
  const openHeat = j.filter(t => t.status === 'open').reduce((sum, t) => sum + (t.riskPct || 0), 0);
  const heatOver = openHeat > maxHeat;
  const sqnLine = s
    ? `SQN = <b>${s.value}</b> — <b>${esc(s.rating)}</b> (${s.sampleSize} trade${s.sampleSize === 1 ? '' : 's'} with a logged result)`
    : `SQN not yet available — log ±R results on at least 5 closed trades (Tharp wants 20+ before trusting it).`;
  $('sqnPanel').innerHTML = `
    <div class="calc-out">
      ${sqnLine}<br>
      Current portfolio heat (sum of risk% across OPEN positions): <b class="${heatOver ? 'neg' : 'pos'}">${openHeat.toFixed(1)}%</b>
      — max recommended at this quality level: <b>${maxHeat}%</b>${heatOver ? ' <b class="neg">— OVER the recommended cap</b>' : ''}
    </div>
    ${s?.note ? `<div class="footnote">${esc(s.note)}</div>` : ''}
    <div class="footnote">SQN = (mean R-multiple ÷ stdev R-multiple) × √trades. Portfolio heat only counts trades marked "open" below — mark a trade open once you've actually entered it.</div>`;
  if (!j.length) { $('jrStatus').innerHTML = '<div class="status-line">No trades logged yet. Build a plan in Analyze and press "Log to journal".</div>'; $('jrTable').style.display = 'none'; return; }
  $('jrStatus').innerHTML = '';
  $('jrTable').style.display = '';
  $('jrBody').innerHTML = j.map((t, i) => `
    <tr>
      <td>${esc(t.date)}</td>
      <td><b>${esc(t.symbol)}</b></td>
      <td>${fmtPx(t.entry)}</td>
      <td style="color:var(--down)">${fmtPx(t.stop)}</td>
      <td style="color:var(--up)">${fmtPx(t.target)}</td>
      <td><input value="${t.riskPct ?? ''}" placeholder="%" style="width:48px;background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:3px" onchange="jrRisk(${i}, this.value)"></td>
      <td>${t.rr}R</td>
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

/* ---------------- init ---------------- */
$('disclaimer').textContent = KB.disclaimer;
renderPlaybook();
applySourceChrome();
loadMarketContext();
