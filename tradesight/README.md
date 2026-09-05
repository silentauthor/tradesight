# TradeSight

A book-grounded trading analysis and suggestion tool for **Solana tokens**. Enter
a token name, symbol, or mint address and get an explainable verdict — safe to
trade or not, entry zone, stop loss, staged exit targets, and every risk factor —
all derived from rules extracted from the trading-book library in the parent
directory, plus a market scanner that ranks the best setups across the
most-traded Solana tokens.

See `../PROMPT.md` for the full specification this app implements.

## Run it

TradeSight reads Solana market data from the [Birdeye Data API](https://public-api.birdeye.so),
which needs an API key (free tier is fine — generate one under **Security → API keys**
in the Birdeye dashboard).

```
# put the key in tradesight/.env  (gitignored)
echo 'BIRDEYE_API_KEY=your_key_here' > .env
node --env-file=.env server.js
```

Or pass it inline: `BIRDEYE_API_KEY=your_key_here node server.js`

Then open **http://localhost:8742**.

No install step, no build — it's a single-file Node.js server (built-in `fetch`,
Node 18+; `--env-file` needs Node 20.6+) plus a vanilla-JS frontend with a
hand-rolled canvas candlestick chart.

## What it does

- **Swing / Intraday toggle** (header) — picks the horizon the engine runs on,
  and applies to Analyze, the Market Scanner and the Watchlist. **Swing** uses
  daily candles with a weekly higher-timeframe check (hold days to weeks).
  **Intraday** uses 15-minute candles with an hourly higher-timeframe check, adds
  a "flatten by end of session" exit rule, and tightens the volatility/extension
  thresholds — for trades held minutes to hours. The rule base and its book
  attributions are identical between the two; only the candle feed, a few
  thresholds and the labels change (Zuckerman: always confirm one timeframe up —
  day trade → hourly, swing → weekly). The choice is remembered locally.
- **Analyze** — search a Solana token by name/symbol (`SOL`, `JUP`, `BONK`,
  `WIF`, …) or paste its mint address. Get a 0–100 setup-quality score, a
  verdict, an entry zone, a stop loss with the book rule behind it, three staged
  profit targets with R-multiples, and a full risk-factor breakdown.
- **Market Scanner** — one click pulls the most-traded Solana tokens (junk,
  stablecoins and SOL liquid-staking tokens filtered out), analyzes each with the
  full engine on the selected horizon, and ranks them by setup quality.
- **Watchlist** — persisted locally (by mint address), refreshes scores on demand.
- **Journal** — log a trade plan from any analysis, track outcomes in R-multiples.
- **Playbook** — every rule in the engine, browsable, with its book source.

## How the engine works

1. `server.js` proxies the Birdeye Data API (OHLCV candles, token overview,
   token search, trending token list), with in-memory caching, so the browser
   never deals with CORS or rate limits. `src/index.js` is the same logic for
   Cloudflare Workers.
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
   on-chain liquidity) cap the score regardless of everything else — risk comes
   first. The market "tide" is read from SOL itself: Solana tokens are high-beta
   to SOL, so long setups are marked down when SOL is weak.

## Deploying to Cloudflare Workers

```
wrangler secret put BIRDEYE_API_KEY      # production secret
# for `wrangler dev`, put BIRDEYE_API_KEY=... in tradesight/.dev.vars
wrangler deploy
```

## Notes & limits

- **Solana only.** No stocks, ETFs, or non-Solana chains.
- Birdeye has no 52-week high/low field — the "Range H/L" shown is the
  high/low over the fetched candle window.
- Many tokens are younger than a year, so the weekly-timeframe check and the
  200-day-MA regime read are skipped or thin for newer tokens.
- **Intraday** pulls ~10 days of 15-minute candles and ~1 month of hourly
  candles from Birdeye. It needs at least 60 primary candles, so a token that
  has only traded for a few hours can't be analyzed intraday yet. Birdeye caps
  OHLCV responses at 5000 points per request.

## Disclaimer

This is an educational decision-support tool, not financial advice. See the
in-app disclaimer and `knowledge.js`.
