"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Sparkles } from "lucide-react";
import { GROUPS } from "@/lib/achievements";
import { getGroups, type GroupMember } from "@/lib/groups";
import { getShowcase, rarityLabel, type Showcase } from "@/lib/showcase";
import { useAccount } from "@/lib/useAccount";
import { AccountRequired, MemberFace, messageOf } from "@/components/groupUi";

/** Vetrina degli obiettivi di un membro: i più rari in alto, con quanti nella compagnia li hanno. */
export default function ShowcasePage() {
  const { id, member } = useParams<{ id: string; member: string }>();
  const { account } = useAccount();
  const registered = !!account?.username;
  const [data, setData] = useState<{ showcase: Showcase; member: GroupMember | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const svc = getShowcase();
    if (!svc) return setError("La vetrina funziona solo con il backend online.");
    try {
      const [showcase, group] = await Promise.all([svc.ofMember(member), getGroups()?.get(id).catch(() => null) ?? null]);
      setData({ showcase, member: group?.members.find((m) => m.id === member) ?? null });
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [id, member]);

  useEffect(() => {
    if (registered) void Promise.resolve().then(load);
  }, [registered, load]);
  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href={`/compagnie/${id}`} className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/10">
        <ChevronLeft size={18} /> Compagnia
      </Link>
      {account !== undefined && !registered ? (
        <AccountRequired next={`/compagnie/${id}/vetrina/${member}`} />
      ) : error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : !data ? (
        <p className="text-white/45">Caricamento…</p>
      ) : (
        <Board showcase={data.showcase} member={data.member} />
      )}
    </main>
  );
}

function Board({ showcase: s, member }: { showcase: Showcase; member: GroupMember | null }) {
  const isMe = !!member?.isMe;
  const top = s.achievements.slice(0, 3);
  const label = (owners: number) => rarityLabel(owners, s.members, s.name, isMe);

  return (
    <>
      <header className="flex items-center gap-4">
        <MemberFace name={s.name} character={member?.character ?? null} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-black">{s.name}</h1>
          <p className="text-sm text-white/50">{member?.username ? `@${member.username}` : s.hasAccount ? "" : "Ospite, senza account"}</p>
        </div>
      </header>

      {!s.hasAccount ? (
        <p className="mt-6 rounded-2xl bg-night-800 p-4 text-sm text-white/60 ring-1 ring-white/5">Gli obiettivi si collezionano con un account: gli ospiti non hanno la vetrina.</p>
      ) : (
        <>
          <div className="mt-5">
            <p className="flex items-baseline justify-between text-sm">
              <span className="font-bold">Obiettivi</span>
              <span className="tabular text-white/55">
                <strong className="text-white">{s.achievements.length}</strong> / {s.total}
              </span>
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-night-800">
              <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400" style={{ width: `${(s.achievements.length / Math.max(1, s.total)) * 100}%` }} />
            </div>
          </div>

          {s.achievements.length === 0 ? (
            <p className="mt-8 text-center text-white/50">{isMe ? "Ancora nessun obiettivo: si comincia giocando!" : "Ancora nessun obiettivo."}</p>
          ) : (
            <>
              <h2 className="mb-3 mt-8 flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.2em] text-gold-400">
                <Sparkles size={15} /> I più rari
              </h2>
              <ul className={`grid gap-2.5 ${top.length === 3 ? "grid-cols-3" : top.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {top.map(({ achievement: a, owners }) => (
                  <li
                    key={a.id}
                    className={`flex flex-col items-center rounded-3xl bg-night-800 px-2 py-4 text-center ring-1 ${owners === 1 ? "ring-gold-400/70 shadow-[0_0_26px_-8px_rgba(255,213,74,0.7)]" : "ring-white/10"}`}
                  >
                    <span className="text-4xl" aria-hidden>
                      {a.emoji}
                    </span>
                    <p className="mt-2 text-sm font-black leading-tight">{a.title}</p>
                    <p className={`mt-1 text-[11px] font-bold ${owners === 1 ? "text-gold-400" : "text-white/45"}`}>{label(owners)}</p>
                  </li>
                ))}
              </ul>

              {GROUPS.map((g) => {
                const list = s.achievements.filter((x) => x.achievement.group === g.id);
                if (list.length === 0) return null;
                return (
                  <section key={g.id} aria-label={g.title} className="mt-8">
                    <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/45">{g.title}</h2>
                    <ul className="space-y-2">
                      {list.map(({ achievement: a, owners }) => (
                        <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-night-800 p-3 ring-1 ring-white/5">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-night-950/50 text-xl" aria-hidden>
                            {a.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold leading-tight">{a.title}</p>
                            <p className="text-xs text-white/50">{a.description}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${owners === 1 ? "bg-gold-400/20 text-gold-400" : "bg-white/5 text-white/50"}`}
                          >
                            {label(owners)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
        </>
      )}
    </>
  );
}
