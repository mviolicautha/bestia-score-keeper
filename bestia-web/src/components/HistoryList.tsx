import type { GameState, HistoryEntry } from "@/engine";
import { describeEntry } from "@/lib/describe";

const DOT = { gain: "bg-emerald-400", loss: "bg-red-400", pass: "bg-slate-400", info: "bg-cyan-400" };

export function HistoryList({
  state,
  history,
  times,
  limit,
  large = false,
}: {
  state: GameState;
  history: HistoryEntry[];
  times: string[];
  limit?: number;
  large?: boolean;
}) {
  const items = [...history].reverse().slice(0, limit);
  return (
    <ol className="space-y-1">
      {items.map((entry) => {
        const d = describeEntry(entry, state);
        const at = times[entry.index];
        const t = at ? new Date(at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";
        return (
          <li key={entry.index} className={`flex gap-3 rounded-xl px-2 ${large ? "py-[0.5em]" : "py-2.5"}`}>
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${DOT[d.kind]}`} aria-hidden />
            <div className={`flex-1 ${large ? "text-[1em] leading-snug" : "text-sm"}`}>
              <p className="font-medium">{d.title}</p>
              {d.detail && <p className="text-white/50">{d.detail}</p>}
            </div>
            <time className={`tabular text-white/35 ${large ? "text-[0.75em]" : "text-xs"}`}>{t}</time>
          </li>
        );
      })}
    </ol>
  );
}
