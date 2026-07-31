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
 *   - every module in src/ becomes a factory function in dependency order, and
 *     imports become lookups on an exports table. See the Emit section for why
 *     it is not the obvious build with data: URIs and an importmap.
 *   - so no scope merging and none of the name collisions that come with it.
 *     Six modules define their own `clamp`; they keep it.
 *   - the JSON manifests are inlined as `window.__SQUATCH_INLINE`, and the art,
 *     voice and music files are rewritten to data URIs (src/core/assets.js).
 *
 * Nothing is fetched at runtime, which is the whole point, and that means
 * anything that does not fit the budget is not merely left out of the bundle:
 * it is struck from the inlined manifest too, so the game never asks for it.
 * A manifest listing a record the bundle does not carry is a 404 and a silent
 * gap on the station.
 *
 * Media is re-encoded or cut down on the way in -- the source art is 6MB and
 * the records are 23MB, and nothing wants a 30MB HTML file. Pass --full to
 * keep the originals, which is only sensible for a local build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sliceMp3, durationOf } from './mp3-slice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'squatch-apartment.html');

const args = process.argv.slice(2);
const FULL = args.includes('--full');

/**
 * What the hosted preview will accept. Going over does not produce a large
 * page, it produces no page, so this is checked at the end and the build fails
 * rather than writing a file that cannot be opened. --full is a local build and
 * is not gated.
 */
