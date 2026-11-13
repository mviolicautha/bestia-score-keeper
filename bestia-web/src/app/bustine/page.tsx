"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Clock, Coins, Gift, HelpCircle, Lock } from "lucide-react";
import { catalog, isEmpty } from "@/lib/avatar/catalog";
import {
  applyPackResult,
  clearRewards,
  getCollections,
  refreshCollection,
  useCollection,
  type Collection,
  type PackResult,
} from "@/lib/avatar/collection";
import { collectibles, formatWait, msToNextDaily, PACKS, progressOf, RARITY_INFO, rarityOf, REWARDS, type PackKind } from "@/lib/avatar/packs";
import { getCharacter, saveCharacter } from "@/lib/avatar/store";
import { play, unlock } from "@/lib/sounds";
import { useAccount } from "@/lib/useAccount";
import { Character, cropAround } from "@/components/Character";
import { CharacterEditor } from "@/components/CharacterEditor";
import { PackArt, PackOpening } from "@/components/PackOpening";
import { AccountRequired, messageOf } from "@/components/groupUi";
import { Toast, type ToastMessage } from "@/components/ui";

/** Bustine, gettoni e album dei pezzi del personaggio. */
export default function PacksPage() {
  const state = useCollection();
  const { account, accounts, reload } = useAccount();

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/" className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-white/60 hover:bg-white/10">
        <ChevronLeft size={18} /> Partite
      </Link>

      {state.status === "off" ? (
        <>
          <h1 className="mb-4 text-3xl font-black">Bustine</h1>
          <p className="text-white/60">
            {getCollections()
              ? "Il database non è ancora pronto per le bustine: va eseguito 0009_bustine.sql (vedi SUPABASE.md). Nel frattempo tutti i pezzi sono liberi."
              : "Le bustine funzionano solo con il backend online: in questa versione tutti i pezzi sono liberi."}
          </p>
        </>
      ) : state.status === "guest" ? (
        <>
          <h1 className="mb-2 text-3xl font-black">Bustine</h1>
          <p className="mb-6 text-white/60">Colleziona i pezzi del tuo personaggio: cappelli, vestiti, occhiali, costumi… I capelli sono liberi per tutti.</p>
          <AccountRequired next="/bustine" text="L'album è legato al tuo account: crealo e ti aspetta subito una bustina di benvenuto." />
        </>
      ) : state.status === "loading" ? (
        <>
          <h1 className="mb-6 text-3xl font-black">Bustine</h1>
          <p className="text-white/45">Caricamento…</p>
        </>
      ) : state.status === "error" ? (
        <>
          <h1 className="mb-4 text-3xl font-black">Bustine</h1>
          <p className="text-sm text-red-300">{state.message}</p>
          <button onClick={() => void refreshCollection()} className="mt-4 rounded-2xl bg-night-700 px-4 py-2.5 font-semibold">
            Riprova
          </button>
        </>
      ) : (
        <Shop
          collection={state.collection}
          name={account?.displayName || account?.username || ""}
          profileCharacter={account?.character ?? null}
          saveProfile={async () => {
            const name = account?.displayName || account?.username || "";
            await accounts?.setCharacter(getCharacter(name));
            await reload();
          }}
        />
      )}
    </main>
  );
}

