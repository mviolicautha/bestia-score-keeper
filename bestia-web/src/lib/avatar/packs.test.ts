import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalog } from "./catalog";
import { bestRarity, collectibles, formatWait, isFree, msToNextDaily, PACKS, progressOf, RARITIES, RARITY, RARITY_INFO, REWARDS } from "./packs";
import { editorAccess } from "./collection";

const sql = readFileSync(join(__dirname, "../../../supabase/migrations/0009_bustine.sql"), "utf8");

describe("bustine", () => {
  it("i capelli sono liberi, tutto il resto si colleziona", () => {
    expect(catalog.items.filter((i) => i.category === "hair").every(isFree)).toBe(true);
    expect(collectibles.length).toBeGreaterThan(0);
    expect(collectibles.some((i) => i.category === "hair")).toBe(false);
  });

  it("ogni pezzo da collezionare ha una rarità (se aggiungi un pezzo, aggiungilo a rarity.json)", () => {
    const missing = collectibles.filter((i) => !RARITY[i.id]).map((i) => i.id);
    expect(missing).toEqual([]);
    for (const r of Object.values(RARITY)) expect(RARITIES).toContain(r);
    // e niente rarità per pezzi che non esistono più
    const ids = new Set(collectibles.map((i) => i.id));
    expect(Object.keys(RARITY).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("il database ha gli stessi pezzi con le stesse rarità (altrimenti: npm run avatar:sql)", () => {
    const rows = [...sql.matchAll(/\('([a-z0-9_]+)', '([a-z]+)', '(comune|rara|epica|leggendaria)'\)/g)];
    const db = Object.fromEntries(rows.map((m) => [m[1], m[3]]));
    expect(db).toEqual(RARITY);
  });

  it("prezzi e dimensioni delle bustine sono quelli del database", () => {
    for (const p of Object.values(PACKS)) {
      const m = sql.match(new RegExp(`when '${p.kind}' then v_size := (\\d+); v_price := (\\d+);(?: v_min := '(\\w+)';)?`));
      expect(m, p.kind).not.toBeNull();
      expect(Number(m![1])).toBe(p.size);
      expect(Number(m![2])).toBe(p.price);
      expect(m![3]).toBe(p.guaranteed);
    }
  });

  it("probabilità e gettoni dei doppioni sono quelli del database", () => {
    const weights = RARITIES.map((r) => RARITY_INFO[r].weight);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
    // soglie cumulative dalla più rara: 2, 11, 38
    expect(sql).toContain(`when v_roll < ${RARITY_INFO.leggendaria.weight} then 'leggendaria'`);
    expect(sql).toContain(`when v_roll < ${RARITY_INFO.leggendaria.weight + RARITY_INFO.epica.weight} then 'epica'`);
    expect(sql).toContain(`when v_roll < ${RARITY_INFO.leggendaria.weight + RARITY_INFO.epica.weight + RARITY_INFO.rara.weight} then 'rara'`);
    expect(sql).toContain(
      `when 'leggendaria' then ${RARITY_INFO.leggendaria.refund} when 'epica' then ${RARITY_INFO.epica.refund} when 'rara' then ${RARITY_INFO.rara.refund} else ${RARITY_INFO.comune.refund}`,
    );
    expect(sql).toContain(`v_coins := ${REWARDS.perGame} + case when coalesce(r.balance, 0) > 0 then least(${REWARDS.maxWinBonus}, r.balance / 10)`);
    expect(sql).toContain(`select ${REWARDS.gamesPerDay} - count(*) into v_left`);
  });

  it("la luce dello strappo ha il colore della carta più rara", () => {
    expect(bestRarity([{ rarity: "comune" }, { rarity: "epica" }, { rarity: "rara" }])).toBe("epica");
    expect(bestRarity([])).toBe("comune");
  });

  it("conta i pezzi dell'album", () => {
    const hats = collectibles.filter((i) => i.category === "hat");
    const owned = new Set([hats[0].id, hats[1].id, "hair_short"]);
    expect(progressOf(owned, "hat")).toEqual({ owned: 2, total: hats.length });
    expect(progressOf(owned).owned).toBe(2);
  });

  it("la bustina del giorno torna a mezzanotte italiana", () => {
    // 22:30 UTC del 13 novembre = 23:30 a Roma: mezz'ora alla prossima
    expect(msToNextDaily(new Date("2026-11-13T22:30:00Z"))).toBe(30 * 60_000);
    expect(formatWait(30 * 60_000)).toBe("30 min");
    expect(formatWait(5 * 3_600_000 + 12 * 60_000)).toBe("5 h 12 min");
    expect(formatWait(10_000)).toBe("meno di un minuto");
  });

  it("nell'editor: il mio personaggio usa il mio album, quello degli altri solo i pezzi liberi", () => {
    const owned = new Set(["hat_cowboy"]);
    const ready = { status: "ready" as const, collection: { coins: 0, welcome: false, daily: false, owned, rewards: [] } };
    expect(editorAccess(ready, true)).toEqual({ unlocked: owned, collect: "packs" });
    expect(editorAccess(ready, false).collect).toBe("none");
    expect((editorAccess(ready, false).unlocked as Set<string>).size).toBe(0);
    expect(editorAccess({ status: "guest" }, true).collect).toBe("account");
    // senza bustine (app solo locale o database da aggiornare) è tutto libero come prima
    expect(editorAccess({ status: "off" }, false).unlocked).toBe("all");
  });
});
