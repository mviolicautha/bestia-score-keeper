import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, ALBUM_CATEGORIES, CHALLENGES, msToNextWeek, NICKNAME_IDS, WEEKLY } from "./achievements";
import { readyIds, type Goals } from "./goals";
import type { NightStats } from "./nightStats";

const sql = readFileSync(join(__dirname, "../../supabase/migrations/0010_obiettivi.sql"), "utf8");

describe("obiettivi", () => {
  it("il database ha gli stessi obiettivi con le stesse soglie e gli stessi premi", () => {
    const rows = [...sql.matchAll(/\('([a-z0-9_]+)', '([a-z_:]+)', (\d+|null), (\d+), (?:'(classica|oro)'|null)\)/g)];
    const db = Object.fromEntries(rows.map((m) => [m[1], { metric: m[2], goal: m[3] === "null" ? null : Number(m[3]), coins: Number(m[4]), pack: m[5] }]));
    expect(Object.keys(db).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
    for (const a of ACHIEVEMENTS) {
      const d = db[a.id];
      if (a.id.startsWith("cat_")) {
        // le categorie: la soglia la conta il database dai pezzi attivi
        expect(d.goal, a.id).toBeNull();
        expect(d.metric).toBe(`cat:${a.id.slice(4)}`);
      } else expect(d.goal, a.id).toBe(a.goal);
      expect(d.pack, a.id).toBe(a.reward.pack);
      expect(d.coins, a.id).toBe(a.reward.coins ?? 0);
    }
  });

  it("un obiettivo per ogni soprannome e per ogni categoria dell'album", () => {
    for (const id of NICKNAME_IDS) expect(ACHIEVEMENTS.some((a) => a.id === `nick_${id}`), id).toBe(true);
    for (const c of ALBUM_CATEGORIES) expect(ACHIEVEMENTS.some((a) => a.id === `cat_${c.id}`), c.id).toBe(true);
    expect(ALBUM_CATEGORIES.some((c) => c.id === "hair")).toBe(false);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it("il database legge le statistiche con le stesse chiavi che salva l'app", () => {
    const keys: (keyof NightStats)[] = ["hands", "won", "tricks", "bestie", "tris", "streak", "soc", "misdeal", "min", "bet", "nick"];
    for (const k of keys) expect(sql, k).toContain(`stats ->> '${k}'`);
  });
});

describe("sfide settimanali", () => {
  it("stesse sfide, soglie e premi del database", () => {
    const rows = [...sql.matchAll(/\('(w_[a-z0-9_]+)', '([a-z]+)', (\d+)\)/g)];
    expect(Object.fromEntries(rows.map((m) => [m[1], Number(m[3])]))).toEqual(Object.fromEntries(CHALLENGES.map((c) => [c.id, c.goal])));
    expect(sql).toContain(`set coins = coins + ${WEEKLY.coins} where`);
    expect(sql).toContain(`set pack_${WEEKLY.bonus} = pack_${WEEKLY.bonus} + 1`);
    // le sfide pescate dal database esistono tutte nel catalogo
    for (const m of sql.matchAll(/'(w_[a-z0-9_]+)'/g)) expect(CHALLENGES.some((c) => c.id === m[1]), m[1]).toBe(true);
  });

  it("le nuove sfide escono lunedì a mezzanotte italiana", () => {
    // domenica 15 novembre 2026, 22:30 UTC = 23:30 a Roma
    expect(msToNextWeek(new Date("2026-11-15T22:30:00Z"))).toBe(30 * 60_000);
    // lunedì 16 alle 00:00 a Roma: una settimana intera
    expect(msToNextWeek(new Date("2026-11-15T23:00:00Z"))).toBe(7 * 86_400_000);
  });

  it("premi da riscuotere: obiettivi raggiunti, sfide fatte e bonus quando sono tutte fatte", () => {
    const g: Goals = {
      achievements: [
        { id: "partite_1", value: 2, goal: 1, claimed: false },
        { id: "partite_3", value: 2, goal: 3, claimed: false },
        { id: "master_1", value: 1, goal: 1, claimed: true },
      ],
      week: "2026-11-16",
      challenges: [
        { id: "w_partita", value: 1, goal: 1, claimed: true },
        { id: "w_mani_25", value: 30, goal: 25, claimed: false },
        { id: "w_tris", value: 0, goal: 1, claimed: false },
      ],
      bonusClaimed: false,
      coins: 0,
      packs: { classica: 0, oro: 0 },
    };
    expect(readyIds(g)).toEqual(["partite_1", "w:w_mani_25"]);
    g.challenges[2].value = 1;
    expect(readyIds(g)).toEqual(["partite_1", "w:w_mani_25", "w:w_tris", "w:bonus"]);
    expect(readyIds({ ...g, bonusClaimed: true })).not.toContain("w:bonus");
  });
});
