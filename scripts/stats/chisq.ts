// Chi-square p-values without dependencies: p = Q(df/2, x/2), the upper regularised gamma function
// (series for x < a + 1, Lentz continued fraction otherwise; Numerical Recipes §6.2).

function logGamma(z: number): number {
  // Lanczos approximation (g = 7, n = 9).
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0]!;
  for (let i = 1; i < 9; i++) x += c[i]! / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Upper regularised incomplete gamma Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) throw new Error('gammaQ: bad arguments');
  if (x === 0) return 1;
  const gln = logGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 10000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** P(χ² ≥ x) with df degrees of freedom. */
export function chiSquarePValue(x: number, df: number): number {
  return gammaQ(df / 2, x / 2);
}

/** Pearson chi-square statistic and p-value for observed counts against expected probabilities. */
export function chiSquareTest(observed: readonly number[], expectedProb: readonly number[]): { stat: number; df: number; p: number } {
  const n = observed.reduce((a, b) => a + b, 0);
  let stat = 0;
  for (let i = 0; i < observed.length; i++) {
    const e = n * expectedProb[i]!;
    stat += ((observed[i]! - e) * (observed[i]! - e)) / e;
  }
  const df = observed.length - 1;
  return { stat, df, p: chiSquarePValue(stat, df) };
}
