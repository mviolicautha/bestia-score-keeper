"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { formatCents } from "@/engine";
import { careerOf, highlights, NICKNAMES, type CareerGame, type NightRef, type Rival } from "@/lib/stats";
import { getStats } from "@/lib/statsData";
import { useAccount } from "@/lib/useAccount";
import { AccountRequired, messageOf } from "@/components/groupUi";

const fmt = (cents: number, signed = false) => formatCents(cents, { signed });
const tone = (cents: number) => (cents > 0 ? "text-gain" : cents < 0 ? "text-loss" : "text-white/60");
const day = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

/** Statistiche dell'account, rivalità con gli amici e soprannomi raccolti. */
export default function StatsPage() {
  const stats = getStats();
  const { account } = useAccount();
  const registered = !!account?.username;
  const [games, setGames] = useState<CareerGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stats || !registered) return;
    let alive = true;
    stats.myGames().then(
      (g) => alive && setGames(g),
      (e) => alive && setError(messageOf(e)),
    );
    return () => {
      alive = false;
    };
  }, [stats, registered]);

  const career = useMemo(() => (games ? careerOf(games, fmt) : null), [games]);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/account" className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/10">
        <ChevronLeft size={18} /> Account
      </Link>
      <h1 className="mb-6 text-3xl font-black">Statistiche</h1>

      {!stats ? (
        <p className="text-white/60">Le statistiche funzionano solo con il backend online.</p>
      ) : account === undefined ? (
        <p className="text-white/45">Caricamento…</p>
      ) : !registered ? (
        <AccountRequired next="/statistiche" text="Le statistiche si calcolano dalle partite del tuo account." />
      ) : error ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : !career ? (
        <p className="text-white/45">Rigioco le tue partite…</p>
      ) : career.games === 0 ? (
        <p className="mt-10 text-center text-white/45">
          Ancora nessuna partita terminata.
          <br />
          Gioca una serata e qui compaiono numeri, rivali e soprannomi.
        </p>
      ) : (
        <Career career={career} />
      )}
    </main>
  );
}

