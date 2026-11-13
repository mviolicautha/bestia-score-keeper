import type { GameEvent, GameStatus } from "@/engine";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";
import { SupabaseGameRepository } from "./supabaseRepository";
import { SaveConflictError } from "./resilience";

export { SaveConflictError };

/**
 * Accesso ai dati delle partite.
 *
 * Oggi c'è solo l'implementazione locale (localStorage del browser). Quando
 * aggiungeremo Supabase basterà una seconda implementazione della stessa
 * interfaccia: le schermate non cambiano.
 */

export interface GameMeta {
  id: string;
  /** Codice breve per unirsi (solo con Supabase). */
  code?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: GameStatus;
  /** Compagnia a cui appartiene (solo con Supabase; assente per le partite al volo). */
  groupId?: string | null;
}

export interface StoredEvent {
  event: GameEvent;
  at: string;
}

export interface GameRepository {
  listGames(): Promise<GameMeta[]>;
  getGame(gameId: string): Promise<GameMeta | null>;
  /** `groupId`: compagnia della partita (solo con Supabase, ignorato in locale). */
  createGame(title: string, baseBetCents: number, groupId?: string | null): Promise<string>;
  loadEvents(gameId: string): Promise<StoredEvent[]>;
  /**
   * Aggiunge un evento. Con `expectedCount` (quanti eventi ci sono ora secondo chi salva)
   * rifiuta con SaveConflictError se nel frattempo la partita è cambiata: così un secondo
   * dispositivo del master, o un nuovo tentativo dopo una risposta persa, non registra
   * la stessa mano due volte.
   */
  appendEvent(gameId: string, event: GameEvent, status: GameStatus, expectedCount?: number): Promise<void>;
  removeLastEvent(gameId: string, status: GameStatus, expectedCount?: number): Promise<void>;
  deleteGame(gameId: string): Promise<void>;
  /** Avvisa quando gli eventi cambiano (anche da un'altra scheda, es. la vista TV). */
  subscribe(gameId: string, onChange: (events: StoredEvent[]) => void): () => void;
}


const GAMES_KEY = "bestia:games";
const eventsKey = (id: string) => `bestia:events:${id}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Id univoco (UUID v4). `crypto.randomUUID()` esiste solo su HTTPS o localhost: aprendo
 * l'app dal telefono via `http://192.168...` non c'è, quindi lo costruiamo da
 * `crypto.getRandomValues()`, che è disponibile ovunque.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // versione 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

class LocalGameRepository implements GameRepository {
  private listeners = new Map<string, Set<(events: StoredEvent[]) => void>>();

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (!e.key?.startsWith("bestia:events:")) return;
        const id = e.key.slice("bestia:events:".length);
        this.emit(id);
      });
    }
  }

  private emit(gameId: string) {
    const events = read<StoredEvent[]>(eventsKey(gameId), []);
    this.listeners.get(gameId)?.forEach((fn) => fn(events));
  }

  private touch(gameId: string, status: GameStatus) {
    const games = read<GameMeta[]>(GAMES_KEY, []);
    const g = games.find((x) => x.id === gameId);
    if (g) {
      g.updatedAt = new Date().toISOString();
      g.status = status;
      write(GAMES_KEY, games);
    }
  }

  async listGames() {
    return read<GameMeta[]>(GAMES_KEY, []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getGame(gameId: string) {
    return read<GameMeta[]>(GAMES_KEY, []).find((g) => g.id === gameId) ?? null;
  }

  async createGame(title: string, baseBetCents: number, _groupId?: string | null) {
    void _groupId; // in locale non ci sono compagnie
    const id = newId();
    const now = new Date().toISOString();
    const games = read<GameMeta[]>(GAMES_KEY, []);
    games.push({ id, title, createdAt: now, updatedAt: now, status: "in_progress" });
    write(GAMES_KEY, games);
    write(eventsKey(id), [{ event: { type: "game_started", baseBetCents }, at: now }] satisfies StoredEvent[]);
    return id;
  }

  async loadEvents(gameId: string) {
    return read<StoredEvent[]>(eventsKey(gameId), []);
  }

  async appendEvent(gameId: string, event: GameEvent, status: GameStatus, expectedCount?: number) {
    const events = read<StoredEvent[]>(eventsKey(gameId), []);
    if (expectedCount !== undefined && events.length !== expectedCount) throw new SaveConflictError();
    events.push({ event, at: new Date().toISOString() });
    write(eventsKey(gameId), events);
    this.touch(gameId, status);
    this.emit(gameId);
  }

  async removeLastEvent(gameId: string, status: GameStatus, expectedCount?: number) {
    const events = read<StoredEvent[]>(eventsKey(gameId), []);
    if (expectedCount !== undefined && events.length !== expectedCount) throw new SaveConflictError();
    // L'avvio della partita non si annulla.
    if (events.length <= 1) return;
    events.pop();
    write(eventsKey(gameId), events);
    this.touch(gameId, status);
    this.emit(gameId);
  }

  async deleteGame(gameId: string) {
    write(
      GAMES_KEY,
      read<GameMeta[]>(GAMES_KEY, []).filter((g) => g.id !== gameId),
    );
    window.localStorage.removeItem(eventsKey(gameId));
  }

  subscribe(gameId: string, onChange: (events: StoredEvent[]) => void) {
    if (!this.listeners.has(gameId)) this.listeners.set(gameId, new Set());
    this.listeners.get(gameId)!.add(onChange);
    return () => {
      this.listeners.get(gameId)?.delete(onChange);
    };
  }
}

let instance: GameRepository | null = null;

/** Supabase se è configurato (variabili d'ambiente), altrimenti il salvataggio locale. */
export function getRepository(): GameRepository {
  if (!instance) {
    instance = isSupabaseConfigured ? new SupabaseGameRepository(getSupabase(), () => ensureUser()) : new LocalGameRepository();
  }
  return instance;
}
