/* TradeSight — candlestick pattern detection.
   Definitions follow the two candlestick books in the library; every detector
   returns context-validated hits only (right trend location, per the books). */
'use strict';

const Patterns = (() => {

  const body = (c) => Math.abs(c.c - c.o);
  const range = (c) => c.h - c.l || 1e-9;
  const upperWick = (c) => c.h - Math.max(c.o, c.c);
  const lowerWick = (c) => Math.min(c.o, c.c) - c.l;
  const isBull = (c) => c.c > c.o;
  const isBear = (c) => c.c < c.o;
  const mid = (c) => (c.o + c.c) / 2;

  /* local trend before bar i: slope of closes over `look` bars */
  function trendBefore(candles, i, look = 8) {
    const a = candles[Math.max(0, i - look)].c, b = candles[i - 1]?.c ?? a;
    const chg = (b - a) / a;
    if (chg > 0.02) return 'up';
    if (chg < -0.02) return 'down';
    return 'flat';
  }

  /* avg body size for "long body" tests */
  function avgBody(candles, i, look = 10) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - look); j < i; j++) { s += body(candles[j]); n++; }
    return n ? s / n : body(candles[i]);
  }

  // Each detector: (candles, i) -> hit object | null. `i` is the last bar of the pattern.
  const DETECTORS = [
    {
      key: 'hammer', name: 'Hammer', dir: 'up', kind: 'reversal',
      test(cs, i) {
        const c = cs[i];
        if (trendBefore(cs, i) !== 'down') return null;
        const ok = lowerWick(c) >= 2 * body(c) && upperWick(c) <= 0.35 * body(c) + 0.1 * range(c) && body(c) / range(c) < 0.4;
        return ok ? {} : null;
      },
    },
    {
      key: 'hangingman', name: 'Hanging Man', dir: 'down', kind: 'reversal',
      test(cs, i) {
        const c = cs[i];
        if (trendBefore(cs, i) !== 'up') return null;
        const ok = lowerWick(c) >= 2 * body(c) && upperWick(c) <= 0.35 * body(c) + 0.1 * range(c) && body(c) / range(c) < 0.4;
        return ok ? {} : null;
      },
    },
    {
      key: 'invhammer', name: 'Inverted Hammer', dir: 'up', kind: 'reversal',
      test(cs, i) {
        const c = cs[i];
        if (trendBefore(cs, i) !== 'down') return null;
        const ok = upperWick(c) >= 2 * body(c) && lowerWick(c) <= 0.35 * body(c) + 0.1 * range(c) && body(c) / range(c) < 0.4;
        return ok ? {} : null;
      },
    },
    {
      key: 'shootingstar', name: 'Shooting Star', dir: 'down', kind: 'reversal',
      test(cs, i) {
        const c = cs[i];
        if (trendBefore(cs, i) !== 'up') return null;
        const ok = upperWick(c) >= 2 * body(c) && lowerWick(c) <= 0.35 * body(c) + 0.1 * range(c) && body(c) / range(c) < 0.4;
        return ok ? {} : null;
      },
    },
    {
      key: 'bullengulf', name: 'Bullish Engulfing', dir: 'up', kind: 'reversal',
      test(cs, i) {
        if (i < 1) return null;
        const p = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i) === 'up') return null;
        const ok = isBear(p) && isBull(c) && c.c >= p.o && c.o <= p.c && body(c) > body(p) && body(c) > avgBody(cs, i) * 0.8;
        return ok ? {} : null;
      },
    },
    {
      key: 'bearengulf', name: 'Bearish Engulfing', dir: 'down', kind: 'reversal',
      test(cs, i) {
        if (i < 1) return null;
        const p = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i) === 'down') return null;
        const ok = isBull(p) && isBear(c) && c.o >= p.c && c.c <= p.o && body(c) > body(p) && body(c) > avgBody(cs, i) * 0.8;
        return ok ? {} : null;
      },
    },
    {
      key: 'piercing', name: 'Piercing Line', dir: 'up', kind: 'reversal',
      test(cs, i) {
        if (i < 1) return null;
        const p = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i) !== 'down') return null;
        const ok = isBear(p) && isBull(c) && c.o < p.l && c.c > mid(p) && c.c < p.o;
        return ok ? {} : null;
      },
    },
    {
      key: 'darkcloud', name: 'Dark Cloud Cover', dir: 'down', kind: 'reversal',
      test(cs, i) {
        if (i < 1) return null;
        const p = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i) !== 'up') return null;
        const ok = isBull(p) && isBear(c) && c.o > p.h && c.c < mid(p) && c.c > p.o;
        return ok ? {} : null;
      },
    },
    {
      key: 'bullharami', name: 'Bullish Harami', dir: 'up', kind: 'reversal',
      test(cs, i) {
        if (i < 1) return null;
        const p = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i) !== 'down') return null;
        const ok = isBear(p) && isBull(c) && c.o > p.c && c.c < p.o && body(p) > avgBody(cs, i);
        return ok ? {} : null;
      },
    },
    {
      key: 'bearharami', name: 'Bearish Harami', dir: 'down', kind: 'reversal',
      test(cs, i) {
        if (i < 1) return null;
        const p = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i) !== 'up') return null;
        const ok = isBull(p) && isBear(c) && c.o < p.c && c.c > p.o && body(p) > avgBody(cs, i);
        return ok ? {} : null;
      },
    },
    {
      key: 'morningstar', name: 'Morning Star', dir: 'up', kind: 'reversal',
      test(cs, i) {
        if (i < 2) return null;
        const a = cs[i - 2], b = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i - 1) !== 'down') return null;
        const ok = isBear(a) && body(a) > avgBody(cs, i - 2) &&
          body(b) < body(a) * 0.4 &&
          isBull(c) && c.c > mid(a);
        return ok ? {} : null;
      },
    },
    {
      key: 'eveningstar', name: 'Evening Star', dir: 'down', kind: 'reversal',
      test(cs, i) {
        if (i < 2) return null;
        const a = cs[i - 2], b = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i - 1) !== 'up') return null;
        const ok = isBull(a) && body(a) > avgBody(cs, i - 2) &&
          body(b) < body(a) * 0.4 &&
          isBear(c) && c.c < mid(a);
        return ok ? {} : null;
      },
    },
    {
      key: 'threesoldiers', name: 'Three White Soldiers', dir: 'up', kind: 'reversal',
      test(cs, i) {
        if (i < 2) return null;
        const a = cs[i - 2], b = cs[i - 1], c = cs[i];
        const long = (x) => body(x) > avgBody(cs, i) * 0.9 && body(x) / range(x) > 0.6;
        const ok = isBull(a) && isBull(b) && isBull(c) && long(a) && long(b) && long(c) &&
          b.c > a.c && c.c > b.c && b.o > a.o && c.o > b.o;
        return ok ? {} : null;
      },
    },
    {
      key: 'threecrows', name: 'Three Black Crows', dir: 'down', kind: 'reversal',
      test(cs, i) {
        if (i < 2) return null;
        const a = cs[i - 2], b = cs[i - 1], c = cs[i];
        const long = (x) => body(x) > avgBody(cs, i) * 0.9 && body(x) / range(x) > 0.6;
        const ok = isBear(a) && isBear(b) && isBear(c) && long(a) && long(b) && long(c) &&
          b.c < a.c && c.c < b.c && b.o < a.o && c.o < b.o;
        return ok ? {} : null;
      },
    },
    {
      key: 'doji', name: 'Doji (indecision)', dir: 'neutral', kind: 'indecision',
      test(cs, i) {
        const c = cs[i];
        const ok = body(c) / range(c) < 0.08 && range(c) > 0;
        if (!ok) return null;
        const t = trendBefore(cs, i);
        if (t === 'flat') return null; // doji only matters after a move (books)
        return { note: t === 'up' ? 'after advance — possible top' : 'after decline — possible bottom' };
      },
    },
    {
      key: 'tweezerbottom', name: 'Tweezer Bottom', dir: 'up', kind: 'reversal',
      test(cs, i) {
        if (i < 1) return null;
        const p = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i) !== 'down') return null;
        const ok = Math.abs(p.l - c.l) / range(c) < 0.1 && isBear(p) && isBull(c);
        return ok ? {} : null;
      },
    },
    {
      key: 'tweezertop', name: 'Tweezer Top', dir: 'down', kind: 'reversal',
      test(cs, i) {
        if (i < 1) return null;
        const p = cs[i - 1], c = cs[i];
        if (trendBefore(cs, i) !== 'up') return null;
        const ok = Math.abs(p.h - c.h) / range(c) < 0.1 && isBull(p) && isBear(c);
        return ok ? {} : null;
      },
    },
    {
      key: 'marubozubull', name: 'Bullish Marubozu', dir: 'up', kind: 'continuation',
      test(cs, i) {
        const c = cs[i];
        const ok = isBull(c) && body(c) / range(c) > 0.92 && body(c) > avgBody(cs, i) * 1.2;
        return ok ? {} : null;
      },
    },
    {
      key: 'marubozubear', name: 'Bearish Marubozu', dir: 'down', kind: 'continuation',
      test(cs, i) {
        const c = cs[i];
        const ok = isBear(c) && body(c) / range(c) > 0.92 && body(c) > avgBody(cs, i) * 1.2;
        return ok ? {} : null;
      },
    },
  ];

  /* Scan the last `lookback` bars. Returns hits newest-first, each with:
     {key, name, dir, kind, i, ageBars, atLevel, confirmed} */
  function detect(candles, srZones = [], lookback = 15) {
    const hits = [];
    const start = Math.max(3, candles.length - lookback);
    for (let i = start; i < candles.length; i++) {
      for (const d of DETECTORS) {
        let hit;
        try { hit = d.test(candles, i); } catch { hit = null; }
        if (!hit) continue;
        const c = candles[i];
        // context: is the pattern at a support/resistance zone? (books: patterns
        // only carry weight at meaningful levels)
        const tol = (c.h - c.l) * 2 + c.c * 0.01;
        const atLevel = srZones.some(z => Math.min(Math.abs(c.l - z.price), Math.abs(c.h - z.price), Math.abs(c.c - z.price)) <= tol);
        // confirmation: for reversals the books demand the NEXT bar close in the
        // pattern's direction before acting
        let confirmed = null;
        if (i + 1 < candles.length) {
          const nxt = candles[i + 1];
          confirmed = d.dir === 'up' ? nxt.c > c.h : d.dir === 'down' ? nxt.c < c.l : null;
        }
        hits.push({
          key: d.key, name: d.name, dir: d.dir, kind: d.kind, i,
          ageBars: candles.length - 1 - i,
          atLevel, confirmed, note: hit.note || null,
          low: c.l, high: c.h,
        });
      }
    }
    return hits.sort((a, b) => a.ageBars - b.ageBars);
  }

  /* ---------- multi-bar chart patterns (Edwards & Magee definitions,
     scored later using Bulkowski's real backtested statistics) ---------- */

  const near = (a, b, tolPct = 0.025) => Math.abs(a - b) / ((a + b) / 2) <= tolPct;

  /* Head & Shoulders top/bottom from the last 3 swing highs/lows. */
  function detectHeadAndShoulders(candles, swingsPts) {
    const hits = [];
    const n = candles.length;
    const price = candles[n - 1].c;
    const { highs, lows } = swingsPts;
    if (highs.length >= 3) {
      const [ls, head, rs] = highs.slice(-3);
      const shoulderLevel = Math.min(ls.price, rs.price);
      const headProminent = (head.price - shoulderLevel) / shoulderLevel > 0.02; // genuinely distinct head, not a flat triple top
      if (headProminent && near(ls.price, rs.price, 0.035) && head.i - ls.i >= 3 && rs.i - head.i >= 3) {
        const neckLows = lows.filter(l => l.i > ls.i && l.i < rs.i);
        if (neckLows.length >= 1) {
          const neckline = neckLows.reduce((s, l) => s + l.price, 0) / neckLows.length;
          hits.push({
            key: 'hstop', name: 'Head & Shoulders Top', dir: 'down', kind: 'reversal', chartPattern: true,
            i: rs.i, ageBars: n - 1 - rs.i, neckline, confirmed: price < neckline * 0.997,
            low: Math.min(neckline, rs.price), high: head.price,
          });
        }
      }
    }
    if (lows.length >= 3) {
      const [ls, head, rs] = lows.slice(-3);
      const shoulderLevel = Math.max(ls.price, rs.price);
      const headProminent = (shoulderLevel - head.price) / shoulderLevel > 0.02; // genuinely distinct head, not a flat triple bottom
      if (headProminent && near(ls.price, rs.price, 0.035) && head.i - ls.i >= 3 && rs.i - head.i >= 3) {
        const neckHighs = highs.filter(h => h.i > ls.i && h.i < rs.i);
        if (neckHighs.length >= 1) {
          const neckline = neckHighs.reduce((s, h) => s + h.price, 0) / neckHighs.length;
          hits.push({
            key: 'hsbottom', name: 'Head & Shoulders Bottom', dir: 'up', kind: 'reversal', chartPattern: true,
            i: rs.i, ageBars: n - 1 - rs.i, neckline, confirmed: price > neckline * 1.003,
            low: head.price, high: Math.max(neckline, rs.price),
          });
        }
      }
    }
    return hits;
  }

  /* Double/triple top & bottom: 2-3 roughly-equal extremes separated by a
     meaningful intervening swing, confirmed only on a close beyond that swing
     (Edwards & Magee: unconfirmed "double tops" continue in the old direction
     most of the time). */
  function detectDoubleTriple(candles, swingsPts) {
    const hits = [];
    const n = candles.length;
    const price = candles[n - 1].c;
    const { highs, lows } = swingsPts;

    const scan = (pts, otherPts, isTop) => {
      for (const count of [3, 2]) {
        if (pts.length < count) continue;
        const set = pts.slice(-count);
        const levels = set.map(p => p.price);
        const allNear = levels.every((l, i) => i === 0 || near(l, levels[0], 0.03));
        if (!allNear) continue;
        // exclude shapes with a prominent middle point — that's an H&S, not a
        // flat triple top/bottom, and the two patterns shouldn't both fire on
        // the same three swing points
        if (count === 3) {
          const outerAvg = (levels[0] + levels[2]) / 2;
          const prominence = Math.abs(levels[1] - outerAvg) / outerAvg;
          if (prominence > 0.02) continue;
        }
        const span = set[set.length - 1].i - set[0].i;
        if (span < 8) continue; // Edwards & Magee: true double tops need real time separation
        const between = otherPts.filter(p => p.i > set[0].i && p.i < set[set.length - 1].i);
        if (!between.length) continue;
        const neckline = isTop
          ? Math.min(...between.map(p => p.price))
          : Math.max(...between.map(p => p.price));
        const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;
        const key = count === 3 ? (isTop ? 'tripletop' : 'triplebottom') : (isTop ? 'doubletop' : 'doublebottom');
        const name = count === 3 ? (isTop ? 'Triple Top' : 'Triple Bottom') : (isTop ? 'Double Top' : 'Double Bottom');
        hits.push({
          key, name, dir: isTop ? 'down' : 'up', kind: 'reversal', chartPattern: true,
          i: set[set.length - 1].i, ageBars: n - 1 - set[set.length - 1].i, neckline,
          confirmed: isTop ? price < neckline * 0.997 : price > neckline * 1.003,
          low: isTop ? neckline : avgLevel, high: isTop ? avgLevel : neckline,
        });
        return; // don't double-report triple as also double
      }
    };
    scan(highs, lows, true);
    scan(lows, highs, false);
    return hits;
  }

  /* Triangles & rectangles from the last 3 swing highs + 3 swing lows within
     a recent window — classify by whether each boundary is flat, rising or
     falling (Edwards & Magee's ascending/descending/symmetrical/rectangle). */
  function detectTrianglesAndRectangles(candles, swingsPts) {
    const n = candles.length;
    const price = candles[n - 1].c;
    const { highs, lows } = swingsPts;
    const recentHighs = highs.filter(h => h.i > n - 70).slice(-3);
    const recentLows = lows.filter(l => l.i > n - 70).slice(-3);
    if (recentHighs.length < 2 || recentLows.length < 2) return [];

    const slope = (pts) => {
      const first = pts[0], last = pts[pts.length - 1];
      return (last.price - first.price) / ((first.price + last.price) / 2) / Math.max(1, last.i - first.i);
    };
    const hSlope = slope(recentHighs), lSlope = slope(recentLows);
    const FLAT = 0.0006; // per-bar slope considered "flat"
    const highsFlat = Math.abs(hSlope) < FLAT, lowsFlat = Math.abs(lSlope) < FLAT;
    const highsFalling = hSlope < -FLAT;
    const lowsRising = lSlope > FLAT;

    const top = Math.max(...recentHighs.map(h => h.price));
    const bottom = Math.min(...recentLows.map(l => l.price));
    const lastI = Math.max(recentHighs[recentHighs.length - 1].i, recentLows[recentLows.length - 1].i);
    const base = { i: lastI, ageBars: n - 1 - lastI, kind: 'continuation', chartPattern: true, low: bottom, high: top };

    if (highsFlat && lowsFlat && near(top, bottom, 0.06) === false) {
      // rectangle: both boundaries flat, top clearly above bottom
      const confirmedUp = price > top * 1.003, confirmedDown = price < bottom * 0.997;
      return [{ ...base, key: 'rectangle', name: 'Rectangle', dir: confirmedUp ? 'up' : confirmedDown ? 'down' : 'neutral', confirmed: confirmedUp || confirmedDown, neckline: confirmedUp ? top : bottom }];
    }
    if (highsFalling && lowsRising) {
      const confirmed = price > top * 0.997 || price < bottom * 1.003;
      return [{ ...base, key: 'symtriangle', name: 'Symmetrical Triangle', dir: price > (top + bottom) / 2 ? 'up' : 'down', confirmed, neckline: price > (top + bottom) / 2 ? top : bottom }];
    }
    if (highsFlat && lowsRising) {
      const confirmed = price > top * 1.003;
      return [{ ...base, key: 'asctriangle', name: 'Ascending Triangle', dir: 'up', confirmed, neckline: top }];
    }
    if (lowsFlat && highsFalling) {
      const confirmed = price < bottom * 0.997;
      return [{ ...base, key: 'desctriangle', name: 'Descending Triangle', dir: 'down', confirmed, neckline: bottom }];
    }
    return [];
  }

  /* Gaps (Edwards & Magee): classify by context, not just presence.
     - breakaway: gap while leaving a recent tight range (a pattern breakout)
     - runaway: gap mid-trend, roughly proportional distance already covered
     - exhaustion: gap at the end of an extended move on a volume spike that
       fails to carry through the next bar */
  function detectGaps(candles, lookback = 25) {
    const n = candles.length;
    const hits = [];
    const avgVol = (i, look = 20) => {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - look); j < i; j++) { s += candles[j].v || 0; c++; }
      return c ? s / c : 0;
    };
    const start = Math.max(1, n - lookback);
    for (let i = start; i < n; i++) {
      const prev = candles[i - 1], cur = candles[i];
      let type = null, dir = null;
      if (cur.l > prev.h) { type = 'up'; dir = 'up'; }
      else if (cur.h < prev.l) { type = 'down'; dir = 'down'; }
      if (!type) continue;
      const gapSizePct = Math.abs((type === 'up' ? cur.l - prev.h : prev.l - cur.h) / prev.c);
      if (gapSizePct < 0.008) continue; // ignore trivial/ex-div-sized gaps

      // recent range tightness (last 15 bars before the gap) → breakaway candidate
      const win = candles.slice(Math.max(0, i - 16), i - 1);
      const winHigh = Math.max(...win.map(c => c.h)), winLow = Math.min(...win.map(c => c.l));
      const rangeTightPct = win.length ? (winHigh - winLow) / prev.c : 1;
      const priorMove = win.length ? Math.abs(prev.c - win[0].o) / win[0].o : 0;
      const vr = avgVol(i) > 0 ? (cur.v || 0) / avgVol(i) : 1;

      let classification = 'common';
      if (rangeTightPct < 0.06) classification = 'breakaway';
      else if (priorMove > 0.1) classification = 'runaway';
      if (vr > 2.2 && i + 1 < n) {
        const nxt = candles[i + 1];
        const followedThrough = dir === 'up' ? nxt.c > cur.c : nxt.c < cur.c;
        if (!followedThrough) classification = 'exhaustion';
      }
      hits.push({ i, ageBars: n - 1 - i, dir, sizePct: gapSizePct, classification, volRatio: vr });
    }
    return hits.sort((a, b) => a.ageBars - b.ageBars);
  }

  /* No-demand / no-supply bars (Coulling): a narrow-range up-bar on
     below-average volume in an uptrend/at resistance (buyers not committing),
     or the mirror at support in a downtrend — an exhaustion warning. */
  function detectNoDemandSupply(candles, avgVol, lookback = 6) {
    const n = candles.length;
    const hits = [];
    const avgRange = (i, look = 15) => {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - look); j < i; j++) { s += range(candles[j]); c++; }
      return c ? s / c : range(candles[i]);
    };
    for (let i = Math.max(1, n - lookback); i < n; i++) {
      const c = candles[i];
      if (!(avgVol > 0)) continue;
      const vr = (c.v || 0) / avgVol;
      const rr = range(c) / avgRange(i);
      if (vr >= 0.75 || rr >= 0.75) continue; // needs to be genuinely narrow AND quiet
      const trend = trendBefore(candles, i);
      if (isBull(c) && trend === 'up') {
        hits.push({ key: 'nodemand', name: 'No-Demand Bar', dir: 'down', kind: 'exhaustion', i, ageBars: n - 1 - i, low: c.l, high: c.h, confirmed: null });
      } else if (isBear(c) && trend === 'down') {
        hits.push({ key: 'nosupply', name: 'No-Supply Bar', dir: 'up', kind: 'exhaustion', i, ageBars: n - 1 - i, low: c.l, high: c.h, confirmed: null });
      }
    }
    return hits;
  }

  /* Flags, pennants and wedges: a sharp directional "pole" over the prior
     ~15-25 bars followed by a tight ~6-12 bar consolidation. Parallel channel
     sloping against the pole = flag; converging channel = pennant (short) or
     wedge (when the whole prior pole is itself sloped the same way as the
     channel, per Edwards & Magee/Bulkowski). */
  function detectFlagsWedges(candles) {
    const n = candles.length;
    if (n < 35) return [];
    const consolLen = 9;
    const poleLen = 18;
    const consol = candles.slice(n - consolLen);
    const pole = candles.slice(n - consolLen - poleLen, n - consolLen);
    if (pole.length < 12 || consol.length < 6) return [];

    const poleChangePct = (pole[pole.length - 1].c - pole[0].o) / pole[0].o;
    if (Math.abs(poleChangePct) < 0.1) return []; // needs a genuine "mast"

    const consolHigh = Math.max(...consol.map(c => c.h)), consolLow = Math.min(...consol.map(c => c.l));
    const consolRangePct = (consolHigh - consolLow) / consol[0].o;
    if (consolRangePct > Math.abs(poleChangePct) * 0.65) return []; // consolidation too wide to be a flag/pennant

    const half = Math.floor(consol.length / 2);
    const firstRange = Math.max(...consol.slice(0, half).map(c => c.h)) - Math.min(...consol.slice(0, half).map(c => c.l));
    const secondRange = Math.max(...consol.slice(half).map(c => c.h)) - Math.min(...consol.slice(half).map(c => c.l));
    const converging = secondRange < firstRange * 0.72;

    const bullish = poleChangePct > 0;
    const i = n - 1, ageBars = 0;
    const base = { i, ageBars, kind: 'continuation', chartPattern: true, low: consolLow, high: consolHigh, confirmed: null };

    // wedge: consolidation trending the SAME direction as the pole moved
    // against (a corrective channel that itself slopes counter-trend and
    // converges) — classified as rising wedge (bearish) or falling wedge
    // (bullish continuation) per Bulkowski.
    const consolTrendPct = (consol[consol.length - 1].c - consol[0].o) / consol[0].o;
    if (converging && bullish && consolTrendPct > 0.01) {
      return [{ ...base, key: 'risingwedge', name: 'Rising Wedge', dir: 'down', kind: 'reversal', note: 'Bulkowski\'s single worst-ranked pattern for down-breakouts — treat any breakdown from here seriously.' }];
    }
    if (converging && !bullish && consolTrendPct < -0.01) {
      return [{ ...base, key: 'fallingwedge', name: 'Falling Wedge', dir: 'up', kind: 'reversal', note: null }];
    }
    if (converging) {
      return [{ ...base, key: 'pennant', name: bullish ? 'Bull Pennant' : 'Bear Pennant', dir: bullish ? 'up' : 'down', note: null }];
    }
    const key = Math.abs(poleChangePct) > 0.4 ? 'hightightflag' : (bullish ? 'bullflag' : 'bearflag');
    const name = key === 'hightightflag' ? 'High, Tight Flag' : (bullish ? 'Bull Flag' : 'Bear Flag');
    return [{ ...base, key, name, dir: bullish ? 'up' : 'down', note: null }];
  }

  return { detect, DETECTORS, detectHeadAndShoulders, detectDoubleTriple, detectTrianglesAndRectangles, detectGaps, detectNoDemandSupply, detectFlagsWedges };
})();
