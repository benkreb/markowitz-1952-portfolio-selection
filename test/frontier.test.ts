import { describe, expect, it } from 'vitest';
import { criticalLine, frontier, variance } from '../src/index.js';

/**
 * PRD 03 §5.3 — V'ye karsi E egrisi, "bagli parabol parcalarindan olusur".
 *
 * Bu testin asil isi o ifadeyi DOGRULAMAK. Egri orneklenmiyor, parca basina
 * ikinci dereceden bir Bezier ile ciziliyor; Bezier tam olarak parabol cizer,
 * ama bunun dogru egri olmasi ancak V gercekten E'nin ikinci dereceden bir
 * fonksiyonuysa gecerli. Test Bezier'i gercek portfoy varyanslariyla
 * karsilastiriyor.
 */

const MU = [0.08, 0.12, 0.05];
const SIGMA = [
  [0.04, 0.006, 0.002],
  [0.006, 0.09, 0.004],
  [0.002, 0.004, 0.0225],
];

/** Ikinci dereceden Bezier degerlendirmesi. */
function bezier(p0: number, p1: number, p2: number, t: number): number {
  const inverse = 1 - t;
  return inverse * inverse * p0 + 2 * inverse * t * p1 + t * t * p2;
}

describe('frontier', () => {
  it('turning point"lar CLA ile ayni', () => {
    const result = frontier(MU, SIGMA);
    const { turningPoints } = criticalLine(MU, SIGMA);

    expect(result.failure).toBeNull();
    expect(result.turningPoints.length).toBe(turningPoints.length);

    for (const [index, point] of result.turningPoints.entries()) {
      expect(point.mean).toBeCloseTo(turningPoints[index]?.mean ?? 0, 12);
      expect(point.variance).toBeCloseTo(turningPoints[index]?.variance ?? 0, 12);
    }
  });

  /**
   * ASIL TEST: Bezier yayi uzerindeki her nokta, o E'yi veren GERCEK
   * portfoyun varyansiyla eslesmeli.
   *
   * Eslesirse "parcali parabol" ifadesi olgu olarak dogrulanmis olur; yay bir
   * yaklasim degil egrinin kendisidir. Eslesmezse cizim guzel gorunur ama
   * yanlis bir egri gosterir — gozle fark edilemeyecek bir hata.
   */
  it('Bezier yayi gercek V(E) egrisiyle ortusuyor', () => {
    const result = frontier(MU, SIGMA);
    expect(result.arcs.length).toBeGreaterThan(0);

    for (const arc of result.arcs) {
      for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const mean = bezier(arc.from.mean, arc.control.mean, arc.to.mean, t);
        const drawn = bezier(arc.from.variance, arc.control.variance, arc.to.variance, t);

        // Ayni t'deki gercek portfoy: agirliklar E'de affine ilerler.
        const weights = arc.from.weights.map(
          (value, index) => value + t * ((arc.to.weights[index] ?? 0) - value),
        );
        const actual = variance(weights, SIGMA);

        expect(Math.abs(drawn - actual)).toBeLessThan(1e-12);
        // Bezier'in E ekseni dogrusal ilerlemeli: kontrol noktasi tam ortada.
        const linear = arc.from.mean + t * (arc.to.mean - arc.from.mean);
        expect(Math.abs(mean - linear)).toBeLessThan(1e-12);
      }
    }
  });

  it('yaylar ucuca ekli', () => {
    const result = frontier(MU, SIGMA);
    for (let index = 1; index < result.arcs.length; index += 1) {
      const previous = result.arcs[index - 1];
      const current = result.arcs[index];
      if (previous === undefined || current === undefined) continue;
      expect(previous.to.mean).toBeCloseTo(current.from.mean, 12);
      expect(previous.to.variance).toBeCloseTo(current.from.variance, 12);
    }
  });

  /** Ayni E'ye dusen ardisik noktalar yay uretmez; ilk parcada gorulur. */
  it('sifir uzunluklu parca yay uretmiyor', () => {
    const result = frontier(MU, SIGMA);
    for (const arc of result.arcs) {
      expect(Math.abs(arc.to.mean - arc.from.mean)).toBeGreaterThan(1e-12);
    }
    // Dort turning point, ilki sifir uzunluklu: uc degil iki yay.
    expect(result.arcs.length).toBe(result.turningPoints.length - 2);
  });

  it('dejenere Σ"da sebep tasiniyor', () => {
    const singular = [
      [0.04, 0.04, 0],
      [0.04, 0.04, 0],
      [0, 0, 0.02],
    ];
    expect(frontier([0.1, 0.08, 0.05], singular).failure).not.toBeNull();
  });
});
