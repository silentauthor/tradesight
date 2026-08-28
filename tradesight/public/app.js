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

/* ---------------- state ---------------- */
const state = {
  current: null,        // {asset, assessment, daily, weekly}
  marketCtx: {},
  chart: null,
  scanCache: null,
};
const store = {
  get watch() { try { return JSON.parse(localStorage.tsWatch || '[]'); } catch { return []; } },
  set watch(v) { localStorage.tsWatch = JSON.stringify(v); },
  get journal() { try { return JSON.parse(localStorage.tsJournal || '[]'); } catch { return []; } },
  set journal(v) { localStorage.tsJournal = JSON.stringify(v); },
};

/* Scanner universe: liquid megacap stocks + sector ETFs + top cryptos. */
const UNIVERSE = {
  stocks: ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AMD','NFLX','AVGO','JPM','V','UNH','XOM','LLY','COST','CRM','ORCL','BA','DIS','INTC','PLTR','UBER','SHOP','COIN'],
  etfs: ['SPY','QQQ','IWM','SMH','XLE','XLF','GLD'],
  crypto: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','ADA-USD','DOGE-USD','AVAX-USD','LINK-USD','DOT-USD','LTC-USD','MATIC-USD','SHIB-USD'],
};

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
async function loadMarketContext() {
  try {
    const [spy, btc, tlt, uup] = await Promise.all([
      api('/api/chart?symbol=SPY&range=1y'),
      api('/api/chart?symbol=BTC-USD&range=1y'),
      api('/api/chart?symbol=TLT&range=1y').catch(() => null),
      api('/api/chart?symbol=UUP&range=1y').catch(() => null),
    ]);
    const spyA = TA.analyzeSeries(spy.candles);
    const btcA = TA.analyzeSeries(btc.candles);
    const tltA = tlt ? TA.analyzeSeries(tlt.candles) : null;
    const uupA = uup ? TA.analyzeSeries(uup.candles) : null;
    state.marketCtx = Engine.marketRegime(spyA, btcA, tltA, uupA);
    state.marketCtx._spy = spy; state.marketCtx._btc = btc;
    const chips = [];
    const chip = (label, d) => {
      const chg = ((d.price - d.candles[d.candles.length - 2].c) / d.candles[d.candles.length - 2].c) * 100;
      return `<span class="chip"><b>${label}</b> ${fmtPx(d.price)} <span class="${chg >= 0 ? 'pos' : 'neg'}">${fmtPct(chg)}</span></span>`;
    };
    chips.push(chip('S&P 500', spy), chip('BTC', btc));
    if (tlt) chips.push(chip('Bonds (TLT)', tlt));
    if (uup) chips.push(chip('Dollar (UUP)', uup));
    chips.push(`<span class="chip">Tide: <b class="${state.marketCtx.regime === 'risk-on' ? 'pos' : state.marketCtx.regime === 'risk-off' ? 'neg' : ''}">${state.marketCtx.regime}</b></span>`);
    if (state.marketCtx.deflationWarning) chips.push(`<span class="chip"><b class="neg">⚠ deflation regime</b></span>`);
    $('marketChips').innerHTML = chips.join('');
  } catch (e) {
    $('marketChips').innerHTML = `<span class="chip">market data unavailable</span>`;
  }
}

