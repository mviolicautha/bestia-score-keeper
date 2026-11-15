"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

/**
 * Nomi "di comodo" che il master dà ai giocatori, visibili SOLO a lui su questo dispositivo:
 * se al tavolo c'è "xX_Bestia_Xx" il master può chiamarlo "Luca" per non confondersi.
 * Telefoni, TV, cronologia condivisa e conti restano col nome vero.
 *
 * Si ricordano per nome vero (non per partita): la settimana dopo valgono ancora.
 */

const KEY = "bestia:nomi-master";
const listeners = new Set<() => void>();

const norm = (name: string) => name.trim().toLocaleLowerCase("it");

function readRaw(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

let memory: string | null = null; // se lo storage è bloccato, valgono finché la pagina è aperta

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

function parse(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export interface Aliases {
  /** Il nome di comodo, o undefined se il master non l'ha rinominato. */
  aliasOf: (name: string) => string | undefined;
  /** Il nome da mostrare al master: quello di comodo se c'è, altrimenti quello vero. */
  label: (name: string) => string;
  /** Salva (o con stringa vuota toglie) il nome di comodo. */
  setAlias: (name: string, alias: string) => void;
}

export function useAliases(): Aliases {
  const raw = useSyncExternalStore(
    subscribe,
    () => memory ?? readRaw(),
    () => "{}",
  );
  const map = useMemo(() => parse(raw), [raw]);
  const aliasOf = useCallback((name: string) => map[norm(name)], [map]);
  const label = useCallback((name: string) => map[norm(name)] ?? name, [map]);
  const setAlias = useCallback((name: string, alias: string) => {
    const next = parse(memory ?? readRaw());
    const clean = alias.trim().slice(0, 20);
    if (!clean || clean === name.trim()) delete next[norm(name)];
    else next[norm(name)] = clean;
    const json = JSON.stringify(next);
    try {
      window.localStorage.setItem(KEY, json);
      memory = null;
    } catch {
      memory = json;
    }
    listeners.forEach((fn) => fn());
  }, []);
  return useMemo(() => ({ aliasOf, label, setAlias }), [aliasOf, label, setAlias]);
}

/** Chi mostra nomi (tavolo, scelta del posto, iniziali) chiede qui come chiamare un giocatore. */
const DisplayNameContext = createContext<(name: string) => string>((name) => name);

export function DisplayNames({ label, children }: { label: (name: string) => string; children: React.ReactNode }) {
  return <DisplayNameContext.Provider value={label}>{children}</DisplayNameContext.Provider>;
}

export const useDisplayName = () => useContext(DisplayNameContext);
