"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Hourglass, Smartphone } from "lucide-react";
import { activePlayers, type PlayerId } from "@/engine";
import { useGame } from "@/lib/useGame";
import { getOnline, normalizeCode, type OnlineGame } from "@/lib/online";
import { useOnline, useRemoteCharacters } from "@/lib/useOnline";
import { getCharacter } from "@/lib/avatar/store";
import { CharacterOverrides } from "@/lib/avatar/overrides";
import { Avatar } from "@/components/ui";
import { Button } from "@/components/Sheet";

/**
 * Si apre inquadrando il QR del master (o con il codice): il giocatore dice chi è
 * ("Sono io") oppure chiede di sedersi. Poi passa alla sua vista della partita.
 */
export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const online = getOnline();
  const [found, setFound] = useState<{ code: string; game: OnlineGame | null } | null>(null);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    online
      .findGameByCode(code)
      .then((game) => alive && setFound({ code, game }))
      .catch(() => alive && setFound({ code, game: null }));
    return () => {
      alive = false;
    };
  }, [online, code]);

  if (!online) return <Centered>Per unirsi dal telefono l&apos;app deve essere online.</Centered>;
  if (!found || found.code !== code) return <Centered>Cerco la partita {normalizeCode(code)}…</Centered>;
  if (!found.game)
    return (
      <Centered>
        <div>
          <p className="text-lg font-bold text-white">Nessuna partita con il codice {normalizeCode(code)}</p>
          <p className="mt-2">Controlla il codice con il master, o inquadra di nuovo il QR.</p>
          <Link href="/" className="mt-5 inline-block rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white">
            Inserisci un altro codice
          </Link>
        </div>
      </Centered>
    );
  return <Join game={found.game} />;
}

