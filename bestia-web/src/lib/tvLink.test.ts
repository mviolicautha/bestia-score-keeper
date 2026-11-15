import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { couldBeGameCode, displayHost, shortTvPath } from "./tvLink";

describe("link corto della vista TV", () => {
  it("il percorso è il solo codice, in maiuscolo", () => {
    expect(shortTvPath("kx7p2")).toBe("/KX7P2");
    expect(shortTvPath(" KX-7P2 ")).toBe("/KX7P2");
  });

  it("l'indirizzo da scrivere non ha https:// né www.", () => {
    expect(displayHost("https://www.bestia.app")).toBe("bestia.app");
    expect(displayHost("http://localhost:3000")).toBe("localhost:3000");
  });

  it("next.config riscrive /CODICE su /t/CODICE", async () => {
    const rewrites = await nextConfig.rewrites!();
    expect(rewrites).toEqual([{ source: "/:code([A-Za-z0-9]{5})", destination: "/t/:code" }]);
  });

  it("riconosce cosa può essere un codice (niente 0/O e 1/I)", () => {
    expect(couldBeGameCode("kx7p2")).toBe(true);
    expect(couldBeGameCode("GIOCA")).toBe(false);
    expect(couldBeGameCode("KX7P")).toBe(false);
  });

  it("nessuna pagina in cima all'app ha un nome che potrebbe essere un codice (la pagina vincerebbe)", () => {
    const app = fileURLToPath(new URL("../app", import.meta.url));
    const clashes = readdirSync(app, { withFileTypes: true })
      .filter((d) => d.isDirectory() && couldBeGameCode(d.name))
      .map((d) => d.name);
    expect(clashes).toEqual([]);
  });
});
