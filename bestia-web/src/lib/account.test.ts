import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { AccountService, usernameProblem, usernameToEmail, passwordProblem } from "./account";

/** Finto Supabase con lo stretto necessario: un utente (anonimo o no), un profilo e le RPC. */
function fake(opts: { email?: string | null; profile?: Record<string, unknown> | null; updateUser?: () => unknown; rpcError?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const user = { id: "u1", is_anonymous: !opts.email, email: opts.email ?? "" };
  const sb = {
    auth: {
      getUser: async () => ({ data: { user } }),
      updateUser: vi.fn(async (attrs: { email?: string; password?: string }) => {
        calls.push(`updateUser:${Object.keys(attrs).join(",")}`);
        if (opts.updateUser) return opts.updateUser();
        return { data: { user: { ...user, email: attrs.email ?? user.email, is_anonymous: false } }, error: null };
      }),
      refreshSession: vi.fn(async () => {
        calls.push("refresh");
        return { data: {}, error: null };
      }),
      signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
        calls.push(`signIn:${email}`);
        return password === "giusta-123" ? { data: {}, error: null } : { data: {}, error: { code: "invalid_credentials", message: "Invalid login credentials" } };
      }),
      signOut: vi.fn(async () => {
        calls.push("signOut");
        return { error: null };
      }),
    },
    rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      calls.push(`rpc:${fn}${args?.p_username ? `:${args.p_username}` : ""}`);
      const err = opts.rpcError?.[fn];
      if (err) return { data: null, error: { code: "P0001", message: err } };
      if (fn === "username_available") return { data: args?.p_username !== "preso", error: null };
      return { data: null, error: null };
    }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.profile ?? null, error: null }) }) }),
      upsert: async (row: Record<string, unknown>) => {
        calls.push(`upsert:${Object.keys(row).sort().join(",")}`);
        return { error: null };
      },
    }),
  };
  return { svc: new AccountService(sb as unknown as SupabaseClient, async () => "u1"), calls, sb };
}

describe("regole di username e password", () => {
  it("accetta username semplici e li porta in minuscolo nell'email finta", () => {
    expect(usernameProblem("Matteo_92")).toBeNull();
    expect(usernameToEmail(" Matteo ")).toBe("matteo@giocatori.bestia-score-keeper.vercel.app");
  });
  it("rifiuta username troppo corti, con spazi o che iniziano col punto", () => {
    expect(usernameProblem("ab")).toMatch(/3/);
    expect(usernameProblem("mario rossi")).toMatch(/Solo/);
    expect(usernameProblem(".mario")).toMatch(/iniziare/);
    expect(usernameProblem("a".repeat(21))).toMatch(/20/);
  });
  it("vuole password di almeno 8 caratteri", () => {
    expect(passwordProblem("1234567")).toMatch(/8/);
    expect(passwordProblem("12345678")).toBeNull();
  });
});

describe("account", () => {
  it("un ospite anonimo non ha username", async () => {
    const { svc } = fake({ profile: { username: null, display_name: "Anna", character: null } });
    expect(await svc.current()).toEqual({ userId: "u1", username: null, displayName: "Anna", character: null });
  });

  it("registrandosi riserva l'username, poi imposta email finta e password sullo stesso utente", async () => {
    const { svc, calls } = fake();
    await svc.register("Matteo", "password-1");
    expect(calls).toEqual(["rpc:claim_username:matteo", "updateUser:email,password", "refresh"]);
  });

  it("se l'username è preso non tocca l'utente", async () => {
    const { svc, calls } = fake({ rpcError: { claim_username: "username_taken" } });
    await expect(svc.register("matteo", "password-1")).rejects.toThrow("già preso");
    expect(calls).toEqual(["rpc:claim_username:matteo"]);
  });

  it("se Supabase lascia l'email da confermare, libera l'username e spiega cosa cambiare", async () => {
    const { svc, calls } = fake({ updateUser: () => ({ data: { user: { email: "", new_email: "x" } }, error: null }) });
    await expect(svc.register("matteo", "password-1")).rejects.toThrow(/conferma email/);
    expect(calls).toContain("rpc:release_username");
  });

  it("non registra un telefono che ha già un account", async () => {
    const { svc, calls } = fake({ email: usernameToEmail("anna") });
    await expect(svc.register("matteo", "password-1")).rejects.toThrow(/già un account/);
    expect(calls).toEqual([]);
  });

  it("entra con username e password, con un messaggio chiaro se sono sbagliati", async () => {
    const { svc, calls } = fake();
    await svc.login("Anna", "giusta-123");
    expect(calls).toEqual([`signIn:${usernameToEmail("anna")}`]);
    await expect(svc.login("anna", "sbagliata")).rejects.toThrow("Username o password sbagliati.");
  });

  it("cambia password senza chiedere quella vecchia", async () => {
    const { svc, calls } = fake({ email: usernameToEmail("anna") });
    await expect(svc.changePassword("corta")).rejects.toThrow(/8/);
    await svc.changePassword("nuova-password");
    expect(calls).toEqual(["updateUser:password"]);
  });

  it("dal browser modifica solo nome e personaggio, mai l'username", async () => {
    const { svc, calls } = fake({ email: usernameToEmail("anna") });
    await svc.setDisplayName("  Annina ");
    await svc.setCharacter({ hair: "h1" });
    expect(calls).toEqual(["upsert:display_name,id,updated_at", "upsert:character,id,updated_at"]);
  });

  it("eliminando l'account chiama la funzione del database ed esce", async () => {
    const { svc, calls } = fake({ email: usernameToEmail("anna") });
    await svc.deleteAccount();
    expect(calls).toEqual(["rpc:delete_my_account", "signOut"]);
  });
});
