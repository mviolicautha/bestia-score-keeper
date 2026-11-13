import { describe, expect, it } from "vitest";
import { replay, type GameEvent } from "@/engine";
import { buildReport } from "./report";

const players: GameEvent[] = ["Anna", "Bruno", "Carla", "Dario", "Elena"].map((name, i) => ({ type: "player_added", playerId: `p${i}`, name }));
const base: GameEvent[] = [
  { type: "game_started", baseBetCents: 30 },
  ...players,
  { type: "hand_played", winners: [{ playerIds: ["p0"], tricks: 3 }], losers: [["p3"]] },
  { type: "hand_played", winners: [{ playerIds: ["p0"], tricks: 2 }, { playerIds: ["p1"], tricks: 1 }], losers: [["p3"]] },
  { type: "hand_played", winners: [{ playerIds: ["p1"], tricks: 3 }], losers: [] },
];
const report = (events: GameEvent[], extra: Partial<Parameters<typeof buildReport>[0]> = {}) => {
  const { state, history } = replay(events);
  return buildReport({ state, history, title: "Venerdì", ...extra });
};

describe("resoconto per WhatsApp", () => {
  it("a fine partita: classifica con medaglie, chi paga chi, record", () => {
    const text = report([...base, { type: "game_ended" }]);
    expect(text.split("\n")[0]).toBe("🐗 *Bestia · Venerdì*");
    expect(text).not.toMatch(/parziale/);
    expect(text).toMatch(/3 mani · messa 0,30 €/);
    expect(text).toMatch(/🏆 \*Classifica\*\n🥇 /);
    expect(text).toMatch(/💸 \*Chi paga chi\*/);
    expect(text).toMatch(/🐗 Più bestie: Dario \(2\)/);
    expect(text).toMatch(/🔥 Piatto più ricco: /);
    expect(text).not.toMatch(/\u00a0/); // niente spazi speciali: incollato resta allineato
  });

  it("la somma di chi paga chi chiude esattamente i conti", () => {
    const { state, history } = replay([...base, { type: "game_ended" }]);
    const text = buildReport({ state, history });
    const paid = [...text.matchAll(/→ .+ {2}(\d+),(\d\d) €/g)].reduce((a, m) => a + Number(m[1]) * 100 + Number(m[2]), 0);
    const owed = state.players.filter((p) => p.balanceCents < 0).reduce((a, p) => a - p.balanceCents, 0);
    expect(paid).toBe(owed);
  });

  it("a partita in corso è un resoconto parziale e segna chi è uscito", () => {
    const text = report([...base, { type: "player_left", playerId: "p4" }]);
    expect(text).toMatch(/_Resoconto parziale/);
    expect(text).toMatch(/💸 \*Se finisse ora\*/);
    expect(text).toMatch(/Elena .*_\(uscito\)_/);
  });

  it("a partita in corso con una bestia nel piatto: dice quanto c'è, i conti a piatto pulito", () => {
    const text = report(base.slice(0, -1)); // l'ultima mano lasciata è con Dario in bestia
    expect(text).toMatch(/🪙 Nel piatto: \*\d+,\d\d €\*/);
    expect(text).not.toMatch(/Chi paga chi|Se finisse ora/);
  });

  it("appena iniziata: tutti in pari, nessun record", () => {
    const text = report([{ type: "game_started", baseBetCents: 30 }, ...players, { type: "game_ended" }]);
    expect(text).toMatch(/0 mani/);
    expect(text).toMatch(/Tutti in pari/);
    expect(text).not.toMatch(/🥇|🔥|Più bestie/);
  });

  it("data, orari e durata dagli eventi; link in fondo", () => {
    const times = ["2026-11-13T20:05:00Z", "2026-11-13T21:00:00Z", "2026-11-13T23:15:00Z"];
    const text = report(base, { times, url: "https://bestia.example" });
    expect(text).toMatch(/📅 .*13 nov.*→.*\(3h 10'\)/);
    expect(text.split("\n").at(-1)).toBe("_Conti tenuti con Bestia · https://bestia.example_");
  });

  it("nomi con caratteri di formattazione non rompono il messaggio", () => {
    const text = report([
      { type: "game_started", baseBetCents: 30 },
      ...players.slice(1),
      { type: "player_added", playerId: "px", name: "*Mar_co*" },
      { type: "game_ended" },
    ]);
    expect(text).toMatch(/\. Marco {2}/);
    expect(text).not.toMatch(/\*Mar/);
  });

  it("la messa del nuovo mazziere non conta come bestia", () => {
    // nessuno va in bestia: l'unico importo negativo sarebbe la messa del nuovo mazziere
    const text = report([{ type: "game_started", baseBetCents: 30 }, ...players, { type: "hand_played", winners: [{ playerIds: ["p0"], tricks: 3 }], losers: [] }]);
    expect(text).not.toMatch(/Bestia più cara/);
  });
});
