# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

Two things live here:

1. A library of trading ebooks (PDF/EPUB/MOBI) covering candlestick patterns, smart-money/technical analysis, options, swing trading, crypto trading, and trading psychology.
2. `tradesight/` — a web app, **TradeSight**, whose entire rule engine was distilled from that book library. See `PROMPT.md` for the full spec and `tradesight/README.md` for how the engine is structured.

## Running TradeSight

```
cd tradesight && node server.js
```

Then open http://localhost:8742. Zero dependencies (Node 18+ built-in `fetch`), no build step, no API keys.

- `server.js` — proxies Yahoo Finance (OHLCV, symbol search) and CoinGecko (crypto markets) with in-memory caching; serves `public/`.
- `public/indicators.js` — pure technical-indicator math (SMA/EMA/RSI/MACD/Bollinger/ATR/OBV, swing points, S/R clustering, market structure).
- `public/patterns.js` — algorithmic candlestick pattern detection with context validation (trend location + confirmation).
- `public/knowledge.js` — the machine-readable rule base extracted from the books, every rule attributed to its source book.
- `public/engine.js` — combines the above into an explainable score/verdict/trade-plan; hard red flags cap the score (risk-first).
- `public/app.js` + `index.html` + `chart.js` — vanilla-JS frontend, hand-rolled canvas candlestick chart, no framework.

There is no test suite or build/lint command — verify changes by running the server and checking `/api/chart`, `/api/search`, `/api/batch` respond, then loading the page.

## Working with the books

- PDFs: Read tool with the `pages` parameter, small ranges (8–10 pages) for image-heavy ones — larger ranges can fail to render.
- EPUB/MOBI: not directly readable. Extract EPUBs with `unzip`, strip HTML tags (`sed -e 's/<[^>]*>//g'`) before reading as text.
- Filenames have spaces and parentheses — always quote paths.
- When updating `knowledge.js`, only attribute a rule to a book that has actually been read in that session — do not assume a book covers something it wasn't verified to contain.