function Shop({
  collection,
  name,
  profileCharacter,
  saveProfile,
}: {
  collection: Collection;
  name: string;
  profileCharacter: Parameters<typeof saveCharacter>[1];
  saveProfile: () => Promise<void>;
}) {
  const [opening, setOpening] = useState<{ kind: PackKind; result: PackResult | null; error: string | null; n: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const total = progressOf(collection.owned);

  async function open(kind: PackKind) {
    void unlock(); // dentro il tocco: così i suoni partono
    setOpening((o) => ({ kind, result: null, error: null, n: (o?.n ?? 0) + 1 }));
    try {
      const result = await getCollections()!.open(kind);
      applyPackResult(kind, result);
      setOpening((o) => (o && o.kind === kind ? { ...o, result } : o));
    } catch (e) {
      setOpening((o) => (o && o.kind === kind ? { ...o, error: messageOf(e) } : o));
      void refreshCollection();
    }
  }

  function wear() {
    // l'editor lavora sui personaggi del dispositivo: parte da quello del profilo
    if (profileCharacter && !isEmpty(profileCharacter)) saveCharacter(name, profileCharacter);
    setOpening(null);
    setEditing(true);
  }

  // dopo una bustina pagata, proporre la stessa se i gettoni bastano
  const again = opening && opening.result && PACKS[opening.kind].price > 0 && collection.coins >= PACKS[opening.kind].price ? opening.kind : null;

  return (
    <>
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Bustine</h1>
          <p className="mt-0.5 text-sm text-white/50">
            Album: <strong className="text-white/80 tabular">{total.owned}</strong> / {total.total} pezzi
          </p>
        </div>
        {/* i gettoni delle partite si vedono salire quando si riscuotono */}
        <CoinBalance coins={collection.coins - collection.rewards.reduce((sum, r) => sum + r.coins, 0)} />
      </header>

      <div className="mb-6 h-2 overflow-hidden rounded-full bg-night-800">
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400 transition-[width] duration-700" style={{ width: `${(total.owned / Math.max(1, total.total)) * 100}%` }} />
      </div>

      {collection.rewards.length > 0 && <RewardsBanner collection={collection} />}

      <section aria-label="Bustine gratis" className="space-y-3">
        {collection.welcome && (
          <FreePack kind="benvenuto" onOpen={() => void open("benvenuto")} highlight />
        )}
        {collection.daily ? <FreePack kind="giornaliera" onOpen={() => void open("giornaliera")} highlight={!collection.welcome} /> : <DailyCountdown />}
      </section>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-[0.2em] text-white/45">Negozio</h2>
      <section aria-label="Negozio" className="grid grid-cols-2 gap-3">
        {(["classica", "oro"] as const).map((kind) => (
          <ShopPack key={kind} kind={kind} coins={collection.coins} onOpen={() => void open(kind)} />
        ))}
      </section>

      <HowToEarn />

      <Album owned={collection.owned} />

      {opening && (
        <PackOpening
          key={opening.n}
          kind={opening.kind}
          result={opening.result}
          error={opening.error}
          onClose={() => setOpening(null)}
          onWear={name ? wear : undefined}
          onAgain={again ? () => void open(again) : undefined}
          againLabel={again ? `Un'altra (${PACKS[again].price} gettoni)` : undefined}
        />
      )}
      {editing && (
        <CharacterEditor
          name={name}
          unlocked={collection.owned}
          onClose={() => setEditing(false)}
          onSaved={() =>
            void saveProfile().then(
              () => setToast({ text: "Personaggio salvato", kind: "success", id: Date.now() }),
              (e) => setToast({ text: messageOf(e), kind: "error", id: Date.now() }),
            )
          }
        />
      )}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  );
}

/** Saldo dei gettoni: quando cambia, il numero scorre fino al nuovo valore. */
function CoinBalance({ coins }: { coins: number }) {
  const [shown, setShown] = useState(coins);
  const [bump, setBump] = useState(0);
  const from = useRef(coins);
  useEffect(() => {
    const start = from.current;
    if (start === coins) return;
    from.current = coins;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      setShown(Math.round(start + (coins - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    setBump((b) => b + 1);
    return () => cancelAnimationFrame(raf);
  }, [coins]);
  return (
    <div
      key={bump}
      className={`flex items-center gap-2 rounded-full bg-night-800 py-2 pl-2.5 pr-4 ring-1 ring-gold-400/40 ${bump ? "animate-pop-in" : ""}`}
      aria-label={`${coins} gettoni`}
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-500 text-night-950 shadow-[0_0_14px_rgba(255,213,74,0.5)]">
        <Coins size={16} />
      </span>
      <span className="text-xl font-black tabular text-gold-400">{shown}</span>
    </div>
  );
}

/** Gettoni guadagnati con le partite: si riscuotono con un tocco (e una pioggia di monete). */
function RewardsBanner({ collection }: { collection: Collection }) {
  const sum = collection.rewards.reduce((s, r) => s + r.coins, 0);
  const [rain, setRain] = useState(false);
  return (
    <div className="relative mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-gold-400/25 to-night-800 p-4 ring-1 ring-gold-400/40">
      {rain && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <span
              key={i}
              className="absolute -top-6 animate-coin-fall text-xl"
              style={{ left: `${(i * 7.3) % 100}%`, animationDelay: `${(i % 5) * 0.12}s`, animationIterationCount: 1 }}
            >
              🪙
            </span>
          ))}
        </div>
      )}
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-400">Gettoni dalle partite</p>
      <p className="mt-1 text-2xl font-black">+{sum} gettoni</p>
      <ul className="mt-2 space-y-0.5 text-sm text-white/65">
        {collection.rewards.slice(0, 4).map((r) => (
          <li key={r.gameId} className="flex justify-between gap-3">
            <span className="truncate">{r.title}</span>
            <span className="shrink-0 font-semibold tabular text-gold-400">+{r.coins}</span>
          </li>
        ))}
        {collection.rewards.length > 4 && <li className="text-white/45">e altre {collection.rewards.length - 4}</li>}
      </ul>
      <button
        onClick={() => {
          void unlock().then(() => play("coins"));
          setRain(true);
          setTimeout(clearRewards, 1400);
        }}
        disabled={rain}
        className="mt-3 w-full rounded-2xl bg-gold-400 py-3 font-bold text-night-950 transition active:scale-[0.98] disabled:opacity-60"
      >
        Riscuoti
      </button>
    </div>
  );
}

