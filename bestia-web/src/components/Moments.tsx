"use client";

import { useEffect, useState } from "react";
import type { GameState, HistoryEntry } from "@/engine";
import { momentAt, type Moment, type Share } from "@/lib/moments";
import { money } from "@/lib/report";
import { play } from "@/lib/sounds";

const DURATION = { bestia: 3800, win: 3200, big: 4800, pass: 2200 } as const;
const length = (m: Moment) => (m.kind === "win" && m.big ? DURATION.big : DURATION[m.kind]);

/**
 * Sulla TV: quando arriva una nuova mano mostra per qualche secondo il momento a tutto schermo
 * (bestia, vincita, piatto d'oro, mano passata) e, se attivi, suona. Non festeggia le mani già
 * giocate all'apertura della pagina, né gli annullamenti.
 */
export function Moments({ state, history, sound }: { state: GameState; history: HistoryEntry[]; sound: boolean }) {
  const [seen, setSeen] = useState(history.length);
  const [moment, setMoment] = useState<Moment | null>(null);
  // stato aggiornato durante il rendering (non in un effetto): una nuova mano accende il momento
  if (history.length !== seen) {
    setSeen(history.length);
    setMoment(history.length > seen ? momentAt(history, history.length - 1, state) : null);
  }

  useEffect(() => {
    if (!moment) return;
    if (sound) play(moment.kind === "win" ? (moment.big ? "big" : "win") : moment.kind);
    const t = setTimeout(() => setMoment(null), length(moment));
    return () => clearTimeout(t);
    // un momento suona una volta sola: `sound` letto quando arriva
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment]);

  if (!moment) return null;
  const ms = length(moment);
  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-live="assertive" role="status">
      {moment.kind === "pass" ? (
        <div key={moment.key} className="absolute inset-x-0 top-[6vh] flex justify-center">
          <p className="animate-moment-life rounded-full bg-night-800/95 px-[1.4em] py-[0.5em] text-[1.4em] font-bold shadow-2xl ring-1 ring-white/10" style={{ animationDuration: `${ms}ms` }}>
            🂠 Mano passata{moment.dealer ? ` · carte a ${moment.dealer}` : ""}
          </p>
        </div>
      ) : (
        <div key={moment.key} className="animate-moment-life absolute inset-0 grid place-items-center" style={{ animationDuration: `${ms}ms` }}>
          <div
            className={`absolute inset-0 ${
              moment.kind === "bestia"
                ? "bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.55),rgba(13,18,32,0.9)_70%)]"
                : "bg-[radial-gradient(circle_at_center,rgba(255,213,74,0.35),rgba(13,18,32,0.88)_70%)]"
            }`}
          />
          {moment.kind === "win" && moment.big && <CoinRain />}
          <div className="animate-moment-pop relative px-[4vw] text-center">
            {moment.kind === "bestia" ? <Bestia losers={moment.losers} winners={moment.winners} /> : <Win winners={moment.winners} pot={moment.potCents} big={moment.big} />}
          </div>
        </div>
      )}
    </div>
  );
}

const names = (list: Share[]) => {
  const n = list.map((s) => s.name);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} e ${n.at(-1)}`;
};

function Bestia({ losers, winners }: { losers: Share[]; winners: Share[] }) {
  const each = losers[0] ? -losers[0].cents : 0;
  const same = losers.every((l) => l.cents === losers[0].cents);
  return (
    <>
      <p className="text-[7em] leading-none motion-safe:animate-moment-shake" aria-hidden>
        🐗
      </p>
      <p className="mt-[0.1em] text-[5.5em] font-black leading-none tracking-tight text-loss drop-shadow-[0_0.08em_0_rgba(0,0,0,0.5)]">BESTIA!</p>
      <p className="mt-[0.4em] text-[2.2em] font-black">
        {names(losers)} {losers.length > 1 ? "pagano" : "paga"}{" "}
        {same ? <span className="tabular text-loss">{money(each)}</span> : "il piatto"}
        {losers.length > 1 && same ? " a testa" : ""}
      </p>
      {winners.length > 0 && (
        <p className="mt-[0.4em] text-[1.4em] font-semibold text-white/75">
          Vince {names(winners)}{" "}
          {winners.length === 1 && <span className="tabular font-black text-gain">{money(winners[0].cents, true)}</span>}
        </p>
      )}
    </>
  );
}

function Win({ winners, pot, big }: { winners: Share[]; pot: number; big: boolean }) {
  return (
    <>
      {big && <p className="text-[2.4em] font-black uppercase tracking-[0.25em] text-gold-400 motion-safe:animate-pulse">🔥 Piatto d&apos;oro 🔥</p>}
      <p className="text-[6em] leading-none" aria-hidden>
        🏆
      </p>
      <p className="mt-[0.15em] text-[4.5em] font-black leading-none tracking-tight drop-shadow-[0_0.08em_0_rgba(0,0,0,0.5)]">{names(winners)}</p>
      <p className="tabular mt-[0.25em] text-[3.4em] font-black leading-none text-gold-400">
        {winners.length === 1 ? money(winners[0].cents, true) : `si dividono ${money(pot)}`}
      </p>
    </>
  );
}

/** Pioggia di monete per il piatto d'oro (posizioni fisse: niente casualità nel rendering). */
function CoinRain() {
  return (
    <div className="absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className="animate-coin-fall absolute top-[-10%] text-[3em]"
          style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 173) % 1400}ms`, animationDuration: `${1600 + ((i * 97) % 900)}ms` }}
        >
          🪙
        </span>
      ))}
    </div>
  );
}
