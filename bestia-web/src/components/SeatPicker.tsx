"use client";

import { activePlayers, type GameState, type PlayerId } from "@/engine";
import { Avatar } from "./ui";

/** Dopo chi si siede un nuovo arrivato, nel giro del tavolo in senso orario (l'ordine del mazzo). */
export function SeatPicker({ state, value, onChange }: { state: GameState; value: PlayerId | undefined; onChange: (id: PlayerId) => void }) {
  const active = activePlayers(state);
  if (active.length === 0) return null;
  const idx = active.findIndex((p) => p.id === value);
  return (
    <div>
      <p className="mb-2 text-sm text-white/60">Si siede dopo</p>
      <div className="-mx-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Posto al tavolo: si siede dopo">
        {active.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={value === p.id}
            onClick={() => onChange(p.id)}
            className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-semibold ring-2 transition ${
              value === p.id ? "bg-night-600 text-white ring-gold-400" : "bg-night-900 text-white/70 ring-white/5"
            }`}
          >
            <Avatar name={p.name} seat={p.joinOrder} size="sm" />
            {p.name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/45">
        Il mazzo gira in senso orario nell&apos;ordine dei posti
        {idx >= 0 && active.length > 1 && (
          <>
            : il nuovo arrivato siede tra <strong className="text-white/70">{active[idx].name}</strong> e{" "}
            <strong className="text-white/70">{active[(idx + 1) % active.length].name}</strong>
          </>
        )}
        .
      </p>
    </div>
  );
}

/** Il posto di base: dopo l'ultimo del giro. */
export const defaultSeatAfter = (state: GameState) => activePlayers(state).at(-1)?.id;
