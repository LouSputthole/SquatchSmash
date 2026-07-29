#!/usr/bin/env node
/**
 * Runtime placement check for everything hung, stood or stuck up.
 *
 *   npm run verify:art
 *
 * `npm run check` is static -- it parses sources and validates manifests, and
 * it cannot tell you that two frames occupy the same patch of wall. This one
 * boots the apartment in headless Chromium and measures the real geometry:
 *
 *   1. no two pieces overlap in 3D
 *   2. nothing pokes through the floor or the ceiling
 *   3. nothing fouls a door anywhere in its swing, or hangs across a doorway
 *   4. bathroom pieces sit above the tiling and clear of the bath
 *   5. nothing stuck to the fridge door overlaps anything else on it
 *
 * (5) needs its own pass because everything on a fridge is coplanar: it never
 * overlaps on all three axes, so check (1) can never see it.
 *
 * Requires Playwright and a Chromium at PLAYWRIGHT_CHROMIUM (or the usual
 * bundled one). Exits non-zero if anything is wrong, so CI can run it.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8111;

/** Tiling stops here; nothing is hung on a wet wall. */
const TILE_TOP = 1.70;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('verify-art needs Playwright:  npm i -D playwright');
  process.exit(2);
}

const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], {
  cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(PORT) },
});
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 1200));

/* Try the explicit override, then a browser sitting in PLAYWRIGHT_BROWSERS_PATH,
 * then whatever Playwright resolves on its own. Environments that ship a
 * Chromium but skip the npm download only satisfy the middle one. */
const candidates = [
  process.env.PLAYWRIGHT_CHROMIUM,
  process.env.PLAYWRIGHT_BROWSERS_PATH
    ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
    : null,
  undefined,
];
let browser = null;
let launchError = null;
for (const executablePath of candidates) {
  if (executablePath === null) continue;
  try {
    browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader'] });
    break;
  } catch (err) {
    launchError = err;
  }
}
if (!browser) {
  stop();
  console.error('verify-art could not start Chromium.');
  console.error(String(launchError?.message || launchError).split('\n')[0]);
  console.error('Install one with `npx playwright install chromium`, or point');
  console.error('PLAYWRIGHT_CHROMIUM at an existing binary.');
  process.exit(2);
}
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });

