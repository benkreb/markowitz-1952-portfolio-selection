/**
 * PRD 03 §2.2 — Markowitz (1952) hesap katmaninin ortak tipleri.
 *
 * SAF TypeScript. React, DOM veya tarayici API'si YOK ve olmayacak: is
 * bittiginde bu klasor oldugu gibi repo'ya kopyalanacak (§9). Bagli oldugu bir
 * sey varsa onu da surukler.
 *
 * Kural `eslint.config.mjs` icinde makineye de anlatildi; yorum tek basina
 * korumaz.
 */

/** Duzlemde bir nokta. Ucuncu agirlik X₃ = 1 − X₁ − X₂ ile ima edilir. */
export interface Point2 {
  x: number;
  y: number;
}

/** Beklenen getiri vektoru μ. */
export type Means = readonly number[];

/** Kovaryans matrisi Σ. Simetrik ve pozitif tanimli varsayilir. */
export type Covariance = readonly (readonly number[])[];

/** Portfoy agirliklari X. */
export type Weights = readonly number[];

/** Bir portfoyun iki momenti (Markowitz 1952, s. 81). */
export interface Moments {
  /** E = Σ Xᵢμᵢ */
  mean: number;
  /** V = Σᵢ Σⱼ σᵢⱼ XᵢXⱼ */
  variance: number;
}
