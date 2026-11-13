"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Crown, KeyRound, LogOut, Pencil, Plus, QrCode, RefreshCw, Trash2, Unlink, UserPlus } from "lucide-react";
import { getGroups, type GroupDetail, type GroupGame, type GroupMember } from "@/lib/groups";
import { getHistory, type PlayerResult } from "@/lib/history";
import { formatCents } from "@/engine";
import { useAccount } from "@/lib/useAccount";
import { Button, Sheet } from "@/components/Sheet";
import { InviteSheet } from "@/components/InviteSheet";
import { ConfirmDialog, Toast, type ConfirmRequest, type ToastMessage } from "@/components/ui";
import { AccountRequired, inputClass, MemberFace, messageOf } from "@/components/groupUi";

/** Una compagnia: membri, invito e (per gli amministratori) la gestione. */
export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const groups = getGroups();
  const { account } = useAccount();
  const registered = !!account?.username;
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined);
  const [games, setGames] = useState<GroupGame[] | null>(null);
  const [results, setResults] = useState<Record<string, PlayerResult[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [inviting, setInviting] = useState(false);
  const [selected, setSelected] = useState<GroupMember | null>(null);
  const [naming, setNaming] = useState<null | { title: string; label: string; initial: string; maxLength: number; save: (v: string) => Promise<unknown> }>(null);

  const show = (text: string, kind: ToastMessage["kind"] = "success") => setToast({ text, kind, id: Date.now() });

  const load = useCallback(async () => {
    if (!groups) return;
    try {
      const [detail, list] = await Promise.all([groups.get(id), groups.listGames(id).catch(() => null)]);
      setGroup(detail);
      setGames(list);
      const ended = (list ?? []).filter((x) => x.status === "ended").map((x) => x.id);
      setResults((await getHistory()?.resultsOf(ended).catch(() => ({}))) ?? {});
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [groups, id]);

  useEffect(() => {
    if (!groups || !registered) return;
    void Promise.resolve().then(load);
    return groups.subscribe(id, () => void load());
  }, [groups, registered, id, load]);

  /** Esegue un'azione, ricarica e mostra l'esito. */
  const run = (action: () => Promise<unknown>, done?: string) => async () => {
    try {
      await action();
      await load();
      if (done) show(done);
    } catch (e) {
      show(messageOf(e), "error");
    }
  };

  if (!groups) return <Shell>Le compagnie funzionano solo con il backend online.</Shell>;
  if (account === undefined) return <Shell>Caricamento…</Shell>;
  if (!registered)
    return (
      <Shell>
        <AccountRequired next={`/compagnie/${id}`} />
      </Shell>
    );
  if (group === undefined) return <Shell>{error ?? "Caricamento…"}</Shell>;
  if (group === null)
    return (
      <Shell>
        <p>Questa compagnia non esiste o non ne fai parte.</p>
      </Shell>
    );

  const g = group;
  const accounts = g.members.filter((m) => m.profileId).length;

  return (
    <Shell>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-3xl font-black">{g.name}</h1>
          <p className="mt-1 text-sm text-white/50">
            {g.members.length} {g.members.length === 1 ? "membro" : "membri"} · {accounts} con account
          </p>
        </div>
        {g.isAdmin && (
          <button
            onClick={() =>
              setNaming({ title: "Nome della compagnia", label: "Nome", initial: g.name, maxLength: 40, save: (v) => groups.rename(g.id, v) })
            }
            className="rounded-full p-2 text-white/50 hover:bg-white/10"
            aria-label="Rinomina la compagnia"
          >
            <Pencil size={18} />
          </button>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        <Button className="flex flex-1 items-center justify-center gap-2" onClick={() => router.push(`/?compagnia=${g.id}`)}>
          <Plus size={20} /> Nuova partita
        </Button>
        <Button variant="secondary" className="flex flex-1 items-center justify-center gap-2" onClick={() => setInviting(true)}>
          <QrCode size={20} /> Invita
        </Button>
      </div>

      {games && games.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Partite</h2>
          <ul className="space-y-2">
            {games.map((game) => (
              <li key={game.id}>
                <Link
                  href={game.masterId === account?.userId ? `/partita/${game.id}` : `/gioca/${game.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-night-800 p-3 pl-4 ring-1 ring-white/5 hover:bg-night-700"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{game.title}</span>
                    <span className="block text-xs text-white/45">
                      {game.status === "ended" ? "Terminata" : "In corso"}
                      {" · "}
                      {new Date(game.updatedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                      {game.masterId === account?.userId && " · la conduci tu"}
                    </span>
                    {results[game.id]?.[0] && results[game.id][0].balanceCents > 0 && (
                      <span className="block truncate text-xs text-white/60">
                        Ha vinto <strong className="text-white">{results[game.id][0].name}</strong>{" "}
                        <span className="tabular font-bold text-gain">{formatCents(results[game.id][0].balanceCents, { signed: true })}</span>
                      </span>
                    )}
                  </span>
                  {game.status !== "ended" && <span className="size-2 shrink-0 rounded-full bg-gain" aria-label="in corso" />}
                  <ChevronRight size={18} className="shrink-0 text-white/30" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-7">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Membri</h2>
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-night-800 ring-1 ring-white/5">
          {g.members.map((m) => (
            <li key={m.id}>
              <button onClick={() => setSelected(m)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/5" aria-label={`${m.name}: dettagli`}>
                <MemberFace name={m.name} character={m.character} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span className="truncate">{m.name}</span>
                    {m.isMe && <span className="rounded-full bg-blue-500/20 px-1.5 text-[11px] font-bold text-blue-200">tu</span>}
                    {m.role === "admin" && <Crown size={14} className="shrink-0 text-gold-400" aria-label="amministratore" />}
                  </span>
                  <span className="block truncate text-xs text-white/45">{m.username ? `@${m.username}` : "ospite, senza account"}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-white/25" />
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          className="mt-3 flex w-full items-center justify-center gap-2 text-sm"
          onClick={() =>
            setNaming({
              title: "Aggiungi un ospite",
              label: "Nome",
              initial: "",
              maxLength: 20,
              save: async (v) => {
                await groups.addMember(g.id, v);
                show(`${v.trim()} aggiunto`);
              },
            })
          }
        >
          <UserPlus size={18} /> Aggiungi un ospite
        </Button>
        <p className="mt-2 text-xs text-white/40">
          Gli ospiti non hanno l&apos;account. Se un giorno si registrano, entrando col codice scelgono il loro nome e ritrovano le partite.
        </p>
      </section>

      {g.isAdmin && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">Amministrazione</h2>
          <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-night-800 ring-1 ring-white/5">
            <li>
              <button
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5"
                onClick={() =>
                  setConfirm({
                    title: "Cambiare il codice invito?",
                    message: `Il codice ${g.inviteCode} e il suo QR smetteranno di funzionare. Chi è già nella compagnia resta.`,
                    confirmLabel: "Cambia codice",
                    onConfirm: run(() => groups.regenerateCode(g.id), "Nuovo codice pronto"),
                  })
                }
              >
                <RefreshCw size={18} className="text-white/50" />
                <span className="flex-1 font-semibold">Nuovo codice invito</span>
                <span className="font-mono text-sm tracking-widest text-white/45">{g.inviteCode}</span>
              </button>
            </li>
          </ul>
        </section>
      )}

      <button
        onClick={() =>
          setConfirm({
            title: "Uscire dalla compagnia?",
            message: "Il tuo nome resta nella compagnia come ospite, con le sue partite. Potrai rientrare con il codice invito e riprenderlo.",
            confirmLabel: "Esci",
            danger: true,
            onConfirm: async () => {
              try {
                await groups.leave(g.id);
                router.push("/compagnie");
              } catch (e) {
                show(messageOf(e), "error");
              }
            },
          })
        }
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-red-300/80 hover:bg-red-500/10"
      >
        <LogOut size={16} /> Esci dalla compagnia
      </button>

      {inviting && (
        <InviteSheet
          code={g.inviteCode}
          title={g.name}
          path="/c/"
          heading="Invita nella compagnia"
          intro="Chi inquadra il QR (o apre il link) entra nella compagnia: se ha già giocato con voi sceglie il suo nome, altrimenti entra come nuovo. Serve un account."
          shareText={`Entra nella compagnia "${g.name}" su Bestia (codice ${g.inviteCode})`}
          onClose={() => setInviting(false)}
        />
      )}

      {selected && (
        <MemberSheet
          member={g.members.find((m) => m.id === selected.id) ?? selected}
          isAdmin={g.isAdmin}
          onClose={() => setSelected(null)}
          onRename={(m) =>
            setNaming({
              title: m.isMe ? "Il tuo nome nella compagnia" : `Rinomina ${m.name}`,
              label: "Nome",
              initial: m.name,
              maxLength: 20,
              save: (v) => groups.renameMember(m.id, v),
            })
          }
          onRole={(m, role) => {
            setSelected(null);
            void run(() => groups.setRole(m.id, role), role === "admin" ? `${m.name} ora è amministratore` : `${m.name} non è più amministratore`)();
          }}
          onUnlink={(m) =>
            setConfirm({
              title: `Scollegare l'account di ${m.name}?`,
              message: `${m.name} resta nella compagnia come ospite, con le sue partite; l'account @${m.username} non ne fa più parte. Utile se qualcuno ha scelto il nome sbagliato.`,
              confirmLabel: "Scollega",
              danger: true,
              onConfirm: () => {
                setSelected(null);
                void run(() => groups.unlinkMember(m.id), "Account scollegato")();
              },
            })
          }
          onRemove={(m) =>
            setConfirm({
              title: `Togliere ${m.name} dalla compagnia?`,
              message: m.profileId ? `Anche l'account @${m.username} non ne farà più parte.` : "Non si può annullare.",
              confirmLabel: "Togli",
              danger: true,
              onConfirm: () => {
                setSelected(null);
                void run(() => groups.removeMember(m.id), `${m.name} tolto dalla compagnia`)();
              },
            })
          }
        />
      )}

      {naming && (
        <NameSheet
          {...naming}
          onClose={() => setNaming(null)}
          onSave={async (v) => {
            await naming.save(v);
            await load();
          }}
        />
      )}
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/compagnie" className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/10">
        <ChevronLeft size={18} /> Compagnie
      </Link>
      {typeof children === "string" ? <p className="text-white/50">{children}</p> : children}
    </main>
  );
}

/** Dettagli di un membro e le azioni permesse a chi guarda. */
function MemberSheet({
  member: m,
  isAdmin,
  onClose,
  onRename,
  onRole,
  onUnlink,
  onRemove,
}: {
  member: GroupMember;
  isAdmin: boolean;
  onClose: () => void;
  onRename: (m: GroupMember) => void;
  onRole: (m: GroupMember, role: "admin" | "member") => void;
  onUnlink: (m: GroupMember) => void;
  onRemove: (m: GroupMember) => void;
}) {
  const canRename = isAdmin || m.isMe;
  const others = isAdmin && !m.isMe;
  return (
    <Sheet open onClose={onClose} title={m.name}>
      <div className="flex items-center gap-3">
        <MemberFace name={m.name} character={m.character} size="lg" />
        <div className="text-sm text-white/60">
          <p>{m.username ? `Account @${m.username}` : "Ospite, senza account"}</p>
          <p>{m.role === "admin" ? "Amministratore" : "Membro"}</p>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        {canRename && (
          <Action icon={<Pencil size={18} />} label={m.isMe ? "Cambia il tuo nome" : "Rinomina"} onClick={() => onRename(m)} />
        )}
        {others && m.profileId && m.role === "member" && (
          <Action icon={<Crown size={18} />} label="Rendi amministratore" onClick={() => onRole(m, "admin")} />
        )}
        {isAdmin && m.role === "admin" && (
          <Action icon={<KeyRound size={18} />} label={m.isMe ? "Smetti di essere amministratore" : "Togli da amministratore"} onClick={() => onRole(m, "member")} />
        )}
        {others && m.profileId && <Action icon={<Unlink size={18} />} label="Scollega account" danger onClick={() => onUnlink(m)} />}
        {others && <Action icon={<Trash2 size={18} />} label="Togli dalla compagnia" danger onClick={() => onRemove(m)} />}
        {!canRename && !others && <p className="text-sm text-white/45">Solo gli amministratori possono modificare gli altri membri.</p>}
      </div>
    </Sheet>
  );
}

function Action({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl bg-night-700 px-4 py-3 text-left font-semibold hover:bg-night-600 ${danger ? "text-red-300" : ""}`}
    >
      {icon}
      {label}
    </button>
  );
}

function NameSheet({
  title,
  label,
  initial,
  maxLength,
  onClose,
  onSave,
}: {
  title: string;
  label: string;
  initial: string;
  maxLength: number;
  onClose: () => void;
  onSave: (v: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open onClose={onClose} title={title}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(value);
            onClose();
          } catch (err) {
            setError(messageOf(err));
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm text-white/60" htmlFor="name-field">
          {label}
        </label>
        <input id="name-field" value={value} onChange={(e) => setValue(e.target.value)} maxLength={maxLength} autoFocus className={inputClass} />
        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        <Button type="submit" className="mt-5 w-full" disabled={busy || !value.trim()}>
          Salva
        </Button>
      </form>
    </Sheet>
  );
}
