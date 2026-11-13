"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, Sparkles, X } from "lucide-react";
import { catalog, getItem } from "@/lib/avatar/catalog";
import { bestRarity, PACKS, RARITIES, RARITY_INFO, type PackCard, type PackInfo, type PackKind } from "@/lib/avatar/packs";
import type { PackResult } from "@/lib/avatar/collection";
import { play, type PackSound } from "@/lib/sounds";
import { Character, cropAround } from "./Character";
import { Button } from "./Sheet";

/**
 * Apertura di una bustina, a tutto schermo:
 * 1. la bustina galleggia: tre tocchi per strapparla (trema sempre di più);
 * 2. si strappa con un lampo del colore della carta più rara (un indizio!);
 * 3. le carte escono coperte: un tocco le gira, quelle rare brillano già da coperte;
 * 4. riepilogo con i pezzi nuovi e i gettoni dei doppioni.
 *
 * Il risultato arriva dal database mentre si tocca la bustina (`result` null = in arrivo).
 */

const TAPS_TO_OPEN = 3;

type Stage = "sealed" | "tearing" | "cards" | "summary";

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non supportato */
  }
};

export function PackOpening({
  kind,
  result,
  error,
  onClose,
  onWear,
  againLabel,
  onAgain,
}: {
  kind: PackKind;
  result: PackResult | null;
  error: string | null;
  onClose: () => void;
  /** "Prova addosso": apre l'editor del personaggio. */
  onWear?: () => void;
  /** "Apri un'altra" (se si può). */
  againLabel?: string;
  onAgain?: () => void;
}) {
  const pack = PACKS[kind];
  const [stage, setStage] = useState<Stage>("sealed");
  const [taps, setTaps] = useState(0);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [boom, setBoom] = useState(0); // coriandoli + scossa per le leggendarie
  const cards = useMemo(() => result?.cards ?? [], [result]);
  const best = bestRarity(cards);

  const sfx = useCallback((s: PackSound) => play(s), []);

  // tre tocchi e il risultato arrivato: si strappa
  useEffect(() => {
    if (stage !== "sealed" || taps < TAPS_TO_OPEN || !result) return;
    const t = setTimeout(() => {
      setStage("tearing");
      sfx("rip");
      vibrate([20, 30, 60]);
    }, 0);
    return () => clearTimeout(t);
  }, [stage, taps, result, sfx]);

  // finito lo strappo, escono le carte
  const empty = cards.length === 0;
  useEffect(() => {
    if (stage !== "tearing") return;
    const t = setTimeout(() => setStage(empty ? "summary" : "cards"), 1000);
    return () => clearTimeout(t);
  }, [stage, empty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function tapPack() {
    if (taps >= TAPS_TO_OPEN) return;
    setTaps(taps + 1);
    sfx("shake");
    vibrate(12 + taps * 10);
  }

  function tapCard() {
    const card = cards[index];
    if (!card || leaving) return;
    if (!flipped) {
      setFlipped(true);
      sfx("flip");
      const delay = card.rarity === "leggendaria" ? 650 : 380;
      setTimeout(() => {
        if (card.rarity === "leggendaria") {
          sfx("legendary");
          setBoom((b) => b + 1);
          vibrate([40, 60, 40, 60, 120]);
        } else if (card.rarity === "epica") {
          sfx("epic");
          vibrate([30, 40, 60]);
        } else if (card.rarity === "rara") sfx("rare");
        if (!card.isNew) setTimeout(() => sfx("coins"), 350);
      }, delay);
      return;
    }
    // carta già girata: vola via, avanti la prossima
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      setFlipped(false);
      if (index + 1 >= cards.length) setStage("summary");
      else setIndex(index + 1);
    }, 380);
  }

  const glow = RARITY_INFO[best].glow;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-night-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Apertura: ${pack.name}`}
      style={{ backgroundImage: `radial-gradient(circle at 50% 42%, ${stage === "sealed" ? `${pack.colors.via}40` : glow.replace(/[\d.]+\)$/, "0.28)")}, transparent 65%)` }}
    >
      <div key={boom} className={`relative flex flex-1 flex-col ${boom ? "animate-screen-shake motion-reduce:animate-none" : ""}`}>
        <header className="relative z-20 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">{pack.name}</p>
          <button onClick={onClose} className="rounded-full p-2 text-white/60 hover:bg-white/10" aria-label="Chiudi">
            <X size={22} />
          </button>
        </header>

        {/* raggi di luce dietro a tutto */}
        {stage !== "summary" && (
          <Rays color={stage === "sealed" ? `${pack.colors.via}55` : glow.replace(/[\d.]+\)$/, "0.4)")} fast={stage !== "sealed"} />
        )}

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
          {error ? (
            <div className="max-w-xs text-center">
              <p className="text-lg font-bold">Bustina non aperta</p>
              <p className="mt-2 text-sm text-white/60">{error}</p>
              <Button className="mt-6 w-full" onClick={onClose}>
                Ok
              </Button>
            </div>
          ) : stage === "sealed" || stage === "tearing" ? (
            <SealedPack pack={pack} taps={taps} tearing={stage === "tearing"} waiting={taps >= TAPS_TO_OPEN && !result} onTap={tapPack} glow={glow} />
          ) : stage === "cards" ? (
            <CardStack cards={cards} index={index} flipped={flipped} leaving={leaving} onTap={tapCard} />
          ) : (
            <Summary cards={cards} pack={pack} />
          )}
        </div>

        <footer className="relative z-20 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {stage === "cards" && (
            <div className="flex items-center justify-between gap-3">
              <Dots cards={cards} index={index} flipped={flipped} />
              <button
                onClick={() => setStage("summary")}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white/60 ring-1 ring-white/15 hover:bg-white/10"
              >
                Rivela tutto
              </button>
            </div>
          )}
          {stage === "summary" && (
            <div className="mx-auto flex max-w-sm flex-col gap-2">
              {onWear && (
                <Button className="flex items-center justify-center gap-2" onClick={onWear}>
                  <Sparkles size={18} /> Prova addosso
                </Button>
              )}
              {onAgain && (
                <Button variant="secondary" onClick={onAgain}>
                  {againLabel ?? "Apri un'altra"}
                </Button>
              )}
              <Button variant="ghost" onClick={onClose}>
                Chiudi
              </Button>
            </div>
          )}
        </footer>

        {boom > 0 && <Confetti key={`c${boom}`} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bustina

/** Il disegno della bustina (si usa anche, piccolo, nella pagina delle bustine). */
export function PackArt({ pack, className = "", style }: { pack: PackInfo; className?: string; style?: React.CSSProperties }) {
  const { from, via, to, ink } = pack.colors;
  const crimp = "repeating-linear-gradient(90deg, rgba(0,0,0,0.28) 0 3px, rgba(255,255,255,0.14) 3px 6px)";
  return (
    <div
      className={`relative aspect-[5/7] overflow-hidden rounded-[12%/8.5%] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] ${className}`}
      style={{ background: `linear-gradient(160deg, ${from}, ${via} 48%, ${to})`, ...style }}
      aria-hidden
    >
      {/* righe diagonali e lamina che luccica */}
      <div className="absolute inset-0 opacity-20" style={{ background: "repeating-linear-gradient(135deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 14px)" }} />
      <div
        className="absolute inset-0 animate-foil mix-blend-overlay motion-reduce:animate-none"
        style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.75) 50%, transparent 65%)", backgroundSize: "250% 100%" }}
      />
      <div className="absolute inset-x-0 top-0 h-[7%]" style={{ background: crimp }} />
      <div className="absolute inset-x-0 bottom-0 h-[7%]" style={{ background: crimp }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ color: ink }}>
        <span className="text-[2.6em] leading-none drop-shadow-[0_3px_0_rgba(0,0,0,0.25)]">♠</span>
        <span className="mt-[0.3em] text-[0.62em] font-black uppercase tracking-[0.4em]">Bestia</span>
        <span className="mt-[0.9em] px-[0.6em] text-[0.78em] font-black leading-tight">{pack.short}</span>
        <span className="mt-[0.5em] rounded-full px-[0.7em] py-[0.15em] text-[0.5em] font-bold uppercase tracking-wider ring-1" style={{ borderColor: ink, ["--tw-ring-color" as string]: `${ink}88` }}>
          {pack.size} pezzi
        </span>
      </div>
    </div>
  );
}

// strappo a zig-zag poco sotto il bordo superiore
const TEAR_Y = 17;
const ZIGZAG = Array.from({ length: 13 }, (_, i) => `${(i * 100) / 12}% ${TEAR_Y + (i % 2 ? 1.6 : -1.6)}%`);
const CAP_CLIP = `polygon(0 0, 100% 0, ${[...ZIGZAG].reverse().join(", ")})`;
const BODY_CLIP = `polygon(${ZIGZAG.join(", ")}, 100% 100%, 0 100%)`;

function SealedPack({
  pack,
  taps,
  tearing,
  waiting,
  onTap,
  glow,
}: {
  pack: PackInfo;
  taps: number;
  tearing: boolean;
  waiting: boolean;
  onTap: () => void;
  glow: string;
}) {
  const size = "w-[min(62vw,250px)] text-[min(9vw,38px)]";
  return (
    <div className="flex flex-col items-center">
      <button
        onClick={onTap}
        disabled={tearing}
        className="relative outline-none"
        aria-label={`Tocca per aprire (${Math.max(0, TAPS_TO_OPEN - taps)} tocchi)`}
      >
        <div className={tearing ? "" : "animate-pack-float motion-reduce:animate-none"}>
          <div
            key={taps}
            className={waiting ? "animate-pack-rumble" : taps > 0 && !tearing ? "animate-pack-shake motion-reduce:animate-none" : ""}
            style={{ ["--amp" as string]: String(1 + taps * 0.8) }}
          >
            <div className={`relative ${size}`}>
              {/* corpo e linguetta: due copie ritagliate, così la linguetta può volare via */}
              <div className={tearing ? "animate-body-out" : ""} style={{ clipPath: BODY_CLIP }}>
                <PackArt pack={pack} />
              </div>
              <div className={`absolute inset-0 ${tearing ? "animate-cap-off" : ""}`} style={{ clipPath: CAP_CLIP }}>
                <PackArt pack={pack} />
              </div>
              {/* linea dello strappo che si "carica" a ogni tocco */}
              {!tearing && (
                <div className="pointer-events-none absolute inset-x-[4%]" style={{ top: `${TEAR_Y}%` }}>
                  <div className="h-[3px] rounded-full bg-white/15" />
                  <div
                    className="absolute left-0 top-0 h-[3px] rounded-full bg-white shadow-[0_0_12px_3px_rgba(255,255,255,0.8)] transition-[width] duration-300"
                    style={{ width: `${(Math.min(taps, TAPS_TO_OPEN) / TAPS_TO_OPEN) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        {tearing && (
          <span
            className="pointer-events-none absolute left-1/2 top-[17%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 animate-flash rounded-full"
            style={{ background: `radial-gradient(circle, white 0%, ${glow} 35%, transparent 70%)` }}
          />
        )}
      </button>
      <p className={`mt-10 h-6 text-center text-sm font-semibold text-white/70 ${tearing ? "opacity-0" : "animate-bounce-soft motion-reduce:animate-none"}`}>
        {waiting ? "Un attimo…" : taps === 0 ? "Tocca la bustina per aprirla" : taps === 1 ? "Ancora!" : "Strappala!"}
      </p>
    </div>
  );
}

