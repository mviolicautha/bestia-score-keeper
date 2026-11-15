"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, Clock, Coins, Gift, PackageOpen, Trophy } from "lucide-react";
import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENTS,
  CHALLENGE_BY_ID,
  GROUPS,
  msToNextWeek,
  rewardLabel,
  WEEKLY,
  type Achievement,
  type Reward,
} from "@/lib/achievements";
import { applyGoalsClaim, refreshCollection, useCollection } from "@/lib/avatar/collection";
import { formatWait } from "@/lib/avatar/packs";
import { getGoals, GoalsError, readyIds, type GoalRow, type Goals } from "@/lib/goals";
import { play, unlock } from "@/lib/sounds";
import { AccountRequired, messageOf } from "@/components/groupUi";
import { Toast, type ToastMessage } from "@/components/ui";

type PageState =
  | { status: "loading"; note?: string }
  | { status: "off"; message: string }
  | { status: "guest" }
  | { status: "error"; message: string }
  | { status: "ready"; goals: Goals };

/** Obiettivi una tantum e sfide della settimana, con i premi da riscuotere. */
export default function GoalsPage() {
  const collection = useCollection();
  const [pageState, setState] = useState<PageState>({ status: "loading", note: "Controllo le partite giocate…" });

  const load = useCallback(async (backfill: boolean) => {
    const svc = getGoals();
    if (!svc) return;
    try {
      // le partite condotte prima degli obiettivi: si completano le statistiche, poi si conta
      if (backfill) await svc.backfill().catch(() => 0);
      setState({ status: "ready", goals: await svc.load() });
    } catch (e) {
      if (e instanceof GoalsError && e.code === "account_required") setState({ status: "guest" });
      else if (e instanceof GoalsError && e.code === "migration_missing") setState({ status: "off", message: e.message });
      else setState({ status: "error", message: messageOf(e) });
    }
  }, []);

  useEffect(() => {
    if (collection.status === "ready" || collection.status === "off" || collection.status === "error") void Promise.resolve().then(() => load(true));
  }, [collection.status, load]);

  // ospite senza account: lo dice già l'album, inutile chiedere al database
  const state: PageState = !getGoals()
    ? { status: "off", message: "Gli obiettivi funzionano solo con il backend online." }
    : collection.status === "guest"
      ? { status: "guest" }
      : pageState;

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/bustine" className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/10">
        <ChevronLeft size={18} /> Bustine
      </Link>

      {state.status === "ready" ? (
        <Board goals={state.goals} onChange={(goals) => setState({ status: "ready", goals })} reload={() => load(false)} />
      ) : (
        <>
          <h1 className="mb-4 text-3xl font-black">Obiettivi</h1>
          {state.status === "loading" && <p className="text-white/45">{state.note ?? "Caricamento…"}</p>}
          {state.status === "off" && <p className="text-white/60">{state.message}</p>}
          {state.status === "guest" && <AccountRequired next="/obiettivi" text="Gli obiettivi sono legati al tuo account: crealo e inizia a guadagnare bustine." />}
          {state.status === "error" && (
            <>
              <p className="text-sm text-red-300">{state.message}</p>
              <button onClick={() => void load(false)} className="mt-4 rounded-2xl bg-night-700 px-4 py-2.5 font-semibold">
                Riprova
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}

/** Somma dei premi di una lista di id (per il riepilogo "+300 gettoni, 1 bustina d'oro"). */
function sumRewards(ids: string[]): { coins: number; classica: number; oro: number } {
  const out = { coins: 0, classica: 0, oro: 0 };
  const add = (r: Reward) => {
    if (r.pack) out[r.pack]++;
    else out.coins += r.coins;
  };
  for (const id of ids) {
    if (id === "w:bonus") add({ pack: WEEKLY.bonus });
    else if (id.startsWith("w:")) add({ coins: WEEKLY.coins });
    else if (ACHIEVEMENT_BY_ID[id]) add(ACHIEVEMENT_BY_ID[id].reward);
  }
  return out;
}

function summary(s: { coins: number; classica: number; oro: number }): string {
  const parts: string[] = [];
  if (s.coins) parts.push(`${s.coins} gettoni`);
  if (s.oro) parts.push(s.oro === 1 ? "1 bustina d'oro" : `${s.oro} bustine d'oro`);
  if (s.classica) parts.push(s.classica === 1 ? "1 bustina classica" : `${s.classica} bustine classiche`);
  return parts.join(" + ");
}

function Board({ goals, onChange, reload }: { goals: Goals; onChange: (g: Goals) => void; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [rain, setRain] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const ready = readyIds(goals);
  const rows: Record<string, GoalRow> = Object.fromEntries(goals.achievements.map((a) => [a.id, a]));
  const shown = ACHIEVEMENTS.filter((a) => rows[a.id]);
  const completed = shown.filter((a) => rows[a.id].claimed).length;
  const freePacks = goals.packs.classica + goals.packs.oro;

  async function claim(ids: string[]) {
    if (busy || ids.length === 0) return;
    void unlock(); // dentro il tocco: così i suoni partono
    setBusy(true);
    try {
      const res = await getGoals()!.claim(ids);
      const set = new Set(res.claimed);
      const next: Goals = {
        ...goals,
        coins: res.coins,
        packs: res.packs,
        achievements: goals.achievements.map((a) => (set.has(a.id) ? { ...a, claimed: true } : a)),
        challenges: goals.challenges.map((c) => (set.has(`w:${c.id}`) ? { ...c, claimed: true } : c)),
        bonusClaimed: goals.bonusClaimed || set.has("w:bonus"),
      };
      onChange(next);
      applyGoalsClaim(res.coins, res.packs, readyIds(next).length);
      if (res.claimed.length > 0) {
        void play("coins");
        setRain((r) => r + 1);
        setToast({ text: `Riscosso: ${summary(sumRewards(res.claimed))}`, kind: "success", id: Date.now() });
      } else {
        // niente di nuovo: la pagina era vecchia
        await reload();
      }
    } catch (e) {
      setToast({ text: messageOf(e), kind: "error", id: Date.now() });
      void refreshCollection();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {rain > 0 && <CoinRain key={rain} />}
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Obiettivi</h1>
          <p className="mt-0.5 text-sm text-white/50">
            Completati: <strong className="text-white/80 tabular">{completed}</strong> / {shown.length}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-night-800 py-2 pl-2.5 pr-4 ring-1 ring-gold-400/40" aria-label={`${goals.coins} gettoni`}>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-500 text-night-950">
            <Coins size={16} />
          </span>
          <span className="text-xl font-black tabular text-gold-400">{goals.coins}</span>
        </div>
      </header>

      {ready.length > 0 && (
        <div className="mb-5 rounded-3xl bg-gradient-to-br from-gold-400/25 to-night-800 p-4 ring-1 ring-gold-400/40">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-400">Premi pronti</p>
          <p className="mt-1 text-xl font-black leading-tight">{summary(sumRewards(ready))}</p>
          <button
            onClick={() => void claim(ready)}
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gold-400 py-3 font-bold text-night-950 transition active:scale-[0.98] disabled:opacity-60"
          >
            <Gift size={18} /> Riscuoti tutto ({ready.length})
          </button>
        </div>
      )}

      {freePacks > 0 && (
        <Link
          href="/bustine"
          className="mb-5 flex items-center gap-3 rounded-2xl bg-night-800 p-3.5 ring-1 ring-gold-400/40 transition hover:bg-night-700 active:scale-[0.98]"
        >
          <PackageOpen size={22} className="shrink-0 text-gold-400" />
          <span className="flex-1 text-sm">
            Hai <strong>{freePacks === 1 ? "1 bustina vinta" : `${freePacks} bustine vinte`}</strong> da aprire
          </span>
          <span className="rounded-xl bg-gold-400 px-3 py-1.5 text-sm font-bold text-night-950">Apri</span>
        </Link>
      )}

      <Weekly goals={goals} busy={busy} onClaim={claim} />

      {GROUPS.map((g) => {
        const list = shown.filter((a) => a.group === g.id);
        if (list.length === 0) return null;
        const doneCount = list.filter((a) => rows[a.id].claimed).length;
        return (
          <section key={g.id} aria-label={g.title} className="mt-8">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/45">{g.title}</h2>
              <span className="text-xs tabular text-white/40">
                {doneCount}/{list.length}
              </span>
            </div>
            <ul className="space-y-2">
              {list.map((a) => (
                <AchievementRow key={a.id} a={a} row={rows[a.id]} busy={busy} onClaim={() => void claim([a.id])} />
              ))}
            </ul>
          </section>
        );
      })}

      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  );
}

function Progress({ value, goal }: { value: number; goal: number }) {
  const k = Math.min(1, value / Math.max(1, goal));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-night-950/60">
      <div className={`h-full rounded-full transition-[width] duration-700 ${k >= 1 ? "bg-gold-400" : "bg-white/40"}`} style={{ width: `${k * 100}%` }} />
    </div>
  );
}

function RewardChip({ reward, muted }: { reward: Reward; muted?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        muted ? "bg-white/5 text-white/40" : reward.pack === "oro" ? "bg-gold-400/20 text-gold-400" : reward.pack ? "bg-sky-400/15 text-sky-300" : "bg-gold-400/10 text-gold-400"
      }`}
    >
      {reward.pack ? <PackageOpen size={12} /> : <Coins size={12} />}
      {reward.pack ? rewardLabel(reward).replace("Bustina ", "") : reward.coins}
    </span>
  );
}

function AchievementRow({ a, row, busy, onClaim }: { a: Achievement; row: GoalRow; busy: boolean; onClaim: () => void }) {
  const done = row.value >= row.goal;
  const claimable = done && !row.claimed;
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl p-3 ring-1 transition ${
        row.claimed ? "bg-night-800/50 ring-white/5" : claimable ? "bg-night-800 ring-gold-400/60 shadow-[0_0_24px_-8px_rgba(255,213,74,0.6)]" : "bg-night-800 ring-white/5"
      }`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-night-950/50 text-2xl ${row.claimed ? "opacity-60" : ""}`} aria-hidden>
        {a.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-bold leading-tight ${row.claimed ? "text-white/55" : ""}`}>{a.title}</p>
        <p className="mt-0.5 text-xs leading-snug text-white/50">{a.description}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <RewardChip reward={a.reward} muted={row.claimed} />
          {!row.claimed && !claimable && (
            <>
              <div className="flex-1">
                <Progress value={row.value} goal={row.goal} />
              </div>
              <span className="text-[11px] tabular text-white/45">
                {Math.min(row.value, row.goal)}/{row.goal}
              </span>
            </>
          )}
        </div>
      </div>
      {row.claimed ? (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gain/20 text-gain" aria-label="Riscosso">
          <Check size={16} />
        </span>
      ) : claimable ? (
        <button onClick={onClaim} disabled={busy} className="shrink-0 rounded-xl bg-gold-400 px-3 py-2 text-sm font-bold text-night-950 transition active:scale-95 disabled:opacity-60">
          Riscuoti
        </button>
      ) : null}
    </li>
  );
}

function Weekly({ goals, busy, onClaim }: { goals: Goals; busy: boolean; onClaim: (ids: string[]) => void }) {
  const [ms, setMs] = useState(() => msToNextWeek());
  useEffect(() => {
    const t = setInterval(() => setMs(msToNextWeek()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (goals.challenges.length === 0) return null;
  const allDone = goals.challenges.every((c) => c.value >= c.goal);
  const days = Math.floor(ms / 86_400_000);

  return (
    <section aria-label="Sfide della settimana" className="rounded-3xl bg-gradient-to-br from-sky-500/15 to-night-800 p-4 ring-1 ring-sky-400/25">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.2em] text-sky-300">
          <Trophy size={15} /> Sfide della settimana
        </h2>
        <span className="flex items-center gap-1 text-[11px] text-white/45">
          <Clock size={12} /> {days >= 1 ? `${days} ${days === 1 ? "giorno" : "giorni"}` : formatWait(ms)}
        </span>
      </div>
      <ul className="space-y-2.5">
        {goals.challenges.map((c) => {
          const info = CHALLENGE_BY_ID[c.id];
          const done = c.value >= c.goal;
          return (
            <li key={c.id} className="flex items-center gap-3">
              <span className={`text-xl ${c.claimed ? "opacity-50" : ""}`} aria-hidden>
                {info?.emoji ?? "⭐"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold leading-tight ${c.claimed ? "text-white/50 line-through decoration-white/30" : ""}`}>{info?.title ?? c.id}</p>
                  <span className="shrink-0 text-[11px] tabular text-white/45">
                    {Math.min(c.value, c.goal)}/{c.goal}
                  </span>
                </div>
                <div className="mt-1">
                  <Progress value={c.value} goal={c.goal} />
                </div>
              </div>
              {c.claimed ? (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gain/20 text-gain" aria-label="Riscossa">
                  <Check size={14} />
                </span>
              ) : done ? (
                <button
                  onClick={() => onClaim([`w:${c.id}`])}
                  disabled={busy}
                  className="shrink-0 rounded-xl bg-gold-400 px-2.5 py-1.5 text-xs font-bold text-night-950 active:scale-95 disabled:opacity-60"
                >
                  +{WEEKLY.coins}
                </button>
              ) : (
                <span className="shrink-0 text-[11px] font-bold text-gold-400/70">+{WEEKLY.coins}</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-night-950/40 px-3 py-2.5">
        <PackageOpen size={18} className={goals.bonusClaimed ? "text-white/30" : "text-gold-400"} />
        <p className="flex-1 text-xs text-white/60">
          {goals.bonusClaimed ? "Bustina della settimana riscossa: torna lunedì!" : `Completale tutte e ${WEEKLY.count}: ${rewardLabel({ pack: WEEKLY.bonus }).toLowerCase()} in regalo`}
        </p>
        {allDone && !goals.bonusClaimed && (
          <button onClick={() => onClaim(["w:bonus"])} disabled={busy} className="shrink-0 rounded-xl bg-gold-400 px-2.5 py-1.5 text-xs font-bold text-night-950 active:scale-95 disabled:opacity-60">
            Prendi
          </button>
        )}
      </div>
    </section>
  );
}

function CoinRain() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          className="absolute -top-8 animate-coin-fall text-2xl motion-reduce:hidden"
          style={{ left: `${(i * 5.7 + 3) % 100}%`, animationDelay: `${(i % 6) * 0.1}s`, animationIterationCount: 1 }}
        >
          🪙
        </span>
      ))}
    </div>
  );
}
