import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { CharacterConfig } from "./avatar/catalog";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";
import { onWake } from "./resilience";

/**
 * Giocatori che si collegano dal proprio telefono (solo con Supabase):
 * - "Sono io": un profilo prende il posto di un giocatore già al tavolo (game_seats);
 * - "Chiedo di sedermi": richiesta che il master approva scegliendo il posto (join_requests);
 * - profilo: nome e personaggio, visibili a master e TV.
 * Le regole di sicurezza del database decidono chi può fare cosa (supabase/migrations).
 */

export interface OnlineGame {
  id: string;
  code: string;
  title: string;
  masterId: string;
  /**
   * Personaggi creati dal master sul suo dispositivo, per nome (chiave di characterKey):
   * li vedono anche i telefoni e la TV. Vuoto finché non c'è 0004_personaggi_condivisi.sql.
   */
  characters?: Record<string, CharacterConfig>;
}

interface GameRow {
  id: string;
  code: string;
  title: string;
  master_id: string;
  characters?: Record<string, CharacterConfig> | null;
}
// select("*"): funziona anche se la colonna dei personaggi non è ancora stata aggiunta
const toGame = (r: GameRow): OnlineGame => ({ id: r.id, code: r.code, title: r.title, masterId: r.master_id, characters: r.characters ?? {} });

export interface SeatClaim {
  playerId: string;
  profileId: string;
  /** Personaggio salvato nel profilo di chi ha preso il posto. */
  character: CharacterConfig | null;
}

export type RequestStatus = "pending" | "approved" | "rejected";

export interface JoinRequest {
  id: string;
  profileId: string;
  name: string;
  status: RequestStatus;
  playerId: string | null;
  createdAt: string;
}

interface RequestRow {
  id: string;
  profile_id: string;
  name: string;
  status: RequestStatus;
  player_id: string | null;
  created_at: string;
}
const toRequest = (r: RequestRow): JoinRequest => ({
  id: r.id,
  profileId: r.profile_id,
  name: r.name,
  status: r.status,
  playerId: r.player_id,
  createdAt: r.created_at,
});

function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) {
    const e = new Error(`${what}: ${res.error.message}`) as Error & { code?: string };
    e.code = res.error.code;
    throw e;
  }
  return res.data;
}

