import type { GameState, HistoryEntry, PlayerId } from "@/engine";

/**
 * Statistiche, rivalità e soprannomi. Tutto puro: si calcola rigiocando le partite
 * (nessun dato in più nel database).
 */

// ---------------------------------------------------------------- una partita

/** Cosa ha fatto un giocatore in una partita. */
export interface PlayerNight {
  id: PlayerId;
  name: string;
  joinOrder: number;
  balanceCents: number;
  /** Mani giocate mentre era seduto al tavolo. */
  handsPresent: number;
  handsWon: number;
  bestie: number;
  /** Saldo più basso e più alto toccati durante la serata (partendo da 0). */
  minCents: number;
  maxCents: number;
  /** Il piatto più ricco che ha vinto da solo (0 se nessuno). */
  soloPotCents: number;
  /** Era ancora al tavolo alla fine. */
  stayed: boolean;
}

export interface NightAnalysis {
  /** Messa alla fine della serata. */
  betCents: number;
  players: PlayerNight[];
}

export function analyzeNight(state: GameState, history: HistoryEntry[]): NightAnalysis {
  const nights = new Map<PlayerId, PlayerNight>();
  const seated = new Set<PlayerId>();
  let bet = 0;

  for (const p of state.players)
    nights.set(p.id, {
      id: p.id,
      name: p.name,
      joinOrder: p.joinOrder,
      balanceCents: p.balanceCents,
      handsPresent: 0,
      handsWon: p.stats.handsWon,
      bestie: p.stats.bestie,
      minCents: 0,
      maxCents: 0,
      soloPotCents: 0,
      stayed: p.active,
    });

  for (const h of history) {
    const e = h.event;
    if (e.type === "game_started" || e.type === "bet_changed") bet = e.baseBetCents;
    if (e.type === "player_added") seated.add(e.playerId);
    if (e.type === "player_left") seated.delete(e.playerId);
    if (e.type === "hand_played") {
      for (const id of seated) {
        const n = nights.get(id);
        if (n) n.handsPresent++;
      }
      // chi ha preso il piatto da solo (senza contare la messa del nuovo mazziere)
      const gains = Object.entries(h.outcome.deltas).filter(([id, d]) => d + (id === h.outcome.dealerAfter ? bet : 0) > 0);
      if (gains.length === 1) {
        const n = nights.get(gains[0][0]);
        if (n) n.soloPotCents = Math.max(n.soloPotCents, h.outcome.potBefore);
      }
    }
    for (const [id, b] of Object.entries(h.balances)) {
      const n = nights.get(id);
      if (!n) continue;
      n.minCents = Math.min(n.minCents, b);
      n.maxCents = Math.max(n.maxCents, b);
    }
  }
  return { betCents: bet || state.baseBetCents, players: [...nights.values()] };
}

// ---------------------------------------------------------------- soprannomi

export type NicknameId =
  | "re"
  | "bancomat"
  | "rimonta"
  | "bestia_nera"
  | "paperone"
  | "cecchino"
  | "fantasma"
  | "ottovolante"
  | "equilibrista"
  | "muro"
  | "turista";

export interface Nickname {
  id: NicknameId;
  emoji: string;
  title: string;
  /** Perché: "+12,40 €", "3 bestie", … */
  reason: string;
}

