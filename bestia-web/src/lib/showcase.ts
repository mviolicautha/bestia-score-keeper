"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ACHIEVEMENTS, type Achievement } from "./achievements";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";

/**
 * Vetrina degli obiettivi di un membro della compagnia (0013_vetrina.sql): quelli raggiunti e,
 * per ognuno, quanti nella compagnia ce l'hanno.
 */

export interface Showcase {
  name: string;
  hasAccount: boolean;
  /** Membri della compagnia con account. */
  members: number;
  /** Obiettivi in tutto. */
  total: number;
  /** Raggiunti, dal più raro (meno persone nella compagnia) al più comune. */
  achievements: { achievement: Achievement; owners: number }[];
}

/** Dal più raro al più comune; a pari rarità nell'ordine del catalogo. */
export function byRarity(ids: string[], counts: Record<string, number>): { achievement: Achievement; owners: number }[] {
  const order = new Map(ACHIEVEMENTS.map((a, i) => [a.id, i]));
  return ACHIEVEMENTS.filter((a) => ids.includes(a.id))
    .map((achievement) => ({ achievement, owners: Math.max(1, counts[achievement.id] ?? 1) }))
    .sort((a, b) => a.owners - b.owners || order.get(a.achievement.id)! - order.get(b.achievement.id)!);
}

/** «Solo tu», «Solo Marco», «3 su 7», «Tutti». */
export function rarityLabel(owners: number, members: number, name: string, isMe: boolean): string {
  if (owners <= 1) return isMe ? "Solo tu" : `Solo ${name}`;
  if (owners >= members) return "Tutti";
  return `${owners} su ${members}`;
}

export class ShowcaseService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly user: () => Promise<string> = () => ensureUser(sb),
  ) {}

  async ofMember(memberId: string): Promise<Showcase> {
    await this.user();
    const { data, error } = await this.sb.rpc("member_showcase", { p_member: memberId });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message))
        throw new Error("Il database non è aggiornato per la vetrina: va eseguito 0013_vetrina.sql (vedi SUPABASE.md).");
      if (error.message.includes("not_allowed")) throw new Error("Questa vetrina la vede solo chi è nella compagnia.");
      throw new Error(error.message);
    }
    const raw = data as { name: string; has_account: boolean; members: number; total: number; achievements: string[]; counts: Record<string, number> };
    return {
      name: raw.name,
      hasAccount: raw.has_account === true,
      members: raw.members ?? 0,
      total: raw.total ?? ACHIEVEMENTS.length,
      achievements: byRarity(raw.achievements ?? [], raw.counts ?? {}),
    };
  }
}

let service: ShowcaseService | null = null;
export function getShowcase(): ShowcaseService | null {
  if (!isSupabaseConfigured) return null;
  if (!service) service = new ShowcaseService(getSupabase());
  return service;
}
