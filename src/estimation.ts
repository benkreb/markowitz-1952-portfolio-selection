import { criticalLine, portfolioAt } from './cla';
import { expectedReturn, variance } from './moments';
import { cholesky, drawReturns, makeNormal, makeRandom } from './random';
import type { Covariance, Means } from './types';

/**
 * PRD 03 §5.4 — tahmin hatasi deneyi.
 *
 * Chopra & Ziemba (1993) ve Michaud (1989) ile AYNI SORUYU soruyor: makale μ ve
 * Σ'yi BILINIYOR varsayiyor (§7 madde 6), ama gercekte ikisi de ornekten
 * tahmin ediliyor; o tahminin bedeli ne?
 *
 * TASARIM FARKI, ONEMLI. Buradaki hata kaynagi GERCEK ORNEKLEM HATASI: T
 * donemlik bir ornek uretilir ve ornek tahmincileri kullanilir (§5.4 bunu
 * boyle tarif ediyor). Chopra & Ziemba'nin kurulumu ise girdilere KONTROLLU
 * bir carpimsal bozulma uygular; boylece her girdiye AYNI bagil hata verilip
 * "esit hata altinda hangisi daha pahali" sorusu izole edilir.
 *
 * Ikisi ayni sey degil. Buradaki olcum iki etkiyi birlikte tasiyor:
 * optimizasyonun her girdiye duyarliligi VE her girdinin ornekten ne kadar
 * hassas tahmin edilebildigi (ortalamanin standart hatasi σ/√T iken varyansin
 * bagil standart hatasi √(2/(T−1)) mertebesinde). Sayfanin sordugu soru —
 * "T donemlik veriyle calisirsam ne kaybederim" — icin dogru olan bu; ama
 * cikan oran, C&Z'nin bildirdigi oranla DOGRUDAN karsilastirilamaz.
 *
 * Oran ayrica evrensel bir sabit degil: risk toleransina, gercek μ ve Σ'ya ve
 * varlik sayisina gore degisiyor. Olculdu (bu Σ, T = 60):
 *
 *     τ = 0.25  →  10.7 : 2.3 : 1
 *     τ = 0.50  →  19.9 : 2.6 : 1
 *     τ = 1.00  →  359  : 24  : 1
 *
 * Sirala (μ > σ² > σᵢⱼ) her yerde ayni; buyukluk toleransa cok duyarli. Bu
 * duyarlilik C&Z'nin kendi bulgusuyla uyumlu — onlar da orani risk toleransina
 * gore raporluyor.
 *
 * AKIS (§5.4):
 *   1. "Gercek" μ ve Σ alinir
 *   2. T donemlik orneklem uretilir, ornek tahmincisiyle μ̂, Σ̂ hesaplanir
 *   3. μ̂, Σ̂ ile optimize edilir
 *   4. Ortaya cikan agirliklar GERCEK μ, Σ altinda degerlendirilir
 *   5. Kayip olculur
 *   6. Ayni deney yalnizca μ'de, yalnizca varyansta, yalnizca kovaryansta hata
 *      olacak sekilde ayri ayri kosulur
 *
 * KAYIP OLCUSU nakit esdeger kaybi (CEL). Fayda `U(X) = μ'X − X'ΣX / (2τ)`;
 * kayip, gercek parametreler altinda `U(X*) − U(X̂)`. Ham varyans farki
 * kullanilmadi cunku o, getiriden vazgecmeyi bedava gosterirdi — kayip iki
 * boyutu birden tartmali.
 *
 * WORKER YOK. Modul bir GENERATOR donduruyor; ilerlemeyi cagiran taraf surer.
 * `postMessage` burada bilinseydi §9'un "src/ siteden degistirilmeden
 * kopyalandi" kriteri karsilanamazdi.
 */

/** Hatanin hangi girdide oldugu. */
export type ErrorSource = 'all' | 'means' | 'variances' | 'covariances';

export const ERROR_SOURCES: readonly ErrorSource[] = ['all', 'means', 'variances', 'covariances'];

