/**
 * Obiettivi e sfide settimanali: premi in gettoni o bustine per chi gioca.
 *
 * Chi ha raggiunto cosa lo calcola il database (supabase/migrations/0010_obiettivi.sql) dai
 * risultati salvati dal master: qui ci sono solo titoli, soglie e premi da mostrare, che devono
 * restare allineati con quel file (achievements.test.ts lo controlla).
 */
import { catalog, type Category } from "./avatar/catalog";
import { collectibles } from "./avatar/packs";
import { NICKNAMES, type NicknameId } from "./stats";

export type BonusPack = "classica" | "oro";
export type Reward = { coins: number; pack?: undefined } | { pack: BonusPack; coins?: undefined };

export type GroupId = "presenza" | "risultati" | "mani" | "consolazione" | "soprannomi" | "album";

export const GROUPS: { id: GroupId; title: string; hint: string }[] = [
  { id: "presenza", title: "Al tavolo", hint: "Basta esserci" },
  { id: "risultati", title: "Risultati", hint: "Serate da ricordare" },
  { id: "mani", title: "Mani e prese", hint: "Colpi al tavolo" },
  { id: "consolazione", title: "Premi di consolazione", hint: "Almeno ti rifai l'album" },
  { id: "soprannomi", title: "Soprannomi", hint: "Uno per ogni soprannome della serata" },
  { id: "album", title: "Album", hint: "Collezionisti" },
];

export interface Achievement {
  id: string;
  group: GroupId;
  emoji: string;
  title: string;
  description: string;
  /** Soglia da raggiungere (per le categorie dell'album: i pezzi della categoria). */
  goal: number;
  reward: Reward;
}

const coins = (n: number): Reward => ({ coins: n });
const pack = (p: BonusPack): Reward => ({ pack: p });

/** Gettoni per il primo soprannome di ogni tipo e per ogni categoria completata. */
export const NICK_COINS = 75;
export const CATEGORY_COINS = 150;
/** Soprannomi diversi da collezionare per la bustina d'oro. */
export const NICKS_GOAL = 8;

const fixed: Achievement[] = [
  { id: "partite_1", group: "presenza", emoji: "🃏", title: "Prima partita", description: "Finisci la tua prima partita", goal: 1, reward: pack("classica") },
  { id: "partite_3", group: "presenza", emoji: "🪑", title: "Habitué", description: "Finisci 3 partite", goal: 3, reward: coins(150) },
  { id: "partite_5", group: "presenza", emoji: "🍷", title: "Di casa", description: "Finisci 5 partite", goal: 5, reward: coins(250) },
  { id: "partite_10", group: "presenza", emoji: "🏛️", title: "Istituzione", description: "Finisci 10 partite", goal: 10, reward: pack("oro") },
  { id: "master_1", group: "presenza", emoji: "🎩", title: "Il Master", description: "Conduci una partita da master", goal: 1, reward: coins(100) },
  { id: "mani_50", group: "presenza", emoji: "✋", title: "Mano calda", description: "Gioca 50 mani in tutto", goal: 50, reward: coins(100) },
  { id: "mani_150", group: "presenza", emoji: "🙌", title: "Veterano", description: "Gioca 150 mani in tutto", goal: 150, reward: coins(200) },

  { id: "attivo_1", group: "risultati", emoji: "📈", title: "In attivo", description: "Chiudi una serata in attivo", goal: 1, reward: coins(100) },
  { id: "attivo_fila_2", group: "risultati", emoji: "🔥", title: "Doppietta", description: "Chiudi in attivo 2 serate di fila", goal: 2, reward: coins(200) },
  { id: "re_1", group: "risultati", emoji: "👑", title: "Re per una notte", description: "Chiudi una serata col saldo più alto di tutti", goal: 1, reward: coins(100) },
  { id: "re_3", group: "risultati", emoji: "🏰", title: "Dinastia", description: "Chiudi col saldo più alto 3 serate", goal: 3, reward: pack("oro") },

  { id: "tris_1", group: "mani", emoji: "🎯", title: "Tutte e tre", description: "Vinci una mano facendo tutte e 3 le prese", goal: 1, reward: coins(75) },
  { id: "tris_5", group: "mani", emoji: "💯", title: "Pigliatutto", description: "Vinci 5 mani con tutte e 3 le prese", goal: 5, reward: coins(200) },
  { id: "fila_3", group: "mani", emoji: "⚡", title: "In serie", description: "Vinci 3 mani di fila nella stessa serata", goal: 3, reward: coins(150) },
  { id: "societa_1", group: "mani", emoji: "🤝", title: "Soci", description: "Vinci una mano in società", goal: 1, reward: coins(75) },
  { id: "societa_5", group: "mani", emoji: "🏢", title: "Holding", description: "Vinci 5 mani in società", goal: 5, reward: coins(150) },

  { id: "tripla_bestia", group: "consolazione", emoji: "🐗", title: "Tripla bestia", description: "Vai in bestia 3 volte nella stessa serata", goal: 3, reward: coins(150) },
  { id: "mani_di_burro", group: "consolazione", emoji: "🧈", title: "Mani di burro", description: "Dai male le carte da mazziere", goal: 1, reward: coins(75) },
  { id: "abisso", group: "consolazione", emoji: "🕳️", title: "Abisso", description: "Scendi sotto di 20 messe durante una serata", goal: 1, reward: coins(150) },
  { id: "ultimo", group: "consolazione", emoji: "🥄", title: "Cucchiaio di legno", description: "Chiudi una serata col saldo più basso di tutti", goal: 1, reward: coins(100) },
];

