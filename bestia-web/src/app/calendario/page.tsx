"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Gift, Lock, PackageOpen, Star } from "lucide-react";
import { catalog } from "@/lib/avatar/catalog";
import { applyAdventOpen, refreshCollection, useCollection } from "@/lib/avatar/collection";
import { RARITY_INFO } from "@/lib/avatar/packs";
import { ADVENT_DAYS, adventKind, AdventError, daysToAdvent, getAdvent, type Advent, type AdventReward } from "@/lib/advent";
import { play, unlock } from "@/lib/sounds";
import { Character, cropAround } from "@/components/Character";
import { FestiveLights, Snowfall } from "@/components/Festive";
import { AccountRequired, messageOf } from "@/components/groupUi";
import { Toast, type ToastMessage } from "@/components/ui";

type PageState = { status: "loading" } | { status: "off"; message: string } | { status: "error"; message: string } | { status: "ready"; advent: Advent };

/** Calendario dell'avvento: una casella al giorno dal 1° al 24 dicembre. */
export default function AdventPage() {
  const collection = useCollection();
  const [pageState, setState] = useState<PageState>({ status: "loading" });

  const load = useCallback(async () => {
    const svc = getAdvent();
    if (!svc) return;
    try {
      setState({ status: "ready", advent: await svc.load() });
    } catch (e) {
      if (e instanceof AdventError && e.code === "migration_missing") setState({ status: "off", message: e.message });
      else setState({ status: "error", message: messageOf(e) });
    }
  }, []);

  useEffect(() => {
    if (collection.status === "ready") void Promise.resolve().then(load);
  }, [collection.status, load]);

  const state: PageState = !getAdvent()
    ? { status: "off", message: "Il calendario funziona solo con il backend online." }
    : collection.status === "off"
      ? { status: "off", message: "Il calendario arriva con le bustine: va eseguito prima 0009_bustine.sql." }
      : pageState;

  return (
    <main className="relative mx-auto min-h-dvh max-w-lg px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Snowfall />
      <FestiveLights />
      <Link href="/bustine" className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/10">
        <ChevronLeft size={18} /> Bustine
      </Link>
      <h1 className="text-3xl font-black">Calendario dell&apos;avvento</h1>

      {collection.status === "guest" ? (
        <div className="mt-6">
          <AccountRequired next="/calendario" text="Il calendario è legato al tuo account: crealo e apri una casella al giorno fino a Natale." />
        </div>
      ) : state.status === "ready" ? (
        <Calendar advent={state.advent} onChange={(advent) => setState({ status: "ready", advent })} />
      ) : state.status === "loading" ? (
        <p className="mt-4 text-white/45">Caricamento…</p>
      ) : state.status === "off" ? (
        <p className="mt-4 text-white/60">{state.message}</p>
      ) : (
        <>
          <p className="mt-4 text-sm text-red-300">{state.message}</p>
          <button onClick={() => void load()} className="mt-4 rounded-2xl bg-night-700 px-4 py-2.5 font-semibold">
            Riprova
          </button>
        </>
      )}
    </main>
  );
}

/** Contatore per le chiavi di popup e avvisi. */
let seq = 0;

