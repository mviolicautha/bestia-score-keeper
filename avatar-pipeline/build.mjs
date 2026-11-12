// Bestia avatar pipeline: turns Nano Banana edits of the base character into
// aligned, transparent PNG layers plus a manifest the app can read.
//
//   npm run build            process new or changed images only
//   npm run rebuild          process everything again
//   node build.mjs hat_cowboy outfit_suit   process just these ids
//
// Every input image is named <category>_<name>.jpg and is an edit of the base
// image (same framing, pure magenta background). See README.md.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(HERE, 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const SRC = config.inputDir;
const OUT = path.resolve(HERE, config.outputDir || 'output');
const LAYERS = path.join(OUT, 'layers');

// Draw order, back to front. A costume also takes the outfit and hat slots.
const ORDER = ['back', 'outfit', 'facial', 'mouth', 'hair', 'glasses', 'hat', 'costume', 'extra'];
const SLOTS = { costume: ['outfit', 'hat'] };
const CATEGORY_DEFAULTS = { costume: { hidesHair: 'all' } };

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = args.filter(a => !a.startsWith('--'));

// ---------------------------------------------------------------- inputs
const files = fs.readdirSync(SRC).filter(f => /\.(jpe?g|png|webp)$/i.test(f) && f !== config.base);
const assets = [];
const problems = [];
for (const f of files) {
  const id = f.replace(/\.(jpe?g|png|webp)$/i, '').toLowerCase();
  const category = id.split('_')[0];
  if (!ORDER.includes(category)) { problems.push(`${f}: categoria "${category}" sconosciuta (valide: ${ORDER.join(', ')})`); continue; }
  if (config.skip?.[id]) continue;
  assets.push({ id, file: f, category, opt: { ...CATEGORY_DEFAULTS[category], ...config.items?.[id] } });
}
assets.sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.id.localeCompare(b.id));