/* ---------------- search ---------------- */
let sugTimer = null, sugItems = [], sugSel = -1;
$('searchInput').addEventListener('input', (e) => {
  clearTimeout(sugTimer);
  const q = e.target.value.trim();
  if (!q) { closeSug(); return; }
  sugTimer = setTimeout(async () => {
    try {
      const { quotes } = await api('/api/search?q=' + encodeURIComponent(q));
      sugItems = quotes; sugSel = -1;
      const box = $('suggestions');
      box.innerHTML = quotes.map((s, i) =>
        `<div data-i="${i}"><span class="sym">${esc(s.symbol)}</span><span class="nm">${esc(s.name)}</span><span class="tp">${esc(s.type)}</span></div>`).join('');
      box.classList.toggle('open', quotes.length > 0);
      box.querySelectorAll('div').forEach(d => d.onclick = () => { closeSug(); analyze(sugItems[+d.dataset.i].symbol); });
    } catch { closeSug(); }
  }, 250);
});
$('searchInput').addEventListener('keydown', (e) => {
  const box = $('suggestions');
  if (e.key === 'Enter') {
    e.preventDefault();
    if (sugSel >= 0 && sugItems[sugSel]) { closeSug(); analyze(sugItems[sugSel].symbol); }
    else {
      const q = e.target.value.trim();
      if (q) { closeSug(); analyze(guessSymbol(q)); }
    }
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!sugItems.length) return;
    sugSel = (sugSel + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length;
    box.querySelectorAll('div').forEach((d, i) => d.classList.toggle('sel', i === sugSel));
  } else if (e.key === 'Escape') closeSug();
});
function closeSug() { $('suggestions').classList.remove('open'); sugItems = []; sugSel = -1; }
/* Bare crypto names → Yahoo -USD pairs. */
const CRYPTO_ALIASES = { BTC: 'BTC-USD', BITCOIN: 'BTC-USD', ETH: 'ETH-USD', ETHEREUM: 'ETH-USD', SOL: 'SOL-USD', SOLANA: 'SOL-USD', XRP: 'XRP-USD', DOGE: 'DOGE-USD', ADA: 'ADA-USD', BNB: 'BNB-USD', AVAX: 'AVAX-USD', LINK: 'LINK-USD', DOT: 'DOT-USD', LTC: 'LTC-USD', SHIB: 'SHIB-USD', MATIC: 'MATIC-USD', TRX: 'TRX-USD', TON: 'TON11419-USD', PEPE: 'PEPE24478-USD' };
function guessSymbol(q) {
  const u = q.toUpperCase();
  return CRYPTO_ALIASES[u] || u;
}
$('quickSyms').innerHTML = 'Try: ' + ['AAPL','NVDA','TSLA','SPY','BTC-USD','ETH-USD','SOL-USD'].map(s => `<button onclick="analyze('${s}')">${s}</button>`).join('');

/* ---------------- analyze ---------------- */
async function analyze(symbol) {
  gotoView('analyze');
  $('searchInput').value = symbol;
  $('analyzeResult').style.display = 'none';
  $('analyzeStatus').innerHTML = `<div class="status-line"><span class="spinner"></span>Fetching data and running the engine on <b>${esc(symbol)}</b>…</div>`;
  try {
    const [dailyData, weeklyData] = await Promise.all([
      api(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=2y&interval=1d`),
      api(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=5y&interval=1wk`),
    ]);
    if (!dailyData.candles || dailyData.candles.length < 60) throw new Error('not enough price history to analyze safely');
    const asset = {
      ...dailyData,
      isCrypto: dailyData.type === 'CRYPTOCURRENCY' || /-USD$/.test(dailyData.symbol),
    };
    const daily = TA.analyzeSeries(asset.candles);
    const weekly = weeklyData.candles && weeklyData.candles.length > 30 ? TA.analyzeSeries(weeklyData.candles) : null;
    const assessment = Engine.assess(asset, daily, weekly, state.marketCtx);
    state.current = { asset, assessment, daily, weekly };
    renderAnalysis();
    $('analyzeStatus').innerHTML = '';
    $('analyzeResult').style.display = '';
  } catch (e) {
    $('analyzeStatus').innerHTML = `<div class="status-line err">Could not analyze "${esc(symbol)}": ${esc(e.message)}. Try the exact ticker (crypto uses e.g. BTC-USD).</div>`;
  }
}
window.analyze = analyze;