function Career({ career: c }: { career: ReturnType<typeof careerOf> }) {
  const h = highlights(c.rivals);
  const streak =
    c.streak > 1 ? `${c.streak} serate in attivo di fila 🔥` : c.streak < -1 ? `${-c.streak} serate in passivo di fila 🥶` : null;

  return (
    <>
      {c.lastNickname && (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-felt-600 to-felt-700 p-5 shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Il tuo soprannome</p>
          <div className="mt-2 flex items-center gap-4">
            <span className="text-5xl leading-none" aria-hidden>
              {c.lastNickname.emoji}
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-black text-gold-400">{c.lastNickname.title}</p>
              <p className="text-sm text-white/75">{c.lastNickname.reason}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-white/50">Dall&apos;ultima serata ({day(c.lastNickname.endedAt)}): resta tuo fino alla prossima.</p>
        </section>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Serate" value={String(c.games)} />
        <Stat label="In attivo" value={pct(c.gamesWon, c.games)} />
        <Stat label="Saldo" value={fmt(c.totalCents, true)} className={tone(c.totalCents)} />
        <Stat label="Mani vinte" value={pct(c.handsWon, c.handsPresent)} />
        <Stat label="Bestie" value={String(c.bestie)} />
        <Stat label="A serata" value={fmt(Math.round(c.totalCents / c.games), true)} className={tone(c.totalCents)} />
      </div>
      {streak && <p className="mt-3 text-center text-sm font-semibold text-white/75">{streak}</p>}

      <Heading>Record</Heading>
      <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-night-800 ring-1 ring-white/5">
        {c.best && c.best.cents > 0 && <Record icon="🏆" label="Serata migliore" night={c.best} signed />}
        {c.worst && c.worst.cents < 0 && <Record icon="💸" label="Serata peggiore" night={c.worst} signed />}
        {c.richestPot && <Record icon="💰" label="Piatto più ricco vinto" night={c.richestPot} />}
        <li className="flex items-center gap-3 px-4 py-3">
          <span aria-hidden>📈</span>
          <span className="flex-1 font-semibold">Serate in attivo di fila</span>
          <span className="tabular font-black">{c.longestWinStreak}</span>
        </li>
        <li className="flex items-center gap-3 px-4 py-3">
          <span aria-hidden>🃏</span>
          <span className="flex-1 font-semibold">Mani vinte</span>
          <span className="tabular font-black">
            {c.handsWon} <span className="font-normal text-white/45">su {c.handsPresent}</span>
          </span>
        </li>
      </ul>

      {c.rivals.length > 0 && (
        <>
          <Heading>Rivalità</Heading>
          <div className="grid gap-2">
            {h.bancomat && <Highlight emoji="🏧" label="Il tuo bancomat" rival={h.bancomat} note="ti ha dato più soldi di tutti" />}
            {h.nemesi && <Highlight emoji="😈" label="La tua bestia nera" rival={h.nemesi} note="gli hai dato più soldi di tutti" />}
            {h.rivale && (
              <Highlight emoji="⚔️" label="Il tuo rivale" rival={h.rivale} note={`${h.rivale.ahead}–${h.rivale.behind} nelle serate insieme`} />
            )}
          </div>

          <Heading>Testa a testa</Heading>
          <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-night-800 ring-1 ring-white/5">
            {c.rivals.map((r) => (
              <li key={r.key} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-night-600 font-bold text-white/75 ring-1 ring-white/10" aria-hidden>
                  {r.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">contro {r.name}</span>
                  <span className="block text-xs text-white/45">
                    {r.together} {r.together === 1 ? "serata" : "serate"} · davanti {r.ahead}, dietro {r.behind}
                  </span>
                </span>
                <span className={`tabular font-black ${tone(r.netCents)}`}>{fmt(r.netCents, true)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-white/40">
            In ogni serata chi perde paga chi vince, in proporzione a quanto ha vinto ognuno: il numero è la somma di quello che vi siete passati.
          </p>
        </>
      )}

      {c.nicknameCounts.length > 0 && (
        <>
          <Heading>Soprannomi raccolti</Heading>
          <ul className="flex flex-wrap gap-2">
            {c.nicknameCounts.map((n) => (
              <li key={n.id} className="flex items-center gap-1.5 rounded-full bg-night-800 py-1.5 pl-2.5 pr-3 text-sm ring-1 ring-white/5" title={NICKNAMES[n.id].hint}>
                <span aria-hidden>{NICKNAMES[n.id].emoji}</span>
                <span className="font-semibold">{NICKNAMES[n.id].title}</span>
                {n.count > 1 && <span className="tabular text-white/45">×{n.count}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-widest text-white/40">{children}</h2>;
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl bg-night-800 px-2 py-3 ring-1 ring-white/5">
      <p className={`tabular truncate text-lg font-black ${className}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-white/45">{label}</p>
    </div>
  );
}

function Record({ icon, label, night, signed = false }: { icon: string; label: string; night: NightRef; signed?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="block truncate text-xs text-white/45">
          {night.title} · {day(night.endedAt)}
        </span>
      </span>
      <span className={`tabular font-black ${signed ? tone(night.cents) : "text-gold-400"}`}>{fmt(night.cents, signed)}</span>
    </li>
  );
}

function Highlight({ emoji, label, rival, note }: { emoji: string; label: string; rival: Rival; note: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-night-800 p-3 pl-4 ring-1 ring-white/5">
      <span className="text-3xl leading-none" aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</span>
        <span className="block truncate text-lg font-black">{rival.name}</span>
        <span className="block truncate text-xs text-white/50">{note}</span>
      </span>
      <span className={`tabular text-lg font-black ${tone(rival.netCents)}`}>{fmt(rival.netCents, true)}</span>
    </div>
  );
}
