"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, RotateCcw, Share2, Trophy } from "lucide-react";
import { colorIndex, formatCents, simplifyDebts, type GameState, type HistoryEntry } from "@/engine";
import { Button } from "./Sheet";
import { Avatar } from "./ui";
import { ReportSheet } from "./ReportSheet";

/** Schermata di fine partita: classifica, chi paga chi, record della serata. */
export function Results({
  state,
  history,
  times,
  title,
  onReopen,
  backHref,
}: {
  state: GameState;
  history: HistoryEntry[];
  /** Orari degli eventi, per data e durata nel resoconto. */
  times?: string[];
  title?: string;
  onReopen?: () => void;
  backHref?: string;
}) {
  const seat = (id: string) => colorIndex(state, id);
  const ranking = [...state.players].sort((a, b) => b.balanceCents - a.balanceCents);
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "?";
  const transfers = simplifyDebts(Object.fromEntries(state.players.map((p) => [p.id, p.balanceCents])));
  const mostBestie = [...state.players].sort((a, b) => b.stats.bestie - a.stats.bestie)[0];
  const mostTricks = [...state.players].sort((a, b) => b.stats.tricks - a.stats.tricks)[0];
  const winner = ranking[0];
  const [sharing, setSharing] = useState(false);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-gold-400">Partita terminata</p>
      <h1 className="mt-1 text-3xl font-black">{title ?? "Conti finali"}</h1>

      {winner && winner.balanceCents > 0 && (
        <div className="mt-5 flex items-center gap-4 rounded-3xl bg-gradient-to-br from-felt-600 to-felt-700 p-5 shadow-lg">
          <Trophy className="text-gold-400" size={36} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Vince la serata</p>
            <p className="text-2xl font-black">
              {winner.name} <span className="tabular text-gold-400">{formatCents(winner.balanceCents, { signed: true })}</span>
            </p>
          </div>
        </div>
      )}

      <ol className="mt-4 overflow-hidden rounded-2xl bg-night-800 ring-1 ring-white/5">
        {ranking.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0">
            <span className="tabular w-5 text-center text-sm font-bold text-white/40">{i + 1}</span>
            <Avatar name={p.name} seat={seat(p.id)} size="sm" />
            <span className="flex-1 truncate font-semibold">{p.name}</span>
            <span className={`tabular font-black ${p.balanceCents < 0 ? "text-loss" : p.balanceCents > 0 ? "text-gain" : "text-white/50"}`}>
              {formatCents(p.balanceCents, { signed: true })}
            </span>
          </li>
        ))}
      </ol>

      <h2 className="mb-2 mt-8 text-lg font-bold">Chi paga chi</h2>
      {transfers.length === 0 ? (
        <p className="text-white/50">Nessun pagamento: tutti in pari.</p>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t, i) => (
            <li key={i} className="flex items-center gap-2 rounded-2xl bg-night-800 px-3 py-2.5 ring-1 ring-white/5">
              <Avatar name={name(t.from)} seat={seat(t.from)} size="sm" />
              <span className="font-semibold">{name(t.from)}</span>
              <ArrowRight size={16} className="text-white/40" aria-label="paga a" />
              <Avatar name={name(t.to)} seat={seat(t.to)} size="sm" />
              <span className="min-w-0 flex-1 truncate font-semibold">{name(t.to)}</span>
              <span className="tabular font-black text-gold-400">{formatCents(t.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-white/40">
        Il minimo numero di pagamenti per chiudere i conti. Con gli account, questi debiti finiranno nel registro e si
        potranno segnare come saldati.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-bold">La serata</h2>
      <dl className="grid grid-cols-2 gap-2">
        <Tile label="Mani giocate" value={String(state.handsPlayed)} />
        <Tile label="Mani passate" value={String(state.handsPassed)} />
        <Tile label="Piatto più alto" value={formatCents(state.maxPotCents)} />
        <Tile label="Giocatori" value={String(state.players.length)} />
        {mostTricks && mostTricks.stats.tricks > 0 && (
          <Tile label="Più prese" value={`${mostTricks.name} (${mostTricks.stats.tricks})`} />
        )}
        {mostBestie && mostBestie.stats.bestie > 0 && (
          <Tile label="Più bestie" value={`${mostBestie.name} (${mostBestie.stats.bestie})`} />
        )}
      </dl>
      <p className="sr-only">{history.length} eventi registrati</p>

      <div className="mt-8 flex flex-col gap-2">
        <Button variant="success" className="flex items-center justify-center gap-2" onClick={() => setSharing(true)}>
          <Share2 size={18} /> Condividi il resoconto
        </Button>
        {backHref && (
          <Link href={backHref} className="rounded-2xl bg-blue-600 py-3.5 text-center font-bold">
            Torna alle partite
          </Link>
        )}
        {onReopen && (
          <Button variant="ghost" className="flex items-center justify-center gap-2" onClick={onReopen}>
            <RotateCcw size={18} /> Riapri la partita
          </Button>
        )}
      </div>
      {sharing && <ReportSheet state={state} history={history} times={times} title={title} onClose={() => setSharing(false)} />}
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse rounded-2xl bg-night-800 p-4 ring-1 ring-white/5">
      <dt className="text-xs text-white/50">{label}</dt>
      <dd className="tabular mb-1 truncate text-lg font-black">{value}</dd>
    </div>
  );
}
