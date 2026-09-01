import type { Covariance, Means, Moments, Weights } from './types';

/**
 * PRD 03 §3 / §5.1 — E ve V.
 *
 * Markowitz (1952), s. 81, Eq. (1) ve (2).
 */

/** E = Σ Xᵢμᵢ — Markowitz (1952), Eq. (1), p. 81. */
export function expectedReturn(weights: Weights, means: Means): number {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) {
    total += (weights[i] ?? 0) * (means[i] ?? 0);
  }
  return total;
}

/**
 * V = Σᵢ Σⱼ σᵢⱼ XᵢXⱼ — Markowitz (1952), Eq. (2), p. 81.
 *
 * CIFT toplam, kisayol degil. `Σ σᵢᵢXᵢ²  + 2Σ_{i<j} σᵢⱼXᵢXⱼ` biciminde yazmak
 * ayni sonucu verir ama yalnizca Σ SIMETRIKSE; simetrisi bozuk bir girdide
 * sessizce yanlis cevap uretirdi. Bu bicim simetriye bagli degil.
 */
export function variance(weights: Weights, covariance: Covariance): number {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const row = covariance[i];
    if (row === undefined) continue;
    for (let j = 0; j < weights.length; j += 1) {
      total += (row[j] ?? 0) * (weights[i] ?? 0) * (weights[j] ?? 0);
    }
  }
  return total;
}

export function moments(weights: Weights, means: Means, covariance: Covariance): Moments {
  return {
    mean: expectedReturn(weights, means),
    variance: variance(weights, covariance),
  };
}

/**
 * Uc varlikli durumda (X₁, X₂) ikilisini tam agirlik vektorune acar.
 *
 * Makale butun geometrik tartismayi bu ikame uzerine kuruyor (s. 82): X₃
 * bagimli degisken oldugu icin uc varlikli problem DUZLEMDE cizilebiliyor.
 */
export function expand(x1: number, x2: number): number[] {
  return [x1, x2, 1 - x1 - x2];
}
