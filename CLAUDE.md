# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

1. `tradesight/` — a web app, **TradeSight**, whose entire rule engine was distilled from a private library of trading books (candlestick patterns, smart-money/technical analysis, options, swing trading, crypto trading, position sizing, trading psychology). `PROMPT.md` is the original executed spec (stocks + crypto via Yahoo/CoinGecko); the app was then narrowed to **Solana tokens via the Birdeye Data API**, and now leads with two URL-hash-selected market workspaces: **Indian NSE/BSE equities via the Dhan Data API v2** (`#india`, the default) and **Jupiter Perps** SOL/BTC/ETH (`#crypto`). See `tradesight/README.md` for current behavior and the section below.
2. `book-notes/` — structured reference notes (facts, rules, formulas, statistics) extracted from that book library, organized one file per book/topic with source attribution. The original PDF/EPUB/MOBI files have been deleted (they were sourced from piracy sites per their own filenames, and pirated PDFs are a real malware vector) — `book-notes/` is the durable record of what was learned from them. Start at `book-notes/README.md` for the index.

## Running TradeSight

```
cd tradesight
printf 'BIRDEYE_API_KEY=your_key\nDHAN_ACCESS_TOKEN=your_jwt\nDHAN_CLIENT_ID=your_id\nANTHROPIC_API_KEY=your_key\n' > .env   # .env is gitignored; Dhan + Anthropic lines optional
node --env-file=.env server.js
```

`ANTHROPIC_API_KEY` powers only the **Stock Insight (news)** tab (`#india` →
"Stock insight (news)"): `news.js` fetches recent headlines for the chosen stock
(Google News per-company RSS + curated Indian markets/business feeds, no keys)
and the Claude API scores them into a sentiment direction, a 0–100 impact score,
an estimated near-term price move, per-headline drivers, and caveats. Model
override: `TRADESIGHT_NEWS_MODEL` (default `claude-opus-5`). The `/api/news`
endpoint fails with `{error:"ANTHROPIC_API_KEY not set …"}` when the key is
missing. The news score is deliberately **not** fed into `engine.js` — it never
changes a technical verdict.

Then open http://localhost:8742. No build step, no npm install (Node 18+ built-in `fetch`; `--env-file` needs Node 20.6+). The Dhan (`#india`) workspace needs `DHAN_ACCESS_TOKEN` + `DHAN_CLIENT_ID` and an active Dhan **Data plan**. The Jupiter Perps (`#crypto`) workspace needs `BIRDEYE_API_KEY` (https://public-api.birdeye.so) — its technical candles are Birdeye spot — and the dormant `birdeye` source needs the same key. Each source's `/api/*` calls fail with `{error:"… not set"}` if its keys are missing; the CSV-backed Dhan `/api/search` and `/api/tokenlist` work without keys (the scrip master is public).

**Data sources.** `SOURCES` in `public/app.js` defines three, but the current UI reaches only two, chosen by the URL hash (sidebar links in `index.html`, `switchMarket()` on `hashchange`):
- `dhan` (`#india`, the **default**) — NSE/BSE cash equities + NIFTY 50 index, addressed as `"<EXCHANGE_SEGMENT>:<securityId>"` e.g. `NSE_EQ:2885`, INR, NIFTY 50 tide, `isCrypto:false`.
- `jupiter` (`#crypto`) — Jupiter Perps SOL/BTC/ETH. Live venue price + 24h volume from `perps-api.jup.ag`; technical candles are **Birdeye underlying spot** (so this source also needs `BIRDEYE_API_KEY`). USD, SOL tide, `isCrypto:true`.
- `birdeye` — Solana SPL tokens by mint address. Still fully implemented in `server.js`/`src/index.js` and `SOURCES`, but nothing in the current UI sets `state.source='birdeye'` (it is effectively dormant / reachable only by editing state).

`state.source` follows the hash and is **not** persisted to `localStorage`. Per-source config lives in `SOURCES` (`ccy`, `addrRe`, `known`, `tideAddress`, `tideLabel`, quick-syms, placeholder, `noMatch`). Every `/api/*` call carries `&source=`. `isCrypto` follows the source, so under Dhan the crypto-risk panel is hidden and the "don't hold through earnings" exit rule is active. Order APIs are never called.

**Swing vs Intraday, and direction.** Two header radios: `#modeToggle` (`state.mode`, persisted to `localStorage.tsMode`) and `#sideToggle` (`state.side` = `long`/`short`, persisted to `localStorage.tsSide`). Both drive Analyze, Scanner and Watchlist. `MODES` in `public/app.js` holds the candle intervals/ranges and the `tf` profile per mode: swing = daily primary + weekly higher-timeframe; intraday = 15m primary + 1h higher-timeframe. Under Dhan (no weekly feed) the swing HTF is `TA.resampleWeekly(daily)`. `server.js`/`src/index.js` have short ranges (`3d`/`5d`/`10d`) and an `interval` param on `/api/batch`.

