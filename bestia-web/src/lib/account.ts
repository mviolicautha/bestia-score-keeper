import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { CharacterConfig } from "./avatar/catalog";
import { ensureUser, getSupabase, isSupabaseConfigured } from "./supabase";

/**
 * Account con username e password, senza email.
 *
 * Supabase vuole comunque un'email: la ricaviamo dall'username con un dominio finto che non
 * riceve posta (in Supabase la conferma email va spenta, vedi SUPABASE.md). Registrarsi non crea
 * un utente nuovo: trasforma l'ospite anonimo del telefono in un utente con password, così l'id
 * resta lo stesso e le partite fatte da quel telefono restano sue.
 *
 * La password dimenticata non si recupera da soli: sul telefono già collegato la si cambia dal
 * profilo; altrimenti la reimposta il proprietario dell'app dalla dashboard di Supabase.
 */

/** Non cambiare mai: è parte dell'identità di ogni account già creato. */
export const ACCOUNT_EMAIL_DOMAIN = "giocatori.bestia-score-keeper.vercel.app";
export const MIN_PASSWORD = 8;

export const normalizeUsername = (u: string) => u.trim().toLowerCase();
export const usernameToEmail = (u: string) => `${normalizeUsername(u)}@${ACCOUNT_EMAIL_DOMAIN}`;

/** Messaggio d'errore per l'username, o null se va bene. Stesse regole del database. */
export function usernameProblem(u: string): string | null {
  const n = normalizeUsername(u);
  if (n.length < 3) return "Almeno 3 caratteri.";
  if (n.length > 20) return "Al massimo 20 caratteri.";
  if (!/^[a-z0-9]/.test(n)) return "Deve iniziare con una lettera o un numero.";
  if (!/^[a-z0-9_.]+$/.test(n)) return "Solo lettere, numeri, punto e trattino basso.";
  return null;
}

