# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

1. `tradesight/` — a web app, **TradeSight**, whose entire rule engine was distilled from a private library of trading books (candlestick patterns, smart-money/technical analysis, options, swing trading, crypto trading, position sizing, trading psychology). `PROMPT.md` is the original executed spec (stocks + crypto via Yahoo/CoinGecko); the app was then narrowed to **Solana tokens via the Birdeye Data API**, and now also supports **Indian NSE/BSE equities via the Dhan Data API v2** as a switchable second source — see `tradesight/README.md` for current behavior and the section below.
2. `book-notes/` — structured reference notes (facts, rules, formulas, statistics) extracted from that book library, organized one file per book/topic with source attribution. The original PDF/EPUB/MOBI files have been deleted (they were sourced from piracy sites per their own filenames, and pirated PDFs are a real malware vector) — `book-notes/` is the durable record of what was learned from them. Start at `book-notes/README.md` for the index.

## Running TradeSight

```
cd tradesight
printf 'BIRDEYE_API_KEY=your_key\nDHAN_ACCESS_TOKEN=your_jwt\nDHAN_CLIENT_ID=your_id\n' > .env   # .env is gitignored; Dhan lines optional
node --env-file=.env server.js
```

Then open http://localhost:8742. No build step, no npm install (Node 18+ built-in `fetch`; `--env-file` needs Node 20.6+). The Birdeye (Solana) source needs `BIRDEYE_API_KEY` (https://public-api.birdeye.so); the Dhan (NSE/BSE) source needs `DHAN_ACCESS_TOKEN` + `DHAN_CLIENT_ID` and an active Dhan **Data plan**. Each source's `/api/*` calls fail with `{error:"… not set"}` if its keys are missing; the CSV-backed Dhan `/api/search` and `/api/tokenlist` work without keys (the scrip master is public).

**Two data sources.** A header radio (`#sourceToggle`, `state.source`, persisted to `localStorage.tsSource`) switches between `birdeye` (Solana SPL tokens by mint address, USD, SOL tide) and `dhan` (NSE/BSE cash equities + NIFTY 50 index, addressed as `"<EXCHANGE_SEGMENT>:<securityId>"` e.g. `NSE_EQ:2885`, INR, NIFTY 50 tide). `SOURCES` in `public/app.js` holds per-source config (`ccy`, `addrRe`, `known`, `tideAddress`, `tideLabel`, quick-syms, placeholder). Every `/api/*` call carries `&source=`. `isCrypto` follows the source, so under Dhan the crypto-risk panel is hidden and the "don't hold through earnings" exit rule is active. Order APIs are never called.

**Swing vs Intraday.** A second header radio (`#modeToggle`, `state.mode`, `localStorage.tsMode`) picks the horizon for Analyze, Scanner and Watchlist. `MODES` in `public/app.js` holds the candle intervals/ranges and the `tf` profile per mode: swing = daily primary + weekly higher-timeframe; intraday = 15m primary + 1h higher-timeframe. Under Dhan (no weekly feed) the swing HTF is `TA.resampleWeekly(daily)`. `server.js`/`src/index.js` gained short ranges (`3d`/`5d`/`10d`) and an `interval` param on `/api/batch`.

- `server.js` — proxies both sources with in-memory caching; serves `public/`. Birdeye endpoints: `/defi/v3/ohlcv`, `/defi/token_overview`, `/defi/v3/search`, `/defi/v3/token/list`. Each handler dispatches on `?source=`. `src/index.js` is the **Birdeye-only** port for Cloudflare Workers (`env.BIRDEYE_API_KEY` via `wrangler secret put`) — no Dhan.
- `dhan.js` — the Dhan (NSE/BSE) source (Node only). Proxies Dhan Data API v2 `POST /charts/historical` + `POST /charts/intraday`; resolves tickers/names via Dhan's public scrip-master CSV (cached 12h in memory). Exports `getChartDhan`, `searchDhan`, `niftyList` (the scanner universe = NIFTY 50 constituents; Dhan has no "most active" feed).
- `public/indicators.js` — pure technical-indicator math (SMA/EMA/RSI/MACD/Bollinger/ATR/OBV, swing points, S/R clustering, market structure).
- `public/patterns.js` — algorithmic candlestick pattern detection with context validation (trend location + confirmation).
- `public/knowledge.js` — the machine-readable rule base distilled from `book-notes/`, every rule attributed to its source book.
- `public/engine.js` — combines the above into an explainable score/verdict/trade-plan; hard red flags cap the score (risk-first). Market "tide" = `Engine.marketRegime(anchorSeries, label)` where the anchor is SOL or NIFTY 50. `Engine.assess(asset, primary, higher, marketCtx, tf)` takes a timeframe profile (`Engine.TF_SWING` / `Engine.TF_INTRADAY`) that swaps a few labels and volatility/extension thresholds; source-specific wording (currency symbol, "SOL high-beta" vs "the NIFTY 50 index / falling tide") branches on `asset.isCrypto` / `asset.currency`. No rule weights or attributions change between sources or modes.
- `public/app.js` + `index.html` + `chart.js` — vanilla-JS frontend, hand-rolled canvas candlestick chart, no framework.

There is no test suite or build/lint command — verify changes by running the server and checking these respond: `/api/chart?address=So11111111111111111111111111111111111111112`, `/api/chart?address=So111...112&range=10d&interval=15m`, `/api/search?q=bonk`, `/api/tokenlist`, `/api/batch?addresses=...`; and for Dhan: `/api/search?q=reliance&source=dhan`, `/api/tokenlist?source=dhan` (both work without keys), plus `/api/chart?address=NSE_EQ:2885&range=2y&interval=1d&source=dhan` (needs Dhan keys). Then load the page and toggle both Source and Swing/Intraday on Analyze and the Scanner.

## Working with book-notes and knowledge.js

- The original books are gone. `book-notes/*.md` is now the source of truth for what each book actually said — read the relevant file there before adding or changing anything in `knowledge.js`.
- When updating `knowledge.js`, only attribute a rule to a book that `book-notes/` actually documents — do not assume a book covers something it wasn't verified to contain.
- If a new book is added to the library later, extract its structured facts/rules into a new `book-notes/NN-title.md` file (summarized with attribution, not verbatim text) before deleting the source file, following the pattern of the existing notes.
