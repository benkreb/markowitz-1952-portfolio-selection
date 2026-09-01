/**
 * PRD 03 §2.2 — public API.
 *
 * Bu klasor is bittiginde oldugu gibi repo'ya kopyalanacak (§9); disari acilan
 * yuzey burada tek bir yerde durur ki kopyalanan sey ile sitenin kullandigi sey
 * ayni olsun.
 */

export { expectedReturn, variance, moments, expand } from './moments';
export {
  runEstimation,
  ERROR_SOURCES,
  type ErrorSource,
  type EstimationParams,
  type EstimationResult,
  type SourceResult,
} from './estimation';
export { makeRandom, makeNormal, cholesky, drawReturns } from './random';
export { frontier, type FrontierArc, type FrontierPoint, type FrontierResult } from './frontier';
export {
  ATTAINABLE_CORNERS,
  isAttainable,
  isomeanLine,
  isomeanDegenerate,
  clipToAttainable,
  varianceForm,
  varianceAt,
  minimumVariancePoint,
  isovarianceEllipse,
  type Line,
  type VarianceForm,
} from './geometry';
export {
  criticalLine,
  portfolioAt,
  unconstrainedLine,
  pointAtMean,
  LONG_ONLY,
  type Bounds,
  type ClaResult,
  type CriticalLineSegment,
  type TurningPoint,
} from './cla';
export { mertonScalars, mertonWeights, mertonVariance, type MertonScalars } from './merton';
export { solve, submatrix, subvector, dot } from './linalg';
export type { Point2, Means, Covariance, Weights, Moments } from './types';