// ---------------------------------------------------------------- image helpers
const load = async (f) => {
  const { data, info } = await sharp(path.join(SRC, f)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};
const base = await load(config.base);
const { w, h } = base; const N = w * h;
const raw = { width: w, height: h, channels: 4 };

function boxBlur(src, r) {
  const t = new Float32Array(N), o = new Float32Array(N), k = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; const row = y * w;
    for (let x = -r - 1; x < w + r; x++) {
      if (x + r < w && x + r >= 0) s += src[row + x + r];
      if (x - r - 1 >= 0 && x - r - 1 < w) s -= src[row + x - r - 1];
      if (x >= 0 && x < w) t[row + x] = s / k; } }
  for (let x = 0; x < w; x++) { let s = 0;
    for (let y = -r - 1; y < h + r; y++) {
      if (y + r < h && y + r >= 0) s += t[(y + r) * w + x];
      if (y - r - 1 >= 0 && y - r - 1 < h) s -= t[(y - r - 1) * w + x];
      if (y >= 0 && y < h) o[y * w + x] = s / k; } }
  return o;
}
const bin = (a, t) => a.map(v => (v > t ? 1 : 0));
const dilate = (m, r) => (r ? bin(boxBlur(m, r), 0.001) : m);
const erode = (m, r) => (r ? bin(boxBlur(m, r), 0.999) : m);
function components(m, val) {
  const lab = new Int32Array(N), comps = []; let id = 0;
  for (let s = 0; s < N; s++) { if ((m[s] ? 1 : 0) !== val || lab[s]) continue; id++; const comp = [s]; lab[s] = id;
    for (let q = 0; q < comp.length; q++) { const i = comp[q]; const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && (m[j] ? 1 : 0) === val && !lab[j]) { lab[j] = id; comp.push(j); } }
    comps.push(comp); }
  return comps;
}
function dropSmall(m, minPx) {
  const keep = new Float32Array(N);
  for (const c of components(m, 1)) if (c.length >= minPx) for (const i of c) keep[i] = 1;
  return keep;
}
function fillSmallHoles(m, maxPx) {
  const out = Float32Array.from(m);
  for (const c of components(m, 0)) {
    const touches = c.some(i => { const x = i % w, y = (i / w) | 0; return x === 0 || y === 0 || x === w - 1 || y === h - 1; });
    if (!touches && c.length <= maxPx) for (const i of c) out[i] = 1;
  }
  return out;
}
// 1 on the magenta background, 0 on anything else (soft, slightly choked)
function chroma(img) {
  const a = new Float32Array(N);
  for (let i = 0; i < N; i++) { const r = img.data[i * 3], g = img.data[i * 3 + 1], b = img.data[i * 3 + 2];
    const v = (Math.min(r, b) - g - 55) / (150 - 55); a[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
  return a;
}
function bgColor(img) {
  let r = 0, g = 0, b = 0, c = 0;
  for (let y = 10; y < 200; y += 7) for (let x = 10; x < 200; x += 7) { const i = (y * w + x) * 3; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; c++; }
  return [r / c, g / c, b / c];
}
const band = (bg) => bin(boxBlur(bin(bg, 0.3), 5), 0.001);
const despill = (r, g, b) => { const mn = Math.min(r, b); if (mn > g) { const k = mn - g; r -= k; b -= k; } return [r, g, b]; };
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const L3 = (im, i) => 0.299 * im.data[i * 3] + 0.587 * im.data[i * 3 + 1] + 0.114 * im.data[i * 3 + 2];
const sat = (im, i) => { const r = im.data[i * 3], g = im.data[i * 3 + 1], b = im.data[i * 3 + 2]; return Math.max(r, g, b) - Math.min(r, g, b); };
function regionMean(d, x0, y0, x1, y1) { let s = 0, c = 0;
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { s += d[y * w + x]; c++; } return +(s / c).toFixed(1); }

const baseBg = chroma(base);
// Reference lines on the 2048px base (top of the t-shirt collar, chin).
const NECK_Y = Math.round(h * 0.649);
const CHIN_Y = Math.round(h * 0.561);
const JAW_Y = Math.round(h * 0.488);

// ---------------------------------------------------------------- extraction
function extractBack(img) {
  // Behind the body: only pixels outside the base silhouette, soft alpha with colour un-mixing
  // so translucent things (wings) keep their transparency without a magenta tint.
  const B = bgColor(img); const bgM = Math.min(B[0], B[2]) - B[1];
  const a0 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (baseBg[i] < 0.5) continue;
    const r = img.data[i * 3], g = img.data[i * 3 + 1], b = img.data[i * 3 + 2];
    let a = 1 - (Math.min(r, b) - g - 8) / (bgM - 8); a = a < 0 ? 0 : a > 1 ? 1 : a;
    a0[i] = a < 0.1 ? 0 : a;
  }
  const keep = boxBlur(dropSmall(bin(a0, 0.1), 2000), 1);
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const a = a0[i] * keep[i]; if (a <= 0) continue;
    const px = [0, 1, 2].map(k => clamp255((img.data[i * 3 + k] - (1 - a) * B[k]) / a));
    rgba.set([...despill(...px), Math.round(a * 255)], i * 4);
  }
  return { rgba, stats: {} };
}

