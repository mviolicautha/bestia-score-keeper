import { describe, expect, it } from "vitest";
import { replay, type GameEvent } from "@/engine";
import { momentAt } from "./moments";

const start: GameEvent[] = [
  { type: "game_started", baseBetCents: 30 },
  ...["Anna", "Bruno", "Carla", "Dario", "Elena"].map((name, i) => ({ type: "player_added" as const, playerId: `p${i}`, name })),
];
const last = (events: GameEvent[]) => {
  const { state, history } = replay(events);
  return momentAt(history, history.length - 1, state);
};

describe("momenti della TV", () => {
  it("bestia: chi paga e quanto, senza contare la messa del nuovo mazziere", () => {
    // Bruno diventa mazziere e va anche in bestia: paga il piatto (0,30), la messa non conta
    const m = last([...start, { type: "hand_played", winners: [{ playerIds: ["p0"], tricks: 3 }], losers: [["p1"]] }]);
    expect(m).toMatchObject({ kind: "bestia", losers: [{ name: "Bruno", cents: -30 }], winners: [{ name: "Anna", cents: 30 }], potCents: 30 });
  });

  it("vincita normale e piatto d'oro (record della serata)", () => {
    const m1 = last([...start, { type: "hand_played", winners: [{ playerIds: ["p2"], tricks: 3 }], losers: [] }]);
    expect(m1).toMatchObject({ kind: "win", winners: [{ name: "Carla", cents: 30 }], big: false });
    const m2 = last([
      ...start,
      { type: "hand_played", winners: [{ playerIds: ["p0"], tricks: 3 }], losers: [["p3"], ["p4"]] },
      { type: "hand_played", winners: [{ playerIds: ["p1"], tricks: 3 }], losers: [] },
    ]);
    expect(m2).toMatchObject({ kind: "win", winners: [{ name: "Bruno" }], big: true }); // 0,90 €: più del primo piatto
  });

  it("mano passata: a chi vanno le carte; altri eventi non sono momenti", () => {
    expect(last([...start, { type: "hand_passed" }])).toEqual({ kind: "pass", key: 6, dealer: "Bruno" });
    expect(last([...start, { type: "bet_changed", baseBetCents: 60 }])).toBeNull();
  });
});
