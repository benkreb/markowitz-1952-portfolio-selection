import { dot, solve, submatrix, subvector } from './linalg';
import { expectedReturn, variance } from './moments';
import type { Covariance, Means } from './types';

/**
 * PRD 03 §5.2 — Critical Line Algorithm.
 *
 * Makalenin footnote 10'unda tarif edilen algoritma SIFIRDAN yazildi; genel
 * amacli bir QP solver kullanilmadi. Sebep PRD'nin kendi gerekcesi: seri
 * makaleleri OKUYUP UYGULAMAK uzerine kurulu, hazir bir cozucu cagirmak
 * makaleyi uygulamak sayilmaz.
 *
 * ---
 *
 * FIKIR. Problem, λ ≥ 0 icin
 *
 *     max  λ·μ'X − ½·X'ΣX      s.t.  1'X = 1,  X ≥ 0
 *
 * ailesidir. λ = ∞ en yuksek getiri, λ = 0 en dusuk varyans ucudur; arada
 * butun etkin portfoyler yatar. Cozum λ'nin PARCALI DOGRUSAL bir fonksiyonudur:
 * hangi varliklarin serbest (0'dan buyuk) oldugu degismedigi surece agirliklar
 * λ ile dogrusal ilerler. O dogru parcalarina "critical line", uclarina
 * "turning point" denir.
 *
 * BIR PARCA UZERINDE. Serbest kume F icin KKT sartlari
 *
 *     Σ_FF X_F = λ·μ_F + γ·1_F ,      1'X_F = 1
 *
 * verir. `y = Σ_FF⁻¹μ_F`, `z = Σ_FF⁻¹1_F`, `b = 1'y`, `c = 1'z` dersek
 *
 *     X_F(λ) = z/c + λ·(y − (b/c)·z) = p + λ·q
 *
 * yani agirliklar λ'da AFFINE. Ters matris hic kurulmaz; iki sistem cozulur.
 *
 * PARCANIN SONU. λ azaltilirken iki olay parcayi bitirir:
 *   (a) serbest bir agirlik 0'a iner  → varlik F'den CIKAR
 *   (b) disaridaki bir varligin indirgenmis maliyeti 0'a iner → F'ye GIRER
 * Ikisi de λ'da affine oldugu icin her aday kok kapali formda bulunur; bir
 * sonraki turning point bunlarin mevcut λ'nin ALTINDAKI en buyugudur.
 *
 * BASLANGIC. λ = ∞'da amac μ'X'e indirgenir, yani en yuksek μ'ye sahip
 * varlik(lar). Beraberlik varsa hepsi serbest baslar ve aralarindaki minimum
 * varyans bilesimi alinir — formul bunu kendiliginden verir, cunku μ_F sabit
 * oldugunda q = 0 cikar ve X_F = p sonlu kalir.
 */

/**
 * PRD §5.2 — kisit arayuzu "pluggable tasarlanir, TEK implementasyonla".
 *
 * Yalnizca alt sinir var. Ust sinir ve genel lineer kisit makalenin
 * formulasyonunda YOK (§5.2) ve kullanilmayan makineyi simdiden yazmak PRD'nin
 * acikca kacinmak istedigi sey. Dikis burada: varlik basina taban degistirmek
 * icin yeni bir uygulama yeter, algoritma degismez.
 */
export interface Bounds {
  lower: (index: number) => number;
}

/** Makalenin orijinal kisiti: Xᵢ ≥ 0. */
export const LONG_ONLY: Bounds = { lower: () => 0 };

export interface TurningPoint {
  /** Bu noktayi ureten λ. Ilk nokta icin `Infinity`. */
  lambda: number;
  weights: number[];
  mean: number;
  variance: number;
  /** Serbest varliklarin indisleri; parcali yapiyi okunur kilar. */
  free: number[];
}

export interface ClaResult {
  turningPoints: TurningPoint[];
  /** Cozulemeyen bir alt sistem varsa sebebi; yoksa `null`. */
  failure: string | null;
}

/** Sayisal karsilastirma esigi. Agirliklar 0-1 olceginde. */
const EPSILON = 1e-10;

interface Segment {
  /** X_F(λ) = p + λ·q */
  p: number[];
  q: number[];
  /** γ(λ) = 1/c − λ·b/c */
  b: number;
  c: number;
}

