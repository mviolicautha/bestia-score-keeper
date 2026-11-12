"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameState, PlayerId } from "@/engine";
import { isEmpty, normalize, type CharacterConfig } from "./avatar/catalog";
import { characterKey } from "./avatar/store";
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
 * Personaggi dai telefoni dei giocatori, per nome: chi ha preso un posto e ha un personaggio
 * nel profilo lo mostra al tavolo (vince sul personaggio salvato localmente dal master).
 */
export function useRemoteCharacters(state: GameState | null, seats: SeatClaim[] | undefined): Record<string, CharacterConfig> {
  return useMemo(() => {
    const out: Record<string, CharacterConfig> = {};
    if (!state || !seats) return out;
    for (const s of seats) {
      const player = state.players.find((p) => p.id === s.playerId);
      const config = normalize(s.character);
      if (player && !isEmpty(config)) out[characterKey(player.name)] = config;
    }
    return out;
  }, [state, seats]);
}
