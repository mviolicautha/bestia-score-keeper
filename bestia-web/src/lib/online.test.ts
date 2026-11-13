import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { normalizeCode, OnlineService } from "./online";

/** Finto client: tabelle in memoria e registro delle scritture. */
function fake(tables: Record<string, Record<string, unknown>[]>, failInsert?: { table: string; code: string }) {
  const writes: { op: string; table: string; row?: unknown; filters?: [string, unknown][] }[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let mode: "select" | "delete" | "update" = "select";
    let payload: unknown;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v)));
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push([c, v]), q),
      in: (c: string, v: unknown[]) => (filters.push([c, v]), q),
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: { id: "r1", status: "pending", player_id: null, created_at: "t", ...(payload as object) }, error: null }),
      insert: (row: Record<string, unknown>) => {
        writes.push({ op: "insert", table, row });
        payload = row;
        if (failInsert?.table === table) return { ...q, then: (res: (v: unknown) => void) => res({ data: null, error: { message: "duplicate key", code: failInsert.code } }) };
        return q;
      },
      upsert: (row: unknown) => (writes.push({ op: "upsert", table, row }), q),
      update: (row: unknown) => ((mode = "update"), (payload = row), q),
      delete: () => ((mode = "delete"), q),
      then: (resolve: (v: unknown) => void) => {
        if (mode !== "select") writes.push({ op: mode, table, row: payload, filters });
        resolve({ data: rows(), error: null });
      },
    };
    return q;
  };
  // watch_game (0007): nei test le partite sono già tutte visibili, quindi "non esiste"
  const rpc = async () => ({ data: null, error: null });
  return { sb: { from, rpc } as unknown as SupabaseClient, writes };
}

const me = () => Promise.resolve("u-io");

describe("giocatori online", () => {
  it("il codice si può scrivere minuscolo, con spazi o trattini", () => {
    expect(normalizeCode(" kx7-p2 ")).toBe("KX7P2");
  });

  it("trova la partita dal codice", async () => {
    const f = fake({ games: [{ id: "g1", code: "KX7P2", title: "Venerdì", master_id: "u-master" }] });
    const s = new OnlineService(f.sb, me);
    expect(await s.findGameByCode("kx7p2")).toEqual({ id: "g1", code: "KX7P2", title: "Venerdì", masterId: "u-master", characters: {}, groupId: null });
    expect(await s.findGameByCode("NOPE1")).toBeNull();
  });

  it("i posti presi portano con sé il personaggio del profilo", async () => {
    const f = fake({
      game_seats: [
        { game_id: "g1", player_id: "p1", profile_id: "u-a" },
        { game_id: "g1", player_id: "p2", profile_id: "u-b" },
      ],
      profiles: [{ id: "u-a", character: { hair: "hair_short" } }, { id: "u-b", character: null }],
    });
    expect(await new OnlineService(f.sb, me).listSeats("g1")).toEqual([
      { playerId: "p1", profileId: "u-a", character: { hair: "hair_short" } },
      { playerId: "p2", profileId: "u-b", character: null },
    ]);
  });

  it("'Sono io' salva nome e personaggio nel profilo e prende il posto", async () => {
    const f = fake({});
    await new OnlineService(f.sb, me).claimSeat("g1", "p3", "Carla", { hair: "hair_long" });
    expect(f.writes[0]).toMatchObject({ op: "upsert", table: "profiles", row: { id: "u-io", display_name: "Carla", character: { hair: "hair_long" } } });
    expect(f.writes[1]).toMatchObject({ op: "insert", table: "game_seats", row: { game_id: "g1", player_id: "p3", profile_id: "u-io" } });
  });

  it("se il posto è già preso l'errore lo dice (codice 23505)", async () => {
    const f = fake({}, { table: "game_seats", code: "23505" });
    await expect(new OnlineService(f.sb, me).claimSeat("g1", "p3", "Carla")).rejects.toMatchObject({ code: "23505" });
  });

  it("richiesta di sedersi e decisione del master", async () => {
    const f = fake({});
    const s = new OnlineService(f.sb, me);
    const r = await s.requestToJoin("g1", "  Marco ");
    expect(r).toMatchObject({ name: "Marco", status: "pending" });
    await s.decideRequest("r1", "approved", "p9");
    expect(f.writes.at(-1)).toMatchObject({ op: "update", table: "join_requests", row: { status: "approved", player_id: "p9" }, filters: [["id", "r1"]] });
  });
});

describe("personaggi condivisi dal master (0004_personaggi_condivisi.sql)", () => {
  const withUpdate = (error: { message: string; code?: string } | null) => {
    const sent: unknown[] = [];
    const sb = { from: () => ({ update: (row: unknown) => (sent.push(row), { eq: async () => ({ error }) }) }) };
    return { svc: new OnlineService(sb as unknown as SupabaseClient, me), sent };
  };

  it("li salva nella partita", async () => {
    const { svc, sent } = withUpdate(null);
    expect(await svc.shareCharacters("g1", { anna: { hair: "x" } })).toBe(true);
    expect(sent).toEqual([{ characters: { anna: { hair: "x" } } }]);
  });

  it("senza la colonna nel database non dà errore: dice solo che non può", async () => {
    const { svc } = withUpdate({ code: "PGRST204", message: "Could not find the 'characters' column of 'games' in the schema cache" });
    expect(await svc.shareCharacters("g1", {})).toBe(false);
  });

  it("gli errori di rete restano errori (si riprova)", async () => {
    const { svc } = withUpdate({ message: "Failed to fetch" });
    await expect(svc.shareCharacters("g1", {})).rejects.toThrow();
  });

  it("legge la partita anche se la colonna non c'è ancora", async () => {
    const { sb } = fake({ games: [{ id: "g1", code: "AAAAA", title: "T", master_id: "m" }] });
    expect(await new OnlineService(sb, me).getGame("g1")).toEqual({ id: "g1", code: "AAAAA", title: "T", masterId: "m", characters: {}, groupId: null });
  });
});
