# Portfolio Selection — Markowitz (1952)

Harry Markowitz, "Portfolio Selection", _The Journal of Finance_ 7(1), March 1952, pp. 77–91.
[doi:10.1111/j.1540-6261.1952.tb01525.x](https://doi.org/10.1111/j.1540-6261.1952.tb01525.x)

## What the paper says

The rule in common use at the time was to maximise discounted expected return, and Markowitz shows it has a flaw: it never prefers a diversified portfolio, because whichever security has the highest expected return the rule puts everything into it. He replaces it with a rule over two quantities — expected return `E` and variance `V` — where the variance of a portfolio depends not only on the variance of its holdings but on the covariance between them. The cross terms are the contribution: assets that are not perfectly correlated combine to a variance below the weighted average of their own. The portfolios worth considering collapse from a region to a curve, the efficient set, and diversification becomes a consequence of the arithmetic rather than a rule of thumb.

## What is implemented

All of it in TypeScript, with no runtime dependencies.

- `moments.ts` — `E` and `V` (Eq. 1 and 2, p. 81). The variance is written as the full double sum rather than the `sum(var) + 2*sum(cov)` shorthand, which is only correct for a symmetric input and would silently return a wrong answer otherwise.
- `geometry.ts` — the three-asset plane (p. 82): the attainable triangle, isomean lines, the variance expansion of footnote 8, isovariance ellipses, and the minimum variance point. Lines are held as `a·X₁ + b·X₂ = c` rather than slope-intercept form, because the paper's own footnote 9 case (`μ₂ = μ₃`) makes the slope undefined; in the general form that case is just a vertical line.
- `cla.ts` — the critical line algorithm of footnote 10, written from scratch. No general-purpose QP solver. The constraint set is the paper's original one: weights sum to one, no short selling. Four corner cases are handled and tested: two events falling on the same λ, assets sharing an expected return, degenerate or ill-conditioned covariance, and a minimum variance point lying inside or outside the attainable set.
- `frontier.ts` — the `V`-against-`E` curve of Figure 6. Each segment is exactly a parabolic arc, so it is emitted as three points for a quadratic Bézier rather than sampled; a test checks the arc against real portfolio variances.
- `merton.ts` — the Merton (1972) closed form, used only to verify the algorithm.
- `estimation.ts` — an experiment on what estimation error costs (see below).
- `random.ts` — a seeded PRNG, Box–Muller normals, and a Cholesky factorisation. `Math.random` is never used: the same inputs must give the same result.
- `linalg.ts` — Gaussian elimination with partial pivoting, returning `null` on a singular system instead of propagating `NaN`.

### Verification

The strongest part of the repository is not the algorithm but the check on it. With the non-negativity constraint removed, the critical line algorithm must agree with the Merton (1972) analytic solution. The two derivations are genuinely independent: the algorithm parameterises by λ and normalises the budget, while Merton solves the Lagrange system under an `E` constraint through the `A`, `B`, `C`, `D` scalars.

Measured over **2000** randomly generated valid inputs (3 to 5 assets), the largest relative deviation is **3.79e-12** against a tolerance of `1e-9`.

The constrained case has no analytic solution, so it is compared against a third, independent method: every active-set subset is solved separately by Cramer's rule and the feasible one with the lowest variance is taken. That reference shares no code with the algorithm.

### The estimation error experiment

The paper assumes `μ` and `Σ` are known, and says so plainly on its last page. In practice both are estimated. The experiment draws a sample of `T` periods, estimates the moments, optimises with the estimates, and then evaluates the resulting weights under the **true** parameters. The loss is split by which input carried the error, by decomposing the covariance into standard deviations and correlations and taking one from the sample and the other from the truth.

**This is not a reproduction of Chopra & Ziemba (1993).** They perturb each input by the same controlled relative amount, which isolates how sensitive the optimisation is to each one. Here the error is genuine sampling error, so the result also carries how precisely each input can be estimated from `T` periods — the standard error of a mean is `σ/√T` while that of a variance is of order `√(2/(T−1))`. Those are different questions and they give different numbers.

The ratio is also not a constant. It depends on risk tolerance, on the true parameters, and on the number of assets. Run `pnpm example:estimation` to see it: at a risk tolerance of 0.25 the ordering lands near the frequently quoted 11:2:1, at 1.0 the dominance of the means is far sharper. What never changes is the ordering itself — error in the means costs more than error in the variances, which costs more than error in the covariances.

## What is deliberately left out

This is an implementation of one paper, not a portfolio management library.

- **Real market data, data loading, backtests.** The paper is about the structure of the problem, not about any particular set of returns. Adding data would invite conclusions the paper does not support.
- **Transaction costs, turnover, liquidity.** Single-period model; there is no second period to trade into.
- **Shrinkage, Black–Litterman, resampling, hierarchical risk parity.** These are answers to the estimation problem shown above, and each belongs to its own paper.
- **A risk-free asset and the capital allocation line.** That is Tobin (1958), a separate paper.
- **Upper bounds and general linear constraints.** The paper's formulation has neither. The constraint interface is designed to admit them, with one implementation; writing the machinery before it is needed would be speculation.
- **Survivorship bias, corporate action adjustment.** Data concerns, and there is no data.
- **Precomputed result sets.** Everything is computed on the spot.

## Running it

```
pnpm install
pnpm test              # 53 tests, including the property-based verification
pnpm typecheck
pnpm lint
pnpm example:frontier
pnpm example:estimation
```

The interactive version of these figures, where the parameters can be dragged, is at
[berkgunberk.me/en/work/quant-papers/markowitz-1952](https://berkgunberk.me/en/work/quant-papers/markowitz-1952).
