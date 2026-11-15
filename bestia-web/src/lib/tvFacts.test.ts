import { describe, expect, it } from "vitest";
import { replay, type GameEvent } from "@/engine";
import { inStuff, tvFacts } from "./tvFacts";

const names = ["Anna", "Bruno", "Carla", "Dario", "Elena"];
const players: GameEvent[] = names.map((name, i) => ({ type: "player_added", playerId: `p${i}`, name }));
const win = (id: string, losers: string[][] = []): GameEvent => ({ type: "hand_played", winners: [{ playerIds: [id], tricks: 3 }], losers });

function night(events: GameEvent[]) {
  return replay([{ type: "game_started", baseBetCents: 30 }, ...players, ...events]);
}
const ids = (r: ReturnType<typeof tvFacts>) => r.facts.map((f) => f.id);

describe("curiosità per la TV", () => {
  it("all'inizio non inventa niente", () => {
    const { state, history } = night([]);
    expect(tvFacts(state, history).facts).toEqual([]);
  });

  it("vede chi è in serie e chi è a secco", () => {
    const { state, history } = night([win("p1"), win("p0"), win("p0"), win("p0"), win("p0"), win("p0"), win("p0")]);
    const r = tvFacts(state, history);
    expect(r.form.p0.streak).toBe(6);
    const streak = r.facts.find((f) => f.id === "streak");
    expect(streak?.headline).toBe("Anna");
    expect(streak?.detail).toContain("6 mani");
    // in 4 sono a secco da 7 mani (Bruno da 6): a pari merito nessun badge
    expect(r.driest).toBeNull();
  });

  it("conta le bestie, il piatto record e chi dà male le carte", () => {
    const { state, history } = night([win("p0", [["p3"]]), win("p1", [["p3"]]), { type: "misdeal" }, win("p2")]);
    const r = tvFacts(state, history);
    expect(r.facts.find((f) => f.id === "bestie")?.headline).toBe("Dario");
    expect(r.facts.find((f) => f.id === "record")?.headline).toMatch(/€/);
    expect(ids(r)).toContain("burro");
  });

  it("ritmo e proiezione arrivano con gli orari", () => {
    const events = [win("p0", [["p3"]]), win("p0", [["p3"]]), win("p0", [["p3"]]), win("p0", [["p3"]]), win("p0", [["p3"]]), win("p0", [["p3"]])];
    const { state, history } = night(events);
    const start = Date.parse("2026-11-14T21:00:00Z");
    const times = history.map((_, i) => new Date(start + i * 5 * 60000).toISOString());
    const r = tvFacts(state, history, times);
    expect(ids(r)).toContain("ritmo");
    expect(r.facts.find((f) => f.id === "proiezione")?.headline).toMatch(/Anna|Dario/);
    expect(ids(tvFacts(state, history))).not.toContain("ritmo");
  });

  it("converte gli importi in cose da bar", () => {
    expect(inStuff(120)).toBe("1 caffè");
    expect(inStuff(700)).toBe("2 spritz");
    expect(inStuff(2400)).toBe("3 pizze margherite");
  });
});
