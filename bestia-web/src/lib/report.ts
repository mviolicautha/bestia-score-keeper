import { colorIndex, formatCents, isPotClean, simplifyDebts, type GameState, type HistoryEntry, type PlayerId } from "@/engine";

/** I dati del resoconto, usati sia dal testo per WhatsApp sia dall'immagine. */
export interface ReportData {
  title: string | null;
  ended: boolean;
  /** "ven 13 nov, 21:05 → 00:15 (3h 10')" */
  when: string | null;
  /** "22 mani · 3 passate · messa 0,30 €" */
  facts: string;
  ranking: { id: PlayerId; name: string; balanceCents: number; active: boolean; seat: number }[];
  /** null quando a partita in corso il piatto non è pulito (i conti non si possono ancora chiudere). */
  transfers: { from: string; to: string; amountCents: number }[] | null;
  potCents: number;
  records: { icon: string; label: string; value: string }[];
}

/** Toglie i caratteri che WhatsApp userebbe per la formattazione. */
export const cleanName = (s: string) => s.replace(/[*_~`]/g, "").trim();
/** Importo con spazi normali (lo spazio speciale prima di "€" disallinea i testi incollati). */
export const money = (cents: number, signed = false) => formatCents(cents, { signed }).replace(/ /g, " ");

export function summarize({
  state,
  history,
  times = [],
  title,
}: {
  state: GameState;
  history: HistoryEntry[];
  times?: string[];
  title?: string;
}): ReportData {
  const ended = state.status === "ended";
  const name = (id: PlayerId) => cleanName(state.players.find((p) => p.id === id)?.name ?? "?");

  const facts = [`${state.handsPlayed} ${state.handsPlayed === 1 ? "mano" : "mani"}`];
  if (state.handsPassed > 0) facts.push(`${state.handsPassed} ${state.handsPassed === 1 ? "passata" : "passate"}`);
  facts.push(`messa ${money(state.baseBetCents)}`);

  const ranking = [...state.players]
    .sort((a, b) => b.balanceCents - a.balanceCents || a.joinOrder - b.joinOrder)
    .map((p) => ({ id: p.id, name: cleanName(p.name), balanceCents: p.balanceCents, active: p.active, seat: colorIndex(state, p.id) }));

  // chi paga chi: a partita in corso solo a piatto pulito (come a fine partita, la messa torna al mazziere)
  let transfers: ReportData["transfers"] = null;
  if (ended || isPotClean(state)) {
    const balances: Record<PlayerId, number> = Object.fromEntries(state.players.map((p) => [p.id, p.balanceCents]));
    if (!ended && state.dealerId && state.potCents > 0) balances[state.dealerId] += state.potCents;
    transfers = simplifyDebts(balances).map((t) => ({ from: name(t.from), to: name(t.to), amountCents: t.amountCents }));
  }

  // record della serata
  const records: ReportData["records"] = [];
  let hand = 0;
  let bet = 0;
  let richest: { pot: number; hand: number; winners: PlayerId[] } | null = null;
  let worst: { cents: number; id: PlayerId } | null = null;
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
    records.push({ icon: "🔥", label: "Piatto più ricco", value: `${money(richest.pot)} (mano ${richest.hand}${who})` });
  }
  const top = (pick: (s: GameState["players"][number]["stats"]) => number) => {
    const max = Math.max(0, ...state.players.map((p) => pick(p.stats)));
    return max > 0 ? `${state.players.filter((p) => pick(p.stats) === max).map((p) => cleanName(p.name)).join(", ")} (${max})` : null;
  };
  const wins = top((s) => s.handsWon);
  if (wins) records.push({ icon: "🃏", label: "Più mani vinte", value: wins });
  const bestie = top((s) => s.bestie);
  if (bestie) records.push({ icon: "🐗", label: "Più bestie", value: bestie });
  if (worst) records.push({ icon: "💥", label: "Bestia più cara", value: `${name(worst.id)} ${money(worst.cents)}` });

  return {
    title: title ? cleanName(title) : null,
    ended,
    when: timeSpan(times),
    facts: facts.join(" · "),
    ranking,
    transfers,
    potCents: state.potCents,
    records,
  };
}

/**
 * Resoconto della partita da incollare in un gruppo WhatsApp: classifica, chi paga chi e
 * qualche record. Usa la formattazione di WhatsApp (*grassetto*, _corsivo_).
 */
export function buildReport(input: Parameters<typeof summarize>[0] & { url?: string }): string {
  const r = summarize(input);
  const lines: string[] = [];

  lines.push(`🐗 *Bestia${r.title ? ` · ${r.title}` : ""}*`);
  if (!r.ended) lines.push("_Resoconto parziale: la partita è in corso_");
  if (r.when) lines.push(`📅 ${r.when}`);
  lines.push(r.facts);

  const medals = ["🥇", "🥈", "🥉"];
  lines.push("", "🏆 *Classifica*");
  r.ranking.forEach((p, i) => {
    const pos = p.balanceCents > 0 && i < 3 ? medals[i] : `${i + 1}.`;
    const out = !r.ended && !p.active ? " _(uscito)_" : "";
    lines.push(`${pos} ${p.name}  ${money(p.balanceCents, true)}${out}`);
  });

  if (r.transfers) {
    lines.push("", r.ended ? "💸 *Chi paga chi*" : "💸 *Se finisse ora*");
    if (r.transfers.length === 0) lines.push("Tutti in pari 🤝");
    for (const t of r.transfers) lines.push(`${t.from} → ${t.to}  ${money(t.amountCents)}`);
  } else {
    lines.push("", `🪙 Nel piatto: *${money(r.potCents)}* (chi paga chi a piatto pulito)`);
  }

  if (r.records.length) lines.push("", ...r.records.map((x) => `${x.icon} ${x.label}: ${x.value}`));
  if (input.url) lines.push("", `_Conti tenuti con Bestia · ${input.url}_`);
  return lines.join("\n");
}

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
