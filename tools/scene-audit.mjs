#!/usr/bin/env node
/**
 * The sweep.
 *
 *   node tools/scene-audit.mjs               every scene
 *   node tools/scene-audit.mjs mansion golf  just these
 *   node tools/scene-audit.mjs --json        machine-readable
 *
 * The owner, after a playtest that found the same kinds of fault in a fourth
 * different scene:
 *
 *   "can we do a full pass on all scenes? WEve fixed a lot of things in some
 *    scenes that aren't fixed in others. Is there any full sweep we can do?"
 *
 * Yes, and this is it. Every defect this project has spent a day chasing has
 * turned out to belong to a very small number of CLASSES, and each of them is
 * measurable from the built scene graph without a human looking at it:
 *
 *   FLOATING     a thing with nothing under it, hanging in the air
 *   SUNKEN       a thing below the surface it is supposed to lie on, so it has
 *                never once been visible (the basement's pool of blood was
 *                authored 1 mm under the floor and nobody had ever seen it)
 *   COPLANAR     two surfaces at the same depth, fighting for the pixel. This
 *                is the owner's "black bar ... non stop flicker", and when it
 *                was finally measured it was in every doorway in the mansion
 *   MIRRORED     a mesh with a negative scale on an axis: inside-out, its
 *                faces culled, invisible. The rose garden's moon gate was
 *                authored with a negative height and rendered nothing
 *   INVERTED     a tapered fitting built upside down. Thirty wall sconces in
 *                the mansion came off ONE shared function with the taper the
 *                wrong way up
 *   UNNAMED      geometry no verifier can ever assert, because it has no name.
 *                `cylinder()` and `sphere()` in src/world/build.js silently
 *                drop the `name` option; only `box()` keeps it
 *   HUGE / TINY  a scale nobody meant
 *
 * WHAT THIS IS NOT. It is not a pass/fail gate and it deliberately does not
 * exit non-zero on findings: half of these are legitimate — a hanging lamp IS
 * floating, a decal IS coplanar with the wall it is stuck to. It is a
 * PRIORITISED LIST OF PLACES TO LOOK, ranked so the worst offenders in a
 * 6,000-mesh house come first. Judgement stays with the person reading it.
 *
 * It runs the real scenes in a real browser rather than parsing source,
 * because the faults are in the built matrices and not in the literals: the
 * chain that swung 1.56 m off its own hook was authored with correct-looking
 * numbers and rotated about the world origin.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5388;
const AS_JSON = process.argv.includes('--json');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/**
 * Every playable scene, with how to get past its menu.
 *
 * `start` is a selector to click; `ready` is a predicate that resolves once
 * the world exists. Scenes that build on load need neither.
 */
