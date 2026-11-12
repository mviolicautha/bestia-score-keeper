import { describe, expect, it } from "vitest";
import { catalog, getItem, itemsOf, layersFor, normalize, randomCharacter, withItem, type Category } from "./catalog";

const first = (cat: Category) => itemsOf(cat)[0];
// Un cappello che nasconde i capelli solo sopra il bordo, e uno che li nasconde tutti.
const hatTop = catalog.items.find((i) => i.category === "hat" && i.hairMask && !i.hidesHair)!;
const hatAll = catalog.items.find((i) => i.category === "hat" && i.hidesHair === "all")!;

describe("catalogo del personaggio", () => {
  it("ogni pezzo ha un'immagine e una categoria valida, ogni cappello una maschera per i capelli", () => {
    expect(catalog.items.length).toBeGreaterThan(0);
    for (const it of catalog.items) {
      expect(catalog.order).toContain(it.category);
      expect(it.src).toMatch(/^\/avatars\//);
      if (it.category === "hat" || it.category === "costume") expect(it.hairMask).toBeTruthy();
      if (it.category === "hair") expect(it.src).toContain("{color}");
    }
  });

  it("normalize scarta pezzi inesistenti o nella categoria sbagliata", () => {
    const hair = first("hair");
    expect(normalize({ hair: hair.id, hat: "non_esiste", glasses: hair.id })).toEqual({ hair: hair.id });
    expect(normalize({ hairColor: "nero" })).toEqual({}); // senza capelli il colore non serve
  });

  it("un costume prende il posto di vestito e cappello, e viceversa", () => {
    const costume = first("costume");
    let c = withItem({ outfit: first("outfit").id, hat: hatTop.id }, "costume", costume.id);
    expect(c).toEqual({ costume: costume.id });
    c = withItem(c, "hat", hatTop.id);
    expect(c).toEqual({ hat: hatTop.id });
  });

  it("disegna i livelli nell'ordine giusto: dietro, base, sopracciglia, poi gli altri", () => {
    const back = first("back");
    const keys = layersFor({ back: back?.id, outfit: first("outfit").id, glasses: first("glasses").id }).map((l) => l.key);
    expect(keys).toEqual([...(back ? [back.id] : []), "base", "eyebrows", first("outfit").id, first("glasses").id]);
  });

  it("le sopracciglia prendono il colore dei capelli (naturali se calvo)", () => {
    expect(catalog.eyebrows).toContain("{color}");
    const brows = (c: Parameters<typeof layersFor>[0]) => layersFor(c).find((l) => l.key === "eyebrows")!.src;
    expect(brows({})).toBe(catalog.eyebrows!.replace("{color}", "naturale"));
    expect(brows({ hair: first("hair").id, hairColor: "biondo" })).toBe(catalog.eyebrows!.replace("{color}", "biondo"));
  });

  it("i capelli prendono il colore scelto e sotto il cappello vengono ritagliati o nascosti", () => {
    const hair = first("hair");
    const plain = layersFor({ hair: hair.id, hairColor: "biondo" }).find((l) => l.key === hair.id)!;
    expect(plain.src).toBe(hair.src.replace("{color}", "biondo"));
    expect(plain.mask).toBeUndefined();

    const underHat = layersFor({ hair: hair.id, hat: hatTop.id }).find((l) => l.key === hair.id)!;
    expect(underHat.mask).toBe(hatTop.hairMask);
    expect(underHat.src).toContain("/naturale.webp");

    expect(layersFor({ hair: hair.id, hat: hatAll.id }).some((l) => l.key === hair.id)).toBe(false);
  });

  it("il personaggio casuale è sempre valido", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const c = randomCharacter(rnd);
      expect(normalize(c)).toEqual(c);
      if (c.costume) expect(c.outfit ?? c.hat).toBeUndefined();
      for (const cat of catalog.order) if (c[cat]) expect(getItem(c[cat])!.category).toBe(cat);
    }
  });
});