function extract(img, cat, { thr = 40, holeMax = 30000, minPx = 1500, grow = 0, shirtShadow = true, close = 4, largest = false, translucent = false } = {}) {
  if (cat === 'back') return extractBack(img);
  const bg = chroma(img); const bd = band(bg);
  const d = new Float32Array(N);
  for (let i = 0; i < N; i++) { const o = i * 3;
    d[i] = Math.max(Math.abs(img.data[o] - base.data[o]), Math.abs(img.data[o + 1] - base.data[o + 1]), Math.abs(img.data[o + 2] - base.data[o + 2])); }
  const db = boxBlur(d, 2);
  // local texture: shadows cast on the shirt are smooth, real objects are not
  const Li = new Float32Array(N); for (let i = 0; i < N; i++) Li[i] = L3(img, i);
  const mu = boxBlur(Li, 4), mu2 = boxBlur(Li.map(v => v * v), 4);
  const tex = (i) => Math.sqrt(Math.max(0, mu2[i] - mu[i] * mu[i]));
  const bodyWide = cat === 'outfit' || cat === 'costume';

  let m = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const y = (i / w) | 0;
    if (bodyWide && y >= NECK_Y) { m[i] = bg[i] < 0.5 ? 1 : 0; continue; }       // outfits own the whole torso
    if (cat === 'outfit' && y < CHIN_Y && baseBg[i] < 0.5) { m[i] = 0; continue; } // ...but never the face
    if (cat === 'outfit' && y < JAW_Y) { m[i] = 0; continue; }
    if (baseBg[i] < 0.5 && bg[i] >= 0.5) { m[i] = 0; continue; }                  // a layer can't erase the base
    if (shirtShadow && !bodyWide && y >= NECK_Y && sat(img, i) < 28 && sat(base, i) < 28
        && L3(img, i) <= L3(base, i) + 6 && L3(img, i) >= 0.5 * L3(base, i)
        && tex(i) < 4.5) { m[i] = 0; continue; }  // shadow on the shirt: smooth, grey, darker but not black
    m[i] = baseBg[i] < 0.5 ? (db[i] > thr ? 1 : 0) : (bg[i] < 0.5 || (translucent && bg[i] < 0.97) ? 1 : 0);
  }
  m = erode(dilate(m, close), close);
  m = dropSmall(erode(m, 2), minPx); m = dilate(m, 2 + grow);
  m = fillSmallHoles(m, holeMax);
  if (largest) { const big = components(m, 1).reduce((a, c) => (c.length > a.length ? c : a), []); m = new Float32Array(N); for (const i of big) m[i] = 1; }
  const soft = boxBlur(m, 2 + Math.round(grow / 2));
  let wide = null;
  if (cat === 'outfit') { const m2 = m.map((v, i) => (v || (bg[i] >= 0.5 && i >= JAW_Y * w) ? 1 : 0)); wide = boxBlur(m2, 24); }
  const B = bgColor(img); const bgM = Math.min(B[0], B[2]) - B[1];

  let erased = 0, minX = w, minY = h, maxX = 0, maxY = 0;
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    let a = soft[i];
    let px = [img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]];
    if (baseBg[i] >= 0.5) {
      if (translucent && (m[i] || soft[i] > 0)) {   // see-through against the background: un-mix the magenta
        const mm = Math.min(px[0], px[2]) - px[1]; a = 1 - (mm - 8) / (bgM - 8); a = a < 0 ? 0 : a > 1 ? 1 : a;
        if (a > 0.02) px = px.map((v, k) => clamp255((v - (1 - a) * B[k]) / a));
      } else a = Math.min(m[i] > 0 || soft[i] > 0 ? 1 : 0, 1 - bg[i]);
    } else {
      if (bg[i] >= 0.5) erased++;
      a = Math.min(a, 1 - bg[i]);
      if (wide && ((i / w) | 0) < NECK_Y + 40) a = (m[i] ? 1 : Math.min(1, wide[i] * 1.6)) * (1 - bg[i]);
    }
    if (bd[i] || a < 0.999) px = despill(...px);
    rgba[i * 4] = px[0]; rgba[i * 4 + 1] = px[1]; rgba[i * 4 + 2] = px[2]; rgba[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.5) { const x = i % w, y = (i / w) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return {
    rgba,
    stats: {
      alignFace: regionMean(d, 880, 840, 1170, 960), alignShirt: regionMean(d, 650, 1550, 1400, 2000),
      bbox: [minX, minY, maxX, maxY], touchesEdge: minY <= 2 || minX <= 2 || maxX >= w - 3, erasedPx: erased,
    },
  };
}

// Hats and costumes: where the hair may show (below the hat's lower edge, column by column).
// maxY: only look at the head (costumes also cover the torso, which must not cut the hair).
function hairMask(hat, mode, maxY = h) {
  const mask = Buffer.alloc(N, 255);
  if (mode === 'all') return mask.fill(0);
  const bottom = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    let y = 0; while (y < maxY && hat[(y * w + x) * 4 + 3] < 128) y++;
    if (y >= maxY) continue;
    while (y < maxY && hat[(y * w + x) * 4 + 3] >= 128) y++;
    bottom[x] = y;
  }
  const first = bottom.findIndex(v => v >= 0); let last = w - 1; while (last >= 0 && bottom[last] < 0) last--;
  if (first < 0) return mask;
  for (let x = 0; x < first; x++) bottom[x] = bottom[first];
  for (let x = last + 1; x < w; x++) bottom[x] = bottom[last];
  for (let x = first; x <= last; x++) if (bottom[x] < 0) bottom[x] = bottom[x - 1];
  const sm = new Float32Array(w);
  for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = -15; k <= 15; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += bottom[xx]; c++; } } sm[x] = s / c; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = (y - (sm[x] - 14)) / 12; mask[y * w + x] = Math.round(255 * Math.max(0, Math.min(1, t)));
  }
  return mask;
}

