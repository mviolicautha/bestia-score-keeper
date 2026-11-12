import { splitCents, splitEvenly } from "./money";
import {
  DEFAULT_RULES,
  EngineError,
  type EventOutcome,
  type GameEvent,
  type GameState,
  type HistoryEntry,
  type PlayerId,
  type PlayerState,
  type WinnerGroup,
} from "./types";

export function initialState(): GameState {
  return {
    status: "not_started",
    rules: { ...DEFAULT_RULES },
    baseBetCents: 0,
    potCents: 0,
    dealerId: null,
    players: [],
    handsPlayed: 0,
    handsPassed: 0,
    maxPotCents: 0,
  };
}

// --- Selettori -------------------------------------------------------------

export const activePlayers = (s: GameState) => s.players.filter((p) => p.active);

/** Piatto "pulito": vuoto o con la sola messa del mazziere. */
export const isPotClean = (s: GameState) => s.potCents === 0 || s.potCents === s.baseBetCents;

export const canChangeTable = (s: GameState) => s.status === "in_progress" && isPotClean(s);

export const canPlay = (s: GameState) =>
  s.status === "in_progress" && activePlayers(s).length >= s.rules.minPlayers;

export const canEnd = (s: GameState) => s.status === "in_progress" && isPotClean(s);

export function findPlayer(s: GameState, id: PlayerId): PlayerState | undefined {
  return s.players.find((p) => p.id === id);
}

/** Indice del colore del giocatore: fisso per tutta la serata, anche se altri si siedono in mezzo. */
export const colorIndex = (s: GameState, id: PlayerId) => findPlayer(s, id)?.joinOrder ?? 0;

/** Prossimo giocatore attivo dopo `id`, in ordine di posto. */
export function nextActiveAfter(s: GameState, id: PlayerId | null): PlayerId | null {
  const n = s.players.length;
  if (n === 0) return null;
  const start = id === null ? -1 : s.players.findIndex((p) => p.id === id);
  for (let step = 1; step <= n; step++) {
    const p = s.players[(start + step + n) % n];
    if (p.active) return p.id;
  }
  return null;
}

/** I soldi non si creano né si distruggono: somma dei saldi + piatto deve fare sempre 0. */
export function moneyInvariant(s: GameState): number {
  return s.players.reduce((a, p) => a + p.balanceCents, 0) + s.potCents;
}

// --- Applicazione degli eventi ---------------------------------------------

interface Draft {
  state: GameState;
  deltas: Record<PlayerId, number>;
}

function move(d: Draft, playerId: PlayerId, cents: number) {
  const p = d.state.players.find((x) => x.id === playerId)!;
  p.balanceCents += cents;
  d.deltas[playerId] = (d.deltas[playerId] ?? 0) + cents;
}

/** Il mazzo passa al prossimo attivo, che versa la messa. */
function rotateDealerAndAnte(d: Draft) {
  const s = d.state;
  s.dealerId = nextActiveAfter(s, s.dealerId);
  if (s.dealerId) {
    move(d, s.dealerId, -s.baseBetCents);
    s.potCents += s.baseBetCents;
  }
}

function requireInProgress(s: GameState) {
  if (s.status === "not_started") throw new EngineError("NOT_STARTED", "La partita non è iniziata.");
  if (s.status === "ended") throw new EngineError("GAME_ENDED", "La partita è terminata.");
}

function requireCleanPot(s: GameState, what: string) {
  if (!isPotClean(s)) {
    throw new EngineError(
      "POT_NOT_CLEAN",
      `Impossibile ${what} a partita in corso: il piatto deve tornare alla sola messa.`,
    );
  }
}

function requireActive(s: GameState, id: PlayerId): PlayerState {
  const p = findPlayer(s, id);
  if (!p) throw new EngineError("UNKNOWN_PLAYER", `Giocatore sconosciuto: ${id}`);
  if (!p.active) throw new EngineError("PLAYER_NOT_ACTIVE", `${p.name} non è al tavolo.`);
  return p;
}

function validateBet(cents: number) {
  if (!Number.isInteger(cents) || cents <= 0 || cents % 3 !== 0) {
    throw new EngineError(
      "INVALID_BET",
      "La messa deve essere un importo positivo divisibile in 3 parti uguali (es. 0,30 €).",
    );
  }
}

function validateWinners(s: GameState, winners: WinnerGroup[]) {
  if (winners.length === 0 || winners.length > 3) {
    throw new EngineError("INVALID_WINNERS", "Seleziona da 1 a 3 vincitori.");
  }
  const seen = new Set<PlayerId>();
  let tricks = 0;
  for (const g of winners) {
    if (g.playerIds.length === 0) throw new EngineError("INVALID_WINNERS", "Gruppo vincente vuoto.");
    if (![1, 2, 3].includes(g.tricks)) throw new EngineError("INVALID_WINNERS", "Prese non valide.");
    tricks += g.tricks;
    for (const id of g.playerIds) {
      requireActive(s, id);
      if (seen.has(id)) throw new EngineError("INVALID_WINNERS", "Un giocatore è in due gruppi vincenti.");
      seen.add(id);
    }
  }
  if (tricks !== 3) throw new EngineError("INVALID_WINNERS", "Le prese dei vincitori devono essere 3 in totale.");
}

