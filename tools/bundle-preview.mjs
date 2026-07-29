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
/**
 * Longest edge for re-encoded art. Most of these are photographs that appear
 * about a hand's width on screen, so they get the small budget; the two
 * feature pieces and the banners are metre-wide and you can walk up to them,
 * so they get more. Download size is what makes a bundle feel slow, and the
 * art is the overwhelming majority of it.
 */
const MAX_EDGE = Number(args.find((a) => a.startsWith('--max='))?.slice(6)) || 384;
const BIG_SLOTS = /^(feature\.|banner\.|crest\.|cork\.above|south\.wide|bed\.poster)/;
const BIG_EDGE = Math.round(MAX_EDGE * 1.9);
const QUALITY = 0.72;

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
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

/* ------------------------------------------------------------------ */
/* Sound                                                              */
/* ------------------------------------------------------------------ */

/*
 * The synth covers every sound effect, so those can stay out of the bundle and
 * cost nothing. The voice cannot be synthesised -- it is a person reading
 * lines -- so a bundle with no samples is a bundle with a silent narrator,
 * which is most of what was written this month.
 *
 * So: bake the voice, skip the rest, and stop at a byte budget so the page
 * stays openable. `--sfx` bakes the effects too, `--no-vo` bakes nothing.
 */
/* The hosted preview refuses anything over 16MB, and the art and the script
 * want three of it, so the voice gets eleven. His lines all fit inside that;
 * the hosts share what is left. Raise it with SQUATCH_VO_BUDGET for a local
 * build, where nothing is capped. */
const VO_BUDGET = Number(process.env.SQUATCH_VO_BUDGET || 11 * 1024 * 1024);
const WANT_VO = !process.argv.includes('--no-vo');
const WANT_SFX = process.argv.includes('--sfx');

let sfxBytes = 0;
{
  const present = new Set(inline['assets/sfx/index.json'].files || []);
  const cues = inline['assets/sfx/manifest.json'].sfx || [];
  const baked = [];
  let skipped = 0;

  // vo.* is the man in the flat, radio.vo.* is the hosts. Both are people
  // reading lines; neither has a synth fallback.
  const isVoice = (n) => n.startsWith('vo.') || n.startsWith('radio.vo.');

  /*
   * His voice goes in whole -- you hear it from the first second and it is
   * the only voice that is always relevant. The hosts do not all fit, so they
   * are taken round-robin by speaker rather than in manifest order: eleven
   * hosts each losing their back half beats four hosts complete and seven
   * struck silent. A host line with no clip still shows its text and holds
   * the screen for a reading beat, which is what the radio did before anyone
   * was recorded, so this degrades to the old behaviour rather than to a gap.
   */
  const mine = [];
  const byVoice = new Map();
  for (const cue of cues) {
    const file = cue.file || `${cue.name}.mp3`;
    if (!present.has(file) || !isVoice(cue.name)) continue;
    if (cue.name.startsWith('vo.')) { mine.push(cue); continue; }
    const who = cue.name.split('.')[2] || 'other';
    if (!byVoice.has(who)) byVoice.set(who, []);
    byVoice.get(who).push(cue);
  }
  const hosts = [];
  for (let i = 0; ; i++) {
    let any = false;
    for (const list of byVoice.values()) {
      if (i < list.length) { hosts.push(list[i]); any = true; }
    }
    if (!any) break;
  }
  const ordered = [...mine, ...hosts, ...cues.filter((c) => !isVoice(c.name))];
  const dropped = new Map();

  for (const cue of ordered) {
    const file = cue.file || `${cue.name}.mp3`;
    if (!present.has(file)) continue;
    const isVo = isVoice(cue.name);
    if (isVo ? !WANT_VO : !WANT_SFX) continue;

    let bytes;
    try { bytes = read('assets/sfx/' + file); } catch { continue; }
    if (sfxBytes + bytes.length * 1.37 > VO_BUDGET) {
      const who = cue.name.startsWith('vo.') ? 'the player' : (cue.name.split('.')[2] || 'other');
      dropped.set(who, (dropped.get(who) || 0) + 1);
      skipped++;
      continue;
    }

    const uri = dataUri('audio/mpeg', bytes);
    cue.file = uri;          // what the engine fetches
    baked.push(cue.name);
    sfxBytes += uri.length;
  }

  /* index.json exists to stop the served build firing 400 requests at files
   * that were never generated. A bundle has no such problem: the baked cues
   * are data URIs that resolve instantly, and the rest fail their fetch and
   * fall through to the synth, which is the intended result anyway. Dropping
   * the index halves the page, because otherwise every URI is stored twice --
   * once as the cue's file, once in the index that gates on it. */
  delete inline['assets/sfx/index.json'];
  if (skipped) {
    const who = [...dropped].map(([k, n]) => `${k} ${n}`).join(', ');
    console.log(`  note: ${skipped} clips over the ${mb(VO_BUDGET)} budget (${who})`);
  }
}