function Rays({ color, fast }: { color: string; fast: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute left-1/2 top-[45%] h-[170vmax] w-[170vmax] animate-rays motion-reduce:animate-none"
        style={{
          background: `repeating-conic-gradient(${color} 0deg 6deg, transparent 6deg 20deg)`,
          maskImage: "radial-gradient(circle, black 0%, transparent 42%)",
          WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 42%)",
          animationDuration: fast ? "9s" : "22s",
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- carte

const CARD_SIZE = "w-[min(66vw,260px)]";

function CardStack({ cards, index, flipped, leaving, onTap }: { cards: PackCard[]; index: number; flipped: boolean; leaving: boolean; onTap: () => void }) {
  const rest = cards.slice(index + 1, index + 4);
  const card = cards[index];
  if (!card) return null;
  const tease = !flipped && (card.rarity === "epica" || card.rarity === "leggendaria");
  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${CARD_SIZE} aspect-[3/4]`}>
        {/* le carte che aspettano, sfalsate dietro */}
        {rest
          .map((c, i) => (
            <div
              key={`${index + 1 + i}-${c.id}`}
              className="absolute inset-0"
              style={{ transform: `translate(${(i + 1) * 7}px, ${(i + 1) * -7}px) rotate(${(i + 1) * 2.5}deg)`, zIndex: 3 - i }}
            >
              <CardBack />
            </div>
          ))
          .reverse()}
        <button
          key={index}
          onClick={onTap}
          className={`absolute inset-0 z-10 outline-none motion-reduce:animate-none ${leaving ? "animate-card-out" : "animate-card-in"}`}
          style={{ perspective: "1200px" }}
          aria-label={flipped ? `${getItem(card.id)?.label ?? card.id}: tocca per la prossima` : "Tocca per girare la carta"}
        >
          <div
            className={`relative h-full w-full transition-transform motion-reduce:transition-none ${tease && !flipped ? "animate-pack-rumble" : ""}`}
            style={{
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              transitionDuration: card.rarity === "leggendaria" ? "900ms" : "550ms",
              transitionTimingFunction: "cubic-bezier(0.3, 1.4, 0.5, 1)",
              ["--amp" as string]: card.rarity === "leggendaria" ? "0.6" : "0.3",
            }}
          >
            <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
              <CardBack glow={tease ? RARITY_INFO[card.rarity].glow : card.rarity === "rara" ? RARITY_INFO.rara.glow : undefined} />
            </div>
            <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
              <CardFront card={card} big revealed={flipped} />
            </div>
          </div>
        </button>
      </div>
      <p className="mt-8 h-5 text-sm font-semibold text-white/60">{flipped ? (index + 1 < cards.length ? "Tocca per la prossima" : "Tocca per il riepilogo") : "Tocca per girare"}</p>
    </div>
  );
}

function CardBack({ glow }: { glow?: string }) {
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-[9%/7%] bg-night-800 ring-2 ring-gold-400/70 ${glow ? "animate-tease motion-reduce:animate-none" : ""}`}
      style={{ ["--glow" as string]: glow, boxShadow: glow ? undefined : "0 18px 40px -12px rgba(0,0,0,0.8)" }}
    >
      <div
        className="absolute inset-[6%] rounded-[7%/5%] ring-1 ring-gold-400/40"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,213,74,0.18), transparent 60%), repeating-linear-gradient(45deg, rgba(255,213,74,0.08) 0 6px, transparent 6px 12px), repeating-linear-gradient(-45deg, rgba(255,213,74,0.08) 0 6px, transparent 6px 12px)",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-gold-400">
        <span className="text-6xl leading-none">♠</span>
        <span className="mt-2 text-xs font-black uppercase tracking-[0.4em]">Bestia</span>
      </div>
    </div>
  );
}