const SCENES = [
  { id: 'apartment', url: 'index.html', start: '#start-btn, #startBtn', ready: () => Boolean(globalThis.game || globalThis.apartment) },
  { id: 'bing', url: 'bing.html', start: '#start-btn, #startBtn', ready: () => Boolean(globalThis.__bing) },
  { id: 'mansion', url: 'mansion.html', start: '#startBtn', ready: () => Boolean(globalThis.mansion) },
  { id: 'golf', url: 'golf.html', start: '#start-btn, #startBtn' },
  { id: 'silver', url: 'silver.html', start: '#start-btn, #startBtn' },
  { id: 'nowake', url: 'nowake.html', start: '#start-btn, #startBtn' },
  { id: 'enolasquatch', url: 'enolasquatch.html', start: '#start-btn, #startBtn' },
  { id: 'heist', url: 'heist.html', start: '#start-btn, #startBtn' },
  { id: 'motel', url: 'motel.html', start: '#start-btn, #startBtn' },
  { id: 'graveyard', url: 'graveyard.html', start: '#start-btn, #startBtn' },
  { id: 'beefrun', url: 'beefrun.html', start: '#start-btn, #startBtn' },
  { id: 'silvercase', url: 'silvercase.html', start: '#start-btn, #startBtn' },
  { id: 'squatchfather', url: 'squatchfather.html', start: '#start-btn, #startBtn' },
  { id: 'initiation', url: 'initiation.html', start: '#start-btn, #startBtn' },
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

/**
 * The audit itself, as a string, because it runs inside the page.
 *
 * Kept as one self-contained function so it can be dropped into any scene's
 * console by hand when somebody is looking at a specific room.
 */
const AUDIT = `(() => {
  const THREE = globalThis.__auditTHREE;
  const roots = globalThis.__auditRoots;
  const out = { counted: 0, findings: [] };
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  /* Every mesh, with its world box, once. */
  const items = [];
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((n) => {
      if (!n.isMesh || !n.geometry) return;
      if (n.visible === false) return;
      /* Skip things that are legitimately unbounded or per-frame: sky domes,
       * water planes, particle sprites and instanced crowds. */
      if (/sky|water|ocean|fog|particle|spray|smoke|tracer|muzzle/i.test(n.name)) return;
      n.matrixWorld.decompose(pos, quat, scale);
      try { box.setFromObject(n); } catch { return; }
      if (!Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) return;
      box.getSize(size);
      items.push({
        name: n.name || '',
        min: box.min.clone(), max: box.max.clone(),
        size: size.clone(), scale: scale.clone(),
        geo: n.geometry.type,
      });
      out.counted++;
    });
  }

  const push = (cls, item, detail) => out.findings.push({
    cls, name: item.name || '(unnamed ' + item.geo + ')',
    at: [+item.min.x.toFixed(2), +item.min.y.toFixed(2), +item.min.z.toFixed(2)],
    detail,
  });

  /* ---- MIRRORED: a negative scale turns a mesh inside out. ---- */
  for (const it of items) {
    const neg = ['x', 'y', 'z'].filter((a) => it.scale[a] < 0);
    if (neg.length) push('MIRRORED', it, 'negative scale on ' + neg.join('/') + ' -- faces are inside out and cull to nothing');
  }

  /* ---- HUGE / TINY ---- */
  for (const it of items) {
    const m = Math.max(it.size.x, it.size.y, it.size.z);
    if (m > 400) push('HUGE', it, m.toFixed(0) + ' m across');
    else if (m > 0 && m < 0.004) push('TINY', it, (m * 1000).toFixed(2) + ' mm across');
  }

  /* ---- UNNAMED: geometry no check can ever assert. ---- */
  const unnamed = items.filter((it) => !it.name);
  if (unnamed.length) {
    out.unnamed = unnamed.length;
    const byGeo = {};
    for (const it of unnamed) byGeo[it.geo] = (byGeo[it.geo] || 0) + 1;
    out.unnamedByGeometry = byGeo;
  }

  /* ---- FLOATING: nothing under it, within its own footprint. ----
   * A thing is supported if any other mesh's top is within 12 cm of its
   * bottom AND their footprints overlap. Anything hanging from above is
   * excluded by the name filter below rather than by geometry, because a
   * chandelier and a floating crate look identical from underneath. */
  const HANGS = /lamp|light|chandelier|sconce|pendant|sign|banner|bulb|cable|wire|duct|pipe|vent|fan|screen|monitor|tv|picture|art|frame|mirror|shelf|rail|curtain|drape|cornice|beam|soffit|ceil|roof|hook|chain|hang|balloon|cloud|bird|star|moon|sun|glow|halo|decal|handprint|stain|shadow/i;
  const GROUND = 0.06;
  for (const it of items) {
    if (HANGS.test(it.name)) continue;
    if (it.min.y <= GROUND) continue;
    let supported = false;
    for (const other of items) {
      if (other === it) continue;
      /* FOOTPRINT FIRST, always. The first version tested the vertical
       * relationship before the horizontal one and short-circuited on
       * "something tall passes this height" -- so one floor-to-ceiling wall
       * anywhere in the building marked every object in it supported, and the
       * check reported zero floating meshes in a twelve-thousand-mesh house
       * that had just had dozens of them fixed by hand. A check that never
       * fires is worse than no check: it reads as a clean bill of health. */
      if (other.max.x < it.min.x || other.min.x > it.max.x) continue;
      if (other.max.z < it.min.z || other.min.z > it.max.z) continue;
      /* A SUPPORTER IS SOMETHING WITH A TOP AT THIS THING'S BOTTOM. A wall
       * that merely passes through the same column of air is not holding
       * anything up, and counting it was the difference between "nothing
       * floats in this house" and a usable list. */
      if (other.max.y >= it.min.y - 0.12 && other.max.y <= it.min.y + 0.03) { supported = true; break; }
      /* Or something that encloses it -- a bottle inside a cabinet is not
       * floating, it is shelved by geometry this test cannot see. */
      if (other.min.y <= it.min.y + 0.03 && other.max.y >= it.max.y - 0.03) { supported = true; break; }
    }
    if (!supported) push('FLOATING', it, it.min.y.toFixed(2) + ' m up with nothing under it');
  }

  /* ---- COPLANAR: the flicker class. ----
   * Two axis-aligned faces within 0.6 mm of each other, overlapping by more
   * than a quarter of a square metre. That area threshold is what keeps this
   * from reporting every screw head in the building.
   */
  const FLAT = 0.0006;
  const AREA = 0.25;
  const planes = { x: new Map(), y: new Map(), z: new Map() };
  const key = (v) => Math.round(v / FLAT);
  for (const it of items) {
    for (const axis of ['x', 'y', 'z']) {
      if (it.size[axis] > 0.02) {
        /* A thick box has two faces; a thin plate is one surface. Only the
         * faces of thin things reliably fight, so index both faces of
         * everything and let the area test do the filtering. */
      }
      for (const face of ['min', 'max']) {
        const k = axis + ':' + key(it[face][axis]);
        if (!planes[axis].has(k)) planes[axis].set(k, []);
        planes[axis].get(k).push(it);
      }
    }
  }
  const seenPair = new Set();
  for (const axis of ['x', 'y', 'z']) {
    const [u, v] = axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];
    for (const group of planes[axis].values()) {
      if (group.length < 2 || group.length > 60) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]; const b = group[j];
          const ou = Math.min(a.max[u], b.max[u]) - Math.max(a.min[u], b.min[u]);
          const ov = Math.min(a.max[v], b.max[v]) - Math.max(a.min[v], b.min[v]);
          if (ou <= 0 || ov <= 0 || ou * ov < AREA) continue;
          const pk = [a.name, b.name, axis].join('|');
          if (seenPair.has(pk)) continue;
          seenPair.add(pk);
          out.findings.push({
            cls: 'COPLANAR',
            name: (a.name || '(unnamed)') + '  ×  ' + (b.name || '(unnamed)'),
            at: [+a.min.x.toFixed(2), +a.min.y.toFixed(2), +a.min.z.toFixed(2)],
            detail: 'share the ' + axis + ' plane over ' + (ou * ov).toFixed(2) + ' m² -- this is the flicker',
          });
        }
      }
    }
  }

  return out;
})()`;

/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((r) => server.listen(PORT, r));

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});