export interface EstimationParams {
  means: Means;
  covariance: Covariance;
  /** Risk tolerans λ; portfoyler bu sabit toleransta karsilastirilir. */
  tolerance: number;
  /** Orneklem uzunlugu T (donem). */
  periods: number;
  trials: number;
  seed: number;
}

export interface SourceResult {
  source: ErrorSource;
  /**
   * Ortalama nakit esdeger kaybi, GETIRI BIRIMINDE (yuzde degil).
   *
   * `U(X*) − U(X̂)`, yani "bu hatayi yapmak yillik kac puan kesinlik-esdegeri
   * getiriye mal oldu". C&Z kaybi yuzde olarak raporluyor; oran ikisinde de
   * ayni cikar, ama mutlak degerler ayni olcekte degil.
   */
  loss: number;
  /** Agirliklarin ornekten ornege savrulmasi: bilesen basina standart sapma. */
  dispersion: number[];
}

export interface EstimationResult {
  /** Gercek parametreler altinda en iyi portfoy. */
  optimal: number[];
  optimalUtility: number;
  /** 1/N portfoyunun ayni olcekteki kaybi. */
  equalWeightLoss: number;
  sources: SourceResult[];
  completed: number;
  total: number;
}

/** `U(X) = μ'X − X'ΣX / (2τ)` */
function utility(
  weights: readonly number[],
  means: Means,
  covariance: Covariance,
  tolerance: number,
): number {
  return expectedReturn(weights, means) - variance(weights, covariance) / (2 * tolerance);
}

function optimise(means: Means, covariance: Covariance, tolerance: number): number[] | null {
  return portfolioAt(criticalLine(means, covariance), tolerance);
}

interface SampleMoments {
  means: number[];
  covariance: number[][];
}

/** T donemlik ornekten ornek ortalamasi ve ornek kovaryansi. */
function sampleMoments(draws: readonly (readonly number[])[], size: number): SampleMoments {
  const periods = draws.length;
  const means = Array.from({ length: size }, (_, i) => {
    let total = 0;
    for (const draw of draws) total += draw[i] ?? 0;
    return total / periods;
  });

  const covariance: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0),
  );

  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      let total = 0;
      for (const draw of draws) {
        total += ((draw[i] ?? 0) - (means[i] ?? 0)) * ((draw[j] ?? 0) - (means[j] ?? 0));
      }
      // Yansiz tahminci: T − 1.
      const row = covariance[i];
      if (row !== undefined) row[j] = total / Math.max(1, periods - 1);
    }
  }

  return { means, covariance };
}

/**
 * Hata kaynagini AYIRAN girdi.
 *
 * Kovaryansi standart sapmalara ve korelasyona ayirip birini ornekten,
 * otekini gercekten almak, "hangi girdideki hata daha pahali" sorusunu
 * cevaplamanin tek durustu yolu. Σ̂'yi butun olarak kullanmak uc etkiyi
 * birbirine karistirirdi.
 */
function blendMoments(
  source: ErrorSource,
  truth: { means: Means; covariance: Covariance },
  sample: SampleMoments,
): { means: Means; covariance: Covariance } {
  if (source === 'all') return { means: sample.means, covariance: sample.covariance };
  if (source === 'means') return { means: sample.means, covariance: truth.covariance };

  const size = truth.means.length;
  const trueSd = Array.from({ length: size }, (_, i) => Math.sqrt(truth.covariance[i]?.[i] ?? 0));
  const sampleSd = Array.from({ length: size }, (_, i) =>
    Math.sqrt(sample.covariance[i]?.[i] ?? 0),
  );

  const covariance: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0),
  );

  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      // Korelasyon hangi kaynaktan geliyorsa oradan; olcek otekinden.
      const fromSample = source === 'covariances';
      const denominator = fromSample
        ? (sampleSd[i] ?? 0) * (sampleSd[j] ?? 0)
        : (trueSd[i] ?? 0) * (trueSd[j] ?? 0);
      const numerator = fromSample
        ? (sample.covariance[i]?.[j] ?? 0)
        : (truth.covariance[i]?.[j] ?? 0);
      const correlation = denominator === 0 ? 0 : numerator / denominator;

      const scale = fromSample
        ? (trueSd[i] ?? 0) * (trueSd[j] ?? 0)
        : (sampleSd[i] ?? 0) * (sampleSd[j] ?? 0);

      const row = covariance[i];
      if (row !== undefined) row[j] = correlation * scale;
    }
  }

  return { means: truth.means, covariance };
}

