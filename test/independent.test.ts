import { describe, expect, it } from 'vitest';
import { criticalLine, expectedReturn, makeRandom, variance } from '../src/index';

/**
 * A reference that never looks at the critical line algorithm.
 *
 * The other tests in this repository check the algorithm against Merton's
 * closed form and against a combinatorial active-set solver. Both are genuine
 * independent derivations, but both answer the question "given a target
 * expected return, is the minimum-variance portfolio right". Neither asks
 * whether the traversal VISITS the whole efficient frontier.
 *
 * That gap was real. The algorithm used to miss part of the frontier on some
 * inputs, and every check in this repository stayed green while it did,
 * because a check that walks the algorithm's own turning points cannot notice
 * that a turning point is missing.
 *
 * The search below never touches the frontier. It samples the simplex
 * directly and refines the best point it finds, so the constraints hold by
 * construction: no weight is negative, and they sum to one. Then it maximises
 * `(μ − d)/σ`, an objective with no target return and therefore no band to
 * match — which is what makes the comparison clean.
 *
 * Seeded, so the result is the same on every run.
 */

function bestRatioBySearch(
  means: number[],
  covariance: number[][],
  threshold: number,
  seed: number,
): number {
  const random = makeRandom(seed);
  const size = means.length;

  const ratioOf = (weights: number[]): number => {
    const v = variance(weights, covariance);
    if (v <= 1e-300) return Number.NEGATIVE_INFINITY;
    return (expectedReturn(weights, means) - threshold) / Math.sqrt(v);
  };

  let best = Number.NEGATIVE_INFINITY;
  let bestWeights = Array.from({ length: size }, () => 1 / size);

  // Normalised exponentials are uniform on the simplex.
  for (let draw = 0; draw < 6000; draw += 1) {
    const raw = Array.from({ length: size }, () => -Math.log(Math.max(1e-12, random())));
    const total = raw.reduce((sum, value) => sum + value, 0);
    const weights = raw.map((value) => value / total);
    const ratio = ratioOf(weights);
    if (ratio > best) {
      best = ratio;
      bestWeights = weights;
    }
  }

  let step = 0.1;
  for (let round = 0; round < 1200; round += 1) {
    const moved = bestWeights.map((value) => Math.max(0, value + (random() * 2 - 1) * step));
    const total = moved.reduce((sum, value) => sum + value, 0);
    if (total < 1e-12) continue;
    const weights = moved.map((value) => value / total);
    const ratio = ratioOf(weights);
    if (ratio > best) {
      best = ratio;
      bestWeights = weights;
    }
    if (round % 200 === 199) step *= 0.5;
  }

  return best;
}

/** The best `(μ − d)/σ` attainable on the frontier the algorithm produces. */
function bestRatioOnFrontier(means: number[], covariance: number[][], threshold: number): number {
  const { turningPoints } = criticalLine(means, covariance);
  let best = Number.NEGATIVE_INFINITY;

  for (let index = 1; index < turningPoints.length; index += 1) {
    const upper = turningPoints[index - 1];
    const lower = turningPoints[index];
    if (upper === undefined || lower === undefined) continue;

    for (let step = 0; step <= 200; step += 1) {
      const t = step / 200;
      const weights = lower.weights.map(
        (value, i) => value + t * ((upper.weights[i] ?? 0) - value),
      );
      const v = variance(weights, covariance);
      if (v <= 1e-300) continue;
      best = Math.max(best, (expectedReturn(weights, means) - threshold) / Math.sqrt(v));
    }
  }

  return best;
}

describe('the frontier itself', () => {
  /**
   * The frontier must contain the best attainable portfolio. The search is
   * discrete, so it may fall slightly short of the algorithm; it must never
   * beat it by a visible margin. When it does, the traversal has skipped a
   * reachable, better portfolio.
   */
  it('no reachable portfolio beats the frontier', () => {
    const random = makeRandom(20250902);
    let checked = 0;

    for (let trial = 0; trial < 300; trial += 1) {
      const size = 3 + Math.floor(random() * 4);
      const lower = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => random() * 0.7 - 0.35),
      );
      const covariance = Array.from({ length: size }, (_, i) =>
        Array.from({ length: size }, (_, j) => {
          let total = i === j ? 0.01 : 0;
          for (let k = 0; k < size; k += 1) total += (lower[i]?.[k] ?? 0) * (lower[j]?.[k] ?? 0);
          return total;
        }),
      );
      const means = Array.from({ length: size }, () => 0.01 + random() * 0.24);
      const threshold = -0.05 + random() * 0.13;

      const onFrontier = bestRatioOnFrontier(means, covariance, threshold);
      if (!Number.isFinite(onFrontier)) continue;
      checked += 1;

      const bySearch = bestRatioBySearch(means, covariance, threshold, 4242 + trial);
      expect(onFrontier, `trial ${String(trial)}`).toBeGreaterThan(bySearch - 1e-3);
    }

    expect(checked).toBeGreaterThan(200);
  });

  /**
   * The input that exposed the defect, kept as a regression.
   *
   * The traversal dropped asset 0 from the free set on a spurious event — the
   * weight was crossing its lower bound while moving AWAY from it — and the
   * whole lower part of the frontier came out non-optimal. The best ratio was
   * 0.8290 where 1.2587 is attainable.
   */
  it('does not drop an asset on a spurious event', () => {
    const means = [
      0.23891204034909605, 0.23903716718778015, 0.17263368954882027, 0.07014987116679548,
      0.13682389166206121,
    ];
    const covariance = [
      [
        0.12972162814986066, -0.010983265306739707, -0.023022399475780858, -0.08277519386657166,
        -0.061817348471033956,
      ],
      [
        -0.010983265306739707, 0.1197442518308499, -0.030292074812818367, 0.030198317018415115,
        0.0048013163263086935,
      ],
      [
        -0.023022399475780858, -0.030292074812818367, 0.17513971278080528, 0.06867864800251225,
        -0.03167400497520824,
      ],
      [
        -0.08277519386657166, 0.030198317018415115, 0.06867864800251225, 0.3006155082710522,
        0.0288471318345193,
      ],
      [
        -0.061817348471033956, 0.0048013163263086935, -0.03167400497520824, 0.0288471318345193,
        0.20668849055165947,
      ],
    ];

    expect(bestRatioOnFrontier(means, covariance, 0.029417614920530466)).toBeGreaterThan(1.25);

    // And the far end of the frontier holds every asset, as it should.
    const { turningPoints } = criticalLine(means, covariance);
    const last = turningPoints[turningPoints.length - 1];
    expect(last).toBeDefined();
    expect(Math.min(...(last?.weights ?? []))).toBeGreaterThan(0);
  });
});
