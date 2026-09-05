# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

1. `tradesight/` — a web app, **TradeSight**, whose entire rule engine was distilled from a private library of trading books (candlestick patterns, smart-money/technical analysis, options, swing trading, crypto trading, position sizing, trading psychology). `PROMPT.md` is the original executed spec (stocks + crypto via Yahoo/CoinGecko); the app has since been narrowed to **Solana tokens only, via the Birdeye Data API** — see `tradesight/README.md` for current behavior and the section below.
2. `book-notes/` — structured reference notes (facts, rules, formulas, statistics) extracted from that book library, organized one file per book/topic with source attribution. The original PDF/EPUB/MOBI files have been deleted (they were sourced from piracy sites per their own filenames, and pirated PDFs are a real malware vector) — `book-notes/` is the durable record of what was learned from them. Start at `book-notes/README.md` for the index.

## Running TradeSight

```
cd tradesight
echo 'BIRDEYE_API_KEY=your_key' > .env   # .env is gitignored
node --env-file=.env server.js
```

Then open http://localhost:8742. No build step, no npm install (Node 18+ built-in `fetch`; `--env-file` needs Node 20.6+). It **does** need a Birdeye API key — market data comes from the Birdeye Data API (https://public-api.birdeye.so), and every `/api/*` route fails with `{error:"BIRDEYE_API_KEY not set"}` without one.

**Solana tokens only.** Assets are identified by SPL **mint address** (base58), not ticker. The app resolves user-typed names/symbols to a mint via `/api/search`; a handful of majors (SOL, JUP, BONK, …) are hardcoded in `public/app.js` (`KNOWN`) to skip the round-trip.

**Swing vs Intraday.** A header radio (`#modeToggle`, `state.mode`, persisted to `localStorage.tsMode`) picks the horizon for Analyze, Scanner and Watchlist. `MODES` in `public/app.js` holds the candle intervals/ranges and the `tf` profile per mode: swing = daily primary + weekly higher-timeframe; intraday = 15m primary + 1h higher-timeframe. `server.js`/`src/index.js` gained short ranges (`3d`/`5d`/`10d`) and an `interval` param on `/api/batch`.

- `server.js` — proxies the Birdeye Data API with in-memory caching; serves `public/`. Endpoints used: `/defi/v3/ohlcv` (candles), `/defi/token_overview` (name/price/liquidity), `/defi/v3/search`, `/defi/v3/token/list` (scanner universe). `src/index.js` is the same logic for Cloudflare Workers (`env.BIRDEYE_API_KEY` via `wrangler secret put`).
- `public/indicators.js` — pure technical-indicator math (SMA/EMA/RSI/MACD/Bollinger/ATR/OBV, swing points, S/R clustering, market structure).
- `public/patterns.js` — algorithmic candlestick pattern detection with context validation (trend location + confirmation).
- `public/knowledge.js` — the machine-readable rule base distilled from `book-notes/`, every rule attributed to its source book.
- `public/engine.js` — combines the above into an explainable score/verdict/trade-plan; hard red flags cap the score (risk-first). Market "tide" = `Engine.marketRegime(SOL)`: tokens are high-beta to SOL. `Engine.assess(asset, primary, higher, marketCtx, tf)` takes a timeframe profile (`Engine.TF_SWING` / `Engine.TF_INTRADAY`) that swaps a few labels and volatility/extension thresholds; the rules and their attributions don't change.
- `public/app.js` + `index.html` + `chart.js` — vanilla-JS frontend, hand-rolled canvas candlestick chart, no framework.

There is no test suite or build/lint command — verify changes by running the server (with a key) and checking `/api/chart?address=So11111111111111111111111111111111111111112`, `/api/chart?address=So111...112&range=10d&interval=15m`, `/api/search?q=bonk`, `/api/tokenlist`, `/api/batch?addresses=...` respond, then loading the page and toggling Swing/Intraday on Analyze and the Scanner.

## Working with book-notes and knowledge.js

- The original books are gone. `book-notes/*.md` is now the source of truth for what each book actually said — read the relevant file there before adding or changing anything in `knowledge.js`.
- When updating `knowledge.js`, only attribute a rule to a book that `book-notes/` actually documents — do not assume a book covers something it wasn't verified to contain.
- If a new book is added to the library later, extract its structured facts/rules into a new `book-notes/NN-title.md` file (summarized with attribution, not verbatim text) before deleting the source file, following the pattern of the existing notes.
