# The Definitive Guide to Position Sizing — Van K. Tharp

## Foundational formula

CPR base equation: `units = (Risk% × EquityBase) / R`, where R is the dollar risk per unit (e.g. entry − stop), rounded down. Three equity-base choices: **Core Equity** (starting cash minus capital in open positions — most conservative), **Total Equity** (marks to market, Tharp's default), **Reduced Total Equity** (core equity plus only the locked-in risk reduction from trailing a stop up).

## Sizing models

1. **Percent Risk** (the standard model): `shares = floor((Equity × Risk%) / (Entry − Stop))`. Numeric guidance: under 1% trading others' money; up to ~3% for skilled traders on a good system trading their own money; as low as 0.1% for very tight-stop systems; beginners capped at 0.5%.
2. **Percent Volatility**: size by ATR instead of stop distance — `contracts = floor((VolatilityRisk% × Equity) / (ATR × dollarPerPoint))`. Equalizes dollar-swings across instruments regardless of where the stop happens to sit. Suggested per-position range 0.5–1.0% of equity in ATR terms, portfolio-wide cap 5–10%.
3. **"Market's Money" re-risking** (credited to Ed Seykota): split equity into a protected base and a riskable pool made only of open profit — `riskDollars = (BaseRisk% × StartingEquity) + (ProfitRisk% × OpenProfit)`. Lets winners increase size using only money the market has already given you, while the original capital stays protected. Needs a defined "reset" trigger (a % gain milestone, a calendar date, or a rolling window) for when profit becomes the new protected base.
4. **Fixed Ratio Position Sizing** (Ryan Jones): units increase as a function of accumulated profit divided by a chosen "delta." Tharp's recommended delta = half of the worst simulated drawdown for the instrument. Gate: only use this if System Quality Number (SQN) ≥ 2.5. Tharp's own verdict: in his simulations this offered **no real advantage** over percent-risk sized off the same simulated drawdown, and he's never traded it himself — useful only as a temporary early-account "jump start."
5. **SQN-gated risk (Optimal Target Risk %)**: `SQN = (mean(R-multiples) / stdev(R-multiples)) × sqrt(trades/year)`, capped at 100 trades. SQN rating table: <1.0 hard to trade; 1.0–2.0 average; 2.0–3.0 good; 3.0–5.0 excellent; 5.0–7.0 superb; >7.0 "holy grail" (treat as suspicious — check for survivorship bias). Suggested max total **portfolio heat** (sum of risk% across all open positions at once) by SQN tier: <1.3 → 1%; 1.3–1.7 → 4%; 1.7–2.5 → 8%; 2.5–3.0 → 12%; 3.0–4.0 → 15%; 4.0–5.0 → 20%; ≥5.0 → 25%. Hard constraint: max portfolio heat must stay under `100 / |worst negative R-multiple|`.
6. **Drawdown/losing-streak-adaptive models**: Monte-Carlo simulate the system's R-multiple distribution at many candidate risk levels to find the one giving an acceptable probability of hitting a target drawdown; step risk up gradually as equity climbs past a buffer roughly equal to the more-aggressive tier's own expected drawdown, and drop risk back down faster than it rises on a pullback.
7. **Scaling out** (credited to Tom Basso): periodically compute total open risk (or open volatility) as a percentage of current equity; if it exceeds a cap, sell down enough units to get back under the cap — never re-buy the scaled-out units, and never widen a stop as a substitute for scaling out.
8. **Scaling in / pyramiding** (credited to William Eckhardt/the Turtles): add a new tranche each time price moves one volatility unit (ATR) in your favor, sized by the same risk%; each time a tranche is added, raise the stop on *all* prior tranches to the new level so the whole position eventually shares one stop. Cap at 3–4 tranches.

## Risk of ruin

Tharp treats risk of ruin as something derived only via Monte-Carlo simulation of a system's actual R-multiple distribution, not a closed-form gambler's-ruin formula. He explicitly warns against two formulas that ARE closed-form but are dangerous if used directly: a naive win-rate-based sizing formula (assumes a 1:1 payoff, which real trades never have) and the Kelly Criterion (assumes a two-outcome/Bernoulli payoff structure real trading P&L distributions violate — even fractional Kelly split across positions can still ruin an account on a single large outlier loss). He also critiques Ralph Vince's Optimal f directly: because it's calibrated to the single worst *historical* loss, trading at the calculated "optimal" f showed 38–80% probability of ruin in his own simulations, depending on the objective chosen.

## Key principles

- Position sizing exists to meet a defined objective (target return, tolerable max drawdown) — there's no universal "correct" percentage.
- Expectancy (system quality) and position sizing (how much) are independent variables; good sizing can't fix a negative-expectancy system, and bad sizing can ruin even a good one.
- Always round position size down to the nearest whole unit.
- Cap correlated/group risk separately from single-trade risk (e.g. total exposure across all interest-rate-sensitive instruments), in addition to overall portfolio heat.
- Anything that increases size after a loss (martingale-style) is explicitly identified as a ruin mechanism.
- Small accounts should size well below what the textbook numbers would allow until a real track record exists.

Source file (deleted after extraction): "The Definitive Guide to Position Sizing" (Van K. Tharp), PDF.
