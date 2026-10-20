// Gold K from the extractor monogram, plus a prompt caret. Sharp if present; else pure JS.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "branding");
mkdirSync(out, { recursive: true });

const hex = "M48 7 83 27v42L48 89 13 69V27z";
const kay = "m35 27 0 42m0-21 27-21M35 48l29 21";
const caret = "M62 78h20";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img">
  <title>KUI Desk</title>
  <rect x="4" y="4" width="88" height="88" rx="24" fill="#111821"/>
  <g fill="none" stroke="#d4af37" stroke-width="3" stroke-linejoin="round">
    <path d="${hex}"/>
    <path d="${kay}" stroke="#ffd966" stroke-width="6"/>
  </g>
  <path d="${caret}" fill="none" stroke="#d4af37" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

writeFileSync(join(out, "icon-prompt.svg"), svg);

function crc32(buf) {
  let c = ~0 >>> 0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function pngFromRgba(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function roundRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = px < x0 + r ? x0 + r : px > x1 - r ? x1 - r : px;
  const cy = py < y0 + r ? y0 + r : py > y1 - r ? y1 - r : py;
  if (cx === px || cy === py) return true;
  return Math.hypot(px - cx, py - cy) <= r;
}

function raster(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 96;
  const hexPts = [
    [48, 7],
    [83, 27],
    [83, 69],
    [48, 89],
    [13, 69],
    [13, 27],
  ].map(([x, y]) => [x * s, y * s]);
  const kSegs = [
    [35, 27, 35, 69],
    [35, 48, 62, 27],
    [35, 48, 64, 69],
  ].map((n) => n.map((v) => v * s));
  const caretSegs = [[62, 78, 82, 78]].map((n) => n.map((v) => v * s));
  const hexW = Math.max(1.1, 1.6 * s);
  const kW = Math.max(1.4, 3 * s);
  const caretW = Math.max(1.2, 2.1 * s);
  const gold = [0xd4, 0xaf, 0x37];
  const kay = [0xff, 0xd9, 0x66];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (!roundRect(cx, cy, 4 * s, 4 * s, 92 * s, 92 * s, 24 * s)) {
        rgba[i + 3] = 0;
        continue;
      }
      let r = 0x11;
      let g = 0x18;
      let b = 0x21;
      let d = Infinity;
      for (let h = 0; h < hexPts.length; h++) {
        const [ax, ay] = hexPts[h];
        const [bx, by] = hexPts[(h + 1) % hexPts.length];
        d = Math.min(d, distSeg(cx, cy, ax, ay, bx, by));
      }
      if (d <= hexW) {
        r = gold[0];
        g = gold[1];
        b = gold[2];
      }
      let kd = Infinity;
      for (const [ax, ay, bx, by] of kSegs) kd = Math.min(kd, distSeg(cx, cy, ax, ay, bx, by));
      if (kd <= kW) {
        r = kay[0];
        g = kay[1];
        b = kay[2];
      }
      let cd = Infinity;
      for (const [ax, ay, bx, by] of caretSegs) cd = Math.min(cd, distSeg(cx, cy, ax, ay, bx, by));
      if (cd <= caretW) {
        r = gold[0];
        g = gold[1];
        b = gold[2];
      }
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return pngFromRgba(size, size, rgba);
}

function pngToIco(pngs) {
  const count = pngs.length;
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(count, 4);
  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([dir, ...entries, ...pngs.map((p) => p.png)]);
}

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    /* not a dependency of this repo */
  }
  const nearby = join(root, "../fantastic-rotary-phone/node_modules/sharp/lib/index.js");
  try {
    return (await import(pathToFileURL(nearby).href)).default;
  } catch {
    return null;
  }
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
const sharp = await loadSharp();
const pngBySize = new Map();

if (sharp) {
  for (const size of sizes) {
    const density = Math.max(72, size * 8);
    const dest = join(out, `icon-prompt-${size}.png`);
    await sharp(Buffer.from(svg), { density }).resize(size, size).png({ compressionLevel: 9 }).toFile(dest);
    pngBySize.set(size, await sharp(dest).png().toBuffer());
  }
} else {
  for (const size of sizes) {
    const png = raster(size);
    writeFileSync(join(out, `icon-prompt-${size}.png`), png);
    pngBySize.set(size, png);
  }
}

writeFileSync(join(out, "icon-prompt.png"), pngBySize.get(256));
writeFileSync(
  join(out, "icon-prompt.ico"),
  pngToIco([16, 32, 48, 256].map((size) => ({ size, png: pngBySize.get(size) }))),
);

process.stdout.write(sharp ? "Wrote branding icons with sharp.\n" : "Wrote branding icons with the JS rasterizer.\n");
