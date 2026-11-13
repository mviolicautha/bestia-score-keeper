"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Crown, Download, Trophy } from "lucide-react";
import { formatCents } from "@/engine";
import { getHistory, localGamesToImport, type HistoryEntry, type LocalGame } from "@/lib/history";
import { useAccount } from "@/lib/useAccount";
import { Button } from "@/components/Sheet";
import { AccountRequired, messageOf } from "@/components/groupUi";

/** Le partite terminate in cui ho giocato o che ho condotto, con il mio saldo. */
export default function HistoryPage() {
  const history = getHistory();
  const { account } = useAccount();
  const registered = !!account?.username;
  const [list, setList] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!history) return;
    try {
      setList(await history.myHistory());
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [history]);

  useEffect(() => {
    if (registered) void Promise.resolve().then(load);
  }, [registered, load]);

  const played = list?.filter((g) => g.myBalanceCents !== null) ?? [];
  const total = played.reduce((sum, g) => sum + (g.myBalanceCents ?? 0), 0);
  const won = played.filter((g) => (g.myBalanceCents ?? 0) > 0).length;

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/" className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/10">
        <ChevronLeft size={18} /> Partite
      </Link>
      <h1 className="mb-6 text-3xl font-black">Le mie partite</h1>

      {!history ? (
        <p className="text-white/60">Lo storico funziona solo con il backend online.</p>
      ) : account === undefined ? (
        <p className="text-white/45">Caricamento…</p>
      ) : !registered ? (
        <AccountRequired next="/storico" text="Lo storico è legato al tuo account: così ritrovi le tue partite da qualsiasi telefono." />
      ) : (
        <>
          <ImportLocal onDone={load} />

          {played.length > 0 && (
            <div className="mb-6 grid grid-cols-3 gap-2 text-center">
              <Stat label="Giocate" value={String(played.length)} />
              <Stat label="In attivo" value={String(won)} />
              <Stat label="Saldo totale" value={formatCents(total, { signed: true })} tone={total > 0 ? "gain" : total < 0 ? "loss" : undefined} />
            </div>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}
          {list?.length === 0 && (
            <p className="mt-10 text-center text-white/45">
              Nessuna partita terminata, per ora.
              <br />
              Qui finiscono quelle in cui giochi o che conduci tu.
            </p>
          )}
          {list && list.length > 0 && (
            <ul className="space-y-2">
              {list.map((g) => (
                <li key={g.gameId}>
                  <Link
                    href={g.isMaster ? `/partita/${g.gameId}` : `/gioca/${g.gameId}`}
                    className="flex items-center gap-3 rounded-2xl bg-night-800 p-3 pl-4 ring-1 ring-white/5 hover:bg-night-700"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <span className="truncate">{g.title}</span>
                        {g.isMaster && <Crown size={13} className="shrink-0 text-gold-400" aria-label="condotta da te" />}
                      </span>
                      <span className="block truncate text-xs text-white/45">
                        {new Date(g.endedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
                        {g.groupName ? ` · ${g.groupName}` : ""} · {g.playerCount} giocatori
                      </span>
                      {g.winnerName && (g.winnerBalanceCents ?? 0) > 0 && (
                        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-white/60">
                          <Trophy size={12} className="text-gold-400" /> {g.winnerName} {formatCents(g.winnerBalanceCents ?? 0, { signed: true })}
                        </span>
                      )}
                    </span>
                    {g.myBalanceCents !== null ? (
                      <span
                        className={`tabular text-right text-lg font-black ${g.myBalanceCents > 0 ? "text-gain" : g.myBalanceCents < 0 ? "text-loss" : "text-white/60"}`}
                        aria-label={`Il tuo saldo: ${formatCents(g.myBalanceCents, { signed: true })}`}
                      >
                        {formatCents(g.myBalanceCents, { signed: true })}
                      </span>
                    ) : (
                      <span className="text-xs text-white/40">condotta</span>
                    )}
                    <ChevronRight size={18} className="shrink-0 text-white/30" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div className="rounded-2xl bg-night-800 px-2 py-3 ring-1 ring-white/5">
      <p className={`tabular text-xl font-black ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-white/45">{label}</p>
    </div>
  );
}

/** Partite fatte su questo telefono prima del backend: si caricano nell'account. */
function ImportLocal({ onDone }: { onDone: () => Promise<void> }) {
  const [games, setGames] = useState<LocalGame[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => setGames(localGamesToImport()));
  }, []);

  if (games.length === 0 && !message) return null;

  async function importAll() {
    const history = getHistory();
    if (!history) return;
    setBusy(true);
    let done = 0;
    const errors: string[] = [];
    for (const g of games) {
      try {
        await history.importLocal(g);
        done++;
      } catch (e) {
        errors.push(messageOf(e));
      }
    }
    setGames(localGamesToImport());
    setMessage(errors.length ? `Importate ${done}. ${errors[0]}` : `Importate ${done} partite.`);
    setBusy(false);
    await onDone();
  }

  return (
    <div className="mb-6 rounded-2xl bg-blue-500/10 p-4 text-sm ring-1 ring-blue-400/30">
      {games.length > 0 ? (
        <>
          <p className="text-white/80">
            Su questo telefono {games.length === 1 ? "c'è 1 partita salvata" : `ci sono ${games.length} partite salvate`} solo in locale. Importale nel tuo
            account: le ritroverai qui e da qualsiasi dispositivo (ne sarai il master).
          </p>
          <Button className="mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-sm" disabled={busy} onClick={importAll}>
            <Download size={17} /> {busy ? "Importo…" : `Importa ${games.length === 1 ? "la partita" : `${games.length} partite`}`}
          </Button>
        </>
      ) : null}
      {message && <p className={`${games.length > 0 ? "mt-2" : ""} text-white/70`}>{message}</p>}
    </div>
  );
}
