"use client";

import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { formatCents, simplifyDebts, type HistoryEntry, type PlayerId } from "@/engine";
import { useGame } from "@/lib/useGame";
import { HistoryList } from "@/components/HistoryList";

/** Vista da proiettare: sola lettura, si aggiorna da sola. */
export default function TvPage() {
  const { id } = useParams<{ id: string }>();
  const game = useGame(id);

  if (game.loading) return <Full>Caricamento…</Full>;
  if (!game.state) return <Full>Partita non trovata su questo dispositivo.</Full>;

  const state = game.state;
  const ended = state.status === "ended";
  const ranking = [...state.players].sort((a, b) => b.balanceCents - a.balanceCents);
  const last = game.history.at(-1);
  const name = (pid: PlayerId) => state.players.find((p) => p.id === pid)?.name ?? "?";
  const dealer = state.dealerId ? name(state.dealerId) : "—";

  return (
    <div className="flex h-dvh flex-col gap-[2vh] overflow-hidden bg-night-950 p-[3vh] text-[clamp(14px,1.6vw,40px)]">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[0.75em] font-semibold uppercase tracking-[0.3em] text-gold-400">♠ Bestia · live</p>
          <p className="text-[1.1em] text-white/60">
            {ended ? "Partita terminata" : `Fa le carte ${dealer}`} · {state.handsPlayed} mani giocate
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.7em] font-semibold uppercase tracking-[0.3em] text-white/40">Piatto</p>
          <p className="tabular text-[3.2em] font-black leading-none text-gold-400">{formatCents(state.potCents)}</p>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_1fr] gap-[2vh] landscape:grid-cols-[1.5fr_1fr] landscape:grid-rows-1 landscape:gap-[2vw]">
        <section className="min-h-0 overflow-hidden rounded-[1.2em] bg-night-800 ring-1 ring-white/5">
          <ol>
            {ranking.map((p, i) => {
              const delta = last?.outcome.deltas[p.id] ?? 0;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-[1em] border-b border-white/5 px-[1em] py-[0.55em] last:border-0 ${p.active ? "" : "opacity-45"}`}
                >
                  <span className="tabular w-[1.6em] text-center font-black text-white/40">{i + 1}</span>
                  <span className="flex min-w-[4em] flex-1 items-center gap-[0.5em] text-[1.25em] font-bold">
                    <span className="truncate">{p.name}</span>
                    {p.id === state.dealerId && !ended && (
                      <span className="rounded-full bg-gold-400 px-[0.4em] text-[0.6em] font-black text-black">D</span>
                    )}
                  </span>
                  <Sparkline history={game.history} playerId={p.id} />
                  <span className="tabular w-[5.5em] text-right text-[0.8em] font-bold text-white/60">
                    {delta !== 0 ? formatCents(delta, { signed: true }) : ""}
                  </span>
                  <span
                    className={`tabular w-[5.2em] text-right text-[1.4em] font-black ${
                      p.balanceCents < 0 ? "text-loss" : p.balanceCents > 0 ? "text-gain" : "text-white/60"
                    }`}
                  >
                    {formatCents(p.balanceCents, { signed: true })}
                  </span>
                </li>
              );
            })}
          </ol>
          {ranking.length === 0 && <p className="p-[2em] text-center text-white/40">In attesa dei giocatori…</p>}
        </section>

        <section className="min-h-0 overflow-hidden rounded-[1.2em] bg-night-800 p-[1em] ring-1 ring-white/5">
          {ended ? (
            <>
              <h2 className="mb-[0.6em] text-[1.2em] font-bold">Chi paga chi</h2>
              <ul className="space-y-[0.5em]">
                {simplifyDebts(Object.fromEntries(state.players.map((p) => [p.id, p.balanceCents]))).map((t, i) => (
                  <li key={i} className="flex items-center gap-[0.5em]">
                    <span className="font-semibold">{name(t.from)}</span>
                    <ArrowRight className="h-[1em] w-[1em] text-white/40" />
                    <span className="flex-1 font-semibold">{name(t.to)}</span>
                    <span className="tabular font-black text-gold-400">{formatCents(t.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h2 className="mb-[0.3em] text-[1.2em] font-bold">Ultime mani</h2>
              <div className="text-[0.8em]">
                <HistoryList state={state} history={game.history} times={game.events.map((e) => e.at)} limit={6} large />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Full({ children }: { children: React.ReactNode }) {
  return <div className="grid h-dvh place-items-center bg-night-950 text-2xl text-white/50">{children}</div>;
}

/** Andamento del saldo di un giocatore nella serata (una sola serie, linea neutra; lo zero è tratteggiato). */
function Sparkline({ history, playerId }: { history: HistoryEntry[]; playerId: PlayerId }) {
  const values = history.filter((h) => playerId in h.balances).map((h) => h.balances[playerId]);
  const W = 160;
  const H = 40;
  if (values.length < 2) return <svg width="7em" height="1.8em" aria-hidden />;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (W - 6) + 3;
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastV = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="7em" height="1.8em" role="img" aria-label="Andamento del saldo nella serata">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 4" strokeWidth="1" />
      <polyline points={points} fill="none" stroke="rgba(232,236,245,0.75)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(lastV)} r="4" fill={lastV < 0 ? "var(--color-loss)" : "var(--color-gain)"} stroke="var(--color-night-800)" strokeWidth="2" />
    </svg>
  );
}