const HARD_LIMIT = Number(process.env.SQUATCH_LIMIT || 16 * 1024 * 1024);
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
  let src = read(rel).toString('utf8');
  /* A module may point at the vendored three by relative path instead of the
   * bare specifier (radio.js does, so plain Node can run it under test). In
   * the bundle both are the same library: normalise to the 'three' sentinel
   * so minified three is never fed through the ESM rewriter. */
  src = src.replace(/from\s*(['"])[^'"]*vendor\/three\.module\.min\.js\1/g, "from 'three'");
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
  ['assets/models/', 'manifest.json'],
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
 * which is most of what was written this month. `--sfx` bakes the effects too,
 * `--no-vo` bakes nothing.
 *
 * How much room there is for sound is not a number anyone should be typing
 * in. It is whatever the limit leaves once the script and the art are laid
 * down, and both of those move -- art gets added, three.js gets updated. A
 * hand-tuned constant is a constant that is wrong a fortnight later, and the
 * way you find out is a preview that will not open.
 *
 * So the audio budget is measured, not declared, and it is spent in priority
 * order: his voice first, because he talks from the first second and a silent
 * narrator is not a preview of anything; then the records, because a record
 * with no file is a title card over silence; then the hosts, who degrade
 * gracefully -- a host line with no clip still shows its text and holds the
 * screen for a reading beat, which is what the station did before anyone was
 * recorded.
 *
 * SQUATCH_MUSIC_BUDGET pins the records' share if you want to trade it against
 * the hosts by hand. --full ignores all of it.
 */
const WANT_VO = !process.argv.includes('--no-vo');
const WANT_SFX = process.argv.includes('--sfx');

// vo.* is the man in the flat, radio.vo.* is the hosts. Both are people
// reading lines; neither has a synth fallback.
const isVoice = (n) => n.startsWith('vo.') || n.startsWith('radio.vo.');
const isMine = (n) => n.startsWith('vo.');

const PRESENT = new Set(inline['assets/sfx/index.json'].files || []);
const CUES = inline['assets/sfx/manifest.json'].sfx || [];

/*
 * The hosts do not all fit, so they are taken round-robin by speaker rather
 * than in manifest order: eleven hosts each losing their back half beats four
 * hosts complete and seven struck silent.
 */
function hostsRoundRobin() {
  const byVoice = new Map();
  for (const cue of CUES) {
    if (!PRESENT.has(cue.file || `${cue.name}.mp3`)) continue;
    if (!isVoice(cue.name) || isMine(cue.name)) continue;
    const who = cue.name.split('.')[2] || 'other';
    if (!byVoice.has(who)) byVoice.set(who, []);
    byVoice.get(who).push(cue);
  }
  const out = [];
  for (let i = 0; ; i++) {
    let any = false;
    for (const list of byVoice.values()) {
      if (i < list.length) { out.push(list[i]); any = true; }
    }
    if (!any) break;
  }
  return out;
}

let sfxBytes = 0;
const dropped = new Map();
let skipped = 0;

/**
 * Bake a run of cues, stopping at a byte ceiling.
 * @param {Array} cues   in the order they should be spent
 * @param {number} limit total baked audio bytes not to exceed
 * @returns {number} bytes spent here
 */
function bakeCues(cues, limit) {
  const before = sfxBytes;
  for (const cue of cues) {
    const file = cue.file || `${cue.name}.mp3`;
    if (!PRESENT.has(file)) continue;
    if (isVoice(cue.name) ? !WANT_VO : !WANT_SFX) continue;

    let bytes;
    try { bytes = read('assets/sfx/' + file); } catch { continue; }
    if (sfxBytes + bytes.length * 1.37 > limit) {
      const who = isMine(cue.name) ? 'the player' : (cue.name.split('.')[2] || 'other');
      dropped.set(who, (dropped.get(who) || 0) + 1);
      skipped++;
      continue;
    }

    cue.file = dataUri('audio/mpeg', bytes);   // what the engine fetches
    sfxBytes += cue.file.length;
  }
  return sfxBytes - before;
}

/* index.json exists to stop the served build firing 400 requests at files that
 * were never generated. A bundle has no such problem: the baked cues are data
 * URIs that resolve instantly, and the rest fail their fetch and fall through
 * to the synth, which is the intended result anyway. Dropping the index halves
 * the page, because otherwise every URI is stored twice -- once as the cue's
 * file, once in the index that gates on it. */
delete inline['assets/sfx/index.json'];

/* ------------------------------------------------------------------ */
/* Music                                                              */
/* ------------------------------------------------------------------ */

/*
 * The records are the biggest thing in the project by a distance -- 23MB of
 * whole songs -- and the station plays thirty seconds of each. So they are cut
 * to the window that actually airs before being baked, which turns a 3MB track
 * into an 800KB one at the same bitrate (tools/mp3-slice.mjs).
 *
 * Anything that still does not fit is REMOVED from the playlist rather than
 * left pointing at a file the bundle does not carry. The radio is built to run
 * a short list -- or none at all -- and it will not fetch what it cannot see.
 */
let musicBytes = 0;
/** @param {number} limit bytes of base64 the records may take up */
function bakeMusic(limit) {
  const music = inline['assets/music/manifest.json'];
  const tracks = music?.tracks || [];
  const kept = new Set();
  const cut = [];

  /* Spend on the scripted record first. A track with `cutAt` is not filler in
   * a rotation, it is a beat -- the one the station talks over to read the
   * meeting notice -- and losing it to alphabetical luck loses the joke. The
   * playlist itself keeps its written order; only the buying does not. */
  const order = [...tracks].sort((a, b) => (b.cutAt ? 1 : 0) - (a.cutAt ? 1 : 0));

  for (const track of order) {
    if (!track.file) continue;
    let buf;
    try { buf = read('assets/music/' + track.file); } catch { continue; }

    if (!FULL) {
      /* Where the station drops in, and how long it stays. Mirrors radio.js:
       * SONG_START_FRAC of the way through for SONG_SECONDS, unless the track
       * pins its own start (the meeting-notice cut-in does). One second of
       * slack so the fade never runs off the end of the file. */
      const dur = durationOf(buf);
      const take = (track.cutAt || 30) + 1;
      const slice = dur ? sliceMp3(buf, dur * (track.start ?? 0.20), take) : null;
      if (slice) {
        buf = slice.buf;
        // The window now starts at byte zero, so the engine must not seek.
        track.start = 0;
      }
    }

    const uri = dataUri('audio/mpeg', buf);
    if (!FULL && musicBytes + uri.length > limit) { cut.push(track.title || track.file); continue; }
    track.file = uri;
    musicBytes += uri.length;
    kept.add(track);
  }

  if (music) music.tracks = tracks.filter((t) => kept.has(t));
  if (cut.length) {
    console.log(`  note: ${cut.length} records did not fit in ${mb(limit)}, `
      + `off the playlist (${cut.join(', ')})`);
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
  /** exported name -> local name, for `export { local as exported }`. */
  const aliases = new Map();
  let out = src;

  // import * as THREE from 'three'   ->   const THREE = __three;
  out = out.replace(/^import\s+\*\s+as\s+([\w$]+)\s+from\s*['"]three['"]\s*;?$/gm,
    (_, ns) => `const ${ns} = __three;`);

  /* import { Vector2, Mesh as M } from 'three'  ->  const { ... } = __three;
   *
   * Nothing in src/ imports three this way -- it is all `import * as THREE` --
   * but every addon does, and they are spread over several lines, so the
   * pattern has to allow newlines inside the braces. */
  out = out.replace(/^import\s*\{([^}]*)\}\s*from\s*['"]three['"]\s*;?$/gm, (_, list) => {
    const bound = list.split(',').map((n) => n.trim()).filter(Boolean)
      .map((n) => {
        const as = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(n);
        return as ? `${as[1]}: ${as[2]}` : n;
      }).join(', ');
    return `const { ${bound} } = __three;`;
  });

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

  /* export { A, B as C };  -- declared above, exported in a block at the end.
   *
   * Every three.js addon is written this way, so vendoring one broke the whole
   * build the moment it was imported. The name is already bound in the module
   * body by this point; only the export table entry is missing. */
  out = out.replace(/^export\s*\{([^}]*)\}\s*;?$/gm, (_, list) => {
    for (const part of list.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(t);
      if (as) aliases.set(as[2], as[1]);
      else names.add(t);
    }
    return '';
  });

  if (/^\s*export[\s{*]/m.test(out)) {
    throw new Error(`${rel}: an export form this bundler does not handle:\n`
      + out.match(/^\s*export[\s{*].*$/m)[0]);
  }
  if (/^\s*import[\s{*]/m.test(out)) {
    throw new Error(`${rel}: an import form this bundler does not handle:\n`
      + out.match(/^\s*import[\s{*].*$/m)[0]);
  }

  const assigns = [
    ...[...names].map((n) => `  __e.${n} = ${n};`),
    ...[...aliases].map(([outer, local]) => `  __e.${outer} = ${local};`),
  ].join('\n');
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

/* ------------------------------------------------------------------ */
/* Spending what is left on sound                                      */
/* ------------------------------------------------------------------ */

/*
 * Deliberately last. The script and the art are fixed costs -- there is no
 * version of this file that leaves out a module -- so the sound is bought with
 * the change, and the change is now a measured number rather than a guess.
 *
 * Priority order, spending down: him, then the records, then the hosts.
 *
 * He is uncapped because his clips are baked in manifest order, and manifest
 * order is roughly the order features were built -- capping him drops the tail,
 * and the tail is whatever was added most recently. A budget that silences the
 * newest thing in the game every time is worse than no budget.
 *
 * The records are capped, because thirty seconds of music costs what forty of
 * his lines cost and the hosts would otherwise get nothing at all. The hosts
 * come last on purpose: theirs is the only voice that degrades gracefully, a
 * line with no clip still showing its text.
 *
 * None of this applies to the served build. Pages carries every clip and every
 * track; this file is a preview and says so in the log.
 */
/* Measured, not added up: serialising the manifests now -- with the art URIs
 * already in and no audio yet -- counts the art, every key name, and every
 * comma exactly once. Summing artBytes by hand misses the JSON around it, and
 * missing it by 60KB is how you land 0.06MB over a hard limit. */
const FIXED = script.length + css.length + html.length
  + JSON.stringify(inline).length + 128 * 1024;
const AUDIO_BUDGET = FULL ? Infinity : Math.max(0, HARD_LIMIT - FIXED);
/** Records get this much of the audio budget, unless pinned by hand. */
const MUSIC_SHARE = Number(process.env.SQUATCH_MUSIC_BUDGET
  || (Number.isFinite(AUDIO_BUDGET) ? AUDIO_BUDGET * 0.38 : Infinity));

bakeCues(CUES.filter((c) => isMine(c.name)), AUDIO_BUDGET);
bakeMusic(Math.min(MUSIC_SHARE, AUDIO_BUDGET - sfxBytes));
bakeCues(hostsRoundRobin(), AUDIO_BUDGET - musicBytes);
if (WANT_SFX) bakeCues(CUES.filter((c) => !isVoice(c.name)), AUDIO_BUDGET - musicBytes);

if (skipped) {
  const who = [...dropped].map(([k, n]) => `${k} ${n}`).join(', ');
  console.log(`  note: ${skipped} clips did not fit, so those lines run on text alone (${who})`);
}

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
console.log(`  voice     ${mb(sfxBytes)}${WANT_SFX ? '' : ' (no effects — the synth covers those)'}`);
console.log(`  music     ${mb(musicBytes)}${FULL ? ' (whole tracks)' : ' (the aired window only)'}`);
console.log(`\n${path.relative(ROOT, OUT)}  ${mb(out.length)}`);

/*
 * Every step above degrades quietly on purpose -- no Chromium means full-size
 * art, no clip means the synth. That is the right behaviour per step and the
 * wrong behaviour in aggregate, because enough of it produces a file the host
 * will not serve, and the only symptom is a preview that never appears. So the
 * total is checked once, here, and a build that cannot be opened is a build
 * that fails.
 */
if (!FULL && out.length > HARD_LIMIT) {
  console.error(`\nover the ${mb(HARD_LIMIT)} limit by ${mb(out.length - HARD_LIMIT)}.`);
  if (!shrunk.size) {
    console.error('the art went in at full size because Chromium was not available — '
      + 'run `npm i -D playwright` (the browser itself is already on this image).');
  }
  console.error('otherwise lower SQUATCH_VO_BUDGET / SQUATCH_MUSIC_BUDGET, or pass '
    + '--full for a local build, where nothing is capped.');
  process.exit(1);
}
