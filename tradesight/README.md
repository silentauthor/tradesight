# TradeSight

A book-grounded trading analysis and suggestion tool for **Solana tokens**. Enter
a token name, symbol, or mint address and get an explainable verdict — safe to
trade or not, entry zone, stop loss, staged exit targets, and every risk factor —
all derived from rules extracted from the trading-book library in the parent
directory, plus a market scanner that ranks the best setups across the
most-traded Solana tokens.

See `../PROMPT.md` for the full specification this app implements.

## Run it

```
# put your keys in tradesight/.env  (gitignored)
cat > .env <<'KEYS'
BIRDEYE_API_KEY=your_birdeye_key       # Solana source
DHAN_ACCESS_TOKEN=your_dhan_jwt        # optional — Indian NSE/BSE source
DHAN_CLIENT_ID=your_dhan_client_id     # optional
KEYS
node --env-file=.env server.js
```

Then open **http://localhost:8742**. No install step, no build — a Node.js
server (built-in `fetch`, Node 18+; `--env-file` needs Node 20.6+) plus a
vanilla-JS frontend with a hand-rolled canvas candlestick chart.

## Data source (Solana / Birdeye  vs  India / Dhan)

A header toggle switches which market TradeSight analyzes. It applies to Analyze,
the Market Scanner and the Watchlist, and is remembered locally.

| | **Solana · Birdeye** (default) | **India · Dhan** |
|---|---|---|
| Data | [Birdeye Data API](https://public-api.birdeye.so) — free-tier key under **Security → API keys** | [Dhan Data API v2](https://dhanhq.co/docs/v2/) — needs an active **Data plan** on your Dhan account |
| Env | `BIRDEYE_API_KEY` | `DHAN_ACCESS_TOKEN`, `DHAN_CLIENT_ID` |
| Universe | Solana SPL tokens, by mint address | NSE/BSE **cash equities**, by security ID (resolved from Dhan's scrip master) |
| Currency | USD | INR |
| Market tide | SOL | NIFTY 50 |
| Scanner | most-traded Solana tokens | NIFTY 50 constituents (Dhan has no "most active" feed) |

The engine, the rule base and their book attributions are identical for both —
only the feed, the currency and the tide anchor change. Under Dhan the app is
data-only: **no order APIs are called.** The Dhan source is Node-server only —
the Cloudflare Worker (`src/index.js`) is Birdeye-only.

The DhanHQ REST reference lives in `.claude/skills/dhanhq/` (vendored from
[dhan-oss/dhanhq-skills](https://github.com/dhan-oss/dhanhq-skills), MIT).

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
- **Analyze** — search an asset by name/symbol (or paste a Solana mint / a Dhan
  `SEG:securityId`). Get a 0–100 setup-quality score, a verdict, an entry zone, a
  stop loss with the book rule behind it, three staged profit targets with
  R-multiples, and a full risk-factor breakdown.
- **Market Scanner** — one click pulls the current source's universe (most-traded
  Solana tokens, or NIFTY 50 stocks), analyzes each with the full engine on the
  selected horizon, and ranks them by setup quality.
- **Watchlist** — persisted locally per asset id, filtered to the active data
  source, refreshes scores on demand.
- **Journal** — log a trade plan from any analysis, track outcomes in R-multiples.
- **Playbook** — every rule in the engine, browsable, with its book source.

## How the engine works

1. `server.js` proxies the market data (OHLCV candles, overview, search,
   universe list) with in-memory caching, so the browser never deals with CORS
   or rate limits. Birdeye (Solana) logic lives inline; Dhan (NSE/BSE) logic is
   in `dhan.js`. `src/index.js` is the Birdeye logic ported to Cloudflare
   Workers (no Dhan).
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
   first. The market "tide" is read from the source's beta anchor — SOL for
   Solana tokens, NIFTY 50 for NSE/BSE stocks — so long setups are marked down
   when the anchor is weak.

## Deploying to Cloudflare Workers

```
wrangler secret put BIRDEYE_API_KEY      # production secret
# for `wrangler dev`, put BIRDEYE_API_KEY=... in tradesight/.dev.vars
wrangler deploy
```

## Notes & limits

- Neither source exposes a 52-week high/low field — the "Range H/L" shown is the
  high/low over the fetched candle window.
- **Dhan source:** NSE/BSE cash equities + the NIFTY 50 index only (no F&O, no
  other indices as the analyzed asset). It has no native weekly feed, so the
  swing higher-timeframe series is resampled from the daily candles. Intraday
  history depth is capped by the API (roughly a few weeks of 15-minute bars).
  Needs an active Dhan Data plan; the scrip master (~200k rows) is downloaded
  once and cached for 12h.
- Many tokens are younger than a year, so the weekly-timeframe check and the
  200-day-MA regime read are skipped or thin for newer tokens.
- **Intraday** pulls ~10 days of 15-minute candles and ~1 month of hourly
  candles from Birdeye. It needs at least 60 primary candles, so a token that
  has only traded for a few hours can't be analyzed intraday yet. Birdeye caps
  OHLCV responses at 5000 points per request.

## Disclaimer

This is an educational decision-support tool, not financial advice. See the
in-app disclaimer and `knowledge.js`.