export const NICKNAMES: Record<NicknameId, { emoji: string; title: string; hint: string }> = {
  re: { emoji: "👑", title: "Il Re della serata", hint: "ha chiuso col saldo più alto" },
  bancomat: { emoji: "🏧", title: "Il Bancomat", hint: "ha pagato più di tutti" },
  rimonta: { emoji: "🚀", title: "La Rimonta", hint: "era sotto di parecchio e ha chiuso in pari o sopra" },
  bestia_nera: { emoji: "🐗", title: "La Bestia Nera", hint: "è andato in bestia più di tutti" },
  paperone: { emoji: "💰", title: "Zio Paperone", hint: "ha vinto da solo il piatto più ricco" },
  cecchino: { emoji: "🎯", title: "Il Cecchino", hint: "la percentuale di mani vinte più alta" },
  fantasma: { emoji: "👻", title: "Il Fantasma", hint: "nemmeno una mano vinta" },
  ottovolante: { emoji: "🎢", title: "L'Ottovolante", hint: "su e giù più di tutti" },
  equilibrista: { emoji: "⚖️", title: "L'Equilibrista", hint: "tante mani e alla fine quasi in pari" },
  muro: { emoji: "🧱", title: "Il Muro", hint: "mai in bestia, con tante mani" },
  turista: { emoji: "🧳", title: "Il Turista", hint: "se n'è andato prima della fine" },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * I soprannomi della serata: ognuno ne prende al massimo uno, e ogni soprannome va a una
 * persona sola (a pari merito non lo prende nessuno). L'ordine è quello delle regole qui sotto.
 */
export function nicknamesOf(analysis: NightAnalysis, fmt: (cents: number, signed?: boolean) => string): Record<PlayerId, Nickname> {
  const bet = Math.max(1, analysis.betCents);
  const out: Record<PlayerId, Nickname> = {};
  const free = () => analysis.players.filter((p) => !out[p.id]);

  /** Il migliore tra i candidati liberi secondo `score` (più alto vince); null a pari merito. */
  const award = (id: NicknameId, eligible: (p: PlayerNight) => boolean, score: (p: PlayerNight) => number, reason: (p: PlayerNight) => string) => {
    const candidates = free().filter(eligible);
    if (candidates.length === 0) return;
    const best = Math.max(...candidates.map(score));
    const top = candidates.filter((p) => score(p) === best);
    if (top.length !== 1) return;
    const p = top[0];
    out[p.id] = { id, emoji: NICKNAMES[id].emoji, title: NICKNAMES[id].title, reason: reason(p) };
  };

  const rate = (p: PlayerNight) => (p.handsPresent ? p.handsWon / p.handsPresent : 0);

  award("re", (p) => p.balanceCents > 0, (p) => p.balanceCents, (p) => fmt(p.balanceCents, true));
  award("bancomat", (p) => p.balanceCents < 0, (p) => -p.balanceCents, (p) => fmt(p.balanceCents, true));
  award(
    "rimonta",
    (p) => p.minCents <= -5 * bet && p.balanceCents >= 0,
    (p) => p.balanceCents - p.minCents,
    (p) => `da ${fmt(p.minCents, true)} a ${fmt(p.balanceCents, true)}`,
  );
  award("bestia_nera", (p) => p.bestie >= 2, (p) => p.bestie, (p) => `${p.bestie} bestie`);
  award("paperone", (p) => p.soloPotCents >= 5 * bet, (p) => p.soloPotCents, (p) => `piatto da ${fmt(p.soloPotCents)}`);
  award("cecchino", (p) => p.handsWon >= 3, rate, (p) => `${p.handsWon} mani su ${p.handsPresent} (${pct(rate(p))})`);
  award("fantasma", (p) => p.handsWon === 0 && p.handsPresent >= 8, (p) => p.handsPresent, (p) => `0 mani vinte su ${p.handsPresent}`);
  award(
    "ottovolante",
    (p) => p.maxCents - p.minCents >= 8 * bet,
    (p) => p.maxCents - p.minCents,
    (p) => `tra ${fmt(p.minCents, true)} e ${fmt(p.maxCents, true)}`,
  );
  award(
    "equilibrista",
    (p) => p.handsPresent >= 8 && Math.abs(p.balanceCents) <= bet,
    (p) => -Math.abs(p.balanceCents),
    (p) => `${fmt(p.balanceCents, true)} dopo ${p.handsPresent} mani`,
  );
  award("muro", (p) => p.bestie === 0 && p.handsPresent >= 10, (p) => p.handsPresent, (p) => `0 bestie in ${p.handsPresent} mani`);
  award("turista", (p) => !p.stayed, (p) => -p.handsPresent, (p) => `${p.handsPresent} ${p.handsPresent === 1 ? "mano" : "mani"} e via`);
  return out;
}

// ---------------------------------------------------------------- carriera

/** Una partita terminata vista da me. */
export interface CareerGame {
  gameId: string;
  title: string;
  endedAt: string;
  state: GameState;
  history: HistoryEntry[];
  /** Il mio giocatore in questa partita. */
  me: PlayerId;
  /** Chi è ogni giocatore fuori da questa partita (stessa chiave = stessa persona). */
  keyOf: Record<PlayerId, string>;
}

export interface NightRef {
  gameId: string;
  title: string;
  endedAt: string;
  cents: number;
}

export interface Rival {
  key: string;
  name: string;
  /** Serate giocate insieme. */
  together: number;
  /** Serate in cui ho chiuso sopra / sotto di lui. */
  ahead: number;
  behind: number;
  /** Soldi netti passati da lui a me (negativo: da me a lui), in centesimi. */
  netCents: number;
}

export interface CareerStats {
  games: number;
  gamesWon: number;
  gamesLost: number;
  totalCents: number;
  best: NightRef | null;
  worst: NightRef | null;
  handsPresent: number;
  handsWon: number;
  bestie: number;
  /** Il piatto più ricco vinto da solo. */
  richestPot: NightRef | null;
  /** Serate di fila in attivo (positivo) o in passivo (negativo), dalla più recente. */
  streak: number;
  longestWinStreak: number;
  /** I miei soprannomi, il più recente prima. */
  lastNickname: (Nickname & { gameId: string; endedAt: string }) | null;
  nicknameCounts: { id: NicknameId; count: number }[];
  rivals: Rival[];
}

/**
 * Soldi passati tra due giocatori in una partita: chi ha perso paga chi ha vinto, in proporzione
 * a quanto ha vinto ognuno (è l'unico modo che non dipende da come si saldano i conti).
 */
export function pairFlow(balances: Record<PlayerId, number>, from: PlayerId, to: PlayerId): number {
  const totalGain = Object.values(balances).reduce((a, b) => a + Math.max(0, b), 0);
  if (totalGain === 0) return 0;
  const loss = Math.max(0, -(balances[from] ?? 0));
  const gain = Math.max(0, balances[to] ?? 0);
  return (loss * gain) / totalGain;
}

export function careerOf(games: CareerGame[], fmt: (cents: number, signed?: boolean) => string): CareerStats {
  const sorted = [...games].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
  const s: CareerStats = {
    games: 0,
    gamesWon: 0,
    gamesLost: 0,
    totalCents: 0,
    best: null,
    worst: null,
    handsPresent: 0,
    handsWon: 0,
    bestie: 0,
    richestPot: null,
    streak: 0,
    longestWinStreak: 0,
    lastNickname: null,
    nicknameCounts: [],
    rivals: [],
  };
  const counts = new Map<NicknameId, number>();
  const rivals = new Map<string, Rival>();
  let streakOpen = true;
  let run = 0;

  // dalla più vecchia alla più recente per la striscia più lunga
  for (const g of [...sorted].reverse()) {
    const mine = g.state.players.find((p) => p.id === g.me);
    if (!mine) continue;
    run = mine.balanceCents > 0 ? run + 1 : 0;
    s.longestWinStreak = Math.max(s.longestWinStreak, run);
  }

  for (const g of sorted) {
    const analysis = analyzeNight(g.state, g.history);
    const me = analysis.players.find((p) => p.id === g.me);
    if (!me) continue;
    const ref = (cents: number): NightRef => ({ gameId: g.gameId, title: g.title, endedAt: g.endedAt, cents });

    s.games++;
    s.totalCents += me.balanceCents;
    if (me.balanceCents > 0) s.gamesWon++;
    if (me.balanceCents < 0) s.gamesLost++;
    if (!s.best || me.balanceCents > s.best.cents) s.best = ref(me.balanceCents);
    if (!s.worst || me.balanceCents < s.worst.cents) s.worst = ref(me.balanceCents);
    s.handsPresent += me.handsPresent;
    s.handsWon += me.handsWon;
    s.bestie += me.bestie;
    if (me.soloPotCents > 0 && (!s.richestPot || me.soloPotCents > s.richestPot.cents)) s.richestPot = ref(me.soloPotCents);

    // striscia attuale: si ferma alla prima serata di segno diverso
    if (streakOpen) {
      const sign = Math.sign(me.balanceCents);
      if (sign === 0 || (s.streak !== 0 && sign !== Math.sign(s.streak))) streakOpen = false;
      else s.streak += sign;
    }

    const nick = nicknamesOf(analysis, fmt)[g.me];
    if (nick) {
      counts.set(nick.id, (counts.get(nick.id) ?? 0) + 1);
      if (!s.lastNickname) s.lastNickname = { ...nick, gameId: g.gameId, endedAt: g.endedAt };
    }

    const balances = Object.fromEntries(analysis.players.map((p) => [p.id, p.balanceCents]));
    for (const other of analysis.players) {
      if (other.id === g.me) continue;
      const key = g.keyOf[other.id] ?? `n:${other.name.trim().toLowerCase()}`;
      const r = rivals.get(key) ?? { key, name: other.name, together: 0, ahead: 0, behind: 0, netCents: 0 };
      r.together++;
      if (me.balanceCents > other.balanceCents) r.ahead++;
      if (me.balanceCents < other.balanceCents) r.behind++;
      r.netCents += pairFlow(balances, other.id, g.me) - pairFlow(balances, g.me, other.id);
      rivals.set(key, r);
    }
  }

  // chi in qualche partita era solo un nome si unisce alla persona con lo stesso nome, se è una sola
  const byName = (name: string) => [...rivals.values()].filter((r) => !r.key.startsWith("n:") && r.name.trim().toLowerCase() === name);
  for (const r of [...rivals.values()]) {
    if (!r.key.startsWith("n:")) continue;
    const same = byName(r.key.slice(2));
    if (same.length !== 1) continue;
    const t = same[0];
    t.together += r.together;
    t.ahead += r.ahead;
    t.behind += r.behind;
    t.netCents += r.netCents;
    rivals.delete(r.key);
  }

  s.nicknameCounts = [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
  s.rivals = [...rivals.values()]
    .map((r) => ({ ...r, netCents: Math.round(r.netCents) }))
    .sort((a, b) => b.together - a.together || Math.abs(b.netCents) - Math.abs(a.netCents) || a.name.localeCompare(b.name));
  return s;
}

/** Le rivalità da mettere in evidenza: chi mi ha dato di più, a chi ho dato di più, l'avversario più pari. */
export function highlights(rivals: Rival[]): { bancomat: Rival | null; nemesi: Rival | null; rivale: Rival | null } {
  const bancomat = rivals.filter((r) => r.netCents > 0).sort((a, b) => b.netCents - a.netCents)[0] ?? null;
  const nemesi = rivals.filter((r) => r.netCents < 0).sort((a, b) => a.netCents - b.netCents)[0] ?? null;
  const rivale =
    rivals
      .filter((r) => r.together >= 3 && r !== bancomat && r !== nemesi)
      .sort((a, b) => Math.abs(a.ahead - a.behind) - Math.abs(b.ahead - b.behind) || b.together - a.together)[0] ?? null;
  return { bancomat, nemesi, rivale };
}
