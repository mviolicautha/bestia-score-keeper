"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BonusPacks } from "./avatar/collection";
import type { Rarity } from "./avatar/packs";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";

/**
 * Calendario dell'avvento (0011_calendario.sql): dal 1° al 24 dicembre una casella al giorno,
 * recuperabile per tutto dicembre. Cosa c'è in ogni casella è lo stesso per tutti e deve restare
 * allineato con advent_kind / advent_coins nel database; quale pezzo esce lo decide il database.
 */

export const ADVENT_DAYS = 24;
export type AdventKind = "gettoni" | "pezzo" | "oro" | "leggendario";

export const ADVENT_GOLD_DAYS = [6, 13, 20];
export const ADVENT_PIECE_DAYS = [1, 4, 9, 11, 16, 18, 22];

export function adventKind(day: number): AdventKind {
  if (day === ADVENT_DAYS) return "leggendario";
  if (ADVENT_GOLD_DAYS.includes(day)) return "oro";
  if (ADVENT_PIECE_DAYS.includes(day)) return "pezzo";
  return "gettoni";
}

/** Gettoni delle caselle "gettoni" (tra 50 e 150). */
export const adventCoins = (day: number) => 50 + ((day * 37) % 5) * 25;

export type AdventReward =
  | { type: "coins"; coins: number }
  | { type: "item"; id: string; rarity: Rarity }
  | { type: "pack"; pack: "oro" };

export interface Advent {
  season: number;
  /** Ultima casella apribile oggi (0 fuori da dicembre). */
  today: number;
  opened: Record<number, AdventReward>;
}

export interface AdventOpenResult {
  day: number;
  reward: AdventReward;
  coins: number;
  packs: BonusPacks;
}

const romeParts = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
};

/** Giorni che mancano al 1° dicembre (ora italiana): 0 a dicembre, null se manca più di un mese. */
export function daysToAdvent(now: Date = new Date()): number | null {
  const { year, month, day } = romeParts(now);
  if (month === 12) return 0;
  if (month !== 11) return null;
  return Date.UTC(year, 11, 1) / 86_400_000 - Date.UTC(year, 10, day) / 86_400_000;
}

const MESSAGES: Record<string, string> = {
  advent_closed: "Il calendario dell'avvento è aperto solo a dicembre.",
  advent_locked: "Questa casella non si può ancora aprire.",
  advent_opened: "Questa casella l'hai già aperta.",
  account_required: "Per il calendario serve un account.",
};

export class AdventError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

function friendly(error: { code?: string; message: string }): AdventError {
  for (const [code, text] of Object.entries(MESSAGES)) if (error.message.includes(code)) return new AdventError(text, code);
  if (error.code === "PGRST202" || error.code === "42P01" || error.code === "42883" || /could not find the function/i.test(error.message))
    return new AdventError("Il database non è aggiornato per il calendario: va eseguito 0011_calendario.sql (vedi SUPABASE.md).", "migration_missing");
  if (/Failed to fetch|NetworkError/i.test(error.message)) return new AdventError("Nessuna connessione.", "offline");
  return new AdventError(error.message, error.code ?? "unknown");
}

export class AdventService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly user: () => Promise<string> = () => ensureUser(sb),
  ) {}

  async load(): Promise<Advent> {
    await this.user();
    const { data, error } = await this.sb.rpc("my_advent");
    if (error) throw friendly(error);
    const raw = data as { season: number; today: number; opened: { day: number; reward: AdventReward }[] };
    return { season: raw.season, today: raw.today, opened: Object.fromEntries((raw.opened ?? []).map((o) => [o.day, o.reward])) };
  }

  async open(day: number): Promise<AdventOpenResult> {
    await this.user();
    const { data, error } = await this.sb.rpc("open_advent", { p_day: day });
    if (error) throw friendly(error);
    return data as AdventOpenResult;
  }
}

let service: AdventService | null = null;
export function getAdvent(): AdventService | null {
  if (!isSupabaseConfigured) return null;
  if (!service) service = new AdventService(getSupabase());
  return service;
}