function validateLosers(s: GameState, losers: PlayerId[][]) {
  const seen = new Set<PlayerId>();
  for (const g of losers) {
    if (g.length === 0) throw new EngineError("INVALID_LOSERS", "Gruppo in bestia vuoto.");
    for (const id of g) {
      requireActive(s, id);
      if (seen.has(id)) throw new EngineError("INVALID_LOSERS", "Un giocatore è in due gruppi in bestia.");
      seen.add(id);
    }
  }
}

/** Ordina gli id secondo i posti al tavolo (per una distribuzione dei centesimi deterministica). */
function bySeat(s: GameState, ids: PlayerId[]): PlayerId[] {
  const seat = new Map(s.players.map((p, i) => [p.id, i]));
  return [...ids].sort((a, b) => seat.get(a)! - seat.get(b)!);
}

/**
 * Quanto vince o paga ciascun giocatore in una mano (senza la messa del nuovo mazziere).
 * Non valida l'input: serve anche per l'anteprima degli importi mentre il master seleziona.
 *
 * - Vincite: il piatto si divide in base alle prese (3/3, 2/3 + 1/3, 1/3 a testa), poi tra i membri della società.
 * - Bestie: ogni gruppo paga l'intero piatto (diviso tra i membri); il totale forma il piatto successivo.
 */
export function handPayouts(
  s: GameState,
  winners: WinnerGroup[],
  losers: PlayerId[][],
): { payouts: Record<PlayerId, number>; collected: number } {
  const pot = s.potCents;
  const payouts: Record<PlayerId, number> = {};
  const add = (id: PlayerId, c: number) => (payouts[id] = (payouts[id] ?? 0) + c);

  if (winners.length > 0) {
    const groupShares = splitCents(pot, winners.map((g) => g.tricks));
    winners.forEach((g, gi) => {
      const members = bySeat(s, g.playerIds);
      splitEvenly(groupShares[gi], members.length).forEach((amount, mi) => add(members[mi], amount));
    });
  }
  for (const g of losers) {
    const members = bySeat(s, g);
    splitEvenly(pot, members.length).forEach((amount, mi) => add(members[mi], -amount));
  }
  return { payouts, collected: pot * losers.length };
}

function cloneState(s: GameState): GameState {
  return {
    ...s,
    rules: { ...s.rules },
    players: s.players.map((p) => ({ ...p, stats: { ...p.stats } })),
  };
}

/**
 * Applica un evento allo stato e restituisce il nuovo stato (lo stato in ingresso non viene modificato).
 * Lancia `EngineError` se l'evento non è valido.
 */