/** Re-encode one image through headless Chromium, since there is no PIL here. */
async function shrinkAll(files) {   // files: [{ file, max }]
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
  for (const { file, max } of files) {
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
    }, { src: dataUri(MIME[ext] || 'image/jpeg', buf), max, q: QUALITY });
    // Keep whichever is smaller.
    const shrunk = Buffer.from(url.split(',')[1], 'base64');
    const best = shrunk.length < buf.length ? url : dataUri(MIME[ext] || 'image/jpeg', buf);
    // The frame geometry needs the aspect ratio, and waiting for 44 images to
    // decode just to learn it is the whole reason boot feels slow. Measure it
    // here instead and bake it in.
    const dims = await page.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      return img.naturalWidth / img.naturalHeight;
    }, best);
    out.set(file, { url: best, aspect: dims });
  }
  await browser.close();
  return out;
}

const entries = (inline['assets/art/manifest.json'].art || []).filter((e) => e.file);
const budget = new Map();
for (const e of entries) {
  const want = BIG_SLOTS.test(e.slot) ? BIG_EDGE : MAX_EDGE;
  budget.set(e.file, Math.max(budget.get(e.file) || 0, want));
}
const artFiles = [...budget].map(([file, max]) => ({ file, max }));

console.log(`Bundling ${modules.size} modules and ${artFiles.length} images…`);
const shrunk = await shrinkAll(artFiles);

let artBytes = 0;
for (const entry of entries) {
  const ext = path.extname(entry.file).toLowerCase();
  const got = shrunk.get(entry.file);
  entry.aspect = got?.aspect;
  entry.file = got?.url || dataUri(MIME[ext] || 'image/jpeg', read('assets/art/' + entry.file));
  artBytes += entry.file.length;
}

/* ------------------------------------------------------------------ */
/* Emit                                                               */
/* ------------------------------------------------------------------ */

/*
 * Everything goes into ONE inline module script.
 *
 * The obvious build -- each module as its own `data:text/javascript` URI with
 * an importmap pointing at them -- works over file:// and over HTTP, and is
 * refused outright anywhere with a real Content-Security-Policy. `script-src
 * 'unsafe-inline'` permits an inline <script>; it does not permit a data: URI
 * script, and a refused module fires no error event, so the page just sits
 * there looking like a slow network. That is what a hosted preview does, and
 * it is why this never loaded in one.
 *
 * So: no script URLs of any kind. Each module becomes a factory in dependency
 * order, and imports become lookups on an exports table. That also solves what
 * the importmap was there to solve -- six modules define their own `clamp`,
 * and each keeps its own, because each still has its own function scope.
 */

/** Deps before dependents, so a module's imports are always already built. */
function topological() {
  const order = [];
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const mod = modules.get(rel);
    for (const spec of specifiersIn(mod.src)) {
      if (spec === 'three' || !spec.startsWith('.')) continue;
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
    }
    order.push(mod);
  };
  visit('src/main.js');
  return order;
}

