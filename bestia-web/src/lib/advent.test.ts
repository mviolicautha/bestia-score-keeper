import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADVENT_DAYS, ADVENT_GOLD_DAYS, ADVENT_PIECE_DAYS, adventCoins, adventKind, daysToAdvent } from "./advent";

const sql = readFileSync(join(__dirname, "../../supabase/migrations/0011_calendario.sql"), "utf8");

describe("calendario dell'avvento", () => {
  it("le caselle sono le stesse del database", () => {
    expect(sql).toContain(`when p_day = ${ADVENT_DAYS} then 'leggendario'`);
    expect(sql).toContain(`when p_day in (${ADVENT_GOLD_DAYS.join(", ")}) then 'oro'`);
    expect(sql).toContain(`when p_day in (${ADVENT_PIECE_DAYS.join(", ")}) then 'pezzo'`);
    expect(sql).toContain("select 50 + mod(p_day * 37, 5) * 25;");
  });

  it("24 caselle: gettoni tra 50 e 150, 7 pezzi, 3 bustine d'oro e un leggendario", () => {
    const kinds = Array.from({ length: ADVENT_DAYS }, (_, i) => adventKind(i + 1));
    expect(kinds.filter((k) => k === "pezzo")).toHaveLength(7);
    expect(kinds.filter((k) => k === "oro")).toHaveLength(3);
    expect(kinds.filter((k) => k === "leggendario")).toHaveLength(1);
    const coins = kinds.map((k, i) => (k === "gettoni" ? adventCoins(i + 1) : null)).filter((c) => c !== null);
    expect(Math.min(...coins)).toBeGreaterThanOrEqual(50);
    expect(Math.max(...coins)).toBeLessThanOrEqual(150);
  });

  it("conto alla rovescia al 1° dicembre in ora italiana", () => {
    expect(daysToAdvent(new Date("2026-11-15T12:00:00Z"))).toBe(16);
    expect(daysToAdvent(new Date("2026-11-30T22:30:00Z"))).toBe(1); // 23:30 del 30 a Roma
    expect(daysToAdvent(new Date("2026-11-30T23:30:00Z"))).toBe(0); // già il 1° a Roma
    expect(daysToAdvent(new Date("2026-12-20T12:00:00Z"))).toBe(0);
    expect(daysToAdvent(new Date("2026-10-20T12:00:00Z"))).toBeNull();
  });
});
