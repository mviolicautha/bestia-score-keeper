import { catalog, layersFor, type CharacterConfig } from "./avatar/catalog";
import { money, type ReportData } from "./report";

/**
 * Immagine del resoconto (PNG), da mandare nel gruppo come foto: vincitore con il suo personaggio,
 * classifica, chi paga chi e record. Disegnata su canvas, con gli stessi livelli dei personaggi.
 */

/** Colori dei posti (stesso ordine di SEAT_COLORS, in esadecimale per il canvas). */
const SEAT_HEX = ["#b91c1c", "#1d4ed8", "#15803d", "#c2410c", "#7e22ce", "#0f766e", "#be185d", "#475569", "#92400e", "#4338ca", "#3f6212", "#155e75"];
const C = {
  bg: "#0d1220",
  panel: "#1a233a",
  line: "rgba(255,255,255,0.07)",
  text: "#ffffff",
  dim: "rgba(255,255,255,0.6)",
  faint: "rgba(255,255,255,0.4)",
  gold: "#ffd54a",
  gain: "#69f0ae",
  loss: "#ff6b6b",
  feltA: "#2e7d32",
  feltB: "#1f5c3a",
};

const W = 1080;
const PAD = 64;
const ROW = 92;
const MAX_TRANSFERS = 8;

/** Altezza dell'immagine per questi dati (il disegno segue le stesse misure). */
export function cardHeight(r: ReportData): number {
  let h = PAD + 40 + 84 + (r.when ? 44 : 0) + 44 + (r.ended ? 0 : 56) + 32;
  if (winnerOf(r)) h += 300 + 32;
  h += 60 + r.ranking.length * ROW + 32;
  const t = r.transfers ? Math.max(1, Math.min(r.transfers.length, MAX_TRANSFERS) + (r.transfers.length > MAX_TRANSFERS ? 1 : 0)) : 1;
  h += 60 + t * 52 + 32;
  if (r.records.length) h += 24 + r.records.length * 50 + 16;
  return h + 40 + PAD;
}

const winnerOf = (r: ReportData) => (r.ranking[0] && r.ranking[0].balanceCents > 0 ? r.ranking[0] : null);

export async function drawReportCard(
  r: ReportData,
  characterFor: (name: string, id: string) => CharacterConfig | null,
  footer: string,
): Promise<Blob> {
  const height = cardHeight(r);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  try {
    await document.fonts?.ready;
  } catch {
    /* si usa il carattere di sistema */
  }
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const font = (px: number, weight = 700) => `${weight} ${px}px ${family}`;

  // sfondo
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, height);
  const glow = ctx.createRadialGradient(W / 2, -200, 50, W / 2, -200, 900);
  glow.addColorStop(0, "rgba(46,125,50,0.35)");
  glow.addColorStop(1, "rgba(46,125,50,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, height);

  let y = PAD;
  // intestazione
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.gold;
  ctx.font = font(28, 800);
  spaced(ctx, "♠ BESTIA", PAD, y + 28, 6);
  y += 40;
  ctx.fillStyle = C.text;
  ctx.font = font(68, 900);
  ctx.fillText(fit(ctx, r.title ?? "Conti della serata", W - 2 * PAD), PAD, y + 66);
  y += 84;
  ctx.font = font(30, 500);
  ctx.fillStyle = C.dim;
  if (r.when) {
    ctx.fillText(fit(ctx, r.when, W - 2 * PAD), PAD, y + 32);
    y += 44;
  }
  ctx.fillText(fit(ctx, r.facts, W - 2 * PAD), PAD, y + 32);
  y += 44;
  if (!r.ended) {
    ctx.font = font(26, 800);
    const label = "RESOCONTO PARZIALE · PARTITA IN CORSO";
    const w = ctx.measureText(label).width + 40;
    roundRect(ctx, PAD, y + 8, w, 44, 22);
    ctx.fillStyle = "rgba(255,213,74,0.15)";
    ctx.fill();
    ctx.fillStyle = C.gold;
    ctx.fillText(label, PAD + 20, y + 40);
    y += 56;
  }
  y += 32;

  // vincitore
  const winner = winnerOf(r);
  if (winner) {
    const h = 300;
    roundRect(ctx, PAD, y, W - 2 * PAD, h, 44);
    const g = ctx.createLinearGradient(PAD, y, W - PAD, y + h);
    g.addColorStop(0, C.feltA);
    g.addColorStop(1, C.feltB);
    ctx.fillStyle = g;
    ctx.fill();
    const size = 236;
    await drawAvatar(ctx, characterFor(winner.name, winner.id), winner.name, winner.seat, PAD + 32, y + 32, size, 40, "bust");
    const tx = PAD + 32 + size + 36;
    const tw = W - PAD - 32 - tx;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = font(26, 800);
    spaced(ctx, r.ended ? "🏆 VINCE LA SERATA" : "🏆 IN TESTA", tx, y + 92, 3);
    ctx.fillStyle = C.text;
    ctx.font = font(76, 900);
    ctx.fillText(fit(ctx, winner.name, tw), tx, y + 172);
    ctx.fillStyle = C.gold;
    ctx.font = font(64, 900);
    ctx.fillText(money(winner.balanceCents, true), tx, y + 248);
    y += h + 32;
  }

  // classifica
  ctx.fillStyle = C.text;
  ctx.font = font(40, 800);
  ctx.fillText("Classifica", PAD, y + 40);
  y += 60;
  const listH = r.ranking.length * ROW;
  roundRect(ctx, PAD, y, W - 2 * PAD, listH, 32);
  ctx.fillStyle = C.panel;
  ctx.fill();
  for (const [i, p] of r.ranking.entries()) {
    const ry = y + i * ROW;
    if (i > 0) {
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD + 24, ry, W - 2 * PAD - 48, 2);
    }
    ctx.globalAlpha = !r.ended && !p.active ? 0.45 : 1;
    ctx.fillStyle = C.faint;
    ctx.font = font(32, 800);
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1), PAD + 52, ry + 58);
    ctx.textAlign = "left";
    await drawAvatar(ctx, characterFor(p.name, p.id), p.name, p.seat, PAD + 92, ry + 12, 68, 34, "head");
    ctx.font = font(40, 900);
    const amount = money(p.balanceCents, true);
    const aw = ctx.measureText(amount).width;
    ctx.fillStyle = p.balanceCents < 0 ? C.loss : p.balanceCents > 0 ? C.gain : C.faint;
    ctx.fillText(amount, W - PAD - 32 - aw, ry + 60);
    ctx.fillStyle = C.text;
    ctx.font = font(38, 700);
    ctx.fillText(fit(ctx, p.name, W - PAD - 32 - aw - 24 - (PAD + 184)), PAD + 184, ry + 59);
    ctx.globalAlpha = 1;
  }
  y += listH + 32;

  // chi paga chi
  ctx.fillStyle = C.text;
  ctx.font = font(40, 800);
  ctx.fillText(r.transfers ? (r.ended ? "Chi paga chi" : "Se finisse ora") : "Nel piatto", PAD, y + 40);
  y += 60;
  ctx.font = font(34, 600);
  if (!r.transfers) {
    ctx.fillStyle = C.gold;
    ctx.fillText(`${money(r.potCents)} · chi paga chi a piatto pulito`, PAD, y + 38);
    y += 52;
  } else if (r.transfers.length === 0) {
    ctx.fillStyle = C.dim;
    ctx.fillText("Tutti in pari 🤝", PAD, y + 38);
    y += 52;
  } else {
    for (const t of r.transfers.slice(0, MAX_TRANSFERS)) {
      const amount = money(t.amountCents);
      ctx.font = font(36, 900);
      const aw = ctx.measureText(amount).width;
      ctx.fillStyle = C.gold;
      ctx.fillText(amount, W - PAD - aw, y + 38);
      ctx.font = font(34, 600);
      ctx.fillStyle = C.text;
      ctx.fillText(fit(ctx, `${t.from}  →  ${t.to}`, W - 2 * PAD - aw - 24), PAD, y + 38);
      y += 52;
    }
    if (r.transfers.length > MAX_TRANSFERS) {
      ctx.fillStyle = C.faint;
      ctx.fillText(`…e altri ${r.transfers.length - MAX_TRANSFERS} pagamenti nel testo`, PAD, y + 38);
      y += 52;
    }
  }
  y += 32;

  // record
  if (r.records.length) {
    y += 24;
    for (const rec of r.records) {
      ctx.font = font(30, 600);
      ctx.fillStyle = C.dim;
      const label = `${rec.icon}  ${rec.label}: `;
      ctx.fillText(label, PAD, y + 34);
      const lw = ctx.measureText(label).width;
      ctx.fillStyle = C.text;
      ctx.font = font(30, 800);
      ctx.fillText(fit(ctx, rec.value, W - 2 * PAD - lw), PAD + lw, y + 34);
      y += 50;
    }
    y += 16;
  }

  // piè di pagina
  ctx.fillStyle = C.faint;
  ctx.font = font(26, 600);
  ctx.textAlign = "center";
  ctx.fillText(footer, W / 2, height - PAD + 4);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Immagine non creata"))), "image/png"));
}

