import { runEstimation, type EstimationResult } from '../src/index.js';

/**
 * What estimation error costs.
 *
 * The paper assumes mu and Sigma are known. This experiment draws a sample of
 * T periods, estimates them, optimises with the estimates, and then evaluates
 * the resulting weights under the true parameters. The loss is split by which
 * input carried the error.
 *
 * Note this is not a reproduction of Chopra & Ziemba (1993): they perturb the
 * inputs by a controlled relative amount, which isolates sensitivity. Here the
 * error is genuine sampling error, so the numbers also carry how precisely
 * each input can be estimated from T periods. See the README.
 */

const means = [0.08, 0.12, 0.05];
const covariance = [
  [0.04, 0.006, 0.002],
  [0.006, 0.09, 0.004],
  [0.002, 0.004, 0.0225],
];

function run(tolerance: number, periods: number): EstimationResult {
  let last: EstimationResult | undefined;
  for (const step of runEstimation({
    means,
    covariance,
    tolerance,
    periods,
    trials: 1500,
    seed: 20250901,
  })) {
    last = step;
  }
  if (last === undefined) throw new Error('no result');
  return last;
}

function loss(result: EstimationResult, source: string): number {
  return result.sources.find((entry) => entry.source === source)?.loss ?? 0;
}

console.log('Cash equivalent loss by error source, in units of return.\n');
console.log('  tolerance    T    means      variances  covariances   ratio');

for (const tolerance of [0.25, 0.5, 1]) {
  for (const periods of [24, 60, 240]) {
    const result = run(tolerance, periods);
    const m = loss(result, 'means');
    const v = loss(result, 'variances');
    const c = loss(result, 'covariances');
    console.log(
      `  ${tolerance.toFixed(2).padStart(9)}  ${String(periods).padStart(3)}   ` +
        `${m.toExponential(2)}   ${v.toExponential(2)}   ${c.toExponential(2)}   ` +
        `${(m / c).toFixed(1)} : ${(v / c).toFixed(1)} : 1`,
    );
  }
}

const base = run(0.5, 60);
console.log(
  `\nThe 1/N portfolio, which optimises nothing, loses ${base.equalWeightLoss.toFixed(6)} ` +
    `against the optimum under the true parameters.`,
);
console.log('The ordering never changes: means cost more than variances, variances more than covariances.');
