import type { Covariance, Means, Point2 } from './types';

/**
 * PRD 03 §5.1 — uc varlikli durumun DUZLEM geometrisi.
 *
 * Markowitz (1952) s. 82: X₃ = 1 − X₁ − X₂ ikamesiyle uc varlikli problem
 * (X₁, X₂) duzlemine iner. Makalenin Figure 1-5'i bu duzlemde cizilir.
 *
 * Modul saf; `lib/papers/` altindaki her sey gibi React ve DOM bilmez.
 */

/** Ulasilabilir kume: X₁ ≥ 0, X₂ ≥ 0, X₁ + X₂ ≤ 1 (s. 82). */
export const ATTAINABLE_CORNERS: readonly Point2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

/** Kenar payi: kayan nokta hatasi sinirdaki noktayi disari atmasin. */
const INSIDE_EPSILON = 1e-9;

export function isAttainable(point: Point2): boolean {
  return (
    point.x >= -INSIDE_EPSILON &&
    point.y >= -INSIDE_EPSILON &&
    point.x + point.y <= 1 + INSIDE_EPSILON
  );
}

/**
 * Duzlemde bir dogru: `a·X₁ + b·X₂ = c`.
 *
 * Egim-kesim bicimi (`X₂ = m·X₁ + k`) KULLANILMIYOR. Makale footnote 9'da
 * μ₂ = μ₃ halini ayrica belirtiyor; o durumda isomean dogrulari DIKEY olur ve
 * egim tanimsiz kalirdi. Genel bicim bu hali ayri bir kod yolu gerektirmeden
 * tasiyor — dejenere durum "ozel durum" degil, ayni denklemin bir degeri.
 */
export interface Line {
  a: number;
  b: number;
  c: number;
}

/**
 * ISOMEAN dogrusu: verilen E icin ayni beklenen getiriyi veren portfoyler.
 *
 * E = μ₃ + (μ₁ − μ₃)X₁ + (μ₂ − μ₃)X₂  olduguna gore
 *
 *   (μ₁ − μ₃)X₁ + (μ₂ − μ₃)X₂ = E − μ₃
 *
 * PRD'deki egim-kesim yazimi bunun μ₂ ≠ μ₃ halindeki cozulmus hali.
 */
export function isomeanLine(target: number, means: Means): Line {
  const m1 = means[0] ?? 0;
  const m2 = means[1] ?? 0;
  const m3 = means[2] ?? 0;
  return { a: m1 - m3, b: m2 - m3, c: target - m3 };
}

/**
 * Butun portfoylerin ayni E'yi verdigi dejenere hal.
 *
 * μ₁ = μ₂ = μ₃ oldugunda isomean "dogrusu" ya butun duzlem ya bos kume olur;
 * cizilecek bir dogru yoktur. Cagiran taraf bunu SORMAK zorunda, cunku
 * `clipToAttainable` bu girdide bos donerdi ve sebebi belirsiz kalirdi.
 */
export function isomeanDegenerate(means: Means): boolean {
  const m1 = means[0] ?? 0;
  const m2 = means[1] ?? 0;
  const m3 = means[2] ?? 0;
  return Math.abs(m1 - m3) < INSIDE_EPSILON && Math.abs(m2 - m3) < INSIDE_EPSILON;
}

/**
 * Bir dogrunun ulasilabilir ucgen icinde kalan parcasi.
 *
 * Ucgenin uc kenariyla kesisim alinir, ucgenin icinde kalanlar toplanir ve en
 * uzak iki nokta dondurulur. Kesisim yoksa `null`.
 */
export function clipToAttainable(line: Line): [Point2, Point2] | null {
  const corners = ATTAINABLE_CORNERS;
  const hits: Point2[] = [];

  for (let index = 0; index < corners.length; index += 1) {
    const from = corners[index];
    const to = corners[(index + 1) % corners.length];
    if (from === undefined || to === undefined) continue;

    // Kenar uzerinde f(t) = a·x(t) + b·y(t) − c; kok varsa kesisim var.
    const fFrom = line.a * from.x + line.b * from.y - line.c;
    const fTo = line.a * to.x + line.b * to.y - line.c;
    const delta = fFrom - fTo;

    // Dogru kenara paralel: ya hic kesmez ya kenarin tamami uzerinde. Ikinci
    // halde kenarin uclari zaten diger kenarlardan yakalanir.
    if (Math.abs(delta) < INSIDE_EPSILON) continue;

    const t = fFrom / delta;
    if (t < -INSIDE_EPSILON || t > 1 + INSIDE_EPSILON) continue;

    hits.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }

  if (hits.length < 2) return null;

  let best: [Point2, Point2] | null = null;
  let longest = 0;
  for (let i = 0; i < hits.length; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      const a = hits[i];
      const b = hits[j];
      if (a === undefined || b === undefined) continue;
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      if (length > longest) {
        longest = length;
        best = [a, b];
      }
    }
  }

  // Tek noktada degen (koseden gecen) dogru bir PARCA degildir.
  return longest < INSIDE_EPSILON ? null : best;
}

