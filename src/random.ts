import type { Covariance } from './types';

/**
 * PRD 03 §5.5 — rastgelelik.
 *
 * `Math.random` KULLANILMAZ. Ayni parametreler ayni sonucu uretmek zorunda:
 * ziyaretci bir sonucu paylastiginda karsi taraf aynisini gormeli, ve bir
 * hata bildirildiginde tekrar uretilebilmeli. Tarayicinin PRNG'si tohumlanamaz,
 * bu yuzden kendi uretecimiz var.
 *
 * Modul saf.
 */

/**
 * mulberry32 — 32 bit durumlu, tohumlanabilir uretec.
 *
 * Kriptografik degil ve olmasi gerekmiyor; istenen sey tekrarlanabilirlik ve
 * makul dagilim. Mersenne Twister gibi buyuk durumlu bir uretec tasimak bu
 * olcekte gereksiz agirlik olurdu.
 */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller ile standart normal.
 *
 * Iki uniform degerden IKI normal uretiyor; ikincisi saklaniyor, cunku atmak
 * uretec cagrilarini iki katina cikarirdi ve Monte Carlo dongusunde bu
 * olculebilir bir fark.
 */
export function makeNormal(random: () => number): () => number {
  let spare: number | null = null;

  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }

    // `u` sifir olursa log tanimsiz; uretec [0,1) verdigi icin taban kaydirilir.
    const u = 1 - random();
    const v = random();
    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;

    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/**
 * PRD §5.5 — Cholesky ayrisimi; `Σ = L·Lᵀ`.
 *
 * Korelasyonlu ornek uretmenin yolu: bagimsiz normalleri `L` ile carpmak.
 * Ayrisim ancak Σ pozitif tanimliysa tamamlanir, yani uretim adimi girdinin
 * gecerliligini kendiliginden dogruluyor.
 *
 * `lib/figures/matrix.ts` icinde de bir Cholesky var ve KASITLI olarak ayri:
 * orada UI dogrulamasi icin "gecerli mi" diye soruluyor, burada ornek
 * uretiliyor. Paylasmak saf kagit katmanini site altyapisina baglardi ve
 * PRD §9'un repo cikarma adimini bozardi.
 */
/**
 * Pivot esigi: matrisin OLCEGINE gore.
 *
 * `sum <= 0` yeterli degil. Tekil bir matriste kayan nokta hatasi kosegen
 * terimini sifirin bir tik ustune tasiyabiliyor — olculdu: satirlari ayni olan
 * bir Σ'de pivot 2.6e-9 cikti ve ayrisim "basarili" sayildi. Oradan uretilen
 * ornek anlamsizdir. Esik mutlak degil BAGIL, cunku Σ'nin olcegi (gunluk mu
 * yillik mi getiri) uygulamaya gore degisir.
 */
const PIVOT_EPSILON = 1e-12;

function pivotFloor(matrix: readonly (readonly number[])[]): number {
  let largest = 0;
  for (let i = 0; i < matrix.length; i += 1) largest = Math.max(largest, matrix[i]?.[i] ?? 0);
  return largest * PIVOT_EPSILON;
}

export function cholesky(matrix: Covariance): number[][] | null {
  const n = matrix.length;
  const floor = pivotFloor(matrix);
  const lower: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = matrix[i]?.[j] ?? 0;
      for (let k = 0; k < j; k += 1) sum -= (lower[i]?.[k] ?? 0) * (lower[j]?.[k] ?? 0);

      const row = lower[i];
      if (row === undefined) return null;

      if (i === j) {
        if (sum <= floor) return null;
        row[j] = Math.sqrt(sum);
      } else {
        const pivot = lower[j]?.[j] ?? 0;
        if (pivot === 0) return null;
        row[j] = sum / pivot;
      }
    }
  }

  return lower;
}

/** `μ + L·z` — tek bir korelasyonlu getiri vektoru. */
export function drawReturns(
  means: readonly number[],
  lower: readonly (readonly number[])[],
  normal: () => number,
): number[] {
  const n = means.length;
  const z = Array.from({ length: n }, () => normal());

  return Array.from({ length: n }, (_, i) => {
    let total = means[i] ?? 0;
    for (let k = 0; k <= i; k += 1) total += (lower[i]?.[k] ?? 0) * (z[k] ?? 0);
    return total;
  });
}