// ---------------------------------------------------------------- run
fs.mkdirSync(LAYERS, { recursive: true });
// Per-asset state: an asset is rebuilt when its image, its options or this script change
// (editing labels or other assets' options in config.json doesn't rebuild everything).
const STATE_PATH = path.join(OUT, '.build-state.json');
const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {};
const scriptTime = fs.statSync(fileURLToPath(import.meta.url)).mtimeMs;

// Eyebrows: cut out of the base so the app can tint them like the hair.
// Returns the base with the skin rebuilt under the brows, and the brows as a layer whose
// natural colour, composited back, gives exactly the original pixels.
function splitEyebrows(rgba) {
  const box = config.eyebrows?.box ?? [780, 690, 1270, 782]; // x0, y0, x1, y1 on the 2048px base (stops above the eyelids)
  const [bx0, by0, bx1, by1] = box;
  const lum = (i) => 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  // dark pixels inside the box = brows
  let dark = new Float32Array(N);
  for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const i = y * w + x; if (lum(i) < 150) dark[i] = 1; }
  dark = dropSmall(dark, 1500);
  // a bit wider so the soft edge goes too, but never into the eyelids below the box
  const hole = dilate(dark, 6);
  for (let i = 0; i < N; i++) { const x = i % w, y = (i / w) | 0; if (y >= by1 || x < bx0 - 8 || x >= bx1 + 8) hole[i] = 0; }
  // rebuild the skin: vertical interpolation (brows are horizontal), then smoothing
  const skin = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) skin[i * 3 + k] = rgba[i * 4 + k];
  for (let x = bx0; x < bx1; x++) {
    let y = by0 - 8;
    while (y < by1 + 8) {
      if (!hole[y * w + x]) { y++; continue; }
      const top = y - 1; let bot = y; while (bot < h && hole[bot * w + x]) bot++;
      for (let yy = y; yy < bot; yy++) { const t = (yy - top) / (bot - top);
        for (let k = 0; k < 3; k++) skin[(yy * w + x) * 3 + k] = (1 - t) * rgba[(top * w + x) * 4 + k] + t * rgba[(bot * w + x) * 4 + k]; }
      y = bot;
    }
  }
  const holeIdx = []; for (let i = 0; i < N; i++) if (hole[i]) holeIdx.push(i);
  for (let it = 0; it < 120; it++) for (const i of holeIdx) for (let k = 0; k < 3; k++)
    skin[i * 3 + k] = (skin[(i - 1) * 3 + k] + skin[(i + 1) * 3 + k] + skin[(i - w) * 3 + k] + skin[(i + w) * 3 + k]) / 4;
  const noBrows = Buffer.from(rgba); const brows = Buffer.alloc(N * 4);
  for (const i of holeIdx) {
    const S = [skin[i * 3], skin[i * 3 + 1], skin[i * 3 + 2]];
    const sL = 0.299 * S[0] + 0.587 * S[1] + 0.114 * S[2];
    let a = (sL - lum(i)) / (sL - 55); a = a < 0 ? 0 : a > 1 ? 1 : a;
    for (let k = 0; k < 3; k++) noBrows[i * 4 + k] = Math.round(S[k]);
    if (a < 0.03) continue;
    for (let k = 0; k < 3; k++) brows[i * 4 + k] = clamp255((rgba[i * 4 + k] - (1 - a) * S[k]) / a);
    brows[i * 4 + 3] = Math.round(a * 255);
  }
  return { noBrows, brows };
}

