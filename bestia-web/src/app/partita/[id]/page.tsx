"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Armchair,
  ArrowLeft,
  ChevronLeft,
  Coins,
  Flag,
  History,
  LayoutGrid,
  Link2,
  LogOut,
  MoreHorizontal,
  QrCode,
  Shirt,
  Smartphone,
  Tv,
  Undo2,
  UserPlus,
  X,
  Share2,
} from "lucide-react";
import {
  activePlayers,
  canChangeTable,
  canEnd,
  canPlay,
  colorIndex,
  formatCents,
  handPayouts,
  type GameState,
  type PlayerId,
  type PlayerState,
  type WinnerGroup,
} from "@/engine";
import { useGame } from "@/lib/useGame";
import { describeEntry } from "@/lib/describe";
import { newId as newPlayerId } from "@/lib/repository";
import { HistoryList } from "@/components/HistoryList";
import { Button, Sheet } from "@/components/Sheet";
import { Results } from "@/components/Results";
import { ReportSheet } from "@/components/ReportSheet";
import { Avatar, ConfirmDialog, haptic, Toast, type ConfirmRequest, type ToastMessage } from "@/components/ui";
import { CharacterEditor } from "@/components/CharacterEditor";
import { CharacterOverrides, useCharacterFor } from "@/lib/avatar/overrides";
import { getOnline, type JoinRequest } from "@/lib/online";
import { useOnline, useRemoteCharacters, useShareCharacters } from "@/lib/useOnline";
import { useGameGroup, type GameGroup } from "@/lib/useGameGroup";
import { getGroups } from "@/lib/groups";
import { getCharacter } from "@/lib/avatar/store";
import { getHistory, resultsOf } from "@/lib/history";
import { InviteSheet } from "@/components/InviteSheet";
import { usePref } from "@/lib/prefs";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Table } from "@/components/Table";
import { defaultSeatAfter, SeatPicker } from "@/components/SeatPicker";

type HandPhase =
  | { kind: "idle" }
  | { kind: "winners"; groups: PlayerId[][]; major: number | null }
  | { kind: "losers"; winners: WinnerGroup[]; groups: PlayerId[][] };

type SheetKind =
  | "add"
  | "bet"
  | "history"
  | "end"
  | "tv"
  | "menu"
  | "invite"
  | "report"
  | { player: PlayerId }
  | { character: PlayerId }
  | { approve: string }
  | null;

// Colori dei gruppi selezionati (vincitori: verde/azzurro/ambra; bestie: rossi).
const WIN = [
  { ring: "ring-emerald-400", dot: "bg-emerald-400" },
  { ring: "ring-cyan-400", dot: "bg-cyan-400" },
  { ring: "ring-amber-400", dot: "bg-amber-400" },
];
const LOSS = [
  { ring: "ring-red-400", dot: "bg-red-400" },
  { ring: "ring-orange-400", dot: "bg-orange-400" },
  { ring: "ring-pink-400", dot: "bg-pink-400" },
  { ring: "ring-rose-300", dot: "bg-rose-300" },
];
const SHARE_LABEL: Record<number, string> = { 1: "1/3", 2: "2/3", 3: "3/3" };

/** Aggiunge/toglie un giocatore dai gruppi selezionati. Con `linking` lo unisce all'ultimo gruppo (società). */
function toggleIn(groups: PlayerId[][], id: PlayerId, linking: boolean, maxGroups: number): PlayerId[][] | null {
  if (groups.some((g) => g.includes(id))) {
    return groups.map((g) => g.filter((x) => x !== id)).filter((g) => g.length > 0);
  }
  if (linking && groups.length > 0) return [...groups.slice(0, -1), [...groups[groups.length - 1], id]];
  if (groups.length >= maxGroups) return null;
  return [...groups, [id]];
}

