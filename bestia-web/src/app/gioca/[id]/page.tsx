"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Coins, Flame, LogOut, Shirt, Trophy } from "lucide-react";
import { formatCents, simplifyDebts, type GameState, type HistoryEntry, type PlayerId, type PlayerState } from "@/engine";
import { useGame } from "@/lib/useGame";
import { getOnline } from "@/lib/online";
import { useOnline, useRemoteCharacters } from "@/lib/useOnline";
import { getCharacter } from "@/lib/avatar/store";
import { CharacterOverrides, useCharacterFor } from "@/lib/avatar/overrides";
import { Character, CROPS } from "@/components/Character";
import { CharacterEditor } from "@/components/CharacterEditor";
import { HistoryList } from "@/components/HistoryList";
import { Table } from "@/components/Table";
import { SEAT_COLORS } from "@/components/ui";

/** La partita vista dal telefono di un giocatore: sola lettura, con le sue informazioni in evidenza. */
export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const game = useGame(id);
  const info = useOnline(id);
  const overrides = useRemoteCharacters(game.state, info?.seats);
  const [editing, setEditing] = useState(false);

  if (!getOnline()) return <Centered>Per seguire la partita dal telefono l&apos;app deve essere online.</Centered>;
  if (game.loading || !info) return <Centered>Carico la partita…</Centered>;
  if (!game.state) return <Centered>Partita non trovata.</Centered>;

  const state = game.state;
  const me = info.mySeat ? state.players.find((p) => p.id === info.mySeat) : undefined;
  if (!me) {
    return (
      <Centered>
        <div>
          <p className="text-lg font-bold text-white">Non hai ancora preso un posto in questa partita</p>
          {info.game && (
            <Link href={`/g/${info.game.code}`} className="mt-5 inline-block rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white">
              Scegli chi sei
            </Link>
          )}
        </div>
      </Centered>
    );
  }

  return (
    <CharacterOverrides value={overrides}>
      <PlayerView
        state={state}
        history={game.history}
        times={game.events.map((e) => e.at)}
        me={me}
        title={info.game?.title ?? "Partita"}
        onEditCharacter={() => setEditing(true)}
        onLeaveSeat={async () => {
          try {
            await getOnline()?.releaseSeat(id, me.id);
            await info.reload();
          } catch {
            /* senza rete non cambia nulla: si può riprovare */
          }
        }}
      />
      {editing && (
        <CharacterEditor
          name={me.name}
          onClose={() => setEditing(false)}
          // salvato anche nel profilo: lo vedono master, TV e gli altri telefoni
          onSaved={() =>
            void getOnline()
              ?.saveProfile({ character: getCharacter(me.name) })
              .catch(() => {
                /* senza rete resta salvato su questo telefono; si sincronizza al prossimo salvataggio */
              })
          }
        />
      )}
    </CharacterOverrides>
  );
}

