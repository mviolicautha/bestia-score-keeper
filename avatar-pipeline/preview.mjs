// Preview sheets for checking the layers by eye.
//
//   npm run preview                      every layer on the base  -> output/preview/layers.jpg
//   npm run preview -- hat_cowboy hair_short   only these ids      -> output/preview/selection.jpg
//   npm run preview -- --random 12       12 random characters     -> output/preview/random.jpg
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const OUT = path.resolve(HERE, config.outputDir || 'output');
const LAYERS = path.join(OUT, 'layers');
const PREV = path.join(OUT, 'preview');
fs.mkdirSync(PREV, { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const byId = Object.fromEntries(man.items.map(i => [i.id, i]));

const S = 512; // preview resolution of a full layer
const raw = { width: S, height: S, channels: 4 };
const cache = new Map();
async function layer(file) {
  if (!cache.has(file)) cache.set(file, await sharp(path.join(LAYERS, file)).ensureAlpha().resize(S, S).raw().toBuffer());
  return cache.get(file);
}
async function maskedHair(hairFile, maskFile) {
  const hair = Buffer.from(await layer(hairFile));
  const mask = await sharp(path.join(LAYERS, maskFile)).resize(S, S).greyscale().raw().toBuffer();
  for (let i = 0; i < S * S; i++) hair[i * 4 + 3] = (hair[i * 4 + 3] * mask[i]) / 255;
  return hair;
}

// pick = { category: id }, drawn in manifest order; hats/costumes clip the hair.
async function character(pick) {
  const ids = Object.values(pick).filter(Boolean);
  if (ids.some(id => byId[id]?.category === 'costume')) { delete pick.outfit; delete pick.hat; }
  const head = pick.costume || pick.hat;
  const stack = [];
  if (pick.back) stack.push(pick.back);
  stack.push('BASE');
  for (const cat of man.order) if (cat !== 'back' && pick[cat]) stack.push(pick[cat]);
  const inputs = [];
  for (const s of stack) {
    if (s === 'BASE') { inputs.push(await layer(man.base)); continue; }
    const it = byId[s];
    if (it.category === 'hair' && head) inputs.push(await maskedHair(it.file, byId[head].hairMask));
    else inputs.push(await layer(it.file));
  }
  return sharp({ create: { width: S, height: S, channels: 3, background: '#d9d4ca' } })
    .composite(inputs.map(input => ({ input, raw }))).jpeg().toBuffer();
}

async function sheet(tiles, file, cols = 6) {
  const T = 300, TH = 300, LH = 30, comps = [];
  for (const [i, t] of tiles.entries()) {
    const x = (i % cols) * T, y = Math.floor(i / cols) * (TH + LH);
    const label = t.label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    comps.push({ input: Buffer.from(`<svg width="${T}" height="${LH}"><rect width="${T}" height="${LH}" fill="#111"/><text x="6" y="21" font-size="15" fill="white" font-family="Arial">${label}</text></svg>`), left: x, top: y });
    comps.push({ input: await sharp(t.img).resize(T, TH).toBuffer(), left: x, top: y + LH });
  }
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: cols * T, height: rows * (TH + LH), channels: 3, background: '#111' } })
    .composite(comps).jpeg({ quality: 85 }).toFile(path.join(PREV, file));
  console.log('→', path.join(PREV, file));
}

const args = process.argv.slice(2);
const r = args.indexOf('--random');
if (r >= 0) {
  const n = Number(args[r + 1]) || 12; const tiles = [];
  const byCat = (c) => man.items.filter(i => i.category === c).map(i => i.id);
  const any = (c, p) => { const l = byCat(c); return l.length && Math.random() < p ? l[Math.floor(Math.random() * l.length)] : null; };
  for (let k = 0; k < n; k++) {
    const pick = { back: any('back', 0.15), outfit: any('outfit', 0.9), facial: any('facial', 0.4), mouth: any('mouth', 0.15),
      hair: any('hair', 0.8), glasses: any('glasses', 0.35), hat: any('hat', 0.5), costume: any('costume', 0.1), extra: any('extra', 0.15) };
    tiles.push({ img: await character(pick), label: Object.values(pick).filter(Boolean).map(id => id.split('_').slice(1).join('_')).join(' + ') || 'base' });
  }
  await sheet(tiles, 'random.jpg', 4);
} else {
  const ids = args.length ? args : man.items.map(i => i.id);
  const tiles = [];
  for (const id of ids) {
    const it = byId[id]; if (!it) { console.log(`! ${id} non è nel manifest`); continue; }
    tiles.push({ img: await character({ [it.category]: id }), label: id });
  }
  await sheet(tiles, args.length ? 'selection.jpg' : 'layers.jpg');
}
