export interface Transfer<Id extends string = string> {
  from: Id;
  to: Id;
  amountCents: number;
}

/**
 * Dati i saldi netti (positivo = deve ricevere, negativo = deve dare),
 * calcola un elenco di pagamenti che li azzera con pochi trasferimenti
 * (algoritmo greedy: il debitore più grande paga il creditore più grande).
 *
 * È la base sia per il "chi paga chi" di fine serata sia per il registro debiti stile Splitwise.
 */
export function simplifyDebts<Id extends string>(balances: Record<Id, number>): Transfer<Id>[] {
  const entries = Object.entries(balances) as [Id, number][];
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total !== 0) {
    throw new Error(`simplifyDebts: i saldi non sono bilanciati (somma ${total})`);
  }

  const sortFn = (a: { id: Id; amount: number }, b: { id: Id; amount: number }) =>
    b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const creditors = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, amount: v }));
  const debtors = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, amount: -v }));

  const transfers: Transfer<Id>[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(sortFn);
    debtors.sort(sortFn);
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.amount, d.amount);
    transfers.push({ from: d.id, to: c.id, amountCents: amount });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount === 0) creditors.shift();
    if (d.amount === 0) debtors.shift();
  }
  return transfers;
}
