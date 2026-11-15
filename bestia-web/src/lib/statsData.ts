import type { SupabaseClient } from "@supabase/supabase-js";
import { replay, type GameEvent, type PlayerId } from "@/engine";
import { HistoryService } from "./history";
import type { CareerGame } from "./stats";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";

/**
 * Carica le partite terminate dell'account e le rigioca, per statistiche e soprannomi.
 * Non serve nessuna migrazione: legge storico, eventi, posti e membri delle compagnie.
 */

const CHUNK = 40;
const PAGE = 1000;

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export class StatsService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly user: () => Promise<string> = () => ensureUser(sb),
  ) {}

  /** Eventi delle partite indicate, per partita e in ordine. */
  async events(gameIds: string[]): Promise<Record<string, GameEvent[]>> {
    const out: Record<string, GameEvent[]> = {};
    for (const ids of chunks(gameIds)) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await this.sb
          .from("game_events")
          .select("game_id, seq, event")
          .in("game_id", ids)
          .order("game_id", { ascending: true })
          .order("seq", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`Eventi: ${error.message}`);
        const rows = (data ?? []) as { game_id: string; event: GameEvent }[];
        for (const r of rows) (out[r.game_id] ??= []).push(r.event);
        if (rows.length < PAGE) break;
      }
    }
    return out;
  }

  /** Chi era chi in ogni partita: profilo dal posto o dal membro della compagnia, altrimenti il membro. */
  private async identities(gameIds: string[]) {
    const profileOf: Record<string, Record<PlayerId, string>> = {};
    const memberOf: Record<string, Record<PlayerId, string>> = {};
    for (const ids of chunks(gameIds)) {
      const [seats, players] = await Promise.all([
        this.sb.from("game_seats").select("game_id, player_id, profile_id").in("game_id", ids),
        this.sb.from("game_players").select("game_id, player_id, member_id").in("game_id", ids),
      ]);
      for (const r of (seats.data ?? []) as { game_id: string; player_id: string; profile_id: string }[])
        (profileOf[r.game_id] ??= {})[r.player_id] = r.profile_id;
      for (const r of (players.data ?? []) as { game_id: string; player_id: string; member_id: string | null }[])
        if (r.member_id) (memberOf[r.game_id] ??= {})[r.player_id] = r.member_id;
    }
    const memberIds = [...new Set(Object.values(memberOf).flatMap((m) => Object.values(m)))];
    const memberProfile: Record<string, string> = {};
    for (const ids of chunks(memberIds)) {
      const { data } = await this.sb.from("group_members").select("id, profile_id").in("id", ids);
      for (const r of (data ?? []) as { id: string; profile_id: string | null }[]) if (r.profile_id) memberProfile[r.id] = r.profile_id;
    }
    return { profileOf, memberOf, memberProfile };
  }

  /** Le mie partite terminate, rigiocate, dalla più recente. */
  async myGames(): Promise<CareerGame[]> {
    const uid = await this.user();
    const history = await new HistoryService(this.sb, this.user).myHistory();
    const played = history.filter((h) => h.myBalanceCents !== null);
    if (played.length === 0) return [];
    const ids = played.map((h) => h.gameId);
    const [events, who] = await Promise.all([this.events(ids), this.identities(ids)]);

    const games: CareerGame[] = [];
    for (const h of played) {
      const list = events[h.gameId];
      if (!list?.length) continue;
      let replayed;
      try {
        replayed = replay(list);
      } catch {
        continue; // partita con eventi rovinati: la si salta
      }
      const { state, history: hist } = replayed;
      const keyOf: Record<PlayerId, string> = {};
      for (const p of state.players) {
        const member = who.memberOf[h.gameId]?.[p.id];
        const profile = who.profileOf[h.gameId]?.[p.id] ?? (member ? who.memberProfile[member] : undefined);
        keyOf[p.id] = profile ? `p:${profile}` : member ? `m:${member}` : `n:${p.name.trim().toLowerCase()}`;
      }
      const me =
        state.players.find((p) => keyOf[p.id] === `p:${uid}`)?.id ??
        state.players.find((p) => p.name === h.myName && p.balanceCents === h.myBalanceCents)?.id;
      if (!me) continue;
      games.push({ gameId: h.gameId, title: h.title, endedAt: h.endedAt, state, history: hist, me, keyOf });
    }
    return games;
  }

  /** Giocatori di una partita (player_id → member_id) e la partita rigiocata, per i soprannomi in compagnia. */
  async game(gameId: string) {
    await this.user();
    const [events, players] = await Promise.all([
      this.events([gameId]),
      this.sb.from("game_players").select("player_id, member_id").eq("game_id", gameId),
    ]);
    const list = events[gameId];
    if (!list?.length) return null;
    const memberOf: Record<PlayerId, string> = {};
    for (const r of (players.data ?? []) as { player_id: string; member_id: string | null }[]) if (r.member_id) memberOf[r.player_id] = r.member_id;
    try {
      return { ...replay(list), memberOf };
    } catch {
      return null;
    }
  }
}

let service: StatsService | null = null;

/** null se Supabase non è configurato. */
export function getStats(): StatsService | null {
  if (service) return service;
  if (!isSupabaseConfigured) return null;
  service = new StatsService(getSupabase());
  return service;
}
