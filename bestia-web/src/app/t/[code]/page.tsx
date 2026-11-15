"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getOnline, normalizeCode } from "@/lib/online";

/**
 * Link corto della vista TV: `/t/KX7P2` (o `/KX7P2`, riscritto qui da next.config.ts).
 * Trova la partita dal codice, senza badare a maiuscole e minuscole, e apre `/tv/[id]`.
 * Chi non la vede ancora diventa spettatore tramite watch_game (findGameByCode, 0007).
 */
export default function ShortTvPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const online = getOnline();
  const clean = normalizeCode(code ?? "");
  const [missing, setMissing] = useState<{ code: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    online
      .findGameByCode(clean)
      .then((game) => {
        if (!alive) return;
        if (game) router.replace(`/tv/${game.id}`);
        else setMissing({ code: clean, error: false });
      })
      .catch(() => alive && setMissing({ code: clean, error: true }));
    return () => {
      alive = false;
    };
  }, [online, clean, router]);

  if (!online) return <Full>Per aprire la vista TV con il codice l&apos;app deve essere online.</Full>;
  if (missing?.code !== clean) return <Full>Cerco la partita {clean}…</Full>;
  return (
    <Full>
      <div>
        <p className="text-[1.4em] font-bold text-white">
          {missing.error ? "Non riesco a cercare la partita" : `Nessuna partita con il codice ${clean}`}
        </p>
        <p className="mt-[0.5em]">
          {missing.error ? "Controlla la connessione e riprova." : "Controlla il codice sul telefono del master."}
        </p>
        <Link
          href="/tv"
          className="mt-[1em] inline-block rounded-[0.8em] bg-gold-400 px-[1.2em] py-[0.6em] font-bold text-night-950 outline-none focus-visible:ring-4 focus-visible:ring-white"
        >
          Scrivi un altro codice
        </Link>
      </div>
    </Full>
  );
}

function Full({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-dvh place-items-center bg-night-950 p-[4vh] text-center text-[clamp(18px,2.2vw,48px)] text-white/60">
      {children}
    </div>
  );
}
