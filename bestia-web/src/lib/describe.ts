import { formatCents, type GameState, type HistoryEntry, type PlayerId } from "@/engine";

export type EventKind = "gain" | "loss" | "pass" | "info";

export interface EventDescription {
  kind: EventKind;
  title: string;
  detail?: string;
}

const SHARE: Record<number, string> = { 1: "1/3", 2: "2/3", 3: "tutto" };

/** Testo leggibile per una voce della cronologia. */
export function describeEntry(entry: HistoryEntry, state: GameState): EventDescription {
  const name = (id: PlayerId | null) => (id ? (state.players.find((p) => p.id === id)?.name ?? "?") : "—");
  const names = (ids: PlayerId[]) => ids.map(name).join(" & ");
  const { event, outcome } = entry;

  switch (event.type) {
    case "game_started":
      return { kind: "info", title: "Partita creata", detail: `Messa ${formatCents(event.baseBetCents)}` };
    case "player_added":
      return {
        kind: "info",
        title: `${event.name} si siede al tavolo`,
        detail:
          outcome.dealerAfter === event.playerId && outcome.dealerBefore === null
            ? "Primo mazziere"
            : event.seatAfter
              ? `Si siede dopo ${name(event.seatAfter)}`
              : undefined,
      };
    case "player_left":
      return {
        kind: "info",
        title: `${name(event.playerId)} lascia il tavolo`,
        detail: outcome.dealerBefore !== outcome.dealerAfter ? `Nuovo mazziere: ${name(outcome.dealerAfter)}` : undefined,
      };
    case "bet_changed":
      return { kind: "info", title: `Messa a ${formatCents(event.baseBetCents)}` };
    case "hand_passed":
      return {
        kind: "pass",
        title: "Mano passata",
        detail: `${name(outcome.dealerAfter)} fa le carte · piatto ${formatCents(outcome.potAfter)}`,
      };
    case "hand_played": {
      const winners = event.winners
        .map((g) => `${names(g.playerIds)} (${SHARE[g.tricks]})`)
        .join(", ");
      const losers = event.losers.map(names).join(", ");
      return {
        kind: event.losers.length > 0 ? "loss" : "gain",
        title: `Piatto da ${formatCents(outcome.potBefore)}: vince ${winners}`,
        detail: losers ? `In bestia: ${losers} · nuovo piatto ${formatCents(outcome.potAfter)}` : "Nessuna bestia",
      };
    }
    case "game_ended":
      return { kind: "info", title: "Partita terminata" };
  }
}
