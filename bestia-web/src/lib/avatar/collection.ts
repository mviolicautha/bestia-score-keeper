"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureUser, getSupabase, isSupabaseConfigured } from "../supabase";
import type { PackCard, PackKind, Rarity } from "./packs";

/**
 * Album e gettoni dell'account, letti e scritti solo con le funzioni del database
 * (0009_bustine.sql): l'app chiede di aprire una bustina, il database decide cosa esce.
 */

export interface GameReward {
  gameId: string;
  title: string;
  coins: number;
}

export interface Collection {
  coins: number;
  /** Bustina di benvenuto ancora da aprire. */
  welcome: boolean;
  /** Bustina del giorno ancora da aprire. */
  daily: boolean;
  owned: ReadonlySet<string>;
  /** Gettoni guadagnati con le partite dall'ultima volta (da festeggiare una volta sola). */
  rewards: GameReward[];
}

export interface PackResult {
  cards: PackCard[];
  coins: number;
}

export class CollectionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  account_required: "Per collezionare i pezzi serve un account.",
  not_enough_coins: "Non hai abbastanza gettoni.",
  daily_used: "La bustina di oggi l'hai già aperta: torna domani!",
  already_opened: "La bustina di benvenuto l'hai già aperta.",
  invalid_pack: "Bustina sconosciuta.",
};

function friendly(error: { code?: string; message: string }): CollectionError {
  for (const [code, text] of Object.entries(MESSAGES)) if (error.message.includes(code)) return new CollectionError(text, code);
  if (error.code === "PGRST202" || error.code === "42P01" || error.code === "42883")
    return new CollectionError("Il database non è aggiornato per le bustine: va eseguito 0009_bustine.sql (vedi SUPABASE.md).", "migration_missing");
  if (/Failed to fetch|NetworkError/i.test(error.message)) return new CollectionError("Nessuna connessione.", "offline");
  return new CollectionError(error.message, error.code ?? "unknown");
}

interface RawCollection {
  coins: number;
  welcome: boolean;
  daily: boolean;
  items: string[];
  rewards: { game_id: string; title: string; coins: number }[];
}

export class CollectionService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly user: () => Promise<string> = () => ensureUser(sb),
  ) {}

  async load(): Promise<Collection> {
    await this.user();
    // gli ospiti anonimi non hanno album: inutile chiederlo al database
    const { data: auth } = await this.sb.auth.getUser();
    if (!auth.user || auth.user.is_anonymous || !auth.user.email) throw new CollectionError(MESSAGES.account_required, "account_required");
    const { data, error } = await this.sb.rpc("my_collection");
    if (error) throw friendly(error);
    const raw = data as RawCollection;
    return {
      coins: raw.coins,
      welcome: raw.welcome,
      daily: raw.daily,
      owned: new Set(raw.items ?? []),
      rewards: (raw.rewards ?? []).map((r) => ({ gameId: r.game_id, title: r.title, coins: r.coins })),
    };
  }

  async open(kind: PackKind): Promise<PackResult> {
    await this.user();
    const { data, error } = await this.sb.rpc("open_pack", { p_kind: kind });
    if (error) throw friendly(error);
    const raw = data as { coins: number; cards: { id: string; rarity: Rarity; new: boolean; coins: number }[] };
    return { coins: raw.coins, cards: raw.cards.map((c) => ({ id: c.id, rarity: c.rarity, isNew: c.new, coins: c.coins })) };
  }
}

let service: CollectionService | null = null;
export function getCollections(): CollectionService | null {
  if (!isSupabaseConfigured) return null;
  if (!service) service = new CollectionService(getSupabase());
  return service;
}

// ---------------------------------------------------------------- stato condiviso

/**
 * - "off": niente bustine (app solo locale, o database senza 0009): tutti i pezzi restano liberi
 *   come prima;
 * - "guest": ospite senza account: solo i pezzi liberi;
 * - "ready": album dell'account.
 */