// base layer (+ base without brows, + brows)
const basePng = path.join(LAYERS, 'base.png');
const noBrowsPng = path.join(LAYERS, 'base_nobrows.png');
const browsPng = path.join(LAYERS, 'eyebrows.png');
const baseTime = fs.statSync(path.join(SRC, config.base)).mtimeMs;
if (FORCE || [basePng, noBrowsPng, browsPng].some(f => !fs.existsSync(f) || fs.statSync(f).mtimeMs < Math.max(baseTime, scriptTime))) {
  const rgba = Buffer.alloc(N * 4); const bb = band(baseBg);
  for (let i = 0; i < N; i++) { let px = [base.data[i * 3], base.data[i * 3 + 1], base.data[i * 3 + 2]];
    const a = 1 - baseBg[i]; if (bb[i] || a < 0.999) px = despill(...px);
    rgba.set([...px, Math.round(a * 255)], i * 4); }
  await sharp(rgba, { raw }).png().toFile(basePng);
  const { noBrows, brows } = splitEyebrows(rgba);
  await sharp(noBrows, { raw }).png().toFile(noBrowsPng);
  await sharp(brows, { raw }).png().toFile(browsPng);
  console.log('  ✓ base, base senza sopracciglia, sopracciglia');
}

const manifest = { size: w, order: ORDER, slots: SLOTS, base: 'base.png', items: [] };
const warnings = [];
let built = 0;
for (const a of assets) {
  const outFile = path.join(LAYERS, a.category, a.id + '.png');
  const srcTime = fs.statSync(path.join(SRC, a.file)).mtimeMs;
  const key = JSON.stringify({ srcTime, opt: a.opt, scriptTime });
  const fresh = fs.existsSync(outFile) && state[a.id] === key;
  const wanted = ONLY.length ? ONLY.includes(a.id) : (FORCE || !fresh);
  let rgba;
  if (wanted) {
    const img = await load(a.file);
    if (img.w !== w || img.h !== h) { warnings.push(`${a.id}: dimensioni ${img.w}x${img.h} diverse dalla base ${w}x${h}, saltato`); continue; }
    const res = extract(img, a.category, a.opt);
    rgba = res.rgba;
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    await sharp(rgba, { raw }).png().toFile(outFile);
    state[a.id] = key;
    built++;
    const s = res.stats;
    if (s.alignFace > 15 && !['glasses', 'hat', 'costume', 'outfit'].includes(a.category)) warnings.push(`${a.id}: la faccia è cambiata rispetto alla base (scarto ${s.alignFace})`);
    if (s.touchesEdge) warnings.push(`${a.id}: l'oggetto tocca il bordo dell'immagine, potrebbe essere tagliato`);
    if (s.erasedPx > 5000 && a.category !== 'outfit') warnings.push(`${a.id}: nell'immagine manca un pezzo del personaggio (${s.erasedPx} px), es. orecchie sparite`);
    console.log(`  ✓ ${a.id.padEnd(30)} ${JSON.stringify(s)}`);
  }
  const item = { id: a.id, category: a.category, file: `${a.category}/${a.id}.png` };
  if (a.opt.hidesHair) item.hidesHair = a.opt.hidesHair;
  if (a.opt.hidesFace) item.hidesFace = true;
  if (a.category === 'hat' || a.category === 'costume') {
    const maskFile = path.join(LAYERS, 'hairmask', a.id + '.png');
    if (wanted || !fs.existsSync(maskFile)) {
      if (!rgba) rgba = await sharp(outFile).ensureAlpha().raw().toBuffer();
      fs.mkdirSync(path.dirname(maskFile), { recursive: true });
      await sharp(hairMask(rgba, a.opt.hidesHair, a.category === 'costume' ? NECK_Y : h), { raw: { width: w, height: h, channels: 1 } }).png().toFile(maskFile);
    }
    item.hairMask = `hairmask/${a.id}.png`;
  }
  manifest.items.push(item);
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

console.log(`\n${built} livelli elaborati, ${manifest.items.length} asset nel manifest.`);
const skipped = Object.entries(config.skip || {});
if (skipped.length) { console.log(`\nSaltati (${skipped.length}):`); for (const [id, why] of skipped) console.log(`  - ${id}: ${why}`); }
if (problems.length || warnings.length) { console.log('\nDa controllare:'); for (const p of [...problems, ...warnings]) console.log(`  ! ${p}`); }
