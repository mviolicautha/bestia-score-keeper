import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabaseGameRepository } from "./supabaseRepository";
import { SaveConflictError } from "./resilience";

/** Finto client Supabase: registra le chiamate e restituisce dati preparati. */
function fakeClient(tables: Record<string, unknown[]>) {
  const calls: { op: string; args: unknown[] }[] = [];
  let realtime: (() => void) | null = null;
  let onStatus: ((s: string) => void) | null = null;

  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])] as Record<string, unknown>[];
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        calls.push({ op: `${table}.eq`, args: [col, val] });
        rows = rows.filter((r) => !(col in r) || r[col] === val);
        return q;
      },
      order: () => q,
      delete: () => {
        calls.push({ op: `${table}.delete`, args: [] });
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return q;
  };

  const sb = {
    auth: { getSession: async () => ({ data: { session: { access_token: "token-utente" } } }) },
    realtime: { setAuth: vi.fn(async () => {}) },
    from: query,
    rpc: vi.fn(async (fn: string, args: unknown) => {
      calls.push({ op: `rpc.${fn}`, args: [args] });
      if (fn === "create_game") return { data: { id: "g-new", code: "KX7P2" }, error: null };
      if (fn === "append_event" && (args as { p_game: string }).p_game === "altrui") return { data: null, error: { message: "not_master" } };
      return { data: null, error: null };
    }),
    channel: () => {
      const ch = {
        on: (_t: string, _f: unknown, cb: () => void) => {
          realtime = cb;
          return ch;
        },
        subscribe: (cb: (s: string) => void) => {
          onStatus = cb;
          return ch;
        },
      };
      return ch;
    },
    removeChannel: vi.fn(),
  };
  return {
    sb: sb as unknown as SupabaseClient,
    calls,
    fireUpdate: () => realtime?.(),
    fireStatus: (s: string) => onStatus?.(s),
    subscribed: () => onStatus !== null,
    tables,
  };
}

const user = () => Promise.resolve("u-master");

describe("partite su Supabase", () => {
  it("crea la partita con la funzione del database e restituisce l'id", async () => {
    const f = fakeClient({});
    const repo = new SupabaseGameRepository(f.sb, user);
    expect(await repo.createGame("Venerdì", 30)).toBe("g-new");
    expect(f.calls).toContainEqual({ op: "rpc.create_game", args: [{ p_title: "Venerdì", p_base_bet_cents: 30 }] });
  });

  it("elenca solo le partite del master, con il codice per unirsi", async () => {
    const f = fakeClient({
      games: [
        { id: "g1", code: "AAAAA", title: "Mia", status: "in_progress", created_at: "c", updated_at: "u", master_id: "u-master" },
        { id: "g2", code: "BBBBB", title: "Altrui", status: "ended", created_at: "c", updated_at: "u", master_id: "altro" },
      ],
    });
    const list = await new SupabaseGameRepository(f.sb, user).listGames();
    expect(list.map((g) => [g.id, g.code])).toEqual([["g1", "AAAAA"]]);
  });

  it("carica gli eventi in ordine e li salva tramite append_event", async () => {
    const f = fakeClient({
      game_events: [
        { game_id: "g1", seq: 1, event: { type: "game_started", baseBetCents: 30 }, at: "t1" },
        { game_id: "g1", seq: 2, event: { type: "hand_passed" }, at: "t2" },
      ],
    });
    const repo = new SupabaseGameRepository(f.sb, user);
    expect((await repo.loadEvents("g1")).map((e) => e.event.type)).toEqual(["game_started", "hand_passed"]);
    await repo.appendEvent("g1", { type: "hand_passed" }, "in_progress");
    expect(f.calls).toContainEqual({ op: "rpc.append_event", args: [{ p_game: "g1", p_event: { type: "hand_passed" }, p_status: "in_progress" }] });
    await expect(repo.appendEvent("altrui", { type: "hand_passed" }, "in_progress")).rejects.toThrow(/not_master/);
  });

  it("si aggiorna da solo quando la partita cambia, e smette quando ci si scollega", async () => {
    const f = fakeClient({ game_events: [{ game_id: "g1", seq: 1, event: { type: "game_started", baseBetCents: 30 }, at: "t" }] });
    const repo = new SupabaseGameRepository(f.sb, user, 60_000);
    const seen: number[] = [];
    const stop = repo.subscribe("g1", (ev) => seen.push(ev.length));
    // il canale si apre solo dopo aver passato il token dell'utente
    await vi.waitFor(() => expect(f.subscribed()).toBe(true));
    expect((f.sb as unknown as { realtime: { setAuth: ReturnType<typeof vi.fn> } }).realtime.setAuth).toHaveBeenCalledWith("token-utente");
    f.fireStatus("SUBSCRIBED");
    await vi.waitFor(() => expect(seen).toEqual([1]));
    f.tables.game_events.push({ game_id: "g1", seq: 2, event: { type: "hand_passed" }, at: "t" });
    f.fireUpdate();
    await vi.waitFor(() => expect(seen).toEqual([1, 2]));
    stop();
    f.fireUpdate();
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual([1, 2]);
  });
});

describe("salvataggi sicuri su Supabase (0003_salvataggi_sicuri.sql)", () => {
  /** rpc finto: `reply` decide la risposta in base agli argomenti. */
  const withRpc = (reply: (fn: string, args: Record<string, unknown>) => { error: { message: string; code?: string } | null }) => {
    const calls: Record<string, unknown>[] = [];
    const sb = {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push(args);
        return { data: null, ...reply(fn, args) };
      }),
    };
    return { repo: new SupabaseGameRepository(sb as unknown as SupabaseClient, user), calls };
  };

  it("manda il numero di eventi atteso", async () => {
    const { repo, calls } = withRpc(() => ({ error: null }));
    await repo.appendEvent("g1", { type: "hand_passed" }, "in_progress", 7);
    await repo.removeLastEvent("g1", "in_progress", 8);
    expect(calls).toEqual([
      { p_game: "g1", p_event: { type: "hand_passed" }, p_status: "in_progress", p_expected: 7 },
      { p_game: "g1", p_status: "in_progress", p_expected: 8 },
    ]);
  });

  it("se la partita è cambiata nel frattempo dà SaveConflictError", async () => {
    const { repo } = withRpc(() => ({ error: { message: "conflict", code: "P0001" } }));
    await expect(repo.appendEvent("g1", { type: "hand_passed" }, "in_progress", 7)).rejects.toBeInstanceOf(SaveConflictError);
  });

  it("con il database non ancora aggiornato salva lo stesso (senza controllo)", async () => {
    const { repo, calls } = withRpc((_fn, args) =>
      "p_expected" in args ? { error: { message: "Could not find the function public.append_event(p_event, p_expected, p_game, p_status)", code: "PGRST202" } } : { error: null },
    );
    await repo.appendEvent("g1", { type: "hand_passed" }, "in_progress", 7);
    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toHaveProperty("p_expected");
  });

  it("gli altri errori (non sei il master, rete) restano errori", async () => {
    const { repo } = withRpc(() => ({ error: { message: "not_master" } }));
    await expect(repo.appendEvent("g1", { type: "hand_passed" }, "in_progress", 7)).rejects.toThrow(/not_master/);
  });
});
