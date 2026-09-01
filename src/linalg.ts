import type { Covariance } from './types';

/**
 * PRD 03 §5.2 — CLA'nin ihtiyac duydugu kucuk lineer cebir.
 *
 * Kutuphane YOK: §9'a gore bu klasor bagimliliksiz bir repo'ya kopyalanacak ve
 * "bagimlilik minimumda, ideal olarak sifir" deniyor. Ihtiyac duyulan tek sey
 * kucuk bir simetrik sistemi cozmek; bunun icin bir cebir kutuphanesi tasimak
 * orantisiz olurdu.
 *
 * Modul saf.
 */

/**
 * `A x = b` cozumu; kismi pivotlamali Gauss eleme.
 *
 * PIVOTLAMA sart: pivotsuz eleme kosegeninde kucuk sayi olan matrislerde
 * buyuk carpanlar uretip hatayi buyutur ve CLA'nin serbest kumesi degistikce
 * tam boyle matrisler cikiyor. Tekil veya kotu kosullu sistemde `null` doner —
 * PRD §5.2 "dejenere veya kotu kosullu Σ" durumunu ele almayi sart kosuyor ve
 * ele alis bicimi budur: NaN uretip sessizce yayilmak yerine hicbir sey
 * dondurmemek.
 */
export function solve(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] | null {
  const n = rhs.length;
  if (n === 0) return [];

  // Calisma kopyasi; girdi degistirilmez.
  const a: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => matrix[i]?.[j] ?? 0),
  );
  const x = [...rhs];

  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    let pivotSize = Math.abs(a[column]?.[column] ?? 0);

    for (let row = column + 1; row < n; row += 1) {
      const candidate = Math.abs(a[row]?.[column] ?? 0);
      if (candidate > pivotSize) {
        pivotSize = candidate;
        pivotRow = row;
      }
    }

    // Butun sutun sifira yakin: sistem tekil.
    if (pivotSize < 1e-12) return null;

    if (pivotRow !== column) {
      const tmpRow = a[column];
      const swapRow = a[pivotRow];
      if (tmpRow === undefined || swapRow === undefined) return null;
      a[column] = swapRow;
      a[pivotRow] = tmpRow;

      const tmpValue = x[column] ?? 0;
      x[column] = x[pivotRow] ?? 0;
      x[pivotRow] = tmpValue;
    }

    const pivot = a[column]?.[column] ?? 0;

    for (let row = column + 1; row < n; row += 1) {
      const current = a[row];
      const above = a[column];
      if (current === undefined || above === undefined) return null;

      const factor = (current[column] ?? 0) / pivot;
      if (factor === 0) continue;

      for (let k = column; k < n; k += 1) {
        current[k] = (current[k] ?? 0) - factor * (above[k] ?? 0);
      }
      x[row] = (x[row] ?? 0) - factor * (x[column] ?? 0);
    }
  }

  // Geri yerine koyma.
  const result = Array.from({ length: n }, () => 0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = x[row] ?? 0;
    const current = a[row];
    if (current === undefined) return null;
    for (let k = row + 1; k < n; k += 1) sum -= (current[k] ?? 0) * (result[k] ?? 0);
    const pivot = current[row] ?? 0;
    if (Math.abs(pivot) < 1e-12) return null;
    result[row] = sum / pivot;
  }

  return result.every((value) => Number.isFinite(value)) ? result : null;
}

/** Bir alt matrisi indis listesine gore keser. */
export function submatrix(matrix: Covariance, indices: readonly number[]): number[][] {
  return indices.map((i) => indices.map((j) => matrix[i]?.[j] ?? 0));
}

/** Bir vektoru indis listesine gore keser. */
export function subvector(vector: readonly number[], indices: readonly number[]): number[] {
  return indices.map((i) => vector[i] ?? 0);
}

export function dot(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += (a[i] ?? 0) * (b[i] ?? 0);
  return total;
}
