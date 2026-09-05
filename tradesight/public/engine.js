/* TradeSight — verdict engine. Turns raw analysis (indicators + structure +
   patterns) into an explainable trade assessment: score, verdict, entry, stop,
   targets, risk factors, position sizing. Every scored item carries its reason
   and book attribution. Risk-first: hard red flags cap the score. */
'use strict';

const Engine = (() => {

  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  /* Timeframe profile — swing (daily/weekly) vs intraday (15-minute/hourly).
     Only labels and a few volatility/extension thresholds change; the rules,
     their weights and their book attributions are identical. Callers pass one
     of these; assess() falls back to swing if none is given. */
  const TF_SWING = {
    mode: 'swing', regimeWord: 'long-term', htfName: 'weekly', barClose: 'daily close',
    maLong: '200-day MA', maShort: '20-day MA', volWindow: 'own 1-year',
    extPct: 15, atrHighPct: 8, near20Pct: 4,
    pullbackName: '"Holy Grail" pullback zone',
    flattenRule: null,
  };
  const TF_INTRADAY = {
    mode: 'intraday', regimeWord: 'intraday', htfName: 'hourly', barClose: '15-minute close',
    maLong: '200-bar MA', maShort: '20-bar MA', volWindow: 'recent',
    extPct: 5, atrHighPct: 3, near20Pct: 1.5,
    pullbackName: 'moving-average pullback zone',
    flattenRule: 'Day-trade discipline: set the stop and target at entry and leave them; skip names swinging more than ~2% a bar; flatten every position by the end of your trading session — never carry an intraday trade overnight',
  };

  const round = (p) => {
    if (p == null || !isFinite(p)) return null;
    const mag = Math.abs(p);
    const dp = mag >= 1000 ? 2 : mag >= 100 ? 2 : mag >= 1 ? 2 : mag >= 0.01 ? 4 : 6;
    return +p.toFixed(dp);
  };

  /* ---------- scoring ---------- */

  function assess(asset, primary, higher, marketCtx = {}, tf = TF_SWING) {
    const A = primary;                     // TA.analyzeSeries output on the trading timeframe
    const weekly = higher;                 // TA.analyzeSeries output one timeframe up
    const L = A.latest, S = A.structure;
    const price = L.price;
    const candles = asset.candles;
    const pats = Patterns.detect(candles, A.srZones, 12);

    const pros = [], cons = [], flags = []; // flags = hard red flags (cap score)
    let score = 50;
    const add = (pts, text, src) => { score += pts; (pts >= 0 ? pros : cons).push({ pts, text, src }); };
    const flag = (text, src) => { flags.push({ text, src }); };

    // ---- trend regime (the tide) ----
    const above200 = L.sma200 != null && price > L.sma200;
    if (L.sma200 != null) {
      if (above200) add(10, `Price is above the ${tf.maLong} — ${tf.regimeWord} bull regime.`, 'Zuckerman');
      else { add(-12, `Price is below the ${tf.maLong} — ${tf.regimeWord} bear regime; longs are counter-tide.`, 'Zuckerman'); }
    }
    if (S.trend === 'uptrend') add(12, 'Market structure is an uptrend (higher highs + higher lows).', 'Zuckerman, Stewie');
    else if (S.trend === 'downtrend') { add(-14, 'Market structure is a downtrend (lower highs + lower lows).', 'Zuckerman, Stewie'); }
    else if (S.trend === 'range') add(-4, 'Price is in a choppy range — a market trends only ~30% of the time; ranges/chop make up the rest and most breakouts fail here.', 'Trading Bible, Stewie');
    if (S.bos === 'bullish') add(6, 'Bullish break of structure: price closed above the last swing high.', 'Smart Money');
    if (S.bos === 'bearish') add(-8, 'Bearish break of structure: price closed below the last swing low.', 'Smart Money');

    // ---- smart-money layer: liquidity sweeps, premium/discount, resting stops ----
    const sweep = detectSweep(candles, A.swingsPts, L.volAvg);
    if (sweep?.dir === 'bullish') {
      const pts = sweep.validSpring ? 8 : 3;
      const note = sweep.validSpring ? ' — low volume on the breach confirms absorption (a genuine Wyckoff spring), not fresh selling.' : ' — but the breach came on elevated volume, which Wyckoff logic reads as a weaker signal (possibly real selling, not just a shakeout).';
      add(pts, `Stop-run reversal (2B / bear trap / false breakdown): price swept below a prior low and closed back above it${note}`, 'Smart Money, Stewie, Trading Bible, Wyckoff');
    }
    if (sweep?.dir === 'bearish') {
      const pts = sweep.validSpring ? -8 : -3;
      const note = sweep.validSpring ? ' — low volume on the breach confirms absorption (a genuine Wyckoff upthrust), not fresh buying.' : ' — but the breach came on elevated volume, a weaker signal by Wyckoff logic (possibly a real breakout, not a trap).';
      add(pts, `Stop-run at the highs (bull trap / false breakout): price swept above a prior high and closed back below it${note}`, 'Smart Money, Stewie, Trading Bible, Wyckoff');
    }
    if (S.equalLows != null && price > S.equalLows) {
      add(-3, `Equal lows near ${S.equalLows.toPrecision(5)} — obvious resting-stop liquidity below; such levels often get swept before the real move.`, 'Smart Money');
    }
    if (S.rangePos != null && S.trend !== 'insufficient') {
      if (S.rangePos > 0.85 && S.trend !== 'uptrend') add(-5, 'Price is in the premium (top 15%) of its swing range — smart money sells premium and buys discount.', 'Smart Money');
      else if (S.rangePos < 0.4 && S.trend === 'uptrend') add(4, 'Price is in the discount (lower half) of its swing range within an uptrend — the "cheap" zone the books buy.', 'Smart Money');
    }

    // higher-timeframe alignment (trade one timeframe up — Zuckerman:
    // day trade → check hourly; swing → check weekly)
    if (weekly) {
      const wTrend = weekly.structure.trend;
      const wAbove = weekly.latest.sma20 != null && weekly.latest.price > weekly.latest.sma20;
      if (wTrend === 'uptrend' || (wTrend === 'insufficient' && wAbove)) add(6, `${cap(tf.htfName)} timeframe agrees with the long side (higher-timeframe confirmation).`, 'Zuckerman');
      else if (wTrend === 'downtrend') add(-8, `${cap(tf.htfName)} timeframe is in a downtrend — higher timeframe disagrees with longs.`, 'Zuckerman');
    }

    // ---- regime: ADX gates whether trend or mean-reversion signals get trusted ----
    // (Murphy/Wilder: markets trend only ~30% of the time; oscillator extremes
    // are unreliable early in a strong trend, so shift the RSI bands out to
    // 80/20 when ADX confirms a real trend is underway.)
    const trending = L.adx != null && L.adx >= 25;
    const ranging = L.adx != null && L.adx < 18;
    if (trending) add(4, `ADX ${L.adx.toFixed(0)} confirms a real trend — trend-following signals get more weight here, oscillator extremes less.`, 'Murphy');
    if (ranging) add(-3, `ADX ${L.adx.toFixed(0)} — no real trend underway; breakout-style signals are unreliable, mean-reversion signals get more weight.`, 'Murphy');
    const rsiOverboughtLine = trending && L.plusDI > L.minusDI ? 80 : 70;
    const rsiOversoldLine = trending && L.minusDI > L.plusDI ? 20 : 30;

    // ---- momentum ----
    if (L.rsi != null) {
      if (L.rsi >= rsiOverboughtLine + 5) { add(-10, `RSI ${L.rsi.toFixed(0)} — parabolic/overbought extreme.`, 'Stewie'); }
      else if (L.rsi >= rsiOverboughtLine) add(-5, `RSI ${L.rsi.toFixed(0)} — overbought (line at ${rsiOverboughtLine} given current trend strength); chasing here is late.`, 'Stewie, Murphy');
      else if (L.rsi <= rsiOversoldLine - 5 && S.trend !== 'downtrend') add(5, `RSI ${L.rsi.toFixed(0)} — washed-out oversold in a non-downtrend; mean-reversion edge.`, 'Stewie');
      else if (L.rsi <= rsiOversoldLine && S.trend === 'downtrend') add(-3, `RSI ${L.rsi.toFixed(0)} oversold (line at ${rsiOversoldLine}) — but oversold in a downtrend keeps falling; wait for divergence/reversal structure.`, 'Stewie, Murphy');
      else if (L.rsi >= 45 && L.rsi <= 65) add(4, `RSI ${L.rsi.toFixed(0)} — healthy momentum zone, room to run.`, 'Zuckerman');
    }
    if (L.macdHist != null && L.macdHistPrev != null) {
      if (L.macdHist > 0 && L.macdHist > L.macdHistPrev) add(5, 'MACD histogram positive and expanding — momentum building.', 'Zuckerman');
      else if (L.macdHist < 0 && L.macdHist < L.macdHistPrev) add(-5, 'MACD histogram negative and expanding — downside momentum building.', 'Zuckerman');
      else if (L.macdHist > 0) add(2, 'MACD positive but fading.', 'Zuckerman');
    }
    // RSI divergence at lows (Stewie: "as strong a buy signal as you'll get")
    const div = rsiDivergence(candles, A.ind.rsi);
    if (div === 'bullish') add(9, 'Bullish divergence: price retested its low while RSI made a higher low — second decline is weak.', 'Stewie');
    if (div === 'bearish') add(-9, 'Bearish divergence: price retested its high while RSI made a lower high.', 'Stewie');

    // ---- extension / volatility ----
    if (L.bbUpper != null && price > L.bbUpper * 1.005) {
      add(-8, 'Closing outside the upper Bollinger Band — move is overdone; expect a fade or pause.', 'Stewie');
      if (L.rsi != null && L.rsi >= 78) flag('Parabolic blow-off profile (outside upper band + extreme RSI). Chasing this is the classic top-buy.', 'Stewie');
    }
    if (L.bbLower != null && price < L.bbLower * 0.995 && S.trend !== 'downtrend') {
      add(4, 'Pierced the lower Bollinger Band — stretched to the downside, bounce-prone.', 'Stewie');
    }
    const atrPct = L.atr != null ? (L.atr / price) * 100 : null;
    if (atrPct != null && atrPct > tf.atrHighPct) add(-6, `Very high volatility (ATR ${atrPct.toFixed(1)}% of price per ${tf.mode === 'intraday' ? 'bar' : 'day'}) — halve position size and widen stops.`, 'Stewie');

    // ---- distance from mean (chasing check) ----
    if (L.sma20 != null) {
      const ext = ((price - L.sma20) / L.sma20) * 100;
      if (ext > tf.extPct) add(-6, `Price is ${ext.toFixed(0)}% above the ${tf.maShort} — extended; the smart entry was the pullback.`, 'Stewie');
      else if (ext > 0 && ext < tf.near20Pct && S.trend === 'uptrend') add(7, `Sitting near the ${tf.maShort} in an uptrend — ${tf.pullbackName}.`, 'Stewie');
    }

    // ---- volume ----
    if (L.volAvg > 0 && L.vol != null) {
      const vr = L.vol / L.volAvg;
      const lastBar = candles[candles.length - 1];
      const upDay = lastBar.c >= lastBar.o;
      if (vr > 1.6 && upDay) add(5, `Above-average volume (${vr.toFixed(1)}×) on an up day — buyers confirming.`, 'Zuckerman, Stewie');
      if (vr > 1.6 && !upDay) add(-6, `Heavy volume (${vr.toFixed(1)}×) on a down day — distribution footprint.`, 'Stewie');
    }
    if (L.obvSlope < 0 && S.trend === 'uptrend') add(-4, 'OBV falling while price trends up — volume not confirming the rally.', 'Zuckerman');
    if (L.obvSlope > 0 && S.trend === 'uptrend') add(3, 'OBV rising with price — volume confirms the trend.', 'Zuckerman');

    // ---- support/resistance context ----
    const sr = nearestLevels(A.srZones, price);
    if (sr.resistance && ((sr.resistance.price - price) / price) < 0.02) {
      add(-6, `Price is right under resistance at ${round(sr.resistance.price)} (${sr.resistance.strength} touches) — poor location to initiate longs.`, 'Zuckerman');
    }
    if (sr.support && ((price - sr.support.price) / price) < 0.025 && S.trend !== 'downtrend') {
      add(7, `Price is holding just above support at ${round(sr.support.price)} (${sr.support.strength} touches) — favorable long location with a defined invalidation.`, 'Zuckerman, Stewie');
    }
    if (sr.support && sr.support.strength >= 4 && S.trend === 'downtrend') {
      add(-4, `Support at ${round(sr.support.price)} has been tested ${sr.support.strength} times in a downtrend — heavily knocked-on support tends to break.`, 'Stewie');
    }

    // ---- candlestick patterns (fresh ones only) ----
    const freshPats = pats.filter(p => p.ageBars <= 5);
    for (const p of freshPats.slice(0, 4)) {
      const conf = p.confirmed === true ? ' (confirmed by the next candle)' : p.confirmed === false ? ' (NOT yet confirmed — the books require confirmation before acting)' : '';
      const ctx = p.atLevel ? ' at a support/resistance level' : '';
      const base = p.dir === 'up' ? 5 : p.dir === 'down' ? -5 : 0;
      let pts = base;
      if (p.atLevel) pts *= 1.5;
      if (p.confirmed === true) pts *= 1.4;
      if (p.confirmed === false) pts *= 0.5;
      // volume gate (Visually): a signal on standout volume is trusted; on
      // low/medium volume it's downweighted, never fully zeroed (still informative).
      let volNote = '';
      const barVol = candles[p.i].v, avgVol = L.volAvg;
      if (avgVol > 0 && barVol != null) {
        const vr = barVol / avgVol;
        if (vr >= 1.8) { pts *= 1.3; volNote = ', on standout volume'; }
        else if (vr < 0.8) { pts *= 0.5; volNote = ', but on below-average volume — low conviction'; }
      }
      pts = Math.round(pts);
      if (pts !== 0) add(pts, `${p.name}${ctx} ${p.ageBars === 0 ? 'forming now' : p.ageBars + ' bar(s) ago'}${conf}${volNote}.`, (KB.patternNotes[p.key] || {}).src || 'Standard TA definition');
    }

    // ---- multi-bar chart patterns (Edwards & Magee shapes, Bulkowski stats) ----
    const chartPats = [
      ...Patterns.detectHeadAndShoulders(candles, A.swingsPts),
      ...Patterns.detectDoubleTriple(candles, A.swingsPts),
      ...Patterns.detectTrianglesAndRectangles(candles, A.swingsPts),
      ...Patterns.detectFlagsWedges(candles),
    ].filter(p => p.ageBars <= 20);
    for (const p of chartPats) {
      const stats = KB.bulkowskiStats[p.key];
      const base = p.dir === 'up' ? 8 : p.dir === 'down' ? -8 : 0;
      let pts = base;
      // reliability weight: a pattern with a low real-world failure rate earns
      // more, a high one earns less — grounded in Bulkowski, not a guess.
      if (stats) pts *= (1 - stats.failureRate) * 1.6;
      if (p.confirmed) pts *= 1.5; else pts *= 0.4; // unconfirmed = mostly a watch-item
      pts = Math.round(pts);
      if (pts !== 0) {
        const statText = stats ? ` Backtested failure rate ${(stats.failureRate * 100).toFixed(0)}%, avg move ${(stats.avgMove * 100).toFixed(0)}%, rank ${stats.rank}/${stats.of}.` : '';
        const confText = p.confirmed === true ? 'confirmed by a close beyond the pattern boundary' : p.confirmed === false ? 'forming, NOT yet confirmed' : 'still consolidating — watch for the breakout';
        const noteText = p.note ? ` ${p.note}` : '';
        add(pts, `${p.name} (${confText}).${statText}${noteText}`, stats ? 'Bulkowski' : 'Edwards & Magee');
      }
    }

    // ---- no-demand / no-supply bars (Coulling) ----
    const ndns = Patterns.detectNoDemandSupply(candles, L.volAvg).filter(x => x.ageBars <= 4);
    for (const x of ndns.slice(0, 2)) {
      add(x.dir === 'up' ? 4 : -4, `${x.name} ${x.ageBars} bar(s) ago — narrow range on below-average volume, the expected side isn't showing up. Exhaustion warning.`, 'Anna Coulling');
    }

    // ---- volume profile (Wyckoff 2.0) ----
    const vp = A.volumeProfile;
    if (vp) {
      const nearPoc = Math.abs(price - vp.poc) / price < 0.015;
      if (nearPoc) add(2, `Price is sitting right at the Volume Profile Point of Control (${round(vp.poc)}) — the highest-traded price over the last 60 bars, a natural magnet/pivot.`, 'Wyckoff (Villahermosa)');
      if (price > vp.vah) add(2, `Price is trading above the Value Area (${round(vp.val)}-${round(vp.vah)}) — acceptance of higher prices.`, 'Wyckoff (Villahermosa)');
      if (price < vp.val && S.trend !== 'downtrend') add(-2, `Price is trading below the Value Area (${round(vp.val)}-${round(vp.vah)}) — the market hasn\'t accepted this level yet.`, 'Wyckoff (Villahermosa)');
    }

    // ---- gaps (Edwards & Magee) ----
    const gaps = Patterns.detectGaps(candles, 20).filter(g => g.ageBars <= 8);
    for (const g of gaps.slice(0, 2)) {
      if (g.classification === 'breakaway') {
        add(g.dir === 'up' ? 6 : -6, `${g.dir === 'up' ? 'Breakaway gap up' : 'Breakaway gap down'} ${g.ageBars} bar(s) ago out of a tight range — false moves are seldom accompanied by a gap, this leans genuine.`, 'Edwards & Magee');
      } else if (g.classification === 'runaway') {
        add(g.dir === 'up' ? 5 : -5, `Runaway (measuring) gap ${g.ageBars} bar(s) ago mid-move — historically the halfway point of the move; expect roughly as much further travel as already covered.`, 'Edwards & Magee');
      } else if (g.classification === 'exhaustion') {
        add(g.dir === 'up' ? -6 : 6, `Exhaustion gap ${g.ageBars} bar(s) ago — huge volume with no follow-through the next bar; historically marks the END of the move, not its continuation.`, 'Edwards & Magee');
      }
    }

    // ---- volatility regime (Natenberg's volatility-cone idea, via ATR percentile) ----
    if (L.volPercentile != null) {
      if (L.volPercentile > 0.9) add(-3, `Volatility (ATR) is in the top ${(100 - L.volPercentile * 100).toFixed(0)}% of its ${tf.volWindow} range — check whether there\'s a known catalyst before trusting a mean-reversion fade here.`, 'Natenberg, McMillan');
      else if (L.volPercentile < 0.1) add(2, `Volatility (ATR) is in the bottom ${(L.volPercentile * 100).toFixed(0)}% of its ${tf.volWindow} range — compressed volatility often precedes an expansion move.`, 'Natenberg');
    }

    // ---- market context (the tide) ----
    if (marketCtx.regime === 'risk-off') add(-8, `Overall market is risk-off (${marketCtx.detail}) — long setups fail more in a falling tide.`, 'Stewie, Zuckerman');
    if (marketCtx.regime === 'risk-on') add(4, `Overall market is supportive (${marketCtx.detail}).`, 'Stewie');
    const isSol = /^W?SOL$/i.test(asset.symbol || '') || asset.address === 'So11111111111111111111111111111111111111112';
    if (marketCtx.solTrend === 'down' && !isSol) {
      add(-8, 'SOL is trending down — Solana tokens are high-beta to SOL and rarely swim against it.', 'Zuckerman');
    }

    // ---- liquidity (on-chain) ----
    if (!isSol && asset.liquidity != null && asset.liquidity < 1e6) {
      flag(`Thin on-chain liquidity (~$${(asset.liquidity / 1e6).toFixed(2)}M pooled) — slippage and manipulation risk; the books say trade liquid assets only.`, 'Zuckerman');
    } else if (L.volAvg != null && L.volAvg * price < 5e5) {
      flag(`Thin traded volume (~$${(L.volAvg * price / 1e3).toFixed(0)}k/day average) — slippage and manipulation risk; the books say trade liquid assets only.`, 'Zuckerman');
    }

    // ---- build trade plan ----
    const plan = buildPlan(asset, A, sr, freshPats, tf);

    // R:R gate (hard rule)
    if (plan && plan.rr1 != null && plan.rr2 != null && plan.rr2 < KB.riskManagement.minRewardRisk && plan.rr1 < 1) {
      flag(`Reward:risk to the nearest targets is ${plan.rr2.toFixed(1)}:1 — below the 2:1 minimum the books demand.`, 'Zuckerman');
    }

    // ---- finalize score ----
    score = Math.max(2, Math.min(98, score));
    if (flags.length) score = Math.min(score, 38 - Math.min(flags.length - 1, 2) * 8);
    score = Math.max(2, Math.round(score));

    let verdict, verdictClass;
    if (score >= 72) { verdict = 'Strong setup — tradeable long'; verdictClass = 'strong'; }
    else if (score >= 58) { verdict = 'Constructive — tradeable with reduced size'; verdictClass = 'ok'; }
    else if (score >= 42) { verdict = 'Wait — no edge right now'; verdictClass = 'wait'; }
    else { verdict = 'Avoid — conditions are against you'; verdictClass = 'avoid'; }

    // risk factors list = hard flags + all cons + asset-class risks
    const riskFactors = [
      ...flags.map(f => ({ ...f, hard: true })),
      ...cons.map(c => ({ text: c.text, src: c.src, hard: false })),
    ];

    return {
      score, verdict, verdictClass, pros, cons, flags, riskFactors,
      plan, patterns: pats, chartPatterns: chartPats, gaps, noDemandSupply: ndns, volumeProfile: vp,
      divergence: div, sr, atrPct,
      structure: S, latest: L, regime: trending ? 'trending' : ranging ? 'ranging' : 'mixed',
    };
  }

  /* Liquidity sweep: within the last 6 bars, a bar pierced a prior swing extreme
     but closed back inside — the books' stop-run / 2B pattern. Wyckoff refinement:
     a genuine spring/upthrust shows volume EQUAL TO OR LOWER than the range's
     recent average on the breach bar (absorption); an elevated-volume breach is
     more likely a real breakdown/breakout, not a shakeout, so it's excluded
     rather than mis-scored as a reversal signal. */
  function detectSweep(candles, swingsPts, avgVol) {
    const n = candles.length;
    const recent = candles.slice(n - 6);
    const priorLows = swingsPts.lows.filter(p => p.i < n - 8).slice(-3);
    const priorHighs = swingsPts.highs.filter(p => p.i < n - 8).slice(-3);
    const lastClose = candles[n - 1].c;
    const lowVolume = (bar) => !(avgVol > 0) || (bar.v || 0) <= avgVol * 1.3;
    for (const sl of priorLows) {
      for (const b of recent) {
        if (b.l < sl.price && b.c > sl.price && lastClose > sl.price) return { dir: 'bullish', validSpring: lowVolume(b) };
      }
    }
    for (const sh of priorHighs) {
      for (const b of recent) {
        if (b.h > sh.price && b.c < sh.price && lastClose < sh.price) return { dir: 'bearish', validSpring: lowVolume(b) };
      }
    }
    return null;
  }

  /* Bullish/bearish RSI divergence over recent swings. */
  function rsiDivergence(candles, rsiArr) {
    const n = candles.length;
    if (n < 30) return null;
    const win = candles.slice(n - 30);
    // find two most recent local lows and highs in the window
    const lows = [], highs = [];
    for (let i = 2; i < win.length - 2; i++) {
      if (win[i].l < win[i - 1].l && win[i].l < win[i - 2].l && win[i].l < win[i + 1].l && win[i].l < win[i + 2].l) lows.push(n - 30 + i);
      if (win[i].h > win[i - 1].h && win[i].h > win[i - 2].h && win[i].h > win[i + 1].h && win[i].h > win[i + 2].h) highs.push(n - 30 + i);
    }
    if (lows.length >= 2) {
      const [a, b] = lows.slice(-2);
      const priceRetest = candles[b].l <= candles[a].l * 1.01;
      if (priceRetest && rsiArr[b] != null && rsiArr[a] != null && rsiArr[b] > rsiArr[a] + 3) return 'bullish';
    }
    if (highs.length >= 2) {
      const [a, b] = highs.slice(-2);
      const priceRetest = candles[b].h >= candles[a].h * 0.99;
      if (priceRetest && rsiArr[b] != null && rsiArr[a] != null && rsiArr[b] < rsiArr[a] - 3) return 'bearish';
    }
    return null;
  }

  function nearestLevels(zones, price) {
    let support = null, resistance = null;
    for (const z of zones) {
      if (z.price < price && (!support || z.price > support.price)) support = z;
      if (z.price > price && (!resistance || z.price < resistance.price)) resistance = z;
    }
    return { support, resistance };
  }

  /* Trade plan: entry zone, stop (structure + ATR buffer, whichever is safer),
     three targets, R multiples. Long-side plan (the books' swing framework). */
  function buildPlan(asset, A, sr, freshPats, tf = TF_SWING) {
    const L = A.latest, S = A.structure;
    const price = L.price, atr = L.atr;
    if (price == null || atr == null) return null;

    // Entry: current price if at/near a sensible location; otherwise suggest the pullback zone
    let entryLow, entryHigh, entryNote;
    const nearSupport = sr.support && ((price - sr.support.price) / price) < 0.03;
    const near20 = L.sma20 != null && Math.abs(price - L.sma20) / price < 0.03;
    if (nearSupport || near20) {
      entryLow = round(Math.max(price - 0.3 * atr, sr.support ? sr.support.price : price - 0.5 * atr));
      entryHigh = round(price + 0.25 * atr);
      entryNote = nearSupport
        ? `Current price is a valid entry zone — just above support at ${round(sr.support.price)} with a defined invalidation below it.`
        : `Current price sits at the ${tf.maShort} pullback zone (${tf.pullbackName} — Stewie).`;
    } else {
      const pb = Math.max(L.sma20 ?? price - atr, sr.support ? sr.support.price : -Infinity);
      entryLow = round(pb - 0.3 * atr);
      entryHigh = round(pb + 0.3 * atr);
      entryNote = `Price is extended away from the entry zone — the books say don't chase; wait for the low-volume pullback toward ${round(pb)} (${tf.maShort} / support confluence).`;
    }

    // Stop: below structure (swing low or pattern low or support), with an ATR buffer
    const candidates = [];
    if (S.lastSwingLow != null && S.lastSwingLow < price) candidates.push({ p: S.lastSwingLow, why: 'last swing low' });
    if (sr.support) candidates.push({ p: sr.support.min, why: `support zone (${sr.support.strength} touches)` });
    const bullPat = freshPats.find(p => p.dir === 'up');
    if (bullPat) candidates.push({ p: bullPat.low, why: `${bullPat.name} pattern low` });
    let stopBase = candidates.filter(c => c.p < price && c.p > price - 6 * atr).sort((a, b) => b.p - a.p)[0];
    if (!stopBase) stopBase = { p: price - 2 * atr, why: '2× ATR volatility stop (no clean structure nearby)' };
    const stop = round(stopBase.p - 0.5 * atr); // buffer beyond the obvious level (anti stop-hunt, Zuckerman)
    const stopNote = `Below the ${stopBase.why}, with a 0.5×ATR buffer so it's not sitting exactly where the crowd's stops cluster (Zuckerman/Stewie).`;

    const entryMid = (entryLow + entryHigh) / 2;
    const risk = entryMid - stop;
    if (!(risk > 0)) return null;

    // Targets: nearest resistances + measured R multiples, capped by structure
    const resList = A.srZones.filter(z => z.price > entryMid * 1.005).map(z => z.price).sort((a, b) => a - b);
    const t1 = resList[0] != null ? Math.min(resList[0], entryMid + 2.5 * risk) : entryMid + 1.5 * risk;
    const t2 = resList[1] != null ? Math.min(resList[1], entryMid + 3 * risk) : entryMid + 2.5 * risk;
    const t3 = entryMid + 4 * risk;
    const rr = (t) => (t - entryMid) / risk;

    return {
      side: 'long',
      entryLow, entryHigh, entryNote,
      stop, stopNote,
      stopPct: +(((entryMid - stop) / entryMid) * 100).toFixed(2),
      targets: [
        { label: 'T1 — first resistance / book partial, move stop to breakeven', price: round(t1), rr: +rr(t1).toFixed(1) },
        { label: 'T2 — next resistance / trail the stop ("walk it up" — Stewie)', price: round(t2), rr: +rr(t2).toFixed(1) },
        { label: 'T3 — runner if trend continues (exit on trailed stop)', price: round(t3), rr: +rr(t3).toFixed(1) },
      ],
      rr1: +rr(t1).toFixed(2), rr2: +rr(t2).toFixed(2),
      exitRules: [
        'Book part of the position at T1 and immediately move the stop to breakeven (Zuckerman).',
        'Trail the stop under each new higher low as the trade works — "walk the stop" (Stewie).',
        `If the ${tf.barClose} falls back below the stop level or structure breaks, exit — never move the stop down (Zuckerman).`,
        asset.isCrypto ? 'Crypto trades 24/7 — leave the stop as a resting order, never a mental one (Zuckerman).' : 'Do not hold through an earnings report (Stewie).',
        tf.flattenRule ? tf.flattenRule + ' (Ray Bears).' : null,
        'In choppy tape, book gains quickly — trends die fast in chop (Stewie).',
      ].filter(Boolean),
    };
  }

  /* Position sizing per the books: risk% of account / distance to stop, capped at maxPositionPct. */
  function positionSize(account, riskPct, entry, stop) {
    if (!(account > 0) || !(entry > stop)) return null;
    const riskAmt = account * (riskPct / 100);
    const perUnit = entry - stop;
    let units = riskAmt / perUnit;
    const maxValue = account * (KB.riskManagement.maxPositionPct / 100);
    let capped = false;
    if (units * entry > maxValue) { units = maxValue / entry; capped = true; }
    return {
      units: entry > 50 ? Math.floor(units * 100) / 100 : +units.toFixed(4),
      value: round(units * entry),
      riskAmt: round(Math.min(riskAmt, units * perUnit)),
      capped,
    };
  }

  /* SQN (System Quality Number, Van Tharp) from a real series of R-multiples —
     e.g. the journal's logged trade outcomes. SQN = (mean(R)/stdev(R)) × √N,
     capped at N=100 per Tharp's own convention (larger samples inflate SQN
     without adding real information). Returns null if there isn't enough
     history yet — needs a minimum sample to mean anything (Tharp: ≥20). */
  function sqn(rMultiples) {
    const r = rMultiples.filter(x => typeof x === 'number' && isFinite(x));
    if (r.length < 5) return null;
    const n = Math.min(r.length, 100);
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length;
    const sd = Math.sqrt(variance);
    if (sd === 0) return null;
    const value = (mean / sd) * Math.sqrt(n);
    let rating, heatPct;
    if (value < 1.0) { rating = 'Hard to trade'; heatPct = 1; }
    else if (value <= 2.0) { rating = 'Average'; heatPct = r.length < 20 ? 2 : 4; }
    else if (value <= 3.0) { rating = 'Good'; heatPct = 8; }
    else if (value <= 5.0) { rating = 'Excellent'; heatPct = 15; }
    else if (value <= 7.0) { rating = 'Superb'; heatPct = 20; }
    else { rating = 'Holy grail (rare — double-check for survivorship/selection bias in the sample)'; heatPct = 25; }
    return {
      value: +value.toFixed(2), rating, sampleSize: r.length,
      reliable: r.length >= 20,
      maxPortfolioHeatPct: heatPct,
      note: r.length < 20 ? 'Fewer than 20 trades — treat this as provisional, not a real read on system quality yet (Tharp).' : null,
    };
  }

  /* Market regime from the SOL series (the "tide"). SOL is the beta anchor for
     the entire Solana token market — when SOL is weak, tokens bleed harder and
     long setups fail more often (Stewie/Zuckerman: trade with the tide). */
  function marketRegime(sol) {
    let riskScore = 0; const notes = [];
    const judge = (a, label) => {
      if (!a) return;
      const L = a.latest, S = a.structure;
      const above50 = L.sma50 != null && L.price > L.sma50;
      const above200 = L.sma200 != null && L.price > L.sma200;
      if (S.trend === 'uptrend' && above50) { riskScore++; notes.push(`${label} in uptrend`); }
      else if (S.trend === 'downtrend' || !above200) { riskScore--; notes.push(`${label} weak (${S.trend}${above200 ? '' : ', below 200-MA'})`); }
      else notes.push(`${label} mixed`);
    };
    judge(sol, 'SOL');

    const solTrend = sol
      ? (sol.structure.trend === 'downtrend' || (sol.latest.sma50 != null && sol.latest.price < sol.latest.sma50) ? 'down' : 'up')
      : null;
    const regime = riskScore >= 1 ? 'risk-on' : riskScore <= -1 ? 'risk-off' : 'mixed';
    return { regime, detail: notes.join('; '), solTrend };
  }

  return { assess, positionSize, marketRegime, nearestLevels, sqn, TF_SWING, TF_INTRADAY };
})();
