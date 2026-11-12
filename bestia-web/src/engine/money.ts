/**
 * Divide `total` centesimi in parti proporzionali ai pesi.
 * La somma delle parti è sempre esattamente `total`: i centesimi avanzati
 * vanno alle parti con resto più alto e, a parità, alle prime (ordine dei posti).
 */
export function splitCents(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`splitCents: totale non valido (${total})`);
  }
  if (weights.length === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0 || weights.some((w) => w < 0)) {
    throw new Error("splitCents: pesi non validi");
  }

  const raw = weights.map((w) => (total * w) / sumW);
  const parts = raw.map(Math.floor);
  let remainder = total - parts.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (const { i } of order) {
    if (remainder <= 0) break;
    parts[i] += 1;
    remainder -= 1;
  }
  return parts;
}

/** Divide `total` in `n` parti il più possibile uguali. */
export function splitEvenly(total: number, n: number): number[] {
  return splitCents(total, new Array(n).fill(1));
}

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

/** 120 -> "1,20 €". Con `signed`, i positivi hanno il "+". */
export function formatCents(cents: number, opts: { signed?: boolean } = {}): string {
  const s = eur.format(cents / 100);
  return opts.signed && cents > 0 ? `+${s}` : s;
}

/** "1,20" / "1.2" / "1" -> centesimi. Restituisce null se non è un importo valido. */
export function parseEuroToCents(input: string): number | null {
  const normalized = input.trim().replace("€", "").replace(",", ".").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}