function winnersFrom(groups: PlayerId[][], major: number | null): WinnerGroup[] | null {
  if (groups.length === 1) return [{ playerIds: groups[0], tricks: 3 }];
  if (groups.length === 3) return groups.map((g) => ({ playerIds: g, tricks: 1 }));
  if (groups.length === 2 && major !== null) {
    return groups.map((g, i) => ({ playerIds: g, tricks: i === major ? 2 : 1 }));
  }
  return null;
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const game = useGame(id);
  const [phase, setPhase] = useState<HandPhase>({ kind: "idle" });
  const [linking, setLinking] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [view, setView] = usePref("vista-giocatori", "grid", ["grid", "table"] as const);
  // Partita online: telefoni collegati, richieste di sedersi, personaggi dai profili dei giocatori.
  const onlineInfo = useOnline(getOnline() ? id : null);
  // partita di una compagnia: i giocatori si scelgono tra i membri, con i loro personaggi
  const gameGroup = useGameGroup(onlineInfo?.game?.groupId, id);
  const sharedCharacters = onlineInfo?.game?.characters;
  const groupCharacters = gameGroup?.characters;
  const remoteShared = useMemo(() => ({ ...sharedCharacters, ...groupCharacters }), [sharedCharacters, groupCharacters]);
  const overrides = useRemoteCharacters(game.state, onlineInfo?.seats, remoteShared);
  useSaveResults(id, onlineInfo?.isMaster ? game.state : null);
  // i personaggi creati qui li vedono anche telefoni e TV
  const shareCharacter = useShareCharacters(game.state, onlineInfo);

  const notify = useCallback((text: string, kind: ToastMessage["kind"] = "info") => {
    setToast({ text, kind, id: Date.now() });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  if (game.loading) return <Centered>Caricamento…</Centered>;
  if (game.error || !game.state) {
    return (
      <Centered>
        <div>
          <p>{game.error ?? "Partita non trovata."}</p>
          <Link href="/" className="mt-4 inline-block rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white">
            Torna alle partite
          </Link>
        </div>
      </Centered>
    );
  }

  const state = game.state;

  async function run(event: Parameters<typeof game.dispatch>[0]) {
    const res = await game.dispatch(event);
    if (res === false) return false; // doppio tocco: ignorato
    if (res) notify(res, "error");
    return res === null;
  }

  async function undo() {
    const last = game.history.at(-1);
    if (!last || !game.state) return;
    const label = describeEntry(last, game.state).title;
    const res = await game.undo();
    if (res === true) notify(`Annullato: ${label}`);
    else if (typeof res === "string") notify(res, "error");
  }

  if (state.status === "ended") {
    return (
      <CharacterOverrides value={overrides}>
        <Results state={state} history={game.history} times={game.events.map((e) => e.at)} title={game.meta?.title} onReopen={undo} backHref="/" />
      </CharacterOverrides>
    );
  }

  const players = activePlayers(state);
  const inactive = state.players.filter((p) => !p.active);
  const seatOf = (pid: PlayerId) => colorIndex(state, pid);
  const name = (pid: PlayerId) => state.players.find((p) => p.id === pid)?.name ?? "?";
  const groupNames = (g: PlayerId[]) => g.map(name).join(" & ");

  // Anteprima di quanto vince/paga ciascuno con la selezione attuale.
  let preview: Record<PlayerId, number> = {};
  let nextPot: number | null = null;
  if (phase.kind === "winners") {
    const w = winnersFrom(phase.groups, phase.major);
    if (w) preview = handPayouts(state, w, []).payouts;
  } else if (phase.kind === "losers") {
    const res = handPayouts(state, phase.winners, phase.groups);
    preview = res.payouts;
    nextPot = res.collected + state.baseBetCents;
  }

  function onPlayerTap(p: PlayerState) {
    haptic();
    if (phase.kind === "idle") {
      setSheet({ player: p.id });
      return;
    }
    if (phase.kind === "winners") {
      const next = toggleIn(phase.groups, p.id, linking, 3);
      if (!next) return notify("Al massimo 3 vincitori (o società): una presa a testa.", "error");
      setPhase({ ...phase, groups: next, major: next.length === phase.groups.length ? phase.major : null });
      return;
    }
    const current = phase;
    const toggle = () => setPhase({ ...current, groups: toggleIn(current.groups, p.id, linking, Infinity)! });
    const isWinner = current.winners.some((g) => g.playerIds.includes(p.id));
    const alreadyLoser = current.groups.some((g) => g.includes(p.id));
    if (isWinner && !alreadyLoser) {
      setConfirm({
        title: "Vincitore anche in bestia?",
        message: `${p.name} ha vinto una parte del piatto in questa mano. Confermi che è andato anche in bestia?`,
        confirmLabel: "Sì, va in bestia",
        danger: true,
        onConfirm: toggle,
      });
      return;
    }
    toggle();
  }

  function badgeFor(pid: PlayerId): { label: string; ring: string; dot: string } | null {
    if (phase.kind === "winners") {
      const gi = phase.groups.findIndex((g) => g.includes(pid));
      if (gi === -1) return null;
      const w = winnersFrom(phase.groups, phase.major);
      return { label: w ? SHARE_LABEL[w[gi].tricks] : String(gi + 1), ...WIN[gi] };
    }
    if (phase.kind === "losers") {
      const gi = phase.groups.findIndex((g) => g.includes(pid));
      if (gi === -1) return null;
      return { label: "B", ...LOSS[gi % LOSS.length] };
    }
    return null;
  }

  const cardLabel = (p: PlayerState) =>
    `${p.name}${p.id === state.dealerId ? ", mazziere" : ""}, saldo ${formatCents(p.balanceCents, { signed: true })}${badgeFor(p.id) ? ", selezionato" : ""}`;

  const lastGroup = phase.kind !== "idle" && phase.groups.length > 0 ? phase.groups[phase.groups.length - 1] : null;

  return (
    <CharacterOverrides value={overrides}>
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {/* Barra in alto */}
      <header className="flex items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/" className="rounded-full p-2.5 text-white/70 hover:bg-white/10" aria-label="Torna alle partite">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-white/70">{game.meta?.title ?? "Partita"}</h1>
        <IconButton label="Annulla ultima azione" disabled={!game.canUndo || phase.kind !== "idle"} onClick={undo}>
          <Undo2 size={21} className="text-amber-300" />
        </IconButton>
        <IconButton
          label={view === "table" ? "Mostra la griglia" : "Mostra il tavolo"}
          onClick={() => setView(view === "table" ? "grid" : "table")}
        >
          {view === "table" ? <LayoutGrid size={21} /> : <Armchair size={21} />}
        </IconButton>
        {game.meta?.code && (
          <IconButton label="Invita giocatori" onClick={() => setSheet("invite")}>
            <QrCode size={21} />
          </IconButton>
        )}
        <IconButton label="Cronologia" onClick={() => setSheet("history")}>
          <History size={21} />
        </IconButton>
        <IconButton label="Vista TV" onClick={() => setSheet("tv")}>
          <Tv size={21} />
        </IconButton>
        <IconButton label="Altre opzioni" onClick={() => setSheet("menu")} disabled={phase.kind !== "idle"}>
          <MoreHorizontal size={21} />
        </IconButton>
      </header>

      {/* Piatto */}
      <section className="px-3 pt-1">
        <div className={view === "table" ? "hidden" : undefined}>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-felt-600 to-felt-700 px-5 py-4 shadow-lg ring-1 ring-black/20">
            <span className="pointer-events-none absolute -right-3 -top-6 select-none text-[7rem] leading-none text-black/10" aria-hidden>
              ♠
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">Piatto</p>
            <p className="tabular text-5xl font-black leading-tight text-gold-400 drop-shadow">{formatCents(state.potCents)}</p>
            <p className="mt-0.5 text-xs text-white/70">
              Messa {formatCents(state.baseBetCents)} · Mano {state.handsPlayed + 1}
              {state.dealerId && (
                <>
                  {" "}
                  · Fa le carte <strong className="text-white">{name(state.dealerId)}</strong>
                </>
              )}
            </p>
          </div>
        </div>
        {phase.kind !== "idle" && <Stepper step={phase.kind === "winners" ? 1 : 2} />}
        {phase.kind === "idle" && onlineInfo?.isMaster && onlineInfo.pending.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="Richieste di sedersi">
            {onlineInfo.pending.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-2xl bg-sky-500/15 px-3 py-2 text-sm ring-1 ring-sky-400/30">
                <Smartphone size={16} className="shrink-0 text-sky-300" />
                <span className="min-w-0 flex-1 truncate">
                  <strong>{r.name}</strong> chiede di sedersi
                </span>
                <button onClick={() => setSheet({ approve: r.id })} className="shrink-0 rounded-full bg-sky-400 px-3 py-1 font-bold text-black">
                  Fai sedere
                </button>
                <button
                  onClick={() => void getOnline()?.decideRequest(r.id, "rejected").then(() => onlineInfo.reload(), () => notify("Connessione assente: riprova.", "error"))}
                  aria-label={`Rifiuta ${r.name}`}
                  className="shrink-0 rounded-full p-1.5 text-white/60 hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Giocatori */}
      <main className="flex-1 px-3 pb-48 pt-3">
        {players.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/15 px-6 py-10 text-center text-white/55">
            <UserPlus className="mx-auto mb-3 text-white/40" />
            Aggiungi i giocatori in ordine di posto, in senso orario.
            <br />
            Il primo fa le carte e versa la messa.
          </div>
        )}
        {view === "table" && players.length > 0 && (
          <Table
            state={state}
            onSeatTap={onPlayerTap}
            badgeFor={badgeFor}
            preview={preview}
            selecting={phase.kind !== "idle"}
            seatLabel={cardLabel}
          />
        )}
        {view === "grid" && (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {players.map((p) => {
              const badge = badgeFor(p.id);
              const isDealer = p.id === state.dealerId;
              const delta = preview[p.id];
              return (
                <li key={p.id}>
                  <button
                    onClick={() => onPlayerTap(p)}
                    aria-label={cardLabel(p)}
                    aria-pressed={phase.kind !== "idle" ? !!badge : undefined}
                    className={`relative flex h-full w-full items-center gap-3 rounded-2xl p-3 text-left ring-2 transition active:scale-[0.97] ${
                      badge ? `${badge.ring} bg-night-700` : "bg-night-800 ring-white/5"
                    }`}
                  >
                    <Avatar name={p.name} seat={seatOf(p.id)} dealer={isDealer} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{p.name}</span>
                      <span className={`tabular block text-base font-black ${amountColor(p.balanceCents)}`}>
                        {formatCents(p.balanceCents, { signed: true })}
                      </span>
                      {delta !== undefined && delta !== 0 && (
                        <span
                          className={`tabular mt-0.5 inline-block rounded-md px-1.5 text-xs font-bold ${
                            delta > 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"
                          }`}
                        >
                          {formatCents(delta, { signed: true })}
                        </span>
                      )}
                    </span>
                    {badge && (
                      <span
                        className={`absolute -right-1.5 -top-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-black text-black ring-2 ring-night-900 ${badge.dot}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {inactive.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/35">Fuori dal tavolo</p>
            <ul className="flex flex-wrap gap-2">
              {inactive.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-full bg-night-800/60 py-1 pl-1 pr-3 text-sm text-white/55">
                  <Avatar name={p.name} seat={seatOf(p.id)} size="sm" />
                  {p.name}
                  <span className={`tabular font-bold ${amountColor(p.balanceCents)}`}>
                    {formatCents(p.balanceCents, { signed: true })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      {/* Comandi in basso */}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-night-950/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
          {phase.kind === "idle" && (
            <>
              <Hint>
                {canPlay(state) ? (
                  "Passa se la mano non si gioca, altrimenti Gioca mano."
                ) : (
                  <span className="text-amber-300">
                    Servono almeno {state.rules.minPlayers} giocatori ({players.length}/{state.rules.minPlayers})
                  </span>
                )}
              </Hint>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="px-3 min-[360px]:px-4"
                  onClick={() => setSheet("add")}
                  disabled={!canChangeTable(state)}
                  aria-label="Aggiungi giocatore"
                  title={canChangeTable(state) ? "Aggiungi giocatore" : "Solo a piatto pulito"}
                >
                  <UserPlus size={20} />
                </Button>
                <Button
                  variant="secondary"
                  className="min-w-0 flex-1 whitespace-nowrap px-3"
                  disabled={!canPlay(state)}
                  onClick={async () => {
                    haptic();
                    if (await run({ type: "hand_passed" })) notify("Mano passata: il mazzo gira e il piatto sale");
                  }}
                >
                  Passa <span className="hidden font-semibold text-white/60 min-[360px]:inline">+{formatCents(state.baseBetCents)}</span>
                </Button>
                <Button
                  className="min-w-0 flex-[1.5] whitespace-nowrap px-3"
                  disabled={!canPlay(state) || state.potCents <= 0}
                  onClick={() => {
                    haptic();
                    setLinking(false);
                    setPhase({ kind: "winners", groups: [], major: null });
                  }}
                >
                  Gioca mano
                </Button>
              </div>
            </>
          )}

          {phase.kind === "winners" && (
            <>
              {phase.groups.length === 2 ? (
                <div className="mb-2">
                  <Hint>Chi ha fatto 2 prese (2/3 del piatto)?</Hint>
                  <div className="flex gap-2">
                    {phase.groups.map((g, i) => (
                      <button
                        key={i}
                        onClick={() => setPhase({ ...phase, major: i })}
                        aria-pressed={phase.major === i}
                        className={`flex-1 truncate rounded-xl px-3 py-2 text-sm font-bold ring-2 transition ${
                          phase.major === i ? `${WIN[i].ring} bg-night-700` : "ring-white/10 text-white/70"
                        }`}
                      >
                        {groupNames(g)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <Hint>
                  {linking && lastGroup
                    ? `Società: tocca chi si unisce a ${groupNames(lastGroup)}`
                    : phase.groups.length === 0
                      ? "Tocca chi ha preso: 1 giocatore (3 prese), 2 o 3."
                      : "Tocca altri vincitori o vai avanti."}
                </Hint>
              )}
              <PhaseControls
                linking={linking}
                linkDisabled={phase.groups.length === 0}
                onLink={() => setLinking(!linking)}
                onBack={() => setPhase({ kind: "idle" })}
                backLabel="Annulla la mano"
                confirmLabel="Avanti"
                confirmVariant="success"
                confirmDisabled={!winnersFrom(phase.groups, phase.major)}
                onConfirm={() => {
                  haptic();
                  setLinking(false);
                  setPhase({ kind: "losers", winners: winnersFrom(phase.groups, phase.major)!, groups: [] });
                }}
              />
            </>
          )}

          {phase.kind === "losers" && (
            <>
              <Hint>
                {linking && lastGroup ? (
                  `Società: tocca chi si unisce a ${groupNames(lastGroup)}`
                ) : phase.groups.length === 0 ? (
                  "Tocca chi è andato in bestia, oppure conferma se nessuno."
                ) : (
                  <>
                    {phase.groups.length === 1 ? "La bestia paga" : `${phase.groups.length} bestie: ognuna paga`}{" "}
                    {formatCents(state.potCents)} · nuovo piatto <strong className="text-gold-400">{formatCents(nextPot!)}</strong>
                  </>
                )}
              </Hint>
              <PhaseControls
                linking={linking}
                linkDisabled={phase.groups.length === 0}
                onLink={() => setLinking(!linking)}
                onBack={() => {
                  const major = phase.winners.findIndex((w) => w.tricks === 2);
                  setPhase({ kind: "winners", groups: phase.winners.map((w) => w.playerIds), major: major >= 0 ? major : null });
                }}
                backLabel="Torna ai vincitori"
                confirmLabel={phase.groups.length === 0 ? "Nessuna bestia" : "Fine mano"}
                confirmVariant="danger"
                onConfirm={async () => {
                  haptic(20);
                  const ok = await run({ type: "hand_played", winners: phase.winners, losers: phase.groups });
                  if (ok) {
                    setPhase({ kind: "idle" });
                    setLinking(false);
                    notify(`Mano registrata · nuovo piatto ${formatCents(nextPot!)}`, "success");
                  }
                }}
              />
            </>
          )}
        </div>
      </footer>

      <Toast toast={toast} onDone={clearToast} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      {sheet === "add" && (
        <AddPlayerSheet
          onClose={() => setSheet(null)}
          state={state}
          run={run}
          gameId={id}
          group={onlineInfo?.isMaster ? gameGroup : null}
          onError={(text) => notify(text, "error")}
        />
      )}
      {sheet === "bet" && <BetSheet onClose={() => setSheet(null)} state={state} run={run} />}
      {sheet === "tv" && <TvSheet onClose={() => setSheet(null)} gameId={id} />}
      <EndSheet open={sheet === "end"} onClose={() => setSheet(null)} state={state} run={run} />
      <MenuSheet open={sheet === "menu"} onClose={() => setSheet(null)} onPick={setSheet} state={state} />
      <Sheet open={sheet === "history"} onClose={() => setSheet(null)} title="Cronologia">
        <HistoryList state={state} history={game.history} times={game.events.map((e) => e.at)} />
      </Sheet>
      {typeof sheet === "object" && sheet !== null && "player" in sheet && (
        <PlayerSheet
          player={state.players.find((p) => p.id === sheet.player)!}
          seat={seatOf(sheet.player)}
          state={state}
          onClose={() => setSheet(null)}
          onEditCharacter={() => setSheet({ character: sheet.player })}
          run={run}
          phoneLinked={!!onlineInfo?.seats.some((s) => s.playerId === sheet.player)}
          onUnlink={() =>
            void getOnline()
              ?.releaseSeat(id, sheet.player)
              .then(
                () => {
                  notify(`Telefono di ${name(sheet.player)} scollegato`);
                  return onlineInfo?.reload();
                },
                () => notify("Connessione assente: riprova.", "error"),
              )
          }
        />
      )}
      {sheet === "report" && (
        <ReportSheet state={state} history={game.history} times={game.events.map((e) => e.at)} title={game.meta?.title} onClose={() => setSheet(null)} />
      )}
      {sheet === "invite" && game.meta?.code && <InviteSheet code={game.meta.code} title={game.meta.title} onClose={() => setSheet(null)} />}
      {typeof sheet === "object" &&
        sheet !== null &&
        "approve" in sheet &&
        (() => {
          const request = onlineInfo?.pending.find((r) => r.id === sheet.approve);
          return request ? (
            <ApproveSheet
              request={request}
              state={state}
              run={run}
              onClose={() => setSheet(null)}
              onDone={(text) => {
                notify(text, "success");
                void onlineInfo?.reload();
              }}
              onError={(text) => {
                notify(text, "error");
                void onlineInfo?.reload();
              }}
            />
          ) : null;
        })()}
      {typeof sheet === "object" && sheet !== null && "character" in sheet && (
        <CharacterEditor
          name={name(sheet.character)}
          onClose={() => setSheet(null)}
          onSaved={() => {
            shareCharacter(name(sheet.character));
            // ospite della compagnia: il personaggio resta suo anche nelle prossime partite
            const member = gameGroup?.memberOf(sheet.character);
            if (member && !member.profileId)
              void getGroups()
                ?.setMemberCharacter(member.id, getCharacter(name(sheet.character)))
                .then(() => gameGroup?.reload(), () => {});
            notify(`Personaggio di ${name(sheet.character)} salvato`, "success");
          }}
        />
      )}
    </div>
    </CharacterOverrides>
  );
}

// --- Pezzi della schermata ---------------------------------------------------

type Run = (event: Parameters<ReturnType<typeof useGame>["dispatch"]>[0]) => Promise<boolean>;

const amountColor = (c: number) => (c < 0 ? "text-loss" : c > 0 ? "text-gain" : "text-white/55");

/**
 * Storico: quando la partita termina il master ne salva i saldi finali (anche aprendo una
 * partita già terminata, per quelle chiuse prima dello storico). Se viene riaperta, li toglie.
 */
function useSaveResults(gameId: string, state: GameState | null) {
  const last = useRef<{ status: string; key: string } | null>(null);
  useEffect(() => {
    const history = getHistory();
    if (!history || !state) return;
    const results = resultsOf(state);
    const key = `${state.status}:${JSON.stringify(results)}`;
    const prev = last.current;
    if (prev?.key === key) return;
    last.current = { status: state.status, key };
    if (state.status === "ended") void history.saveResults(gameId, results).catch(() => (last.current = prev));
    else if (prev?.status === "ended") void history.saveResults(gameId, []).catch(() => (last.current = prev));
  }, [gameId, state]);
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center p-6 text-center text-white/60">{children}</div>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 min-h-[1.25rem] text-center text-xs text-white/60">{children}</p>;
}

function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...props} aria-label={label} title={label} className="rounded-full p-2 text-white/80 hover:bg-white/10 disabled:opacity-25 min-[380px]:p-2.5">
      {children}
    </button>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  const item = (n: 1 | 2, label: string, color: string) => (
    <li className={`flex items-center gap-2 ${step === n ? "text-white" : "text-white/35"}`}>
      <span
        className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${step === n ? `${color} text-black` : "bg-night-700"}`}
      >
        {n}
      </span>
      <span className="text-sm font-bold">{label}</span>
    </li>
  );
  return (
    <ol className="mt-3 flex items-center justify-center gap-3" aria-label={`Passo ${step} di 2`}>
      {item(1, "Chi ha preso", "bg-emerald-400")}
      <li className="h-px w-8 bg-white/15" aria-hidden />
      {item(2, "Chi va in bestia", "bg-red-400")}
    </ol>
  );
}

function PhaseControls(props: {
  linking: boolean;
  linkDisabled: boolean;
  onLink: () => void;
  onBack: () => void;
  backLabel: string;
  confirmLabel: string;
  confirmVariant: "success" | "danger";
  confirmDisabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button variant="ghost" className="px-3" onClick={props.onBack} aria-label={props.backLabel} title={props.backLabel}>
        <ChevronLeft size={22} />
      </Button>
      <button
        onClick={props.onLink}
        disabled={props.linkDisabled}
        aria-pressed={props.linking}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-2xl px-3.5 text-sm font-bold transition disabled:opacity-35 ${
          props.linking ? "bg-amber-400 text-black" : "bg-night-600 text-white/85"
        }`}
        title="Unisci i prossimi giocatori all'ultimo selezionato (società)"
      >
        <Link2 size={17} /> Società
      </button>
      <Button
        variant={props.confirmVariant}
        className="flex-1 whitespace-nowrap"
        disabled={props.confirmDisabled}
        onClick={props.onConfirm}
      >
        {props.confirmLabel}
      </Button>
    </div>
  );
}

function MenuSheet({
  open,
  onClose,
  onPick,
  state,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (s: SheetKind) => void;
  state: GameState;
}) {
  const item = (icon: React.ReactNode, label: string, detail: string, target: SheetKind, danger = false, disabled = false) => (
    <li>
      <button
        onClick={() => onPick(target)}
        disabled={disabled}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <span
          className={`grid h-10 w-10 place-items-center rounded-full ${danger ? "bg-red-500/15 text-red-300" : "bg-night-700 text-white/80"}`}
        >
          {icon}
        </span>
        <span>
          <span className={`block font-semibold ${danger ? "text-red-300" : ""}`}>{label}</span>
          <span className="text-xs text-white/50">{detail}</span>
        </span>
      </button>
    </li>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Opzioni">
      <ul className="-mx-2">
        {item(
          <UserPlus size={19} />,
          "Aggiungi giocatore",
          canChangeTable(state) ? "Si siede all'ultimo posto" : "Solo quando il piatto contiene la sola messa",
          "add",
          false,
          !canChangeTable(state),
        )}
        {item(<Coins size={19} />, "Messa del mazziere", `Attuale ${formatCents(state.baseBetCents)}`, "bet")}
        {item(<Tv size={19} />, "Vista TV", "Classifica da proiettare", "tv")}
        {item(<Share2 size={19} />, "Resoconto", "Da mandare nel gruppo WhatsApp", "report")}
        {item(<Flag size={19} />, "Termina partita", "Calcola i conti finali", "end", true)}
      </ul>
    </Sheet>
  );
}

function AddPlayerSheet({
  onClose,
  state,
  run,
  gameId,
  group,
  onError,
}: {
  onClose: () => void;
  state: GameState;
  run: Run;
  gameId: string;
  /** Compagnia della partita (solo per il master): i giocatori si scelgono tra i membri. */
  group: GameGroup | null;
  onError: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const active = activePlayers(state);
  const inactive = state.players.filter((p) => !p.active);
  const full = active.length >= state.rules.maxPlayers;
  // Posto nel giro (senso orario): di base dopo l'ultimo; dopo ogni aggiunta avanza sul nuovo arrivato.
  const [after, setAfter] = useState<PlayerId | null>(active.at(-1)?.id ?? null);
  const seatAfter = after && active.some((p) => p.id === after) ? after : active.at(-1)?.id;

  async function join(playerId: PlayerId, name: string) {
    // Un nuovo arrivato dopo l'ultimo del giro si siede in fondo: non serve indicarlo (la cronologia resta pulita).
    // Chi rientra invece lo indica sempre, altrimenti riprenderebbe il vecchio posto.
    const rejoining = state.players.some((p) => p.id === playerId);
    const explicit = seatAfter && (rejoining || seatAfter !== active.at(-1)?.id);
    const ok = await run({ type: "player_added", playerId, name, ...(explicit ? { seatAfter } : {}) });
    if (ok) {
      setAdded((a) => [...a, name]);
      setAfter(playerId);
    }
    return ok;
  }

  // membri della compagnia non ancora in questa partita (né legati né con lo stesso nome)
  const taken = new Set(state.players.map((p) => p.name.trim().toLocaleLowerCase("it")));
  const linked = new Set(Object.values(group?.links ?? {}));
  const available = (group?.group.members ?? []).filter((m) => !linked.has(m.id) && !taken.has(m.name.trim().toLocaleLowerCase("it")));

  /** Siede un membro della compagnia e lo lega al giocatore (il suo telefono prende il posto). */
  async function joinMember(memberId: string, memberName: string) {
    const playerId = newPlayerId();
    const ok = await join(playerId, memberName);
    if (!ok) return false;
    try {
      await getGroups()?.linkPlayer(gameId, playerId, memberId);
      await group?.reload();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Collegamento al membro non riuscito.");
    }
    return true;
  }

  async function add() {
    const typed = value.trim();
    if (!group) {
      if (await join(newPlayerId(), typed)) setValue("");
      return;
    }
    // nella compagnia: se esiste già un membro con quel nome è lui, altrimenti diventa un nuovo ospite
    const existing = available.find((m) => m.name.trim().toLocaleLowerCase("it") === typed.toLocaleLowerCase("it"));
    let memberId = existing?.id;
    if (!memberId) {
      try {
        memberId = await getGroups()!.addMember(group.group.id, typed);
      } catch (e) {
        onError(e instanceof Error ? e.message : "Non riesco ad aggiungerlo alla compagnia.");
        return;
      }
    }
    if (await joinMember(memberId, existing?.name ?? typed)) setValue("");
  }

  return (
    <Sheet open onClose={onClose} title="Aggiungi giocatori">
      {full && (
        <p className="mb-3 rounded-xl bg-amber-500/15 p-3 text-sm text-amber-200">
          Tavolo pieno ({active.length}/{state.rules.maxPlayers}): qualcuno deve uscire prima che un altro possa sedersi.
        </p>
      )}
      {active.length > 0 && !full && (
        <div className="mb-4">
          <SeatPicker state={state} value={seatAfter} onChange={setAfter} />
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <input
          autoFocus
          disabled={full}
          value={value}
          maxLength={20}
          enterKeyHint="next"
          autoCapitalize="words"
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nome"
          aria-label="Nome del giocatore"
          className="min-w-0 flex-1 rounded-xl bg-night-900 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-blue-500"
        />
        <Button type="submit" disabled={!value.trim() || full}>
          Aggiungi
        </Button>
      </form>
      <p className="mt-3 text-xs text-white/45">
        {active.length === 0
          ? "Inserisci i giocatori in ordine di posto, in senso orario: il primo fa le carte. "
          : "Premi Invio per aggiungere il prossimo: si siederà dopo quello appena aggiunto. "}
        Poi tocca un giocatore per creargli il personaggio.
      </p>
      {added.length > 0 && <p className="mt-2 text-sm text-emerald-300">Aggiunti: {added.join(", ")}</p>}
      {group && !full && (
        <>
          <p className="mb-2 mt-5 text-sm text-white/60">
            Dalla compagnia <strong className="text-white/85">{group.group.name}</strong>
          </p>
          {available.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {available.map((m) => (
                <Button key={m.id} variant="secondary" className="py-2" onClick={() => joinMember(m.id, m.name)}>
                  {m.name}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/40">Ci sono già tutti. Scrivi un nome nuovo sopra: entrerà nella compagnia come ospite.</p>
          )}
        </>
      )}
      {inactive.length > 0 && !full && (
        <>
          <p className="mb-2 mt-5 text-sm text-white/60">Rientra al tavolo (nel posto scelto sopra)</p>
          <div className="flex flex-wrap gap-2">
            {inactive.map((p) => (
              <Button key={p.id} variant="secondary" className="py-2" onClick={() => join(p.id, p.name)}>
                {p.name}
              </Button>
            ))}
          </div>
        </>
      )}
      <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
        Fatto
      </Button>
    </Sheet>
  );
}

function BetSheet({ onClose, state, run }: { onClose: () => void; state: GameState; run: Run }) {
  const [bet, setBet] = useState(state.baseBetCents);
  const allowed = canChangeTable(state);
  return (
    <Sheet open onClose={onClose} title="Messa del mazziere">
      {!allowed && (
        <p className="mb-4 rounded-xl bg-amber-500/15 p-3 text-sm text-amber-200">
          Si può cambiare solo quando il piatto contiene la sola messa.
        </p>
      )}
      <div className="flex items-center justify-between rounded-xl bg-night-900 p-2 ring-1 ring-white/10">
        <Button
          variant="secondary"
          className="w-14"
          disabled={!allowed || bet <= 30}
          onClick={() => setBet(bet - 30)}
          aria-label="Diminuisci"
        >
          −
        </Button>
        <span className="tabular text-3xl font-black text-gold-400">{formatCents(bet)}</span>
        <Button variant="secondary" className="w-14" disabled={!allowed} onClick={() => setBet(bet + 30)} aria-label="Aumenta">
          +
        </Button>
      </div>
      <Button
        className="mt-5 w-full"
        disabled={!allowed || bet === state.baseBetCents}
        onClick={async () => {
          if (await run({ type: "bet_changed", baseBetCents: bet })) onClose();
        }}
      >
        Salva
      </Button>
    </Sheet>
  );
}

function EndSheet({ open, onClose, state, run }: { open: boolean; onClose: () => void; state: GameState; run: Run }) {
  return (
    <Sheet open={open} onClose={onClose} title="Terminare la partita?">
      {canEnd(state) ? (
        <>
          <p className="text-sm text-white/70">
            La messa ({formatCents(state.potCents)}) torna al mazziere e vengono calcolati i saldi finali di ognuno. Potrai
            riaprire la partita se serve.
          </p>
          <Button variant="danger" className="mt-5 w-full" onClick={() => run({ type: "game_ended" }).then((ok) => ok && onClose())}>
            Termina e calcola i conti
          </Button>
        </>
      ) : (
        <p className="text-sm text-white/70">
          Il piatto contiene ancora {formatCents(state.potCents)}. Bisogna giocare finché non torna alla sola messa (
          {formatCents(state.baseBetCents)}).
        </p>
      )}
    </Sheet>
  );
}

function TvSheet({ onClose, gameId }: { onClose: () => void; gameId: string }) {
  // Montato solo quando è aperto, quindi sempre nel browser.
  const url = `${window.location.origin}/tv/${gameId}`;
  return (
    <Sheet open onClose={onClose} title="Vista TV">
      <p className="text-sm text-white/70">Apri questa pagina sullo schermo da proiettare: si aggiorna da sola a ogni mano.</p>
      <p className="mt-3 break-all rounded-xl bg-night-900 p-3 font-mono text-sm">{url}</p>
      <a
        href={`/tv/${gameId}`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 block rounded-2xl bg-blue-600 py-3.5 text-center font-bold"
      >
        Apri vista TV
      </a>
      <p className="mt-3 text-xs text-white/40">
        {isSupabaseConfigured
          ? "La partita è online: la vista TV funziona da qualsiasi dispositivo collegato a internet."
          : "Per ora i dati sono salvati su questo dispositivo, quindi la vista TV funziona da un'altra scheda dello stesso browser (es. portatile collegato alla TV). Con il backend funzionerà da qualsiasi dispositivo."}
      </p>
    </Sheet>
  );
}

function PlayerSheet({
  player,
  seat,
  state,
  onClose,
  onEditCharacter,
  run,
  phoneLinked = false,
  onUnlink,
}: {
  player: PlayerState;
  seat: number;
  state: GameState;
  onClose: () => void;
  onEditCharacter: () => void;
  run: Run;
  /** Il giocatore segue la partita dal suo telefono (ha preso il posto con "Sono io"). */
  phoneLinked?: boolean;
  onUnlink?: () => void;
}) {
  const canLeave = canChangeTable(state);
  const hasCharacter = useCharacterFor(player.name) !== null;
  return (
    <Sheet open onClose={onClose} title={player.name}>
      <div className="flex items-center gap-4">
        <Avatar name={player.name} seat={seat} dealer={player.id === state.dealerId} size="xl" />
        <div className="min-w-0 flex-1">
          <p className={`tabular text-3xl font-black ${amountColor(player.balanceCents)}`}>
            {formatCents(player.balanceCents, { signed: true })}
          </p>
          <button
            onClick={onEditCharacter}
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-night-700 px-3 py-1.5 text-sm font-semibold text-white/85 hover:bg-night-600"
          >
            <Shirt size={16} /> {hasCharacter ? "Modifica personaggio" : "Crea personaggio"}
          </button>
        </div>
      </div>
      {phoneLinked && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
          <Smartphone size={16} className="shrink-0" />
          <span className="flex-1">Segue la partita dal suo telefono</span>
          {onUnlink && (
            <button onClick={onUnlink} className="rounded-full px-2 py-0.5 text-xs font-semibold text-sky-200 underline-offset-2 hover:underline">
              Scollega
            </button>
          )}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Mani vinte" value={player.stats.handsWon} />
        <Stat label="Prese" value={player.stats.tricks} />
        <Stat label="Bestie" value={player.stats.bestie} />
      </dl>
      <Button
        variant="danger"
        className="mt-5 flex w-full items-center justify-center gap-2"
        disabled={!canLeave}
        onClick={async () => {
          if (await run({ type: "player_left", playerId: player.id })) onClose();
        }}
      >
        <LogOut size={18} /> Lascia il tavolo
      </Button>
      <p className="mt-2 text-xs text-white/40">
        {canLeave
          ? "Il saldo resta nei conti finali. Se è il mazziere, riprende la messa e il mazzo passa al prossimo."
          : "Si può lasciare il tavolo solo a piatto pulito."}
      </p>
    </Sheet>
  );
}

/** Il master fa sedere chi ha chiesto di unirsi dal telefono, scegliendo il posto nel giro. */
function ApproveSheet({
  request,
  state,
  run,
  onClose,
  onDone,
  onError,
}: {
  request: JoinRequest;
  state: GameState;
  run: Run;
  onClose: () => void;
  onDone: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [after, setAfter] = useState<PlayerId | undefined>(defaultSeatAfter(state));
  const [busy, setBusy] = useState(false);
  const allowed = canChangeTable(state);
  const full = activePlayers(state).length >= state.rules.maxPlayers;
  // c'è già al tavolo qualcuno con lo stesso nome (il master l'aveva aggiunto, o un tentativo
  // precedente è andato a metà): basta collegare il suo telefono a quel giocatore
  const sameName = activePlayers(state).find((p) => p.name.trim().toLowerCase() === request.name.trim().toLowerCase());

  /** Avvisa il telefono di chi ha chiesto (riprova un paio di volte se la rete ha un vuoto). */
  async function notifyPhone(playerId: PlayerId | null, status: "approved" | "rejected") {
    const online = getOnline();
    if (!online) return false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await online.decideRequest(request.id, status, playerId ?? undefined);
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    return false;
  }

  async function approve() {
    setBusy(true);
    try {
      const playerId = newPlayerId();
      const last = defaultSeatAfter(state);
      const ok = await run({ type: "player_added", playerId, name: request.name, ...(after && after !== last ? { seatAfter: after } : {}) });
      if (!ok) return;
      // il telefono di chi ha chiesto vede l'approvazione e prende il posto da solo
      if (await notifyPhone(playerId, "approved")) {
        onDone(`${request.name} si siede al tavolo`);
        onClose();
      } else {
        onError(`${request.name} è al tavolo, ma il suo telefono non è stato avvisato: riapri la richiesta e premi "È lui".`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function link(playerId: PlayerId, name: string) {
    setBusy(true);
    try {
      if (await notifyPhone(playerId, "approved")) {
        onDone(`Telefono collegato a ${name}`);
        onClose();
      } else onError("Connessione assente: riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      if (await notifyPhone(null, "rejected")) {
        onDone(`Richiesta di ${request.name} rifiutata`);
        onClose();
      } else onError("Connessione assente: riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Fai sedere ${request.name}`}>
      {sameName ? (
        <div className="rounded-xl bg-sky-500/10 p-3 text-sm text-sky-100">
          <p>
            Al tavolo c&apos;è già <strong>{sameName.name}</strong>. Se è lui, collega il suo telefono a quel posto (saldo e posto restano
            quelli).
          </p>
          <Button className="mt-3 w-full" disabled={busy} onClick={() => link(sameName.id, sameName.name)}>
            È lui: collega il suo telefono
          </Button>
        </div>
      ) : !allowed ? (
        <p className="rounded-xl bg-amber-500/15 p-3 text-sm text-amber-200">
          Si può sedere solo a piatto pulito, quando nel piatto c&apos;è la sola messa. La richiesta resta in attesa.
        </p>
      ) : full ? (
        <p className="rounded-xl bg-amber-500/15 p-3 text-sm text-amber-200">
          Tavolo pieno ({state.rules.maxPlayers}): qualcuno deve uscire prima.
        </p>
      ) : (
        <SeatPicker state={state} value={after} onChange={setAfter} />
      )}
      <div className="mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1" disabled={busy} onClick={reject}>
          Rifiuta
        </Button>
        {!sameName && (
          <Button className="flex-1" disabled={!allowed || full || busy} onClick={approve}>
            Fai sedere
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-night-900 p-3">
      <dt className="text-xs text-white/50">{label}</dt>
      <dd className="tabular text-xl font-black">{value}</dd>
    </div>
  );
}
