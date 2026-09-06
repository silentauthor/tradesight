# TradeSight

A book-grounded trading analysis and suggestion tool. Pick an asset and get an
explainable verdict — a setup-quality score, entry zone, stop loss, staged exit
targets, and every risk factor — all derived from rules extracted from the
trading-book library in the parent directory, plus a market scanner that ranks
the best setups across a market's universe.

The engine originally targeted Solana tokens (see `../PROMPT.md` for that spec);
the current UI leads with two market workspaces, chosen by the URL hash:

- **`/#india`** (default) — NSE/BSE cash equities + the NIFTY 50 index, via the
  [Dhan Data API v2](https://dhanhq.co/docs/v2/). INR, NIFTY 50 tide, no order
  APIs are ever called.
- **`/#crypto`** — Jupiter Perps SOL / BTC / ETH long & short research. Live
  venue price and 24h volume from Jupiter's public `/v2/market-stats`; the
  technical candles are **Birdeye underlying spot**, explicitly labelled — not
  Jupiter execution/oracle history. No wallet is connected, no orders are placed.

A third source, `birdeye` (Solana SPL tokens by mint address), is still fully
implemented in `server.js` / `src/index.js` but is not currently wired to any UI
control.

## Run it

```
# put your keys in tradesight/.env  (gitignored)
cat > .env <<'KEYS'
BIRDEYE_API_KEY=your_birdeye_key       # required for /#crypto (Birdeye spot candles)
DHAN_ACCESS_TOKEN=your_dhan_jwt        # required for /#india
DHAN_CLIENT_ID=your_dhan_client_id     # required for /#india
KEYS
node --env-file=.env server.js
```

Then open **http://localhost:8742**. No install step, no build — a Node.js
server (built-in `fetch`, Node 18+; `--env-file` needs Node 20.6+) plus a
vanilla-JS frontend with a hand-rolled canvas candlestick chart.

The Dhan source needs an active **Data plan** on your account. The scrip-master
CSV that backs `/api/search?source=dhan` and `/api/tokenlist?source=dhan` is
public, so those two work without keys. The Cloudflare Worker (`src/index.js`) is
Birdeye-only — neither Dhan nor Jupiter is available there.

| | **India · Dhan** (`/#india`) | **Crypto · Jupiter Perps** (`/#crypto`) |
|---|---|---|
| Data | Dhan Data API v2 (`/charts/historical`, `/charts/intraday`) | `perps-api.jup.ag/v2/market-stats` + Birdeye spot OHLCV |
| Env | `DHAN_ACCESS_TOKEN`, `DHAN_CLIENT_ID` | `BIRDEYE_API_KEY` |
| Universe | NSE/BSE cash equities, by security ID (Dhan scrip master) | SOL, BTC, ETH |
| Currency | INR | USD |
| Market tide | NIFTY 50 | SOL |
| Scanner | NIFTY 50 constituents (Dhan has no "most active" feed) | the three markets |

The engine, the rule base and their book attributions are identical for both —
only the feed, the currency and the tide anchor change.

The DhanHQ REST reference lives in `.claude/skills/dhanhq/` (vendored from
[dhan-oss/dhanhq-skills](https://github.com/dhan-oss/dhanhq-skills), MIT). Jupiter
market ids and the endpoint are from the official
[Jupiter CLI PerpsClient](https://github.com/jup-ag/cli/blob/main/src/clients/PerpsClient.ts).

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
- **Market Scanner** — one click pulls the current source's universe (NIFTY 50
  stocks, or the three Jupiter Perps markets), analyzes each with the full engine
  on the selected horizon and direction, and ranks them by setup quality.
- **Watchlist** — persisted locally per asset id, filtered to the active data
  source, refreshes scores on demand.
- **Journal** — log a trade plan from any analysis, track outcomes in R-multiples.
- **Playbook** — every rule in the engine, browsable, with its book source.

## How the engine works

1. `server.js` proxies the market data (OHLCV candles, overview, search,
   universe list) with in-memory caching, so the browser never deals with CORS
   or rate limits, dispatching on `?source=`. Birdeye logic lives inline; Dhan
   (NSE/BSE) is in `dhan.js`; Jupiter Perps is in `jupiter.js`. `src/index.js` is
   the Birdeye logic ported to Cloudflare Workers (no Dhan, no Jupiter).
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

## Market workspaces and trade direction

The redesigned local UI has two linkable workspaces:

- `/#india`: NSE/BSE **Swing** and **Intraday** Buy/Long and Sell/Short research via Dhan. Swing uses daily candles with a resampled weekly higher timeframe; Intraday uses 15-minute candles with an hourly higher timeframe. Intraday Sell means opening a short, not disposal of an existing holding.
- `/#crypto`: **Jupiter Perps** SOL, BTC and ETH long/short research. Jupiter public `/v2/market-stats` supplies live venue price and 24h volume. Historical technical candles are **Birdeye underlying spot candles**, explicitly labeled; they are not Jupiter execution/oracle history. The existing Birdeye key remains required. No wallet is connected and no order requests are made.

Jupiter market identifiers and endpoint are taken from the official [Jupiter CLI PerpsClient](https://github.com/jup-ag/cli/blob/main/src/clients/PerpsClient.ts) and [Asset definitions](https://github.com/jup-ag/cli/blob/main/src/lib/Asset.ts).

Short research detects bearish EMA20 rallies and support breakdown/retests, places stops above entry, and targets structural support below entry. These numerical rules are app adaptations of the existing Stewie / Edwards & Magee notes, not validated returns. Sizing uses absolute stop distance and direction-aware net reward/risk. Perps sizing is a notional estimate; it does not calculate margin, borrow fees, liquidation or an executable quote. Verify those on Jupiter.

The scanner and watchlist use the selected direction; assessments are cached separately by market, horizon, direction and instrument. Journal records include direction. Supplementary evidence and pattern panels are collapsed initially.

Run direction regression checks: `node tests/directions.cjs`.

These two workspaces require the local Node server. The existing Cloudflare Worker remains the older Birdeye-only backend and is not a deployment target for this version.
