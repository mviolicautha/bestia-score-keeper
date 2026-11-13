"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameState, PlayerId } from "@/engine";
import { isEmpty, normalize, type CharacterConfig } from "./avatar/catalog";
import { characterKey, useCharacterStore } from "./avatar/store";
import { getOnline, type JoinRequest, type OnlineGame, type SeatClaim } from "./online";

export interface OnlineInfo {
  game: OnlineGame | null;
  myId: string | null;
  seats: SeatClaim[];
  /** Il giocatore (id del motore) di cui ho preso il posto, se c'è. */
  mySeat: PlayerId | null;
  isMaster: boolean;
  /** Richieste in attesa: piene solo per il master (regole del database). */
  pending: JoinRequest[];
  myRequest: JoinRequest | null;
}

/**
 * Stato "online" di una partita (posti presi, richieste, profili), aggiornato in tempo reale.
 * Restituisce null finché non è caricato, e sempre null se l'app è solo locale.
 */
export function useOnline(gameId: string | null): (OnlineInfo & { reload: () => Promise<void> }) | null {
  const online = getOnline();
  const [info, setInfo] = useState<OnlineInfo | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!online || !gameId) return;
    const mine = ++seq.current;
    try {
      const [game, myId, seats, pending, myRequest] = await Promise.all([
        online.getGame(gameId),
        online.myId(),
        online.listSeats(gameId),
        online.pendingRequests(gameId),
        online.myRequest(gameId),
      ]);
      if (mine !== seq.current) return; // è arrivato un caricamento più recente
      setInfo({
        game,
        myId,
        seats,
        mySeat: seats.find((s) => s.profileId === myId)?.playerId ?? null,
        isMaster: !!game && game.masterId === myId,
        pending,
        myRequest,
      });
    } catch {
      /* connessione persa: resta l'ultimo stato */
    }
  }, [online, gameId]);

  useEffect(() => {
    if (!online || !gameId) return;
    // primo caricamento subito (lo stato si aggiorna solo quando arrivano i dati)
    void Promise.resolve().then(reload);
    return online.subscribe(gameId, () => void reload());
  }, [online, gameId, reload]);

  return info ? { ...info, reload } : null;
}

/**
 * Personaggi che arrivano da fuori, per nome:
 * - quelli condivisi dal master (creati sul suo dispositivo), così li vedono anche telefoni e TV;
 * - sopra, quelli dei telefoni: chi ha preso un posto e ha un personaggio nel profilo lo mostra
 *   al tavolo (vince sia su quello del master sia su quello salvato su questo dispositivo).
 */
export function useRemoteCharacters(
  state: GameState | null,
  seats: SeatClaim[] | undefined,
  shared?: Record<string, CharacterConfig>,
): Record<string, CharacterConfig> {
  return useMemo(() => {
    const out: Record<string, CharacterConfig> = {};
    if (!state) return out;
    for (const p of state.players) {
      const key = characterKey(p.name);
      const config = normalize(shared?.[key]);
      if (!isEmpty(config)) out[key] = config;
    }
    for (const s of seats ?? []) {
      const player = state.players.find((p) => p.id === s.playerId);
      const config = normalize(s.character);
      if (player && !isEmpty(config)) out[characterKey(player.name)] = config;
    }
    return out;
  }, [state, seats, shared]);
}

/** JSON con le chiavi in ordine: due mappe uguali danno la stessa stringa. */
function sortedJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(sortedJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${sortedJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/**
 * Sul dispositivo del master: copia nella partita i personaggi dei giocatori creati qui, così
 * compaiono anche sui telefoni e sulla TV. Aggiunge da solo quelli che la partita non ha ancora
 * (anche creati prima della partita); per le modifiche si chiama la funzione restituita, dopo
 * aver salvato. Così due dispositivi del master con personaggi diversi non si rincorrono.
 * Senza rete riprova; non insiste se il database non ha la colonna (0004_personaggi_condivisi.sql).
 */
export function useShareCharacters(
  state: GameState | null,
  info: (OnlineInfo & { reload: () => Promise<void> }) | null,
): (name: string) => void {
  const store = useCharacterStore();
  const gameId = info?.isMaster ? info.game?.id : undefined;
  const hasGame = !!info?.game;
  const sharedRaw = info?.game?.characters;
  const shared = useMemo(() => (hasGame ? (sharedRaw ?? {}) : null), [hasGame, sharedRaw]);
  const reload = info?.reload;
  const pending = useRef(new Set<string>());
  const unsupported = useRef(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const online = getOnline();
    if (!online || !gameId || !shared || !state || unsupported.current) return;
    const next = { ...shared };
    let changed = false;
    for (const p of state.players) {
      const key = characterKey(p.name);
      if (!pending.current.has(key) && key in shared) continue;
      const local = normalize(store[key]?.config);
      if (isEmpty(local)) {
        if (key in next) {
          delete next[key];
          changed = true;
        }
      } else if (sortedJson(normalize(next[key])) !== sortedJson(local)) {
        next[key] = local;
        changed = true;
      }
    }
    if (!changed) {
      pending.current.clear();
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      online.shareCharacters(gameId, next).then(
        (ok) => {
          if (!ok) unsupported.current = true;
          else void reload?.();
        },
        () => {
          // rete assente: riprovo tra un po'
          if (!cancelled) setTimeout(() => setRetry((n) => n + 1), 5000);
        },
      );
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gameId, shared, state, store, reload, retry]);

  return useCallback((name: string) => {
    pending.current.add(characterKey(name));
    setRetry((n) => n + 1);
  }, []);
}
