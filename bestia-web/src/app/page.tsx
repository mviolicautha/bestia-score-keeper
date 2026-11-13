"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ChevronRight, Plus, Share, Trash2, X } from "lucide-react";
import { formatCents, replay, type GameState } from "@/engine";
import { getRepository, type GameMeta } from "@/lib/repository";
import { Button, Sheet } from "@/components/Sheet";
import { ConfirmDialog, type ConfirmRequest } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase";
import { normalizeCode } from "@/lib/online";
import { Disclaimer } from "@/components/Disclaimer";

const BET_STEP = 30;
const INSTALL_HINT_KEY = "bestia:install-hint-dismissed";

interface GameCard extends GameMeta {
  state: GameState | null;
}

/** Su iPhone/iPad Safari non mostra un pulsante "Installa": suggeriamo come fare. */
function shouldShowInstallHint(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  try {
    if (localStorage.getItem(INSTALL_HINT_KEY) === "1") return false;
  } catch {
    /* storage non disponibile */
  }
  return ios && !standalone;
}
const noSubscribe = () => () => {};

async function loadCards(): Promise<GameCard[]> {
  const repo = getRepository();
  const games = await repo.listGames();
  return Promise.all(
    games.map(async (g) => {
      try {
        const events = await repo.loadEvents(g.id);
        return { ...g, state: replay(events.map((e) => e.event)).state };
      } catch {
        return { ...g, state: null };
      }
    }),
  );
}

export default function Home() {
  const router = useRouter();
  const [games, setGames] = useState<GameCard[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [bet, setBet] = useState(BET_STEP);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const installHint = useSyncExternalStore(noSubscribe, shouldShowInstallHint, () => false);
  const showInstall = installHint && !installDismissed;

  const refresh = useCallback(() => loadCards().then(setGames), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const defaultTitle = `Bestia del ${new Date().toLocaleDateString("it-IT")}`;

  async function create() {
    const id = await getRepository().createGame(title.trim() || defaultTitle, bet);
    router.push(`/partita/${id}`);
  }

  function dismissInstall() {
    setInstallDismissed(true);
    try {
      localStorage.setItem(INSTALL_HINT_KEY, "1");
    } catch {
      /* storage non disponibile */
    }
  }

  const inProgress = games?.filter((g) => g.status !== "ended") ?? [];
  const ended = games?.filter((g) => g.status === "ended") ?? [];

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center gap-4">
        <Image src="/icons/icon-192.png" alt="" width={56} height={56} className="rounded-2xl shadow-lg ring-1 ring-white/10" priority />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">♠ Bestia</p>
          <h1 className="text-3xl font-black leading-tight">Le tue partite</h1>
        </div>
      </header>

      {showInstall && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-blue-500/10 p-4 text-sm ring-1 ring-blue-400/30">
          <Share size={20} className="mt-0.5 shrink-0 text-blue-300" />
          <p className="flex-1 text-white/80">
            Per usarla come un&apos;app: tocca <strong>Condividi</strong> in Safari e poi{" "}
            <strong>Aggiungi alla schermata Home</strong>.
          </p>
          <button onClick={dismissInstall} className="rounded-full p-1 text-white/50 hover:bg-white/10" aria-label="Nascondi suggerimento">
            <X size={18} />
          </button>
        </div>
      )}

      <Button className="flex w-full items-center justify-center gap-2 py-4 text-lg" onClick={() => setCreating(true)}>
        <Plus size={22} /> Nuova partita
      </Button>

      {isSupabaseConfigured && <JoinByCode />}

      {games?.length === 0 && (
        <p className="mt-10 text-center text-white/45">
          Nessuna partita ancora.
          <br />
          Creane una e aggiungi i giocatori.
        </p>
      )}

      {inProgress.length > 0 && <Section title="In corso" games={inProgress} onDelete={askDelete} />}
      {ended.length > 0 && <Section title="Terminate" games={ended} onDelete={askDelete} />}

      <p className="mt-10 text-center text-xs text-white/35">
        {isSupabaseConfigured
          ? "Qui ci sono le partite che hai creato tu (sei il master). Per seguire quella di un altro, inquadra il suo QR o inserisci il codice."
          : "Le partite sono salvate su questo dispositivo. Account, inviti e storico condiviso arriveranno con il backend."}
      </p>
      <Disclaimer className="mt-6" />

      <Sheet open={creating} onClose={() => setCreating(false)} title="Nuova partita">
        <label className="block text-sm text-white/60" htmlFor="title">
          Nome della serata
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultTitle}
          className="mt-1 w-full rounded-xl bg-night-900 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-blue-500"
        />
        <p className="mt-5 text-sm text-white/60">Messa del mazziere</p>
        <div className="mt-1 flex items-center justify-between rounded-xl bg-night-900 p-2 ring-1 ring-white/10">
          <Button variant="secondary" className="w-14" disabled={bet <= BET_STEP} onClick={() => setBet(bet - BET_STEP)} aria-label="Diminuisci messa">
            −
          </Button>
          <span className="tabular text-3xl font-black text-gold-400">{formatCents(bet)}</span>
          <Button variant="secondary" className="w-14" onClick={() => setBet(bet + BET_STEP)} aria-label="Aumenta messa">
            +
          </Button>
        </div>
        <p className="mt-2 text-xs text-white/40">A multipli di 0,30 € così il piatto si divide sempre in tre.</p>
        <Button className="mt-6 w-full" onClick={create}>
          Crea e aggiungi giocatori
        </Button>
      </Sheet>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </main>
  );

  function askDelete(g: GameCard) {
    setConfirm({
      title: "Eliminare la partita?",
      message: `"${g.title}" verrà eliminata da questo dispositivo. Non si può annullare.`,
      confirmLabel: "Elimina",
      danger: true,
      onConfirm: async () => {
        await getRepository().deleteGame(g.id);
        refresh();
      },
    });
  }
}

