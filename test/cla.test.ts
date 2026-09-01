import { describe, expect, it } from 'vitest';
import {
  LONG_ONLY,
  criticalLine,
  expectedReturn,
  isAttainable,
  minimumVariancePoint,
  variance,
} from '../src/index.js';

/**
 * PRD 03 §5.2 — Critical Line Algorithm ve ZORUNLU kose durumlari.
 *
 * Testler algoritmanin kendi ciktisini tekrar etmiyor; her biri KKT'den ya da
 * makalenin ifadesinden gelen bagimsiz bir sarti kontrol ediyor.
 */

const MU = [0.08, 0.12, 0.05];
const SIGMA = [
  [0.04, 0.006, 0.002],
  [0.006, 0.09, 0.004],
  [0.002, 0.004, 0.0225],
];

function sums(weights: readonly number[]): number {
  return weights.reduce((total, value) => total + value, 0);
}

describe('temel yapi', () => {
  it('her turning point butce kisitini sagliyor', () => {
    const { turningPoints, failure } = criticalLine(MU, SIGMA);
    expect(failure).toBeNull();
    expect(turningPoints.length).toBeGreaterThan(1);

    for (const point of turningPoints) {
      expect(Math.abs(sums(point.weights) - 1)).toBeLessThan(1e-9);
    }
  });

  it('hicbir agirlik negatif degil (Xᵢ ≥ 0)', () => {
    const { turningPoints } = criticalLine(MU, SIGMA);
    for (const point of turningPoints) {
      for (const weight of point.weights) expect(weight).toBeGreaterThan(-1e-9);
    }
  });

  /** λ = ∞ ucunda amac μ'X'e iner: en yuksek getirili varlik. */
  it('en yuksek getiri ucundan basliyor', () => {
    const first = criticalLine(MU, SIGMA).turningPoints[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    expect(first.mean).toBeCloseTo(Math.max(...MU), 10);
    expect(first.weights[1]).toBeCloseTo(1, 10);
  });

  /**
   * λ azaldikca hem E hem V duser. Bu, sinirin ETKIN olmasinin ta kendisi:
   * daha yuksek getiri ancak daha yuksek varyansla alinir.
   */
  it('λ azalirken E ve V birlikte azaliyor', () => {
    const { turningPoints } = criticalLine(MU, SIGMA);

    for (let index = 1; index < turningPoints.length; index += 1) {
      const previous = turningPoints[index - 1];
      const current = turningPoints[index];
      if (previous === undefined || current === undefined) continue;

      expect(current.mean).toBeLessThanOrEqual(previous.mean + 1e-9);
      expect(current.variance).toBeLessThanOrEqual(previous.variance + 1e-9);
    }
  });

  /** Son turning point λ = 0: kisitli global minimum varyans portfoyu. */
  it('λ = 0 noktasi kisitli minimum varyansi veriyor', () => {
    const { turningPoints } = criticalLine(MU, SIGMA);
    const last = turningPoints[turningPoints.length - 1];
    expect(last).toBeDefined();
    if (last === undefined) return;

    expect(last.lambda).toBe(0);

    // Kisitli kumede daha dusuk varyansli bir nokta bulunamamali.
    for (let x1 = 0; x1 <= 1.0001; x1 += 0.02) {
      for (let x2 = 0; x1 + x2 <= 1.0001; x2 += 0.02) {
        const candidate = [x1, x2, 1 - x1 - x2];
        expect(variance(candidate, SIGMA)).toBeGreaterThan(last.variance - 1e-9);
      }
    }
  });
});

/** PRD §5.2 — ele alinmasi ZORUNLU dort kose durumu. */
describe('kose durumlari', () => {
  /**
   * (1) BIRDEN FAZLA KISIT AYNI ANDA AKTIF.
   *
   * Σ, 1. ve 2. varlik takasi altinda simetrik ve μ'leri esit; ikisi serbest
   * kumeye AYNI λ'da girer. Olaylar tek tek uygulansaydi ikinci olay bir
   * sonraki adimda "gecmiste kalmis" bir λ'da aranir ve algoritma kilitlenirdi.
   */
  it('ayni λ"da iki olay birlikte uygulaniyor', () => {
    const means = [0.1, 0.05, 0.05];
    const sigma = [
      [0.04, 0.005, 0.005],
      [0.005, 0.02, 0.001],
      [0.005, 0.001, 0.02],
    ];

    const { turningPoints, failure } = criticalLine(means, sigma);
    expect(failure).toBeNull();

    const last = turningPoints[turningPoints.length - 1];
    expect(last).toBeDefined();
    if (last === undefined) return;

    // Ikisi de girdi ve simetri geregi agirliklari esit.
    expect(last.free).toEqual([0, 1, 2]);
    expect(last.weights[1]).toBeCloseTo(last.weights[2] ?? 0, 10);
  });

  /**
   * (2) IKI VARLIGIN μ"su AYNI — hem tepede hem genel.
   *
   * Butun μ esit oldugunda sinir tek bir NOKTAYA coker: her portfoy ayni E'yi
   * verir, geriye yalnizca minimum varyans kalir.
   */
  it('butun μ esitken sinir tek noktaya cokuyor', () => {
    const flat = [0.07, 0.07, 0.07];
    const { turningPoints, failure } = criticalLine(flat, SIGMA);

    expect(failure).toBeNull();
    for (const point of turningPoints) {
      expect(point.mean).toBeCloseTo(0.07, 10);
      expect(point.free).toEqual([0, 1, 2]);
    }
  });

  it('tepede beraberlik varsa ikisi de serbest basliyor', () => {
    const tied = [0.12, 0.12, 0.05];
    const first = criticalLine(tied, SIGMA).turningPoints[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    expect(first.free).toEqual([0, 1]);
    expect(first.mean).toBeCloseTo(0.12, 10);
  });

  /**
   * (3) DEJENERE Σ.
   *
   * Iki varlik mukemmel korelasyonlu; alt sistem tekil. Algoritma NaN uretip
   * sessizce yayilmak yerine oraya kadar bulduklarini ve bir SEBEP dondurur.
   */
  it('tekil Σ"da sebep bildiriliyor, NaN uretilmiyor', () => {
    const singular = [
      [0.04, 0.04, 0],
      [0.04, 0.04, 0],
      [0, 0, 0.02],
    ];

    const { turningPoints, failure } = criticalLine([0.1, 0.08, 0.05], singular);

    expect(failure).not.toBeNull();
    for (const point of turningPoints) {
      for (const weight of point.weights) expect(Number.isFinite(weight)).toBe(true);
    }
  });

  /**
   * (4) MINIMUM VARYANS NOKTASI ulasilabilir kumenin ICINDE ya da DISINDA.
   *
   * Makale (s. 87) iki hali ayirir ve §7.1'in `x-inside` / `x-outside`
   * preset'leri buna dayanir. Disarida oldugunda kisitli cozum SINIRA oturur,
   * yani en az bir agirlik tam 0 olur.
   */
  it('X iceridEyken kisitli cozum ic noktada', () => {
    const point = minimumVariancePoint(SIGMA);
    expect(point).not.toBeNull();
    if (point === null) return;
    expect(isAttainable(point)).toBe(true);

    const { turningPoints } = criticalLine(MU, SIGMA);
    const last = turningPoints[turningPoints.length - 1];
    expect(last).toBeDefined();
    if (last === undefined) return;

    for (const weight of last.weights) expect(weight).toBeGreaterThan(1e-6);
    expect(last.weights[0]).toBeCloseTo(point.x, 8);
    expect(last.weights[1]).toBeCloseTo(point.y, 8);
  });

  it('X disaridayken kisitli cozum sinira oturuyor', () => {
    // 0 ve 1 guclu korelasyonlu, 0 daha riskli: kisitsiz cozum 0'i acik satar.
    const sigma = [
      [0.09, 0.055, 0.001],
      [0.055, 0.04, 0.001],
      [0.001, 0.001, 0.02],
    ];

    const point = minimumVariancePoint(sigma);
    expect(point).not.toBeNull();
    if (point === null) return;
    expect(isAttainable(point)).toBe(false);

    const { turningPoints } = criticalLine(MU, sigma);
    const last = turningPoints[turningPoints.length - 1];
    expect(last).toBeDefined();
    if (last === undefined) return;

    // En az bir agirlik tam tabanda.
    expect(Math.min(...last.weights)).toBeCloseTo(0, 9);
    expect(Math.abs(sums(last.weights) - 1)).toBeLessThan(1e-9);
  });
});

describe('E ve V tutarliligi', () => {
  it('kaydedilen momentler agirliklardan yeniden hesaplaniyor', () => {
    const { turningPoints } = criticalLine(MU, SIGMA);
    for (const point of turningPoints) {
      expect(point.mean).toBeCloseTo(expectedReturn(point.weights, MU), 12);
      expect(point.variance).toBeCloseTo(variance(point.weights, SIGMA), 12);
    }
  });

  it('varsayilan kisit LONG_ONLY', () => {
    const explicit = criticalLine(MU, SIGMA, LONG_ONLY);
    const implicit = criticalLine(MU, SIGMA);
    expect(implicit.turningPoints.length).toBe(explicit.turningPoints.length);
  });
});
