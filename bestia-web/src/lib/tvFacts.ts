import type { GameState, HistoryEntry, PlayerId } from "@/engine";
import { money } from "@/lib/report";
import { analyzeNight } from "@/lib/stats";

/**
 * Curiosità della serata da far girare sulla TV: serie di vittorie, chi è a secco,
 * piatto record, rimonte, crolli, conversioni in spritz e pizze, proiezioni "scientifiche".
 * Tutto puro: si calcola dalla cronologia (gli orari servono solo per ritmo e proiezione).
 */
export interface TvFact {
  id: string;
  emoji: string;
  /** Titoletto: "In fiamme", "Piatto record", … */
  title: string;
  /** La riga grande: un nome o un importo. */
  headline: string;
  /** La spiegazione sotto. */
  detail: string;
  tone: "gain" | "loss" | "gold" | "plain";
}

/** Come sta andando un giocatore, mano per mano. */
export interface LiveForm {
  /** Mani vinte di fila (le ultime giocate da seduto). */
  streak: number;
  /** Mani giocate da seduto dall'ultima vinta (o da quando si è seduto). */
  dry: number;
}

export interface TvFactsResult {
  facts: TvFact[];
  form: Record<PlayerId, LiveForm>;
  /** Chi è più a secco di tutti (almeno DRY_MIN mani), per il badge in classifica. */
  driest: PlayerId | null;
}

export const STREAK_MIN = 2;
export const DRY_MIN = 6;

/** Prezzi di riferimento (molto) indicativi per le conversioni. */
const STUFF = [
  { min: 800, cents: 800, one: "pizza margherita", many: "pizze margherite" },
  { min: 300, cents: 350, one: "spritz", many: "spritz" },
  { min: 0, cents: 120, one: "caffè", many: "caffè" },
] as const;

/** "≈ 4 spritz": sceglie la cosa più adatta all'importo. */
export function inStuff(cents: number): string {
  const s = STUFF.find((x) => cents >= x.min) ?? STUFF[STUFF.length - 1];
  const n = Math.max(1, Math.round(cents / s.cents));
  return `${n} ${n === 1 ? s.one : s.many}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}'` : `${m}'`;
}

/** Il giocatore con il punteggio più alto, se è uno solo (a pari merito nessuno). */
function unique<T>(items: T[], score: (x: T) => number): T | null {
  if (items.length === 0) return null;
  const best = Math.max(...items.map(score));
  const top = items.filter((x) => score(x) === best);
  return top.length === 1 ? top[0] : null;
}

