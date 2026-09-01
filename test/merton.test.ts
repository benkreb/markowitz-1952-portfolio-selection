import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  criticalLine,
  expectedReturn,
  mertonVariance,
  mertonWeights,
  pointAtMean,
  unconstrainedLine,
  variance,
} from '../src/index.js';

/**
 * PRD 03 §6 — DOGRULAMA.
 *
 * §6.1: kisitsiz durumda CLA ciktisi Merton (1972) analitik cozumune esit
 * olmali. §6.2: kisitli durumda analitik cozum gecerli degil, bu yuzden
 * BAGIMSIZ bir referans cozumle karsilastiriliyor.
 *
 * PRD bu testler icin "repo'nun en guclu tek parcasi" diyor ve gerekcesi su:
 * cikti "iki cozucu ayni sonucu verdi" degil, "cebir DOGRU" diyor. Iki yol
 * gercekten ayri:
 *
 *   CLA     — λ ile parametrelendirir, butceyi normalize eder, affine bir
 *             critical line uzerinde ilerler.
 *   Merton  — E kisiti altinda Lagrange sistemini dogrudan cozer; A, B, C, D
 *             skalerleri uzerinden kapali form.
 *
 * §6.2'nin referansi ise ucuncu bir yol: butun aktif kume alt kumeleri TEK TEK
 * denenir ve uygun olanlarin en dusuk varyanslisi secilir. Kombinatoryal
 * sayim, parametrik izlemeyle hicbir kod paylasmiyor — 2x2 ve 3x3 sistemler
 * bu dosyada Cramer ile cozuluyor.
 */

// ------------------------------------------------------------------ uretecler

/**
 * Pozitif tanimli Σ: `L·Lᵀ + εI`.
 *
 * Rastgele simetrik bir matris cogu zaman pozitif tanimli DEGILDIR ve gecersiz
 * girdiyle test etmek hicbir sey kanitlamaz. `L·Lᵀ` her zaman yari-tanimli,
 * `εI` eklemek onu tanimli yapiyor.
 */
const covarianceArb = (size: number) =>
  fc
    .array(
      fc.array(fc.double({ min: -0.4, max: 0.4, noNaN: true }), {
        minLength: size,
        maxLength: size,
      }),
      {
        minLength: size,
        maxLength: size,
      },
    )
    .map((lower) => {
      const sigma: number[][] = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => 0),
      );
      for (let i = 0; i < size; i += 1) {
        for (let j = 0; j < size; j += 1) {
          let total = i === j ? 0.01 : 0;
          for (let k = 0; k < size; k += 1) total += (lower[i]?.[k] ?? 0) * (lower[j]?.[k] ?? 0);
          const row = sigma[i];
          if (row !== undefined) row[j] = total;
        }
      }
      return sigma;
    });

const meansArb = (size: number) =>
  fc.array(fc.double({ min: 0.01, max: 0.3, noNaN: true }), { minLength: size, maxLength: size });

// ------------------------------------------------------------------- §6.1

/**
 * Boyut, μ, Σ ve hedef konumu TEK bir uretecte baglaniyor.
 *
 * Ilk surumde μ ve Σ, ozelligin ICINDE `fc.sample` ile uretiliyordu. Test
 * geciyordu ama fast-check onlari GORMUYOR: karsi ornek bulundugunda
 * kucultemez, yalnizca "bir yerde kirildi" der. D1'in fast-check'i secme
 * gerekcesi tam olarak shrinking'ti, yani o surum bagimliligi bosa
 * harciyordu.
 */
const problemArb = fc
  .integer({ min: 3, max: 5 })
  .chain((size) =>
    fc.tuple(meansArb(size), covarianceArb(size), fc.double({ min: 0, max: 1, noNaN: true })),
  );

