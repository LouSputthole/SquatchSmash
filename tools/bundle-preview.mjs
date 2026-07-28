#!/usr/bin/env node
/**
 * Bake the apartment into one self-contained HTML file.
 *
 *   npm run bundle          -> dist/squatch-apartment.html
 *
 * The normal build is plain ES modules served over HTTP, which is the right
 * shape for developing and the wrong shape for anywhere you cannot run a
 * server -- a sandboxed frame, a file:// double-click, a hosted preview.
 * This produces a single file with no external requests at all.
 *
 * How it works
 *   - every module in src/ becomes a `data:text/javascript;base64,...` URI
 *   - every import specifier is rewritten to a flat bare specifier, and an
 *     importmap points each one at its data URI. Bare specifiers resolve
 *     through the map regardless of the importing module's base URL, which
 *     relative ones cannot do from inside a data: URL.
 *   - so no concatenation, no scope merging, and none of the name collisions
 *     that come with it. Six modules define their own `clamp`; they keep it.
 *   - the JSON manifests are inlined as `window.__SQUATCH_INLINE`, and the
 *     art files are rewritten to data URIs (see src/core/assets.js).
 *
 * Images are re-encoded smaller on the way in -- the source art is 6MB, which
 * is 8MB once base64'd, and nothing wants an 8MB HTML file. Pass --full to
 * keep the originals.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'squatch-apartment.html');

const args = process.argv.slice(2);
const FULL = args.includes('--full');
/** Longest edge for re-encoded art, and JPEG quality. */
const MAX_EDGE = Number(args.find((a) => a.startsWith('--max='))?.slice(6)) || 720;
const QUALITY = 0.74;

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

const read = (p) => fs.readFileSync(path.join(ROOT, p));
const dataUri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;

/* ------------------------------------------------------------------ */
/* Module graph                                                        */
/* ------------------------------------------------------------------ */

/** src/world/apartment.js -> m_world_apartment_js  (a bare specifier) */
const idFor = (rel) => `m_${rel.replace(/^src\//, '').replace(/[^\w]/g, '_')}`;

/** Every static and dynamic import specifier in a module. */
const SPECIFIER = /(?:^|[^\w$.])(?:import|export)\s[\s\S]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w$.])import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[^\w$.])import\s*['"]([^'"]+)['"]/g;

function specifiersIn(src) {
  const out = [];
  for (const m of src.matchAll(SPECIFIER)) {
    const s = m[1] || m[2] || m[3];
    if (s) out.push(s);
  }
  return out;
}

const modules = new Map();   // rel path -> { id, code }

function collect(rel) {
  if (modules.has(rel)) return;
  const src = read(rel).toString('utf8');
  modules.set(rel, { id: idFor(rel), src, rel });
  for (const spec of specifiersIn(src)) {
    if (spec === 'three') continue;
    if (!spec.startsWith('.')) continue;
    collect(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
  }
}

collect('src/main.js');

/** Rewrite this module's specifiers to the flat ids. */
function rewrite({ src, rel }) {
  return src.replace(/(from\s*|import\s*\(\s*|import\s*)(['"])(\.[^'"]+)\2/g, (all, head, q, spec) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    const mod = modules.get(target);
    if (!mod) throw new Error(`${rel}: cannot resolve ${spec}`);
    return `${head}${q}${mod.id}${q}`;
  });
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

const inline = {};
for (const [dir, name] of [
  ['assets/art/', 'manifest.json'],
  ['assets/music/', 'manifest.json'],
  ['assets/sfx/', 'manifest.json'],
  ['assets/sfx/', 'index.json'],
]) {
  inline[dir + name] = JSON.parse(read(dir + name).toString('utf8'));
}
// No samples travel with the bundle; the synth covers every cue.
inline['assets/sfx/index.json'] = { files: [] };

/** Re-encode one image through headless Chromium, since there is no PIL here. */
async function shrinkAll(files) {
  if (FULL) return new Map();
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.warn('  playwright not installed; embedding the full-size art');
    return new Map();
  }
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM,
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : null,
    undefined,
  ];
  let browser = null;
  for (const executablePath of candidates) {
    if (executablePath === null) continue;
    try { browser = await chromium.launch({ executablePath }); break; } catch { /* next */ }
  }
  if (!browser) {
    console.warn('  no Chromium available; embedding the full-size art');
    return new Map();
  }
  const page = await browser.newPage();
  const out = new Map();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const buf = read('assets/art/' + file);
    const url = await page.evaluate(async ({ src, max, q }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      // Anything with transparency has to stay PNG or it grows a black box.
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let opaque = true;
      for (let i = 3; i < d.length; i += 4) { if (d[i] < 250) { opaque = false; break; } }
      return c.toDataURL(opaque ? 'image/jpeg' : 'image/png', q);
    }, { src: dataUri(MIME[ext] || 'image/jpeg', buf), max: MAX_EDGE, q: QUALITY });
    // Keep whichever is smaller.
    const shrunk = Buffer.from(url.split(',')[1], 'base64');
    out.set(file, shrunk.length < buf.length ? url : dataUri(MIME[ext] || 'image/jpeg', buf));
  }
  await browser.close();
  return out;
}

const artFiles = [...new Set((inline['assets/art/manifest.json'].art || [])
  .map((e) => e.file).filter(Boolean))];

console.log(`Bundling ${modules.size} modules and ${artFiles.length} images…`);
const shrunk = await shrinkAll(artFiles);

let artBytes = 0;
for (const entry of inline['assets/art/manifest.json'].art || []) {
  if (!entry.file) continue;
  const ext = path.extname(entry.file).toLowerCase();
  entry.file = shrunk.get(entry.file) || dataUri(MIME[ext] || 'image/jpeg', read('assets/art/' + entry.file));
  artBytes += entry.file.length;
}

/* ------------------------------------------------------------------ */
/* Emit                                                               */
/* ------------------------------------------------------------------ */

const imports = { three: dataUri('text/javascript', read('vendor/three.module.min.js')) };
for (const mod of modules.values()) {
  imports[mod.id] = dataUri('text/javascript', Buffer.from(rewrite(mod), 'utf8'));
}

const css = read('src/style.css').toString('utf8');
const html = read('index.html').toString('utf8');

/** The HUD markup, lifted straight out of index.html so it cannot drift. */
const body = html
  .slice(html.indexOf('<canvas id="scene">'), html.indexOf('<script type="module"'))
  .trim();

const out = `<style>
${css}
/* The bundle runs inside a frame that may be any size; fill it. */
html, body { width: 100%; height: 100%; }
</style>

${body}

<script>window.__SQUATCH_INLINE = ${JSON.stringify(inline)};</script>
<script type="importmap">${JSON.stringify({ imports })}</script>
<script type="module">import ${JSON.stringify(imports[idFor('src/main.js')])};</script>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, out);

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(`  modules   ${modules.size}`);
console.log(`  three.js  ${mb(imports.three.length)}`);
console.log(`  art       ${mb(artBytes)}${FULL ? ' (full size)' : ` (max ${MAX_EDGE}px)`}`);
console.log(`\n${path.relative(ROOT, OUT)}  ${mb(out.length)}`);
