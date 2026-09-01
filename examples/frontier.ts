import { criticalLine, frontier, variance } from '../src/index.js';

/**
 * The efficient frontier for a three-asset problem.
 *
 * Prints the turning points produced by the critical line algorithm: the
 * points where an asset enters or leaves the portfolio. Between two adjacent
 * turning points the frontier is exactly one parabolic arc.
 */

const means = [0.08, 0.12, 0.05];
const covariance = [
  [0.04, 0.006, 0.002],
  [0.006, 0.09, 0.004],
  [0.002, 0.004, 0.0225],
];

const { turningPoints, failure } = criticalLine(means, covariance);
if (failure !== null) throw new Error(failure);

console.log('Turning points, from maximum return down to minimum variance:\n');
console.log('  lambda        E         V        weights');
for (const point of turningPoints) {
  const lambda = Number.isFinite(point.lambda) ? point.lambda.toFixed(4) : 'inf';
  console.log(
    `  ${lambda.padStart(8)}  ${point.mean.toFixed(5)}  ${point.variance.toFixed(6)}  ` +
      `[${point.weights.map((w) => w.toFixed(4)).join(', ')}]`,
  );
}

const { arcs } = frontier(means, covariance);
console.log(`\nThe frontier is made of ${String(arcs.length)} parabolic arcs.`);

console.log('\nIndividual assets, for comparison:\n');
console.log('  asset      E         V');
for (const [index, mean] of means.entries()) {
  const weights = means.map((_, i) => (i === index ? 1 : 0));
  console.log(`  ${String(index + 1).padStart(5)}  ${mean.toFixed(5)}  ${variance(weights, covariance).toFixed(6)}`);
}