describe('§6.1 — kisitsiz CLA = Merton analitik cozumu', () => {
  it('rastgele gecerli girdilerde tolerans icinde esitler', () => {
    fc.assert(
      fc.property(problemArb, ([means, sigma, position]) => {
        const line = unconstrainedLine(means, sigma);
        if (line === null) return true; // dejenere girdi; §6.1'in konusu degil

        // Hedef E, μ araliginin icinde bir yerde.
        const low = Math.min(...means);
        const high = Math.max(...means);
        const target = low + (high - low) * position;

        const fromCla = pointAtMean(line, means, target);
        const fromMerton = mertonWeights(means, sigma, target);
        if (fromCla === null || fromMerton === null) return true;

        for (let i = 0; i < means.length; i += 1) {
          const difference = Math.abs((fromCla[i] ?? 0) - (fromMerton[i] ?? 0));
          // Mutlak degil BAGIL tolerans: agirliklar acik satista buyuyebilir.
          const scale = Math.max(1, Math.abs(fromMerton[i] ?? 0));
          if (difference > 1e-6 * scale) return false;
        }

        // Hedef E gercekten tutturulmus olmali.
        if (Math.abs(expectedReturn(fromCla, means) - target) > 1e-8) return false;

        // V de kapali formla ayni.
        const closedForm = mertonVariance(means, sigma, target);
        if (closedForm === null) return true;
        return Math.abs(variance(fromCla, sigma) - closedForm) < 1e-8;
      }),
      { numRuns: 500 },
    );
  });

  it('bilinen bir girdide makine hassasiyetinde esitler', () => {
    const means = [0.08, 0.12, 0.05];
    const sigma = [
      [0.04, 0.006, 0.002],
      [0.006, 0.09, 0.004],
      [0.002, 0.004, 0.0225],
    ];

    const line = unconstrainedLine(means, sigma);
    expect(line).not.toBeNull();
    if (line === null) return;

    for (const target of [0.05, 0.07, 0.09, 0.11, 0.14]) {
      const fromCla = pointAtMean(line, means, target);
      const fromMerton = mertonWeights(means, sigma, target);
      expect(fromCla).not.toBeNull();
      expect(fromMerton).not.toBeNull();
      if (fromCla === null || fromMerton === null) continue;

      for (let i = 0; i < means.length; i += 1) {
        expect(Math.abs((fromCla[i] ?? 0) - (fromMerton[i] ?? 0))).toBeLessThan(1e-12);
      }
    }
  });
});

// ------------------------------------------------------------------- §6.2

/** 1x1, 2x2 ve 3x3 icin Cramer. CLA ile hicbir kod paylasmiyor. */
function cramer(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;

  const det = (m: number[][]): number => {
    if (m.length === 1) return m[0]?.[0] ?? 0;
    if (m.length === 2) {
      return (m[0]?.[0] ?? 0) * (m[1]?.[1] ?? 0) - (m[0]?.[1] ?? 0) * (m[1]?.[0] ?? 0);
    }
    let total = 0;
    for (let column = 0; column < m.length; column += 1) {
      const minor = m.slice(1).map((row) => row.filter((_, index) => index !== column));
      total += (column % 2 === 0 ? 1 : -1) * (m[0]?.[column] ?? 0) * det(minor);
    }
    return total;
  };

  const base = det(matrix);
  if (Math.abs(base) < 1e-14) return null;

  return Array.from({ length: n }, (_, column) => {
    const replaced = matrix.map((row, i) =>
      row.map((value, j) => (j === column ? (rhs[i] ?? 0) : value)),
    );
    return det(replaced) / base;
  });
}

/**
 * BAGIMSIZ referans: butun aktif kume alt kumelerini tek tek dener.
 *
 * Her alt kume icin `Σ_FF X_F = λμ_F + γ1_F` sistemi Cramer ile cozulur,
 * uygunluk (X_F ≥ 0, toplam 1, hedef E) sinanir ve uygun olanlarin en dusuk
 * varyanslisi secilir. Kucuk n icin bu KESIN cozumdur ve CLA'nin parametrik
 * izlemesiyle hicbir ortak yani yoktur.
 */
