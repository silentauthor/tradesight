# Quantitative Trading Systems — Howard B. Bandy

A book on designing, testing, and statistically validating rules-based trading systems.

## Backtesting rules

In-sample data (used to search/optimize) and out-of-sample data (used to validate, ideally "run once") must be kept strictly separate — repeatedly peeking at "out-of-sample" results and adjusting the model in response converts that data into in-sample data and destroys its validation value. Out-of-sample periods must come chronologically *after* in-sample periods, since that's how the system will actually be used. In-sample performance is "always good" (that's what optimization guarantees) and is close to meaningless on its own, regardless of how large the in-sample trade count is. **Curve-fitting risk scales with the number of free parameters** relative to the data available — a system with many tunable signals tested against a modest amount of history can have essentially no real degrees of freedom left, even with a seemingly large trade count. Prefer parameter combinations that sit on a smooth plateau of good results over an isolated "lonely peak," since an isolated peak is a classic curve-fit signature. **Walk-forward testing** — optimize on an in-sample block, freeze the parameters, test on the following out-of-sample block, then roll forward and repeat, concatenating all out-of-sample results — is presented as the most rigorous accessible validation method for an individual trader. Adding special-case rules to handle rare historical events (e.g. a specific crash) is discouraged as a curve-fitting trap.

## Survivorship bias

Testing only against an index's *current* membership list inflates results significantly, because delisted/failed/acquired constituents are silently excluded. A concrete NASDAQ-100 example found stocks that dropped out of the index had markedly worse risk-adjusted returns than the stocks that stayed in or were added later — and even that comparison understates the bias, since many delisted/bankrupt names have no usable price history left at all. Random sampling doesn't fully solve this; only point-in-time index membership and price data do.

## Statistical validity / sample size

The common "need ~30 trades" convention comes from statistical distributions converging toward normal behavior above roughly that sample size — but this only applies to genuinely out-of-sample trade counts, not in-sample ones. A two-sample z-test can compare a candidate system's mean return against a random-entry baseline of the same trade frequency and holding period; typical trading-return standard deviations are large enough relative to the mean that many "profitable-looking" systems can't be statistically distinguished from a zero-expectancy baseline even with a reasonable trade count.

## Performance metrics

**Expectancy** = (win% × average win) + (loss% × average loss); it must be positive — no position-sizing scheme can turn a negative-expectancy system profitable. Other metrics discussed: CAR/MaxDD (compound annual return over max drawdown), the K-ratio and risk-reward ratio (based on the linear-regression slope of the equity curve), Sharpe and Sortino ratios, the Ulcer Index (penalizes depth and duration of drawdowns), and Ralph Vince's Pessimistic Return Ratio (deliberately penalizes small trade samples). No single metric is prescribed as universally correct — the book's position is that a trader should choose an objective function deliberately, before searching for systems, rather than after.

## Sizing for systematic strategies

Risk-per-trade is commonly set at 1–2% of equity, with the stop distance often expressed as a multiple of ATR (e.g. 2×ATR(20)) so position size adapts to current volatility, rather than a fixed dollar/percent stop. A combined sizing rule taking the smaller of a capital-based cap and a risk-based cap (e.g. max 20% of equity in one position AND max 2% risk) is a common pattern. A notable, counter-intuitive finding from the author's own testing: **adding a hard maximum-loss stop on top of a system's own exit logic reduced overall performance** in his tests — his recommendation is to let a system's own signal-based exits do most of the work and treat a hard stop as a rare backstop, not the primary exit.

## Strategy ideas (as signal inspiration, not recommendations)

Simple moving-average crossovers can behave as *anti-trend* systems once optimized on real data, contrary to conventional "buy above the 200-day MA" wisdom. Donchian/Turtle-style breakout systems (e.g. buy a 20-day high, sell a 10-day low, with an ATR-based stop) worked historically on futures/commodities but degraded sharply once the approach became widely known — a general caution that discovered inefficiencies tend to get arbitraged away over time. A useful general technique: any well-behaved price series can be converted into a mean-reversion oscillator by subtracting a long moving average from price and smoothing the result (a "detrended price oscillator" construction). An ADX-based regime filter (only take mean-reversion signals when ADX is below a threshold, indicating no strong trend) is highlighted as a genuinely transferable idea for gating signals by market regime.

## Pitfalls

Every profitable, publicly-known trading rule eventually erodes as more people trade against the same inefficiency. High-dimensional, many-parameter composite systems (many signals each contributing a score — a pattern this book flags directly) are exactly the kind of model most exposed to curve-fitting without disciplined out-of-sample testing. Fundamental/discretionary data (revisions, one-time items) is called close to unusable for systematic backtesting. Nearly any long-only equity system looks good across a multi-decade bull market — short-side validity is much harder to establish and bear-market data is scarcer and lower quality.

Source file (deleted after extraction): "Quantitative Trading Systems: Practical Methods For Design, Testing, and Validation" (Howard B. Bandy), PDF.
