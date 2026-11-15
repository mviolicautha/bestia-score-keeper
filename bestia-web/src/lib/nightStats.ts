import type { GameState, HistoryEntry, PlayerId } from "@/engine";
import { analyzeNight, nicknamesOf, type NicknameId } from "./stats";

/**
 * Le statistiche di una serata per ogni giocatore, salvate dal master insieme al saldo finale
 * (game_results.stats, 0010_obiettivi.sql): il database le usa per gli obiettivi e le sfide
 * settimanali senza dover rigiocare la partita. Le chiavi sono corte e devono restare uguali a
 * quelle lette in 0010_obiettivi.sql.
 */
export interface NightStats {
  /** Mani giocate da seduto. */
  hands: number;
  /** Mani vinte (anche solo una parte del piatto). */
  won: number;
  /** Prese fatte (in società contano quelle del gruppo). */
  tricks: number;
  /** Volte in bestia (comprese le carte date male). */
  bestie: number;
  /** Mani vinte facendo tutte e 3 le prese. */
  tris: number;
  /** Mani vinte di fila, la serie più lunga. */
  streak: number;
  /** Mani vinte in società. */
  soc: number;
  /** Carte date male da mazziere. */
  misdeal: number;
  /** Saldo più basso toccato durante la serata. */
  min: number;
  /** Messa a fine serata (per le soglie "−20 messe"). */
  bet: number;
  /** Soprannome della serata, se c'è. */
  nick: NicknameId | null;
}

const noFormat = (cents: number) => String(cents);

export function nightStatsOf(state: GameState, history: HistoryEntry[]): Record<PlayerId, NightStats> {
  const analysis = analyzeNight(state, history);
  const nicks = nicknamesOf(analysis, noFormat);
  const extra = new Map<PlayerId, { tris: number; streak: number; run: number; soc: number; misdeal: number }>();
  const get = (id: PlayerId) => {
    let e = extra.get(id);
    if (!e) extra.set(id, (e = { tris: 0, streak: 0, run: 0, soc: 0, misdeal: 0 }));
    return e;
  };
  const seated = new Set<PlayerId>();

  for (const h of history) {
    const e = h.event;
    if (e.type === "player_added") seated.add(e.playerId);
    else if (e.type === "player_left" || e.type === "player_removed") seated.delete(e.playerId);
    else if (e.type === "misdeal" && h.outcome.dealerBefore) get(h.outcome.dealerBefore).misdeal++;
    else if (e.type === "hand_played") {
      const winners = new Set<PlayerId>();
      for (const g of e.winners)
        for (const id of g.playerIds) {
          winners.add(id);
          const x = get(id);
          if (g.tricks === 3) x.tris++;
          if (g.playerIds.length > 1) x.soc++;
        }
      // la serie si interrompe solo con una mano giocata da seduto e non vinta
      for (const id of new Set([...seated, ...winners])) {
        const x = get(id);
        x.run = winners.has(id) ? x.run + 1 : 0;
        x.streak = Math.max(x.streak, x.run);
      }
    }
  }

  const out: Record<PlayerId, NightStats> = {};
  for (const p of analysis.players) {
    const x = get(p.id);
    const stats = state.players.find((s) => s.id === p.id)?.stats;
    out[p.id] = {
      hands: p.handsPresent,
      won: p.handsWon,
      tricks: stats?.tricks ?? 0,
      bestie: p.bestie,
      tris: x.tris,
      streak: x.streak,
      soc: x.soc,
      misdeal: x.misdeal,
      min: p.minCents,
      bet: analysis.betCents,
      nick: nicks[p.id]?.id ?? null,
    };
  }
  return out;
}
