import { describe, expect, it } from "vitest";
import { replay, type GameEvent } from "@/engine";
import { resultsOf } from "./history";
import { nightStatsOf } from "./nightStats";

const names = ["Anna", "Bruno", "Carla", "Dario", "Elena", "Fabio"];
const players: GameEvent[] = names.map((name, i) => ({ type: "player_added", playerId: `p${i}`, name }));
const win = (id: string, tricks: 1 | 2 | 3 = 3, losers: string[][] = []): GameEvent => ({
  type: "hand_played",
  winners: [{ playerIds: [id], tricks }],
  losers,
});

function night(events: GameEvent[]) {
  return replay([{ type: "game_started", baseBetCents: 30 }, ...players, ...events]);
}

describe("statistiche della serata per gli obiettivi", () => {
  it("conta prese piene, serie di mani vinte, società e bestie", () => {
    const { state, history } = night([
      win("p0", 3, [["p3"]]),
      win("p0", 3),
      { type: "hand_passed" }, // una mano passata non interrompe la serie
      win("p0", 3, [["p3"]]),
      { type: "hand_played", winners: [{ playerIds: ["p1", "p2"], tricks: 2 }, { playerIds: ["p0"], tricks: 1 }], losers: [["p3"]] },
      win("p1", 3),
      { type: "game_ended" },
    ]);
    const s = nightStatsOf(state, history);
    expect(s.p0).toMatchObject({ tris: 3, streak: 4, soc: 0, won: 4, hands: 5, tricks: 10 });
    expect(s.p1).toMatchObject({ soc: 1, streak: 2, tris: 1 });
    expect(s.p3).toMatchObject({ bestie: 3, won: 0, streak: 0 });
    expect(s.p3.min).toBeLessThan(0);
    expect(s.p0.bet).toBe(30);
  });

  it("una mano persa da seduto azzera la serie", () => {
    const { state, history } = night([win("p0"), win("p0"), win("p1"), win("p0"), { type: "game_ended" }]);
    expect(nightStatsOf(state, history).p0.streak).toBe(2);
  });

  it("le carte date male vanno al mazziere di quel momento (ed è anche una bestia)", () => {
    const { state, history } = night([win("p0"), { type: "misdeal" }]);
    const dealer = history.at(-1)!.outcome.dealerBefore!;
    const s = nightStatsOf(state, history);
    expect(s[dealer].misdeal).toBe(1);
    expect(s[dealer].bestie).toBe(1);
    expect(Object.values(s).reduce((n, x) => n + x.misdeal, 0)).toBe(1);
  });

  it("ci mette il soprannome della serata", () => {
    const { state, history } = night([win("p0", 3, [["p3"]]), win("p0", 3, [["p3"]]), win("p0"), { type: "game_ended" }]);
    const s = nightStatsOf(state, history);
    expect(s.p0.nick).toBe("re");
    expect(s.p3.nick).toBe("bancomat");
  });

  it("i risultati da salvare portano le statistiche solo se c'è la cronologia", () => {
    const { state, history } = night([win("p0"), { type: "game_ended" }]);
    expect(resultsOf(state)[0].stats).toBeUndefined();
    expect(resultsOf(state, history)[0].stats?.won).toBe(1);
  });
});