const runtimeErrors = [];
page.on('pageerror', (e) => runtimeErrors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') runtimeErrors.push(m.text()); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__squatch, null, { timeout: 90000 });

const report = await page.evaluate(async (TILE) => {
  const THREE = await import('three');
  const S = window.__squatch;
  const problems = [];
  const box = (min, max) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

  /* ---- 1 + 2: pieces against each other, and against the shell ---- */
  const items = S.apartment.frames.map((f) => {
    f.mesh.updateWorldMatrix(true, true);
    return {
      slot: f.slot, real: !!f.info.real, onFloor: !!f.onFloor,
      bb: new THREE.Box3().setFromObject(f.mesh),
    };
  });
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i].bb, c = items[j].bb;
      const ov = (k) => Math.min(a.max.getComponent(k), c.max.getComponent(k))
        - Math.max(a.min.getComponent(k), c.min.getComponent(k));
      if (ov(0) > 0.012 && ov(1) > 0.012 && ov(2) > 0.012) {
        problems.push(`${items[i].slot} overlaps ${items[j].slot}`);
      }
    }
    const { bb, slot } = items[i];
    if (bb.max.y > 2.74) problems.push(`${slot} is through the ceiling (${bb.max.y.toFixed(2)})`);
    /* 0.05 is the "this is hung on a wall and should not be at ankle height"
     * threshold. A piece that is meant to be standing on the floor -- the
     * shrine in the closet -- only has to not be UNDER it. */
    const min = items[i].onFloor ? -0.005 : 0.05;
    if (bb.min.y < min) problems.push(`${slot} is through the floor (${bb.min.y.toFixed(2)})`);
  }

  /* ---- 3: doors, swept through their full travel ---- */
  const doors = [];
  S.apartment.root.traverse((o) => { if (o.name === 'door') doors.push(o); });
  const blockers = doors.map((d, i) => {
    const pivot = d.children.find((c) => c.isGroup);
    const was = pivot.rotation.y;
    const swept = new THREE.Box3();
    for (let k = 0; k <= 12; k++) {
      pivot.rotation.y = (k / 12) * 1.85;
      d.updateMatrixWorld(true);
      swept.union(new THREE.Box3().setFromObject(d));
    }
    pivot.rotation.y = was;
    d.updateMatrixWorld(true);
    return { name: `door ${i + 1} (swing)`, box: swept };
  });
  // The openings themselves, so nothing is hung across a hole.
  blockers.push(
    { name: 'the bathroom doorway', box: box([-1.95, 0, -4.75], [-0.85, 2.10, -4.40]) },
    { name: 'the front doorway', box: box([2.25, 0, 4.38], [3.35, 2.10, 4.60]) },
  );

  /* ---- 4: the bathroom's own rules ---- */
  const BATH = { x0: -2.70, x1: -0.30, z1: -4.66 };
  // The bath, plus the curtain rail and everything under the shower head.
  const TUB = box([-2.72, 0, -7.12], [-1.86, 2.15, -5.46]);

  const bath = [];
  for (const { slot, bb } of items) {
    for (const b of blockers) {
      if (bb.intersectsBox(b.box)) problems.push(`${slot} fouls ${b.name}`);
    }
    const isBath = bb.min.z < BATH.z1
      && bb.max.x <= BATH.x1 + 0.10 && bb.min.x >= BATH.x0 - 0.10;
    if (!isBath) continue;
    bath.push(slot);
    if (bb.min.y < TILE) {
      problems.push(`${slot} is hung on the tiling (bottom ${bb.min.y.toFixed(2)}m, tile top ${TILE}m)`);
    }
    if (bb.intersectsBox(TUB)) problems.push(`${slot} is over the bath`);
  }

  /* ---- 5: the fridge door, in its own plane ---- */
  let door = null;
  S.apartment.root.traverse((o) => { if (o.name === 'fridgeDoor') door = o; });
  let onDoor = 0;
  if (door) {
    const inv = new THREE.Matrix4().copy(door.matrixWorld).invert();
    const face = [];
    for (const child of door.children) {
      if (!String(child.name).startsWith('doorface:')) continue;
      const bb = new THREE.Box3().setFromObject(child).applyMatrix4(inv);
      face.push({ name: child.name.slice(9), bb });
    }
    onDoor = face.length;
    for (let i = 0; i < face.length; i++) {
      for (let j = i + 1; j < face.length; j++) {
        const a = face[i], c = face[j];
        // The handle brackets touch the bar, and a magnet holds up the menu.
        // Both are the point; everything else is a mistake.
        const pair = [a.name, c.name].sort().join('+');
        if (pair === 'handle+handle' || pair === 'magnet+menu') continue;
        const oy = Math.min(a.bb.max.y, c.bb.max.y) - Math.max(a.bb.min.y, c.bb.min.y);
        const oz = Math.min(a.bb.max.z, c.bb.max.z) - Math.max(a.bb.min.z, c.bb.min.z);
        if (oy > 0.008 && oz > 0.008) problems.push(`${a.name} overlaps ${c.name} on the fridge door`);
      }
    }
  }

  return {
    total: items.length,
    placeholders: items.filter((i) => !i.real).map((i) => i.slot),
    bath, onDoor, doors: doors.length, problems,
  };
}, TILE_TOP);

await browser.close();
stop();

console.log(`Checked ${report.total} pieces, ${report.bath.length} in the bathroom, `
  + `${report.onDoor} on the fridge door, against ${report.doors} doors.`);
if (report.placeholders.length) {
  console.log(`  note  ${report.placeholders.length} slot(s) still on placeholder art: `
    + report.placeholders.join(', '));
}
for (const e of runtimeErrors) console.error(`  FAIL  runtime error: ${e}`);
for (const pr of report.problems) console.error(`  FAIL  ${pr}`);

const failures = report.problems.length + runtimeErrors.length;
if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll good.');
