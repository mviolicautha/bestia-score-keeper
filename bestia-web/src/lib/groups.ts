import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { CharacterConfig } from "./avatar/catalog";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";
import { normalizeCode } from "./online";

/**
 * Compagnie di amici (solo con Supabase e con un account).
 *
 * Una compagnia ha un nome, un codice invito e dei membri. Un membro è una persona con un nome:
 * può essere un ospite senza account (aggiunto da chi conduce le partite) oppure collegato a un
 * account ("Sono io"). Le regole stanno nel database (0006_compagnie.sql): qui si leggono le
 * tabelle e si chiamano le funzioni, traducendo gli errori in italiano.
 */

export type GroupRole = "admin" | "member";

export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
  myRole: GroupRole;
}

export interface GroupMember {
  id: string;
  name: string;
  role: GroupRole;
  profileId: string | null;
  /** Username dell'account collegato (null per gli ospiti). */
  username: string | null;
  /** Personaggio da mostrare: quello del profilo se collegato, altrimenti quello del membro. */
  character: CharacterConfig | null;
  isMe: boolean;
}

export interface GroupDetail {
  id: string;
  name: string;
  inviteCode: string;
  members: GroupMember[];
  me: GroupMember | null;
  isAdmin: boolean;
}

export interface InvitePreview {
  id: string;
  name: string;
  alreadyMember: boolean;
  memberCount: number;
  unclaimed: { id: string; name: string; character: CharacterConfig | null }[];
}

export interface GroupGame {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "ended";
  updatedAt: string;
  masterId: string | null;
}

export class GroupError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  account_required: "Per le compagnie serve un account.",
  invalid_code: "Nessuna compagnia con questo codice.",
  already_member: "Fai già parte di questa compagnia.",
  member_taken: "Qualcun altro ha appena scelto questo nome: scegline un altro.",
  name_required: "Scrivi il tuo nome.",
  not_member: "Non fai parte di questa compagnia.",
  not_admin: "Solo un amministratore può farlo.",
  not_allowed: "Non puoi farlo.",
  use_leave: "Per te stesso usa “Esci dalla compagnia”.",
  needs_account: "Può diventare amministratore solo chi ha un account.",
  last_admin: "Deve restare almeno un amministratore: prima nominane un altro.",
  not_found: "Non esiste più.",
  not_master: "Solo chi conduce la partita può farlo.",
  not_in_group: "Questa persona non è nella compagnia della partita.",
};

function friendly(error: { code?: string; message: string }): GroupError {
  for (const [code, text] of Object.entries(MESSAGES)) if (error.message.includes(code)) return new GroupError(text, code);
  if (error.code === "23505") return new GroupError("C'è già qualcuno con questo nome nella compagnia.", "name_taken");
  if (error.code === "23514") return new GroupError("Nome troppo lungo o vuoto.", "invalid_name");
  if (error.code === "PGRST202" || error.code === "42P01" || error.code === "42703" || error.code === "PGRST205")
    return new GroupError("Il database non è aggiornato: vanno eseguiti gli script in supabase/migrations (vedi SUPABASE.md).", "migration_missing");
  if (/Failed to fetch|NetworkError/i.test(error.message)) return new GroupError("Nessuna connessione.", "offline");
  return new GroupError(error.message, error.code ?? "unknown");
}

/** Normalizza un codice invito digitato a mano (come quelli delle partite). */
export const normalizeGroupCode = normalizeCode;

interface MemberRow {
  id: string;
  name: string;
  role: GroupRole;
  profile_id: string | null;
  character: CharacterConfig | null;
}

