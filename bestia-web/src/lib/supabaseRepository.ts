import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { GameEvent, GameStatus } from "@/engine";
import type { GameMeta, GameRepository, StoredEvent } from "./repository";
import { isMissingFunction, onWake, SaveConflictError } from "./resilience";

/**
 * Le partite su Supabase, con la stessa interfaccia del salvataggio locale: le schermate
 * non cambiano. Solo il master scrive (le funzioni del database lo controllano);
 * TV e giocatori leggono e ricevono gli aggiornamenti in tempo reale.
 */

interface GameRow {
  id: string;
  code: string;
  title: string;
  status: GameStatus;
  created_at: string;
  updated_at: string;
}
interface EventRow {
  seq: number;
  event: GameEvent;
  at: string;
}

const toMeta = (r: GameRow): GameMeta => ({
  id: r.id,
  code: r.code,
  title: r.title,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export class SupabaseGameRepository implements GameRepository {
  constructor(
    private readonly sb: SupabaseClient,
    /** Restituisce l'id dell'utente, entrando come ospite se serve. */
    private readonly user: () => Promise<string>,
    /** Subito dopo il collegamento al canale Supabase può perdere qualche modifica: si ricarica di nuovo dopo questo tempo. */
    private readonly settleMs = 1500,
  ) {}

  async listGames() {
    const uid = await this.user();
    const rows = check(
      await this.sb.from("games").select("id, code, title, status, created_at, updated_at").eq("master_id", uid).order("updated_at", { ascending: false }),
      "Elenco partite",
    ) as GameRow[];
    return rows.map(toMeta);
  }

  async getGame(gameId: string) {
    await this.user();
    const row = check(
      await this.sb.from("games").select("id, code, title, status, created_at, updated_at").eq("id", gameId).maybeSingle(),
      "Partita",
    ) as GameRow | null;
    return row ? toMeta(row) : null;
  }

  async createGame(title: string, baseBetCents: number) {
    await this.user();
    const row = check(await this.sb.rpc("create_game", { p_title: title, p_base_bet_cents: baseBetCents }), "Nuova partita") as GameRow;
    return row.id;
  }

  async loadEvents(gameId: string): Promise<StoredEvent[]> {
    await this.user();
    const rows = check(
      await this.sb.from("game_events").select("seq, event, at").eq("game_id", gameId).order("seq", { ascending: true }),
      "Eventi",
    ) as EventRow[];
    return rows.map((r) => ({ event: r.event, at: r.at }));
  }

  async appendEvent(gameId: string, event: GameEvent, status: GameStatus, expectedCount?: number) {
    await this.save("append_event", { p_game: gameId, p_event: event, p_status: status }, expectedCount, "Salvataggio");
  }

  async removeLastEvent(gameId: string, status: GameStatus, expectedCount?: number) {
    await this.save("remove_last_event", { p_game: gameId, p_status: status }, expectedCount, "Annulla");
  }

  /** Chiama la funzione del database con il numero di eventi atteso (vedi 0003_salvataggi_sicuri.sql). */
  private async save(fn: string, args: Record<string, unknown>, expected: number | undefined, what: string) {
    await this.user();
    let res = await this.sb.rpc(fn, expected === undefined ? args : { ...args, p_expected: expected });
    // database non ancora aggiornato con lo script 0003: si salva senza il controllo
    if (res.error && expected !== undefined && isMissingFunction(res.error)) res = await this.sb.rpc(fn, args);
    if (res.error) {
      if (/\bconflict\b/.test(res.error.message)) throw new SaveConflictError();
      throw new Error(`${what}: ${res.error.message}`);
    }
  }

  async deleteGame(gameId: string) {
    await this.user();
    check(await this.sb.from("games").delete().eq("id", gameId), "Cancellazione");
  }

  /**
   * Ogni evento aggiunto o annullato aggiorna la riga della partita (event_count):
   * si ascolta quella e si ricaricano gli eventi.
   */
  subscribe(gameId: string, onChange: (events: StoredEvent[]) => void) {
    let closed = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let channel: RealtimeChannel | null = null;
    const reload = () =>
      this.loadEvents(gameId)
        .then((ev) => !closed && onChange(ev))
        .catch(() => {
          /* connessione persa: al prossimo aggiornamento si riprova */
        });

    // al risveglio del telefono (o al ritorno della rete) si ricarica: in standby si perdono aggiornamenti
    const stopWake = onWake(() => void reload());

    void (async () => {
      // Prima la sessione, poi il canale: senza il token dell'utente il database tratta il canale
      // come anonimo e le regole di sicurezza non gli mandano gli aggiornamenti.
      await this.user();
      const { data } = await this.sb.auth.getSession();
      if (data.session) await this.sb.realtime.setAuth(data.session.access_token);
      if (closed) return;
      channel = this.sb
        // nome unico: due iscrizioni alla stessa partita (es. React in sviluppo monta due volte) non si pestano i piedi
        .channel(`game:${gameId}:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` }, reload)
        .subscribe((status) => {
          // appena collegati (anche dopo una riconnessione) potremmo aver perso degli aggiornamenti
          if (status === "SUBSCRIBED") {
            reload();
            clearTimeout(settle);
            settle = setTimeout(reload, this.settleMs);
          }
        });
    })().catch(() => {
      /* accesso non riuscito: la pagina mostra comunque l'ultimo stato caricato */
    });

    return () => {
      closed = true;
      clearTimeout(settle);
      stopWake();
      if (channel) void this.sb.removeChannel(channel);
    };
  }
}
