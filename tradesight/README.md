# TradeSight

A book-grounded trading analysis and suggestion tool. Enter any stock or crypto
symbol and get an explainable verdict — safe to trade or not, entry zone, stop
loss, staged exit targets, and every risk factor — all derived from rules
extracted from the trading-book library in the parent directory, plus a market
scanner that automatically ranks the best setups across ~45 major stocks, ETFs
and cryptos.

See `../PROMPT.md` for the full specification this app implements.

## Run it

```
node server.js
```

Then open **http://localhost:8742**.

No install step, no API keys, no build — it's a zero-dependency Node.js server
(uses the built-in `fetch`, Node 18+) plus a vanilla-JS frontend with a
hand-rolled canvas candlestick chart.

## What it does

- **Analyze** — search any ticker (stocks, ETFs) or crypto (`BTC-USD`, `ETH-USD`,
  or just `BTC`/`ETH`/etc.). Get a 0–100 setup-quality score, a verdict, an
  entry zone, a stop loss with the book rule behind it, three staged profit
  targets with R-multiples, and a full risk-factor breakdown.
- **Market Scanner** — one click analyzes the whole universe and ranks it by
  setup quality, so you can see the best (and worst) assets to trade right now.
- **Watchlist** — persisted locally, refreshes scores on demand.
- **Journal** — log a trade plan from any analysis, track outcomes in R-multiples.
- **Playbook** — every rule in the engine, browsable, with its book source.

## How the engine works

1. `server.js` proxies Yahoo Finance (OHLCV + symbol search) and CoinGecko
   (crypto market data), with in-memory caching, so the browser never deals
   with CORS or rate limits.
2. `indicators.js` computes SMA/EMA/RSI/MACD/Bollinger/ATR/OBV, swing points,
   support/resistance clustering, and market structure (trend, break of
   structure, premium/discount) purely from OHLCV.
3. `patterns.js` detects candlestick patterns algorithmically, validated by
   the books' context rules (right trend location, confirmation candle).
4. `knowledge.js` is the machine-readable rule base extracted from the books,
   with every rule attributed to its source.
5. `engine.js` combines all of the above into an explainable score: every
   point added or subtracted carries a plain-English reason and a book
   citation. Hard red flags (parabolic extension, sub-2:1 reward:risk, thin
   liquidity) cap the score regardless of everything else — risk comes first.

## Disclaimer

This is an educational decision-support tool, not financial advice. See the
in-app disclaimer and `knowledge.js`.