function referenceConstrained(means: number[], sigma: number[][], target: number): number[] | null {
  const n = means.length;
  let best: number[] | null = null;
  let bestVariance = Number.POSITIVE_INFINITY;

  for (let mask = 1; mask < 1 << n; mask += 1) {
    const free: number[] = [];
    for (let i = 0; i < n; i += 1) if ((mask >> i) & 1) free.push(i);

    const size = free.length;
    let weights: number[];

    if (size === 1) {
      const only = free[0];
      if (only === undefined) continue;
      // Tek varlik: X = 1 ve E ancak μ eslesirse tutar.
      if (Math.abs((means[only] ?? 0) - target) > 1e-9) continue;
      weights = Array.from({ length: n }, (_, i) => (i === only ? 1 : 0));
    } else {
      /*
        Bilinmeyenler: X_F (size), λ, γ. Denklemler:
          Σ_FF X_F − λμ_F − γ1_F = 0     (size adet)
          μ_F'X_F = target
          1'X_F = 1
      */
      const dimension = size + 2;
      const matrix: number[][] = Array.from({ length: dimension }, () =>
        Array.from({ length: dimension }, () => 0),
      );
      const rhs = Array.from({ length: dimension }, () => 0);

      for (let r = 0; r < size; r += 1) {
        const i = free[r];
        if (i === undefined) continue;
        for (let c = 0; c < size; c += 1) {
          const j = free[c];
          if (j === undefined) continue;
          const row = matrix[r];
          if (row !== undefined) row[c] = sigma[i]?.[j] ?? 0;
        }
        const row = matrix[r];
        if (row !== undefined) {
          row[size] = -(means[i] ?? 0);
          row[size + 1] = -1;
        }
      }

      const meanRow = matrix[size];
      const budgetRow = matrix[size + 1];
      if (meanRow === undefined || budgetRow === undefined) continue;
      for (let c = 0; c < size; c += 1) {
        const j = free[c];
        if (j === undefined) continue;
        meanRow[c] = means[j] ?? 0;
        budgetRow[c] = 1;
      }
      rhs[size] = target;
      rhs[size + 1] = 1;

      const solution = cramer(matrix, rhs);
      if (solution === null) continue;

      weights = Array.from({ length: n }, () => 0);
      for (let r = 0; r < size; r += 1) {
        const i = free[r];
        if (i === undefined) continue;
        weights[i] = solution[r] ?? 0;
      }
    }

    if (weights.some((value) => value < -1e-9)) continue;

    const candidate = variance(weights, sigma);
    if (candidate < bestVariance) {
      bestVariance = candidate;
      best = weights;
    }
  }

  return best;
}

describe('§6.2 — kisitli CLA = bagimsiz referans cozum', () => {
  it('turning point"lar arasindaki her E"de esitler', () => {
    const means = [0.08, 0.12, 0.05];
    const sigma = [
      [0.04, 0.006, 0.002],
      [0.006, 0.09, 0.004],
      [0.002, 0.004, 0.0225],
    ];

    const { turningPoints, failure } = criticalLine(means, sigma);
    expect(failure).toBeNull();

    const low = turningPoints[turningPoints.length - 1]?.mean ?? 0;
    const high = turningPoints[0]?.mean ?? 0;

    for (let step = 0; step <= 20; step += 1) {
      const target = low + ((high - low) * step) / 20;
      const reference = referenceConstrained(means, sigma, target);
      expect(reference, `E = ${String(target)} icin referans cozum yok`).not.toBeNull();
      if (reference === null) continue;

      // CLA sinirini turning point'ler arasinda dogrusal interpolasyonla oku.
      let fromCla: number[] | null = null;
      for (let index = 1; index < turningPoints.length; index += 1) {
        const upper = turningPoints[index - 1];
        const lowerPoint = turningPoints[index];
        if (upper === undefined || lowerPoint === undefined) continue;
        if (target > upper.mean + 1e-12 || target < lowerPoint.mean - 1e-12) continue;

        const span = upper.mean - lowerPoint.mean;
        const t = Math.abs(span) < 1e-15 ? 0 : (target - lowerPoint.mean) / span;
        fromCla = lowerPoint.weights.map(
          (value, i) => value + t * ((upper.weights[i] ?? 0) - value),
        );
        break;
      }

      expect(fromCla, `E = ${String(target)} icin CLA parcasi bulunamadi`).not.toBeNull();
      if (fromCla === null) continue;

      // Varyanslar esit olmali; agirliklar dejenere hallerde ayrisabilir ama
      // varyans amac fonksiyonunun kendisi.
      expect(Math.abs(variance(fromCla, sigma) - variance(reference, sigma))).toBeLessThan(1e-9);
    }
  });

  it('X disaridayken de referansla esitler', () => {
    const means = [0.08, 0.12, 0.05];
    const sigma = [
      [0.09, 0.055, 0.001],
      [0.055, 0.04, 0.001],
      [0.001, 0.001, 0.02],
    ];

    const { turningPoints } = criticalLine(means, sigma);
    for (const point of turningPoints) {
      if (!Number.isFinite(point.lambda)) continue;
      const reference = referenceConstrained(means, sigma, point.mean);
      expect(reference).not.toBeNull();
      if (reference === null) continue;
      expect(Math.abs(point.variance - variance(reference, sigma))).toBeLessThan(1e-9);
    }
  });
});
