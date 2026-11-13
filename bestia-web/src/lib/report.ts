import { formatCents, isPotClean, simplifyDebts, type GameState, type HistoryEntry, type PlayerId } from "@/engine";

/**
 * Resoconto della partita da incollare in un gruppo WhatsApp: classifica, chi paga chi e
 * qualche record. Usa la formattazione di WhatsApp (*grassetto*, _corsivo_).
 */
export function buildReport({
  state,
  history,
  times = [],
  title,
  url,
}: {
  state: GameState;
  history: HistoryEntry[];
  /** Orari degli eventi (ISO), per data e durata. */
  times?: string[];
  title?: string;
  /** Link all'app, in fondo. */
  url?: string;
}): string {
  const ended = state.status === "ended";
  const name = (id: PlayerId) => clean(state.players.find((p) => p.id === id)?.name ?? "?");
  const money = (cents: number, signed = false) => formatCents(cents, { signed }).replace(/ /g, " ");
  const lines: string[] = [];

  // intestazione
  lines.push(`🐗 *Bestia${title ? ` · ${clean(title)}` : ""}*`);
  if (!ended) lines.push("_Resoconto parziale: la partita è in corso_");
  const when = timeSpan(times);
  const facts = [`${state.handsPlayed} ${state.handsPlayed === 1 ? "mano" : "mani"}`];
  if (state.handsPassed > 0) facts.push(`${state.handsPassed} ${state.handsPassed === 1 ? "passata" : "passate"}`);
  facts.push(`messa ${money(state.baseBetCents)}`);
  if (when) lines.push(`📅 ${when}`);
  lines.push(facts.join(" · "));

  // classifica
  const ranking = [...state.players].sort((a, b) => b.balanceCents - a.balanceCents || a.joinOrder - b.joinOrder);
  const medals = ["🥇", "🥈", "🥉"];
  lines.push("", "🏆 *Classifica*");
  ranking.forEach((p, i) => {
    const pos = p.balanceCents > 0 && i < 3 ? medals[i] : `${i + 1}.`;
    const out = !ended && !p.active ? " _(uscito)_" : "";
    lines.push(`${pos} ${clean(p.name)}  ${money(p.balanceCents, true)}${out}`);
  });

  // chi paga chi: a partita in corso solo a piatto pulito (come a fine partita, la messa torna al mazziere)
  if (ended || isPotClean(state)) {
    const balances: Record<PlayerId, number> = Object.fromEntries(state.players.map((p) => [p.id, p.balanceCents]));
    if (!ended && state.dealerId && state.potCents > 0) balances[state.dealerId] += state.potCents;
    const transfers = simplifyDebts(balances);
    lines.push("", ended ? "💸 *Chi paga chi*" : "💸 *Se finisse ora*");
    if (transfers.length === 0) lines.push("Tutti in pari 🤝");
    for (const t of transfers) lines.push(`${name(t.from)} → ${name(t.to)}  ${money(t.amountCents)}`);
  } else {
    lines.push("", `🪙 Nel piatto: *${money(state.potCents)}* (chi paga chi a piatto pulito)`);
  }

  // record della serata
  const records: string[] = [];
  let hand = 0;
  let richest: { pot: number; hand: number; winners: PlayerId[] } | null = null;
  let worst: { cents: number; id: PlayerId } | null = null;
  let bet = 0;
  for (const h of history) {
    const e = h.event;
    if (e.type === "game_started" || e.type === "bet_changed") bet = e.baseBetCents;
    if (e.type !== "hand_played") continue;
    hand++;
    // senza la messa versata dal nuovo mazziere: conta solo quello che ha vinto o pagato nella mano
    const deltas = Object.entries(h.outcome.deltas).map(([id, d]) => [id, d + (id === h.outcome.dealerAfter ? bet : 0)] as const);
    const winners = deltas.filter(([, d]) => d > 0).map(([id]) => id);
    if (!richest || h.outcome.potBefore > richest.pot) richest = { pot: h.outcome.potBefore, hand, winners };
    for (const [id, d] of deltas) if (d < 0 && (!worst || d < worst.cents)) worst = { cents: d, id };
  }
  if (richest && richest.pot > 0) {
    const who = richest.winners.length ? `, ${richest.winners.map(name).join(" e ")}` : "";
    records.push(`🔥 Piatto più ricco: ${money(richest.pot)} (mano ${richest.hand}${who})`);
  }
  const top = (pick: (s: GameState["players"][number]["stats"]) => number) => {
    const max = Math.max(0, ...state.players.map((p) => pick(p.stats)));
    return max > 0 ? { max, who: state.players.filter((p) => pick(p.stats) === max).map((p) => clean(p.name)) } : null;
  };
  const wins = top((s) => s.handsWon);
  if (wins) records.push(`🃏 Più mani vinte: ${wins.who.join(", ")} (${wins.max})`);
  const bestie = top((s) => s.bestie);
  if (bestie) records.push(`🐗 Più bestie: ${bestie.who.join(", ")} (${bestie.max})`);
  if (worst) records.push(`💥 Bestia più cara: ${name(worst.id)} ${money(worst.cents)}`);
  if (records.length) lines.push("", ...records);

  if (url) lines.push("", `_Conti tenuti con Bestia · ${url}_`);
  return lines.join("\n");
}

/** Toglie i caratteri che WhatsApp userebbe per la formattazione. */
const clean = (s: string) => s.replace(/[*_~`]/g, "").trim();

/** "ven 13 nov, 21:05 → 00:15 (3h 10')" dagli orari degli eventi. */
function timeSpan(times: string[]): string | null {
  const ms = times.map((t) => Date.parse(t)).filter((n) => Number.isFinite(n));
  if (ms.length === 0) return null;
  const start = new Date(Math.min(...ms));
  const end = new Date(Math.max(...ms));
  const day = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" }).format(start);
  const clock = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes < 1) return day;
  const h = Math.floor(minutes / 60);
  const duration = h > 0 ? `${h}h ${String(minutes % 60).padStart(2, "0")}'` : `${minutes}'`;
  return `${day}, ${clock.format(start)} → ${clock.format(end)} (${duration})`;
}
