"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyEvent, EngineError, replay, type GameEvent } from "@/engine";
import { getRepository, type GameMeta, type StoredEvent } from "./repository";

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
    repo.loadEvents(gameId).then((ev) => {
      if (!cancelled) setEvents(ev);
    });
    repo.getGame(gameId).then((m) => {
      if (!cancelled) setMeta(m);
    });
    const unsubscribe = repo.subscribe(gameId, setEvents);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [gameId]);

  const computed = useMemo(() => {
    if (!events) return null;
    if (events.length === 0) {
      return { state: null, history: [], error: "Partita non trovata su questo dispositivo." };
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

  const dispatch = useCallback(
    (event: GameEvent): Promise<DispatchResult> =>
      exclusive(async () => {
        const repo = getRepository();
        const latest = await repo.loadEvents(gameId);
        if (latest.length === 0) return "Partita non trovata.";
        try {
          const current = replay(latest.map((e) => e.event)).state;
          const { state } = applyEvent(current, event);
          await repo.appendEvent(gameId, event, state.status);
          return null;
        } catch (e) {
          if (e instanceof EngineError) return e.message;
          throw e;
        }
      }),
    [exclusive, gameId],
  );

  /** Toglie l'ultimo evento. Restituisce false se non ha fatto nulla. */
  const undo = useCallback(
    (): Promise<boolean> =>
      exclusive(async () => {
        const repo = getRepository();
        const latest = await repo.loadEvents(gameId);
        if (latest.length <= 1) return false;
        const { state } = replay(latest.slice(0, -1).map((e) => e.event));
        await repo.removeLastEvent(gameId, state.status);
        return true;
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