/** Bir serbest kume icin critical line katsayilari. */
function segmentFor(free: readonly number[], means: Means, covariance: Covariance): Segment | null {
  const sigma = submatrix(covariance, free);
  const mu = subvector(means, free);
  const ones = free.map(() => 1);

  const y = solve(sigma, mu);
  const z = solve(sigma, ones);
  if (y === null || z === null) return null;

  const b = dot(ones, y);
  const c = dot(ones, z);
  if (Math.abs(c) < EPSILON) return null;

  const p = z.map((value) => value / c);
  const q = y.map((value, index) => value - (b / c) * (z[index] ?? 0));

  return { p, q, b, c };
}

function weightsAt(
  free: readonly number[],
  segment: Segment,
  lambda: number,
  size: number,
): number[] {
  const weights = Array.from({ length: size }, () => 0);
  for (let k = 0; k < free.length; k += 1) {
    const index = free[k];
    if (index === undefined) continue;
    // λ = ∞ halinde q = 0 oldugu icin carpim tanimsiz olur; p tek basina yeter.
    const slope = segment.q[k] ?? 0;
    weights[index] = (segment.p[k] ?? 0) + (Number.isFinite(lambda) ? lambda * slope : 0);
  }
  return weights;
}

/**
 * Disaridaki bir varligin indirgenmis maliyeti: `r_j(λ) = α + λ·β`.
 *
 * KKT'ye gore tabandaki bir varlik icin `(ΣX)_j − λμ_j − γ ≥ 0` olmali. Esitlik
 * noktasi varligin serbest kumeye GIRDIGI λ'dir.
 */
function reducedCost(
  j: number,
  free: readonly number[],
  segment: Segment,
  means: Means,
  covariance: Covariance,
): { alpha: number; beta: number } {
  let sigmaP = 0;
  let sigmaQ = 0;
  for (let k = 0; k < free.length; k += 1) {
    const index = free[k];
    if (index === undefined) continue;
    const sigmaJI = covariance[j]?.[index] ?? 0;
    sigmaP += sigmaJI * (segment.p[k] ?? 0);
    sigmaQ += sigmaJI * (segment.q[k] ?? 0);
  }

  return {
    alpha: sigmaP - 1 / segment.c,
    beta: sigmaQ - (means[j] ?? 0) + segment.b / segment.c,
  };
}

/** `value = 0` kokunu verir; egim sifirsa kok yok. */
function rootOf(constant: number, slope: number): number | null {
  if (Math.abs(slope) < EPSILON) return null;
  return -constant / slope;
}

/**
 * PRD §5.2 — etkin sinirin turning point'leri.
 *
 * λ = ∞'dan 0'a inilir. Her adimda bir sonraki olayin λ'si bulunur, o noktada
 * turning point kaydedilir ve serbest kume guncellenir.
 */
