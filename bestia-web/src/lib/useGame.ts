"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyEvent, EngineError, replay, type GameEvent, type GameStatus } from "@/engine";
import { getRepository, type GameMeta, type StoredEvent } from "./repository";
import { SaveConflictError } from "./resilience";
import { isSupabaseConfigured } from "./supabase";

export const OFFLINE = "Connessione assente: non è stato salvato niente. Controlla la rete e riprova.";
export const CONFLICT = "La partita è stata aggiornata da un altro dispositivo del master: controlla e, se serve, ripeti.";

/** Confronto tra eventi indipendente dall'ordine delle chiavi (il database le riordina). */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]));
  return v;
}
const sameEvent = (a: GameEvent, b: GameEvent) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

/**
 * Esito di `dispatch`:
 * - `null`: evento salvato;
 * - stringa: evento rifiutato dal motore (messaggio da mostrare);
 * - `false`: ignorato perché un'altra azione era ancora in corso (es. doppio tocco).
 */
export type DispatchResult = string | null | false;

/**
 * Carica una partita, la tiene aggiornata e offre `dispatch` / `undo`.
 *
 * Ogni evento viene validato dal motore sullo stato PIÙ RECENTE salvato (non su quello
 * dell'ultimo render) e si esegue una sola azione alla volta: così un doppio tocco su
 * "Passa" o "Fine mano" non registra la mano due volte, e un doppio "Annulla" non
 * cancella due eventi.
 */
export function useGame(gameId: string) {
  const [events, setEvents] = useState<StoredEvent[] | null>(null);
  const [meta, setMeta] = useState<GameMeta | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const repo = getRepository();
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Primo caricamento: senza rete si riprova da soli (la pagina resta su "Caricamento…" e poi si sblocca).
    const load = (attempt: number) => {
      Promise.all([repo.loadEvents(gameId), repo.getGame(gameId)])
        .then(([ev, m]) => {
          if (cancelled) return;
          setEvents(ev);
          setMeta(m);
        })
        .catch(() => {
          if (!cancelled) retry = setTimeout(() => load(attempt + 1), Math.min(10000, 1000 * 2 ** attempt));
        });
    };
    load(0);
    const unsubscribe = repo.subscribe(gameId, setEvents);
    return () => {
      cancelled = true;
      clearTimeout(retry);
      unsubscribe();
    };
  }, [gameId]);

  const computed = useMemo(() => {
    if (!events) return null;
    if (events.length === 0) {
      return {
        state: null,
        history: [],
        error: isSupabaseConfigured ? "Partita non trovata: forse è stata cancellata." : "Partita non trovata su questo dispositivo.",
      };
    }
    try {
      return { ...replay(events.map((e) => e.event)), error: null as string | null };
    } catch (e) {
      return { state: null, history: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [events]);

  /** Esegue `fn` solo se non c'è già un'azione in corso. */
  const exclusive = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | false> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      return await fn();
    } finally {
      busy.current = false;
    }
  }, []);

  /**
   * Salva un evento. Con la rete ballerina di una serata vera:
   * - senza rete non si salva e lo si dice (niente errori silenziosi);
   * - se la risposta del server si perde ma il salvataggio è riuscito, lo si riconosce
   *   ricaricando (niente mano registrata due volte ripremendo);
   * - se un altro dispositivo del master ha salvato nel frattempo, il database rifiuta
   *   (numero di eventi atteso) e lo si dice.
   */
  const dispatch = useCallback(
    (event: GameEvent): Promise<DispatchResult> =>
      exclusive(async () => {
        const repo = getRepository();
        let latest: StoredEvent[];
        try {
          latest = await repo.loadEvents(gameId);
        } catch {
          return OFFLINE;
        }
        if (latest.length === 0) return "Partita non trovata.";
        let status: GameStatus;
        try {
          status = applyEvent(replay(latest.map((e) => e.event)).state, event).state.status;
        } catch (e) {
          if (e instanceof EngineError) return e.message;
          throw e;
        }
        try {
          await repo.appendEvent(gameId, event, status, latest.length);
          return null;
        } catch (e) {
          const now = await repo.loadEvents(gameId).catch(() => null);
          if (now) setEvents(now);
          // salvato davvero (la risposta si era persa)?
          if (now && now.length === latest.length + 1 && sameEvent(now[now.length - 1].event, event)) return null;
          return e instanceof SaveConflictError ? CONFLICT : OFFLINE;
        }
      }),
    [exclusive, gameId],
  );

  /**
   * Toglie l'ultimo evento. `true` se fatto, `false` se non c'era niente da annullare
   * (o un'altra azione era in corso), una stringa con il messaggio se non è riuscito.
   */
  const undo = useCallback(
    (): Promise<boolean | string> =>
      exclusive(async () => {
        const repo = getRepository();
        let latest: StoredEvent[];
        try {
          latest = await repo.loadEvents(gameId);
        } catch {
          return OFFLINE;
        }
        if (latest.length <= 1) return false;
        const { state } = replay(latest.slice(0, -1).map((e) => e.event));
        try {
          await repo.removeLastEvent(gameId, state.status, latest.length);
          return true;
        } catch (e) {
          const now = await repo.loadEvents(gameId).catch(() => null);
          if (now) setEvents(now);
          if (now && now.length === latest.length - 1) return true; // riuscito, la risposta si era persa
          return e instanceof SaveConflictError ? CONFLICT : OFFLINE;
        }
      }),
    [exclusive, gameId],
  );

  return {
    loading: events === null,
    meta,
    events: events ?? [],
    state: computed?.state ?? null,
    history: computed?.history ?? [],
    error: computed?.error ?? null,
    canUndo: (events?.length ?? 0) > 1,
    dispatch,
    undo,
  };
}
