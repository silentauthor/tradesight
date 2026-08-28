# Production Prompt — "TradeSight" Trading Analysis & Suggestion Platform

> This is the executed specification for the app in this directory. It was distilled from the user's request plus the trading knowledge extracted from the 10 books in this folder.

## Mission

Build **TradeSight**: a production-grade, local-first web application that analyzes any stock or cryptocurrency on demand and continuously scans the market, producing actionable, risk-managed trade assessments grounded in the rules from the trading library in this directory (candlestick patterns, smart-money concepts, swing trading, crypto risk, trading psychology).

## Core requirements (from the user)

1. **Asset analyzer** — user enters any stock ticker or crypto symbol; the app fetches live data and produces:
   - A clear **verdict**: is it reasonably safe to trade this asset *right now* (Strong Buy setup / Buy / Wait / Avoid), with a 0–100 setup-quality score and the reasoning behind it.
   - A recommended **entry zone**, **stop loss** (with the book rule used to place it), and **staged exit targets** (T1/T2/T3 with risk-multiple and structure-based levels).
   - A concrete **risk factors** list specific to that asset right now (volatility regime, extended from mean, near resistance, low liquidity, earnings-type event risk for stocks, crypto-specific risks, etc.).
2. **Market scanner** — automatically analyzes a broad universe (major US stocks + top cryptos), ranks everything by setup quality, and surfaces the best assets to trade now, for both long and short/avoid awareness.

## Enhanced feature set (added to make it best-in-class)

3. **Full technical engine** computed client-side from OHLCV: SMA 20/50/200, EMA 9/21, RSI(14), MACD(12,26,9), Bollinger Bands(20,2), ATR(14), swing-point support/resistance clustering, trend structure (HH/HL vs LH/LL), volume analysis (OBV, volume vs 20-day average), 52-week position, and multi-timeframe alignment (daily + weekly).
4. **Candlestick pattern detection** — algorithmic detection of the patterns from the candlestick books (engulfing, hammer/hanging man, shooting star/inverted hammer, doji family, morning/evening star, three white soldiers/black crows, tweezers, piercing/dark cloud, harami, marubozu), each validated by the books' *context rules* (pattern must appear in the right trend, at a meaningful level, with confirmation) rather than fired blindly.
5. **Smart-money layer** — market structure state (uptrend/downtrend/range, break of structure), liquidity levels (equal highs/lows), and premium/discount zone of the current range.
6. **Position size calculator** — implements the books' 1–2% risk rule: account size + risk % → exact share/coin quantity from entry-to-stop distance, with R-multiple math shown for every target.
7. **Risk-first scoring** — the verdict engine is asymmetric: any single hard red flag (e.g. fighting the 200-SMA trend, RSI blow-off, catastrophic R:R) caps the score. Minimum 2:1 reward:risk enforced before anything is called tradeable, per the books.
8. **Psychology guardrails** — a "discipline check" panel derived from the Stewie/psychology material: warns about chasing extended moves, revenge trading, overtrading, trading against trend, and shows the checklist to pass before entering.
9. **Interactive chart** — candlestick chart with overlays (MAs, Bollinger, support/resistance zones, detected patterns marked, entry/stop/target lines drawn on the chart).
10. **Watchlist + trade journal** — persistent (localStorage) watchlist and a journal that logs planned trades with entry/stop/target and R-multiple, so performance can be reviewed.
11. **Education layer** — every signal, pattern and rule in the UI carries a tooltip citing the concept and the source book, so the tool teaches while it analyzes.
12. **Market overview dashboard** — indices/BTC breadth snapshot, top movers, and a fear-context readout so single-asset verdicts are framed by overall market condition (the books' "trade with the tide" rule).

## Architecture & quality bar

- **Stack**: zero-dependency Node.js (v22) server (`server.js`) that (a) serves the static frontend and (b) proxies market data (Yahoo Finance chart/search + CoinGecko) to avoid CORS, with in-memory caching and rate-limit-friendly batching. Frontend: vanilla HTML/CSS/JS single-page app, no build step, hand-rolled canvas candlestick chart (no external libs, works offline once data is cached).
- **Data**: Yahoo Finance `v8/finance/chart` for OHLCV (stocks, ETFs, and `-USD` crypto pairs), `v1/finance/search` for symbol lookup; CoinGecko markets endpoint for crypto universe/metadata. Graceful degradation and clear error states when a source is down.
- **Production-grade**: input validation, timeouts, cache TTLs, loading/error/empty states, responsive layout, dark UI suited to trading, keyboard-first search, no secrets/keys required.
- **Honesty**: prominent disclaimer that this is decision-support education, not financial advice; the engine must show *why* for every conclusion (explainable scoring, every rule attributed).

## Knowledge grounding

Before building the engine, extract from the 10 books in this directory: every candlestick pattern definition + its entry/stop/exit rules, all stop-loss placement rules, risk-management numbers (risk %, R:R minimums), smart-money concepts, crypto-specific risk factors and coin-selection criteria, swing-trading screening rules, and psychology/discipline rules. Encode them as a machine-readable knowledge base (`knowledge.js`) that both the scoring engine and the education tooltips consume, with book attributions preserved.
