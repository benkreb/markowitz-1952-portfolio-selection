import { describe, expect, it } from 'vitest';
import {
  ATTAINABLE_CORNERS,
  clipToAttainable,
  expand,
  expectedReturn,
  isAttainable,
  isomeanDegenerate,
  isomeanLine,
  isovarianceEllipse,
  minimumVariancePoint,
  variance,
  varianceAt,
  varianceForm,
} from '../src/index.js';

/**
 * PRD 03 §5.1 — uc varlikli geometri.
 *
 * Testler makalenin iddialarini dogruluyor, uygulamanin kendi ciktisini degil:
 * V acilimi cift toplamla ayni sonucu vermeli, isomean dogrusu uzerindeki her
 * nokta ayni E'yi tasimali, elips uzerindeki her nokta ayni V'yi.
 */

const MU = [0.08, 0.12, 0.05];

/** Kosegen agirlikli, yani pozitif tanimli. */
const SIGMA = [
  [0.04, 0.006, 0.002],
  [0.006, 0.09, 0.004],
  [0.002, 0.004, 0.0225],
];

function close(a: number, b: number, tolerance = 1e-9): void {
  expect(Math.abs(a - b)).toBeLessThan(tolerance);
}

describe('momentler', () => {
  it('E = Σ Xᵢμᵢ', () => {
    close(expectedReturn([0.5, 0.3, 0.2], MU), 0.5 * 0.08 + 0.3 * 0.12 + 0.2 * 0.05);
  });

  it('esit agirlikta V kovaryanslari da sayiyor', () => {
    const equal = [1 / 3, 1 / 3, 1 / 3];
    let expected = 0;
    for (const row of SIGMA) for (const cell of row) expected += cell / 9;
    close(variance(equal, SIGMA), expected);
  });

  /** Tek varlikta V, o varligin kendi varyansi olmali. */
  it('tek varlikta V = σᵢᵢ', () => {
    close(variance([1, 0, 0], SIGMA), 0.04);
    close(variance([0, 0, 1], SIGMA), 0.0225);
  });
});

describe('V acilimi (footnote 8)', () => {
  /**
   * Acilim ile CIFT TOPLAM ayni sayiyi vermeli. Bu testin korudugu sey
   * katsayilarin dogrulugu: bir isaret hatasi burada aninda cikar, figurde ise
   * "biraz kaymis" bir elips olarak gorunur ve gozden kacar.
   */
  it('cift toplamla ayni sonucu veriyor', () => {
    const form = varianceForm(SIGMA);

    for (const [x1, x2] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [0.3, 0.2],
      [0.5, 0.5],
      [-0.4, 0.9],
      [1.2, -0.3],
    ] as const) {
      close(varianceAt(form, { x: x1, y: x2 }), variance(expand(x1, x2), SIGMA), 1e-12);
    }
  });
});

describe('minimum varyans noktasi', () => {
  it('gradyan orada sifir', () => {
    const point = minimumVariancePoint(SIGMA);
    expect(point).not.toBeNull();
    if (point === null) return;

    const form = varianceForm(SIGMA);
    const h = 1e-6;
    const dx =
      (varianceAt(form, { x: point.x + h, y: point.y }) -
        varianceAt(form, { x: point.x - h, y: point.y })) /
      (2 * h);
    const dy =
      (varianceAt(form, { x: point.x, y: point.y + h }) -
        varianceAt(form, { x: point.x, y: point.y - h })) /
      (2 * h);

    close(dx, 0, 1e-8);
    close(dy, 0, 1e-8);
  });

  it('cevresindeki her noktadan dusuk V veriyor', () => {
    const point = minimumVariancePoint(SIGMA);
    expect(point).not.toBeNull();
    if (point === null) return;

    const form = varianceForm(SIGMA);
    const here = varianceAt(form, point);

    for (const [dx, dy] of [
      [0.05, 0],
      [-0.05, 0],
      [0, 0.05],
      [0, -0.05],
      [0.04, 0.04],
    ] as const) {
      expect(varianceAt(form, { x: point.x + dx, y: point.y + dy })).toBeGreaterThan(here);
    }
  });
});

