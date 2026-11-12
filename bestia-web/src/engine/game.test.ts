import { describe, expect, it } from "vitest";
import {
  activePlayers,
  applyEvent,
  EngineError,
  handPayouts,
  moneyInvariant,
  replay,
  splitCents,
  type GameEvent,
  type GameState,
} from "./index";

const NAMES = ["Anna", "Bruno", "Carla", "Dario", "Elena", "Fabio"];

/** Partita da 0,30 € con i primi `n` giocatori (id = iniziale minuscola). */
function setup(n = 5, bet = 30): GameEvent[] {
  return [
    { type: "game_started", baseBetCents: bet },
    ...NAMES.slice(0, n).map((name) => ({
      type: "player_added" as const,
      playerId: name[0].toLowerCase(),
      name,
    })),
  ];
}

const bal = (s: GameState) => Object.fromEntries(s.players.map((p) => [p.id, p.balanceCents]));

function expectError(events: GameEvent[], code: string) {
  try {
    replay(events);
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe(code);
    return;
  }
  throw new Error(`atteso errore ${code}`);
}

describe("avvio e giocatori", () => {
  it("il primo giocatore fa il mazziere e versa la messa", () => {
    const { state } = replay(setup());
    expect(state.dealerId).toBe("a");
    expect(state.potCents).toBe(30);
    expect(bal(state)).toEqual({ a: -30, b: 0, c: 0, d: 0, e: 0 });
    expect(moneyInvariant(state)).toBe(0);
  });

  it("non si può aggiungere un giocatore con il piatto sporco", () => {
    expectError(
      [...setup(), { type: "hand_passed" }, { type: "player_added", playerId: "f", name: "Fabio" }],
      "POT_NOT_CLEAN",
    );
  });

  it("rifiuta nomi duplicati e tavolo pieno", () => {
    expectError([...setup(), { type: "player_added", playerId: "x", name: "anna" }], "DUPLICATE_NAME");
    expectError(
      [
        { type: "game_started", baseBetCents: 30, rules: { maxPlayers: 2 } },
        { type: "player_added", playerId: "a", name: "A" },
        { type: "player_added", playerId: "b", name: "B" },
        { type: "player_added", playerId: "c", name: "C" },
      ],
      "TABLE_FULL",
    );
  });

  it("servono almeno 5 giocatori per passare o giocare", () => {
    expectError([...setup(4), { type: "hand_passed" }], "NOT_ENOUGH_PLAYERS");
  });

  it("chi esce può rientrare con lo stesso id e tiene il saldo", () => {
    const events: GameEvent[] = [
      ...setup(6),
      { type: "hand_played", winners: [{ playerIds: ["b"], tricks: 3 }], losers: [] },
      { type: "player_left", playerId: "b" },
      { type: "player_added", playerId: "b", name: "Bruno" },
    ];
    const { state } = replay(events);
    expect(state.players.find((p) => p.id === "b")).toMatchObject({ active: true, balanceCents: 30 });
  });
});

describe("passa", () => {
  it("il mazzo gira e il nuovo mazziere versa la messa", () => {
    const { state } = replay([...setup(), { type: "hand_passed" }, { type: "hand_passed" }]);
    expect(state.dealerId).toBe("c");
    expect(state.potCents).toBe(90);
    expect(bal(state)).toEqual({ a: -30, b: -30, c: -30, d: 0, e: 0 });
    expect(state.handsPassed).toBe(2);
  });

  it("dopo l'ultimo posto torna al primo, saltando chi è uscito", () => {
    const events: GameEvent[] = [...setup(6), { type: "player_left", playerId: "b" }];
    let { state } = replay(events);
    for (let i = 0; i < 4; i++) state = applyEvent(state, { type: "hand_passed" }).state;
    expect(state.dealerId).toBe("f");
    state = applyEvent(state, { type: "hand_passed" }).state;
    expect(state.dealerId).toBe("a");
    state = applyEvent(state, { type: "hand_passed" }).state;
    expect(state.dealerId).toBe("c");
  });
});