export class GroupService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly user: () => Promise<string> = () => ensureUser(sb),
  ) {}

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    await this.user();
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw friendly(error);
    return data as T;
  }

  /** Le mie compagnie, in ordine alfabetico. */
  async listMine(): Promise<GroupSummary[]> {
    const uid = await this.user();
    const mine = await this.sb.from("group_members").select("group_id, role").eq("profile_id", uid);
    if (mine.error) throw friendly(mine.error);
    const rows = (mine.data ?? []) as { group_id: string; role: GroupRole }[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.group_id);
    const [groups, members] = await Promise.all([
      this.sb.from("groups").select("id, name").in("id", ids),
      this.sb.from("group_members").select("group_id").in("group_id", ids),
    ]);
    if (groups.error) throw friendly(groups.error);
    if (members.error) throw friendly(members.error);
    const count = new Map<string, number>();
    for (const m of (members.data ?? []) as { group_id: string }[]) count.set(m.group_id, (count.get(m.group_id) ?? 0) + 1);
    const role = new Map(rows.map((r) => [r.group_id, r.role]));
    return ((groups.data ?? []) as { id: string; name: string }[])
      .map((g) => ({ id: g.id, name: g.name, memberCount: count.get(g.id) ?? 0, myRole: role.get(g.id) ?? "member" }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }

  /** La compagnia con i membri; null se non esiste o non ne faccio parte. */
  async get(groupId: string): Promise<GroupDetail | null> {
    const uid = await this.user();
    const g = await this.sb.from("groups").select("id, name, invite_code").eq("id", groupId).maybeSingle();
    if (g.error) throw friendly(g.error);
    if (!g.data) return null;
    const m = await this.sb.from("group_members").select("id, name, role, profile_id, character").eq("group_id", groupId);
    if (m.error) throw friendly(m.error);
    const rows = (m.data ?? []) as MemberRow[];
    const profileIds = rows.flatMap((r) => (r.profile_id ? [r.profile_id] : []));
    const profiles = new Map<string, { username: string | null; character: CharacterConfig | null }>();
    if (profileIds.length > 0) {
      const p = await this.sb.from("profiles").select("id, username, character").in("id", profileIds);
      if (p.error) throw friendly(p.error);
      for (const row of (p.data ?? []) as { id: string; username: string | null; character: CharacterConfig | null }[]) profiles.set(row.id, row);
    }
    const members: GroupMember[] = rows
      .map((r) => {
        const profile = r.profile_id ? profiles.get(r.profile_id) : undefined;
        return {
          id: r.id,
          name: r.name,
          role: r.role,
          profileId: r.profile_id,
          username: profile?.username ?? null,
          character: (r.profile_id ? profile?.character : r.character) ?? null,
          isMe: r.profile_id === uid,
        };
      })
      .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name, "it"));
    const row = g.data as { id: string; name: string; invite_code: string };
    const me = members.find((x) => x.isMe) ?? null;
    return { id: row.id, name: row.name, inviteCode: row.invite_code, members, me, isAdmin: me?.role === "admin" };
  }

  create(name: string, myName: string): Promise<string> {
    return this.rpc("create_group", { p_name: name.trim(), p_member_name: myName.trim() });
  }

  async preview(code: string): Promise<InvitePreview | null> {
    const raw = await this.rpc<{
      id: string;
      name: string;
      already_member: boolean;
      member_count: number;
      unclaimed: InvitePreview["unclaimed"];
    } | null>("preview_group_invite", { p_code: normalizeGroupCode(code) });
    if (!raw) return null;
    return { id: raw.id, name: raw.name, alreadyMember: raw.already_member, memberCount: raw.member_count, unclaimed: raw.unclaimed ?? [] };
  }

  /** "Sono io" (memberId) oppure "Sono nuovo" (newName). Restituisce l'id della compagnia. */
  join(code: string, choice: { memberId: string } | { newName: string }): Promise<string> {
    return this.rpc("join_group", {
      p_code: normalizeGroupCode(code),
      p_member: "memberId" in choice ? choice.memberId : null,
      p_new_name: "newName" in choice ? choice.newName.trim() : null,
    });
  }

  leave(groupId: string) {
    return this.rpc<void>("leave_group", { p_group: groupId });
  }
  addMember(groupId: string, name: string) {
    return this.rpc<string>("add_group_member", { p_group: groupId, p_name: name.trim() });
  }
  renameMember(memberId: string, name: string) {
    return this.rpc<void>("rename_group_member", { p_member: memberId, p_name: name.trim() });
  }
  setMemberCharacter(memberId: string, character: CharacterConfig | null) {
    return this.rpc<void>("set_group_member_character", { p_member: memberId, p_character: character });
  }
  unlinkMember(memberId: string) {
    return this.rpc<void>("unlink_group_member", { p_member: memberId });
  }
  removeMember(memberId: string) {
    return this.rpc<void>("remove_group_member", { p_member: memberId });
  }
  setRole(memberId: string, role: GroupRole) {
    return this.rpc<void>("set_group_member_role", { p_member: memberId, p_role: role });
  }
  rename(groupId: string, name: string) {
    return this.rpc<void>("rename_group", { p_group: groupId, p_name: name.trim() });
  }
  regenerateCode(groupId: string) {
    return this.rpc<string>("regenerate_group_code", { p_group: groupId });
  }

  /** Partite della compagnia, dalla più recente. */
  async listGames(groupId: string): Promise<GroupGame[]> {
    await this.user();
    const { data, error } = await this.sb
      .from("games")
      .select("id, title, status, updated_at, master_id")
      .eq("group_id", groupId)
      .order("updated_at", { ascending: false });
    if (error) throw friendly(error);
    return ((data ?? []) as { id: string; title: string; status: GroupGame["status"]; updated_at: string; master_id: string | null }[]).map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      updatedAt: g.updated_at,
      masterId: g.master_id,
    }));
  }

  /** Giocatori della partita legati ai membri della compagnia: player_id → member_id. */
  async gamePlayers(gameId: string): Promise<Record<string, string>> {
    await this.user();
    const { data, error } = await this.sb.from("game_players").select("player_id, member_id").eq("game_id", gameId);
    if (error) throw friendly(error);
    const out: Record<string, string> = {};
    for (const r of (data ?? []) as { player_id: string; member_id: string | null }[]) if (r.member_id) out[r.player_id] = r.member_id;
    return out;
  }

  /** Il master lega un giocatore a un membro (se ha l'account, il suo telefono prende il posto). */
  linkPlayer(gameId: string, playerId: string, memberId: string) {
    return this.rpc<void>("link_game_player", { p_game: gameId, p_player: playerId, p_member: memberId });
  }

  /** Avvisa quando cambiano i membri della compagnia (entrate, uscite, nomi, ruoli). */
  subscribe(groupId: string, onChange: () => void): () => void {
    let closed = false;
    let channel: RealtimeChannel | null = null;
    void (async () => {
      await this.user();
      const { data } = await this.sb.auth.getSession();
      if (data.session) await this.sb.realtime.setAuth(data.session.access_token);
      if (closed) return;
      channel = this.sb
        .channel(`compagnia:${groupId}:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` }, onChange)
        .subscribe();
    })().catch(() => {
      /* offline: si vedrà al prossimo caricamento */
    });
    return () => {
      closed = true;
      if (channel) void this.sb.removeChannel(channel);
    };
  }
}

let service: GroupService | null = null;

/** null se Supabase non è configurato. */
export function getGroups(): GroupService | null {
  if (service) return service;
  if (!isSupabaseConfigured) return null;
  service = new GroupService(getSupabase());
  return service;
}

/** Solo per i test. */
export function setGroupsForTests(s: GroupService | null) {
  service = s;
}
