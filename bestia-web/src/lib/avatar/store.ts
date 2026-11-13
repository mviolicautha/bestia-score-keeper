"use client";

import { useSyncExternalStore } from "react";
import { isEmpty, normalize, type CharacterConfig } from "./catalog";

/**
 * Personaggi salvati, uno per nome di giocatore: chi si chiama "Anna" ritrova il suo
 * personaggio in ogni partita su questo dispositivo.
 *
 * Oggi stanno nel localStorage; con gli account (Supabase) il personaggio diventerà un
 * campo del profilo, con la stessa interfaccia.
 */

const KEY = "bestia:characters";

export interface SavedCharacter {
  name: string;
  config: CharacterConfig;
  updatedAt: string;
}

type Store = Record<string, SavedCharacter>;

export const characterKey = (name: string) => name.trim().toLocaleLowerCase("it");

const EMPTY: Store = {};
let cache: Store | null = null;
const listeners = new Set<() => void>();

function readStore(): Store {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Store) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function emit() {
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  // Un'altra scheda (es. la vista TV) ha cambiato un personaggio.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    cache = null;
    emit();
  });
}

export function getCharacter(name: string): CharacterConfig | null {
  const saved = readStore()[characterKey(name)];
  return saved ? normalize(saved.config) : null;
}

/** Salva (o, se vuoto, cancella) il personaggio di un giocatore. */
export function saveCharacter(name: string, config: CharacterConfig | null) {
  const store = { ...readStore() };
  const key = characterKey(name);
  const clean = normalize(config);
  if (isEmpty(clean)) delete store[key];
  else store[key] = { name: name.trim(), config: clean, updatedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* spazio esaurito o storage bloccato: resta valido fino alla chiusura della pagina */
  }
  cache = store;
  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Il personaggio di un giocatore (null se non l'ha ancora creato); si aggiorna da solo. */
export function useCharacter(name: string): CharacterConfig | null {
  const store = useSyncExternalStore(subscribe, readStore, () => EMPTY);
  const saved = store[characterKey(name)];
  return saved ? saved.config : null;
}

/** Tutti i personaggi salvati su questo dispositivo, per chiave; si aggiorna da solo. */
export function useCharacterStore(): Readonly<Record<string, { name: string; config: CharacterConfig }>> {
  return useSyncExternalStore(subscribe, readStore, () => EMPTY);
}

/** Solo per i test. */
export function resetCharacterCache() {
  cache = null;
}
