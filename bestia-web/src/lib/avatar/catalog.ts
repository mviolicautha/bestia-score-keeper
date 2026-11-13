/**
 * Catalogo dei pezzi per il personaggio dei giocatori.
 *
 * `catalog.json` è generato da `avatar-pipeline` (npm run export): non modificarlo a mano.
 * Ogni pezzo è un'immagine quadrata grande quanto la base, già allineata: il personaggio
 * si compone sovrapponendo le immagini nell'ordine di `order`.
 */
import raw from "./catalog.json";

export type Category = "back" | "outfit" | "facial" | "mouth" | "hair" | "glasses" | "hat" | "costume" | "extra";

export interface CatalogItem {
  id: string;
  category: Category;
  label: string;
  /** Per i capelli contiene `{color}`, da sostituire con l'id del colore. */
  src: string;
  /** Parte visibile del pezzo (0..1: x0, y0, x1, y1), per le miniature. */
  box: [number, number, number, number];
  /** Cappelli e costumi: maschera che dice dove i capelli restano visibili. */
  hairMask?: string;
  /** "all": niente capelli; "top" (o assente): capelli visibili sotto il bordo, secondo `hairMask`. */
  hidesHair?: "all" | "top";
  hidesFace?: boolean;
}

export interface HairColor {
  id: string;
  label: string;
  /** null per "naturale" (il colore con cui sono stati disegnati). */
  hex: string | null;
}

interface Catalog {
  size: number;
  /** La base senza sopracciglia (se `eyebrows` c'è). */
  base: string;
  /** Sopracciglia, con `{color}`: prendono il colore dei capelli. */
  eyebrows?: string;
  order: Category[];
  slots: Partial<Record<Category, Category[]>>;
  categories: { id: Category; label: string }[];
  hairColors: HairColor[];
  items: CatalogItem[];
}

export const catalog = raw as Catalog;

/** Il personaggio: un pezzo (id) per categoria, più il colore dei capelli. */
export type CharacterConfig = Partial<Record<Category, string>> & { hairColor?: string };

const byId = new Map(catalog.items.map((i) => [i.id, i]));
export const getItem = (id: string | undefined) => (id ? byId.get(id) : undefined);
export const itemsOf = (category: Category) => catalog.items.filter((i) => i.category === category);
export const DEFAULT_HAIR_COLOR = catalog.hairColors[0]?.id ?? "naturale";

/** Categorie occupate da un pezzo: un costume prende anche il posto di vestito e cappello. */
export function slotsOf(category: Category): Category[] {
  return [category, ...(catalog.slots[category] ?? [])];
}

/**
 * Ripulisce una configurazione: toglie i pezzi che non esistono più (asset rimossi),
 * quelli nella categoria sbagliata e i conflitti di slot (vince il costume).
 */
export function normalize(config: CharacterConfig | null | undefined): CharacterConfig {
  const out: CharacterConfig = {};
  if (!config) return out;
  for (const cat of catalog.order) {
    const it = getItem(config[cat]);
    if (it && it.category === cat) out[cat] = it.id;
  }
  if (out.costume) for (const s of slotsOf("costume").slice(1)) delete out[s];
  if (out.hair && config.hairColor && catalog.hairColors.some((c) => c.id === config.hairColor)) out.hairColor = config.hairColor;
  return out;
}

/** Sceglie un pezzo: libera gli slot in conflitto (es. un vestito toglie il costume e viceversa). */
export function withItem(config: CharacterConfig, category: Category, id: string | null): CharacterConfig {
  const next: CharacterConfig = { ...config };
  if (!id) {
    delete next[category];
    return normalize(next);
  }
  for (const s of slotsOf(category)) delete next[s];
  for (const cat of catalog.order) if (next[cat] && slotsOf(cat).includes(category)) delete next[cat];
  next[category] = id;
  return normalize(next);
}

export const isEmpty = (config: CharacterConfig | null | undefined) =>
  !config || catalog.order.every((c) => !config[c]);

export interface Layer {
  key: string;
  src: string;
  /** Maschera CSS (canale alfa) da applicare al livello. */
  mask?: string;
}

/** I livelli da sovrapporre, dal fondo verso l'alto (la base compresa). */
export function layersFor(config: CharacterConfig | null | undefined): Layer[] {
  const c = normalize(config);
  const head = getItem(c.costume) ?? getItem(c.hat);
  const layers: Layer[] = [];
  const back = getItem(c.back);
  if (back) layers.push({ key: back.id, src: back.src });
  layers.push({ key: "base", src: catalog.base });
  const color = c.hairColor ?? DEFAULT_HAIR_COLOR;
  if (catalog.eyebrows) layers.push({ key: "eyebrows", src: catalog.eyebrows.replace("{color}", color) });
  for (const cat of catalog.order) {
    if (cat === "back") continue;
    const it = getItem(c[cat]);
    if (!it) continue;
    if (cat === "hair") {
      if (head?.hidesHair === "all") continue;
      layers.push({ key: it.id, src: it.src.replace("{color}", color), mask: head?.hairMask });
      continue;
    }
    layers.push({ key: it.id, src: it.src });
  }
  return layers;
}

/**
 * Personaggio a caso (per il pulsante "Casuale"). `rnd` restituisce un numero in [0, 1);
 * `allow` limita la scelta ai pezzi che si possono indossare.
 */
export function randomCharacter(rnd: () => number = Math.random, allow: (item: CatalogItem) => boolean = () => true): CharacterConfig {
  const pick = (cat: Category, chance: number) => {
    const list = itemsOf(cat).filter(allow);
    return list.length && rnd() < chance ? list[Math.floor(rnd() * list.length)].id : undefined;
  };
  const useCostume = rnd() < 0.1 && itemsOf("costume").some(allow);
  const config: CharacterConfig = {
    hair: pick("hair", 0.85),
    hairColor: catalog.hairColors[Math.floor(rnd() * catalog.hairColors.length)]?.id,
    facial: pick("facial", 0.35),
    glasses: pick("glasses", 0.3),
    outfit: useCostume ? undefined : pick("outfit", 0.9),
    hat: useCostume ? undefined : pick("hat", 0.4),
    costume: useCostume ? pick("costume", 1) : undefined,
    mouth: pick("mouth", 0.1),
    back: pick("back", 0.08),
    extra: pick("extra", 0.08),
  };
  return normalize(config);
}