function renderAnalysis() {
  const { asset, assessment: R, daily } = state.current;
  const prev = asset.candles[asset.candles.length - 2];
  const chg = prev ? ((asset.price - prev.c) / prev.c) * 100 : null;

  $('assetHead').innerHTML = `
    <span class="nm">${esc(asset.name)}</span>
    <span class="meta">${esc(asset.symbol)} · ${esc(asset.exchange || '')} · ${esc(asset.type || '')}</span>
    <span class="px">${fmtPx(asset.price)} <span class="${chg >= 0 ? 'pos' : 'neg'}">${fmtPct(chg)}</span></span>
    <span class="meta">52w: ${fmtPx(asset.low52)} – ${fmtPx(asset.high52)}</span>`;

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
    const structureTitle = 'Based on the last few swing highs/lows — a short-term read, separate from the long-term 200-day MA regime shown in the score reasons below. The two can disagree.';
    $('verdictSub').innerHTML = `<span title="${esc(structureTitle)}" style="border-bottom:1px dotted var(--paper-faint);cursor:help">Structure: ${esc(R.structure.trend)}</span> · RSI ${R.latest.rsi?.toFixed(0) ?? '—'} · ATR ${R.atrPct?.toFixed(1) ?? '—'}% of price`
      + (disagree ? ` <span style="color:var(--paper-faint)">(short-term structure disagrees with the long-term 200-day MA regime — see reasons below)</span>` : '');
  }
  $('regimeSub').textContent = state.marketCtx.detail
    ? `Market tide: ${state.marketCtx.regime} (${state.marketCtx.detail})${state.marketCtx.intermarketNote ? ' — ' + state.marketCtx.intermarketNote : ''}`
    : '';

  // watch button
  const watched = store.watch.includes(asset.symbol);
  $('watchBtn').textContent = watched ? '★ Watching' : '☆ Watch';
  $('watchBtn').onclick = () => {
    const w = store.watch;
    store.watch = watched ? w.filter(s => s !== asset.symbol) : [...w, asset.symbol];
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
      <div class="plan-row entry"><span class="k">Entry zone</span><span class="p">${fmtPx(R.plan.entryLow)} – ${fmtPx(R.plan.entryHigh)}</span><span class="why">${esc(R.plan.entryNote)}</span></div>
      <div class="plan-row stop"><span class="k">Stop loss</span><span class="p">${fmtPx(R.plan.stop)} (−${R.plan.stopPct}%)</span><span class="why">${esc(R.plan.stopNote)}</span></div>
      ${R.plan.targets.map(t => `<div class="plan-row target"><span class="k">Exit</span><span class="p">${fmtPx(t.price)}</span><span class="rr-badge">${t.rr}R</span><span class="why">${esc(t.label)}</span></div>`).join('')}
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
    `Buy <b>${out.units}</b> units ≈ <b>$${out.value.toLocaleString()}</b> position · risking <b>$${out.riskAmt.toLocaleString()}</b> (${risk}% of account) if stopped out.` +
    (out.capped ? ` <span style="color:var(--warn)">Size capped at ${KB.riskManagement.maxPositionPct}% of account (Stewie's max-position rule).</span>` : '');
}

