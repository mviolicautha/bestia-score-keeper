"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { replay } from "@/engine";
import type { BonusPacks } from "./avatar/collection";
import { HistoryService, resultsOf } from "./history";
import { StatsService } from "./statsData";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";

/**
 * Obiettivi e sfide settimanali dell'account (0010_obiettivi.sql): il database dice a che punto
 * sono e paga i premi; il catalogo da mostrare è in achievements.ts.
 */

export interface GoalRow {
  id: string;
  value: number;
  goal: number;
  claimed: boolean;
}

export interface Goals {
  achievements: GoalRow[];
  /** Lunedì della settimana delle sfide (aaaa-mm-gg). */
  week: string;
  challenges: GoalRow[];
  bonusClaimed: boolean;
  coins: number;
  packs: BonusPacks;
}

export interface ClaimResult {
  claimed: string[];
  coins: number;
  packs: BonusPacks;
}

export class GoalsError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function friendly(error: { code?: string; message: string }): GoalsError {
  if (error.message.includes("account_required")) return new GoalsError("Per gli obiettivi serve un account.", "account_required");
  if (error.code === "PGRST202" || error.code === "42P01" || error.code === "42883" || /could not find the function/i.test(error.message))
    return new GoalsError("Il database non è aggiornato per gli obiettivi: va eseguito 0010_obiettivi.sql (vedi SUPABASE.md).", "migration_missing");
  if (/Failed to fetch|NetworkError/i.test(error.message)) return new GoalsError("Nessuna connessione.", "offline");
  return new GoalsError(error.message, error.code ?? "unknown");
}

const done = (r: GoalRow) => r.value >= r.goal;

/** Gli id da riscuotere adesso: obiettivi raggiunti, sfide fatte ("w:…") e bonus delle 3 sfide. */
export function readyIds(g: Goals): string[] {
  const ids = g.achievements.filter((a) => done(a) && !a.claimed).map((a) => a.id);
  ids.push(...g.challenges.filter((c) => done(c) && !c.claimed).map((c) => `w:${c.id}`));
  if (g.challenges.length > 0 && g.challenges.every(done) && !g.bonusClaimed) ids.push("w:bonus");
  return ids;
}

export class GoalsService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly user: () => Promise<string> = () => ensureUser(sb),
  ) {}

  async load(): Promise<Goals> {
    await this.user();
    const { data, error } = await this.sb.rpc("my_goals");
    if (error) throw friendly(error);
    const raw = data as {
      achievements: GoalRow[];
      week: string;
      challenges: GoalRow[];
      bonus_claimed: boolean;
      coins: number;
      packs: BonusPacks;
    };
    return {
      achievements: raw.achievements ?? [],
      week: raw.week,
      challenges: raw.challenges ?? [],
      bonusClaimed: raw.bonus_claimed === true,
      coins: raw.coins,
      packs: raw.packs ?? { classica: 0, oro: 0 },
    };
  }

  async claim(ids: string[]): Promise<ClaimResult> {
    await this.user();
    const { data, error } = await this.sb.rpc("claim_goals", { p_ids: ids });
    if (error) throw friendly(error);
    const raw = data as ClaimResult;
    return { claimed: raw.claimed ?? [], coins: raw.coins, packs: raw.packs ?? { classica: 0, oro: 0 } };
  }

  /**
   * Le partite che conduco terminate prima degli obiettivi non hanno le statistiche della
   * serata: le rigioco qui e le salvo. Restituisce quante ne ha completate.
   */
  async backfill(): Promise<number> {
    await this.user();
    const { data, error } = await this.sb.rpc("games_missing_stats");
    if (error) throw friendly(error);
    const ids = ((data ?? []) as (string | { games_missing_stats: string })[]).map((r) => (typeof r === "string" ? r : r.games_missing_stats));
    if (ids.length === 0) return 0;
    const events = await new StatsService(this.sb, this.user).events(ids);
    const history = new HistoryService(this.sb, this.user);
    let n = 0;
    for (const id of ids) {
      const list = events[id];
      if (!list?.length) continue;
      try {
        const { state, history: hist } = replay(list);
        if (state.status !== "ended") continue;
        await history.saveResults(id, resultsOf(state, hist));
        n++;
      } catch {
        // partita con eventi rovinati: la si lascia senza statistiche
      }
    }
    return n;
  }
}

let service: GoalsService | null = null;
export function getGoals(): GoalsService | null {
  if (!isSupabaseConfigured) return null;
  if (!service) service = new GoalsService(getSupabase());
  return service;
}