export function applyEvent(prev: GameState, event: GameEvent): { state: GameState; outcome: EventOutcome } {
  const d: Draft = { state: cloneState(prev), deltas: {} };
  const s = d.state;
  const potBefore = prev.potCents;
  const dealerBefore = prev.dealerId;

  switch (event.type) {
    case "game_started": {
      if (s.status !== "not_started") throw new EngineError("ALREADY_STARTED", "La partita è già iniziata.");
      validateBet(event.baseBetCents);
      s.status = "in_progress";
      s.baseBetCents = event.baseBetCents;
      s.rules = { ...DEFAULT_RULES, ...event.rules };
      break;
    }

    case "player_added": {
      requireInProgress(s);
      requireCleanPot(s, "aggiungere giocatori");
      const name = event.name.trim();
      if (name.length === 0 || name.length > 20) {
        throw new EngineError("INVALID_NAME", "Il nome deve avere da 1 a 20 caratteri.");
      }
      if (activePlayers(s).length >= s.rules.maxPlayers) {
        throw new EngineError("TABLE_FULL", `Tavolo pieno (massimo ${s.rules.maxPlayers}).`);
      }
      const nameTaken = s.players.some(
        (p) => p.active && p.id !== event.playerId && p.name.toLowerCase() === name.toLowerCase(),
      );
      if (nameTaken) throw new EngineError("DUPLICATE_NAME", `C'è già un giocatore chiamato ${name}.`);

      if (event.seatAfter !== undefined) {
        if (event.seatAfter === event.playerId) throw new EngineError("INVALID_SEAT", "Non ci si può sedere accanto a sé stessi.");
        const neighbour = findPlayer(s, event.seatAfter);
        if (!neighbour?.active) throw new EngineError("INVALID_SEAT", "Ci si può sedere solo accanto a chi è al tavolo.");
      }

      let player = findPlayer(s, event.playerId);
      if (player) {
        if (player.active) throw new EngineError("ALREADY_ACTIVE", `${player.name} è già al tavolo.`);
        player.active = true;
        player.name = name;
      } else {
        player = {
          id: event.playerId,
          name,
          joinOrder: s.players.length, // nessuno esce dall'elenco: la lunghezza conta gli arrivati
          balanceCents: 0,
          active: true,
          stats: { handsWon: 0, tricks: 0, bestie: 0 },
        };
        s.players.push(player);
      }
      // Posto scelto: subito dopo `seatAfter` nel giro del tavolo.
      if (event.seatAfter !== undefined) {
        s.players.splice(s.players.indexOf(player), 1);
        s.players.splice(s.players.findIndex((p) => p.id === event.seatAfter) + 1, 0, player);
      }
      // Il primo giocatore al tavolo fa il mazziere e versa la messa.
      if (s.dealerId === null) {
        s.dealerId = event.playerId;
        move(d, event.playerId, -s.baseBetCents);
        s.potCents += s.baseBetCents;
      }
      break;
    }

    case "player_left": {
      requireInProgress(s);
      requireCleanPot(s, "lasciare il tavolo");
      const p = requireActive(s, event.playerId);
      p.active = false;
      if (s.dealerId === p.id) {
        // Il mazziere esce prima di giocare: gli si restituisce la messa
        // e il mazzo passa al prossimo, che versa la sua.
        if (s.potCents >= s.baseBetCents) {
          move(d, p.id, s.baseBetCents);
          s.potCents -= s.baseBetCents;
        }
        rotateDealerAndAnte(d);
      }
      break;
    }

    case "bet_changed": {
      requireInProgress(s);
      requireCleanPot(s, "cambiare la messa");
      validateBet(event.baseBetCents);
      const diff = event.baseBetCents - s.baseBetCents;
      if (s.potCents === s.baseBetCents && s.dealerId && s.potCents > 0) {
        move(d, s.dealerId, -diff);
        s.potCents = event.baseBetCents;
      }
      s.baseBetCents = event.baseBetCents;
      break;
    }

    case "hand_passed": {
      requireInProgress(s);
      if (!canPlay(s)) {
        throw new EngineError("NOT_ENOUGH_PLAYERS", `Servono almeno ${s.rules.minPlayers} giocatori.`);
      }
      rotateDealerAndAnte(d);
      s.handsPassed += 1;
      break;
    }

    case "hand_played": {
      requireInProgress(s);
      if (!canPlay(s)) {
        throw new EngineError("NOT_ENOUGH_PLAYERS", `Servono almeno ${s.rules.minPlayers} giocatori.`);
      }
      if (s.potCents <= 0) throw new EngineError("EMPTY_POT", "Il piatto è vuoto.");
      validateWinners(s, event.winners);
      validateLosers(s, event.losers);

      const { payouts, collected } = handPayouts(s, event.winners, event.losers);
      for (const [id, amount] of Object.entries(payouts)) move(d, id, amount);
      for (const g of event.winners) {
        for (const id of g.playerIds) {
          const p = findPlayer(s, id)!;
          p.stats.handsWon += 1;
          p.stats.tricks += g.tricks;
        }
      }
      for (const g of event.losers) for (const id of g) findPlayer(s, id)!.stats.bestie += 1;

      s.potCents = collected;
      s.handsPlayed += 1;
      rotateDealerAndAnte(d);
      break;
    }

    case "game_ended": {
      requireInProgress(s);
      requireCleanPot(s, "terminare la partita");
      // La messa del mazziere torna a lui.
      if (s.potCents > 0 && s.dealerId) {
        move(d, s.dealerId, s.potCents);
        s.potCents = 0;
      }
      s.status = "ended";
      break;
    }
  }

  s.maxPotCents = Math.max(s.maxPotCents, s.potCents);

  return {
    state: s,
    outcome: { deltas: d.deltas, potBefore, potAfter: s.potCents, dealerBefore, dealerAfter: s.dealerId },
  };
}

/** Rigioca una sequenza di eventi. Lancia l'errore del primo evento non valido. */
export function replay(events: GameEvent[]): { state: GameState; history: HistoryEntry[] } {
  let state = initialState();
  const history: HistoryEntry[] = [];
  events.forEach((event, index) => {
    const res = applyEvent(state, event);
    state = res.state;
    history.push({
      index,
      event,
      outcome: res.outcome,
      balances: Object.fromEntries(state.players.map((p) => [p.id, p.balanceCents])),
    });
  });
  return { state, history };
}

/** Prova un evento senza applicarlo: restituisce il messaggio d'errore o null se è valido. */
export function validateEvent(state: GameState, event: GameEvent): string | null {
  try {
    applyEvent(state, event);
    return null;
  } catch (e) {
    if (e instanceof EngineError) return e.message;
    throw e;
  }
}