function PlayerView({
  state,
  history,
  times,
  me,
  title,
  onEditCharacter,
  onLeaveSeat,
}: {
  state: GameState;
  history: HistoryEntry[];
  times: string[];
  me: PlayerState;
  title: string;
  onEditCharacter: () => void;
  onLeaveSeat: () => void;
}) {
  const character = useCharacterFor(me.name);
  const ended = state.status === "ended";
  const ranking = [...state.players].sort((a, b) => b.balanceCents - a.balanceCents);
  const rank = ranking.findIndex((p) => p.id === me.id) + 1;
  const name = (pid: PlayerId) => state.players.find((p) => p.id === pid)?.name ?? "?";
  const last = history.at(-1);
  // Esito della mia ultima mano, senza la messa che metto se divento io il nuovo mazziere
  // (nel motore le due cose avvengono nello stesso evento).
  const lastDelta =
    last?.event.type === "hand_played"
      ? (last.outcome.deltas[me.id] ?? 0) + (last.outcome.dealerAfter === me.id ? state.baseBetCents : 0)
      : 0;
  const wentBestia = last?.event.type === "hand_played" && last.event.losers.some((g) => g.includes(me.id));
  const dealer = state.dealerId === me.id && !ended;
  const color = SEAT_COLORS[me.joinOrder % SEAT_COLORS.length];
  const amount = me.balanceCents;
  const debts = ended ? simplifyDebts(Object.fromEntries(state.players.map((p) => [p.id, p.balanceCents]))) : [];
  const mine = debts.filter((t) => t.from === me.id || t.to === me.id);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-3 pb-10 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center gap-1">
        <Link href="/" className="rounded-full p-2.5 text-white/70 hover:bg-white/10" aria-label="Torna alla home">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-white/70">{title}</h1>
      </header>

      {/* io */}
      <section className="mt-1 flex items-center gap-4 rounded-3xl bg-night-800 p-4 ring-1 ring-white/5">
        <div className={`relative w-24 shrink-0 overflow-hidden rounded-2xl ${color}`}>
          {character ? (
            <Character config={character} crop={CROPS.bust} label={`Il personaggio di ${me.name}`} />
          ) : (
            <span className="grid aspect-square place-items-center text-4xl font-black">{me.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{me.name}</p>
          <p className={`tabular text-3xl font-black ${amount < 0 ? "text-loss" : amount > 0 ? "text-gain" : "text-white/60"}`} aria-label={`Il tuo saldo ${formatCents(amount, { signed: true })}`}>
            {formatCents(amount, { signed: true })}
          </p>
          <p className="text-xs text-white/55">
            {rank}° su {state.players.length} · {me.stats.handsWon} mani vinte · {me.stats.bestie} bestie
          </p>
          <button
            onClick={onEditCharacter}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-night-700 px-3 py-1.5 text-sm font-semibold text-white/85 hover:bg-night-600"
          >
            <Shirt size={16} /> {character ? "Il mio personaggio" : "Crea il mio personaggio"}
          </button>
        </div>
      </section>

      {/* avvisi */}
      <div className="mt-3 space-y-2" aria-live="polite">
        {!me.active && !ended && <Notice tone="info">Sei fuori dal tavolo: il tuo saldo resta nei conti finali.</Notice>}
        {dealer && (
          <Notice tone="gold" icon={<Coins size={18} />}>
            <strong>Tocca a te fare le carte</strong>: metti la messa di {formatCents(state.baseBetCents)}.
          </Notice>
        )}
        {lastDelta !== 0 && !ended && (
          <Notice tone={lastDelta > 0 ? "gain" : "loss"} icon={lastDelta > 0 ? <Trophy size={18} /> : <Flame size={18} />}>
            {lastDelta > 0 ? (
              <>
                Ultima mano: hai vinto <strong>{formatCents(lastDelta)}</strong>
              </>
            ) : wentBestia ? (
              <>
                Sei andato in bestia: <strong>{formatCents(lastDelta, { signed: true })}</strong>
              </>
            ) : (
              <>
                Ultima mano: <strong>{formatCents(lastDelta, { signed: true })}</strong>
              </>
            )}
          </Notice>
        )}
      </div>

      {ended ? (
        <section className="mt-4 rounded-3xl bg-night-800 p-4 ring-1 ring-white/5">
          <h2 className="text-lg font-bold">I tuoi conti</h2>
          {mine.length === 0 ? (
            <p className="mt-2 text-white/70">Sei in pari: non devi niente a nessuno.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {mine.map((t, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl bg-night-900 px-3 py-2.5">
                  {t.from === me.id ? (
                    <>
                      <span className="flex-1">
                        Devi dare a <strong>{name(t.to)}</strong>
                      </span>
                      <span className="tabular font-black text-loss">{formatCents(t.amountCents)}</span>
                    </>
                  ) : (
                    <>
                      <span className="flex-1">
                        Ricevi da <strong>{name(t.from)}</strong>
                      </span>
                      <span className="tabular font-black text-gain">{formatCents(t.amountCents)}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {debts.length > mine.length && (
            <details className="mt-3 text-sm text-white/60">
              <summary className="cursor-pointer">Tutti i conti</summary>
              <ul className="mt-2 space-y-1">
                {debts.map((t, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    {name(t.from)} <ArrowRight size={14} /> {name(t.to)} <span className="tabular ml-auto font-semibold">{formatCents(t.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ) : (
        <section className="mt-3">
          <Table state={state} badgeFor={(pid) => (pid === me.id ? { label: "Tu", ring: "ring-sky-400", dot: "bg-sky-400" } : null)} />
        </section>
      )}

      <section className="mt-4 rounded-3xl bg-night-800 p-4 ring-1 ring-white/5">
        <h2 className="mb-1 font-bold">Classifica</h2>
        <ol>
          {ranking.map((p, i) => (
            <li key={p.id} className={`flex items-center gap-2 py-1 ${p.id === me.id ? "font-bold text-sky-200" : ""} ${p.active ? "" : "opacity-45"}`}>
              <span className="tabular w-5 text-white/40">{i + 1}</span>
              <span className="flex-1 truncate">{p.name}</span>
              <span className={`tabular ${p.balanceCents < 0 ? "text-loss" : p.balanceCents > 0 ? "text-gain" : "text-white/55"}`}>
                {formatCents(p.balanceCents, { signed: true })}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 rounded-3xl bg-night-800 p-4 ring-1 ring-white/5">
        <h2 className="mb-1 font-bold">Ultime mani</h2>
        <HistoryList state={state} history={history} times={times} limit={5} />
      </section>

      <button onClick={onLeaveSeat} className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-white/45 hover:text-white/70">
        <LogOut size={15} /> Scollega questo telefono
      </button>
    </main>
  );
}

function Notice({ tone, icon, children }: { tone: "gold" | "gain" | "loss" | "info"; icon?: React.ReactNode; children: React.ReactNode }) {
  const style = {
    gold: "bg-gold-400/15 text-gold-400 ring-gold-400/30",
    gain: "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30",
    loss: "bg-red-500/15 text-red-200 ring-red-400/30",
    info: "bg-night-800 text-white/70 ring-white/10",
  }[tone];
  return (
    <p className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm ring-1 ${style}`}>
      {icon}
      <span className="flex-1">{children}</span>
    </p>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center p-6 text-center text-white/60">{children}</div>;
}