export function tvFacts(state: GameState, history: HistoryEntry[], times: string[] = []): TvFactsResult {
  const name = (id: PlayerId) => state.players.find((p) => p.id === id)?.name ?? "?";
  const active = new Set(state.players.filter((p) => p.active).map((p) => p.id));
  const night = analyzeNight(state, history);
  const bet = Math.max(1, night.betCents);

  const form: Record<PlayerId, LiveForm> = {};
  const seated = new Set<PlayerId>();
  let curBet = 0;
  let hand = 0;
  let richest: { pot: number; hand: number; winners: PlayerId[] } | null = null;
  let turnover = 0;
  let leader: PlayerId | null = null;
  let leaderChanges = 0;
  const misdeals = new Map<PlayerId, number>();
  const pairs = new Map<string, number>();
  let firstHandAt: number | null = null;
  let lastAt: number | null = null;

  for (const h of history) {
    const e = h.event;
    const at = Date.parse(times[h.index] ?? "");
    if (Number.isFinite(at)) lastAt = at;
    if (e.type === "game_started" || e.type === "bet_changed") curBet = e.baseBetCents;
    if (e.type === "player_added") {
      seated.add(e.playerId);
      form[e.playerId] ??= { streak: 0, dry: 0 };
    }
    if (e.type === "player_left" || e.type === "player_removed") seated.delete(e.playerId);
    if (e.type === "misdeal" && h.outcome.dealerBefore) {
      misdeals.set(h.outcome.dealerBefore, (misdeals.get(h.outcome.dealerBefore) ?? 0) + 1);
    }
    if (e.type !== "hand_played") continue;

    hand++;
    if (firstHandAt === null && Number.isFinite(at)) firstHandAt = at;
    // senza la messa del nuovo mazziere: conta solo quello che ha vinto o pagato nella mano
    const net = (id: PlayerId) => (h.outcome.deltas[id] ?? 0) + (id === h.outcome.dealerAfter ? curBet : 0);
    const winners = Object.keys(h.outcome.deltas).filter((id) => net(id) > 0);
    turnover += h.outcome.potBefore;
    if (!richest || h.outcome.potBefore > richest.pot) richest = { pot: h.outcome.potBefore, hand, winners };

    for (const id of seated) {
      const f = (form[id] ??= { streak: 0, dry: 0 });
      if (net(id) > 0) {
        f.streak++;
        f.dry = 0;
      } else {
        f.streak = 0;
        f.dry++;
      }
    }
    for (const g of e.winners) {
      if (g.playerIds.length !== 2) continue;
      const key = [...g.playerIds].sort().join("|");
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }

    // chi comanda dopo questa mano (solo se in attivo e da solo)
    const top = unique(Object.entries(h.balances).filter(([, b]) => b > 0), ([, b]) => b);
    if (top && top[0] !== leader) {
      if (leader !== null) leaderChanges++;
      leader = top[0];
    }
  }

  const facts: TvFact[] = [];
  const players = night.players.filter((p) => active.has(p.id));

  // 🔥 serie di vittorie
  const hot = unique(
    players.filter((p) => (form[p.id]?.streak ?? 0) >= STREAK_MIN),
    (p) => form[p.id].streak,
  );
  if (hot) {
    const n = form[hot.id].streak;
    facts.push({ id: "streak", emoji: "🔥", title: "In fiamme", headline: hot.name, detail: `ha vinto le ultime ${n} mani di fila`, tone: "gain" });
  }

  // 🥶 a secco
  const dryOne = unique(
    players.filter((p) => (form[p.id]?.dry ?? 0) >= DRY_MIN),
    (p) => form[p.id].dry,
  );
  if (dryOne) {
    const n = form[dryOne.id].dry;
    const never = dryOne.handsWon === 0;
    facts.push({
      id: "dry",
      emoji: "🥶",
      title: "A secco",
      headline: dryOne.name,
      detail: never ? `nemmeno una mano vinta in ${n} giri: qualcuno offra da bere` : `non vince una mano da ${n} giri`,
      tone: "plain",
    });
  }

  // 💰 piatto record
  if (richest && richest.pot > 0 && hand >= 2) {
    const who = richest.winners.length > 1 ? `diviso tra ${richest.winners.map(name).join(" e ")}` : `preso da ${name(richest.winners[0] ?? "")}`;
    facts.push({ id: "record", emoji: "💰", title: "Piatto record", headline: money(richest.pot), detail: `alla mano ${richest.hand}, ${who}`, tone: "gold" });
  }

  // 🐗 collezionista di bestie
  const beast = unique(
    night.players.filter((p) => p.bestie >= 2),
    (p) => p.bestie,
  );
  if (beast) {
    facts.push({ id: "bestie", emoji: "🐗", title: "Collezionista di bestie", headline: beast.name, detail: `${plural(beast.bestie, "bestia", "bestie")} stasera, e la serata è giovane`, tone: "loss" });
  }

  // 🚀 rimonta
  const comeback = unique(
    players.filter((p) => p.minCents <= -3 * bet && p.balanceCents - p.minCents >= 5 * bet && p.balanceCents > p.minCents),
    (p) => p.balanceCents - p.minCents,
  );
  if (comeback) {
    facts.push({
      id: "rimonta",
      emoji: "🚀",
      title: "Rimonta in corso",
      headline: comeback.name,
      detail: `era a ${money(comeback.minCents, true)}, ora è a ${money(comeback.balanceCents, true)}`,
      tone: "gain",
    });
  }

  // 📉 dalle stelle alle stalle
  const fall = unique(
    players.filter((p) => p.maxCents >= 3 * bet && p.maxCents - p.balanceCents >= 5 * bet && p.id !== comeback?.id),
    (p) => p.maxCents - p.balanceCents,
  );
  if (fall) {
    facts.push({
      id: "crollo",
      emoji: "📉",
      title: "Dalle stelle alle stalle",
      headline: fall.name,
      detail: `è stato a ${money(fall.maxCents, true)}, ora è a ${money(fall.balanceCents, true)}`,
      tone: "loss",
    });
  }

  // 🎯 cecchino
  const sniper = unique(
    players.filter((p) => p.handsWon >= 3 && p.handsPresent >= 5),
    (p) => p.handsWon / p.handsPresent,
  );
  if (sniper) {
    const pct = Math.round((sniper.handsWon / sniper.handsPresent) * 100);
    facts.push({ id: "cecchino", emoji: "🎯", title: "Il Cecchino", headline: sniper.name, detail: `${sniper.handsWon} mani vinte su ${sniper.handsPresent} (${pct}%)`, tone: "gold" });
  }

  // 🤝 coppia d'oro
  const pair = unique([...pairs.entries()].filter(([, n]) => n >= 2), ([, n]) => n);
  if (pair) {
    const [a, b] = pair[0].split("|");
    facts.push({ id: "coppia", emoji: "🤝", title: "Coppia d'oro", headline: `${name(a)} & ${name(b)}`, detail: `${pair[1]} mani vinte in società`, tone: "gold" });
  }

  // 🧈 mani di burro
  const butter = unique([...misdeals.entries()], ([, n]) => n);
  if (butter) {
    facts.push({ id: "burro", emoji: "🧈", title: "Mani di burro", headline: name(butter[0]), detail: `ha dato male le carte ${butter[1] === 1 ? "una volta" : `${butter[1]} volte`}`, tone: "loss" });
  }

  // 👑 cambi al comando
  if (leaderChanges >= 3) {
    facts.push({ id: "vetta", emoji: "👑", title: "Trono ballerino", headline: `${leaderChanges} cambi al comando`, detail: leader ? `per ora sul trono c'è ${name(leader)}` : "e adesso non comanda nessuno", tone: "gold" });
  }

  // 🙈 mani passate
  if (state.handsPassed >= 3) {
    facts.push({ id: "passate", emoji: "🙈", title: "Coraggio, eh", headline: plural(state.handsPassed, "mano passata", "mani passate"), detail: "nessuno se l'è sentita di giocare", tone: "plain" });
  }

  // 🍹 il piatto adesso, in spritz
  if (state.status !== "ended" && state.potCents >= 300) {
    facts.push({ id: "piatto", emoji: "🍹", title: "Nel piatto adesso", headline: money(state.potCents), detail: `cioè circa ${inStuff(state.potCents)}`, tone: "gold" });
  }

  // 💸 giro d'affari
  if (hand >= 5 && turnover >= 300) {
    facts.push({ id: "giro", emoji: "💸", title: "Giro d'affari", headline: money(turnover), detail: `passati di mano stasera: ${inStuff(turnover)}`, tone: "gold" });
  }

  // ⏱️ ritmo e 🔮 proiezione
  if (firstHandAt !== null && lastAt !== null && hand >= 4) {
    const minutes = (lastAt - firstHandAt) / 60000;
    if (minutes >= 10) {
      const perHour = Math.round((hand / minutes) * 60);
      facts.push({ id: "ritmo", emoji: "⏱️", title: "Ritmo", headline: `${perHour} mani all'ora`, detail: `si gioca da ${duration(minutes)}`, tone: "plain" });

      const big = unique(
        players.filter((p) => p.handsPresent >= 6 && Math.abs(p.balanceCents) >= 3 * bet),
        (p) => Math.abs(p.balanceCents),
      );
      if (big && state.status !== "ended") {
        const later = big.balanceCents + Math.round((big.balanceCents / big.handsPresent) * perHour);
        facts.push({
          id: "proiezione",
          emoji: "🔮",
          title: "Proiezione (molto) scientifica",
          headline: big.name,
          detail: `a questo ritmo tra un'ora sarà a ${money(later, true)}`,
          tone: later < 0 ? "loss" : "gain",
        });
      }
    }
  }

  const driest = dryOne?.id ?? null;
  return { facts, form, driest };
}
