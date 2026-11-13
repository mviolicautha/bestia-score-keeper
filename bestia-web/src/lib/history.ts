import type { SupabaseClient } from "@supabase/supabase-js";
import { replay, type GameState, type GameStatus } from "@/engine";
import type { GameMeta, StoredEvent } from "./repository";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";

/**
 * Storico delle partite (solo con Supabase, 0008_storico.sql).
 *
 * A fine partita il master salva il saldo finale di ogni giocatore; "Le mie partite" legge da
 * lì. Le partite fatte in locale sul telefono (prima del backend) si possono importare.
 */

export interface PlayerResult {
  playerId: string;
  name: string;
  balanceCents: number;
}

export interface HistoryEntry {
  gameId: string;
  title: string;
  endedAt: string;
  groupId: string | null;
  groupName: string | null;
  isMaster: boolean;
  /** Il mio nome e saldo in quella partita (null se l'ho solo condotta). */
  myName: string | null;
  myBalanceCents: number | null;
  playerCount: number;
  winnerName: string | null;
  winnerBalanceCents: number | null;
}

/** Saldi finali da salvare: tutti quelli che hanno giocato, anche se usciti prima della fine. */
export function resultsOf(state: GameState): PlayerResult[] {
  return state.players.map((p) => ({ playerId: p.id, name: p.name, balanceCents: p.balanceCents }));
}

const LOCAL_GAMES_KEY = "bestia:games";
const IMPORTED_KEY = "bestia:imported";
const localEventsKey = (id: string) => `bestia:events:${id}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export interface LocalGame {
  meta: GameMeta;
  events: StoredEvent[];
}

/** Partite salvate solo su questo dispositivo e non ancora importate. */
export function localGamesToImport(): LocalGame[] {
  const imported = new Set(readJson<string[]>(IMPORTED_KEY, []));
  return readJson<GameMeta[]>(LOCAL_GAMES_KEY, [])
    .filter((g) => !imported.has(g.id))
    .map((meta) => ({ meta, events: readJson<StoredEvent[]>(localEventsKey(meta.id), []) }))
    .filter((g) => g.events.length > 0 && g.events[0].event.type === "game_started");
}

function markImported(id: string) {
  const list = readJson<string[]>(IMPORTED_KEY, []);
  if (!list.includes(id)) list.push(id);
  try {
    window.localStorage.setItem(IMPORTED_KEY, JSON.stringify(list));
  } catch {
    /* storage pieno o bloccato: al massimo la si riproporrà */
  }
}

function fail(error: { code?: string; message: string }, what: string): Error {
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message))
    return new Error("Il database non è aggiornato per lo storico: va eseguito 0008_storico.sql (vedi SUPABASE.md).");
  return new Error(`${what}: ${error.message}`);
}

export class HistoryService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly user: () => Promise<string> = () => ensureUser(sb),
  ) {}

  /** Il master salva (o, se la partita è stata riaperta, cancella) i risultati. */
  async saveResults(gameId: string, results: PlayerResult[]): Promise<void> {
    await this.user();
    const { error } = await this.sb.rpc("save_game_results", {
      p_game: gameId,
      p_results: results.map((r) => ({ player_id: r.playerId, name: r.name, balance_cents: r.balanceCents })),
    });
    if (error) throw fail(error, "Risultati");
  }

  async myHistory(): Promise<HistoryEntry[]> {
    await this.user();
    const { data, error } = await this.sb.rpc("my_history");
    if (error) throw fail(error, "Storico");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      gameId: r.game_id as string,
      title: r.title as string,
      endedAt: r.ended_at as string,
      groupId: (r.group_id as string | null) ?? null,
      groupName: (r.group_name as string | null) ?? null,
      isMaster: r.is_master === true,
      myName: (r.my_name as string | null) ?? null,
      myBalanceCents: (r.my_balance_cents as number | null) ?? null,
      playerCount: (r.player_count as number) ?? 0,
      winnerName: (r.winner_name as string | null) ?? null,
      winnerBalanceCents: (r.winner_balance_cents as number | null) ?? null,
    }));
  }

  /** Risultati delle partite indicate, per partita (dal saldo più alto). */
  async resultsOf(gameIds: string[]): Promise<Record<string, PlayerResult[]>> {
    if (gameIds.length === 0) return {};
    await this.user();
    const { data, error } = await this.sb.from("game_results").select("game_id, player_id, name, balance_cents").in("game_id", gameIds);
    if (error) throw fail(error, "Risultati");
    const out: Record<string, PlayerResult[]> = {};
    for (const r of (data ?? []) as { game_id: string; player_id: string; name: string; balance_cents: number }[])
      (out[r.game_id] ??= []).push({ playerId: r.player_id, name: r.name, balanceCents: r.balance_cents });
    for (const list of Object.values(out)) list.sort((a, b) => b.balanceCents - a.balanceCents);
    return out;
  }

  /**
   * Importa una partita locale con le sue date; se è terminata ne salva anche i risultati.
   * Restituisce l'id della partita online.
   */
  async importLocal(game: LocalGame, groupId: string | null = null): Promise<string> {
    await this.user();
    const { state } = replay(game.events.map((e) => e.event));
    const status: GameStatus = state.status;
    const { data, error } = await this.sb.rpc("import_game", {
      p_title: game.meta.title,
      p_events: game.events.map((e) => ({ event: e.event, at: e.at })),
      p_status: status,
      p_group: groupId,
    });
    if (error) throw fail(error, `Importazione di "${game.meta.title}"`);
    const id = data as string;
    if (status === "ended") await this.saveResults(id, resultsOf(state));
    markImported(game.meta.id);
    return id;
  }
}

let service: HistoryService | null = null;

/** null se Supabase non è configurato. */
export function getHistory(): HistoryService | null {
  if (service) return service;
  if (!isSupabaseConfigured) return null;
  service = new HistoryService(getSupabase());
  return service;
}

/** Solo per i test. */
export function setHistoryForTests(s: HistoryService | null) {
  service = s;
}
