// @vitest-environment jsdom
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { replay, type GameEvent } from "@/engine";
import { HistoryService, localGamesToImport, resultsOf } from "./history";

const ended: GameEvent[] = [
  { type: "game_started", baseBetCents: 30 },
  { type: "player_added", playerId: "a", name: "Anna" },
  { type: "player_added", playerId: "b", name: "Bruno" },
  { type: "player_added", playerId: "c", name: "Carla" },
  { type: "game_ended" },
];
const stored = (events: GameEvent[]) => events.map((event, i) => ({ event, at: `2026-11-0${i + 1}T21:00:00.000Z` }));

function fake(rpc: (fn: string, args: Record<string, unknown>) => unknown = () => ({ data: null, error: null })) {
  const calls: [string, Record<string, unknown>][] = [];
  const sb = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      return rpc(fn, args);
    }),
  };
  return { svc: new HistoryService(sb as unknown as SupabaseClient, async () => "me"), calls };
}

beforeEach(() => window.localStorage.clear());

describe("storico", () => {
  it("i risultati comprendono tutti i giocatori con il saldo finale", () => {
    const { state } = replay(ended);
    expect(resultsOf(state).map((r) => r.name)).toEqual(["Anna", "Bruno", "Carla"]);
    expect(resultsOf(state).reduce((s, r) => s + r.balanceCents, 0)).toBe(0);
  });

  it("salva i risultati con i nomi delle colonne del database", async () => {
    const { svc, calls } = fake();
    await svc.saveResults("g1", [{ playerId: "a", name: "Anna", balanceCents: 60 }]);
    expect(calls).toEqual([["save_game_results", { p_game: "g1", p_results: [{ player_id: "a", name: "Anna", balance_cents: 60 }] }]]);
  });

  it("legge le mie partite", async () => {
    const { svc } = fake(() => ({
      data: [
        { game_id: "g1", title: "Venerdì", ended_at: "t", group_id: null, group_name: null, is_master: false, my_name: "Anna", my_balance_cents: -30, player_count: 4, winner_name: "Bruno", winner_balance_cents: 90 },
      ],
      error: null,
    }));
    expect(await svc.myHistory()).toEqual([
      { gameId: "g1", title: "Venerdì", endedAt: "t", groupId: null, groupName: null, isMaster: false, myName: "Anna", myBalanceCents: -30, playerCount: 4, winnerName: "Bruno", winnerBalanceCents: 90 },
    ]);
  });

  it("spiega cosa fare se manca la migrazione", async () => {
    const { svc } = fake(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }));
    await expect(svc.myHistory()).rejects.toThrow("0008_storico.sql");
  });

  it("trova le partite locali da importare e, importate, non le propone più", async () => {
    window.localStorage.setItem(
      "bestia:games",
      JSON.stringify([
        { id: "L1", title: "Sabato", createdAt: "c", updatedAt: "u", status: "ended" },
        { id: "L2", title: "Vuota", createdAt: "c", updatedAt: "u", status: "in_progress" },
      ]),
    );
    window.localStorage.setItem("bestia:events:L1", JSON.stringify(stored(ended)));
    expect(localGamesToImport().map((g) => g.meta.title)).toEqual(["Sabato"]);

    const { svc, calls } = fake((fn) => ({ data: fn === "import_game" ? "g-online" : null, error: null }));
    expect(await svc.importLocal(localGamesToImport()[0])).toBe("g-online");
    expect(calls[0][0]).toBe("import_game");
    expect(calls[0][1]).toMatchObject({ p_title: "Sabato", p_status: "ended", p_group: null });
    expect((calls[0][1].p_events as unknown[])[0]).toEqual({ event: ended[0], at: "2026-11-01T21:00:00.000Z" });
    expect(calls[1][0]).toBe("save_game_results");
    expect(localGamesToImport()).toEqual([]);
  });
});
