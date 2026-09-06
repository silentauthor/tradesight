---
name: tradesight-knowledge
description: Look up trading rules, formulas, and statistics (candlestick patterns, chart patterns, smart-money/Wyckoff concepts, position sizing, risk management, technical indicators, trading psychology) distilled from a private trading-book library. Load this whenever working on TradeSight's engine (tradesight/public/knowledge.js, engine.js, patterns.js), answering a question about why the engine scores something a certain way, or extending the app with a new rule — instead of asking the user to re-supply or re-read the original books, which have been deleted (they were pirated and are a malware risk). Also load when asked to add a new source book to the knowledge base, for the extraction pattern to follow.
---

# TradeSight Knowledge Base

`book-notes/` (repo root, sibling to this `.Codex/` folder) is the **only** record of what the 24 source trading books said — the original PDFs/EPUBs/MOBI were deleted after extraction (sourced from piracy sites per their own filenames; pirated PDFs are a real malware vector). Every fact in `book-notes/` is a summarized/paraphrased extraction with source attribution, not the books' text.

**Never ask the user for the original books or suggest re-reading PDFs to answer a trading-rule question — read the relevant `book-notes/*.md` file instead.** If a rule genuinely isn't documented there, say so plainly rather than inventing one.

## Index — which file has what

| Topic | File |
|---|---|
| Candlestick patterns (hammer, engulfing, doji, harami, stars, tweezers) + entry/stop rules | `book-notes/01-candlestick-trading-bible.md`, `book-notes/02-candlesticks-explained-visually.md` |
| Smart money / order blocks / liquidity sweeps / premium-discount | `book-notes/03-smart-money-concepts.md` |
| Chart patterns with entry/stop/target rules (flags, wedges, triangles, H&S, 2B reversal, Holy Grail pullback) + NYMO/market timing + trading psychology basics | `book-notes/04-art-of-trading-stewie.md` |
| Crypto-specific risk factors, coin selection, altcoin exit strategy, IV-rank/put-call-ratio as sentiment | `book-notes/05-crypto-trading.md` |
| Swing trading rules, options basics, the forex "Ambush" stop-order strategy, stock screening | `book-notes/06-stock-options-swing-forex.md` |
| Position sizing models (percent-risk, percent-volatility, SQN, fixed-ratio, market's-money) | `book-notes/07-position-sizing-tharp.md` |
| Optimal f / Kelly Criterion math, TWR, drawdown-vs-growth tradeoffs | `book-notes/08-money-management-vince.md` |
| **Real backtested statistics** per chart pattern (failure rate, avg move, rank) | `book-notes/09-chart-patterns-bulkowski.md` |
| Original chart-pattern theory (H&S, triangles, rectangles, gaps, trendline validity rules) | `book-notes/10-technical-analysis-edwards-magee.md` |
| Elliott Wave, intermarket analysis (bonds/dollar/commodities), MA systems, oscillator thresholds by regime, ADX | `book-notes/11-technical-analysis-murphy.md` |
| Wyckoff accumulation/distribution phases, springs/upthrusts, volume profile, volume-price anomaly rules | `book-notes/12-wyckoff-volume-price.md` |
| Options-market signals for the underlying (IV rank, put/call ratio, skew) — not options strategy mechanics | `book-notes/13-options-volatility.md` |
| Trading psychology (Douglas's 5 truths/7 principles, Market Wizards consensus, Livermore maxims) | `book-notes/14-psychology.md` |
| Backtesting rigor, survivorship bias, performance metrics, systematic-strategy pitfalls | `book-notes/15-quantitative-trading-bandy.md` |

Full index with author/title attributions: `book-notes/README.md`.

## How this maps to the app

`book-notes/` is the **full extraction** (raw facts/rules). `tradesight/public/knowledge.js` is the **subset actually wired into the scoring engine**, in a machine-readable form the engine and UI consume directly, with the same book attributions carried through into every score reason shown to the user. Not everything in `book-notes/` made it into `knowledge.js` — some material (Elliott Wave, point & figure, full options strategy mechanics) was deliberately left as reference-only because it isn't reliably algorithm-able or the app has no data source for it (see `book-notes/README.md` and `AGENTS.md` for what was left out and why).

If asked "why did the engine say X" or "what rule is this based on" — find the matching entry in `knowledge.js` first (it has the exact wording and attribution used), then cross-reference `book-notes/` for the fuller context if needed.

## Adding a new source book

1. Read the new book (PDF: small page ranges, 8–10 pages, for image-heavy ones; EPUB: unzip + strip HTML tags first).
2. Extract structured facts/rules/formulas/numbers with source attribution — **summarize and paraphrase, never reproduce verbatim passages** — into a new `book-notes/NN-short-title.md` following the format of the existing files (see any file above for the pattern: topic-organized sections, concrete numbers preserved, every claim attributed).
3. Add an index row to `book-notes/README.md`.
4. Delete the source PDF/EPUB/MOBI file once its content is captured — don't keep pirated or unlicensed source files around after extraction.
5. Wire whatever's genuinely new and algorithm-able into `tradesight/public/knowledge.js` and `engine.js`/`patterns.js`, matching the attribution used in the book-notes file.
6. Update this skill's index table with the new file's topic.