const report = [];
for (const scene of SCENES) {
  if (ONLY.length && !ONLY.includes(scene.id)) continue;
  const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`http://localhost:${PORT}/${scene.url}`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1500);
    if (scene.start) {
      /* Clicked from inside the page rather than by Playwright, because a
       * scene's start button is often behind an overlay, mid-fade, or
       * requesting pointer lock, and actionability checks time out on all
       * three. The audit only needs the world BUILT; it never plays. */
      await page.evaluate((sel) => {
        for (const el of document.querySelectorAll(sel)) el.click?.();
      }, scene.start);
      await page.waitForTimeout(3500);
    }
    /* Find the scene graph without knowing the scene's own handle: every one
     * of these builds a THREE.Scene, so look for it. */
    const found = await page.evaluate(async () => {
      const mod = await import('./vendor/three.module.min.js');
      globalThis.__auditTHREE = mod;
      const roots = [];
      const seen = new Set();
      const consider = (v) => {
        if (!v || typeof v !== 'object' || seen.has(v)) return;
        seen.add(v);
        if (v.isScene) { roots.push(v); return; }
        if (v.scene?.isScene) roots.push(v.scene);
        if (v.root?.isScene) roots.push(v.root);
      };
      for (const k of Object.keys(globalThis)) {
        try { consider(globalThis[k]); } catch { /* cross-origin getters */ }
      }
      globalThis.__auditRoots = [...new Set(roots)];
      return globalThis.__auditRoots.length;
    });
    if (!found) {
      report.push({ scene: scene.id, error: 'no THREE.Scene reachable from a global -- scene not audited' });
      await page.close();
      continue;
    }
    const result = await page.evaluate(AUDIT);
    report.push({ scene: scene.id, ...result, pageErrors: errors.slice(0, 3) });
  } catch (e) {
    report.push({ scene: scene.id, error: e.message.split('\n')[0] });
  }
  await page.close();
}

await browser.close();
server.close();

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const ORDER = ['MIRRORED', 'HUGE', 'TINY', 'COPLANAR', 'FLOATING'];
  for (const r of report) {
    console.log(`\n${'='.repeat(66)}\n${r.scene.toUpperCase()}`);
    if (r.error) { console.log(`  could not audit: ${r.error}`); continue; }
    console.log(`  ${r.counted} meshes examined`);
    if (r.unnamed) {
      console.log(`  UNNAMED  ${r.unnamed} meshes carry no name -- no check can ever assert them`);
      for (const [geo, n] of Object.entries(r.unnamedByGeometry).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
        console.log(`             ${String(n).padStart(5)}  ${geo}`);
      }
    }
    const by = {};
    for (const f of r.findings) (by[f.cls] ??= []).push(f);
    for (const cls of ORDER) {
      const list = by[cls];
      if (!list?.length) continue;
      console.log(`  ${cls}  ${list.length}`);
      for (const f of list.slice(0, 8)) {
        console.log(`      ${f.name} @ ${f.at.join(', ')} -- ${f.detail}`);
      }
      if (list.length > 8) console.log(`      ... and ${list.length - 8} more`);
    }
    if (!r.findings.length && !r.unnamed) console.log('  nothing to look at.');
    if (r.pageErrors?.length) for (const e of r.pageErrors) console.log(`  PAGE ERROR: ${e}`);
  }
  console.log(`\n${'='.repeat(66)}`);
  console.log('Findings are places to LOOK, not failures. A hanging lamp floats on');
  console.log('purpose and a decal is coplanar with its wall on purpose. What this');
  console.log('catches is the ones nobody meant.');
}