export function criticalLine(
  means: Means,
  covariance: Covariance,
  bounds: Bounds = LONG_ONLY,
): ClaResult {
  const size = means.length;
  if (size === 0) return { turningPoints: [], failure: 'bos girdi' };

  const turningPoints: TurningPoint[] = [];

  const record = (lambda: number, free: readonly number[], segment: Segment): void => {
    const weights = weightsAt(free, segment, lambda, size);
    turningPoints.push({
      lambda,
      weights,
      mean: expectedReturn(weights, means),
      variance: variance(weights, covariance),
      free: [...free],
    });
  };

  /*
    BASLANGIC: en yuksek μ'ye sahip varliklar. Beraberlik varsa hepsi serbest
    baslar; formul aralarindaki minimum varyans bilesimini kendiliginden verir
    (μ_F sabit oldugunda q = 0).
  */
  let best = Number.NEGATIVE_INFINITY;
  for (const value of means) best = Math.max(best, value);
  let free = means
    .map((value, index) => ({ value, index }))
    .filter((item) => Math.abs(item.value - best) < EPSILON)
    .map((item) => item.index);

  let segment = segmentFor(free, means, covariance);
  if (segment === null) {
    return { turningPoints: [], failure: 'baslangic alt sistemi cozulemedi (dejenere Σ)' };
  }

  record(Number.POSITIVE_INFINITY, free, segment);

  let lambda = Number.POSITIVE_INFINITY;
  // Guvenlik siniri: her adim serbest kumeyi degistirir, dolayisiyla adim
  // sayisi sonlu. Ust sinir yine de konuluyor ki bir sayisal patoloji sonsuz
  // donguye cevrilmesin.
  const maxSteps = 4 * size + 16;

  for (let step = 0; step < maxSteps; step += 1) {
    let nextLambda = Number.NEGATIVE_INFINITY;
    let leaving: number[] = [];
    let entering: number[] = [];

    /*
      (a) Serbest bir agirlik tabana iniyor mu?

      KOKUN VARLIGI YETMEZ, YONU DE DOGRU OLMALI. `X_k(λ) = p + λq` afin bir
      fonksiyon ve λ AZALARAK ilerliyoruz. Agirlik tabana ancak `q > 0` iken
      YAKLASIR; `q < 0` iken λ dustukce agirlik ARTAR, yani taban cizgisini
      ters yonden kesiyor ve bulunan kok gecmiste kalmis sahte bir olaydir.

      Yon kontrolu yokken bu sahte olaylar gercek sanilip varlik serbest
      kumeden ATILIYORDU. Sonucu olculdu: atilan varligin indirgenmis maliyeti
      negatif kaliyor (KKT ihlali) ve sinirin o parcasi artik etkin degil —
      algoritma ulasilabilir, daha iyi portfoyleri hic gormuyordu.
    */
    for (let k = 0; k < free.length; k += 1) {
      const index = free[k];
      if (index === undefined) continue;
      const slope = segment.q[k] ?? 0;
      // Yalnizca tabana DOGRU hareket eden agirlik ayrilabilir.
      if (slope <= EPSILON) continue;
      const root = rootOf((segment.p[k] ?? 0) - bounds.lower(index), slope);
      if (root === null || root >= lambda - EPSILON || root < -EPSILON) continue;

      if (root > nextLambda + EPSILON) {
        nextLambda = root;
        leaving = [index];
        entering = [];
      } else if (Math.abs(root - nextLambda) <= EPSILON) {
        leaving.push(index);
      }
    }

    /*
      (b) Disaridaki bir varlik giriyor mu?

      Ayni yon kontrolu burada da gerekiyor. `r_j(λ) = α + λβ` ve tabandaki
      bir varlik icin KKT `r_j ≥ 0` istiyor. λ azalirken `r_j` ancak `β > 0`
      iken sifira DUSER; `β < 0` iken kok, `r_j`'nin sifirin ustune ciktigi
      yerdir ve giris olayi degildir.
    */
    for (let j = 0; j < size; j += 1) {
      if (free.includes(j)) continue;
      const { alpha, beta } = reducedCost(j, free, segment, means, covariance);
      if (beta <= EPSILON) continue;
      const root = rootOf(alpha, beta);
      if (root === null || root >= lambda - EPSILON || root < -EPSILON) continue;

      if (root > nextLambda + EPSILON) {
        nextLambda = root;
        leaving = [];
        entering = [j];
      } else if (Math.abs(root - nextLambda) <= EPSILON) {
        entering.push(j);
      }
    }

    // Olay kalmadi: sinirin dusuk varyans ucundayiz.
    if (nextLambda === Number.NEGATIVE_INFINITY) break;

    const stop = Math.max(nextLambda, 0);
    record(stop, free, segment);
    if (stop === 0) return { turningPoints, failure: null };

    /*
      AYNI λ'DA BIRDEN FAZLA OLAY — PRD §5.2'nin ilk kose durumu. Nadir ama
      gercek: simetrik girdilerde iki agirlik ayni anda tabana iner. Olaylar
      tek tek uygulanirsa ikinci olay bir sonraki adimda "gecmiste kalmis" bir
      λ'da aranir ve algoritma kilitlenir. Hepsi BIRLIKTE uygulaniyor.
    */
    const next = new Set(free);
    for (const index of leaving) next.delete(index);
    for (const index of entering) next.add(index);

    const updated = [...next].sort((a, b) => a - b);
    if (updated.length === 0) {
      return { turningPoints, failure: 'serbest kume bosaldi' };
    }

    const nextSegment = segmentFor(updated, means, covariance);
    if (nextSegment === null) {
      return {
        turningPoints,
        failure: `alt sistem cozulemedi (serbest kume: ${updated.join(', ')})`,
      };
    }

    free = updated;
    segment = nextSegment;
    lambda = nextLambda;
  }

  // λ = 0 ucu kaydedilerek kapatilir; sinir orada biter.
  record(0, free, segment);
  return { turningPoints, failure: null };
}