/** La carta girata: il pezzo, la rarità, e "Nuovo!" oppure i gettoni del doppione. */
export function CardFront({ card, big = false, revealed = true }: { card: PackCard; big?: boolean; revealed?: boolean }) {
  const item = getItem(card.id);
  const r = RARITY_INFO[card.rarity];
  const category = catalog.categories.find((c) => c.id === item?.category)?.label;
  const legendary = card.rarity === "leggendaria";
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[9%/7%] p-[5%]"
      style={{
        background: `linear-gradient(155deg, ${r.color}, ${r.color}55 45%, #10162a 100%)`,
        boxShadow: revealed && card.rarity !== "comune" ? `0 0 ${big ? 50 : 18}px ${big ? 8 : 2}px ${r.glow}` : "0 14px 30px -10px rgba(0,0,0,0.8)",
      }}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-[6%/4.5%] bg-night-900/85 ring-1 ring-white/15">
        <div className="relative flex-1 bg-gradient-to-b from-night-600 to-night-900">
          {item && <Character config={{ [item.category]: item.id }} crop={cropAround(item.box, 1.25)} className="absolute inset-0 m-auto h-full" />}
          {legendary && (
            <div
              className="pointer-events-none absolute inset-0 animate-holo mix-blend-color-dodge opacity-60 motion-reduce:animate-none"
              style={{ background: "linear-gradient(115deg, transparent 20%, rgba(255,240,180,0.7) 35%, rgba(255,120,220,0.5) 45%, rgba(120,220,255,0.5) 55%, transparent 70%)", backgroundSize: "200% 100%" }}
            />
          )}
        </div>
        <div className={`text-center ${big ? "px-3 py-2.5" : "px-1.5 py-1"}`}>
          <p className={`truncate font-black leading-tight ${big ? "text-lg" : "text-[11px]"}`}>{item?.label ?? card.id}</p>
          <p className={`font-bold uppercase tracking-wider ${big ? "mt-0.5 text-xs" : "text-[9px]"}`} style={{ color: r.color }}>
            {r.label}
            {big && category ? <span className="text-white/45"> · {category}</span> : null}
          </p>
        </div>
      </div>
      {revealed &&
        (card.isNew ? (
          <span
            className={`absolute right-[4%] top-[4%] animate-stamp rounded-lg bg-gain font-black uppercase text-night-950 shadow-lg motion-reduce:animate-none ${big ? "px-2.5 py-1 text-sm" : "px-1 py-0.5 text-[8px]"}`}
          >
            Nuovo!
          </span>
        ) : (
          <span
            className={`absolute right-[4%] top-[4%] flex animate-stamp items-center gap-1 rounded-lg bg-night-950/90 font-black text-gold-400 shadow-lg ring-1 ring-gold-400/50 motion-reduce:animate-none ${big ? "px-2.5 py-1 text-sm" : "px-1 py-0.5 text-[8px]"}`}
          >
            <Coins size={big ? 15 : 9} /> +{card.coins}
          </span>
        ))}
    </div>
  );
}