/**
 * V'nin (X₁, X₂) cinsinden acilimi — Markowitz (1952), footnote 8, p. 85.
 *
 * X₃ = 1 − X₁ − X₂ yerine konunca
 *
 *   V = a·X₁² + b·X₂² + c·X₁X₂ + d·X₁ + e·X₂ + f
 *
 * ve katsayilar dogrudan Σ'dan gelir. Bu bir KAPALI FORM: sayisal turev veya
 * ornekleme yok, dolayisiyla isovariance egrileri gercekten elips, "elipse
 * benzeyen egri" degil (PRD ilke 3).
 */
export interface VarianceForm {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function varianceForm(covariance: Covariance): VarianceForm {
  const s = (i: number, j: number): number => covariance[i]?.[j] ?? 0;

  return {
    a: s(0, 0) + s(2, 2) - 2 * s(0, 2),
    b: s(1, 1) + s(2, 2) - 2 * s(1, 2),
    c: 2 * (s(2, 2) + s(0, 1) - s(0, 2) - s(1, 2)),
    d: 2 * (s(0, 2) - s(2, 2)),
    e: 2 * (s(1, 2) - s(2, 2)),
    f: s(2, 2),
  };
}

export function varianceAt(form: VarianceForm, point: Point2): number {
  const { x, y } = point;
  return form.a * x * x + form.b * y * y + form.c * x * y + form.d * x + form.e * y + form.f;
}

/**
 * MINIMUM VARYANS NOKTASI X — makalenin Figure 1-5'indeki `X`.
 *
 * ∇V = 0 iki bilinmeyenli lineer sistem verir:
 *
 *   2a·X₁ +  c·X₂ = −d
 *    c·X₁ + 2b·X₂ = −e
 *
 * Cramer ile cozulur. KISITSIZ nokta doner: makale bu noktanin ulasilabilir
 * kumenin icinde ya da disinda olabilecegini soyluyor (s. 87) ve iki hal
 * figurun iki farkli okunusunu veriyor — bu yuzden burada kirpilmaz.
 * Ulasilabilirlik `isAttainable` ile ayrica sorulur.
 */
export function minimumVariancePoint(covariance: Covariance): Point2 | null {
  const { a, b, c, d, e } = varianceForm(covariance);

  const determinant = 4 * a * b - c * c;
  // Dejenere Σ: karesel form yozlasmis, tek bir minimum yok.
  if (Math.abs(determinant) < INSIDE_EPSILON) return null;

  return {
    x: (-2 * b * d + c * e) / determinant,
    y: (-2 * a * e + c * d) / determinant,
  };
}

/**
 * ISOVARIANCE ELIPSI: V = level egrisi.
 *
 * Merkez etrafinda ACIYA gore parametrelendirilir. Yon (cosθ, sinθ) icin
 *
 *   Q(θ) = a·cos²θ + b·sin²θ + c·cosθ·sinθ
 *   r(θ) = √((level − Vmin) / Q(θ))
 *
 * Ozdeger ayrisimi gerekmiyor: form pozitif tanimliyken Q(θ) > 0 ve yaricap
 * her yonde kapali formda cikiyor. Ayrisim ayni egriyi cok daha fazla kodla
 * verirdi.
 *
 * `level` minimumun altindaysa egri YOKTUR ve bos dizi doner — cagiran taraf
 * bos bir yol cizmez.
 */
export function isovarianceEllipse(covariance: Covariance, level: number, samples = 64): Point2[] {
  const form = varianceForm(covariance);
  const centre = minimumVariancePoint(covariance);
  if (centre === null) return [];

  const minimum = varianceAt(form, centre);
  const excess = level - minimum;
  if (excess <= 0) return [];

  const points: Point2[] = [];
  for (let index = 0; index < samples; index += 1) {
    const theta = (index / samples) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const q = form.a * cos * cos + form.b * sin * sin + form.c * cos * sin;
    // Q ≤ 0 yalnizca form pozitif tanimli DEGILSE olur; o egri elips degildir.
    if (q <= 0) return [];
    const radius = Math.sqrt(excess / q);
    points.push({ x: centre.x + radius * cos, y: centre.y + radius * sin });
  }

  return points;
}