describe("mano giocata", () => {
  it("un vincitore con 3 prese prende tutto, la bestia paga il piatto", () => {
    const { state, history } = replay([
      ...setup(),
      { type: "hand_passed" }, // piatto 60, mazziere b
      { type: "hand_played", winners: [{ playerIds: ["c"], tricks: 3 }], losers: [["d"]] },
    ]);
    // c +60, d -60; nuovo piatto = 60 (bestia) + 30 (messa di c, nuovo mazziere)
    expect(bal(state)).toEqual({ a: -30, b: -30, c: 60 - 30, d: -60, e: 0 });
    expect(state.potCents).toBe(90);
    expect(state.dealerId).toBe("c");
    expect(history.at(-1)!.outcome.deltas).toEqual({ c: 30, d: -60 });
    expect(moneyInvariant(state)).toBe(0);
  });

  it("tre vincitori prendono 1/3 a testa", () => {
    const { state } = replay([
      ...setup(),
      { type: "hand_passed" },
      { type: "hand_passed" }, // piatto 90
      {
        type: "hand_played",
        winners: [
          { playerIds: ["a"], tricks: 1 },
          { playerIds: ["b"], tricks: 1 },
          { playerIds: ["e"], tricks: 1 },
        ],
        losers: [],
      },
    ]);
    // a, b, e +30 ciascuno; nessuna bestia, quindi d (nuovo mazziere) versa la messa
    expect(bal(state)).toEqual({ a: 0, b: 0, c: -30, d: -30, e: 30 });
    expect(state.potCents).toBe(30);
  });

  it("due vincitori: 2/3 e 1/3", () => {
    const { state } = replay([
      ...setup(),
      { type: "hand_passed" },
      { type: "hand_passed" }, // piatto 90, mazziere c
      {
        type: "hand_played",
        winners: [
          { playerIds: ["a"], tricks: 2 },
          { playerIds: ["e"], tricks: 1 },
        ],
        losers: [],
      },
    ]);
    expect(state.players.find((p) => p.id === "a")!.balanceCents).toBe(-30 + 60);
    expect(state.players.find((p) => p.id === "e")!.balanceCents).toBe(30);
    // nessuna bestia: il piatto riparte dalla sola messa del nuovo mazziere (d)
    expect(state.potCents).toBe(30);
    expect(state.dealerId).toBe("d");
  });

  it("le società dividono vincite e bestie, senza perdere centesimi", () => {
    const { state } = replay([
      ...setup(),
      // piatto 30: società b+c prende 1 presa (10), d prende 2 (20); bestia la società a+e (paga 30 in due)
      {
        type: "hand_played",
        winners: [
          { playerIds: ["c", "b"], tricks: 1 },
          { playerIds: ["d"], tricks: 2 },
        ],
        losers: [["e", "a"]],
      },
    ]);
    expect(bal(state)).toEqual({ a: -30 - 15, b: 5 - 30, c: 5, d: 20, e: -15 });
    expect(state.potCents).toBe(30 + 30);
    expect(moneyInvariant(state)).toBe(0);
  });

  it("più bestie: ogni gruppo paga l'intero piatto", () => {
    const { state } = replay([
      ...setup(),
      { type: "hand_played", winners: [{ playerIds: ["a"], tricks: 3 }], losers: [["b"], ["c"]] },
    ]);
    expect(state.potCents).toBe(60 + 30);
    expect(bal(state)).toMatchObject({ a: 0, b: -30 - 30, c: -30 });
  });

  it("un vincitore può anche andare in bestia (caso ibrido)", () => {
    const { state } = replay([
      ...setup(),
      {
        type: "hand_played",
        winners: [
          { playerIds: ["a"], tricks: 2 },
          { playerIds: ["b"], tricks: 1 },
        ],
        losers: [["b"]],
      },
    ]);
    expect(state.players.find((p) => p.id === "b")).toMatchObject({
      balanceCents: 10 - 30 - 30,
      stats: { handsWon: 1, tricks: 1, bestie: 1 },
    });
  });

  it("valida prese e gruppi", () => {
    const base = [...setup()];
    expectError([...base, { type: "hand_played", winners: [{ playerIds: ["a"], tricks: 2 }], losers: [] }], "INVALID_WINNERS");
    expectError(
      [
        ...base,
        {
          type: "hand_played",
          winners: [
            { playerIds: ["a"], tricks: 2 },
            { playerIds: ["a"], tricks: 1 },
          ],
          losers: [],
        },
      ],
      "INVALID_WINNERS",
    );
    expectError(
      [...base, { type: "hand_played", winners: [{ playerIds: ["zz"], tricks: 3 }], losers: [] }],
      "UNKNOWN_PLAYER",
    );
  });
});

