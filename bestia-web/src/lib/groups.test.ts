import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { GroupService } from "./groups";

/** Finto Supabase: tabelle in memoria (filtri eq/in) e RPC registrate. */
function fake(tables: Record<string, Record<string, unknown>[]>, rpcResult: (fn: string, args: Record<string, unknown>) => unknown = () => ({ data: null, error: null })) {
  const rpcCalls: [string, Record<string, unknown>][] = [];
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return q;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  const sb = {
    from,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args]);
      return rpcResult(fn, args);
    }),
  };
  return { svc: new GroupService(sb as unknown as SupabaseClient, async () => "me"), rpcCalls };
}

const tables = {
  groups: [
    { id: "g1", name: "Venerdì", invite_code: "ABC234" },
    { id: "g2", name: "Amici del bar", invite_code: "XYZ789" },
  ],
  group_members: [
    { id: "m1", group_id: "g1", name: "Matteo", role: "admin", profile_id: "me", character: null },
    { id: "m2", group_id: "g1", name: "Anna", role: "member", profile_id: "anna", character: { hair: "guest-hair" } },
    { id: "m3", group_id: "g1", name: "Bruno", role: "member", profile_id: null, character: { hair: "h3" } },
    { id: "m4", group_id: "g2", name: "Matteo", role: "member", profile_id: "me", character: null },
  ],
  profiles: [
    { id: "me", username: "matteo", character: { hair: "h1" } },
    { id: "anna", username: "anna.b", character: { hair: "h2" } },
  ],
};

describe("compagnie", () => {
  it("elenca le mie compagnie con quanti membri hanno e il mio ruolo", async () => {
    const { svc } = fake(tables);
    expect(await svc.listMine()).toEqual([
      { id: "g2", name: "Amici del bar", memberCount: 1, myRole: "member" },
      { id: "g1", name: "Venerdì", memberCount: 3, myRole: "admin" },
    ]);
  });

  it("nel dettaglio mette me per primo e usa il personaggio del profilo per chi ha l'account", async () => {
    const { svc } = fake(tables);
    const g = await svc.get("g1");
    expect(g?.isAdmin).toBe(true);
    expect(g?.members.map((m) => [m.name, m.username, m.character?.hair, m.isMe])).toEqual([
      ["Matteo", "matteo", "h1", true],
      ["Anna", "anna.b", "h2", false],
      ["Bruno", null, "h3", false],
    ]);
  });

  it("entra con 'Sono io' o 'Sono nuovo' passando il codice normalizzato", async () => {
    const { svc, rpcCalls } = fake(tables, () => ({ data: "g1", error: null }));
    await svc.join(" abc-234 ", { memberId: "m3" });
    await svc.join("ABC234", { newName: "  Carla " });
    expect(rpcCalls).toEqual([
      ["join_group", { p_code: "ABC234", p_member: "m3", p_new_name: null }],
      ["join_group", { p_code: "ABC234", p_member: null, p_new_name: "Carla" }],
    ]);
  });

  it("traduce gli errori del database", async () => {
    const errors: Record<string, { code?: string; message: string }> = {
      leave_group: { message: "last_admin" },
      add_group_member: { code: "23505", message: "duplicate key value violates unique constraint" },
      rename_group: { code: "PGRST202", message: "Could not find the function" },
    };
    const { svc } = fake(tables, (fn) => ({ data: null, error: errors[fn] }));
    await expect(svc.leave("g1")).rejects.toThrow(/almeno un amministratore/);
    await expect(svc.addMember("g1", "Anna")).rejects.toThrow(/già qualcuno con questo nome/);
    await expect(svc.rename("g1", "x")).rejects.toThrow(/0006_compagnie/);
  });

  it("l'anteprima dell'invito restituisce null se il codice non esiste", async () => {
    const { svc } = fake(tables, () => ({ data: null, error: null }));
    expect(await svc.preview("NOPE00")).toBeNull();
  });
});
