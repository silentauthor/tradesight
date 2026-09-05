/* TradeSight — technical indicator engine. Pure functions over candle arrays.
   A candle is {t, o, h, l, c, v}. All series returned aligned to input length (leading nulls). */
'use strict';

const TA = (() => {

  function sma(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function ema(values, period) {
    const out = new Array(values.length).fill(null);
    const k = 2 / (period + 1);
    let prev = null;
    for (let i = 0; i < values.length; i++) {
      if (prev == null) {
        if (i === period - 1) {
          let s = 0;
          for (let j = 0; j < period; j++) s += values[j];
          prev = s / period;
          out[i] = prev;
        }
      } else {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
      }
    }
    return out;
  }

  function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i < closes.length; i++) {
      const ch = closes[i] - closes[i - 1];
      const gain = Math.max(ch, 0), loss = Math.max(-ch, 0);
      if (i <= period) {
        avgGain += gain / period;
        avgLoss += loss / period;
        if (i === period) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      } else {
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    }
    return out;
  }

  function macd(closes, fast = 12, slow = 26, signal = 9) {
    const emaFast = ema(closes, fast), emaSlow = ema(closes, slow);
    const line = closes.map((_, i) =>
      emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null);
    const firstIdx = line.findIndex(v => v != null);
    const compact = line.slice(firstIdx);
    const sigCompact = ema(compact, signal);
    const sig = new Array(closes.length).fill(null);
    for (let i = 0; i < sigCompact.length; i++) sig[firstIdx + i] = sigCompact[i];
    const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
    return { line, signal: sig, hist };
  }

  function bollinger(closes, period = 20, mult = 2) {
    const mid = sma(closes, period);
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - mid[i]) ** 2;
      const sd = Math.sqrt(sumSq / period);
      upper[i] = mid[i] + mult * sd;
      lower[i] = mid[i] - mult * sd;
    }
    return { mid, upper, lower };
  }

  function atr(candles, period = 14) {
    const out = new Array(candles.length).fill(null);
    let prev = null;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const pc = i > 0 ? candles[i - 1].c : c.o;
      const tr = Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc));
      if (i === 0) { prev = tr; continue; }
      if (i < period) {
        prev = (prev * i + tr) / (i + 1);
      } else {
        prev = (prev * (period - 1) + tr) / period;
      }
      if (i >= period) out[i] = prev;
    }
    return out;
  }

  function obv(candles) {
    const out = new Array(candles.length).fill(0);
    for (let i = 1; i < candles.length; i++) {
      const dir = candles[i].c > candles[i - 1].c ? 1 : candles[i].c < candles[i - 1].c ? -1 : 0;
      out[i] = out[i - 1] + dir * (candles[i].v || 0);
    }
    return out;
  }

  /* ADX / +DI / -DI (Wilder). Murphy: trend-following tools work when ADX is
     rising/high; oscillators work better when ADX is falling/low — markets
     trend only ~30% of the time (Wilder's own estimate). */
  function adx(candles, period = 14) {
    const n = candles.length;
    const plusDM = new Array(n).fill(0), minusDM = new Array(n).fill(0), tr = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const upMove = candles[i].h - candles[i - 1].h;
      const downMove = candles[i - 1].l - candles[i].l;
      plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
      minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
      const pc = candles[i - 1].c;
      tr[i] = Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - pc), Math.abs(candles[i].l - pc));
    }
    const smooth = (arr) => {
      const out = new Array(n).fill(null);
      let sum = 0;
      for (let i = 1; i <= period; i++) sum += arr[i] || 0;
      out[period] = sum;
      for (let i = period + 1; i < n; i++) out[i] = out[i - 1] - out[i - 1] / period + arr[i];
      return out;
    };
    const sTR = smooth(tr), sPlusDM = smooth(plusDM), sMinusDM = smooth(minusDM);
    const plusDI = new Array(n).fill(null), minusDI = new Array(n).fill(null), dx = new Array(n).fill(null);
    for (let i = period; i < n; i++) {
      if (!sTR[i]) continue;
      plusDI[i] = 100 * sPlusDM[i] / sTR[i];
      minusDI[i] = 100 * sMinusDM[i] / sTR[i];
      const sum = plusDI[i] + minusDI[i];
      dx[i] = sum > 0 ? 100 * Math.abs(plusDI[i] - minusDI[i]) / sum : 0;
    }
    const out = new Array(n).fill(null);
    let prev = null;
    for (let i = period; i < n; i++) {
      if (dx[i] == null) continue;
      if (prev == null) {
        if (i >= period * 2 - 1) {
          let s = 0, c = 0;
          for (let j = i - period + 1; j <= i; j++) if (dx[j] != null) { s += dx[j]; c++; }
          prev = c ? s / c : null;
          out[i] = prev;
        }
      } else {
        prev = (prev * (period - 1) + dx[i]) / period;
        out[i] = prev;
      }
    }
    return { adx: out, plusDI, minusDI };
  }

  /* Percentile rank of the latest value in a trailing window — used to judge
     whether current volatility (ATR) is stretched or compressed relative to
     its own history (Natenberg's "volatility cone" idea, adapted from ATR
     since there's no options-chain data source here). */
  function percentileRank(arr, lookback = 252) {
    const n = arr.length;
    const latest = arr[n - 1];
    if (latest == null) return null;
    const start = Math.max(0, n - lookback);
    const window = arr.slice(start, n - 1).filter(v => v != null);
    if (window.length < 20) return null;
    const below = window.filter(v => v <= latest).length;
    return below / window.length; // 0..1
  }

  /* Swing points: bar i is a swing high if its high is the highest of the 2*len+1 window. */
  function swings(candles, len = 3) {
    const highs = [], lows = [];
    for (let i = len; i < candles.length - len; i++) {
      let isH = true, isL = true;
      for (let j = i - len; j <= i + len; j++) {
        if (j === i) continue;
        if (candles[j].h >= candles[i].h) isH = false;
        if (candles[j].l <= candles[i].l) isL = false;
        if (!isH && !isL) break;
      }
      if (isH) highs.push({ i, price: candles[i].h });
      if (isL) lows.push({ i, price: candles[i].l });
    }
    return { highs, lows };
  }

  /* Cluster swing levels into support/resistance zones. tolerance ~ fraction of price. */
  function srLevels(candles, opts = {}) {
    const { highs, lows } = swings(candles, opts.swingLen || 3);
    const price = candles[candles.length - 1].c;
    const tol = (opts.tolerance || 0.015) * price;
    const pts = [...highs.map(p => ({ ...p, kind: 'h' })), ...lows.map(p => ({ ...p, kind: 'l' }))]
      .sort((a, b) => a.price - b.price);
    const zones = [];
    for (const p of pts) {
      const z = zones[zones.length - 1];
      if (z && p.price - z.max <= tol) {
        z.max = Math.max(z.max, p.price);
        z.min = Math.min(z.min, p.price);
        z.touches++;
        z.lastIdx = Math.max(z.lastIdx, p.i);
      } else {
        zones.push({ min: p.price, max: p.price, touches: 1, lastIdx: p.i });
      }
    }
    for (const z of zones) {
      z.price = (z.min + z.max) / 2;
      z.role = z.price < price ? 'support' : 'resistance';
      z.strength = z.touches;
    }
    return zones.filter(z => z.touches >= 1).sort((a, b) => b.touches - a.touches).slice(0, 12)
      .sort((a, b) => a.price - b.price);
  }

  /* Market structure per the smart-money books: sequence of swing highs/lows →
     HH/HL = uptrend, LH/LL = downtrend, else range. Also detects break of structure. */
  function marketStructure(candles) {
    const { highs, lows } = swings(candles, 3);
    const lastHs = highs.slice(-3), lastLs = lows.slice(-3);
    if (lastHs.length < 2 || lastLs.length < 2) return { trend: 'insufficient', detail: 'not enough swings' };
    const hh = lastHs[lastHs.length - 1].price > lastHs[lastHs.length - 2].price;
    const hl = lastLs[lastLs.length - 1].price > lastLs[lastLs.length - 2].price;
    const lh = !hh, ll = !hl;
    const price = candles[candles.length - 1].c;
    const lastHigh = lastHs[lastHs.length - 1], lastLow = lastLs[lastLs.length - 1];
    let trend = 'range';
    if (hh && hl) trend = 'uptrend';
    else if (lh && ll) trend = 'downtrend';
    let bos = null; // break of structure by close
    if (price > lastHigh.price) bos = 'bullish';
    else if (price < lastLow.price) bos = 'bearish';
    // premium/discount within the current swing range
    const rangeHi = Math.max(...lastHs.map(p => p.price));
    const rangeLo = Math.min(...lastLs.map(p => p.price));
    const pos = rangeHi > rangeLo ? (price - rangeLo) / (rangeHi - rangeLo) : 0.5;
    // equal highs/lows = resting liquidity (smart-money book)
    const eq = (arr) => {
      for (let i = 0; i < arr.length - 1; i++)
        for (let j = i + 1; j < arr.length; j++)
          if (Math.abs(arr[i].price - arr[j].price) / price < 0.004) return (arr[i].price + arr[j].price) / 2;
      return null;
    };
    return {
      trend, bos,
      lastSwingHigh: lastHigh.price, lastSwingLow: lastLow.price,
      rangePos: pos, // 0 = at range low (discount), 1 = at range high (premium)
      equalHighs: eq(lastHs), equalLows: eq(lastLs),
    };
  }

  /* Volume Profile: bins the price range of a lookback window by volume,
     using each bar's typical price (h+l+c)/3 — a standard lightweight
     approximation. Returns the Point of Control (highest-volume price) and
     the Value Area (the band holding 70% of total volume, built outward from
     the POC). Wyckoff 2.0 (Villahermosa): POC acts as a magnet/support-
     resistance; a "naked" POC (never revisited since) is a high-probability
     target. */
  function volumeProfile(candles, lookback = 60, bins = 24) {
    const win = candles.slice(-lookback);
    if (win.length < 10) return null;
    const hi = Math.max(...win.map(c => c.h)), lo = Math.min(...win.map(c => c.l));
    if (!(hi > lo)) return null;
    const binSize = (hi - lo) / bins;
    const vols = new Array(bins).fill(0);
    for (const c of win) {
      const typical = (c.h + c.l + c.c) / 3;
      let idx = Math.floor((typical - lo) / binSize);
      idx = Math.max(0, Math.min(bins - 1, idx));
      vols[idx] += c.v || 0;
    }
    const totalVol = vols.reduce((a, b) => a + b, 0);
    if (totalVol <= 0) return null;
    let pocIdx = 0;
    for (let i = 1; i < bins; i++) if (vols[i] > vols[pocIdx]) pocIdx = i;
    const binPrice = (idx) => lo + (idx + 0.5) * binSize;

    // expand outward from POC adding the higher-volume adjacent bin each time
    // until 70% of total volume is captured (standard Value Area convention)
    let loIdx = pocIdx, hiIdx = pocIdx, covered = vols[pocIdx];
    while (covered / totalVol < 0.7 && (loIdx > 0 || hiIdx < bins - 1)) {
      const nextLo = loIdx > 0 ? vols[loIdx - 1] : -1;
      const nextHi = hiIdx < bins - 1 ? vols[hiIdx + 1] : -1;
      if (nextHi >= nextLo) { hiIdx++; covered += vols[hiIdx]; }
      else { loIdx--; covered += vols[loIdx]; }
    }
    return {
      poc: binPrice(pocIdx),
      vah: binPrice(hiIdx) + binSize / 2,
      val: binPrice(loIdx) - binSize / 2,
      bins: vols.map((v, i) => ({ price: binPrice(i), volume: v })),
    };
  }

  /* Resample a daily candle array into weekly candles (UTC, week starts Monday).
     Used as the higher-timeframe series when the data source has no native
     weekly feed (Dhan). open = first day, close = last day, high/low = extremes,
     volume = sum. */
  function resampleWeekly(candles) {
    const weeks = new Map();
    for (const c of candles) {
      const d = new Date(c.t);
      const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
      const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
      let w = weeks.get(monday);
      if (!w) { w = { t: monday, o: c.o, h: c.h, l: c.l, c: c.c, v: 0 }; weeks.set(monday, w); }
      w.h = Math.max(w.h, c.h);
      w.l = Math.min(w.l, c.l);
      w.c = c.c;
      w.v += c.v || 0;
    }
    return [...weeks.values()].sort((a, b) => a.t - b.t);
  }

  /* Everything the app needs, computed once. */
  function analyzeSeries(candles) {
    const closes = candles.map(c => c.c);
    const vols = candles.map(c => c.v || 0);
    const n = candles.length;
    const last = (arr) => arr[n - 1];
    const atrSeries = atr(candles);
    const adxRes = adx(candles, 14);
    const ind = {
      sma20: sma(closes, 20), sma50: sma(closes, 50), sma200: sma(closes, 200),
      ema9: ema(closes, 9), ema21: ema(closes, 21),
      rsi: rsi(closes, 14),
      macd: macd(closes),
      bb: bollinger(closes),
      atr: atrSeries,
      obv: obv(candles),
      volSma20: sma(vols, 20),
      adx: adxRes.adx, plusDI: adxRes.plusDI, minusDI: adxRes.minusDI,
    };
    const atrPctSeries = atrSeries.map((a, i) => a != null && closes[i] ? (a / closes[i]) * 100 : null);
    return {
      ind,
      latest: {
        price: last(closes),
        sma20: last(ind.sma20), sma50: last(ind.sma50), sma200: last(ind.sma200),
        ema9: last(ind.ema9), ema21: last(ind.ema21),
        rsi: last(ind.rsi),
        macdLine: last(ind.macd.line), macdSignal: last(ind.macd.signal), macdHist: last(ind.macd.hist),
        macdHistPrev: ind.macd.hist[n - 2] ?? null,
        bbUpper: last(ind.bb.upper), bbLower: last(ind.bb.lower), bbMid: last(ind.bb.mid),
        atr: last(ind.atr),
        vol: vols[n - 1], volAvg: last(ind.volSma20),
        obvSlope: n > 10 ? (ind.obv[n - 1] - ind.obv[n - 11]) : 0,
        adx: last(ind.adx), plusDI: last(ind.plusDI), minusDI: last(ind.minusDI),
        volPercentile: percentileRank(atrPctSeries, 252),
      },
      structure: marketStructure(candles),
      srZones: srLevels(candles),
      swingsPts: swings(candles, 3),
      volumeProfile: volumeProfile(candles),
    };
  }

  return { sma, ema, rsi, macd, bollinger, atr, obv, adx, percentileRank, volumeProfile, swings, srLevels, marketStructure, resampleWeekly, analyzeSeries };
})();