describe("messa, uscite e fine partita", () => {
  it("cambiare la messa a piatto pulito aggiorna il versamento del mazziere", () => {
    const { state } = replay([...setup(), { type: "bet_changed", baseBetCents: 60 }]);
    expect(state.potCents).toBe(60);
    expect(bal(state).a).toBe(-60);
  });

  it("la messa deve essere divisibile per 3 e non cambia a piatto sporco", () => {
    expectError([...setup(), { type: "bet_changed", baseBetCents: 50 }], "INVALID_BET");
    expectError([...setup(), { type: "hand_passed" }, { type: "bet_changed", baseBetCents: 60 }], "POT_NOT_CLEAN");
  });

  it("se esce il mazziere riprende la messa e il prossimo versa la sua", () => {
    const { state } = replay([...setup(6), { type: "player_left", playerId: "a" }]);
    expect(bal(state)).toMatchObject({ a: 0, b: -30 });
    expect(state.dealerId).toBe("b");
    expect(state.potCents).toBe(30);
    expect(activePlayers(state)).toHaveLength(5);
  });

  it("fine partita: la messa torna al mazziere e i saldi si azzerano a vicenda", () => {
    const { state } = replay([
      ...setup(),
      { type: "hand_passed" },
      { type: "hand_played", winners: [{ playerIds: ["c"], tricks: 3 }], losers: [] },
      { type: "game_ended" },
    ]);
    expect(state.status).toBe("ended");
    expect(state.potCents).toBe(0);
    expect(Object.values(bal(state)).reduce((a, b) => a + b, 0)).toBe(0);
    expectError([...setup(), { type: "game_ended" }, { type: "hand_passed" }], "GAME_ENDED");
  });

  it("non si chiude con il piatto sporco", () => {
    expectError([...setup(), { type: "hand_passed" }, { type: "game_ended" }], "POT_NOT_CLEAN");
  });
});

describe("invariante sui soldi", () => {
  it("in partite casuali saldi + piatto fanno sempre 0", () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let game = 0; game < 200; game++) {
      let { state } = replay(setup(5 + rnd(2), 30 * (1 + rnd(3))));
      for (let step = 0; step < 40; step++) {
        const ids = activePlayers(state).map((p) => p.id);
        const shuffled = [...ids].sort(() => rnd(3) - 1);
        let event: GameEvent;
        if (rnd(4) === 0) {
          event = { type: "hand_passed" };
        } else {
          const layout = [[3], [2, 1], [1, 1, 1]][rnd(3)];
          let k = 0;
          const winners = layout.map((tricks) => {
            const size = rnd(4) === 0 && k + 2 <= ids.length - (layout.length - 1) ? 2 : 1;
            const playerIds = shuffled.slice(k, k + size);
            k += size;
            return { playerIds, tricks: tricks as 1 | 2 | 3 };
          });
          const losers = rnd(3) === 0 ? [] : [[shuffled[ids.length - 1]]];
          event = { type: "hand_played", winners, losers };
        }
        state = applyEvent(state, event).state;
        expect(moneyInvariant(state)).toBe(0);
        expect(state.players.every((p) => Number.isInteger(p.balanceCents))).toBe(true);
      }
    }
  });
});

describe("handPayouts (anteprima)", () => {
  it("calcola vincite e bestie senza la messa del nuovo mazziere", () => {
    const { state } = replay([...setup(), { type: "hand_passed" }]); // piatto 60
    const { payouts, collected } = handPayouts(
      state,
      [
        { playerIds: ["c", "d"], tricks: 2 },
        { playerIds: ["e"], tricks: 1 },
      ],
      [["a"]],
    );
    expect(payouts).toEqual({ c: 20, d: 20, e: 20, a: -60 });
    expect(collected).toBe(60);
  });
});

describe("splitCents", () => {
  it("non perde né crea centesimi", () => {
    expect(splitCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitCents(30, [2, 1])).toEqual([20, 10]);
    expect(splitCents(7, [1, 1, 1, 1])).toEqual([2, 2, 2, 1]);
  });
});
