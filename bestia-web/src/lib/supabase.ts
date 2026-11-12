import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Collegamento a Supabase. Attivo solo se ci sono le due variabili d'ambiente
 * (vedi SUPABASE.md); altrimenti l'app salva tutto in locale come prima.
 *
 * La chiave "anon" è pubblica per progetto: la sicurezza la fanno le regole RLS
 * del database (supabase/migrations). La chiave "service role" non va mai qui.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) throw new Error("Supabase non configurato (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  if (!client) client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

let session: Promise<string> | null = null;

/**
 * Id dell'utente collegato. Chi apre l'app la prima volta entra come ospite anonimo
 * (nessuna registrazione): il telefono si ricorda di lui. Più avanti potrà collegare
 * un account (email, Google, Apple) mantenendo lo stesso id.
 */
export function ensureUser(sb: SupabaseClient = getSupabase()): Promise<string> {
  if (!session) {
    session = (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) return data.session.user.id;
      const { data: anon, error } = await sb.auth.signInAnonymously();
      if (error || !anon.user) throw new Error(`Accesso come ospite non riuscito: ${error?.message ?? "nessun utente"}`);
      return anon.user.id;
    })().catch((e) => {
      session = null; // al prossimo tentativo si riprova
      throw e;
    });
  }
  return session;
}
