import type { GameState, HistoryEntry, PlayerId } from "@/engine";

/**
 * I "momenti" da festeggiare sulla TV quando arriva una nuova mano: chi va in bestia,
 * chi vince (con il piatto d'oro per i piatti grossi), la mano passata.
 */
export type Moment =
  | { kind: "bestia"; key: number; losers: Share[]; winners: Share[]; potCents: number }
  | { kind: "win"; key: number; winners: Share[]; potCents: number; big: boolean }
  | { kind: "pass"; key: number; dealer: string | null };

/** Quanto ha vinto (positivo) o pagato (negativo) un giocatore nella mano. */
export interface Share {
  id: PlayerId;
  name: string;
  cents: number;
}

/** Un piatto è "d'oro" se vale almeno tante messe, o se è il più ricco della serata finora. */
export const BIG_POT_BETS = 10;

/** Il momento dell'evento `index` della cronologia (null se non è una mano). */
export function momentAt(history: HistoryEntry[], index: number, state: GameState): Moment | null {
  const entry = history[index];
  if (!entry) return null;
  const name = (id: PlayerId) => state.players.find((p) => p.id === id)?.name ?? "?";
  const e = entry.event;
  if (e.type === "hand_passed") {
    return { kind: "pass", key: index, dealer: entry.outcome.dealerAfter ? name(entry.outcome.dealerAfter) : null };
  }
  if (e.type !== "hand_played") return null;

  // la messa del nuovo mazziere è nello stesso evento: va tolta per sapere quanto ha vinto o pagato
  let bet = 0;
  let bestBefore = 0;
  for (let i = 0; i < index; i++) {
    const ev = history[i].event;
    if (ev.type === "game_started" || ev.type === "bet_changed") bet = ev.baseBetCents;
    if (ev.type === "hand_played") bestBefore = Math.max(bestBefore, history[i].outcome.potBefore);
  }
  const net = (id: PlayerId) => (entry.outcome.deltas[id] ?? 0) + (id === entry.outcome.dealerAfter ? bet : 0);
  const pot = entry.outcome.potBefore;

  const winners = e.winners.flatMap((g) => g.playerIds).map((id) => ({ id, name: name(id), cents: net(id) }));
  const losers = e.losers.flat();
  if (losers.length > 0) {
    return { kind: "bestia", key: index, losers: losers.map((id) => ({ id, name: name(id), cents: net(id) })), winners, potCents: pot };
  }
  const big = (bet > 0 && pot >= BIG_POT_BETS * bet) || (bestBefore > 0 && pot > bestBefore);
  return { kind: "win", key: index, winners, potCents: pot, big };
}