/** Testo con spaziatura tra le lettere (letterSpacing non c'è su tutti i browser). */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number) {
  for (const ch of Array.from(text)) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + gap;
  }
}

/** Accorcia con "…" finché il testo non sta nella larghezza. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(chars.join("") + "…").width > max) chars.pop();
  return chars.join("") + "…";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // un livello mancante non blocca l'immagine
      img.src = src;
    });
    images.set(src, p);
  }
  return p;
}

const CROP = { bust: [0.1, 0.06, 0.8], head: [0.27, 0.19, 0.46] } as const;

/** Il personaggio (o l'iniziale) su sfondo del colore del posto, in un riquadro arrotondato. */
async function drawAvatar(
  ctx: CanvasRenderingContext2D,
  config: CharacterConfig | null,
  name: string,
  seat: number,
  x: number,
  y: number,
  size: number,
  radius: number,
  crop: keyof typeof CROP,
) {
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  ctx.fillStyle = SEAT_HEX[seat % SEAT_HEX.length];
  ctx.fillRect(x, y, size, size);
  const layers = config ? layersFor(config) : [];
  if (layers.length) {
    const S = catalog.size || 512;
    const full = document.createElement("canvas");
    full.width = S;
    full.height = S;
    const fc = full.getContext("2d")!;
    for (const l of layers) {
      const img = await loadImage(l.src);
      if (!img) continue;
      if (l.mask) {
        const mask = await loadImage(l.mask);
        const tmp = document.createElement("canvas");
        tmp.width = S;
        tmp.height = S;
        const tc = tmp.getContext("2d")!;
        tc.drawImage(img, 0, 0, S, S);
        if (mask) {
          tc.globalCompositeOperation = "destination-in";
          tc.drawImage(mask, 0, 0, S, S);
        }
        fc.drawImage(tmp, 0, 0);
      } else {
        fc.drawImage(img, 0, 0, S, S);
      }
    }
    const [cx, cy, side] = CROP[crop];
    ctx.drawImage(full, cx * S, cy * S, side * S, side * S, x, y, size, size);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${Math.round(size * 0.5)}px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.charAt(0).toUpperCase() || "?", x + size / 2, y + size / 2 + size * 0.03);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}
