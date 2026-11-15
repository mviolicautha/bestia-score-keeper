import { describe, expect, it } from "vitest";
import { formatCents, replay, type GameEvent } from "@/engine";
import { analyzeNight, careerOf, highlights, nicknamesOf, pairFlow, type CareerGame } from "./stats";

const fmt = (c: number, signed = false) => formatCents(c, { signed });
const names = ["Anna", "Bruno", "Carla", "Dario", "Elena", "Fabio"];
const players: GameEvent[] = names.map((name, i) => ({ type: "player_added", playerId: `p${i}`, name }));
const win = (id: string, losers: string[][] = []): GameEvent => ({ type: "hand_played", winners: [{ playerIds: [id], tricks: 3 }], losers });

function night(events: GameEvent[]) {
  const { state, history } = replay([{ type: "game_started", baseBetCents: 30 }, ...players, ...events]);
  return { state, history };
}

describe("analisi della serata", () => {
  it("conta le mani giocate da seduto, anche per chi esce prima", () => {
    const { state, history } = night([win("p0", [["p3"]]), win("p0"), { type: "player_left", playerId: "p4" }, win("p1", [["p2"]]), win("p1"), { type: "game_ended" }]);
    const a = analyzeNight(state, history);
    const by = (id: string) => a.players.find((p) => p.id === id)!;
    expect(by("p0").handsPresent).toBe(4);
    expect(by("p4").handsPresent).toBe(2);
    expect(by("p4").stayed).toBe(false);
    expect(by("p0").handsWon).toBe(2);
    expect(by("p3").bestie).toBe(1);
    expect(by("p3").minCents).toBeLessThan(0);
  });
});

describe("soprannomi", () => {
  it("re e bancomat vanno a chi chiude più in alto e più in basso, uno a testa", () => {
    const { state, history } = night([win("p0", [["p3"]]), win("p0", [["p3"]]), win("p0"), { type: "game_ended" }]);
    const nick = nicknamesOf(analyzeNight(state, history), fmt);
    expect(nick.p0?.id).toBe("re");
    expect(nick.p3?.id).toBe("bancomat");
    const ids = Object.values(nick).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a pari merito il soprannome non va a nessuno", () => {
    const { state, history } = night([win("p0", [["p3"]]), win("p1", [["p2"]]), win("p4")]);
    const a = analyzeNight(state, history);
    // forziamo due saldi uguali in testa
    a.players.find((p) => p.id === "p0")!.balanceCents = 500;
    a.players.find((p) => p.id === "p1")!.balanceCents = 500;
    const nick = nicknamesOf(a, fmt);
    expect(Object.values(nick).some((n) => n.id === "re")).toBe(false);
  });

  it("chi esce presto è il turista", () => {
    const { state, history } = night([win("p0", [["p3"]]), win("p0"), { type: "player_left", playerId: "p4" }, win("p1"), { type: "game_ended" }]);
    expect(nicknamesOf(analyzeNight(state, history), fmt).p4?.id).toBe("turista");
  });
});

describe("carriera e rivalità", () => {
  it("i soldi tra due giocatori sono proporzionali a quanto ha vinto ognuno", () => {
    const b = { a: -100, b: 60, c: 40 };
    expect(pairFlow(b, "a", "b")).toBe(60);
    expect(pairFlow(b, "a", "c")).toBe(40);
    expect(pairFlow(b, "b", "a")).toBe(0);
  });

  const game = (id: string, endedAt: string, events: GameEvent[], me = "p0"): CareerGame => {
    const { state, history } = night([...events, { type: "game_ended" }]);
    return { gameId: id, title: id, endedAt, state, history, me, keyOf: { p1: "p:bruno", p2: "p:carla", p3: "p:dario", p4: "n:elena" } };
  };

  it("somma serate, saldi, striscia e rivalità", () => {
    const games = [
      game("g1", "2026-11-01T23:00:00Z", [win("p0", [["p3"]]), win("p0")]),
      game("g2", "2026-11-05T23:00:00Z", [win("p0", [["p3"]]), win("p0")]),
      game("g3", "2026-11-09T23:00:00Z", [win("p3", [["p0"]]), win("p3")]),
    ];
    const s = careerOf(games, fmt);
    expect(s.games).toBe(3);
    expect(s.gamesWon).toBe(2);
    expect(s.gamesLost).toBe(1);
    expect(s.streak).toBe(-1);
    expect(s.longestWinStreak).toBe(2);
    expect(s.best?.cents).toBeGreaterThan(0);
    expect(s.worst?.gameId).toBe("g3");
    expect(s.handsWon).toBe(4);
    expect(s.bestie).toBe(1);
    expect(s.lastNickname?.gameId).toBe("g3");

    const dario = s.rivals.find((r) => r.key === "p:dario")!;
    expect(dario.together).toBe(3);
    expect(dario.ahead).toBe(2);
    expect(dario.behind).toBe(1);
    const total = s.rivals.reduce((a, r) => a + r.netCents, 0);
    expect(Math.abs(total - s.totalCents)).toBeLessThanOrEqual(s.rivals.length); // arrotondamenti
  });

  it("un ospite registrato solo per nome si unisce alla persona con quel nome", () => {
    const g1 = game("g1", "2026-11-01T23:00:00Z", [win("p0", [["p3"]]), win("p0")]);
    const g2 = { ...game("g2", "2026-11-02T23:00:00Z", [win("p0", [["p3"]]), win("p0")]), keyOf: { p1: "p:bruno", p2: "p:carla", p3: "n:dario", p4: "n:elena" } };
    const dario = careerOf([g1, g2], fmt).rivals.filter((r) => r.name === "Dario");
    expect(dario).toHaveLength(1);
    expect(dario[0].together).toBe(2);
  });

  it("mette in evidenza chi mi ha dato di più e a chi ho dato di più", () => {
    const h = highlights([
      { key: "a", name: "A", together: 4, ahead: 2, behind: 2, netCents: 500 },
      { key: "b", name: "B", together: 4, ahead: 1, behind: 3, netCents: -800 },
      { key: "c", name: "C", together: 5, ahead: 3, behind: 2, netCents: 20 },
    ]);
    expect(h.bancomat?.key).toBe("a");
    expect(h.nemesi?.key).toBe("b");
    expect(h.rivale?.key).toBe("c");
  });
});
