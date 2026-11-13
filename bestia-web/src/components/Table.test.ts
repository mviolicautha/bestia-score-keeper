import { describe, expect, it } from "vitest";
import { ASPECT, ELLIPSE, seatAngles, seatWidth } from "./Table";

/**
 * Nessun posto deve sovrapporsi a un altro, con qualsiasi numero di giocatori, sul telefono
 * (tavolo alto) e sulla TV (tavolo largo e basso). Un posto è un riquadro largo seatWidth e
 * alto circa 1,45 volte (immagine quadrata + nome + saldo).
 */
describe("posti attorno al tavolo", () => {
  for (const variant of ["master", "tv"] as const) {
    for (let n = 1; n <= 10; n++) {
      it(`${variant}: ${n} giocatori senza sovrapposizioni e dentro il tavolo`, () => {
        const { rx, ry } = ELLIPSE[variant];
        const ratio = ASPECT[variant];
        const w = seatWidth(n, variant === "master") / 100; // in larghezze del tavolo
        const h = w * 1.45;
        const centers = seatAngles(n, rx, ry * ratio).map((a) => ({
          x: (50 + rx * Math.cos(a)) / 100,
          y: ((50 + ry * Math.sin(a)) / 100) * ratio,
        }));
        expect(centers).toHaveLength(n);
        for (let i = 0; i < n; i++) {
          // dentro il riquadro del tavolo (un filo di margine per l'ombra è ammesso)
          expect(centers[i].x - w / 2).toBeGreaterThan(-0.02);
          expect(centers[i].x + w / 2).toBeLessThan(1.02);
          expect(centers[i].y - h / 2).toBeGreaterThan(-0.03);
          expect(centers[i].y + h / 2).toBeLessThan(ratio + 0.03);
          for (let j = i + 1; j < n; j++) {
            const overlapX = Math.abs(centers[i].x - centers[j].x) < w * 0.98;
            const overlapY = Math.abs(centers[i].y - centers[j].y) < h * 0.98;
            expect(overlapX && overlapY, `posti ${i} e ${j} sovrapposti`).toBe(false);
          }
        }
      });
    }
  }

  it("il primo posto è in alto e il giro va in senso orario", () => {
    const [first, second] = seatAngles(4, 40, 46);
    expect(first).toBeCloseTo(-Math.PI / 2, 2);
    expect(second).toBeGreaterThan(first); // angolo crescente = senso orario sullo schermo
  });
});