function Calendar({ advent, onChange }: { advent: Advent; onChange: (a: Advent) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [reveal, setReveal] = useState<{ day: number; reward: AdventReward; n: number } | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const before = daysToAdvent();
  const ready = Array.from({ length: advent.today }, (_, i) => i + 1).filter((d) => !advent.opened[d]).length;

  async function open(day: number) {
    if (busy !== null) return;
    void unlock(); // dentro il tocco: così i suoni partono
    play("shake");
    setBusy(day);
    try {
      const res = await getAdvent()!.open(day);
      onChange({ ...advent, opened: { ...advent.opened, [day]: res.reward } });
      applyAdventOpen(res.coins, res.packs, res.reward.type === "item" ? res.reward.id : null);
      setReveal({ day, reward: res.reward, n: ++seq });
      play(res.reward.type === "item" ? (res.reward.rarity === "leggendaria" ? "legendary" : res.reward.rarity === "epica" ? "epic" : "rare") : res.reward.type === "pack" ? "epic" : "coins");
    } catch (e) {
      setToast({ text: messageOf(e), kind: "error", id: ++seq });
      void refreshCollection();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className="mb-5 mt-1 text-sm text-white/55">
        {advent.today === 0
          ? before
            ? `Si apre tra ${before} ${before === 1 ? "giorno" : "giorni"}: dal 1° dicembre una casella al giorno fino a Natale.`
            : "Torna a dicembre: una casella al giorno fino a Natale."
          : ready > 0
            ? `${ready === 1 ? "Una casella" : `${ready} caselle`} da aprire. Quelle dei giorni passati restano lì fino a fine dicembre.`
            : advent.today < ADVENT_DAYS
              ? "Tutte aperte: domani c'è la prossima!"
              : "Calendario completato. Buon Natale! 🎄"}
      </p>

      <ul className="grid grid-cols-4 gap-2.5" aria-label="Caselle">
        {Array.from({ length: ADVENT_DAYS }, (_, i) => i + 1).map((day) => (
          <Door key={day} day={day} reward={advent.opened[day]} openable={day <= advent.today} busy={busy === day} onOpen={() => void open(day)} />
        ))}
      </ul>

      <div className="mt-6 grid grid-cols-2 gap-2 text-xs text-white/55">
        <Legend icon="🪙" text="Gettoni" />
        <Legend icon="🎁" text="Un pezzo che ti manca" />
        <Legend icon="✨" text="6, 13, 20: bustina d'oro" />
        <Legend icon="⭐" text="24: un leggendario" />
      </div>

      {reveal && <Reveal key={reveal.n} day={reveal.day} reward={reveal.reward} onClose={() => setReveal(null)} />}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  );
}

function Legend({ icon, text }: { icon: string; text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-xl bg-night-800/60 px-2.5 py-2 ring-1 ring-white/5">
      <span aria-hidden>{icon}</span> {text}
    </p>
  );
}

function rewardShort(r: AdventReward): string {
  if (r.type === "coins") return `+${r.coins}`;
  if (r.type === "pack") return "d'oro";
  return catalog.items.find((i) => i.id === r.id)?.label ?? "pezzo";
}

function Door({ day, reward, openable, busy, onOpen }: { day: number; reward?: AdventReward; openable: boolean; busy: boolean; onOpen: () => void }) {
  const kind = adventKind(day);
  const special = kind === "oro" || kind === "leggendario";
  const item = reward?.type === "item" ? catalog.items.find((i) => i.id === reward.id) : undefined;

  if (reward) {
    const color = reward.type === "item" ? RARITY_INFO[reward.rarity].color : reward.type === "pack" ? "#ffcf40" : "rgba(255,255,255,0.12)";
    return (
      <li className="relative aspect-square overflow-hidden rounded-2xl bg-night-900/80 ring-2" style={{ ["--tw-ring-color" as string]: color }} title={`${day} dicembre: ${rewardShort(reward)}`}>
        {item ? (
          <Character config={{ [item.category]: item.id }} crop={cropAround(item.box)} className="h-full w-full bg-gradient-to-b from-night-700 to-night-900" label={item.label} />
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div>
              <span className="block text-2xl" aria-hidden>
                {reward.type === "pack" ? "✨" : "🪙"}
              </span>
              <span className="text-xs font-bold text-gold-400">{rewardShort(reward)}</span>
            </div>
          </div>
        )}
        <span className="absolute left-1.5 top-1 text-[10px] font-black text-white/50">{day}</span>
      </li>
    );
  }

  return (
    <li className="aspect-square">
      <button
        onClick={onOpen}
        disabled={!openable || busy}
        aria-label={openable ? `Apri la casella del ${day} dicembre` : `${day} dicembre, ancora chiusa`}
        className={`relative grid h-full w-full place-items-center overflow-hidden rounded-2xl font-black ring-1 transition active:scale-95 ${
          openable
            ? special
              ? "bg-gradient-to-br from-[#8a5a00] via-[#ffcf40] to-[#6b4300] text-night-950 ring-gold-400 shadow-[0_0_22px_-4px_rgba(255,207,64,0.8)]"
              : "bg-gradient-to-br from-[#7a1022] via-[#c3203a] to-[#5a0a18] text-[#ffe08a] ring-gold-400/60 shadow-[0_0_18px_-6px_rgba(195,32,58,0.9)]"
            : special
              ? "bg-night-800 text-gold-400/50 ring-gold-400/25"
              : "bg-night-800 text-white/35 ring-white/5"
        } ${busy ? "animate-pack-rumble" : openable ? "animate-bounce-soft motion-reduce:animate-none" : ""}`}
        style={openable ? { animationDelay: `${(day % 5) * 0.2}s` } : undefined}
      >
        {/* il nastro del pacchetto */}
        {openable && <span aria-hidden className="absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 bg-[#ffe08a]/35" />}
        <span className="relative text-2xl leading-none">{day}</span>
        <span className="absolute bottom-1.5 right-1.5">
          {kind === "leggendario" ? <Star size={13} fill="currentColor" /> : !openable ? <Lock size={12} /> : <Gift size={13} />}
        </span>
      </button>
    </li>
  );
}

function Reveal({ day, reward, onClose }: { day: number; reward: AdventReward; onClose: () => void }) {
  const item = reward.type === "item" ? catalog.items.find((i) => i.id === reward.id) : undefined;
  const rarity = reward.type === "item" ? RARITY_INFO[reward.rarity] : null;
  const glow = rarity?.glow ?? (reward.type === "pack" ? "rgba(255,207,64,0.8)" : "rgba(255,213,74,0.5)");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-night-950/85 p-6 backdrop-blur-sm" role="dialog" aria-label={`Casella del ${day} dicembre`} onClick={onClose}>
      {reward.type === "coins" && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} className="absolute -top-8 animate-coin-fall text-2xl motion-reduce:hidden" style={{ left: `${(i * 6.3 + 4) % 100}%`, animationDelay: `${(i % 5) * 0.12}s`, animationIterationCount: 1 }}>
              🪙
            </span>
          ))}
        </div>
      )}
      <div className="w-full max-w-xs animate-pop-in text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">{day} dicembre</p>
        <div className="mx-auto mt-4 grid h-44 w-44 place-items-center overflow-hidden rounded-3xl bg-night-800 ring-2" style={{ boxShadow: `0 0 60px -6px ${glow}`, ["--tw-ring-color" as string]: rarity?.color ?? "#ffcf40" }}>
          {item ? (
            <Character config={{ [item.category]: item.id }} crop={cropAround(item.box)} className="h-full w-full bg-gradient-to-b from-night-700 to-night-900" label={item.label} />
          ) : (
            <span className="text-7xl" aria-hidden>
              {reward.type === "pack" ? "✨" : "🪙"}
            </span>
          )}
        </div>
        {item && rarity ? (
          <>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: rarity.color }}>
              {rarity.label} · nuovo!
            </p>
            <p className="mt-1 text-2xl font-black">{item.label}</p>
            <p className="mt-1 text-sm text-white/55">È già nel tuo album.</p>
          </>
        ) : reward.type === "pack" ? (
          <>
            <p className="mt-5 text-2xl font-black">Una bustina d&apos;oro!</p>
            <p className="mt-1 text-sm text-white/55">5 pezzi, almeno uno epico. La trovi nelle Bustine, gratis.</p>
          </>
        ) : (
          <p className="mt-5 text-3xl font-black text-gold-400">+{reward.type === "coins" ? reward.coins : 0} gettoni</p>
        )}
        <div className="mt-6 flex gap-2">
          {reward.type === "pack" && (
            <Link href="/bustine" className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gold-400 py-3 font-bold text-night-950">
              <PackageOpen size={18} /> Aprila
            </Link>
          )}
          <button onClick={onClose} className={`flex-1 rounded-2xl py-3 font-bold ${reward.type === "pack" ? "bg-night-700" : "bg-gold-400 text-night-950"}`}>
            {reward.type === "pack" ? "Dopo" : "Evviva!"}
          </button>
        </div>
      </div>
    </div>
  );
}
