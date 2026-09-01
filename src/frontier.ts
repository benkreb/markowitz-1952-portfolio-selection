import { criticalLine, type Bounds } from './cla';
import { expectedReturn, variance } from './moments';
import type { Covariance, Means } from './types';

/**
 * PRD 03 §5.3 — V'ye karsi E egrisi. Makalenin Figure 6'si.
 *
 * "Bagli parabol parcalarindan olusur" ifadesi mecaz degil, olgu. Bir critical
 * line uzerinde agirliklar λ'da AFFINE oldugu icin:
 *
 *   E(λ) = μ'p + λ·μ'q          → λ'da dogrusal
 *   V(λ) = (p+λq)'Σ(p+λq)       → λ'da ikinci dereceden
 *
 * λ elenince V, E'nin ikinci dereceden bir fonksiyonu olur — yani her parca
 * TAM OLARAK bir parabol yayidir. Iki turning point arasinda agirliklar da
 * E'de affine kalir, cunku ikisi de ayni λ'nin dogrusal fonksiyonu.
 *
 * Modul saf.
 */

export interface FrontierPoint {
  mean: number;
  variance: number;
  weights: number[];
}

/**
 * Bir parabol yayi, KAPALI formda.
 *
 * Egri orneklenmiyor. Ikinci dereceden bir Bezier tam olarak bir parabol
 * cizer; parca basina uc nokta yeterli ve sonuc yaklasik degil, egrinin
 * kendisi. Ornekleme yapsaydik hem daha cok nokta tasiyacaktik hem "parcali
 * parabol" iddiasi cizimde yaklasik kalacakti.
 */
export interface FrontierArc {
  from: FrontierPoint;
  /** Bezier kontrol noktasi; egrinin uzerinde DEGIL. */
  control: { mean: number; variance: number };
  to: FrontierPoint;
}

export interface FrontierResult {
  arcs: FrontierArc[];
  /** Parca sinirlari; figurde isaretlenir. */
  turningPoints: FrontierPoint[];
  failure: string | null;
}

/** Iki turning point arasinda agirliklar E'de affine ilerler. */
function blend(from: FrontierPoint, to: FrontierPoint, t: number): number[] {
  return from.weights.map((value, index) => value + t * ((to.weights[index] ?? 0) - value));
}

export function frontier(means: Means, covariance: Covariance, bounds?: Bounds): FrontierResult {
  const { turningPoints: raw, failure } = criticalLine(means, covariance, bounds);

  const points: FrontierPoint[] = raw.map((point) => ({
    mean: point.mean,
    variance: point.variance,
    weights: point.weights,
  }));

  const arcs: FrontierArc[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;

    // Ayni E'ye dusen ardisik noktalar bir yay olusturmaz. Ilk parcada
    // gorulur: λ = ∞ ile ilk olay arasinda agirliklar sabittir.
    if (Math.abs(from.mean - to.mean) < 1e-12) continue;

    /*
      Kontrol noktasi ORTA NOKTADAN turetilir. Bezier t = 0.5'te
      (P₀ + 2P₁ + P₂)/4 verdigi icin, egrinin ortasindan gecmesi istenirse

        P₁ = 2·V(orta) − (V₀ + V₂)/2

      olmali. Uc degerlendirme; parcanin tamami bundan ibaret.
    */
    const middleWeights = blend(from, to, 0.5);
    const middleMean = expectedReturn(middleWeights, means);
    const middleVariance = variance(middleWeights, covariance);

    arcs.push({
      from,
      control: {
        mean: middleMean,
        variance: 2 * middleVariance - (from.variance + to.variance) / 2,
      },
      to,
    });
  }

  return { arcs, turningPoints: points, failure };
}
