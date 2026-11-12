"use client";

import { colorIndex, formatCents, type GameState, type PlayerId, type PlayerState } from "@/engine";
import { useCharacterFor } from "@/lib/avatar/overrides";
import { Character, CROPS } from "./Character";
import { SEAT_COLORS } from "./ui";

/**
 * Il tavolo visto dall'alto: i giocatori attivi seduti attorno nell'ordine del giro
 * (senso orario, il primo in alto), il piatto al centro e la fiche del mazziere
 * davanti a chi fa le carte. Usato dal master (toccando i posti si selezionano
 * vincitori e bestie) e dalla vista TV (solo lettura).
 *
 * Si adatta al contenitore: le misure sono in percentuali e in unità del contenitore (cqw).
 */

export interface SeatBadge {
  label: string;
  ring: string;
  dot: string;
}

export function Table({
  state,
  variant = "master",
  onSeatTap,
  badgeFor,
  preview,
  flash,
  flashKey,
  seatLabel,
  selecting = false,
}: {
  state: GameState;
  variant?: "master" | "tv";
  onSeatTap?: (p: PlayerState) => void;
  badgeFor?: (id: PlayerId) => SeatBadge | null;
  /** Importi in anteprima durante la selezione (master). */
  preview?: Record<PlayerId, number>;
  /** Variazioni dell'ultima mano, mostrate per qualche secondo (TV). */
  flash?: Record<PlayerId, number>;
  /** Cambia a ogni mano: fa ripartire l'animazione di `flash`. */
  flashKey?: number;
  seatLabel?: (p: PlayerState) => string;
  /** Il master sta selezionando vincitori o bestie: i posti diventano interruttori. */
  selecting?: boolean;
}) {
  const players = state.players.filter((p) => p.active);
  const n = players.length;
  const tall = variant === "master"; // telefono in verticale: ovale allungato
  // Posti sul bordo del panno, abbastanza dentro da non uscire dal riquadro (il posto è alto ~1,45 volte la sua larghezza).
  const rx = tall ? 40 : 43;
  const ry = tall ? 37 : 34;
  const pos = (i: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
    return { x: 50 + rx * Math.cos(a), y: 50 + ry * Math.sin(a), a };
  };
  // Larghezza del posto in % del tavolo: sulla TV il tavolo è largo e basso, quindi posti più stretti.
  const seatW = tall ? (n <= 6 ? 21 : n <= 8 ? 18 : 16) : n <= 6 ? 13 : n <= 8 ? 12 : 11;
  const dealerIdx = players.findIndex((p) => p.id === state.dealerId);
  const chip = dealerIdx >= 0 ? pos(dealerIdx) : null;

  return (
    <div
      className={`relative mx-auto w-full [container-type:inline-size] ${tall ? "aspect-[4/5] max-w-xl" : "aspect-[16/10]"}`}
      aria-label="Tavolo"
      role="group"
    >
      {/* panno */}
      <div
        className="absolute rounded-[50%] bg-[radial-gradient(ellipse_at_center,var(--color-felt-500)_0%,var(--color-felt-600)_45%,var(--color-felt-700)_100%)] shadow-[inset_0_0_6cqw_rgba(0,0,0,0.45),0_2cqw_5cqw_rgba(0,0,0,0.5)] ring-[1.6cqw] ring-[#5a3a22]"
        style={{ left: "13%", right: "13%", top: tall ? "17%" : "20%", bottom: tall ? "17%" : "20%" }}
      />
      {/* piatto */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
        aria-label={`Piatto ${formatCents(state.potCents)}`}
      >
        <p className="text-[2.2cqw] font-semibold uppercase tracking-[0.3em] text-white/60">Piatto</p>
        <p className="tabular text-[9cqw] font-black leading-none text-gold-400 drop-shadow">{formatCents(state.potCents)}</p>
        <p className="mt-[0.8cqw] text-[2.4cqw] text-white/70">
          Messa {formatCents(state.baseBetCents)} · Mano {state.handsPlayed + 1}
        </p>
      </div>
      {/* fiche del mazziere: scivola verso il posto di chi fa le carte */}
      {chip && (
        <span
          aria-hidden
          className="absolute grid h-[6cqw] w-[6cqw] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-amber-600 text-[3cqw] font-black text-black shadow-lg ring-[0.5cqw] ring-white/70 transition-[left,top] duration-700 ease-in-out"
          style={{ left: `${50 + (chip.x - 50) * 0.62}%`, top: `${50 + (chip.y - 50) * 0.62}%` }}
          title="Mazziere"
        >
          D
        </span>
      )}
      {players.map((p, i) => {
        const { x, y } = pos(i);
        return (
          <Seat
            key={p.id}
            player={p}
            color={SEAT_COLORS[colorIndex(state, p.id) % SEAT_COLORS.length]}
            dealer={p.id === state.dealerId}
            style={{ left: `${x}%`, top: `${y}%`, width: `${seatW}%` }}
            badge={badgeFor?.(p.id) ?? null}
            delta={preview?.[p.id]}
            flash={flash?.[p.id]}
            flashKey={flashKey}
            onTap={onSeatTap}
            label={seatLabel?.(p)}
            pressed={selecting ? !!badgeFor?.(p.id) : undefined}
          />
        );
      })}
      {n === 0 && <p className="absolute inset-x-0 top-[62%] text-center text-[3cqw] text-white/60">In attesa dei giocatori…</p>}
    </div>
  );
}

function Seat({
  player,
  color,
  dealer,
  style,
  badge,
  delta,
  flash,
  flashKey,
  onTap,
  label,
  pressed,
}: {
  player: PlayerState;
  color: string;
  dealer: boolean;
  style: React.CSSProperties;
  badge: SeatBadge | null;
  delta?: number;
  flash?: number;
  flashKey?: number;
  onTap?: (p: PlayerState) => void;
  label?: string;
  pressed?: boolean;
}) {
  const character = useCharacterFor(player.name);
  const amount = player.balanceCents;
  const content = (
    <>
      <span
        className={`relative block aspect-square w-full overflow-hidden rounded-[22%] ring-[0.6cqw] transition ${color} ${
          badge ? badge.ring : dealer ? "ring-gold-400" : "ring-white/20"
        }`}
      >
        {character ? (
          <Character config={character} crop={CROPS.bust} className="h-full w-full" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[6cqw] font-black text-white" aria-hidden>
            {player.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
        )}
      </span>
      <span className="mt-[0.6cqw] block truncate text-center text-[2.7cqw] font-bold leading-tight text-white drop-shadow">
        {player.name}
      </span>
      <span
        className={`tabular block text-center text-[2.6cqw] font-black leading-tight ${
          amount < 0 ? "text-loss" : amount > 0 ? "text-gain" : "text-white/60"
        }`}
      >
        {formatCents(amount, { signed: true })}
      </span>
      {delta !== undefined && delta !== 0 && (
        <span
          className={`tabular mx-auto mt-[0.3cqw] block w-fit rounded-md px-[0.8cqw] text-[2.3cqw] font-bold ${
            delta > 0 ? "bg-emerald-400/20 text-emerald-300" : "bg-red-400/20 text-red-300"
          }`}
        >
          {formatCents(delta, { signed: true })}
        </span>
      )}
      {flash !== undefined && flash !== 0 && (
        <span
          key={flashKey}
          className={`tabular animate-seat-flash absolute -top-[3cqw] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-[1.2cqw] py-[0.3cqw] text-[2.8cqw] font-black shadow-lg ${
            flash > 0 ? "bg-emerald-400 text-black" : "bg-red-500 text-white"
          }`}
        >
          {formatCents(flash, { signed: true })}
        </span>
      )}
      {badge && (
        <span
          className={`absolute -right-[1cqw] -top-[1cqw] rounded-full px-[1cqw] text-[2.4cqw] font-black text-black ring-[0.4cqw] ring-night-900 ${badge.dot}`}
        >
          {badge.label}
        </span>
      )}
    </>
  );
  const cls = "absolute block -translate-x-1/2 -translate-y-1/2 text-left";
  if (!onTap)
    return (
      <div className={cls} style={style}>
        {content}
      </div>
    );
  return (
    <button
      onClick={() => onTap(player)}
      aria-label={label}
      aria-pressed={pressed}
      className={`${cls} transition active:scale-95`}
      style={style}
    >
      {content}
    </button>
  );
}
