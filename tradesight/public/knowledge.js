/* TradeSight — machine-readable knowledge base distilled from the trading-book
   library in this folder. Consumed by the scoring engine (engine.js) and by the
   education tooltips in the UI. Every rule keeps its source attribution.
   Sources extracted and encoded: "Trading Bible" (Sanyog Raut, Candlestick Trading
   Bible), "Visually" (Keith J. Adams, Candlesticks Explained Visually), "Smart
   Money" (Jon Fibonacci), "Stewie" (The Art of Trading), "Zuckerman" (crypto
   3-in-1), "Aries" (crypto day trading), "Bear" (options), "Ray Bears"
   (stock/swing), "Correra" (swing indicators), "Ambush" (forex stop-order
   strategy). All ten books in the library were read this session. */
'use strict';

const KB = {

  riskManagement: {
    maxRiskPerTradePct: 1, // Stewie rule 1: never lose >1% of account on one trade
    maxRiskPerTradeAggressivePct: 2, // Zuckerman: "never more than a few percent"
    maxPositionPct: 10, // Stewie rule 2: enter with ~10% of capital per position
    maxOpenPositions: 6, // Stewie rule 3: 5-6 positions max, "less is more"
    minRewardRisk: 2, // Zuckerman: R:R "better than 1:2" before entering
    notes: [
      { rule: 'Never risk more than 1% of total capital on a single trade.', src: 'Stewie' },
      { rule: 'Write the full trade plan (entry, stop, target, size) BEFORE entering — the only moment you are fully rational.', src: 'Zuckerman' },
      { rule: 'Reward:risk should be at least 2:1 before a trade is worth taking.', src: 'Zuckerman' },
      { rule: 'Trade a size that keeps you unemotional; the urge to micromanage means you are oversized.', src: 'Stewie' },
      { rule: 'Never add to a losing position — cut it. Averaging down is gambler\'s ruin.', src: 'Stewie, Zuckerman' },
      { rule: 'In volatile markets: halve position size, widen stops slightly, hold fewer positions (3-4 max).', src: 'Stewie' },
      { rule: 'Size down hard (or skip) leveraged ETFs and very volatile names — standard sizing rules do not apply.', src: 'Stewie' },
      { rule: 'Only trade money you can 100% afford to lose; keep trading capital separate from investments.', src: 'Zuckerman' },
    ],
  },

  stopRules: [
    { key: 'swing', rule: 'Place the stop just beyond the structure that justifies the trade: below the swing low / pattern low for longs, above the swing high for shorts.', src: 'Stewie, Zuckerman' },
    { key: 'buffer', rule: 'Never place the stop exactly at an obvious level — whales hunt clustered stops there. Leave a buffer beyond the level.', src: 'Zuckerman, Stewie' },
    { key: 'atr', rule: 'Give the stop room to breathe relative to current volatility (wider stops + smaller size in volatile tape).', src: 'Stewie' },
    { key: 'pattern', rule: 'Pattern trades: stop goes just beyond the opposite side of the pattern (below flag/wedge lows for longs).', src: 'Stewie' },
    { key: 'trail', rule: 'Walk the stop up as the trade works ("stair-step") — raise it behind each new higher low, and to breakeven once meaningfully green.', src: 'Stewie' },
    { key: 'always', rule: 'Always use a stop. Crypto trades 24/7 — a stop order works while you sleep.', src: 'Zuckerman' },
  ],

  exitRules: [
    { rule: 'Define the profit target before entry; "wait for a little more" turns winners into losers.', src: 'Zuckerman' },
    { rule: 'Use measured moves for targets (pattern height projected from breakout) but cap them at prior resistance, pivots and round numbers — always look left on the chart.', src: 'Stewie' },
    { rule: 'Scale out: book partial profit at the first target, move stop to breakeven, let the rest run.', src: 'Zuckerman, Stewie' },
    { rule: 'In choppy or bearish tape, book gains quickly or raise stops fast — trends die fast in chop.', src: 'Stewie' },
    { rule: 'Place limit-sells just below round psychological numbers — the crowd\'s orders sit exactly at them.', src: 'Zuckerman' },
    { rule: 'If you wouldn\'t open the trade at the current price, you shouldn\'t stay in it.', src: 'Zuckerman' },
  ],

  psychology: [
    { rule: 'No setup = no trade. Overtrading in chop is an account killer.', src: 'Stewie' },
    { rule: 'Missed the breakout? Don\'t chase. Wait for the low-volume retest of the breakout area.', src: 'Stewie' },
    { rule: 'Never revenge-trade after a loss; evaluate decisions, not outcomes.', src: 'Zuckerman' },
    { rule: 'The news is almost always irrelevant — the reaction to the news is what matters.', src: 'Stewie' },
    { rule: 'There is a time to just sit and do nothing. If unsure of the market — sit out.', src: 'Stewie' },
    { rule: 'Never hold a stock position overnight through its earnings report.', src: 'Stewie' },
    { rule: 'Test any new strategy over at least 20 trades at small size before trusting it.', src: 'Zuckerman' },
    { rule: 'Expect losing streaks even with an edge; don\'t resize based on streaks (gambler\'s fallacy).', src: 'Zuckerman' },
  ],

  /* Per-pattern book guidance keyed by patterns.js detector keys. */
  patternNotes: {
    hammer: { entry: 'Wait for the next candle to trade above and hold above the hammer\'s body before acting — a green hammer (close > open) is stronger than a red one. Most reliable near a real support level.', stop: 'Below the hammer\'s long lower wick.', src: 'Trading Bible, Stewie, Zuckerman' },
    invhammer: { entry: 'Needs a confirming green candle closing above the pattern before entry; same logic as the hammer, inverted wick.', stop: 'Below the pattern low.', src: 'Zuckerman' },
    hangingman: { entry: 'Bearish only after an advance; confirm with a lower close on the next bar.', stop: 'Above the high.', src: 'Zuckerman' },
    shootingstar: { entry: 'End-of-uptrend warning; the upper shadow should be roughly 2x the real body. Most reliable near a real resistance level.', stop: 'Above the star\'s long upper wick.', src: 'Trading Bible, Zuckerman, Stewie' },
    bullengulf: { entry: 'Stronger when it fully engulfs 2-3 prior candles, appears at support, and follows a clear downtrend (Nison\'s validity rule).', stop: 'Below the engulfing candle low.', src: 'Trading Bible, Zuckerman' },
    bearengulf: { entry: 'Bearish reversal after a clear uptrend, strongest at resistance; the engulfing body must be the opposite color of the prior candle.', stop: 'Above the engulfing candle high.', src: 'Trading Bible, Zuckerman' },
    piercing: { entry: 'Second candle must gap below the prior candle\'s low, then close above its midpoint (but not above its open) — a true gap is required, not just a lower close.', stop: 'Below the pattern low.', src: 'Trading Bible, Visually, Zuckerman' },
    darkcloud: { entry: 'Second candle must gap above the prior candle\'s high, then close below its midpoint — the gap is what separates this from a weak pullback.', stop: 'Above the pattern high.', src: 'Trading Bible, Visually, Zuckerman' },
    bullharami: { entry: 'A weaker signal than a hammer or engulfing bar — reads as "momentum abating," not a strong reversal. Treat as a caution flag more than an entry trigger unless it\'s a harami cross (doji-bodied).', stop: 'Below the small candle\'s low.', src: 'Visually' },
    bearharami: { entry: 'A weaker signal than a shooting star or engulfing bar — momentum abating rather than reversing.', stop: 'Above the small candle\'s high.', src: 'Visually' },
    morningstar: { entry: 'Third candle must gap up and close beyond the middle of the first candle\'s body; most powerful near a support level.', stop: 'Below the star low.', src: 'Trading Bible, Zuckerman' },
    eveningstar: { entry: 'Mirror topping signal — third candle ideally gaps down from the middle small-bodied candle.', stop: 'Above the star high.', src: 'Trading Bible, Zuckerman' },
    threesoldiers: { entry: 'Three consecutive long green closes — strong reversal from a decline.', stop: 'Below the first soldier\'s low.', src: 'Zuckerman' },
    threecrows: { entry: 'Three consecutive long red closes — strong topping signal.', stop: 'Above the first crow\'s high.', src: 'Zuckerman' },
    doji: { entry: 'Indecision (open ≈ close). At the top of an uptrend = bearish warning; at the bottom of a decline = bullish warning; mid-trend = noise. Never trade alone.', stop: '—', src: 'Trading Bible, Zuckerman' },
    tweezerbottom: { entry: 'Bearish candle then a bullish candle closing back up near/above the first\'s open — most reliable near support.', stop: 'Below the tweezer lows.', src: 'Trading Bible' },
    tweezertop: { entry: 'Bullish candle then a bearish candle closing back down near the first\'s open — most reliable near resistance.', stop: 'Above the tweezer highs.', src: 'Trading Bible' },
    marubozubull: { entry: 'Full-control bullish session (near-zero wicks); continuation signal in an uptrend.', stop: 'Below the candle low.', src: 'Zuckerman' },
    marubozubear: { entry: 'Full-control bearish session (near-zero wicks); continuation signal in a downtrend.', stop: 'Above the candle high.', src: 'Zuckerman' },
  },

  candlestickFilters: [
    { rule: 'Volume gates every candlestick signal: low or even medium volume on the signal candle = no trade. Only a standout/outlier volume bar qualifies a pattern for action.', src: 'Visually' },
    { rule: 'Only trade engulfing/reversal patterns in reversal context (after an opposing trend) — the same pattern appearing mid-trend is continuation noise, not a signal, and the books explicitly say don\'t trade it.', src: 'Visually, Trading Bible' },
    { rule: 'Neck patterns (On Neck / In Neck / Thrusting): a downtrend candle followed by a recovery candle that fails to close above the first candle\'s 50% retracement is bearish continuation, not a bottom — the "constructive-looking" bounce is a trap. A move below the pattern\'s low confirms further weakness.', src: 'Visually' },
    { rule: 'A single doji only matters after a directional move; a plain (non-dragonfly/gravestone) doji mid-trend "does not signify anything."', src: 'Visually, Trading Bible, Zuckerman' },
    { rule: 'Never trade a candlestick signal in a sideways/no-volume market, or one that has failed repeatedly at this level recently.', src: 'Visually, Trading Bible' },
  ],

  /* Trading Bible's core repeated framework, applied throughout the engine. */
  trendLevelSignal: [
    { rule: 'Every setup follows Trend → Level → Signal: first read the higher-timeframe direction, then find the most important support/resistance or moving-average level, then wait for a candlestick signal to form there in line with the trend before entering.', src: 'Trading Bible' },
    { rule: 'Determine trend and key levels only on higher timeframes (4H/daily/weekly) — never judge market structure from a small timeframe.', src: 'Trading Bible' },
    { rule: 'A pattern alone is not tradeable. One or two confluence factors (trend, S/R, moving average, Fibonacci 50%/61.8%, trendline) combined with a clear candlestick signal is enough for a high-probability trade.', src: 'Trading Bible' },
    { rule: 'Always check the next higher timeframe before entering — a valid daily signal can fail outright into an unchecked weekly resistance level.', src: 'Trading Bible' },
    { rule: 'A market is trending only ~30% of the time; ranging and choppy conditions make up the rest. If a market is choppy, it is not worth trading.', src: 'Trading Bible' },
    { rule: 'Confirm a range only after at least 2 touches of support AND 2 touches of resistance; range boundaries are frequently overshot to trap traders before reversing.', src: 'Trading Bible' },
    { rule: 'Enter at the start of a fresh impulsive move (after a pullback completes at a level), not mid-pullback — entering during the retracement risks being stopped out by the move that follows.', src: 'Trading Bible' },
    { rule: 'Inside-bar false breakout (stop-hunt pattern): price breaks the mother candle\'s range then closes back inside it — a sign institutions ran the obvious stops before reversing. Fade the false breakout; never place your own stop exactly at that obvious level.', src: 'Trading Bible, Smart Money' },
    { rule: 'Always use a real stop-loss order on the platform, never a mental stop — psychology defeats mental stops every time.', src: 'Trading Bible, Zuckerman' },
    { rule: 'Risk no more than 2% of equity per trade; beginners should cap it at 1%. Never take a signal offering less than 2:1 reward:risk.', src: 'Trading Bible' },
  ],

  /* Rules used by the scoring engine, each with attribution (shown in "why"). */
  signals: {
    trendWithTide: { w: 'Trade with the trend: uptrend = higher highs + higher lows. Counter-trend trades must be short-duration only.', src: 'Zuckerman, Stewie' },
    ma200: { w: 'The 200-day MA is the strongest crowd-watched trend line; price above = bull regime, below = bear regime. The close relative to it is what counts.', src: 'Zuckerman' },
    maStack: { w: 'Standard MA set: 200/100/50-day for the long-term trend, 10-20-day for short-term. Longer MA = stronger level.', src: 'Zuckerman' },
    holyGrail: { w: 'Best long entry in an uptrend: first or second low-volume "smart pullback" to the 20-day EMA that holds. Do not buy the 3rd+ retest.', src: 'Stewie' },
    breakoutRetest: { w: 'Don\'t chase breakouts — buy the low-volume retest of the breakout area that holds and makes a higher low.', src: 'Stewie' },
    volumeConfirm: { w: 'Rising volume must confirm the move: breakouts need a volume spike; healthy pullbacks show declining volume; heavy-volume down days near lows = distribution.', src: 'Zuckerman, Stewie' },
    srLevels: { w: 'Support/resistance is the single most valuable tool. Broken resistance becomes support (and vice versa) — judged by closes, not wicks.', src: 'Zuckerman' },
    repeatTests: { w: 'A support tested many times in a short span tends to eventually break.', src: 'Stewie' },
    extended: { w: 'A candle closing far outside the upper Bollinger Band with extreme RSI = parabolic/overdone; do not chase, expect a fade.', src: 'Stewie' },
    rsiDivergence: { w: 'Price retesting a low while RSI/MACD make higher lows is one of the strongest buy signals; the mirror divergence at highs is a sell signal.', src: 'Stewie' },
    roundNumbers: { w: 'Round numbers act as magnets and barriers — stops and limits cluster at them.', src: 'Zuckerman, Stewie' },
    liquidity: { w: 'Only trade liquid assets with high real volume — otherwise you\'re throwing money away on spreads and slippage.', src: 'Zuckerman' },
    chop: { w: 'In choppy tape most breakouts fail. Trade pullbacks-to-support at confluences instead, and book gains fast.', src: 'Stewie' },
    earningsGap: { w: 'A big gap on huge volume that closes at the extreme of the day marks institutions positioning — follow that footprint, never fight it.', src: 'Stewie' },
  },

  cryptoRisks: [
    { risk: 'Extreme volatility: crypto can be up 30% one day and down 50% the next; boom/bust cycles are the norm.', src: 'Zuckerman' },
    { risk: 'Altcoins are highly correlated to Bitcoin — BTC\'s direction caps every alt trade. Check BTC before any alt entry.', src: 'Zuckerman' },
    { risk: 'Whale games are routine: stop-hunting at obvious levels, spoofed order-book walls, wash-traded fake volume (>90% of reported volume is non-economic).', src: 'Zuckerman' },
    { risk: 'Pump-and-dump signatures: low market cap (outside top ~100-200), listed on few exchanges, sudden unexplained volume before a price rise. If you can\'t explain the pump, don\'t buy it.', src: 'Zuckerman' },
    { risk: 'Exchange/custody risk: coins on an exchange are an IOU (Mt. Gox, QuadrigaCX). Don\'t park size on exchanges.', src: 'Zuckerman' },
    { risk: '24/7 market: moves happen while you sleep — resting stop orders are mandatory, not optional.', src: 'Zuckerman' },
    { risk: 'Leverage above ~10x is gambling that feeds exchange liquidation engines; regulated venues use ~2-3x for a reason.', src: 'Zuckerman' },
    { risk: 'Tokenomics: single wallets holding >10% of supply, upcoming vesting unlocks, or unlimited issuance are exit-liquidity traps.', src: 'Zuckerman' },
  ],

  coinSelection: [
    { rule: 'Prefer high-liquidity, large-cap coins; low caps have 50x upside but can fall through the floor.', src: 'Zuckerman, Aries' },
    { rule: 'Avoid coins pumping on volume you can\'t explain, or listed on only one exchange.', src: 'Zuckerman' },
    { rule: 'Sanity-check price targets against implied market cap.', src: 'Zuckerman' },
  ],

  smartMoney: [
    { rule: 'Institutional candle (order block): the last down candle before an explosive move up is where institutions were buying; price returning into its body is the high-probability entry. If price traverses the entire body, the setup is invalid — cut it.', src: 'Smart Money' },
    { rule: 'Liquidity runs: price gravitates to the stops resting below equal lows / above equal highs. Whales sweep the level, trigger the stops, then reverse. Never place your stop exactly where the crowd\'s stops sit.', src: 'Smart Money, Zuckerman' },
    { rule: 'A sweep below a prior low that closes back above it is a stop-run reversal (2B/bear trap) — one of the strongest long signals; stop goes just under the sweep low.', src: 'Smart Money, Stewie' },
    { rule: 'Buy cheap, not expensive: only buy pullbacks deeper than 50% of the last impulse (61.8–78.6% is the sweet spot); above the 50% line price is still "expensive". Beyond 78.6% the move may be failing.', src: 'Smart Money' },
    { rule: 'Retail-obvious patterns (clean double bottoms, trendlines, obvious breakouts) are bait — equal highs/lows get run for stops before the real move.', src: 'Smart Money' },
    { rule: 'Minimum reward:risk 1:3 for smart-money setups; capital preservation before profit.', src: 'Smart Money' },
    { rule: 'Don\'t buy after an extended rally without a deep retracement; the departure from a level must be violent/explosive to prove institutional interest.', src: 'Smart Money' },
    { rule: 'Round/psychological levels (00, 20, 50, 80 figures) act as price magnets and reaction points — use as confluence for entries and targets.', src: 'Smart Money, Zuckerman' },
  ],

  marketRegime: [
    { rule: 'Check one timeframe above your trading chart: day trade 5-15m → check hourly; swing daily → check weekly. Uptrend intact while pullbacks hold above the last swing low.', src: 'Zuckerman' },
    { rule: 'Bear tape tells: orderly relentless selling, weak low-volume bounces that fail within a day, strength in the morning sold hard into the close, distribution days piling up.', src: 'Stewie' },
    { rule: 'Trade the tide: when the index/BTC is trending down, long setups in individual names fail more — reduce size or sit out.', src: 'Stewie, Zuckerman' },
  ],

  swingRules: [
    { rule: 'Daily chart is the shortest timeframe for swing trades — micro timeframes generate false triggers. Hold days to weeks, a couple of months max.', src: 'Ray Bears' },
    { rule: 'A support/resistance level is only valid once price has touched it at least twice. Buy near support, take profit before resistance — don\'t wait for the exact touch.', src: 'Ray Bears' },
    { rule: 'Only trade stocks with a clear trend; skip sideways, indecisive charts entirely.', src: 'Ray Bears' },
    { rule: 'Fix stop AND target at order entry — never after. Beginners keep both fixed; check the trade daily to move the stop to breakeven once it works.', src: 'Ray Bears' },
    { rule: 'Split entries into thirds with staged take-profits; when the first third pays, move the remaining stops to breakeven.', src: 'Ray Bears' },
    { rule: 'Stock selection: high liquidity, moderate volatility (avoid >2% daily whip), good fundamentals, heavy institutional ownership, stocks that track their sector.', src: 'Ray Bears' },
    { rule: 'No penny stocks; avoid stocks destabilized by fresh news, earnings or litigation.', src: 'Ray Bears' },
    { rule: 'Volatility stop alternative: highest high since entry minus 3× ATR (Turtle-style trailing stop).', src: 'Correra' },
    { rule: 'Options: exit a losing long option at 50% of premium lost; take profits at 75%; never trade a strategy you don\'t fully understand. Spreads over naked positions.', src: 'Bear, Ray Bears' },
    { rule: 'The Ambush principle: a candle\'s close is what makes a move "real" — a break of the prior bar\'s extreme that closes back inside the range is a trap, not a breakout.', src: 'Ambush' },
  ],

  /* Bulkowski, "Encyclopedia of Chart Patterns" 3rd ed. — real backtested
     statistics (failure rate = % that don't move even 5% past breakout;
     avgMove = average rise/decline for successful breaks; rank = performance
     rank out of ~36-39 patterns, 1=best). Bull-market numbers used as the
     default (larger sample); used to weight chart-pattern scoring instead of
     arbitrary points. NOTE: source PDF is a Russian translation with some
     OCR table drift — cross-checked against its "Summary of Statistics"
     chapter where that occurred. */
  bulkowskiStats: {
    hstop: { failureRate: 0.19, avgMove: 0.161, rank: 9, of: 36, note: 'Confirmed only once price closes below the neckline. Bear-market H&S tops fail only 5% of the time.' },
    hsbottom: { failureRate: 0.22, avgMove: 0.424, rank: 13, of: 39, note: 'Bear-market rallies off this pattern complete ~1.6x faster than bull-market ones.' },
    doubletop: { failureRate: 0.25, avgMove: 0.152, rank: 19, of: 36, note: 'One of the higher failure rates in the book. 60% of UNCONFIRMED double tops keep rising instead of reversing — confirmation is essential.' },
    doublebottom: { failureRate: 0.394, avgMove: 0.394, rank: 26, of: 39, note: 'Unusually high failure rate — near worst in the book. 48% of unconfirmed double bottoms keep falling.' },
    tripletop: { failureRate: 0.14, avgMove: 0.144, rank: 24, of: 36, note: 'Bulkowski: "trade triple tops only in bear markets" — bear-market failure rate is much lower.' },
    triplebottom: { failureRate: 0.13, avgMove: 0.456, rank: 12, of: 39, note: 'Solidly good rank. Measured-move target hit rate 55-74%.' },
    asctriangle: { failureRate: 0.17, avgMove: 0.43, rank: 16, of: 39, note: 'Bulkowski: "used to be one of my favorites, but no longer." Volume should decline into the apex; breakouts past 75% of the way to the apex lose reliability.' },
    desctriangle: { failureRate: 0.38, avgMove: 0.378, rank: 33, of: 39, note: 'Poor on up-breakouts in bull markets; best used for down-breakouts in bear markets (rank 7/20 there).' },
    symtriangle: { failureRate: 0.34, avgMove: 0.342, rank: 36, of: 39, note: 'Bulkowski\'s own verdict: "awful... as unenthusiastic as people not wearing masks." Near-worst performer despite being textbook-famous.' },
    rectangle: { failureRate: 0.151, avgMove: 0.476, rank: 8, of: 39, note: 'One of the 10 best average-rise performers in the book. Down-breakouts in bear markets fail only 6% of the time.' },
    bullflag: { failureRate: 0.09, avgMove: 0.15, rank: 20, of: 39, note: 'Low breakeven-failure rate, but the classic "half-mast" measured-move theory is debunked — Bulkowski found flags actually appear ~55-57% of the way through a move, not at the midpoint.' },
    bearflag: { failureRate: 0.16, avgMove: -0.15, rank: 20, of: 20, note: 'Same low-failure profile as bull flags, mirrored.' },
    hightightflag: { failureRate: 0.15, avgMove: 0.39, rank: 30, of: 39, note: 'Used to be Bulkowski\'s favorite pattern in the 2nd edition; dropped to near-bottom rank in the 3rd. Still has one of the highest measured-move hit rates in the book (82% bull).' },
    pennant: { failureRate: 0.08, avgMove: 0.32, rank: 15, of: 39, note: 'Very low breakeven-failure rate, but the measured-move ("half-mast") hit rate is weak (only 32-46%) — trust the direction, not the specific target.' },
    risingwedge: { failureRate: 0.38, avgMove: -0.091, rank: 36, of: 36, note: 'Bulkowski\'s own verdict: "lousy performers... this is unsettling." Down-breakouts from rising wedges rank dead last (36/36) of every pattern in the book for that direction.' },
    fallingwedge: { failureRate: 0.26, avgMove: 0.383, rank: 31, of: 39, note: 'Best breakouts occur 50-80% of the way up the wedge\'s height. Halving the wedge height before projecting a target improves the hit rate from 29% to 47%.' },
  },

  /* Position-sizing models beyond the flat 1%-risk default (Van Tharp,
     "Definitive Guide to Position Sizing"; Ralph Vince, "The Mathematics of
     Money Management"). Percent-risk and percent-volatility are implemented
     in engine.js; the rest are reference material — Tharp himself is
     lukewarm-to-negative on Kelly/Optimal-f for real trading (see notes). */
  positionSizingModels: [
    { rule: 'Percent Risk (the default): shares = (Equity × Risk%) / (Entry − Stop). Matches what this app already implements.', src: 'Van Tharp' },
    { rule: 'Percent Volatility: size by ATR instead of stop distance — shares = (Equity × VolatilityRisk%) / (ATR × dollarPerPoint). Equalizes $-swings across instruments regardless of where the stop sits.', src: 'Van Tharp' },
    { rule: 'SQN (System Quality Number) = (mean R-multiple / stdev R-multiple) × √(trades/year). Use it to gate how much total "portfolio heat" (sum of all open-position risk) is safe: SQN<1.3 → ≤1% heat; 1.7-2.5 → 4-8%; 3.0-4.0 → 15-20%; >5.0 → up to 25%.', src: 'Van Tharp' },
    { rule: 'Never use Kelly Criterion or Optimal f directly on real trade data — both assume a two-outcome (Bernoulli) payoff structure. Real trade P&L distributions violate this, and both formulas can imply 40-80%+ probability of ruin when applied naively. Tharp: simulate your own R-multiple distribution and pick a risk% against a defined ruin threshold instead.', src: 'Van Tharp, Ralph Vince' },
    { rule: 'Optimal f (if used at all) always implies a historical drawdown of AT LEAST f% of the account — "the better the system, the higher the drawdown." Trading at half of calculated optimal-f roughly halves the drawdown floor while only modestly slowing compounding.', src: 'Ralph Vince' },
    { rule: 'Small accounts (<$25-50k) should size well below the textbook number — cap risk at 0.5% regardless of what a quality metric like SQN would otherwise allow, until a live track record exists.', src: 'Van Tharp' },
    { rule: 'Never widen size after a loss (martingale-style); every "increase size to recover losses" model is explicitly identified as a ruin mechanism, not a recovery one.', src: 'Van Tharp' },
  ],

  /* Wyckoff / volume-price analysis — extends the smart-money layer with a
     volume-context test the original liquidity-sweep detector didn't have:
     a real spring/upthrust shows LOW volume on the breach, not high. */
  wyckoff: [
    { rule: 'A liquidity sweep is only a valid Wyckoff "spring" (not a genuine breakdown) if it happens late in an already-matured trading range AND the breach bar\'s volume is equal to or LOWER than the range\'s earlier tests — high/expanding volume on the breach means it\'s probably a real move, not a shakeout.', src: 'Wyckoff (Villahermosa)' },
    { rule: 'Don\'t enter on the spring/upthrust bar itself. Wait for (a) reclaim of the range boundary, then (b) either a Sign-of-Strength/Weakness break of internal structure, or (c) a low-volume pullback test (Last Point of Support/Supply) — that test is the actual low-risk entry.', src: 'Wyckoff (Villahermosa)' },
    { rule: 'Sign of Strength / Sign of Weakness: a wide-range bar closing near its high (SOS) or low (SOW) on distinctly increased volume, breaking internal range structure — the trend-initiation signal.', src: 'Wyckoff (Villahermosa)' },
    { rule: '"Effort vs. result": compare a bar\'s volume ("effort") to its price displacement ("result"). High volume with little price progress = absorption (hidden buying/selling, reversal warning). Low volume with a large price move = an unreliable, low-conviction move.', src: 'Coulling, Wyckoff' },
    { rule: 'No-demand bar: a narrow up-candle on below-average volume in an uptrend or at resistance — buyers aren\'t committing, an exhaustion warning. No-supply bar is the mirror at support in a downtrend.', src: 'Anna Coulling' },
    { rule: 'A test of a support/resistance level on markedly LOWER volume than the level\'s original formation = the level has absorbed selling/buying and is likely to hold. A test on equal or higher volume = the level is likely to give way.', src: 'Anna Coulling' },
    { rule: 'Volume during pattern formation should be judged relative to a rolling average, never against a fixed threshold — "rubber bands, not rods of steel."', src: 'Anna Coulling' },
  ],

  /* Murphy's rules for combining indicators without contradicting each other
     — directly addresses a real gap: the old engine scored trend and
     mean-reversion signals identically regardless of whether the market was
     actually trending. */
  confluenceRules: [
    { rule: 'ADX above ~25 and rising = trending regime — trust moving-average/breakout signals, discount oscillator overbought/oversold readings (they\'ll flag "overbought" prematurely in a strong trend). ADX below ~20 and falling = ranging regime — trust oscillators (RSI/Stochastics), discount trend-following signals, which whipsaw badly here. Markets trend only ~30% of the time (Wilder\'s own estimate).', src: 'Murphy (Wilder\'s ADX)' },
    { rule: 'RSI thresholds shift with regime: in a strong uptrend the effective overbought line moves to 80 (not 70); in a strong downtrend the effective oversold line moves to 20 (not 30). Using flat 70/30 in a strong trend causes early, wrong exits.', src: 'Murphy' },
    { rule: 'Use the weekly chart to set direction; only take a daily signal that agrees with it. A daily buy signal against the weekly trend is lower-probability, not a free pass.', src: 'Murphy' },
    { rule: 'The more of price, volume, breadth (advance-decline), and multiple timeframes that agree, the higher the confidence — no single indicator should be trusted in isolation.', src: 'Murphy' },
  ],

  /* Trading psychology — Douglas's framework is more rigorous than a
     discipline checklist; Market Wizards is real cross-trader consensus. */
  psychologyDeep: {
    fiveFundamentalTruths: [
      'Anything can happen.',
      'You don\'t need to know what is going to happen next in order to make money.',
      'There is a random distribution between wins and losses for any given set of variables that define an edge.',
      'An edge is nothing more than an indication of a higher probability of one thing happening over another.',
      'Every moment in the market is unique.',
    ],
    sevenPrinciplesOfConsistency: [
      'I objectively identify my edges.',
      'I predefine the risk of every trade.',
      'I completely accept the risk or I am willing to let go of the trade.',
      'I act on my edges without reservation or hesitation.',
      'I pay myself as the market makes money available to me.',
      'I continually monitor my susceptibility for making errors.',
      'I understand the absolute necessity of these principles and never violate them.',
    ],
    src: 'Mark Douglas, Trading in the Zone',
  },
  marketWizardsConsensus: [
    { rule: '"Cut your losses short and let your profits run" — the single most-repeated rule across every interviewed trader, and the hardest one to actually follow.', src: 'Market Wizards (Schwager), synthesized' },
    { rule: 'Never risk more than 1% of equity on a single trade; know your predetermined exit before entering, not after.', src: 'Larry Hite, Bruce Kovner — Market Wizards' },
    { rule: '"The first rule of trading is don\'t get caught in a situation where you can lose a great deal of money for reasons you don\'t understand."', src: 'Bruce Kovner — Market Wizards' },
    { rule: 'Decrease size when trading poorly, increase size when trading well. Never average down into a loser.', src: 'Paul Tudor Jones — Market Wizards' },
    { rule: '"My biggest losses have always followed my biggest profits" — overconfidence after a hot streak is a recurring blow-up pattern; step back after a strong run.', src: 'Marty Schwartz — Market Wizards' },
    { rule: 'Ego and the need to be right are repeatedly named as the primary destroyer of good traders — the day you think you\'re great is the day you\'re finished.', src: 'Market Wizards, synthesized' },
  ],
  /* Note: the classic Livermore maxims below are well-established general
     knowledge, NOT verified against a full-text extraction — the copy of
     "Reminiscences of a Stock Operator" in this library turned out to be a
     15-page preview that cuts off before Chapter I starts. */
  livermoreMaxims: [
    { rule: '"The big money is not in the buying and the selling, but in the waiting" — patience holding a correctly-timed position is where the money is made, not frequent trading.', src: 'Livermore maxim (general knowledge, unverified page source)' },
    { rule: '"Don\'t fight the tape." The trend, not personal opinion, is the only thing that matters.', src: 'Livermore maxim (general knowledge, unverified page source)' },
    { rule: 'Pyramid into winning positions; never average down into a losing one.', src: 'Livermore maxim (general knowledge, unverified page source)' },
    { rule: 'Wait for a decisive pivotal point (a clear breakout/confirmation) rather than guessing tops and bottoms.', src: 'Livermore maxim (general knowledge, unverified page source)' },
  ],

  /* Honest self-critique of this app's own scoring engine, from a book on
     validating systematic/rules-based trading systems. */
  engineSelfCritique: [
    { rule: 'A composite scorer that adds points from many signals (candlesticks + indicators + smart-money concepts, exactly what this engine does) is a classic curve-fitting risk without out-of-sample or walk-forward testing — this app has not been backtested, and its scores should be read as structured, cited heuristics, not a validated system.', src: 'Howard Bandy, Quantitative Trading Systems' },
    { rule: 'A strategy needs a genuinely large number of independent out-of-sample trades before its results mean anything; in-sample performance (including "does this rule sound right") is close to meaningless on its own.', src: 'Howard Bandy' },
    { rule: 'Expectancy must be positive before any position-sizing scheme can help — sizing cannot turn a negative-expectancy system profitable.', src: 'Howard Bandy' },
    { rule: 'Counterintuitive finding worth weighing: in his own tests, bolting a tight stop-loss onto a system reduced performance versus letting the system\'s own exit logic run — stops are a backstop, not the primary exit.', src: 'Howard Bandy' },
  ],

  disclaimer: 'TradeSight is an educational decision-support tool built from a private trading-book library. It is not financial advice. Markets can invalidate any technical setup; never risk money you cannot afford to lose.',
};
