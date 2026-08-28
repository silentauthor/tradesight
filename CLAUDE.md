# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

1. `tradesight/` — a web app, **TradeSight**, whose entire rule engine was distilled from a private library of trading books (candlestick patterns, smart-money/technical analysis, options, swing trading, crypto trading, position sizing, trading psychology). See `PROMPT.md` for the full spec and `tradesight/README.md` for how the engine is structured.
2. `book-notes/` — structured reference notes (facts, rules, formulas, statistics) extracted from that book library, organized one file per book/topic with source attribution. The original PDF/EPUB/MOBI files have been deleted (they were sourced from piracy sites per their own filenames, and pirated PDFs are a real malware vector) — `book-notes/` is the durable record of what was learned from them. Start at `book-notes/README.md` for the index.

## Running TradeSight

```
cd tradesight && node server.js
```

Then open http://localhost:8742. Zero dependencies (Node 18+ built-in `fetch`), no build step, no API keys.

- `server.js` — proxies Yahoo Finance (OHLCV, symbol search) and CoinGecko (crypto markets) with in-memory caching; serves `public/`.
- `public/indicators.js` — pure technical-indicator math (SMA/EMA/RSI/MACD/Bollinger/ATR/OBV, swing points, S/R clustering, market structure).
- `public/patterns.js` — algorithmic candlestick pattern detection with context validation (trend location + confirmation).
- `public/knowledge.js` — the machine-readable rule base distilled from `book-notes/`, every rule attributed to its source book.
- `public/engine.js` — combines the above into an explainable score/verdict/trade-plan; hard red flags cap the score (risk-first).
- `public/app.js` + `index.html` + `chart.js` — vanilla-JS frontend, hand-rolled canvas candlestick chart, no framework.

There is no test suite or build/lint command — verify changes by running the server and checking `/api/chart`, `/api/search`, `/api/batch` respond, then loading the page.

## Working with book-notes and knowledge.js

- The original books are gone. `book-notes/*.md` is now the source of truth for what each book actually said — read the relevant file there before adding or changing anything in `knowledge.js`.
- When updating `knowledge.js`, only attribute a rule to a book that `book-notes/` actually documents — do not assume a book covers something it wasn't verified to contain.
- If a new book is added to the library later, extract its structured facts/rules into a new `book-notes/NN-title.md` file (summarized with attribution, not verbatim text) before deleting the source file, following the pattern of the existing notes.
