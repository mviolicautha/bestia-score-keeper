// Copies the built layers into the web app at web size.
//
//   npm run export
//
// Writes:
//   <webDir>/public/avatars/...            WebP layers, hair colour variants, hair masks
//   <webDir>/src/lib/avatar/catalog.json   what the app reads (categories, items, labels, colours)
//
// Run `npm run build` first: this only reads output/.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
const OUT = path.resolve(HERE, config.outputDir || 'output');
const LAYERS = path.join(OUT, 'layers');
const WEB = path.resolve(HERE, config.webDir);
const PUB = path.join(WEB, 'public', 'avatars');
const CATALOG = path.join(WEB, 'src', 'lib', 'avatar', 'catalog.json');
const S = config.webSize || 512;
const man = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));

const CATEGORY_LABELS = {
  back: 'Dietro', outfit: 'Vestito', facial: 'Barba e baffi', mouth: 'Bocca', hair: 'Capelli',
  glasses: 'Occhiali', hat: 'Cappello', costume: 'Costume', extra: 'Extra',
};
// Order of the tabs in the editor (most used first).
const EDITOR_ORDER = ['hair', 'facial', 'glasses', 'hat', 'outfit', 'costume', 'mouth', 'back', 'extra'];
const pretty = (id) => { const s = id.split('_').slice(1).join(' '); return s.charAt(0).toUpperCase() + s.slice(1); };

// Start clean so removed assets disappear from the app too.
fs.rmSync(PUB, { recursive: true, force: true });
fs.mkdirSync(PUB, { recursive: true });

const webp = (img) => img.webp({ quality: 84, alphaQuality: 90, effort: 5 });
async function small(file) {
  return sharp(path.join(LAYERS, file)).ensureAlpha().resize(S, S, { kernel: 'lanczos3' }).raw().toBuffer();
}
const rawOpt = { raw: { width: S, height: S, channels: 4 } };

// Bounding box of the visible part, normalised 0..1 (the editor zooms thumbnails on it).
function bbox(buf) {
  let x0 = S, y0 = S, x1 = 0, y1 = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (buf[(y * S + x) * 4 + 3] > 40) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < x0) return [0, 0, 1, 1];
  return [x0 / S, y0 / S, (x1 + 1) / S, (y1 + 1) / S].map(v => +v.toFixed(3));
}

// Same recolour as the preview tests: keep the hair's light and shade, swap the hue.
function recolor(buf, [tr, tg, tb]) {
  const o = Buffer.from(buf); let sum = 0, c = 0;
  const lum = (i) => 0.299 * o[i * 4] + 0.587 * o[i * 4 + 1] + 0.114 * o[i * 4 + 2];
  for (let i = 0; i < S * S; i++) if (o[i * 4 + 3] > 200) { sum += lum(i); c++; }
  const mean = sum / Math.max(1, c);
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let i = 0; i < S * S; i++) {
    if (!o[i * 4 + 3]) continue;
    let k = Math.pow(lum(i) / mean, 1.15);
    // soft edges mix in the skin underneath: don't let them turn into a bright outline
    if (o[i * 4 + 3] < 250) k = Math.min(k, 0.9 + 0.1 * (o[i * 4 + 3] / 250));
    k = Math.min(k, 1.6);
    o[i * 4] = cl(tr * k); o[i * 4 + 1] = cl(tg * k); o[i * 4 + 2] = cl(tb * k);
  }
  return o;
}

// Base without eyebrows + eyebrows in every hair colour (slightly darker than the hair, like real brows).
const hasBrows = fs.existsSync(path.join(LAYERS, 'eyebrows.png')) && fs.existsSync(path.join(LAYERS, 'base_nobrows.png'));
await webp(sharp(await small(hasBrows ? 'base_nobrows.png' : man.base), rawOpt)).toFile(path.join(PUB, 'base.webp'));
let files = 1;
if (hasBrows) {
  const brows = await small('eyebrows.png');
  fs.mkdirSync(path.join(PUB, 'eyebrows'), { recursive: true });
  for (const c of config.hairColors) {
    await webp(sharp(c.rgb ? recolor(brows, c.rgb.map(v => v * 0.85)) : brows, rawOpt)).toFile(path.join(PUB, 'eyebrows', `${c.id}.webp`)); files++;
  }
}

const items = [];
for (const it of man.items) {
  const buf = await small(it.file);
  const dir = path.join(PUB, it.category); fs.mkdirSync(dir, { recursive: true });
  const item = { id: it.id, category: it.category, label: config.labels?.[it.id] ?? pretty(it.id), src: `/avatars/${it.category}/${it.id}.webp`, box: bbox(buf) };
  if (it.category === 'hair') {
    // one file per colour; "naturale" is the colour it was generated in
    const hairDir = path.join(PUB, 'hair', it.id); fs.mkdirSync(hairDir, { recursive: true });
    for (const c of config.hairColors) {
      await webp(sharp(c.rgb ? recolor(buf, c.rgb) : buf, rawOpt)).toFile(path.join(hairDir, `${c.id}.webp`)); files++;
    }
    item.src = `/avatars/hair/${it.id}/{color}.webp`;
  } else {
    await webp(sharp(buf, rawOpt)).toFile(path.join(dir, `${it.id}.webp`)); files++;
  }
  if (it.hairMask) {
    // CSS masks use the alpha channel: white pixels whose alpha is the mask
    const g = await sharp(path.join(LAYERS, it.hairMask)).greyscale().resize(S, S).raw().toBuffer();
    const m = Buffer.alloc(S * S * 4, 255); for (let i = 0; i < S * S; i++) m[i * 4 + 3] = g[i];
    fs.mkdirSync(path.join(PUB, 'hairmask'), { recursive: true });
    await sharp(m, rawOpt).png({ compressionLevel: 9 }).toFile(path.join(PUB, 'hairmask', `${it.id}.png`)); files++;
    item.hairMask = `/avatars/hairmask/${it.id}.png`;
  }
  if (it.hidesHair) item.hidesHair = it.hidesHair;
  if (it.hidesFace) item.hidesFace = true;
  items.push(item);
}

const catalog = {
  size: S,
  base: '/avatars/base.webp',
  // drawn right above the base, in the hair colour
  ...(hasBrows ? { eyebrows: '/avatars/eyebrows/{color}.webp' } : {}),
  order: man.order,
  slots: man.slots,
  categories: EDITOR_ORDER.filter(c => items.some(i => i.category === c)).map(id => ({ id, label: CATEGORY_LABELS[id] ?? id })),
  hairColors: config.hairColors.map(({ id, label, rgb }) => ({ id, label, hex: rgb ? '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('') : null })),
  items,
};
fs.mkdirSync(path.dirname(CATALOG), { recursive: true });
fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');

let bytes = 0; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else bytes += fs.statSync(p).size; } };
walk(PUB);
console.log(`${items.length} asset, ${files} file, ${(bytes / 1024 / 1024).toFixed(1)} MB → ${PUB}`);
console.log(`catalogo → ${CATALOG}`);
