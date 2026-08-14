#!/usr/bin/env node
/**
 * Live-WebGL seating proof and screenshot capture for the DYNASTY SET — the
 * ten commissioned Mansion paintings (assets/art/mansion/) plus Uncle Squatch
 * by the fire, hung 2026-08-13.
 *
 * For every piece this measures, on the production Mansion entry point:
 *   1. the slot resolves to exactly one dressed mesh with the manifest file
 *      decoded onto it;
 *   2. the frame's rear bezel is seated ON its wall — every backing sample
 *      reads a surface FRAME_REAR (35.5 mm) behind the art plane, the band
 *      the whole-house probe uses (-46..-30 mm);
 *   3. the piece's recorded box clashes with no grown opening and no other
 *      hung piece (the same REVEAL/SKIN rule as tools/verify-mansion.mjs);
 *   4. nothing stands between the proof camera and the picture's readable
 *      core (the 3x3 inner sample grid), and at least 22 of 25 samples are
 *      clear overall;
 * and then captures one labelled 1280x720 view per piece plus a contact
 * sheet into docs/validation/2026-08-13-mansion-art/.
 *
 * Modeled on tools/verify-mansion-art.mjs; camera positions use the same
 * floor-height teleport contract. Exits non-zero on any failure.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54951;
const OUT = path.join(ROOT, 'docs', 'validation', '2026-08-13-mansion-art');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

/** Camera positions are floor heights, exactly as mansion.teleport wants. */
const SHOTS = [
  {
    name: '01-gallery-dynasty-crest', room: 'Upper gallery, dynasty wall',
    slot: 'mansion.gallery.dynasty-crest', file: 'mansion/dynasty-crest.jpg',
    position: [-11.7, 6.0, 50.1],
  },
  {
    name: '02-gallery-dynasty-estate', room: 'Upper gallery, dynasty wall',
    slot: 'mansion.gallery.dynasty-estate', file: 'mansion/dynasty-estate-sunset.jpg',
    position: [-3.9, 6.0, 50.3],
  },
  {
    name: '03-gallery-campfire', room: 'Upper gallery, dynasty wall',
    slot: 'mansion.gallery.campfire', file: 'mansion-campfire-banjo.jpg',
    position: [3.9, 6.0, 50.3],
  },
  {
    name: '04-gallery-dynasty-general', room: 'Upper gallery, dynasty wall',
    slot: 'mansion.gallery.dynasty-general', file: 'mansion/dynasty-general.jpg',
    position: [11.7, 6.0, 50.1],
  },
  {
    name: '05-living-fireside', room: 'Living room, east wall',
    slot: 'mansion.living.fireside', file: 'mansion/dynasty-patriarch-fireside.jpg',
    position: [-11.9, 1.2, 47.1],
  },
  {
    name: '06-lounge-club-apex', room: 'Billiards lounge, west wall',
    slot: 'mansion.lounge.club-apex', file: 'mansion/dynasty-club-apex.jpg',
    position: [12.4, 1.2, 41.8],
  },
  {
    name: '07-conference-council', room: 'Conference room, north wall',
    slot: 'mansion.conference.council', file: 'mansion/dynasty-council.jpg',
    position: [-5.0, 6.0, 59.3],
  },
  {
    name: '08-office-patriarch', room: "Lou's office, west window pier",
    slot: 'mansion.office.patriarch', file: 'mansion/dynasty-patriarch-study.jpg',
    position: [-7.5, 6.0, 71.4],
  },
  {
    name: '09-office-estate-map', room: "Lou's office, east window pier",
    slot: 'mansion.office.estate-map', file: 'mansion/dynasty-estate-map.jpg',
    position: [7.5, 6.0, 71.2],
  },
  {
    name: '10-theatre-noir', room: 'Theatre, east wall',
    slot: 'mansion.theatre.noir', file: 'mansion/dynasty-noir.jpg',
    position: [-0.9, -2.8, 70.6],
  },
  {
    name: '11-suite-abstract', room: 'Master suite, south panelling',
    slot: 'mansion.suite.abstract', file: 'mansion/dynasty-abstract-peak.jpg',
    position: [-2.59, 10.6, 66.5],
  },
];

await fsp.mkdir(OUT, { recursive: true });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));

