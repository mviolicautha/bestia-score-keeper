import { describe, expect, it } from "vitest";
import {
  activePlayers,
  applyEvent,
  isPotClean,
  moneyInvariant,
  replay,
  simplifyDebts,
  validateEvent,
  type GameEvent,
  type GameState,
} from "./index";

/** Generatore pseudo-casuale deterministico (stessi numeri a ogni esecuzione). */
function rng(seed: number) {
  // mulberry32: piccolo ma con bit ben distribuiti (un LCG con "% n" ripete i bit bassi).
  let t = seed >>> 0;
  return (n: number) => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return Math.floor((((r ^ (r >>> 14)) >>> 0) / 4294967296) * n);
  };
}

function shuffle<T>(arr: T[], rnd: (n: number) => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sceglie un evento plausibile per lo stato attuale, come farebbe un master durante una serata. */
function randomEvent(s: GameState, rnd: (n: number) => number, nextId: () => string): GameEvent {
  const active = activePlayers(s);
  const inactive = s.players.filter((p) => !p.active);

  if (isPotClean(s)) {
    const r = rnd(10);
    if (r === 0 && active.length < s.rules.maxPlayers) return { type: "player_added", playerId: nextId(), name: `G${s.players.length}` };
    if (r === 1 && inactive.length > 0 && active.length < s.rules.maxPlayers) {
      const p = inactive[rnd(inactive.length)];
      return { type: "player_added", playerId: p.id, name: p.name };
    }
    if (r === 2 && active.length > s.rules.minPlayers) return { type: "player_left", playerId: active[rnd(active.length)].id };
    if (r === 3) return { type: "bet_changed", baseBetCents: 30 * (1 + rnd(4)) };
  }

  if (rnd(4) === 0) return { type: "hand_passed" };

  const ids = shuffle(active.map((p) => p.id), rnd);
  const layout = [[3], [2, 1], [1, 1, 1]][rnd(3)];
  let k = 0;
  const winners = layout.map((tricks, gi) => {
    const remainingGroups = layout.length - gi - 1;
    const size = rnd(4) === 0 && k + 2 + remainingGroups <= ids.length ? 2 : 1;
    const playerIds = ids.slice(k, k + size);
    k += size;
    return { playerIds, tricks: tricks as 1 | 2 | 3 };
  });
  // Bestie tra chi non ha vinto (a volte nessuna, a volte una società, raramente un vincitore "ibrido").
  const losers: string[][] = [];
  const rest = ids.slice(k);
  const nLosers = rnd(3);
  for (let i = 0; i < nLosers && rest.length > 0; i++) {
    losers.push(rnd(5) === 0 && rest.length >= 2 ? rest.splice(0, 2) : rest.splice(0, 1));
  }
  if (rnd(10) === 0) losers.push([winners[0].playerIds[0]]);
  return { type: "hand_played", winners, losers };
}

describe("serate casuali (fuzz)", () => {
  it("in 300 serate i soldi tornano sempre al centesimo, e i conti finali si chiudono", () => {
    const seen: Record<string, number> = {};
    let rejoins = 0;
    let hybrids = 0;
    for (let game = 0; game < 300; game++) {
      const rnd = rng(1000 + game);
      let counter = 0;
      const nextId = () => `p${counter++}`;
      const events: GameEvent[] = [{ type: "game_started", baseBetCents: 30 * (1 + rnd(3)) }];
      for (let i = 0; i < 5 + rnd(4); i++) events.push({ type: "player_added", playerId: nextId(), name: `G${i}` });

      let { state } = replay(events);
      for (let step = 0; step < 60; step++) {
        const ev = randomEvent(state, rnd, nextId);
        const err = validateEvent(state, ev);
        expect(err, `serata ${game}, passo ${step}: ${JSON.stringify(ev)}`).toBeNull();
        if (ev.type === "player_added" && state.players.some((p) => p.id === ev.playerId)) rejoins++;
        if (ev.type === "hand_played" && ev.losers.flat().some((id) => ev.winners.some((w) => w.playerIds.includes(id)))) hybrids++;
        seen[ev.type] = (seen[ev.type] ?? 0) + 1;
        state = applyEvent(state, ev).state;
        events.push(ev);
        expect(moneyInvariant(state)).toBe(0);
        expect(state.potCents).toBeGreaterThanOrEqual(0);
        expect(state.players.every((p) => Number.isInteger(p.balanceCents))).toBe(true);
        expect(state.dealerId === null || state.players.find((p) => p.id === state.dealerId)!.active).toBe(true);
      }

      // Si gioca senza bestie finché il piatto non torna pulito, poi si chiude.
      while (!isPotClean(state)) {
        const first = activePlayers(state)[0].id;
        const ev: GameEvent = { type: "hand_played", winners: [{ playerIds: [first], tricks: 3 }], losers: [] };
        state = applyEvent(state, ev).state;
        events.push(ev);
      }
      state = applyEvent(state, { type: "game_ended" }).state;
      events.push({ type: "game_ended" });

      const balances = Object.fromEntries(state.players.map((p) => [p.id, p.balanceCents]));
      expect(Object.values(balances).reduce((a, b) => a + b, 0)).toBe(0);
      const transfers = simplifyDebts(balances);
      expect(transfers.length).toBeLessThan(Math.max(1, state.players.length));

      // Rigiocare tutta la sequenza (come dopo un riavvio) dà lo stesso identico stato.
      expect(replay(events).state).toEqual(state);

      // Annullare ripetutamente (togliere l'ultimo evento) porta sempre a uno stato valido.
      for (let cut = events.length - 1; cut > events.length - 10; cut--) {
        expect(moneyInvariant(replay(events.slice(0, cut)).state)).toBe(0);
      }
    }
    // Il test deve aver provato davvero ogni tipo di azione.
    for (const type of ["player_added", "player_left", "bet_changed", "hand_passed", "hand_played"]) {
      expect(seen[type] ?? 0, type).toBeGreaterThan(20);
    }
    expect(rejoins).toBeGreaterThan(5);
    expect(hybrids).toBeGreaterThan(5);
  }, 30_000);
});
