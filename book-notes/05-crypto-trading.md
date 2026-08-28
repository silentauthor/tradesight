# Crypto Trading — Mark Zuckerman & Anthony Aries

Zuckerman's "Bitcoin and Cryptocurrency Trading for Beginners" (3-in-1) is the substantive source here (exchanges, wallets, order types, cycles, manipulation, leverage, psychology, TA); Aries's "Cryptocurrency Day Trading" is thinner/more generic — noted separately where distinct.

## Crypto-specific risk factors (Zuckerman)

- Extreme volatility is structural: crypto is young, no consensus on fair value, and open to inexperienced retail — expect swings like +30%/−50% across consecutive sessions.
- ~4-year market cycle tied to the Bitcoin halving: roughly a 2–3 year bull market followed by a 1–2 year bear market.
- Altcoins are highly correlated to BTC and rarely swim against it; alts tend to do best when BTC grinds up slowly or trades sideways, and bleed when BTC pumps fast (money rotating into BTC). A drop in BTC dominance signals an "alt season" window, historically lasting only 1–2 weeks.
- Exchange/custody risk: "not your keys, not your crypto" — coins on an exchange are an IOU (cites Mt. Gox, QuadrigaCX, Binance 2019 hack). Keep only small trading balances on exchanges; move the rest to a hardware wallet.
- Pump-and-dump signatures: low market cap (mostly outside the top 100–200), listed on very few exchanges, sudden unexplained volume before a price rise. If you can't explain why a coin is pumping, don't buy it.
- Wash trading: a large share of reported exchange volume is estimated to be non-economic/fake; watch for uniform buy/sell patterns and matched order pairs on obscure exchanges.
- Order-book spoofing: whales place large fake walls to fake supply/demand, then pull them after accumulating/distributing.
- Stop-loss hunting: whales push price to obvious technical levels to trigger clustered stops, then reverse. Defense: use stop-limit orders (a limit a few points below the trigger) rather than plain market stops.
- Leverage: exchanges advertise up to 100–125x; author's rule of thumb — never trade leverage before being profitable on spot, and never really need more than ~10x (regulated venues like CME imply closer to 2–3x). Anything much higher is "gambling," good for the exchange, bad for you.
- Tokenomics red flags: a single wallet holding >10% of total supply; upcoming vesting-cliff unlocks; no maximum supply (dilution risk).

## Trading strategies (Zuckerman)

- **Support/resistance** is called the single most valuable tool: identify prior swing highs/lows on any timeframe; a broken level flips role (old resistance becomes support and vice versa) — judged by the close, not an intraday wick.
- **Trend trading**: uptrend = higher highs + higher lows; check one timeframe above your trading chart (day trade → check hourly; swing → check daily; position → check weekly).
- **Volume confirmation**: rising volume confirms a move; declining volume on a rally is a suspect fakeout; a volume climax at a trend extreme is a reversal warning; a breakout needs a volume spike to be trusted.
- **Candlestick reversal entries**: standard bullish/bearish patterns (engulfing, hammer, morning/evening star, three soldiers/crows) combined with trend context; always require confirmation.
- **Altcoin exit strategy**: sanity-check price targets against implied market cap (e.g. a target that would require a market cap larger than gold is not realistic); sell before large vesting unlocks; watch BTC-dominance drops for the alt-season exit window; track the coin's value in BTC terms (sats), not just USD, since a USD gain with a sats loss means the coin is underperforming BTC.
- **Options as a sentiment gauge** (Deribit): put/call open-interest ratio (>1 = bearish tilt — watch its trend, not the level), 25-delta skew (positive = puts rich = bearish; negative = calls rich = bullish), and volatility spikes 2–3 days before large options expiries.
- **Implied Volatility Rank** = (current IV − 52-week low) / (52-week high − 52-week low) × 100. Near 100 → options expensive → favor selling volatility; near 0 → cheap → favor buying it.
- **DCA**: a fixed dollar amount on a fixed schedule to neutralize timing risk — mainly for accumulation, can run alongside an active trading allocation.
- Order execution: prefer limit orders at the mid of the bid-ask spread over market orders; scale into positions with multiple smaller orders; use bracket/OCO orders to automate the exit plan.

## Stop-loss & risk management (Zuckerman)

- Always use a stop — crypto trades 24/7, so an unattended stop executes while you sleep.
- Stop styles: fixed technical level (below a swing low), fixed percentage, or a trailing stop that ratchets up as the trade profits.
- Never risk more than a few percent of total capital on one trade; cap total crypto exposure at roughly 10% of net worth unless you're a deep specialist in the space.
- A written trading plan (max risk, max reward, entry/exit triggers, position size, timeframe) should exist *before* every trade — it's the only moment you're fully rational.
- Never average down on a loser; if the trade breaks your original thesis, exit and reassess flat rather than hoping.
- Test any new strategy over at least 20 mechanical trades, sized small enough to survive losing all of them — expect losing streaks even with a genuine edge.

## Coin selection (Zuckerman)

- Start with BTC — highest liquidity, most established, where institutional money goes first.
- For altcoins: diversify across sector, market cap, and use case; judge on team credibility, VC backing, liquidity relative to peers, adoption/partnerships, staking percentage, and fair tokenomics (no large pre-mine, sensible vesting).
- Avoid coins listed on only one exchange, or with unexplained volume spikes, or with anonymous dev teams.

## Aries — supplementary, more generic material

- Scalping: buy small gaps/openings around the daily open; take only high-probability setups; small gains per trade.
- Swing trading: identify strong support, enter before it breaks, exit quickly once support fails.
- Set a stop-loss amount before entering and honor it; sell immediately once a target price is reached rather than waiting for more.
- Diversify across pairs rather than concentrating in one; start small and scale up only with a demo/practice track record.
- Coin selection: prefer high-liquidity, low-volatility pairs — "the higher the availability of the market, the quicker and more pronounced the trend."

Source files (deleted after extraction): "Bitcoin and Cryptocurrency Trading for Beginners" (Mark Zuckerman), "Cryptocurrency Day Trading" (Anthony Aries) — EPUBs.