export const NICKNAME_IDS = Object.keys(NICKNAMES) as NicknameId[];

const nicknames: Achievement[] = [
  ...NICKNAME_IDS.map<Achievement>((id) => ({
    id: `nick_${id}`,
    group: "soprannomi",
    emoji: NICKNAMES[id].emoji,
    title: NICKNAMES[id].title,
    description: `Prendi il soprannome: ${NICKNAMES[id].hint}`,
    goal: 1,
    reward: coins(NICK_COINS),
  })),
  { id: "soprannomi_8", group: "soprannomi", emoji: "🎭", title: "Mille volti", description: `Prendi ${NICKS_GOAL} soprannomi diversi`, goal: NICKS_GOAL, reward: pack("oro") },
];

/** Le categorie dell'album da completare (i capelli sono liberi, quindi no). */
export const ALBUM_CATEGORIES: { id: Category; label: string }[] = catalog.categories.filter((c) => collectibles.some((i) => i.category === c.id));

const album: Achievement[] = [
  { id: "album_25", group: "album", emoji: "📒", title: "Collezionista", description: "Trova 25 pezzi dell'album", goal: 25, reward: pack("classica") },
  { id: "album_50", group: "album", emoji: "📚", title: "Archivista", description: "Trova 50 pezzi dell'album", goal: 50, reward: pack("oro") },
  { id: "giornaliera_7", group: "album", emoji: "📅", title: "Costanza", description: "Apri la bustina del giorno 7 giorni di fila", goal: 7, reward: pack("classica") },
  ...ALBUM_CATEGORIES.map<Achievement>((c) => ({
    id: `cat_${c.id}`,
    group: "album",
    emoji: "✅",
    title: `${c.label} al completo`,
    description: `Trova tutti i pezzi della categoria ${c.label}`,
    goal: collectibles.filter((i) => i.category === c.id).length,
    reward: coins(CATEGORY_COINS),
  })),
];

export const ACHIEVEMENTS: Achievement[] = [...fixed, ...nicknames, ...album];
export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// ---------------------------------------------------------------- sfide settimanali

export interface Challenge {
  id: string;
  emoji: string;
  title: string;
  goal: number;
}

/** Gettoni per ogni sfida e bustina in più se le fai tutte. */
export const WEEKLY = { coins: 40, bonus: "classica" as BonusPack, count: 3 };

/** Stesso elenco di weekly_defs in 0010_obiettivi.sql (il database sceglie le 3 della settimana). */
export const CHALLENGES: Challenge[] = [
  { id: "w_partita", emoji: "🃏", title: "Gioca una partita", goal: 1 },
  { id: "w_partite_2", emoji: "🪑", title: "Gioca 2 partite", goal: 2 },
  { id: "w_mani_25", emoji: "✋", title: "Gioca 25 mani", goal: 25 },
  { id: "w_prese_10", emoji: "🂠", title: "Fai 10 prese", goal: 10 },
  { id: "w_giornaliera_3", emoji: "📅", title: "Apri la bustina del giorno 3 volte", goal: 3 },
  { id: "w_vinte_5", emoji: "🏆", title: "Vinci 5 mani", goal: 5 },
  { id: "w_societa", emoji: "🤝", title: "Vinci una mano in società", goal: 1 },
  { id: "w_tris", emoji: "🎯", title: "Vinci una mano con tutte e 3 le prese", goal: 1 },
  { id: "w_bestia", emoji: "🐗", title: "Vai in bestia almeno una volta", goal: 1 },
];
export const CHALLENGE_BY_ID: Record<string, Challenge> = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

export function rewardLabel(r: Reward): string {
  return r.pack ? (r.pack === "oro" ? "Bustina d'oro" : "Bustina classica") : `${r.coins} gettoni`;
}

/** Millisecondi a lunedì a mezzanotte italiana, quando escono le nuove sfide. */
export function msToNextWeek(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  const elapsed = (((Math.max(0, day) * 24 + Number(get("hour"))) * 60 + Number(get("minute"))) * 60 + Number(get("second"))) * 1000 + now.getMilliseconds();
  return Math.max(0, 7 * 86_400_000 - elapsed);
}