describe('isomean dogrulari', () => {
  it('dogru uzerindeki her nokta ayni E veriyor', () => {
    const target = 0.09;
    const line = isomeanLine(target, MU);
    const segment = clipToAttainable(line);
    expect(segment).not.toBeNull();
    if (segment === null) return;

    const [from, to] = segment;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      close(expectedReturn(expand(x, y), MU), target, 1e-12);
    }
  });

  /**
   * PRD §5.1 / makale footnote 9 — μ₂ = μ₃ hali.
   *
   * Egim-kesim biciminde bu dogru TANIMSIZ olurdu (bolen sifir). Genel bicimde
   * yalnizca `b = 0` cikar, yani dogru dikeydir ve kirpma calismaya devam eder.
   */
  it('μ₂ = μ₃ oldugunda dogru dikey ve hala kirpilabiliyor', () => {
    const means = [0.08, 0.05, 0.05];
    const line = isomeanLine(0.065, means);

    close(line.b, 0);
    expect(isomeanDegenerate(means)).toBe(false);

    const segment = clipToAttainable(line);
    expect(segment).not.toBeNull();
    if (segment === null) return;

    // Dikey dogru: iki ucun X₁'i ayni.
    close(segment[0].x, segment[1].x, 1e-9);
    for (const point of segment)
      close(expectedReturn(expand(point.x, point.y), means), 0.065, 1e-12);
  });

  /** Butun getiriler esitse cizilecek bir dogru yok; cagiran taraf sormali. */
  it('butun μ esitse dejenere isaretleniyor', () => {
    expect(isomeanDegenerate([0.05, 0.05, 0.05])).toBe(true);
    expect(isomeanDegenerate(MU)).toBe(false);
  });

  it('ulasilamayan E icin parca dondurmuyor', () => {
    // Butun μ degerlerinin uzerinde bir hedef ucgeni hic kesmez.
    expect(clipToAttainable(isomeanLine(0.5, MU))).toBeNull();
  });
});

describe('ulasilabilir kume', () => {
  it('koseler kumede', () => {
    for (const corner of ATTAINABLE_CORNERS) expect(isAttainable(corner)).toBe(true);
  });

  it('negatif agirlik disarida', () => {
    expect(isAttainable({ x: -0.01, y: 0.5 })).toBe(false);
    expect(isAttainable({ x: 0.6, y: 0.6 })).toBe(false);
  });

  it('kirpilan parcanin iki ucu da kumede', () => {
    const segment = clipToAttainable(isomeanLine(0.09, MU));
    expect(segment).not.toBeNull();
    if (segment === null) return;
    for (const point of segment) expect(isAttainable(point)).toBe(true);
  });
});

describe('isovariance elipsleri', () => {
  it('elips uzerindeki her nokta ayni V veriyor', () => {
    const form = varianceForm(SIGMA);
    const level = 0.03;
    const points = isovarianceEllipse(SIGMA, level, 24);

    expect(points.length).toBe(24);
    for (const point of points) close(varianceAt(form, point), level, 1e-9);
  });

  /** Minimumun altinda bir seviyede egri YOKTUR; bos yol cizilmemeli. */
  it('minimumun altinda bos donuyor', () => {
    const centre = minimumVariancePoint(SIGMA);
    expect(centre).not.toBeNull();
    if (centre === null) return;

    const minimum = varianceAt(varianceForm(SIGMA), centre);
    expect(isovarianceEllipse(SIGMA, minimum - 0.001)).toEqual([]);
    expect(isovarianceEllipse(SIGMA, minimum)).toEqual([]);
  });

  it('es merkezli: buyuk seviye kucugu kapsiyor', () => {
    const centre = minimumVariancePoint(SIGMA);
    if (centre === null) throw new Error('merkez yok');

    const inner = isovarianceEllipse(SIGMA, 0.03, 16);
    const outer = isovarianceEllipse(SIGMA, 0.06, 16);

    for (let index = 0; index < inner.length; index += 1) {
      const a = inner[index];
      const b = outer[index];
      if (a === undefined || b === undefined) continue;
      const rInner = Math.hypot(a.x - centre.x, a.y - centre.y);
      const rOuter = Math.hypot(b.x - centre.x, b.y - centre.y);
      expect(rOuter).toBeGreaterThan(rInner);
    }
  });
});
