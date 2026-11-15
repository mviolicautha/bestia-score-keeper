import { describe, expect, it } from "vitest";
import { byRarity, rarityLabel } from "./showcase";

describe("vetrina degli obiettivi", () => {
  it("dal più raro al più comune, a pari merito nell'ordine del catalogo", () => {
    const list = byRarity(["partite_1", "tripla_bestia", "re_1", "abisso", "sconosciuto"], { partite_1: 5, tripla_bestia: 1, re_1: 2, abisso: 1 });
    expect(list.map((x) => x.achievement.id)).toEqual(["tripla_bestia", "abisso", "re_1", "partite_1"]);
    expect(list[0].owners).toBe(1);
  });

  it("dice quanti nella compagnia hanno l'obiettivo", () => {
    expect(rarityLabel(1, 7, "Marco", false)).toBe("Solo Marco");
    expect(rarityLabel(1, 7, "Marco", true)).toBe("Solo tu");
    expect(rarityLabel(3, 7, "Marco", false)).toBe("3 su 7");
    expect(rarityLabel(7, 7, "Marco", false)).toBe("Tutti");
  });
});
