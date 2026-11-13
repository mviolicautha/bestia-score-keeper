import { describe, expect, it } from "vitest";
import {
  activePlayers,
  applyEvent,
  EngineError,
  isPotClean,
  moneyInvariant,
  replay,
  simplifyDebts,
  validateEvent,
  type GameEvent,
  type GameState,
  type PlayerId,
} from "@/engine";
import { describeEntry } from "./describe";
import { resultsOf } from "./history";
import { momentAt } from "./moments";
import { buildReport, summarize } from "./report";

/**
 * Simulazioni di serate intere: ogni importo atteso è calcolato a mano (vedi i commenti),
 * così un errore nel motore, nel resoconto o nei momenti della TV salta fuori subito.
 * Girano in locale con `npm test`, senza rete né database.
 */

const NAMES: Record<string, string> = {
  a: "Anna", b: "Bruno", c: "Carla", d: "Dario", e: "Elena", f: "Fabio",
  g: "Gino", h: "Ivo", i: "Lia", j: "Marta", k: "Nino",
};

const start = (bet = 30): GameEvent => ({ type: "game_started", baseBetCents: bet });
const add = (id: string, seatAfter?: string): GameEvent => ({ type: "player_added", playerId: id, name: NAMES[id], ...(seatAfter ? { seatAfter } : {}) });
const leave = (id: string): GameEvent => ({ type: "player_left", playerId: id });
const bet = (cents: number): GameEvent => ({ type: "bet_changed", baseBetCents: cents });
const pass: GameEvent = { type: "hand_passed" };
const end: GameEvent = { type: "game_ended" };
/** hand([["a"], 3]) = Anna fa 3 prese; il secondo argomento sono i gruppi in bestia. */
const hand = (winners: [string[], 1 | 2 | 3][], losers: string[][] = []): GameEvent => ({
  type: "hand_played",
  winners: winners.map(([playerIds, tricks]) => ({ playerIds, tricks })),
  losers,
});