/**
 * ESM to a factory body. The source only ever uses three export forms and two
 * import forms, which is what makes this a rewrite rather than a parser.
 */
function toFactory({ src, rel }) {
  const names = new Set();
  let out = src;

  // import * as THREE from 'three'   ->   const THREE = __three;
  out = out.replace(/^import\s+\*\s+as\s+([\w$]+)\s+from\s*['"]three['"]\s*;?$/gm,
    (_, ns) => `const ${ns} = __three;`);

  // import { a, b as c } from './x.js'   ->   const { a, b: c } = __x['id'];
  out = out.replace(/^import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]\s*;?$/gm, (all, names_, spec) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    const mod = modules.get(target);
    if (!mod) throw new Error(`${rel}: cannot resolve ${spec}`);
    const bound = names_.split(',').map((n) => n.trim()).filter(Boolean)
      .map((n) => {
        const m = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(n);
        return m ? `${m[1]}: ${m[2]}` : n;
      }).join(', ');
    return `const { ${bound} } = __x[${JSON.stringify(mod.id)}];`;
  });

  // import * as NS from './x.js'
  out = out.replace(/^import\s+\*\s+as\s+([\w$]+)\s+from\s*['"](\.[^'"]+)['"]\s*;?$/gm, (all, ns, spec) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    const mod = modules.get(target);
    if (!mod) throw new Error(`${rel}: cannot resolve ${spec}`);
    return `const ${ns} = __x[${JSON.stringify(mod.id)}];`;
  });

  // export function f / export async function f / export class C / export const A
  out = out.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+([\w$]+)/gm,
    (_, kind, name) => { names.add(name); return `${kind} ${name}`; });

  if (/^\s*export[\s{*]/m.test(out)) {
    throw new Error(`${rel}: an export form this bundler does not handle:\n`
      + out.match(/^\s*export[\s{*].*$/m)[0]);
  }
  if (/^\s*import[\s{*]/m.test(out)) {
    throw new Error(`${rel}: an import form this bundler does not handle:\n`
      + out.match(/^\s*import[\s{*].*$/m)[0]);
  }

  const assigns = [...names].map((n) => `  __e.${n} = ${n};`).join('\n');
  return `/* ${rel} */\n(function (__e) {\n${out}\n${assigns}\n})(__x[${JSON.stringify(idFor(rel))}] = {});`;
}

/** three.js ends in one `export{a as A,...}`; turn that into the table entry. */
function threeFactory() {
  const src = read('vendor/three.module.min.js').toString('utf8');
  const m = /export\s*\{([\s\S]*?)\}\s*;?\s*$/.exec(src);
  if (!m) throw new Error('vendor/three.module.min.js: no trailing export block');
  const pairs = m[1].split(',').map((part) => {
    const t = part.trim();
    if (!t) return null;
    const as = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(t);
    return as ? `${JSON.stringify(as[2])}: ${as[1]}` : `${JSON.stringify(t)}: ${t}`;
  }).filter(Boolean);
  return `/* three.js */\nconst __three = (function () {\n${src.slice(0, m.index)}\n`
    + `return { ${pairs.join(', ')} };\n})();`;
}

const order = topological();
const script = [
  '/* Squatch Life -- single-file build. No external requests, no script URLs. */',
  'const __x = {};',
  threeFactory(),
  ...order.map(toFactory),
].join('\n\n');

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
<script type="module">
${script}
</script>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, out);

console.log(`  modules   ${modules.size}`);
console.log(`  script    ${mb(script.length)}`);
console.log(`  art       ${mb(artBytes)}${FULL ? ' (full size)' : ` (max ${MAX_EDGE}px)`}`);
console.log(`  audio     ${mb(sfxBytes)}${WANT_SFX ? '' : ' (voice only)'}`);
console.log(`\n${path.relative(ROOT, OUT)}  ${mb(out.length)}`);
