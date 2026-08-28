# Options as Volatility/Sentiment Signals — Lawrence McMillan & Sheldon Natenberg

Extracted narrowly: only the concepts that use options-market data as a directional/sentiment signal for the *underlying* stock, not options strategy construction (this project doesn't trade options directly).

## Implied volatility rank / percentile

Natenberg develops this via **volatility cones** — historical-volatility percentile bands (10th/25th/50th/75th/90th) plotted against time to expiration; the bands narrow further out in time (volatility is mean-reverting). Practical rule: if historical vol is above its own mean and declining, and implied vol is above historical and also declining, that's a strong "sell volatility" signal; if both are converging toward the mean, favor neutral strategies. McMillan adds a key caveat: percentile alone is misleading without knowing the **width** of the historical range — the same 40% IV reading can be "mundane" (in a 39–45% historical range) or genuinely cheap (in a 35–90% range). IV's usable range compresses for longer-dated options.

## Put/call ratio

`Ratio = total put volume / total call volume` (or on open interest, or dollar-volume), usually smoothed as a 10/20/50-day moving average. Interpretation is contrarian: a high ratio (heavy put buying) is bullish, a low ratio bearish — "the majority of traders are wrong at major turning points." Baselines: equity ratio normally averages ~0.50; index ratio runs structurally higher (institutions buy index puts as portfolio hedges regardless of view) — equity and index ratios should never be compared directly. Key practical rule: don't trade off the absolute level — wait for the ratio's moving average to make a local extreme and turn, since fixed thresholds fail during sustained trends.

## Volatility skew

Measured by plotting implied volatility against strike price for one expiration; a "smile" or skew shape (IV rising away from the at-the-money strike) reflects the market pricing fatter tail risk than a lognormal model assumes — real return distributions show negative-to-slight skew and consistently positive kurtosis (fatter tails, higher peak) versus a true normal curve. A steepening skew means the market is pricing more tail risk. Post-crash, index/equity puts can become persistently expensive relative to calls at the same distance from the underlying — a directional skew read as a fear/hedging-demand gauge, distinct from the smile shape.

## Implied vs. realized volatility

Practitioners blend historical-volatility windows into a forecast, weighting most heavily whichever window (30/60/120/250-day) is closest to the option's actual time-to-expiration, then blend in the market's implied vol at roughly 25–75% weight depending on confidence in the historical estimate. Empirically, implied volatility fluctuates *less* than realized volatility — it "under-reacts" to spikes and drops in realized vol. McMillan frames the tradeable signal as a difference line: (implied vol) minus (subsequent realized vol) — positive means options were overpriced (favor selling volatility), negative means underpriced (favor owning it). His stated conclusion: implied volatility is a poor predictor of subsequent realized volatility in general, with index options (OEX) being an unusual, consistent exception that runs persistently overpriced.

## Volatility regime diagnostic (McMillan)

Before treating extreme IV as a simple mean-reversion trade, ask: is the move accompanied by rising volume and a rising stock price (likely an informed move brewing — don't sell volatility into it), or expensive options with no volume/price confirmation (likely a genuine mispricing, safer to sell), or cheap options following a real corporate change like a merger (the cheapness is often justified, not a buying opportunity), or expensive options during a broad, publicly-known market crash (an explained extreme, sellable with more confidence once the news is out).

## Expiration effects

Gamma on an at-the-money option rises sharply as expiration nears (Natenberg's example: roughly 17x higher one day before expiry versus nine months out), meaning small underlying moves cause outsized swings in dealer delta-hedging needs right before expiration — the mechanical root of why hedging flows intensify near expiry, though neither source frames this as the modern "gamma exposure pins the stock" concept explicitly.

Source files (deleted after extraction): "Options as a Strategic Investment" (Lawrence McMillan); "Option Volatility & Pricing" (Sheldon Natenberg) — PDFs.