function FreePack({ kind, onOpen, highlight = false }: { kind: PackKind; onOpen: () => void; highlight?: boolean }) {
  const pack = PACKS[kind];
  return (
    <button
      onClick={onOpen}
      className={`group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-night-800 p-4 text-left ring-1 transition active:scale-[0.98] ${
        highlight ? "ring-gold-400/60" : "ring-white/10"
      }`}
      style={highlight ? { boxShadow: `0 0 34px -6px ${pack.colors.via}` } : undefined}
    >
      <PackArt pack={pack} className="w-20 shrink-0 animate-pack-float text-[12px] motion-reduce:animate-none" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-gain">
          <Gift size={14} /> Gratis
        </p>
        <p className="mt-0.5 text-lg font-black leading-tight">{pack.name}</p>
        <p className="text-sm text-white/55">{pack.tagline}</p>
      </div>
      <span className="shrink-0 rounded-2xl bg-gold-400 px-4 py-2.5 font-bold text-night-950 group-hover:bg-gold-500">Apri</span>
    </button>
  );
}

function DailyCountdown() {
  const [ms, setMs] = useState(() => msToNextDaily());
  useEffect(() => {
    const t = setInterval(() => {
      const left = msToNextDaily();
      setMs(left);
      // mezzanotte passata: la nuova bustina è pronta
      if (left > 86_000_000) void refreshCollection();
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-night-800/60 p-4 ring-1 ring-white/5">
      <PackArt pack={PACKS.giornaliera} className="w-14 shrink-0 text-[9px] opacity-40 grayscale" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Bustina del giorno aperta</p>
        <p className="flex items-center gap-1.5 text-sm text-white/50">
          <Clock size={14} /> La prossima tra {formatWait(ms)}
        </p>
      </div>
    </div>
  );
}

function ShopPack({ kind, coins, onOpen }: { kind: PackKind; coins: number; onOpen: () => void }) {
  const pack = PACKS[kind];
  const missing = pack.price - coins;
  return (
    <div className="flex flex-col items-center rounded-3xl bg-night-800 p-3 pt-4 text-center ring-1 ring-white/5">
      <PackArt pack={pack} className={`w-24 text-[13px] ${missing > 0 ? "opacity-70" : ""}`} />
      <p className="mt-3 font-black leading-tight">{pack.name}</p>
      <p className="mt-0.5 min-h-[2.5em] text-xs text-white/50">{pack.tagline}</p>
      <button
        onClick={onOpen}
        disabled={missing > 0}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gold-400 py-2.5 font-bold text-night-950 transition active:scale-[0.97] disabled:bg-night-700 disabled:text-white/45"
      >
        <Coins size={16} /> {pack.price}
      </button>
      <p className="mt-1.5 h-4 text-[11px] text-white/40">{missing > 0 ? `Ti mancano ${missing} gettoni` : ""}</p>
    </div>
  );
}

function HowToEarn() {
  return (
    <details className="group mt-6 rounded-2xl bg-night-800/60 p-4 ring-1 ring-white/5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-white/80">
        <HelpCircle size={18} className="text-gold-400" /> Come si guadagnano i gettoni
      </summary>
      <ul className="mt-3 space-y-1.5 text-sm text-white/60">
        <li>
          • <strong className="text-white/85">{REWARDS.perGame} gettoni</strong> per ogni partita terminata in cui giochi (o che conduci da master).
        </li>
        <li>
          • Se chiudi in attivo, <strong className="text-white/85">un gettone ogni 10 centesimi vinti</strong>, fino a {REWARDS.maxWinBonus} in più.
        </li>
        <li>• Al massimo {REWARDS.gamesPerDay} partite premiate al giorno.</li>
        <li>• I doppioni diventano gettoni: più è raro il pezzo, più ne vale.</li>
        <li>
          • Rarità:{" "}
          {(["comune", "rara", "epica", "leggendaria"] as const).map((r, i) => (
            <span key={r}>
              {i > 0 && ", "}
              <span style={{ color: RARITY_INFO[r].color }}>{RARITY_INFO[r].label.toLowerCase()}</span> {RARITY_INFO[r].weight}%
            </span>
          ))}
          .
        </li>
      </ul>
    </details>
  );
}

/** L'album: i pezzi trovati a colori, quelli da trovare in ombra. */
function Album({ owned }: { owned: ReadonlySet<string> }) {
  const categories = catalog.categories.filter((c) => collectibles.some((i) => i.category === c.id));
  return (
    <section aria-label="Album" className="mt-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/45">Album</h2>
      <div className="space-y-6">
        {categories.map((c) => {
          const items = collectibles.filter((i) => i.category === c.id);
          const p = progressOf(owned, c.id);
          return (
            <div key={c.id}>
              <p className="mb-2 flex items-baseline justify-between">
                <span className="font-bold">{c.label}</span>
                <span className={`text-sm tabular ${p.owned === p.total ? "font-bold text-gold-400" : "text-white/45"}`}>
                  {p.owned === p.total ? "Completo! " : ""}
                  {p.owned}/{p.total}
                </span>
              </p>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {items.map((it) => {
                  const has = owned.has(it.id);
                  const r = RARITY_INFO[rarityOf(it.id)];
                  return (
                    <li
                      key={it.id}
                      className="relative overflow-hidden rounded-xl bg-night-800 ring-2"
                      style={{ ["--tw-ring-color" as string]: has ? r.color : "rgba(255,255,255,0.05)" }}
                      title={has ? `${it.label} · ${r.label}` : `Da trovare · ${r.label}`}
                    >
                      <Character
                        config={{ [it.category]: it.id }}
                        crop={cropAround(it.box)}
                        className={has ? "bg-gradient-to-b from-night-700 to-night-900" : "opacity-25 brightness-0 invert"}
                        label={has ? it.label : undefined}
                      />
                      {!has && (
                        <span className="absolute inset-0 grid place-items-center text-white/35">
                          <Lock size={16} />
                        </span>
                      )}
                      <span className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full" style={{ background: r.color }} aria-hidden />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