const bal = (s: GameState) => Object.fromEntries(s.players.map((p) => [p.id, p.balanceCents]));
const seats = (s: GameState) => s.players.map((p) => p.id).join("");
const errorCode = (s: GameState, ev: GameEvent) => {
  try {
    applyEvent(s, ev);
    return null;
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
};

/** Controlli che devono valere dopo QUALSIASI evento della serata. */
function checkInvariants(s: GameState, where: string) {
  expect(moneyInvariant(s), `${where}: soldi creati o persi`).toBe(0);
  expect(s.potCents, where).toBeGreaterThanOrEqual(0);
  expect(s.potCents % 3, `${where}: piatto non divisibile in terzi`).toBe(0);
  expect(s.players.every((p) => Number.isSafeInteger(p.balanceCents)), where).toBe(true);
  if (s.status === "in_progress" && activePlayers(s).length > 0) {
    expect(s.dealerId, `${where}: manca il mazziere`).not.toBeNull();
    expect(s.players.find((p) => p.id === s.dealerId)?.active, `${where}: mazziere non al tavolo`).toBe(true);
  }
  if (s.status === "ended") expect(s.potCents, `${where}: piatto non vuoto a fine partita`).toBe(0);
  expect(new Set(s.players.map((p) => p.id)).size, `${where}: posto doppio`).toBe(s.players.length);
  expect(new Set(s.players.map((p) => p.joinOrder)).size, `${where}: colori doppi`).toBe(s.players.length);
}

/** Tutto ciò che l'interfaccia calcola da una cronologia deve funzionare a ogni passo (anche dopo "annulla"). */
function checkEveryPrefix(events: GameEvent[]) {
  for (let cut = 1; cut <= events.length; cut++) {
    const where = `dopo ${cut} eventi (${events[cut - 1].type})`;
    const { state, history } = replay(events.slice(0, cut));
    checkInvariants(state, where);

    history.forEach((h, i) => {
      expect(describeEntry(h, state).title, where).toBeTruthy();
      const m = momentAt(history, i, state);
      if (h.event.type === "hand_played") {
        expect(m, where).not.toBeNull();
        // i nomi devono esistere: un "?" sulla TV vuol dire un id sbagliato
        if (m && m.kind !== "pass") expect([...m.winners, ...(m.kind === "bestia" ? m.losers : [])].every((x) => x.name !== "?"), where).toBe(true);
      }
    });

    const r = summarize({ state, history });
    expect(r.ranking).toHaveLength(state.players.length);
    if (r.transfers) {
      // chi paga chi deve chiudere i conti al centesimo (a partita in corso la messa torna al mazziere)
      const due: Record<string, number> = Object.fromEntries(state.players.map((p) => [p.name, p.balanceCents]));
      if (state.status !== "ended" && state.dealerId) due[state.players.find((p) => p.id === state.dealerId)!.name] += state.potCents;
      for (const t of r.transfers) {
        due[t.from] += t.amountCents;
        due[t.to] -= t.amountCents;
        expect(t.amountCents, where).toBeGreaterThan(0);
      }
      expect(Object.values(due).every((v) => v === 0), `${where}: chi paga chi non chiude i conti`).toBe(true);
    } else {
      expect(isPotClean(state), where).toBe(false);
    }
    expect(buildReport({ state, history })).toContain("Classifica");
  }
}

// ---------------------------------------------------------------------------

describe("una serata completa, calcolata a mano", () => {
  // Messa 0,30 €. Posti: Anna, Bruno, Carla, Dario, Elena. Anna è il primo mazziere.
  const events: GameEvent[] = [
    start(30),
    add("a"), add("b"), add("c"), add("d"), add("e"),
    // M1: Anna 3 prese, piatto 30 → Anna +30. Mazzo a Bruno (-30).
    hand([[["a"], 3]]),
    // passata: mazzo a Carla (-30), piatto 60
    pass,
    // M2: piatto 60. Bruno 2/3 (+40), Dario 1/3 (+20), Elena in bestia (-60). Mazzo a Dario (-30), piatto 90
    hand([[["b"], 2], [["d"], 1]], [["e"]]),
    // M3: piatto 90. Società Anna+Carla prende tutto (+45 a testa), società Bruno+Elena in bestia (-45 a testa).
    //     Mazzo a Elena (-30), piatto 120
    hand([[["a", "c"], 3]], [["b", "e"]]),
    // M4: piatto 120. Carla, Dario, Elena 1/3 a testa (+40). Mazzo ad Anna (-30), piatto 30 (pulito)
    hand([[["c"], 1], [["d"], 1], [["e"], 1]]),
    // Fabio arriva e si siede dopo Bruno. La messa sale a 0,60: Anna versa altri 30. Carla va via.
    add("f", "b"),
    bet(60),
    leave("c"),
    // passata: mazzo a Bruno (-60), piatto 120
    pass,
    // M5: piatto 120. Fabio prende tutto (+120). Anna e Dario in bestia separatamente: -120 ciascuno.
    //     Piatto raccolto 240, mazzo a Fabio (-60) → 300
    hand([[["f"], 3]], [["a"], ["d"]]),
    // M6: piatto 300. Elena 2/3 (+200), Bruno 1/3 (+100). Società Anna+Dario in bestia (-150 a testa).
    //     Mazzo: dopo Fabio c'è Carla (uscita) → Dario (-60). Piatto 360
    hand([[["e"], 2], [["b"], 1]], [["a", "d"]]),
    // M7: piatto 360. Anna prende tutto (+360). Mazzo a Elena (-60), piatto 60 (pulito)
    hand([[["a"], 3]]),
    // Elena (mazziere) va via: riprende i suoi 60, il mazzo passa ad Anna (-60).
    leave("e"),
    // Carla rientra al suo vecchio posto (tra Fabio e Dario).
    add("c"),
    // Fine: la messa di Anna torna a lei.
    end,
  ];

  const { state, history } = replay(events);

  it("i saldi finali sono quelli calcolati a mano e fanno zero", () => {
    expect(bal(state)).toEqual({ a: 75, b: 5, c: 55, d: -300, e: 105, f: 60 });
    expect(state.status).toBe("ended");
    expect(state.potCents).toBe(0);
  });

  it("i posti rispettano chi si è seduto in mezzo e chi è rientrato", () => {
    expect(seats(state)).toBe("abfcde");
    expect(state.players.find((p) => p.id === "e")!.active).toBe(false);
    expect(state.players.find((p) => p.id === "c")!.active).toBe(true);
  });

  it("i saldi dopo ogni mano sono quelli attesi", () => {
    const after = (n: number) => history.filter((h) => h.event.type === "hand_played")[n - 1].balances;
    expect(after(1)).toEqual({ a: 0, b: -30, c: 0, d: 0, e: 0 });
    expect(after(2)).toEqual({ a: 0, b: 10, c: -30, d: -10, e: -60 });
    expect(after(3)).toEqual({ a: 45, b: -35, c: 15, d: -10, e: -135 });
    expect(after(4)).toEqual({ a: 15, b: -35, c: 55, d: 30, e: -95 });
    expect(after(5)).toEqual({ a: -135, b: -95, f: 60, c: 55, d: -90, e: -95 });
    expect(after(6)).toEqual({ a: -285, b: 5, f: 60, c: 55, d: -300, e: 105 });
    expect(after(7)).toEqual({ a: 75, b: 5, f: 60, c: 55, d: -300, e: 45 });
  });

  it("statistiche: mani, passate, record del piatto, prese e bestie", () => {
    expect(state.handsPlayed).toBe(7);
    expect(state.handsPassed).toBe(2);
    expect(state.maxPotCents).toBe(360);
    const stats = Object.fromEntries(state.players.map((p) => [p.id, p.stats]));
    expect(stats).toEqual({
      a: { handsWon: 3, tricks: 9, bestie: 2 },
      b: { handsWon: 2, tricks: 3, bestie: 1 },
      f: { handsWon: 1, tricks: 3, bestie: 0 },
      c: { handsWon: 2, tricks: 4, bestie: 0 },
      d: { handsWon: 2, tricks: 2, bestie: 2 },
      e: { handsWon: 2, tricks: 3, bestie: 2 },
    });
  });

  it("a piatto sporco non si può cambiare il tavolo né chiudere", () => {
    const dirty = replay(events.slice(0, 9)).state; // dopo M2: piatto 90
    expect(dirty.potCents).toBe(90);
    expect(errorCode(dirty, add("f"))).toBe("POT_NOT_CLEAN");
    expect(errorCode(dirty, leave("a"))).toBe("POT_NOT_CLEAN");
    expect(errorCode(dirty, bet(60))).toBe("POT_NOT_CLEAN");
    expect(errorCode(dirty, end)).toBe("POT_NOT_CLEAN");
  });

  it("con 4 al tavolo non si gioca finché qualcuno non rientra", () => {
    const four = replay(events.slice(0, events.length - 2)).state; // Elena appena uscita
    expect(activePlayers(four)).toHaveLength(4);
    expect(errorCode(four, pass)).toBe("NOT_ENOUGH_PLAYERS");
    expect(errorCode(four, hand([[["a"], 3]]))).toBe("NOT_ENOUGH_PLAYERS");
    expect(errorCode(four, end)).toBeNull();
  });

  it("chi paga chi: Dario paga tutti, dal credito più grande", () => {
    expect(simplifyDebts(bal(state))).toEqual([
      { from: "d", to: "e", amountCents: 105 },
      { from: "d", to: "a", amountCents: 75 },
      { from: "d", to: "f", amountCents: 60 },
      { from: "d", to: "c", amountCents: 55 },
      { from: "d", to: "b", amountCents: 5 },
    ]);
    // lo storico salva anche chi è uscito prima della fine
    expect(resultsOf(state).map((r) => r.playerId).sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(resultsOf(state).reduce((a, r) => a + r.balanceCents, 0)).toBe(0);
  });

  it("il resoconto WhatsApp riporta i record giusti", () => {
    const r = summarize({ state, history });
    expect(r.facts).toBe("7 mani · 2 passate · messa 0,60 €");
    expect(r.ranking.map((p) => p.id)).toEqual(["e", "a", "f", "c", "b", "d"]);
    expect(r.records).toEqual([
      { icon: "🔥", label: "Piatto più ricco", value: "3,60 € (mano 7, Anna)" },
      { icon: "🃏", label: "Più mani vinte", value: "Anna (3)" },
      { icon: "🐗", label: "Più bestie", value: "Anna, Dario, Elena (2)" },
      { icon: "💥", label: "Bestia più cara", value: "Anna -1,50 €" },
    ]);
  });

  it("i momenti della TV: bestia, piatto d'oro e passata", () => {
    const idx = (n: number) => history.filter((h) => h.event.type === "hand_played")[n - 1].index;
    // M5: Fabio vince 120 netti anche se poi diventa mazziere e versa la messa
    expect(momentAt(history, idx(5), state)).toMatchObject({
      kind: "bestia",
      potCents: 120,
      winners: [{ id: "f", cents: 120 }],
      losers: [{ id: "a", cents: -120 }, { id: "d", cents: -120 }],
    });
    // M4: 120 supera il record precedente (90) → piatto d'oro
    expect(momentAt(history, idx(4), state)).toMatchObject({ kind: "win", potCents: 120, big: true });
    // M1: primo piatto da 30, niente oro
    expect(momentAt(history, idx(1), state)).toMatchObject({ kind: "win", potCents: 30, big: false });
    expect(momentAt(history, 7, state)).toMatchObject({ kind: "pass", dealer: "Carla" });
  });

  it("annullando a qualunque punto tutto resta coerente (motore, TV, resoconto)", () => {
    checkEveryPrefix(events);
  });
});

// ---------------------------------------------------------------------------

describe("casi limite di una serata", () => {
  it("se vanno via tutti, il primo che torna fa il mazziere", () => {
    const events = [start(30), add("a"), add("b"), add("c"), add("d"), add("e"),
      leave("a"), leave("b"), leave("c"), leave("d"), leave("e")];
    let { state } = replay(events);
    expect(state.dealerId).toBeNull();
    expect(state.potCents).toBe(0);
    expect(Object.values(bal(state)).every((v) => v === 0)).toBe(true);

    const more = [...events, bet(90), add("f"), add("g"), add("c"), add("h"), add("i"), hand([[["c"], 3]], [["g"]])];
    state = replay(more).state;
    // Fabio primo mazziere (-90), Carla vince 90, Gino paga 90, mazzo a Gino (-90)
    expect(bal(state)).toEqual({ a: 0, b: 0, c: 90, d: 0, e: 0, f: -90, g: -180, h: 0, i: 0 });
    expect(state.dealerId).toBe("g");
    expect(state.potCents).toBe(180);
    checkEveryPrefix(more);
  });

  it("chiudere a tavolo vuoto non lascia soldi in giro", () => {
    const { state } = replay([start(30), add("a"), add("b"), leave("a"), leave("b"), end]);
    expect(state.status).toBe("ended");
    expect(bal(state)).toEqual({ a: 0, b: 0 });
  });

  it("tavolo pieno a 10: l'undicesimo aspetta, anche chi vuole rientrare", () => {
    const ten = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const events = [start(30), ...ten.map((id) => add(id))];
    let { state } = replay(events);
    expect(errorCode(state, add("k"))).toBe("TABLE_FULL");
    state = applyEvent(state, leave("b")).state;
    state = applyEvent(state, add("k")).state;
    expect(errorCode(state, add("b"))).toBe("TABLE_FULL");
    state = applyEvent(state, leave("c")).state;
    expect(errorCode(state, add("b"))).toBeNull();
    checkInvariants(state, "tavolo pieno");
  });

  it("società in numero dispari: i centesimi avanzati vanno al primo per posto, nessuno si perde", () => {
    // messa 0,33: piatto 33
    const events = [start(33), add("a"), add("b"), add("c"), add("d"), add("e"),
      hand([[["b", "a"], 3]], [["d", "c"]])];
    const { state } = replay(events);
    // vincite 33 → Anna 17, Bruno 16 (Anna è prima al tavolo anche se scritta dopo). Bestia 33 → Carla 17, Dario 16.
    // Mazzo a Bruno (-33).
    expect(bal(state)).toEqual({ a: -33 + 17, b: 16 - 33, c: -17, d: -16, e: 0 });
    expect(state.potCents).toBe(33 + 33);
    checkEveryPrefix(events);
  });

  it("società da tre in bestia paga un solo piatto, diviso in tre", () => {
    const events = [start(30), add("a"), add("b"), add("c"), add("d"), add("e"), add("f"),
      pass, pass, // piatto 90
      hand([[["a"], 2], [["b"], 1]], [["c", "d", "e"]])];
    const { state } = replay(events);
    expect(state.potCents).toBe(90 + 30); // un solo piatto raccolto + messa del nuovo mazziere
    const s = bal(state);
    expect([s.c, s.d, s.e]).toEqual([-30 - 30, -30 - 30, -30]); // Carla ha versato la messa della passata, Dario quella del nuovo mazzo
    checkEveryPrefix(events);
  });

  it("chi vince può anche andare in bestia nella stessa mano", () => {
    const events = [start(30), add("a"), add("b"), add("c"), add("d"), add("e"),
      hand([[["a"], 1], [["b"], 2]], [["a"]])];
    const { state, history } = replay(events);
    // Anna: -30 messa +10 vinti -30 bestia = -50
    expect(bal(state).a).toBe(-50);
    const m = momentAt(history, history.length - 1, state);
    expect(m).toMatchObject({ kind: "bestia", losers: [{ id: "a", cents: -20 }] });
  });

  it("bestie a catena: il piatto cresce ma resta esatto al centesimo", () => {
    const events: GameEvent[] = [start(30), add("a"), add("b"), add("c"), add("d"), add("e")];
    // 15 mani con due bestie ciascuna: il piatto raddoppia ogni volta
    for (let i = 0; i < 15; i++) events.push(hand([[["a"], 3]], [["b"], ["c"]]));
    const { state } = replay(events);
    checkInvariants(state, "bestie a catena");
    expect(state.potCents).toBe(60 * 2 ** 15 - 30); // p(n+1) = 2·p(n) + messa
    // poi si gioca pulito finché il piatto torna alla messa e si chiude
    let s = state;
    while (!isPotClean(s)) s = applyEvent(s, hand([[["d"], 3]])).state;
    s = applyEvent(s, end).state;
    checkInvariants(s, "fine dopo le bestie a catena");
  });

  it("cambiare la messa più volte a piatto pulito aggiorna sempre il versamento del mazziere", () => {
    const events = [start(30), add("a"), add("b"), add("c"), add("d"), add("e"), bet(90), bet(15), bet(300), end];
    const { state, history } = replay(events);
    expect(history[8].outcome.deltas).toEqual({ a: -285 }); // da 15 a 300: Anna versa la differenza
    expect(bal(state)).toEqual({ a: 0, b: 0, c: 0, d: 0, e: 0 });
  });

  it("messe non valide vengono rifiutate", () => {
    const s = replay([start(30), add("a")]).state;
    for (const cents of [0, -30, 10, 31, 1.5, NaN]) expect(errorCode(s, bet(cents)), String(cents)).toBe("INVALID_BET");
    expect(errorCode(replay([]).state, start(20))).toBe("INVALID_BET");
  });

  it("il mazziere che esce subito dopo essersi seduto riprende la messa", () => {
    const events = [start(30), add("a"), add("b"), leave("a")];
    const { state } = replay(events);
    expect(bal(state)).toEqual({ a: 0, b: -30 });
    expect(state.dealerId).toBe("b");
  });

  it("chi rientra non può prendere il nome di chi è già al tavolo", () => {
    let { state } = replay([start(30), add("a"), add("b"), leave("b")]);
    state = applyEvent(state, { type: "player_added", playerId: "x", name: "bruno" }).state;
    expect(errorCode(state, add("b"))).toBe("DUPLICATE_NAME");
    // può rientrare con un nome diverso
    expect(errorCode(state, { type: "player_added", playerId: "b", name: "Bruno 2" })).toBeNull();
  });

  it("nomi: spazi tolti, vuoti e troppo lunghi rifiutati", () => {
    const s = replay([start(30), add("a")]).state;
    expect(errorCode(s, { type: "player_added", playerId: "x", name: "   " })).toBe("INVALID_NAME");
    expect(errorCode(s, { type: "player_added", playerId: "x", name: "x".repeat(21) })).toBe("INVALID_NAME");
    expect(errorCode(s, { type: "player_added", playerId: "x", name: "  ANNA " })).toBe("DUPLICATE_NAME");
    const ok = applyEvent(s, { type: "player_added", playerId: "x", name: "  Zeno  " }).state;
    expect(ok.players.at(-1)!.name).toBe("Zeno");
  });

  it("mani non valide: prese sbagliate, giocatori usciti o sconosciuti, doppioni", () => {
    const s = replay([start(30), add("a"), add("b"), add("c"), add("d"), add("e"), add("f"), leave("f")]).state;
    const cases: [GameEvent, string][] = [
      [hand([]), "INVALID_WINNERS"],
      [hand([[["a"], 2]]), "INVALID_WINNERS"],
      [hand([[["a"], 3], [["b"], 1]]), "INVALID_WINNERS"],
      [hand([[["a"], 1], [["b"], 1], [["c"], 1], [["d"], 1]] as never), "INVALID_WINNERS"],
      [hand([[["a"], 2], [["a"], 1]]), "INVALID_WINNERS"],
      [hand([[[], 3]]), "INVALID_WINNERS"],
      [hand([[["f"], 3]]), "PLAYER_NOT_ACTIVE"],
      [hand([[["zz"], 3]]), "UNKNOWN_PLAYER"],
      [hand([[["a"], 3]], [["f"]]), "PLAYER_NOT_ACTIVE"],
      [hand([[["a"], 3]], [[]]), "INVALID_LOSERS"],
      [hand([[["a"], 3]], [["b"], ["b"]]), "INVALID_LOSERS"],
      [{ type: "hand_played", winners: [{ playerIds: ["a"], tricks: 4 as never }], losers: [] }, "INVALID_WINNERS"],
    ];
    for (const [ev, code] of cases) expect(errorCode(s, ev), JSON.stringify(ev)).toBe(code);
  });

  it("dopo la fine non si può fare più niente; prima dell'inizio nemmeno", () => {
    const ended = replay([start(30), add("a"), end]).state;
    for (const ev of [add("b"), leave("a"), bet(60), pass, hand([[["a"], 3]]), end]) {
      expect(errorCode(ended, ev), ev.type).toBe("GAME_ENDED");
    }
    expect(errorCode(ended, start(30))).toBe("ALREADY_STARTED");
    const fresh = replay([]).state;
    for (const ev of [add("a"), leave("a"), bet(60), pass, end]) expect(errorCode(fresh, ev), ev.type).toBe("NOT_STARTED");
  });

  it("annullare la fine riporta la messa nel piatto e si può continuare", () => {
    const events = [start(30), add("a"), add("b"), add("c"), add("d"), add("e"), hand([[["b"], 3]]), end];
    const undone = replay(events.slice(0, -1)).state;
    expect(undone.status).toBe("in_progress");
    expect(undone.potCents).toBe(30);
    expect(validateEvent(undone, pass)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

/** Generatore deterministico: stesse serate a ogni esecuzione. */
function rng(seed: number) {
  let t = seed >>> 0;
  return (n: number) => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return Math.floor((((r ^ (r >>> 14)) >>> 0) / 4294967296) * n);
  };
}

describe("serate casuali: resoconto e TV restano coerenti", () => {
  it("in 150 serate ogni passo regge e chi paga chi chiude sempre i conti", () => {
    for (let game = 0; game < 150; game++) {
      const rnd = rng(7000 + game);
      let n = 0;
      const ids: PlayerId[] = [];
      const events: GameEvent[] = [start(30 * (1 + rnd(3)))];
      for (let i = 0; i < 5 + rnd(4); i++) {
        ids.push(`p${n}`);
        events.push({ type: "player_added", playerId: `p${n}`, name: `G${n++}` });
      }
      let s = replay(events).state;
      for (let step = 0; step < 40; step++) {
        const active = activePlayers(s).map((p) => p.id);
        const pick = () => active.splice(rnd(active.length), 1)[0];
        let ev: GameEvent;
        const r = rnd(12);
        if (isPotClean(s) && r === 0 && active.length < 10) {
          ev = { type: "player_added", playerId: `p${n}`, name: `G${n++}` };
        } else if (isPotClean(s) && r === 1 && active.length > 5) {
          ev = leave(active[rnd(active.length)]);
        } else if (isPotClean(s) && r === 2) {
          ev = bet(30 * (1 + rnd(4)));
        } else if (r === 3) {
          ev = pass;
        } else {
          const layout = [[3], [2, 1], [1, 1, 1]][rnd(3)] as (1 | 2 | 3)[];
          const winners = layout.map((tricks) => ({ playerIds: rnd(4) === 0 && active.length > 4 ? [pick(), pick()] : [pick()], tricks }));
          const losers: string[][] = [];
          for (let k = rnd(3); k > 0 && active.length > 0; k--) losers.push(rnd(3) === 0 && active.length > 1 ? [pick(), pick()] : [pick()]);
          ev = { type: "hand_played", winners, losers };
        }
        expect(validateEvent(s, ev), `serata ${game} passo ${step}: ${JSON.stringify(ev)}`).toBeNull();
        s = applyEvent(s, ev).state;
        events.push(ev);
      }
      while (!isPotClean(s)) {
        const ev = hand([[[activePlayers(s)[0].id], 3]]);
        s = applyEvent(s, ev).state;
        events.push(ev);
      }
      events.push(end);
      checkEveryPrefix(events);
    }
  }, 120_000);
});