/**
 * Deneyi KADEMELI kosar.
 *
 * Generator, cunku saf katman ilerlemeyi kendisi bildiremez: `postMessage`
 * bilmek zorunda kalirdi. Cagiran taraf — worker — her adimda kismi sonucu
 * alip iletiyor, boylece ziyaretci bos ekranda spinner beklemiyor (§4.4).
 */
export function* runEstimation(params: EstimationParams): Generator<EstimationResult> {
  const { means, covariance, tolerance, periods, trials, seed } = params;
  const size = means.length;

  const optimal = optimise(means, covariance, tolerance) ?? Array.from({ length: size }, () => 0);
  const optimalUtility = utility(optimal, means, covariance, tolerance);

  const equal = Array.from({ length: size }, () => 1 / size);
  const equalWeightLoss = optimalUtility - utility(equal, means, covariance, tolerance);

  const random = makeRandom(seed);
  const normal = makeNormal(random);
  const lower = cholesky(covariance);

  // Toplanan istatistikler: kaynak basina kayip toplami ve agirlik momentleri.
  const lossTotals = new Map<ErrorSource, number>();
  const weightSums = new Map<ErrorSource, number[]>();
  const weightSquares = new Map<ErrorSource, number[]>();
  for (const source of ERROR_SOURCES) {
    lossTotals.set(source, 0);
    weightSums.set(
      source,
      Array.from({ length: size }, () => 0),
    );
    weightSquares.set(
      source,
      Array.from({ length: size }, () => 0),
    );
  }

  const snapshot = (completed: number): EstimationResult => ({
    optimal,
    optimalUtility,
    equalWeightLoss,
    completed,
    total: trials,
    sources: ERROR_SOURCES.map((source) => {
      const sums = weightSums.get(source) ?? [];
      const squares = weightSquares.get(source) ?? [];
      const count = Math.max(1, completed);

      return {
        source,
        loss: (lossTotals.get(source) ?? 0) / count,
        dispersion: Array.from({ length: size }, (_, i) => {
          const mean = (sums[i] ?? 0) / count;
          const meanSquare = (squares[i] ?? 0) / count;
          return Math.sqrt(Math.max(0, meanSquare - mean * mean));
        }),
      };
    }),
  });

  // Σ ayrisamiyorsa ornek uretilemez; bos ama tutarli bir sonuc doner.
  if (lower === null) {
    yield snapshot(0);
    return;
  }

  for (let trial = 0; trial < trials; trial += 1) {
    const draws = Array.from({ length: periods }, () => drawReturns(means, lower, normal));
    const sample = sampleMoments(draws, size);

    for (const source of ERROR_SOURCES) {
      const inputs = blendMoments(source, { means, covariance }, sample);
      const estimated = optimise(inputs.means, inputs.covariance, tolerance);
      if (estimated === null) continue;

      // ADIM 4: agirliklar GERCEK parametreler altinda degerlendirilir.
      const realised = utility(estimated, means, covariance, tolerance);
      lossTotals.set(source, (lossTotals.get(source) ?? 0) + (optimalUtility - realised));

      const sums = weightSums.get(source);
      const squares = weightSquares.get(source);
      if (sums === undefined || squares === undefined) continue;
      for (let i = 0; i < size; i += 1) {
        const weight = estimated[i] ?? 0;
        sums[i] = (sums[i] ?? 0) + weight;
        squares[i] = (squares[i] ?? 0) + weight * weight;
      }
    }

    yield snapshot(trial + 1);
  }
}
