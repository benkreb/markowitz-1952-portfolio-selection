import { describe, expect, it } from 'vitest';
import {
  cholesky,
  drawReturns,
  makeNormal,
  makeRandom,
  runEstimation,
  variance,
  type EstimationResult,
} from '../src/index.js';

/**
 * PRD 03 §5.4 / §5.5 — tahmin hatasi deneyi ve rastgelelik.
 *
 * Deneyin dogrulugu tek bir sayiyla sinanmaz; sinanan sey YAPISAL iddialar:
 * ayni tohum ayni sonucu verir, hata kaynaklari beklenen sirada dizilir,
 * orneklem uzadikca kayip duser.
 */

const MU = [0.08, 0.12, 0.05];
const SIGMA = [
  [0.04, 0.006, 0.002],
  [0.006, 0.09, 0.004],
  [0.002, 0.004, 0.0225],
];

function run(overrides: Partial<Parameters<typeof runEstimation>[0]> = {}): EstimationResult {
  let last: EstimationResult | undefined;
  for (const step of runEstimation({
    means: MU,
    covariance: SIGMA,
    tolerance: 0.5,
    periods: 60,
    trials: 200,
    seed: 42,
    ...overrides,
  })) {
    last = step;
  }
  if (last === undefined) throw new Error('sonuc yok');
  return last;
}

function lossOf(result: EstimationResult, source: string): number {
  return result.sources.find((entry) => entry.source === source)?.loss ?? 0;
}

describe('rastgelelik (§5.5)', () => {
  it('ayni tohum ayni diziyi veriyor', () => {
    const a = Array.from({ length: 5 }, makeRandom(9));
    const b = Array.from({ length: 5 }, makeRandom(9));
    expect(a).toEqual(b);
  });

  it('farkli tohum farkli dizi veriyor', () => {
    expect(Array.from({ length: 5 }, makeRandom(1))).not.toEqual(
      Array.from({ length: 5 }, makeRandom(2)),
    );
  });

  it('normal uretec makul ortalama ve varyans veriyor', () => {
    const normal = makeNormal(makeRandom(3));
    const draws = Array.from({ length: 20000 }, () => normal());
    const mean = draws.reduce((total, value) => total + value, 0) / draws.length;
    const spread =
      draws.reduce((total, value) => total + (value - mean) ** 2, 0) / (draws.length - 1);

    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(spread - 1)).toBeLessThan(0.05);
  });

  it('Cholesky ayrisimi Σ"yi geri veriyor', () => {
    const lower = cholesky(SIGMA);
    expect(lower).not.toBeNull();
    if (lower === null) return;

    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        let total = 0;
        for (let k = 0; k < 3; k += 1) total += (lower[i]?.[k] ?? 0) * (lower[j]?.[k] ?? 0);
        expect(Math.abs(total - (SIGMA[i]?.[j] ?? 0))).toBeLessThan(1e-12);
      }
    }
  });

  it('pozitif tanimli olmayan Σ ayrisamiyor', () => {
    expect(
      cholesky([
        [0.04, 0.5, 0],
        [0.5, 0.09, 0],
        [0, 0, 0.16],
      ]),
    ).toBeNull();
  });

  /** Uretilen ornek gercekten Σ'nin korelasyon yapisini tasimali. */
  it('uretilen ornekler Σ"yi yeniden uretiyor', () => {
    const lower = cholesky(SIGMA);
    if (lower === null) throw new Error('ayrisim yok');
    const normal = makeNormal(makeRandom(11));

    const draws = Array.from({ length: 40000 }, () => drawReturns(MU, lower, normal));
    const means = [0, 1, 2].map(
      (i) => draws.reduce((total, draw) => total + (draw[i] ?? 0), 0) / draws.length,
    );

    for (let i = 0; i < 3; i += 1) {
      expect(Math.abs((means[i] ?? 0) - (MU[i] ?? 0))).toBeLessThan(0.01);
      for (let j = 0; j < 3; j += 1) {
        let total = 0;
        for (const draw of draws) {
          total += ((draw[i] ?? 0) - (means[i] ?? 0)) * ((draw[j] ?? 0) - (means[j] ?? 0));
        }
        const estimate = total / (draws.length - 1);
        expect(Math.abs(estimate - (SIGMA[i]?.[j] ?? 0))).toBeLessThan(0.004);
      }
    }
  });
});

describe('tahmin hatasi deneyi (§5.4)', () => {
  it('ayni parametreler ayni sonucu veriyor', () => {
    expect(run()).toEqual(run());
  });

  it('farkli tohum farkli sonuc veriyor', () => {
    expect(run({ seed: 1 })).not.toEqual(run({ seed: 2 }));
  });

  /**
   * Literaturun bulgusu: hatanin ezici cogunlugu μ'den gelir. Chopra & Ziemba
   * (1993) siralamayi means > variances > covariances olarak veriyor.
   */
  it('μ hatasi en pahali kaynak', () => {
    const result = run();
    expect(lossOf(result, 'means')).toBeGreaterThan(lossOf(result, 'variances'));
    expect(lossOf(result, 'variances')).toBeGreaterThan(lossOf(result, 'covariances'));
    // Buyukluk mertebesi: μ hatasi kovaryans hatasindan cok daha pahali.
    expect(lossOf(result, 'means') / lossOf(result, 'covariances')).toBeGreaterThan(5);
  });

  it('butun girdilerde hata, tek girdideki hatadan pahali', () => {
    const result = run();
    expect(lossOf(result, 'all')).toBeGreaterThan(lossOf(result, 'means'));
  });

  /** Orneklem uzadikca tahmin duzelir; kayip DUSMELI. */
  it('uzun orneklemde kayip azaliyor', () => {
    expect(lossOf(run({ periods: 240 }), 'all')).toBeLessThan(lossOf(run({ periods: 24 }), 'all'));
  });

  it('agirliklarin savrulmasi kisa orneklemde daha buyuk', () => {
    const short = run({ periods: 24 }).sources.find((entry) => entry.source === 'all');
    const long = run({ periods: 240 }).sources.find((entry) => entry.source === 'all');
    expect(short).toBeDefined();
    expect(long).toBeDefined();
    if (short === undefined || long === undefined) return;

    const total = (values: number[]): number => values.reduce((sum, value) => sum + value, 0);
    expect(total(short.dispersion)).toBeGreaterThan(total(long.dispersion));
  });

  it('optimal portfoy butce kisitini sagliyor', () => {
    const result = run();
    const sum = result.optimal.reduce((total, value) => total + value, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    expect(variance(result.optimal, SIGMA)).toBeGreaterThan(0);
  });

  /** Kademeli sonuc: her adimda tamamlanan deneme sayisi artiyor. */
  it('ilerleme kademeli geliyor', () => {
    const steps = [
      ...runEstimation({
        means: MU,
        covariance: SIGMA,
        tolerance: 0.5,
        periods: 60,
        trials: 5,
        seed: 42,
      }),
    ];

    expect(steps.map((step) => step.completed)).toEqual([1, 2, 3, 4, 5]);
    for (const step of steps) expect(step.total).toBe(5);
  });

  it('dejenere Σ"da bos ama tutarli sonuc donuyor', () => {
    const result = run({
      covariance: [
        [0.04, 0.04, 0],
        [0.04, 0.04, 0],
        [0, 0, 0.02],
      ],
    });
    expect(result.completed).toBe(0);
    expect(result.sources.length).toBe(4);
  });
});
