/**
 * Bustine e album: i pezzi del personaggio si sbloccano aprendo bustine.
 *
 * I capelli (tutti i tagli e tutti i colori) sono liberi per tutti; ogni altro pezzo va trovato
 * in una bustina. Le bustine si aprono gratis (benvenuto, una al giorno) o si comprano con i
 * gettoni guadagnati giocando.
 *
 * Quello che esce lo decide il database (supabase/migrations/0009_bustine.sql), così nessuno
 * può scegliersi i pezzi: qui ci sono solo nomi, prezzi e colori da mostrare, che devono
 * restare allineati con quel file (packs.test.ts lo controlla). Se aggiungi un pezzo al catalogo,
 * dagli una rarità in rarity.json e inseriscilo anche nel database: `npm run avatar:sql` stampa
 * l'SQL da eseguire nel SQL Editor di Supabase.
 */
import { catalog, type CatalogItem, type Category } from "./catalog";
import rarityMap from "./rarity.json";

export type Rarity = "comune" | "rara" | "epica" | "leggendaria";
export const RARITIES: Rarity[] = ["comune", "rara", "epica", "leggendaria"];

export const RARITY_INFO: Record<Rarity, { label: string; color: string; glow: string; refund: number; weight: number }> = {
  comune: { label: "Comune", color: "#9fb0d4", glow: "rgba(159,176,212,0.55)", refund: 10, weight: 62 },
  rara: { label: "Rara", color: "#4fa8ff", glow: "rgba(79,168,255,0.7)", refund: 25, weight: 27 },
  epica: { label: "Epica", color: "#c06cff", glow: "rgba(192,108,255,0.8)", refund: 60, weight: 9 },
  leggendaria: { label: "Leggendaria", color: "#ffbf2e", glow: "rgba(255,191,46,0.9)", refund: 150, weight: 2 },
};

/** Categorie sempre libere: si sceglie subito il taglio di capelli, il resto si colleziona. */
export const FREE_CATEGORIES: Category[] = ["hair"];
export const isFree = (item: Pick<CatalogItem, "category"> | undefined) => !!item && FREE_CATEGORIES.includes(item.category);

/** Rarità di ogni pezzo da collezionare (stessa lista inserita nel database da 0009_bustine.sql). */
export const RARITY = rarityMap as Record<string, Rarity>;

export const rarityOf = (id: string): Rarity => RARITY[id] ?? "comune";

/** I pezzi da collezionare (tutti tranne quelli liberi), nell'ordine del catalogo. */
export const collectibles = catalog.items.filter((i) => !isFree(i));

export type PackKind = "benvenuto" | "giornaliera" | "classica" | "oro";

export interface PackInfo {
  kind: PackKind;
  name: string;
  /** Scritta sulla bustina. */
  short: string;
  tagline: string;
  /** Pezzi dentro la bustina. */
  size: number;
  /** Prezzo in gettoni (0 = gratis). */
  price: number;
  /** Rarità minima garantita nell'ultimo pezzo. */
  guaranteed?: Rarity;
  /** Colori della bustina: sfondo e bordo/scritte. */
  colors: { from: string; via: string; to: string; ink: string };
}

/** Stessi valori di open_pack in 0009_bustine.sql. */
export const PACKS: Record<PackKind, PackInfo> = {
  benvenuto: {
    kind: "benvenuto",
    name: "Bustina di benvenuto",
    short: "Benvenuto",
    tagline: "Un regalo per iniziare: almeno un pezzo raro",
    size: 4,
    price: 0,
    guaranteed: "rara",
    colors: { from: "#7a1022", via: "#c3203a", to: "#5a0a18", ink: "#ffe08a" },
  },
  giornaliera: {
    kind: "giornaliera",
    name: "Bustina del giorno",
    short: "Del giorno",
    tagline: "Gratis, una al giorno",
    size: 2,
    price: 0,
    colors: { from: "#14462b", via: "#2e7d32", to: "#0f3320", ink: "#d8ffe0" },
  },
  classica: {
    kind: "classica",
    name: "Bustina classica",
    short: "Classica",
    tagline: "3 pezzi a sorpresa",
    size: 3,
    price: 120,
    colors: { from: "#1a2a55", via: "#3352a8", to: "#121c3c", ink: "#ffd54a" },
  },
  oro: {
    kind: "oro",
    name: "Bustina d'oro",
    short: "D'oro",
    tagline: "5 pezzi, almeno uno epico",
    size: 5,
    price: 350,
    guaranteed: "epica",
    colors: { from: "#8a5a00", via: "#ffcf40", to: "#6b4300", ink: "#2a1a00" },
  },
};

/** Gettoni a fine partita (stessi valori di 0009_bustine.sql). */
export const REWARDS = {
  /** Per ogni partita terminata a cui hai giocato o che hai condotto. */
  perGame: 50,
  /** In più se chiudi in attivo: un gettone ogni 10 centesimi vinti, fino a questo tetto. */
  maxWinBonus: 50,
  /** Partite premiate al giorno, al massimo. */
  gamesPerDay: 6,
};

/** Un pezzo uscito da una bustina. */
export interface PackCard {
  id: string;
  rarity: Rarity;
  /** false se lo avevi già: diventa gettoni. */
  isNew: boolean;
  coins: number;
}

/** La rarità migliore tra i pezzi (per il colore della luce quando si strappa la bustina). */
export function bestRarity(cards: Pick<PackCard, "rarity">[]): Rarity {
  return cards.reduce<Rarity>((best, c) => (RARITIES.indexOf(c.rarity) > RARITIES.indexOf(best) ? c.rarity : best), "comune");
}

/** Millisecondi alla prossima mezzanotte italiana, quando torna la bustina del giorno. */
export function msToNextDaily(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return Math.max(0, 86_400_000 - elapsed);
}

/** "5 h 12 min", "12 min", "meno di un minuto". */
export function formatWait(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "meno di un minuto";
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
}

/** Pezzi posseduti per categoria, per i contatori dell'album. */
export function progressOf(owned: ReadonlySet<string>, category?: Category) {
  const list = category ? collectibles.filter((i) => i.category === category) : collectibles;
  return { owned: list.filter((i) => owned.has(i.id)).length, total: list.length };
}