- `server.js` — proxies all three sources with in-memory caching; serves `public/`. Each handler dispatches on `?source=`. Birdeye endpoints: `/defi/v3/ohlcv`, `/defi/token_overview`, `/defi/v3/search`, `/defi/v3/token/list`. `src/index.js` is the **Birdeye-only** port for Cloudflare Workers (`env.BIRDEYE_API_KEY` via `wrangler secret put`) — no Dhan, no Jupiter.
- `dhan.js` — the Dhan (NSE/BSE) source (Node only). Proxies Dhan Data API v2 `POST /charts/historical` + `POST /charts/intraday`; resolves tickers/names via Dhan's public scrip-master CSV (cached 12h in memory). Exports `getChartDhan`, `searchDhan`, `niftyList` (the scanner universe = NIFTY 50 constituents; Dhan has no "most active" feed).
- `jupiter.js` — the Jupiter Perps source (Node only). Read-only `GET perps-api.jup.ag/v2/market-stats` for live price/volume; SOL/BTC/ETH mint ids from the jup-ag CLI. Exports `market`, `stats`, `list`.
- `news.js` — the Stock Insight source (Node only, India). `getStockNews(name,symbol)` pulls headlines from Google News RSS (per-company query, `gl=IN`) + curated markets/business feeds (ET, Moneycontrol, Business Standard, LiveMint, BusinessLine) with a regex RSS parser (no XML dep); `scoreNews(asset,news)` calls the Claude API (`api.anthropic.com/v1/messages`, raw `fetch`, structured outputs via `output_config.format`) for a `{direction,newsScore,expectedMovePct,horizon,confidence,keyDrivers,marketBackdrop,caveats}` assessment. Server route `/api/news?source=dhan&address=…|q=…` (in `server.js`, `apiNews`) resolves the company via the scrip master, adds a best-effort price/ATR context from `getChartDhan`, and caches the whole result 15 min. Exports also `parseRss`, `cleanName`, `dedupe` for tests.
- `public/indicators.js` — pure technical-indicator math (SMA/EMA/RSI/MACD/Bollinger/ATR/OBV, swing points, S/R clustering, market structure).
- `public/patterns.js` — algorithmic candlestick pattern detection with context validation (trend location + confirmation).
- `public/knowledge.js` — the machine-readable rule base distilled from `book-notes/`, every rule attributed to its source book.
- `public/engine.js` — combines the above into an explainable score/verdict/trade-plan; hard red flags cap the score (risk-first). Market "tide" = `Engine.marketRegime(anchorSeries, label)` where the anchor is SOL or NIFTY 50. `Engine.assess(asset, primary, higher, marketCtx, tf)` takes a timeframe profile (`Engine.TF_SWING` / `Engine.TF_INTRADAY`) that swaps a few labels and volatility/extension thresholds; source-specific wording (currency symbol, "SOL high-beta" vs "the NIFTY 50 index / falling tide") branches on `asset.isCrypto` / `asset.currency`. No rule weights or attributions change between sources or modes.
- `public/app.js` + `index.html` + `chart.js` — vanilla-JS frontend, hand-rolled canvas candlestick chart, no framework. The `#view-insight` section + `loadInsight`/`renderInsight` in `app.js` drive the Stock Insight tab; its nav button carries `data-india-only` and is hidden (and bounced off) when the source is not `dhan`.

There is no build/lint command. The automated checks are `node tradesight/tests/directions.cjs` (deterministic engine regression over synthetic fixtures in `tradesight/tests/fixtures.js` — long/short setups, stop/target ordering, R:R, tide gating, stale-data, sizing, perps eligibility; run after touching `engine.js`, `indicators.js`, `patterns.js` or `knowledge.js`) and `node tradesight/tests/news.cjs` (offline unit tests for `news.js`'s RSS parser, name cleaner and dedupe — the feeds and the Claude API call are not covered; run after touching `news.js`). There is no `npm test` wiring. Otherwise verify by running the server and checking these respond: `/api/chart?address=So11111111111111111111111111111111111111112`, `/api/chart?address=So111...112&range=10d&interval=15m`, `/api/search?q=bonk`, `/api/tokenlist`, `/api/batch?addresses=...`; and for Dhan: `/api/search?q=reliance&source=dhan`, `/api/tokenlist?source=dhan` (both work without keys), plus `/api/chart?address=NSE_EQ:2885&range=2y&interval=1d&source=dhan` (needs Dhan keys); and for news: `/api/news?source=dhan&q=reliance` (headline fetch works without keys, then `{error:"ANTHROPIC_API_KEY not set …"}` unless the key is set). Then load the page, switch between `#india` and `#crypto`, toggle Swing/Intraday and Long/Short on Analyze and the Scanner, and open the "Stock insight (news)" tab under `#india` (it is hidden under `#crypto`).

## Working with book-notes and knowledge.js

- The original books are gone. `book-notes/*.md` is now the source of truth for what each book actually said — read the relevant file there before adding or changing anything in `knowledge.js`.
- When updating `knowledge.js`, only attribute a rule to a book that `book-notes/` actually documents — do not assume a book covers something it wasn't verified to contain.
- If a new book is added to the library later, extract its structured facts/rules into a new `book-notes/NN-title.md` file (summarized with attribution, not verbatim text) before deleting the source file, following the pattern of the existing notes.