export type CollectionState =
  | { status: "loading" }
  | { status: "off" }
  | { status: "guest" }
  | { status: "error"; message: string }
  | { status: "ready"; collection: Collection };

let state: CollectionState = isSupabaseConfigured ? { status: "loading" } : { status: "off" };
let inflight: Promise<void> | null = null;
let loadedOnce = false;
const listeners = new Set<() => void>();

function set(next: CollectionState) {
  state = next;
  listeners.forEach((fn) => fn());
}

/** Ricarica l'album (dopo una partita, un acquisto, il login...). */
export function refreshCollection(): Promise<void> {
  const svc = getCollections();
  if (!svc) return Promise.resolve();
  if (inflight) return inflight;
  inflight = svc
    .load()
    .then(
      (collection) => {
        // i premi appena arrivati si sommano a quelli non ancora festeggiati
        const pending = state.status === "ready" ? state.collection.rewards : [];
        set({ status: "ready", collection: { ...collection, rewards: [...pending, ...collection.rewards] } });
      },
      (e: unknown) => {
        const err = e instanceof CollectionError ? e : friendly({ message: String(e) });
        if (err.code === "account_required") set({ status: "guest" });
        else if (err.code === "migration_missing") set({ status: "off" });
        else if (state.status !== "ready") set({ status: "error", message: err.message });
      },
    )
    .finally(() => {
      inflight = null;
      loadedOnce = true;
    });
  return inflight;
}

/** Dopo aver aperto una bustina: aggiorna gettoni e album senza ricaricare. */
export function applyPackResult(kind: PackKind, result: PackResult) {
  if (state.status !== "ready") return;
  const c = state.collection;
  const owned = new Set(c.owned);
  for (const card of result.cards) owned.add(card.id);
  set({
    status: "ready",
    collection: {
      ...c,
      coins: result.coins,
      owned,
      welcome: kind === "benvenuto" ? false : c.welcome,
      daily: kind === "giornaliera" ? false : c.daily,
    },
  });
}

/** I premi delle partite sono stati festeggiati: non mostrarli di nuovo. */
export function clearRewards() {
  if (state.status !== "ready" || state.collection.rewards.length === 0) return;
  set({ status: "ready", collection: { ...state.collection, rewards: [] } });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const SERVER: CollectionState = { status: "loading" };

/** L'album dell'account di questo telefono; si carica da solo la prima volta. */
export function useCollection(): CollectionState {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
  useEffect(() => {
    if (!loadedOnce) void refreshCollection();
  }, []);
  return current;
}

/**
 * Quali pezzi si possono indossare: "all" quando le bustine non ci sono (tutto libero),
 * altrimenti l'insieme dei pezzi posseduti (i capelli sono sempre liberi, vedi packs.ts).
 */
export type Unlocked = "all" | ReadonlySet<string>;

const NONE: ReadonlySet<string> = new Set();

export function unlockedOf(s: CollectionState): Unlocked {
  if (s.status === "off") return "all";
  if (s.status === "ready") return s.collection.owned;
  return NONE;
}

/**
 * Cosa può indossare un personaggio nell'editor. Il proprio usa il proprio album; quello di un
 * altro (il master che veste un ospite) solo i pezzi liberi: i pezzi si sbloccano con l'account
 * di chi li indossa.
 */
export function editorAccess(s: CollectionState, mine: boolean): { unlocked: Unlocked; collect: "packs" | "account" | "none" } {
  if (s.status === "off") return { unlocked: "all", collect: "none" };
  if (!mine) return { unlocked: NONE, collect: "none" };
  if (s.status === "guest") return { unlocked: NONE, collect: "account" };
  return { unlocked: unlockedOf(s), collect: "packs" };
}

/** Solo per i test. */
export function resetCollectionState(next: CollectionState = isSupabaseConfigured ? { status: "loading" } : { status: "off" }) {
  state = next;
  inflight = null;
  loadedOnce = next.status !== "loading";
  listeners.forEach((fn) => fn());
}