const results = [];
function check(label, ok, payload) {
  results.push({ label, ok, payload });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label} - ${JSON.stringify(payload)}`);
}
function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

let browser;
const errors = [];
const notFound = [];
const evidence = [];
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM
      || (process.env.PLAYWRIGHT_BROWSERS_PATH
        ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => {
    if (response.status() === 404) notFound.push(new URL(response.url()).pathname);
  });

  await page.goto(`http://localhost:${PORT}/mansion.html?preview=1`, {
    waitUntil: 'load', timeout: 180000,
  });
  await page.waitForFunction(() => window.mansion?.player, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById('startBtn').click());
  await page.waitForFunction(() => window.mansion.running === true, null, { timeout: 120000 });
  await page.waitForFunction(() => window.mansion.framesRendered > 3, null, { timeout: 180000 });
  await page.evaluate(async () => {
    await window.mansion.interior.artReady;
    window.mansion.setRendering(false);
  });

  await page.evaluate(() => {
    const label = document.createElement('div');
    label.id = 'dynasty-art-evidence-label';
    label.style.cssText = [
      'position:fixed', 'left:18px', 'bottom:18px', 'z-index:2147483647',
      'max-width:620px', 'padding:9px 12px', 'border:1px solid #d6b75b',
      'background:rgba(4,6,10,.82)', 'color:#fff',
      'font:600 15px/1.35 system-ui,sans-serif', 'letter-spacing:.01em',
      'pointer-events:none', 'text-shadow:0 1px 2px #000',
    ].join(';');
    document.body.append(label);
  });

  async function capture(shot) {
    const measured = await page.evaluate(({ position, slot, file, room }) => {
      const m = window.mansion;
      const T = m.THREE;
      m.scene.updateMatrixWorld(true);

      const matches = [];
      m.scene.traverse((object) => {
        if (object.userData?.art?.slot === slot) matches.push(object);
      });
      if (matches.length !== 1) return { error: `${slot} resolved to ${matches.length} meshes` };
      const target = matches[0];
      const art = target.userData.art;

      /* ---- Seating: rear bezel ON the wall, whole-house probe band. ---- */
      const meshes = [];
      m.scene.traverse((o) => {
        if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.material && o.visible) meshes.push(o);
      });
      const ray = new T.Raycaster();
      const cast = (from, dir, far) => {
        ray.set(from, dir.clone().normalize());
        ray.far = far;
        return ray.intersectObjects(meshes, false)
          .find((hit) => {
            for (let node = hit.object; node; node = node.parent) {
              if (node === target.parent) return false; // own frame
            }
            return true;
          }) || null;
      };
      target.updateWorldMatrix(true, false);
      const at = target.getWorldPosition(new T.Vector3());
      const q = target.getWorldQuaternion(new T.Quaternion());
      const n = new T.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
      const u = new T.Vector3(1, 0, 0).applyQuaternion(q).setY(0).normalize();
      target.geometry.computeBoundingBox();
      const half = target.geometry.boundingBox.getSize(new T.Vector3()).multiplyScalar(0.5);
      const backing = [];
      for (const du of [-0.49, 0, 0.49]) {
        for (const dv of [-0.49, 0, 0.49]) {
          const p = at.clone()
            .addScaledVector(u, du * half.x * 2)
            .addScaledVector(new T.Vector3(0, 1, 0), dv * half.y * 2);
          const hit = cast(p.clone().addScaledVector(n, 0.25), n.clone().negate(), 0.6);
          backing.push({
            du, dv,
            wall: hit ? hit.object.name || '(unnamed)' : null,
            gap: hit ? +(hit.distance - 0.25).toFixed(4) : null,
          });
        }
      }
      const gaps = backing.filter((s) => s.gap !== null).map((s) => s.gap);

      /* ---- The sweep rule, replayed for this one piece. ---- */
      const SKIN = 0.02;
      const REVEAL = 0.34;
      const grown = (m.openings || []).map((o) => {
        const dx = o.x1 - o.x0; const dy = o.y1 - o.y0; const dz = o.z1 - o.z0;
        const g = { ...o };
        if (dz <= dx && dz <= dy) { g.z0 = o.z0 - REVEAL; g.z1 = o.z1 + REVEAL; } else if (dx <= dy) { g.x0 = o.x0 - REVEAL; g.x1 = o.x1 + REVEAL; } else { g.y0 = o.y0 - REVEAL; g.y1 = o.y1 + REVEAL; }
        return g;
      });
      const mine = (m.art || []).find((piece) => piece.id === slot) || null;
      const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > SKIN
        && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > SKIN
        && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > SKIN;
      const openingClash = mine ? grown.filter((o) => overlap(mine, o)).map((o) => o.id) : [];
      const artClash = mine
        ? (m.art || []).filter((a) => a.id !== slot && overlap(mine, a)).map((a) => a.id)
        : [];

      /* ---- Camera evidence. ---- */
      m.teleport(position[0], position[1], position[2], 0);
      m.scene.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(target);
      const centre = box.getCenter(new T.Vector3());
      const player = m.player;
      const dx = centre.x - player.position.x;
      const dz = centre.z - player.position.z;
      const dy = centre.y - player.position.y;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.max(player.pitchMin, Math.min(player.pitchMax,
        Math.atan2(dy, Math.hypot(dx, dz))));
      player.update(1 / 60);
      m.scene.updateMatrixWorld(true);
      m.camera.updateMatrixWorld(true);
      m.camera.updateProjectionMatrix();

      const image = target.material?.map?.image ?? target.material?.map?.source?.data ?? null;
      const imageWidth = image?.naturalWidth ?? image?.videoWidth ?? image?.width ?? 0;
      const imageHeight = image?.naturalHeight ?? image?.videoHeight ?? image?.height ?? 0;

      const origin = m.camera.getWorldPosition(new T.Vector3());
      const local = target.geometry.boundingBox;
      const clearGrid = [];
      const worldSample = (fx, fy) => new T.Vector3(
        T.MathUtils.lerp(local.min.x, local.max.x, fx + 0.5),
        T.MathUtils.lerp(local.min.y, local.max.y, fy + 0.5),
        0,
      ).applyMatrix4(target.matrixWorld);
      const describe = (object) => (object ? {
        name: object.name || '(unnamed mesh)',
        artSlot: object.userData?.art?.slot ?? null,
      } : null);
      const firstTo = (point) => {
        const direction = point.clone().sub(origin);
        const distance = direction.length();
        ray.set(origin, direction.normalize());
        ray.far = distance + 0.08;
        const hit = ray.intersectObjects(meshes, false)
          .find(({ object }) => {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            return materials.some((material) => material?.visible !== false
              && (!material.transparent || (material.opacity ?? 1) >= 0.5));
          });
        return hit?.object ?? null;
      };
      for (const fy of [-0.45, -0.225, 0, 0.225, 0.45]) {
        for (const fx of [-0.45, -0.225, 0, 0.225, 0.45]) {
          let first = firstTo(worldSample(fx, fy));
          let ownBacking = false;
          if (first && first !== target) {
            for (let node = first; node; node = node.parent) {
              if (node === target.parent) { ownBacking = true; break; }
            }
          }
          if (first === null || ownBacking) {
            /* A ray down PlaneGeometry's shared triangle edge can miss both
             * triangles and continue into the mount board; retry a hair off. */
            const epsilon = 1e-5;
            first = firstTo(worldSample(fx + epsilon, fy + epsilon));
          }
          clearGrid.push({
            fx, fy, clear: first === target, blocker: first === target ? null : describe(first),
          });
        }
      }

      const corners = [
        [local.min.x, local.min.y], [local.min.x, local.max.y],
        [local.max.x, local.min.y], [local.max.x, local.max.y],
      ].map(([x, y]) => new T.Vector3(x, y, 0).applyMatrix4(target.matrixWorld).project(m.camera));
      const ndc = {
        x0: Math.min(...corners.map((point) => point.x)),
        x1: Math.max(...corners.map((point) => point.x)),
        y0: Math.min(...corners.map((point) => point.y)),
        y1: Math.max(...corners.map((point) => point.y)),
      };

      document.getElementById('dynasty-art-evidence-label').textContent = `${room}  |  ${slot}  |  ${file}`;
      const core = clearGrid.filter((sample) => Math.abs(sample.fx) <= 0.225
        && Math.abs(sample.fy) <= 0.225);
      return {
        room,
        slot,
        expectedFile: file,
        actualFile: art.file,
        real: art.real === true,
        mapped: Boolean(target.material?.map),
        decoded: imageWidth > 0 && imageHeight > 0,
        image: [imageWidth, imageHeight],
        seating: {
          backing,
          gapMin: gaps.length ? Math.min(...gaps) : null,
          gapMax: gaps.length ? Math.max(...gaps) : null,
          missingBacking: backing.filter((s) => s.wall === null).length,
        },
        sweep: { recorded: Boolean(mine), openingClash, artClash },
        screen: {
          width: (ndc.x1 - ndc.x0) * 640,
          height: (ndc.y1 - ndc.y0) * 360,
        },
        grid: {
          clear: clearGrid.filter((sample) => sample.clear).length,
          total: clearGrid.length,
          coreClear: core.filter((sample) => sample.clear).length,
          coreTotal: core.length,
          blocked: clearGrid.filter((sample) => !sample.clear),
        },
      };
    }, shot);
    if (measured.error) throw new Error(measured.error);

    const screenshot = path.join(OUT, `${shot.name}.png`);
    const before = await page.evaluate(() => window.mansion.framesRendered);
    await page.evaluate(() => window.mansion.setRendering(true));
    await page.waitForFunction((frame) => window.mansion.framesRendered >= frame + 4,
      before, { timeout: 180000 });
    await page.screenshot({ path: screenshot, timeout: 120000 });
    await page.evaluate(() => window.mansion.setRendering(false));
    console.log(`  wrote ${path.basename(screenshot)}`);
    return { name: shot.name, screenshot: path.relative(ROOT, screenshot), ...measured };
  }

  for (const shot of SHOTS) evidence.push(await capture(shot));

  for (const item of evidence) {
    check(`${item.room}: ${item.slot} resolves to the delivered file, decoded`,
      item.actualFile === item.expectedFile && item.real && item.mapped && item.decoded,
      { file: item.actualFile, image: item.image });
    check(`${item.slot} rear bezel is seated on real masonry (gap band -46..-30 mm)`,
      item.seating.missingBacking === 0
        && Number.isFinite(item.seating.gapMin)
        && item.seating.gapMin >= 0.030 && item.seating.gapMax <= 0.046,
      {
        gapMin: item.seating.gapMin,
        gapMax: item.seating.gapMax,
        walls: [...new Set(item.seating.backing.map((s) => s.wall))],
      });
    check(`${item.slot} is registered with the sweep and clashes with no opening or other piece`,
      item.sweep.recorded
        && item.sweep.openingClash.length === 0 && item.sweep.artClash.length === 0,
      item.sweep);
    check(`${item.slot} is readable from the proof camera (core clear, >=22/25 samples)`,
      item.screen.width >= 90 && item.screen.height >= 90
        && item.grid.coreClear === item.grid.coreTotal && item.grid.clear >= 22,
      {
        screen: [Math.round(item.screen.width), Math.round(item.screen.height)],
        clearSamples: `${item.grid.clear}/${item.grid.total}`,
        blockers: item.grid.blocked,
      });
  }

  const gl = await page.evaluate(() => {
    const context = window.mansion.renderer.getContext();
    return {
      lost: context.isContextLost(),
      drawingBuffer: [context.drawingBufferWidth, context.drawingBufferHeight],
    };
  });
  check('live Mansion WebGL stayed healthy with no missing/runtime resources',
    !gl.lost && gl.drawingBuffer.every((value) => value > 0)
      && errors.length === 0 && notFound.length === 0,
    { gl, errors, notFound: [...new Set(notFound)] });

  const cards = [];
  for (const item of evidence) {
    const png = await fsp.readFile(path.join(ROOT, item.screenshot));
    cards.push(`
      <figure>
        <img src="data:image/png;base64,${png.toString('base64')}" alt="${htmlEscape(item.room)}">
        <figcaption><b>${htmlEscape(item.name.replace(/^\d+-/, ''))}</b><br>${htmlEscape(item.room)}<br><code>${htmlEscape(item.slot)}</code></figcaption>
      </figure>`);
  }
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 1040 } });
  await sheet.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box} body{margin:0;background:#11141a;color:#f5f2e8;font:16px/1.25 system-ui,sans-serif}
    h1{margin:18px 24px 4px;font-size:25px} p{margin:0 24px 16px;color:#c9c4b5}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;padding:0 20px 20px}
    figure{margin:0;background:#202631;border:1px solid #5e6470;padding:7px}
    img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
    figcaption{padding:7px 3px 2px;font-size:13px} b{color:#e8c761} code{font-size:11px;color:#b8d9ff}
  </style></head><body><h1>Mansion dynasty-set proof — live WebGL</h1>
  <p>The ten commissioned paintings plus Uncle Squatch by the fire, hung 2026-08-13. Individual 1280×720 captures are beside this sheet.</p>
  <main>${cards.join('')}</main></body></html>`, { waitUntil: 'load' });
  await sheet.screenshot({ path: path.join(OUT, '00-contact-sheet.png'), fullPage: true, timeout: 120000 });
  await sheet.close();

  await fsp.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    entry: 'mansion.html?preview=1',
    pictures: evidence,
    checks: results,
    gl,
    errors,
    notFound: [...new Set(notFound)],
  }, null, 2)}\n`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} dynasty-set checks passed.`);
console.log(`Evidence: ${path.relative(ROOT, OUT)}`);
if (failures.length) process.exitCode = 1;
