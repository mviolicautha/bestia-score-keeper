"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACHIEVEMENT_BY_ID, type Achievement } from "./achievements";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";

/**
 * Festa al tavolo (0012_festa.sql): gli obiettivi raggiunti da ognuno proprio con una partita,
 * per festeggiarli sulla TV e sul telefono di chi li ha presi.
 */

export interface PlayerUnlocks {
  /** null per il master che ha solo condotto. */
  playerId: string | null;
  name: string;
  /** Sono io. */
  mine: boolean;
  achievements: Achievement[];
}

export interface GameUnlocks {
  /** Falso finché il master non ha salvato i risultati della serata. */
  ready: boolean;
  players: PlayerUnlocks[];
}

export class UnlocksService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly user: () => Promise<string> = () => ensureUser(sb),
  ) {}

  async ofGame(gameId: string): Promise<GameUnlocks> {
    await this.user();
    const { data, error } = await this.sb.rpc("game_unlocks", { p_game: gameId });
    if (error) throw new Error(error.message);
    const raw = data as { ready: boolean; players: { player_id: string | null; name: string; mine: boolean; achievements: string[] }[] };
    return {
      ready: raw.ready === true,
      players: (raw.players ?? [])
        .map((p) => ({
          playerId: p.player_id,
          name: p.name,
          mine: p.mine === true,
          // solo quelli che l'app conosce, nell'ordine del catalogo
          achievements: (p.achievements ?? []).map((id) => ACHIEVEMENT_BY_ID[id]).filter((a): a is Achievement => !!a),
        }))
        .filter((p) => p.achievements.length > 0),
    };
  }
}

let service: UnlocksService | null = null;
export function getUnlocks(): UnlocksService | null {
  if (!isSupabaseConfigured) return null;
  if (!service) service = new UnlocksService(getSupabase());
  return service;
}

/** Dopo la fine i risultati arrivano quando il master li salva: si riprova per un po'. */
export const RETRY_MS = [1500, 4000, 8000, 15000, 30000];

/**
 * Gli obiettivi sbloccati nella partita, appena è terminata (null finché non si sa, o se il
 * database non ha 0012). `enabled` falso: la partita non è online o non è finita.
 */
export function useGameUnlocks(gameId: string | null, enabled: boolean, svc: UnlocksService | null = getUnlocks()): GameUnlocks | null {
  const [result, setResult] = useState<{ gameId: string; unlocks: GameUnlocks } | null>(null);

  useEffect(() => {
    if (!enabled || !gameId || !svc) return;
    let alive = true;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryLoad = () => {
      svc.ofGame(gameId).then(
        (unlocks) => {
          if (!alive) return;
          if (unlocks.ready) setResult({ gameId, unlocks });
          else if (attempt < RETRY_MS.length) timer = setTimeout(tryLoad, RETRY_MS[attempt++]);
        },
        // database senza 0012 o partita non leggibile: niente festa, senza disturbare
        () => {},
      );
    };
    timer = setTimeout(tryLoad, RETRY_MS[attempt++]);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [gameId, enabled, svc]);

  return enabled && result?.gameId === gameId ? result.unlocks : null;
}