export function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Almeno ${MIN_PASSWORD} caratteri.`;
  return null;
}

export interface Account {
  userId: string;
  /** null finché il telefono è un ospite anonimo. */
  username: string | null;
  displayName: string | null;
  /** Personaggio salvato nel profilo (lo vedono master, TV e gli altri telefoni). */
  character: CharacterConfig | null;
}

export class AccountError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const isAnonymous = (u: User | null | undefined) => !u || u.is_anonymous === true || !u.email;

function friendly(code: string | undefined, message: string): AccountError {
  const c = code ?? "";
  if (c === "username_taken" || /username_taken/.test(message)) return new AccountError("Questo username è già preso.", "username_taken");
  if (c === "invalid_username" || /invalid_username/.test(message)) return new AccountError("Username non valido.", "invalid_username");
  if (c === "already_registered" || /already_registered/.test(message))
    return new AccountError("Questo telefono ha già un account.", "already_registered");
  if (c === "invalid_credentials") return new AccountError("Username o password sbagliati.", "invalid_credentials");
  if (c === "weak_password") return new AccountError(`La password è troppo debole: almeno ${MIN_PASSWORD} caratteri.`, "weak_password");
  if (c === "same_password") return new AccountError("È uguale a quella di adesso.", "same_password");
  if (c === "over_request_rate_limit" || c === "over_email_send_rate_limit")
    return new AccountError("Troppi tentativi: riprova tra qualche minuto.", "rate_limit");
  if (c === "email_exists" || c === "user_already_exists") return new AccountError("Questo username è già preso.", "username_taken");
  if (c === "PGRST202")
    return new AccountError("Il database non è aggiornato per gli account: va eseguito 0005_account.sql (vedi SUPABASE.md).", "migration_missing");
  if (/Failed to fetch|NetworkError|network/i.test(message)) return new AccountError("Nessuna connessione.", "offline");
  return new AccountError(message, c || "unknown");
}

export class AccountService {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly ensure: () => Promise<string> = () => ensureUser(sb),
  ) {}

  /** L'account di questo telefono (l'ospite anonimo se non si è registrato o non è entrato). */
  async current(): Promise<Account> {
    const userId = await this.ensure();
    const { data } = await this.sb.auth.getUser();
    const { data: profile } = await this.sb.from("profiles").select("username, display_name, character").eq("id", userId).maybeSingle();
    const p = profile as { username: string | null; display_name: string | null; character: CharacterConfig | null } | null;
    return {
      userId,
      username: isAnonymous(data.user) ? null : (p?.username ?? data.user?.email?.split("@")[0] ?? null),
      displayName: p?.display_name ?? null,
      character: p?.character ?? null,
    };
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    await this.ensure();
    const { data, error } = await this.sb.rpc("username_available", { p_username: normalizeUsername(username) });
    if (error) throw friendly(error.code, error.message);
    return data === true;
  }

  /**
   * Registra questo telefono: l'ospite anonimo diventa un account con username e password.
   * Prima riserva l'username (unico), poi imposta email finta e password; se il secondo passo
   * fallisce, libera l'username.
   */
  async register(username: string, password: string): Promise<void> {
    const problem = usernameProblem(username) ?? passwordProblem(password);
    if (problem) throw new AccountError(problem, "invalid");
    await this.ensure();
    const { data: me } = await this.sb.auth.getUser();
    if (!isAnonymous(me.user)) throw new AccountError("Questo telefono ha già un account: esci prima di crearne un altro.", "already_registered");

    const name = normalizeUsername(username);
    const claimed = await this.sb.rpc("claim_username", { p_username: name });
    if (claimed.error) throw friendly(claimed.error.code, claimed.error.message);

    const email = usernameToEmail(name);
    const { data, error } = await this.sb.auth.updateUser({ email, password });
    const ok = !error && data.user?.email === email;
    if (!ok) {
      await this.sb.rpc("release_username");
      if (error) throw friendly(error.code, error.message);
      // l'email è rimasta "da confermare": in Supabase la conferma email è ancora accesa
      throw new AccountError(
        "Registrazione non completata: nelle impostazioni di Supabase va spenta la conferma email (vedi SUPABASE.md).",
        "email_confirmation_on",
      );
    }
    // nuovo token: non più anonimo
    await this.sb.auth.refreshSession();
  }

  /** Entra con un account esistente. L'ospite anonimo di questo telefono viene lasciato. */
  async login(username: string, password: string): Promise<void> {
    if (!normalizeUsername(username) || !password) throw new AccountError("Scrivi username e password.", "invalid");
    const { error } = await this.sb.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error) throw friendly(error.code, error.message);
  }

  /** Esce: al prossimo uso il telefono torna un ospite anonimo nuovo. */
  async logout(): Promise<void> {
    await this.sb.auth.signOut();
  }

  /** Cambia la password: basta essere collegati (il telefono dimostra già chi sei). */
  async changePassword(password: string): Promise<void> {
    const problem = passwordProblem(password);
    if (problem) throw new AccountError(problem, "invalid");
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw friendly(error.code, error.message);
  }

  async setDisplayName(displayName: string): Promise<void> {
    const userId = await this.ensure();
    const name = displayName.trim().slice(0, 20);
    if (!name) throw new AccountError("Scrivi un nome.", "invalid");
    const { error } = await this.sb.from("profiles").upsert({ id: userId, display_name: name, updated_at: new Date().toISOString() });
    if (error) throw friendly(error.code, error.message);
  }

  async setCharacter(character: CharacterConfig | null): Promise<void> {
    const userId = await this.ensure();
    const { error } = await this.sb.from("profiles").upsert({ id: userId, character, updated_at: new Date().toISOString() });
    if (error) throw friendly(error.code, error.message);
  }

  /** Elimina account e profilo. Le partite condotte da master restano, senza master. */
  async deleteAccount(): Promise<void> {
    await this.ensure();
    const { error } = await this.sb.rpc("delete_my_account");
    if (error) throw friendly(error.code, error.message);
    await this.sb.auth.signOut({ scope: "local" });
  }
}

let service: AccountService | null = null;

/** null se Supabase non è configurato (senza backend non ci sono account). */
export function getAccounts(): AccountService | null {
  if (service) return service;
  if (!isSupabaseConfigured) return null;
  service = new AccountService(getSupabase());
  return service;
}

/** Solo per i test. */
export function setAccountsForTests(s: AccountService | null) {
  service = s;
}
