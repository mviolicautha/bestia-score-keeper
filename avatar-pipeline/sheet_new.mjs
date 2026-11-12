// Contact sheet of raw input images modified after a given time: node sheet_new.mjs 2026-11-12T14:00
import sharp from 'sharp'; import fs from 'node:fs'; import path from 'node:path';
const config = JSON.parse(fs.readFileSync('config.json', 'utf8')); const SRC = config.inputDir;
const since = new Date(process.argv[2] || 0).getTime();
const st = f => fs.statSync(path.join(SRC, f)).mtimeMs;
const files = fs.readdirSync(SRC).filter(f => /\.(jpe?g|png|webp)$/i.test(f) && st(f) > since).sort((a, b) => st(a) - st(b));
const T = 360, TH = 460, LH = 34, cols = 5, comps = [];
for (const [i, f] of files.entries()) {
  const img = await sharp(path.join(SRC, f)).resize(T, Math.round(T * 1.28), { fit: 'cover', position: 'top' }).resize(T, TH).toBuffer();
  const x = (i % cols) * T, y = Math.floor(i / cols) * (TH + LH);
  comps.push({ input: Buffer.from(`<svg width="${T}" height="${LH}"><rect width="${T}" height="${LH}" fill="#111"/><text x="6" y="23" font-size="17" fill="white" font-family="Arial">${i + 1}. ${f}</text></svg>`), left: x, top: y }, { input: img, left: x, top: y + LH });
}
await sharp({ create: { width: cols * T, height: Math.ceil(files.length / cols) * (TH + LH), channels: 3, background: '#111' } }).composite(comps).jpeg({ quality: 80 }).toFile('output/preview/new_inputs.jpg');
console.log(files.length, 'file → output/preview/new_inputs.jpg');