/** Normalizza un codice digitato a mano: maiuscolo, senza spazi o trattini. */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export class OnlineService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly user: () => Promise<string>,
  ) {}

  myId() {
    return this.user();
  }

  async findGameByCode(code: string): Promise<OnlineGame | null> {
    await this.user();
    const row = check(await this.sb.from("games").select("*").eq("code", normalizeCode(code)).maybeSingle(), "Codice partita") as GameRow | null;
    return row ? toGame(row) : null;
  }

  async getGame(gameId: string): Promise<OnlineGame | null> {
    await this.user();
    const row = check(await this.sb.from("games").select("*").eq("id", gameId).maybeSingle(), "Partita") as GameRow | null;
    return row ? toGame(row) : null;
  }

  /**
   * Il master condivide i personaggi creati sul suo dispositivo. false se il database non ha
   * ancora la colonna (0004_personaggi_condivisi.sql): si vedono solo sul suo dispositivo.
   */
  async shareCharacters(gameId: string, characters: Record<string, CharacterConfig>): Promise<boolean> {
    await this.user();
    const { error } = await this.sb.from("games").update({ characters }).eq("id", gameId);
    if (!error) return true;
    if (error.code === "PGRST204" || error.code === "42703" || /characters/.test(error.message)) return false;
    throw new Error(`Personaggi: ${error.message}`);
  }

  /** Posti presi, con il personaggio del profilo di chi li ha presi. */
  async listSeats(gameId: string): Promise<SeatClaim[]> {
    await this.user();
    const seats = check(
      await this.sb.from("game_seats").select("player_id, profile_id").eq("game_id", gameId),
      "Posti",
    ) as { player_id: string; profile_id: string }[];
    if (seats.length === 0) return [];
    const profiles = check(
      await this.sb.from("profiles").select("id, character").in("id", seats.map((s) => s.profile_id)),
      "Profili",
    ) as { id: string; character: CharacterConfig | null }[];
    const byId = new Map(profiles.map((p) => [p.id, p.character]));
    return seats.map((s) => ({ playerId: s.player_id, profileId: s.profile_id, character: byId.get(s.profile_id) ?? null }));
  }

  /** "Sono io": prendo il posto. Se è già preso da un altro, errore con code "23505". */
  async claimSeat(gameId: string, playerId: string, name: string, character?: CharacterConfig | null) {
    const uid = await this.user();
    await this.saveProfile({ displayName: name, ...(character ? { character } : {}) });
    check(await this.sb.from("game_seats").insert({ game_id: gameId, player_id: playerId, profile_id: uid }), "Posto");
  }

  /** Lascia il posto (il giocatore stesso, o il master per scollegare un telefono). */
  async releaseSeat(gameId: string, playerId: string) {
    await this.user();
    check(await this.sb.from("game_seats").delete().eq("game_id", gameId).eq("player_id", playerId), "Posto");
  }

  async saveProfile(p: { displayName?: string; character?: CharacterConfig | null }) {
    const uid = await this.user();
    const row: Record<string, unknown> = { id: uid, updated_at: new Date().toISOString() };
    if (p.displayName !== undefined) row.display_name = p.displayName.trim().slice(0, 20);
    if (p.character !== undefined) row.character = p.character;
    check(await this.sb.from("profiles").upsert(row), "Profilo");
  }

  async requestToJoin(gameId: string, name: string): Promise<JoinRequest> {
    await this.user();
    const row = check(
      await this.sb.from("join_requests").insert({ game_id: gameId, name: name.trim() }).select("*").single(),
      "Richiesta",
    ) as RequestRow;
    return toRequest(row);
  }

  /** La mia richiesta più recente per questa partita (se c'è). */
  async myRequest(gameId: string): Promise<JoinRequest | null> {
    const uid = await this.user();
    const rows = check(
      await this.sb.from("join_requests").select("*").eq("game_id", gameId).eq("profile_id", uid).order("created_at", { ascending: false }).limit(1),
      "Richiesta",
    ) as RequestRow[];
    return rows[0] ? toRequest(rows[0]) : null;
  }

  /** Richieste in attesa (le vede solo il master). */
  async pendingRequests(gameId: string): Promise<JoinRequest[]> {
    await this.user();
    const rows = check(
      await this.sb.from("join_requests").select("*").eq("game_id", gameId).eq("status", "pending").order("created_at", { ascending: true }),
      "Richieste",
    ) as RequestRow[];
    return rows.map(toRequest);
  }

  async decideRequest(id: string, status: "approved" | "rejected", playerId?: string) {
    await this.user();
    check(await this.sb.from("join_requests").update({ status, player_id: playerId ?? null }).eq("id", id), "Richiesta");
  }

  /**
   * Avvisa quando cambiano posti, richieste, profili o personaggi condivisi di questa partita.
   * Il canale si apre dopo aver passato il token: senza, le regole di sicurezza non mandano nulla.
   */
  subscribe(gameId: string, onChange: () => void): () => void {
    let closed = false;
    const channels: RealtimeChannel[] = [];
    const id = () => `${gameId}:${Math.random().toString(36).slice(2)}`;
    const stopWake = onWake(onChange);
    void (async () => {
      await this.user();
      const { data } = await this.sb.auth.getSession();
      if (data.session) await this.sb.realtime.setAuth(data.session.access_token);
      if (closed) return;
      // Due canali separati: se una tabella non è abilitata al tempo reale, Supabase rifiuta
      // l'intero canale (pur dicendo "collegato"). I profili richiedono 0002_giocatori.sql:
      // se manca, i personaggi si aggiornano solo con posti e richieste, ma il resto funziona.
      channels.push(
        this.sb
          .channel(`online:${id()}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "game_seats", filter: `game_id=eq.${gameId}` }, onChange)
          .on("postgres_changes", { event: "*", schema: "public", table: "join_requests", filter: `game_id=eq.${gameId}` }, onChange)
          // la partita stessa: i personaggi condivisi dal master
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` }, onChange)
          .subscribe((status) => {
            if (status === "SUBSCRIBED") onChange();
          }),
        this.sb
          .channel(`profili:${id()}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, onChange)
          .subscribe(),
      );
    })().catch(() => {
      /* offline: si vedrà lo stato al prossimo caricamento */
    });
    return () => {
      closed = true;
      stopWake();
      for (const ch of channels) void this.sb.removeChannel(ch);
    };
  }
}

let service: OnlineService | null = null;

/** null se Supabase non è configurato (app solo locale). */
export function getOnline(): OnlineService | null {
  if (service) return service;
  if (!isSupabaseConfigured) return null;
  service = new OnlineService(getSupabase(), () => ensureUser());
  return service;
}

/** Solo per i test. */
export function setOnlineForTests(s: OnlineService | null) {
  service = s;
}
