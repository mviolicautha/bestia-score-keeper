/**
 * Tipi del motore di gioco della Bestia.
 *
 * Il motore è puro: nessuna dipendenza da React, browser o database.
 * Tutti gli importi sono in CENTESIMI interi, per evitare errori di arrotondamento.
 */

export type PlayerId = string;

export interface GameRules {
  /** Giocatori attivi minimi per poter passare o giocare una mano. */
  minPlayers: number;
  /** Giocatori attivi massimi al tavolo. */
  maxPlayers: number;
}

export const DEFAULT_RULES: GameRules = { minPlayers: 5, maxPlayers: 10 };

/** Un gruppo vincente: un giocatore singolo o una società, con le prese fatte. */
export interface WinnerGroup {
  playerIds: PlayerId[];
  /** Prese fatte dal gruppo (la somma delle prese di tutti i gruppi deve essere 3). */
  tricks: 1 | 2 | 3;
}

/**
 * Eventi della partita. La partita è la sequenza dei suoi eventi:
 * lo stato si ottiene rigiocandoli (vedi `replay`), e "annulla" vuol dire
 * togliere l'ultimo evento.
 */
export type GameEvent =
  | { type: "game_started"; baseBetCents: number; rules?: Partial<GameRules> }
  /**
   * Aggiunge un giocatore. Se l'id esiste già ed è uscito, rientra al tavolo.
   * I posti seguono il giro del tavolo in senso orario (è l'ordine in cui passa il mazzo):
   * con `seatAfter` si siede subito dopo quel giocatore, altrimenti dopo l'ultimo
   * (chi rientra senza `seatAfter` riprende il suo vecchio posto).
   */
  | { type: "player_added"; playerId: PlayerId; name: string; seatAfter?: PlayerId }
  | { type: "player_left"; playerId: PlayerId }
  | { type: "bet_changed"; baseBetCents: number }
  /** La mano non si gioca: il mazzo passa e il nuovo mazziere versa la messa. */
  | { type: "hand_passed" }
  /**
   * Mano giocata. `losers` è una lista di gruppi: ogni gruppo (singolo o società)
   * va in bestia e paga l'intero piatto, diviso tra i suoi membri.
   */
  | { type: "hand_played"; winners: WinnerGroup[]; losers: PlayerId[][] }
  | { type: "game_ended" };

export type GameEventType = GameEvent["type"];

export interface PlayerStats {
  /** Mani in cui il giocatore ha preso almeno una parte del piatto. */
  handsWon: number;
  /** Prese totali (in società ogni membro riceve le prese del gruppo). */
  tricks: number;
  /** Volte in cui è andato in bestia. */
  bestie: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  /** Ordine di arrivo (0 = primo): non cambia se altri si siedono in mezzo. Serve per colori stabili. */
  joinOrder: number;
  balanceCents: number;
  active: boolean;
  stats: PlayerStats;
}

export type GameStatus = "not_started" | "in_progress" | "ended";

export interface GameState {
  status: GameStatus;
  rules: GameRules;
  baseBetCents: number;
  potCents: number;
  dealerId: PlayerId | null;
  /** Ordine dei posti al tavolo (anche chi è uscito resta, con active=false). */
  players: PlayerState[];
  handsPlayed: number;
  handsPassed: number;
  maxPotCents: number;
}

/** Effetto di un evento: utile per cronologia, grafici e vista TV. */
export interface EventOutcome {
  /** Variazione del saldo per ogni giocatore toccato dall'evento. */
  deltas: Record<PlayerId, number>;
  potBefore: number;
  potAfter: number;
  dealerBefore: PlayerId | null;
  dealerAfter: PlayerId | null;
}

export interface HistoryEntry {
  index: number;
  event: GameEvent;
  outcome: EventOutcome;
  /** Saldi di tutti i giocatori dopo l'evento. */
  balances: Record<PlayerId, number>;
}

export type EngineErrorCode =
  | "NOT_STARTED"
  | "ALREADY_STARTED"
  | "GAME_ENDED"
  | "POT_NOT_CLEAN"
  | "TABLE_FULL"
  | "INVALID_NAME"
  | "INVALID_SEAT"
  | "DUPLICATE_NAME"
  | "ALREADY_ACTIVE"
  | "UNKNOWN_PLAYER"
  | "PLAYER_NOT_ACTIVE"
  | "INVALID_BET"
  | "NOT_ENOUGH_PLAYERS"
  | "EMPTY_POT"
  | "INVALID_WINNERS"
  | "INVALID_LOSERS";

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
