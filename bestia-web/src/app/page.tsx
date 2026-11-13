"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { History, PackageOpen, Plus, Share, Trash2, UserRound, Users, X } from "lucide-react";
import { useCollection } from "@/lib/avatar/collection";
import { useAccount } from "@/lib/useAccount";
import { getGroups, type GroupSummary } from "@/lib/groups";
import { formatCents, replay, type GameState } from "@/engine";
import { getRepository, type GameMeta } from "@/lib/repository";
import { Button, Sheet } from "@/components/Sheet";
import { ConfirmDialog, type ConfirmRequest } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase";
import { normalizeCode } from "@/lib/online";
import { Disclaimer } from "@/components/Disclaimer";
import { FestiveLights, Snowfall } from "@/components/Festive";
import { useFestive } from "@/lib/season";

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
  // compagnie in cui si può creare la partita (solo con un account)
  const { account } = useAccount();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const registered = !!account?.username;
  useEffect(() => {
    const service = getGroups();
    if (!service || !registered) return;
    let alive = true;
    service.listMine().then(
      (list) => {
        if (!alive) return;
        setGroups(list);
        // /?compagnia=<id>: arrivo da "Nuova partita" nella pagina di una compagnia
        const wanted = new URLSearchParams(window.location.search).get("compagnia");
        if (wanted && list.some((g) => g.id === wanted)) {
          setGroupId(wanted);
          setCreating(true);
        }
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [registered]);
  const showInstall = installHint && !installDismissed;
  const festive = useFestive().active;

  const refresh = useCallback(() => loadCards().then(setGames), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const defaultTitle = `Bestia del ${new Date().toLocaleDateString("it-IT")}`;

  async function create() {
    const id = await getRepository().createGame(title.trim() || defaultTitle, bet, groupId || null);
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
    <main className="relative z-10 mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      {festive && <Snowfall />}
      {festive && <FestiveLights />}
      <header className="mb-6 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">{festive ? "❄ Bestia · Buone feste" : "♠ Bestia"}</p>
          <h1 className="truncate text-2xl font-black leading-tight">Le tue partite</h1>
        </div>
        <AccountLink />
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

      {/* La partita in corso è il motivo per cui si apre l'app: sta in cima, in grande. */}
      {inProgress.length > 0 && (
        <section aria-label="In corso" className="mb-3 space-y-3">
          {inProgress.map((g) => (
            <LiveCard key={g.id} game={g} onDelete={askDelete} />
          ))}
        </section>
      )}

      {/* Un solo bottone dorato per schermata: se c'è già una partita in corso, "Nuova" fa un passo indietro. */}
      {inProgress.length > 0 ? (
        <button
          onClick={() => setCreating(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/25 py-3.5 font-bold text-white/85 transition hover:border-gold-400/60 hover:text-white active:scale-[0.98]"
        >
          <Plus size={20} /> Nuova partita
        </button>
      ) : (
        <Button className="flex w-full items-center justify-center gap-2 py-4 text-lg" onClick={() => setCreating(true)}>
          <Plus size={22} /> Nuova partita
        </Button>
      )}

      {isSupabaseConfigured && <JoinByCode />}
      {isSupabaseConfigured && (
        <nav className="mt-3 grid auto-cols-fr grid-flow-col gap-2">
          <Link href="/compagnie" className="flex flex-col items-center gap-1.5 rounded-2xl bg-night-800 px-2 py-3 text-sm ring-1 ring-white/5 hover:bg-night-700">
            <Users size={20} className="shrink-0 text-gold-400" />
            <span className="max-w-full truncate font-semibold">Compagnie</span>
          </Link>
          <Link href="/storico" className="flex flex-col items-center gap-1.5 rounded-2xl bg-night-800 px-2 py-3 text-sm ring-1 ring-white/5 hover:bg-night-700">
            <History size={20} className="shrink-0 text-gold-400" />
            <span className="max-w-full truncate font-semibold">Storico</span>
          </Link>
          <PacksLink />
        </nav>
      )}

      {games?.length === 0 && (
        <p className="mt-10 text-center text-white/45">
          Nessuna partita ancora.
          <br />
          Creane una e aggiungi i giocatori.
        </p>
      )}

      {ended.length > 0 && <EndedList games={ended} onDelete={askDelete} />}

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
          className="mt-1 w-full rounded-xl bg-night-900 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-gold-400"
        />
        {groups.length > 0 && (
          <>
            <label className="mt-5 block text-sm text-white/60" htmlFor="group">
              Compagnia
            </label>
            <select
              id="group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="mt-1 w-full rounded-xl bg-night-900 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-gold-400"
            >
              <option value="">Nessuna: partita al volo</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-white/40">
              {groupId ? "La vedranno tutti i membri: i giocatori si scelgono tra loro." : "La vedi solo tu e chi ha il codice."}
            </p>
          </>
        )}
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

function leaderOf(s: GameState | null) {
  return s ? [...s.players].sort((a, b) => b.balanceCents - a.balanceCents)[0] : undefined;
}

/** Partita in corso: card grande con piatto in evidenza e "Riprendi". */
function LiveCard({ game: g, onDelete }: { game: GameCard; onDelete: (g: GameCard) => void }) {
  const s = g.state;
  const leader = leaderOf(s);
  return (
    <div className="relative rounded-3xl bg-night-800 ring-1 ring-gold-400/30">
      <Link href={`/partita/${g.id}`} className="block p-4 pr-12">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gain">
          <span className="h-2 w-2 rounded-full bg-gain" aria-hidden />
          In corso
        </span>
        <span className="mt-2 block truncate text-lg font-bold">{g.title}</span>
        <span className="block truncate text-xs text-white/50">
          {s ? `${s.players.length} giocatori · ${s.handsPlayed} mani` : "Dati non leggibili"}
          {leader && leader.balanceCents > 0 && ` · in testa ${leader.name}`}
        </span>
        {s && (
          <span className="mt-3 -mr-8 flex items-end justify-between gap-3">
            <span>
              <span className="block text-xs text-white/50">Piatto</span>
              <span className="tabular block text-3xl font-black leading-none text-gold-400">{formatCents(s.potCents)}</span>
            </span>
            <span className="rounded-xl bg-gold-400 px-4 py-2.5 font-bold text-night-950">Riprendi</span>
          </span>
        )}
      </Link>
      <button
        onClick={() => onDelete(g)}
        className="absolute right-2 top-2 rounded-full p-2 text-white/30 hover:bg-white/10 hover:text-red-400"
        aria-label={`Elimina ${g.title}`}
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}

/** Partite terminate: righe compatte con chi ha vinto. */
function EndedList({ games, onDelete }: { games: GameCard[]; onDelete: (g: GameCard) => void }) {
  return (
    <section className="mt-8">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">Terminate</h2>
      <ul className="divide-y divide-white/5">
        {games.map((g) => {
          const s = g.state;
          const leader = leaderOf(s);
          return (
            <li key={g.id} className="flex items-center">
              <Link href={`/partita/${g.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-1">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.title}</span>
                  <span className="block truncate text-xs text-white/45">
                    {new Date(g.updatedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" })} ·{" "}
                    {s ? `${s.players.length} giocatori · ${s.handsPlayed} mani` : "Dati non leggibili"}
                  </span>
                </span>
                {leader && leader.balanceCents > 0 && (
                  <span className="shrink-0 text-right text-xs">
                    <span className="block max-w-[6rem] truncate text-white/70">{leader.name}</span>
                    <span className="tabular font-bold text-gain">{formatCents(leader.balanceCents, { signed: true })}</span>
                  </span>
                )}
              </Link>
              <button
                onClick={() => onDelete(g)}
                className="ml-1 rounded-full p-2 text-white/25 hover:bg-white/10 hover:text-red-400"
                aria-label={`Elimina ${g.title}`}
              >
                <Trash2 size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** In alto a destra: "Accedi" per gli ospiti, il proprio nome per chi ha l'account. */
function AccountLink() {
  const { account, accounts } = useAccount();
  if (!accounts) return null;
  const label = account?.username ? account.displayName || account.username : "Accedi";
  return (
    <Link
      href="/account"
      className="flex max-w-[8rem] shrink-0 items-center gap-1.5 rounded-full bg-night-800 py-2 pl-2.5 pr-3 text-sm font-semibold ring-1 ring-white/10 hover:bg-night-600"
      aria-label={account?.username ? `Il tuo account (${label})` : "Accedi o crea un account"}
    >
      <UserRound size={18} className="shrink-0 text-white/60" />
      <span className="truncate">{account === undefined ? "…" : label}</span>
    </Link>
  );
}

/** Bustine: un pallino quando c'è una bustina gratis da aprire o gettoni da riscuotere. */
function PacksLink() {
  const state = useCollection();
  if (state.status === "off") return null;
  const ready = state.status === "ready" ? state.collection : null;
  const gift = !!ready && (ready.welcome || ready.daily || ready.rewards.length > 0);
  return (
    <Link
      href="/bustine"
      className={`relative flex flex-col items-center gap-1.5 rounded-2xl bg-night-800 px-2 py-3 text-sm ring-1 hover:bg-night-700 ${gift ? "ring-gold-400/50" : "ring-white/5"}`}
      aria-label={gift ? "Bustine: ce n'è una gratis da aprire" : "Bustine"}
    >
      <PackageOpen size={20} className={`shrink-0 text-gold-400 ${gift ? "animate-bounce-soft motion-reduce:animate-none" : ""}`} />
      <span className="max-w-full truncate font-semibold">Bustine</span>
      {gift && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-loss px-1 text-[11px] font-black text-white ring-2 ring-night-900">
          {(ready.welcome ? 1 : 0) + (ready.daily ? 1 : 0) || "!"}
        </span>
      )}
    </Link>
  );
}

/** Unirsi alla partita di un altro dettando il codice (in alternativa al QR). */
function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = normalizeCode(code);
  // Su iPhone (web app in Home) il campo riceveva il focus da solo all'apertura e la tastiera
  // saltava fuori senza motivo: il focus vale solo se arriva da un tocco sul modulo o dalla tastiera.
  const intendedAt = useRef(0);
  useEffect(() => {
    const onKey = () => (intendedAt.current = Date.now());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      onPointerDown={() => (intendedAt.current = Date.now())}
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
        onFocus={(e) => {
          if (Date.now() - intendedAt.current > 1000) e.currentTarget.blur();
          intendedAt.current = 0;
        }}
        placeholder="ABC12"
        maxLength={8}
        autoCapitalize="characters"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-xl bg-night-900 px-3 py-2 font-mono uppercase tracking-[0.3em] outline-none ring-1 ring-white/10 focus:ring-gold-400"
      />
      <Button type="submit" variant="secondary" className="px-4 py-2 text-sm" disabled={clean.length < 4}>
        Entra
      </Button>
    </form>
  );
}