function Section({ title, games, onDelete }: { title: string; games: GameCard[]; onDelete: (g: GameCard) => void }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">{title}</h2>
      <ul className="space-y-2">
        {games.map((g) => {
          const s = g.state;
          const leader = s ? [...s.players].sort((a, b) => b.balanceCents - a.balanceCents)[0] : undefined;
          return (
            <li key={g.id} className="flex items-center rounded-2xl bg-night-800 ring-1 ring-white/5">
              <Link href={`/partita/${g.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.title}</span>
                  <span className="block truncate text-xs text-white/45">
                    {s ? `${s.players.length} giocatori · ${s.handsPlayed} mani` : "Dati non leggibili"}
                    {s && g.status !== "ended" && ` · piatto ${formatCents(s.potCents)}`}
                  </span>
                  {leader && leader.balanceCents > 0 && (
                    <span className="mt-1 block truncate text-xs text-white/60">
                      {g.status === "ended" ? "Ha vinto" : "In testa"} <strong className="text-white">{leader.name}</strong>{" "}
                      <span className="tabular font-bold text-gain">{formatCents(leader.balanceCents, { signed: true })}</span>
                    </span>
                  )}
                </span>
                <span className="text-right text-xs text-white/35">
                  {new Date(g.updatedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                </span>
                <ChevronRight size={18} className="shrink-0 text-white/30" />
              </Link>
              <button
                onClick={() => onDelete(g)}
                className="mr-2 rounded-full p-2 text-white/30 hover:bg-white/10 hover:text-red-400"
                aria-label={`Elimina ${g.title}`}
              >
                <Trash2 size={18} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Unirsi alla partita di un altro dettando il codice (in alternativa al QR). */
function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = normalizeCode(code);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length >= 4) router.push(`/g/${clean}`);
      }}
      className="mt-3 flex items-center gap-2 rounded-2xl bg-night-800 p-2 pl-4 ring-1 ring-white/5"
    >
      <label htmlFor="join-code" className="shrink-0 text-sm text-white/60">
        Hai un codice?
      </label>
      <input
        id="join-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ABC12"
        maxLength={8}
        autoCapitalize="characters"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-xl bg-night-900 px-3 py-2 font-mono uppercase tracking-[0.3em] outline-none ring-1 ring-white/10 focus:ring-blue-500"
      />
      <Button type="submit" variant="secondary" className="px-4 py-2 text-sm" disabled={clean.length < 4}>
        Entra
      </Button>
    </form>
  );
}
