import { describe, expect, it } from "vitest";
import { simplifyDebts } from "./settle";

const net = (transfers: ReturnType<typeof simplifyDebts>) => {
  const out: Record<string, number> = {};
  for (const t of transfers) {
    out[t.from] = (out[t.from] ?? 0) - t.amountCents;
    out[t.to] = (out[t.to] ?? 0) + t.amountCents;
  }
  return out;
};

describe("simplifyDebts", () => {
  it("azzera i saldi con al massimo n-1 pagamenti", () => {
    const balances = { a: 500, b: -200, c: -300, d: 150, e: -150 };
    const t = simplifyDebts(balances);
    expect(net(t)).toEqual(balances);
    expect(t.length).toBeLessThanOrEqual(4);
  });

  it("abbina debiti e crediti uguali con un solo pagamento", () => {
    expect(simplifyDebts({ a: 120, b: -120 })).toEqual([{ from: "b", to: "a", amountCents: 120 }]);
  });

  it("nessun pagamento se tutti sono a zero", () => {
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
  });

  it("rifiuta saldi non bilanciati", () => {
    expect(() => simplifyDebts({ a: 10, b: -5 })).toThrow();
  });
});