function Join({ game }: { game: OnlineGame }) {
  const router = useRouter();
  const g = useGame(game.id);
  const info = useOnline(game.id);
  const overrides = useRemoteCharacters(g.state, info?.seats);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const claiming = useRef(false);

  const claim = useCallback(
    async (playerId: PlayerId, playerName: string) => {
      const online = getOnline();
      if (!online || claiming.current) return;
      claiming.current = true;
      setBusy(true);
      setError(null);
      try {
        // posto "fantasma" (il master ha annullato l'aggiunta di quel giocatore): lo libero,
        // altrimenti il database non mi lascia prenderne un altro (un posto per telefono)
        const stale = info?.mySeat;
        if (stale && !g.state?.players.some((p) => p.id === stale)) await online.releaseSeat(game.id, stale);
        // il personaggio eventualmente già creato su questo telefono va nel profilo
        await online.claimSeat(game.id, playerId, playerName, getCharacter(playerName));
        router.replace(`/gioca/${game.id}`);
      } catch (e) {
        const dup = (e as { code?: string }).code === "23505";
        setError(dup ? `Il posto di ${playerName} è già collegato a un altro telefono.` : "Non sono riuscito a collegarti: riprova.");
        await info?.reload();
      } finally {
        claiming.current = false;
        setBusy(false);
      }
    },
    [game.id, router, info, g.state],
  );

  // già seduto da questo telefono (e il giocatore esiste ancora): dritto alla partita
  const mySeat = info?.mySeat && g.state?.players.some((p) => p.id === info.mySeat) ? info.mySeat : null;
  useEffect(() => {
    if (mySeat) router.replace(`/gioca/${game.id}`);
  }, [mySeat, game.id, router]);

  // il master ha approvato la richiesta: prendo il posto che mi ha dato
  const approved = info?.myRequest?.status === "approved" ? info.myRequest : null;
  useEffect(() => {
    const playerId = approved?.playerId;
    const playerName = approved?.name;
    // l'approvazione può arrivare prima dell'aggiornamento della partita con il nuovo giocatore:
    // si aspetta di vederlo, altrimenti il posto sembrerebbe "fantasma"
    const ready = !!playerId && !!g.state?.players.some((p) => p.id === playerId);
    if (playerId && playerName && ready && !mySeat && info?.mySeat !== playerId) void Promise.resolve().then(() => claim(playerId, playerName));
  }, [approved?.playerId, approved?.name, mySeat, claim, g.state, info?.mySeat]);

  async function ask() {
    const online = getOnline();
    if (!online || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await online.requestToJoin(game.id, name);
      await info?.reload();
    } catch {
      setError("Richiesta non inviata: riprova.");
    } finally {
      setBusy(false);
    }
  }

  if (!info || g.loading) return <Centered>Carico la partita…</Centered>;
  const state = g.state;
  const players = state ? activePlayers(state) : [];
  const taken = new Set(info.seats.map((s) => s.playerId));
  const pending = info.myRequest?.status === "pending" ? info.myRequest : null;
  const rejected = info.myRequest?.status === "rejected";

  return (
    <CharacterOverrides value={overrides}>
      <main className="mx-auto min-h-dvh max-w-lg px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">♠ Bestia · {game.code}</p>
        <h1 className="mt-1 text-3xl font-black leading-tight">{game.title}</h1>

        {info.isMaster && (
          <Link href={`/partita/${game.id}`} className="mt-5 flex items-center gap-3 rounded-2xl bg-gold-400/15 p-4 ring-1 ring-gold-400/30">
            <Crown className="text-gold-400" />
            <span className="flex-1">
              <strong>Sei il master</strong> di questa partita
            </span>
            <span className="font-bold text-gold-400">Apri</span>
          </Link>
        )}

        {error && <p className="mt-5 rounded-xl bg-amber-500/15 p-3 text-sm text-amber-200">{error}</p>}

        {pending ? (
          <div className="mt-8 rounded-3xl bg-night-800 p-6 text-center ring-1 ring-white/5">
            <Hourglass className="mx-auto animate-pulse text-sky-300" size={32} />
            <p className="mt-3 text-lg font-bold">Ciao {pending.name}!</p>
            <p className="mt-1 text-white/60">Aspetta che il master ti faccia sedere: appena lo fa, entri da solo.</p>
          </div>
        ) : (
          <>
            <h2 className="mt-8 text-lg font-bold">Chi sei?</h2>
            <p className="text-sm text-white/55">Tocca il tuo nome per seguire la partita da questo telefono.</p>
            {players.length === 0 && <p className="mt-4 text-white/45">Il master non ha ancora aggiunto giocatori.</p>}
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {players.map((p) => {
                const isTaken = taken.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      disabled={isTaken || busy}
                      onClick={() => claim(p.id, p.name)}
                      aria-label={isTaken ? `${p.name}, già collegato` : `Sono io: ${p.name}`}
                      className="flex w-full items-center gap-3 rounded-2xl bg-night-800 p-3 text-left ring-2 ring-white/5 transition active:scale-[0.97] disabled:opacity-45"
                    >
                      <Avatar name={p.name} seat={p.joinOrder} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{p.name}</span>
                        <span className="text-xs text-white/50">{isTaken ? "già collegato" : "Sono io"}</span>
                      </span>
                      {isTaken && <Smartphone size={16} className="text-white/40" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <h2 className="mt-8 text-lg font-bold">Non sei nell&apos;elenco?</h2>
            <p className="text-sm text-white/55">
              {rejected ? "Il master non ha accettato la richiesta precedente. Puoi riprovare." : "Chiedi di sederti: il master sceglie dove."}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
              className="mt-3 flex gap-2"
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                autoCapitalize="words"
                placeholder="Il tuo nome"
                aria-label="Il tuo nome"
                className="min-w-0 flex-1 rounded-xl bg-night-900 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-blue-500"
              />
              <Button type="submit" disabled={!name.trim() || busy}>
                Chiedi
              </Button>
            </form>
          </>
        )}
      </main>
    </CharacterOverrides>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center p-6 text-center text-white/60">{children}</div>;
}
