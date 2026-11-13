"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Crown, Plus, Users } from "lucide-react";
import { getGroups, normalizeGroupCode, type GroupSummary } from "@/lib/groups";
import { useAccount } from "@/lib/useAccount";
import { Button, Sheet } from "@/components/Sheet";
import { AccountRequired, inputClass, messageOf } from "@/components/groupUi";

/** Le mie compagnie: aprirne una, crearne una nuova o entrare con un codice. */
export default function GroupsPage() {
  const { account } = useAccount();
  const groups = getGroups();
  const router = useRouter();
  const [list, setList] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const registered = !!account?.username;

  const load = useCallback(async () => {
    if (!groups) return;
    try {
      setList(await groups.listMine());
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [groups]);

  useEffect(() => {
    if (registered) void Promise.resolve().then(load);
  }, [registered, load]);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/" className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/10">
        <ChevronLeft size={18} /> Partite
      </Link>
      <h1 className="mb-2 text-3xl font-black">Compagnie</h1>
      <p className="mb-6 text-sm text-white/50">Il gruppo di amici con cui giochi: membri, partite e storico in un posto solo.</p>

      {!groups ? (
        <p className="text-white/60">Le compagnie funzionano solo con il backend online.</p>
      ) : account === undefined ? (
        <p className="text-white/45">Caricamento…</p>
      ) : !registered ? (
        <AccountRequired next="/compagnie" />
      ) : (
        <>
          <Button className="flex w-full items-center justify-center gap-2" onClick={() => setCreating(true)}>
            <Plus size={20} /> Crea una compagnia
          </Button>
          <JoinGroupByCode onCode={(code) => router.push(`/c/${code}`)} />

          {error && <p className="mt-6 text-sm text-red-300">{error}</p>}
          {list?.length === 0 && (
            <p className="mt-10 text-center text-white/45">
              Non sei ancora in nessuna compagnia.
              <br />
              Creane una o fatti dare il codice da un amico.
            </p>
          )}
          {list && list.length > 0 && (
            <ul className="mt-7 space-y-2">
              {list.map((g) => (
                <li key={g.id}>
                  <Link href={`/compagnie/${g.id}`} className="flex items-center gap-3 rounded-2xl bg-night-800 p-4 ring-1 ring-white/5 hover:bg-night-700">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-night-600 text-white/60">
                      <Users size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{g.name}</span>
                      <span className="flex items-center gap-1 text-xs text-white/45">
                        {g.memberCount} {g.memberCount === 1 ? "membro" : "membri"}
                        {g.myRole === "admin" && (
                          <>
                            {" · "}
                            <Crown size={12} className="text-gold-400" /> amministri tu
                          </>
                        )}
                      </span>
                    </span>
                    <ChevronRight size={18} className="text-white/30" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {creating && account?.username && (
        <CreateGroupSheet
          defaultMemberName={account.displayName || account.username}
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(`/compagnie/${id}`)}
        />
      )}
    </main>
  );
}

function JoinGroupByCode({ onCode }: { onCode: (code: string) => void }) {
  const [code, setCode] = useState("");
  const clean = normalizeGroupCode(code);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length === 6) onCode(clean);
      }}
      className="mt-3 flex items-center gap-2 rounded-2xl bg-night-800 p-2 pl-4 ring-1 ring-white/5"
    >
      <label htmlFor="group-code" className="shrink-0 text-sm text-white/60">
        Codice invito
      </label>
      <input
        id="group-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ABC234"
        maxLength={9}
        autoCapitalize="characters"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-xl bg-night-900 px-3 py-2 font-mono uppercase tracking-[0.25em] outline-none ring-1 ring-white/10 focus:ring-gold-400"
      />
      <Button type="submit" variant="secondary" className="px-4 py-2 text-sm" disabled={clean.length !== 6}>
        Entra
      </Button>
    </form>
  );
}

function CreateGroupSheet({ defaultMemberName, onClose, onCreated }: { defaultMemberName: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [me, setMe] = useState(defaultMemberName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} title="Nuova compagnia">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onCreated(await getGroups()!.create(name, me));
          } catch (err) {
            setError(messageOf(err));
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm text-white/60" htmlFor="group-name">
          Nome della compagnia
        </label>
        <input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Gli amici del venerdì" className={inputClass} />
        <label className="mt-4 block text-sm text-white/60" htmlFor="my-name">
          Il tuo nome nella compagnia
        </label>
        <input id="my-name" value={me} onChange={(e) => setMe(e.target.value)} maxLength={20} className={inputClass} />
        <p className="mt-1 text-xs text-white/40">È il nome che comparirà nelle partite. Gli altri entreranno con il codice invito.</p>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <Button type="submit" className="mt-5 w-full" disabled={busy || !name.trim() || !me.trim()}>
          Crea
        </Button>
      </form>
    </Sheet>
  );
}