function Dots({ cards, index, flipped }: { cards: PackCard[]; index: number; flipped: boolean }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Carta ${index + 1} di ${cards.length}`}>
      {cards.map((c, i) => {
        const shown = i < index || (i === index && flipped);
        return (
          <span
            key={i}
            className={`h-2.5 rounded-full transition-all ${i === index ? "w-6" : "w-2.5"}`}
            style={{ background: shown ? RARITY_INFO[c.rarity].color : "rgba(255,255,255,0.18)" }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- riepilogo

function Summary({ cards, pack }: { cards: PackCard[]; pack: PackInfo }) {
  const fresh = cards.filter((c) => c.isNew).length;
  const coins = cards.reduce((s, c) => s + c.coins, 0);
  const sorted = [...cards].sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity));
  return (
    <div className="w-full max-w-md text-center">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold-400">{pack.name}</p>
      <h2 className="mt-1 text-3xl font-black">{fresh === 0 ? "Tutti doppioni!" : fresh === cards.length ? "Tutti nuovi!" : "Ecco cosa c'era"}</h2>
      <div className="mx-auto mt-6 grid max-w-sm gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(3, cards.length)}, minmax(0, 1fr))` }}>
        {sorted.map((c, i) => (
          <div key={c.id} className="aspect-[3/4] animate-pop-in motion-reduce:animate-none" style={{ animationDelay: `${i * 90}ms` }}>
            <CardFront card={c} />
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-center gap-3 text-sm">
        {fresh > 0 && (
          <span className="rounded-full bg-gain/15 px-3 py-1.5 font-bold text-gain">
            {fresh} {fresh === 1 ? "pezzo nuovo" : "pezzi nuovi"}
          </span>
        )}
        {coins > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-gold-400/15 px-3 py-1.5 font-bold text-gold-400">
            <Coins size={15} /> +{coins} dai doppioni
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- coriandoli

const CONFETTI_COLORS = ["#ffbf2e", "#ffd54a", "#fff3c4", "#c06cff", "#4fa8ff", "#69f0ae", "#ff6b6b"];

function seeded(i: number, salt: number) {
  const v = Math.sin(i * 91.17 + salt * 13.73) * 43758.5453;
  return v - Math.floor(v);
}

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden motion-reduce:hidden" aria-hidden>
      {Array.from({ length: 60 }, (_, i) => {
        const angle = seeded(i, 1) * Math.PI * 2;
        const dist = 90 + seeded(i, 2) * 180;
        const w = 6 + seeded(i, 3) * 7;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-[42%] animate-confetti"
            style={{
              width: w,
              height: w * (seeded(i, 4) > 0.5 ? 0.45 : 1),
              borderRadius: seeded(i, 5) > 0.7 ? "50%" : 2,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              ["--dx" as string]: `${Math.cos(angle) * dist}px`,
              ["--dy" as string]: `${Math.sin(angle) * dist - 80}px`,
              ["--r" as string]: `${(seeded(i, 6) - 0.5) * 1080}deg`,
              animationDelay: `${seeded(i, 7) * 0.15}s`,
            }}
          />
        );
      })}
    </div>
  );
}

