import type { GameEvent, GameStatus } from "@/engine";

/**
 * Accesso ai dati delle partite.
 *
 * Oggi c'è solo l'implementazione locale (localStorage del browser). Quando
 * aggiungeremo Supabase basterà una seconda implementazione della stessa
 * interfaccia: le schermate non cambiano.
 */

export interface GameMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: GameStatus;
}

export interface StoredEvent {
  event: GameEvent;
  at: string;
}

export interface GameRepository {
  listGames(): Promise<GameMeta[]>;
  getGame(gameId: string): Promise<GameMeta | null>;
  createGame(title: string, baseBetCents: number): Promise<string>;
  loadEvents(gameId: string): Promise<StoredEvent[]>;
  appendEvent(gameId: string, event: GameEvent, status: GameStatus): Promise<void>;
  removeLastEvent(gameId: string, status: GameStatus): Promise<void>;
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

export function newId(): string {
  return crypto.randomUUID();
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

  async createGame(title: string, baseBetCents: number) {
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

  async appendEvent(gameId: string, event: GameEvent, status: GameStatus) {
    const events = read<StoredEvent[]>(eventsKey(gameId), []);
    events.push({ event, at: new Date().toISOString() });
    write(eventsKey(gameId), events);
    this.touch(gameId, status);
    this.emit(gameId);
  }

  async removeLastEvent(gameId: string, status: GameStatus) {
    const events = read<StoredEvent[]>(eventsKey(gameId), []);
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

export function getRepository(): GameRepository {
  if (!instance) instance = new LocalGameRepository();
  return instance;
}