/* ---------------- scanner ---------------- */
$('scanBtn').onclick = runScan;
async function runScan() {
  $('scanBtn').disabled = true;
  $('scanTable').style.display = 'none';
  const syms = [...UNIVERSE.stocks, ...UNIVERSE.etfs, ...UNIVERSE.crypto];
  $('scanStatus').innerHTML = `<div class="status-line"><span class="spinner"></span>Scanning ${syms.length} assets…</div>`;
  try {
    const batch = await api('/api/batch?symbols=' + syms.join(',') + '&range=1y');
    const rows = [];
    for (const sym of syms) {
      const d = batch[sym];
      if (!d || d.error || !d.candles || d.candles.length < 60) continue;
      try {
        const asset = { ...d, isCrypto: /-USD$/.test(sym) };
        const daily = TA.analyzeSeries(asset.candles);
        const R = Engine.assess(asset, daily, null, state.marketCtx);
        const prev = asset.candles[asset.candles.length - 2];
        rows.push({
          sym, name: d.name, price: d.price,
          chg: prev ? ((d.price - prev.c) / prev.c) * 100 : null,
          score: R.score, verdict: R.verdict, verdictClass: R.verdictClass,
          trend: R.structure.trend, rsi: R.latest.rsi,
          top: (R.pros[0] || R.cons[0] || { text: '—' }).text,
        });
      } catch { /* skip symbol */ }
    }
    rows.sort((a, b) => b.score - a.score);
    state.scanCache = rows;
    $('scanBody').innerHTML = rows.map((r, i) => `
      <tr class="row" onclick="analyze('${r.sym}')">
        <td>${i + 1}</td>
        <td><b>${esc(r.sym)}</b><br><small style="color:var(--muted)">${esc(r.name)}</small></td>
        <td>${fmtPx(r.price)}</td>
        <td class="${r.chg >= 0 ? 'pos' : 'neg'}">${fmtPct(r.chg)}</td>
        <td><span class="score-pill" style="background:${tierColor(r.score).bg};color:${tierColor(r.score).fg}">${r.score}</span></td>
        <td><span class="badge ${r.verdictClass}">${esc(r.verdict.split(' — ')[0])}</span></td>
        <td>${esc(r.trend)}</td>
        <td>${r.rsi?.toFixed(0) ?? '—'}</td>
        <td style="max-width:320px"><small>${esc(r.top)}</small></td>
      </tr>`).join('');
    const best = rows.filter(r => r.score >= 58).length;
    $('scanStatus').innerHTML = `<div class="status-line">Done — ${rows.length} assets analyzed, <b style="color:var(--up)">${best}</b> currently rate "tradeable". Top of the table = best setups now.</div>`;
    $('scanTable').style.display = '';
  } catch (e) {
    $('scanStatus').innerHTML = `<div class="status-line err">Scan failed: ${esc(e.message)}</div>`;
  }
  $('scanBtn').disabled = false;
}

/* ---------------- watchlist ---------------- */
async function renderWatchlist() {
  const syms = store.watch;
  if (!syms.length) { $('wlStatus').innerHTML = '<div class="status-line">Watchlist is empty — add assets with the ☆ Watch button on any analysis.</div>'; $('wlTable').style.display = 'none'; return; }
  $('wlStatus').innerHTML = `<div class="status-line"><span class="spinner"></span>Refreshing ${syms.length} assets…</div>`;
  try {
    const batch = await api('/api/batch?symbols=' + syms.join(',') + '&range=1y');
    const rows = [];
    for (const sym of syms) {
      const d = batch[sym];
      if (!d || d.error || !d.candles || d.candles.length < 60) { rows.push({ sym, err: true }); continue; }
      const asset = { ...d, isCrypto: /-USD$/.test(sym) };
      const R = Engine.assess(asset, TA.analyzeSeries(asset.candles), null, state.marketCtx);
      const prev = asset.candles[asset.candles.length - 2];
      rows.push({ sym, price: d.price, chg: prev ? ((d.price - prev.c) / prev.c) * 100 : null, score: R.score, verdict: R.verdict.split(' — ')[0], verdictClass: R.verdictClass });
    }
    $('wlBody').innerHTML = rows.map(r => r.err
      ? `<tr><td><b>${esc(r.sym)}</b></td><td colspan="4" style="color:var(--muted)">no data</td><td><button class="wl-actions" onclick="unwatch('${r.sym}')">✕</button></td></tr>`
      : `<tr class="row" onclick="analyze('${r.sym}')">
          <td><b>${esc(r.sym)}</b></td>
          <td>${fmtPx(r.price)}</td>
          <td class="${r.chg >= 0 ? 'pos' : 'neg'}">${fmtPct(r.chg)}</td>
          <td><b>${r.score}</b></td>
          <td><span class="badge ${r.verdictClass}">${esc(r.verdict)}</span></td>
          <td><button onclick="event.stopPropagation();unwatch('${r.sym}')" class="star-btn">✕</button></td>
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
loadMarketContext();