/**
 * KISITSIZ hal — yalnizca dogrulama icin (§6.1).
 *
 * `Xᵢ ≥ 0` kaldirildiginda hicbir varlik tabana inemez ve hicbiri disarida
 * kalmaz: serbest kume bastan butun varliklardir ve etkin sinir TEK bir
 * critical line'dir. Turning point diye bir sey kalmaz.
 *
 * Bu yuzden `criticalLine`'a bir "kisitsiz" secenegi eklenmedi. Eklenseydi
 * fonksiyon iki noktali, ikisi de ayni agirliklari tasiyan yozlasmis bir liste
 * dondururdu — dogru gorunen ama hicbir sey soylemeyen bir cikti. Kisitsiz hal
 * kendi adiyla, kendi tipiyle duruyor.
 */
export interface CriticalLineSegment {
  /** X(λ) = p + λ·q */
  p: number[];
  q: number[];
}

export function unconstrainedLine(
  means: Means,
  covariance: Covariance,
): CriticalLineSegment | null {
  const all = means.map((_, index) => index);
  const segment = segmentFor(all, means, covariance);
  return segment === null ? null : { p: segment.p, q: segment.q };
}

/**
 * Kisitsiz critical line uzerinde, verilen E'yi veren portfoy.
 *
 * μ'(p + λq) = E dogrusal denkleminden λ cozulur. Butun yol CLA'nin kendi
 * makinesinden geciyor (Σ_FF sistemleri, butce normalizasyonu, affine
 * parametrelendirme); Merton'un kapali formu KULLANILMIYOR — §6.1'in
 * karsilastirmasi ancak iki yol bagimsizsa bir sey kanitlar.
 */
export function pointAtMean(
  line: CriticalLineSegment,
  means: Means,
  targetMean: number,
): number[] | null {
  const muP = dot(means, line.p);
  const muQ = dot(means, line.q);

  // μ'q = 0: dogru boyunca E hic degismiyor, yani hedeflenen E ya her yerde
  // saglaniyor ya hicbir yerde. Ikisi de tek bir portfoy vermez.
  if (Math.abs(muQ) < EPSILON) return null;

  const lambda = (targetMean - muP) / muQ;
  return line.p.map((value, index) => value + lambda * (line.q[index] ?? 0));
}

/**
 * Verilen λ'da etkin portfoy.
 *
 * `criticalLine` parca SINIRLARINI veriyor; aradaki her λ icin agirliklar
 * komsu iki turning point arasinda AFFINE ilerliyor, cunku ikisi de ayni
 * dogrunun uzerinde. Yani interpolasyon yaklasik degil kesin.
 *
 * λ, `max λ·μ'X − ½X'ΣX` ailesindeki risk toleransidir: buyuk λ getiriye,
 * kucuk λ dusuk varyansa agirlik verir. Tahmin hatasi deneyi (§5.4) portfoyu
 * SABIT bir toleransta karsilastirdigi icin bu fonksiyona ihtiyac duyuyor.
 */
export function portfolioAt(result: ClaResult, lambda: number): number[] | null {
  const points = result.turningPoints;
  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return null;

  // Aralik disi: uclara sabitlenir. En yuksek getiri ucunun otesinde baska
  // portfoy yok; en dusuk varyans ucunun altinda da.
  if (lambda >= (Number.isFinite(points[1]?.lambda) ? (points[1]?.lambda ?? 0) : Infinity)) {
    return [...first.weights];
  }
  if (lambda <= last.lambda) return [...last.weights];

  for (let index = 1; index < points.length; index += 1) {
    const upper = points[index - 1];
    const lower = points[index];
    if (upper === undefined || lower === undefined) continue;

    const high = Number.isFinite(upper.lambda) ? upper.lambda : Number.POSITIVE_INFINITY;
    if (lambda > high || lambda < lower.lambda) continue;

    const span = high - lower.lambda;
    if (!Number.isFinite(span) || span < EPSILON) return [...lower.weights];

    const t = (lambda - lower.lambda) / span;
    return lower.weights.map((value, i) => value + t * ((upper.weights[i] ?? 0) - value));
  }

  return [...last.weights];
}
