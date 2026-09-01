import { dot, solve } from './linalg';
import type { Covariance, Means } from './types';

/**
 * PRD 03 §6.1 — Merton (1972) analitik frontier cozumu. DOGRULAMA icin.
 *
 * Kisitsiz problemin
 *
 *     min ½X'ΣX   s.t.  μ'X = E,  1'X = 1
 *
 * Lagrange cozumu uc skalere iner:
 *
 *     A = 1'Σ⁻¹1,   B = 1'Σ⁻¹μ,   C = μ'Σ⁻¹μ,   D = AC − B²
 *
 *     X(E) = Σ⁻¹[ (C − B·E)·1 + (A·E − B)·μ ] / D
 *     V(E) = (A·E² − 2B·E + C) / D
 *
 * Bu, CLA'nin yolundan BAGIMSIZ bir turetim. CLA λ ile parametrelendirip
 * butceyi normalize ediyor; burada dogrudan E kisiti altinda Lagrange sistemi
 * cozuluyor. Ikisi ayni sayiyi vermek zorunda ve testin kanitladigi sey bu:
 * "iki cozucu ayni sonucu verdi" degil, "cebir dogru".
 *
 * Modul saf ve yalnizca dogrulamada kullaniliyor; sayfada gorunmuyor.
 */

export interface MertonScalars {
  a: number;
  b: number;
  c: number;
  determinant: number;
}

export function mertonScalars(means: Means, covariance: Covariance): MertonScalars | null {
  const ones = means.map(() => 1);

  // Σ⁻¹1 ve Σ⁻¹μ; ters matris kurulmaz.
  const sigmaInvOnes = solve(covariance, ones);
  const sigmaInvMeans = solve(covariance, [...means]);
  if (sigmaInvOnes === null || sigmaInvMeans === null) return null;

  const a = dot(ones, sigmaInvOnes);
  const b = dot(ones, sigmaInvMeans);
  const c = dot([...means], sigmaInvMeans);
  const determinant = a * c - b * b;

  // D = 0: butun varliklarin beklenen getirisi esit; frontier bir noktaya coker.
  if (Math.abs(determinant) < 1e-12) return null;

  return { a, b, c, determinant };
}

/** Verilen E icin kisitsiz minimum varyans portfoyu. */
export function mertonWeights(
  means: Means,
  covariance: Covariance,
  targetMean: number,
): number[] | null {
  const scalars = mertonScalars(means, covariance);
  if (scalars === null) return null;

  const { a, b, c, determinant } = scalars;
  const onesCoefficient = (c - b * targetMean) / determinant;
  const meansCoefficient = (a * targetMean - b) / determinant;

  // Σ⁻¹ ile carpim yerine tek bir sistem cozumu: Σ x = (k₁·1 + k₂·μ)
  const rhs = means.map((mean) => onesCoefficient + meansCoefficient * mean);
  return solve(covariance, rhs);
}

/** Verilen E icin kisitsiz minimum varyans — kapali formda. */
export function mertonVariance(
  means: Means,
  covariance: Covariance,
  targetMean: number,
): number | null {
  const scalars = mertonScalars(means, covariance);
  if (scalars === null) return null;

  const { a, b, c, determinant } = scalars;
  return (a * targetMean * targetMean - 2 * b * targetMean + c) / determinant;
}
