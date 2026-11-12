"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Piccole preferenze dell'interfaccia salvate su questo dispositivo (es. griglia o tavolo).
 * Si leggono con un hook che non rompe il rendering lato server (lì vale il default).
 */

const listeners = new Set<() => void>();
const PREFIX = "bestia:pref:";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key?.startsWith(PREFIX) && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (v: T) => {
      try {
        window.localStorage.setItem(PREFIX + key, v);
      } catch {
        /* storage bloccato: la scelta vale solo finché la pagina è aperta */
      }
      listeners.forEach((fn) => fn());
    },
    [key],
  );
  return [value, set];
}
