# The Mathematics of Money Management — Ralph Vince

## Kelly Criterion

Growth function: `G(f) = P·ln(1+B·f) + (1-P)·ln(1-f)`, where f = fraction of stake bet, P = win probability, B = win/loss payoff ratio. Optimal f maximizes G(f). Closed-form Kelly (`f = ((B+1)P − 1)/B`) is only exactly correct for a **two-outcome (Bernoulli) payoff** — real trade P&L has an arbitrary distribution of win/loss sizes, so naively averaging wins and losses into Kelly's formula systematically misprices the correct bet size. Vince's own worked example: a real 9-trade sequence's Kelly-derived f was 0.16, while the true empirically-optimal f (found by direct search) was 0.24 — using the wrong number cost roughly 60%+ of long-run terminal wealth over repeated cycles.

## Optimal f

Found by brute-force search, not a closed form: for each candidate f from 0.01 to 1.00, compute each trade's Holding Period Return `HPR = 1 + f×(-Trade/BiggestLoss)`, multiply them all into a Terminal Wealth Relative (`TWR = Π HPR`), and take the f that maximizes TWR (equivalently, maximizes the geometric mean `TWR^(1/N)`). Converting to real position size: `$ per contract = BiggestLoss / (-f)`.

## Geometric mean / TWR

`TWR = Π HPR_i` = final stake ÷ starting stake. `Geometric Mean = TWR^(1/N)`. A geometric mean below 1 means the system loses money when reinvested even if the sum of raw trade P&L is positive, because TWR is multiplicative — a single 100% loss (HPR = 0) wipes the account regardless of every other trade's quality. An estimated geometric mean can be derived from ordinary arithmetic mean and standard deviation without literally multiplying every HPR: `EGM = sqrt(AHPR² − SD²)`.

## The Fundamental Equation of Trading

`Estimated TWR ≈ (A² − SD²)^(N/2)`, where A = arithmetic mean HPR, SD = standard deviation of HPRs, N = number of trades. If A ≤ 1, more trades (larger N) drive the account toward zero over time regardless of variance; if A > 1, growth compounds, and for a fixed A, *reducing dispersion (SD) improves the compounding rate quadratically*, not linearly — cutting variance is mathematically as valuable as raising the average trade.

## Drawdown implications

Core finding: trading at full optimal f produces, historically, a drawdown of **at least f percent** of account equity — if f = 0.5, expect at least a 50% peak-to-trough retracement at some point. Paradox: better systems (in the sense of higher optimal f) imply *worse* worst-case drawdowns, not better ones. Vince estimates realistic systems traded at full optimal f can see 30–95% equity retracements regardless of how good the system is.

## Fractional f

Trading at a fraction of full optimal f (e.g. "half-f") cuts the drawdown floor roughly proportionally while costing comparatively little compounding speed, because the TWR/geometric-mean curve is fairly flat near its peak — in Vince's coin-toss example, trading at half-f only slowed the time-to-double a stake by about 31%, while roughly halving the drawdown floor. Vince frames this as a generic time-vs-smoothness tradeoff (not endorsing a specific fraction), and states his own preferred remedy for drawdown is diversifying into more low/negatively-correlated systems near full f, rather than uniformly scaling every system down.

## Practical takeaways

Never use Kelly's simple formula directly on real trade data; optimal f must be found empirically per the procedure above; full optimal f maximizes growth but comes with a drawdown floor equal to f itself; fractional sizing trades some growth speed for materially smoother equity; the Fundamental Equation shows growth requires a mean HPR > 1 and rewards reducing trade-to-trade dispersion.

Source file (deleted after extraction): "The Mathematics of Money Management: Risk Analysis Techniques for Traders" (Ralph Vince), PDF.
