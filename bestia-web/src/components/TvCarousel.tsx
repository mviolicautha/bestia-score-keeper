"use client";

import { useEffect, useState } from "react";
import type { TvFact } from "@/lib/tvFacts";

/** Ogni quanto cambia la schermata del pannello. */
export const SLIDE_MS = 9000;

export interface Slide {
  key: string;
  node: React.ReactNode;
}

/**
 * Pannello della TV che fa girare le schermate (ultime mani, curiosità, premi…).
 * Quando cambia `resetKey` (una nuova mano) torna alla prima.
 */
export function TvCarousel({ slides, resetKey }: { slides: Slide[]; resetKey: number }) {
  const [index, setIndex] = useState(0);
  const [seenReset, setSeenReset] = useState(resetKey);
  if (resetKey !== seenReset) {
    setSeenReset(resetKey);
    setIndex(0);
  }

  const count = slides.length;
  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearInterval(t);
  }, [count, resetKey]);

  const current = slides[index % Math.max(1, count)];
  if (!current) return null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div key={current.key} className="min-h-0 flex-1 animate-pop-in overflow-hidden">
        {current.node}
      </div>
      {count > 1 && (
        <div className="flex shrink-0 justify-center gap-[0.35em] pt-[0.4em]" aria-hidden>
          {slides.map((s, i) => (
            <span
              key={s.key}
              className={`h-[0.35em] rounded-full transition-all ${i === index % count ? "w-[1.4em] bg-gold-400" : "w-[0.35em] bg-white/20"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TONE: Record<TvFact["tone"], string> = {
  gain: "text-gain",
  loss: "text-loss",
  gold: "text-gold-400",
  plain: "text-white",
};

/** Una curiosità a tutto pannello. */
export function FactCard({ emoji, title, headline, detail, tone }: Omit<TvFact, "id">) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[0.15em] text-center">
      <p className="text-[2.6em] leading-none" aria-hidden>
        {emoji}
      </p>
      <p className="mt-[0.2em] text-[0.7em] font-bold uppercase tracking-[0.25em] text-gold-400">{title}</p>
      <p className={`tabular line-clamp-2 text-[1.6em] font-black leading-tight ${TONE[tone]}`}>{headline}</p>
      <p className="max-w-[22em] text-[0.85em] text-white/65">{detail}</p>
    </div>
  );
}
