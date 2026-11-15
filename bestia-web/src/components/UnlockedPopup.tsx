"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Coins, Gift, PackageOpen } from "lucide-react";
import { rewardLabel } from "@/lib/achievements";
import { refreshCollection } from "@/lib/avatar/collection";
import { play } from "@/lib/sounds";
import { useGameUnlocks, type UnlocksService } from "@/lib/unlocks";

const seenKey = (gameId: string) => `bestia:festa:${gameId}`;

function wasSeen(gameId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(gameId)) === "1";
  } catch {
    return false;
  }
}

function markSeen(gameId: string) {
  try {
    window.localStorage.setItem(seenKey(gameId), "1");
  } catch {
    /* storage bloccato: al massimo si rivede */
  }
}

/**
 * A fine partita, a chi ha un account: «Hai sbloccato…» con gli obiettivi presi proprio
 * stasera e il tasto per riscuoterli. Si vede una volta sola per partita su questo telefono.
 */
export function UnlockedPopup({ gameId, ended, svc }: { gameId: string; ended: boolean; svc?: UnlocksService | null }) {
  const unlocks = useGameUnlocks(gameId, ended, svc);
  const mine = unlocks?.players.find((p) => p.mine);
  const [closed, setClosed] = useState<string | null>(null);
  // si segna come visto solo quando lo si chiude: chi esce dalla pagina prima lo ritrova
  const show = !!mine && closed !== gameId && !wasSeen(gameId);
  const celebrated = useRef<string | null>(null);

  useEffect(() => {
    if (!show || celebrated.current === gameId) return;
    celebrated.current = gameId;
    play("rare");
    // il pallino delle bustine deve contare i nuovi premi
    void refreshCollection();
  }, [show, gameId]);

  if (!show || !mine) return null;
  const n = mine.achievements.length;
  const close = () => {
    markSeen(gameId);
    setClosed(gameId);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-night-950/85 p-6 backdrop-blur-sm" role="dialog" aria-label="Obiettivi sbloccati" onClick={close}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="absolute -top-8 animate-coin-fall text-2xl motion-reduce:hidden" style={{ left: `${(i * 7.1 + 3) % 100}%`, animationDelay: `${(i % 5) * 0.15}s`, animationIterationCount: 1 }}>
            {["🎉", "🏅", "✨"][i % 3]}
          </span>
        ))}
      </div>
      <div className="w-full max-w-sm animate-pop-in rounded-3xl bg-night-800 p-5 text-center ring-1 ring-gold-400/50" onClick={(e) => e.stopPropagation()}>
        <p className="text-5xl" aria-hidden>
          {n > 1 ? "🏅" : mine.achievements[0].emoji}
        </p>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.25em] text-gold-400">Stasera hai sbloccato</p>
        <p className="mt-1 text-2xl font-black">{n === 1 ? mine.achievements[0].title : `${n} obiettivi!`}</p>
        <ul className="mt-4 space-y-2 text-left">
          {mine.achievements.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-night-900 px-3 py-2.5">
              <span className="text-2xl" aria-hidden>
                {a.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-tight">{a.title}</p>
                <p className="text-xs text-white/50">{a.description}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-gold-400">
                {a.reward.pack ? <PackageOpen size={13} /> : <Coins size={13} />}
                {a.reward.pack ? rewardLabel(a.reward).replace("Bustina ", "") : a.reward.coins}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex gap-2">
          <button onClick={close} className="flex-1 rounded-2xl bg-night-700 py-3 font-bold">
            Dopo
          </button>
          <Link href="/obiettivi" onClick={() => markSeen(gameId)} className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-2xl bg-gold-400 py-3 font-bold text-night-950">
            <Gift size={18} /> Riscuoti
          </Link>
        </div>
      </div>
    </div>
  );
}
