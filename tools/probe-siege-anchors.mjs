#!/usr/bin/env node
/**
 * WHICH ANCHORS ARE STANDING IN SOMETHING, AND IN WHAT.
 *
 * The siege verifier reports the count; this reports the boxes, so an anchor
 * can be moved off the thing it is inside rather than nudged until the count
 * goes down. Same body volume the verifier uses.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.PORT) || 5941;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};
const { chromium } = await import('playwright');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
try {
  await page.goto(`http://localhost:${PORT}/mansion-siege.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 90000 });
  await page.evaluate(() => window.mansionSiege.setRendering(false));
  await page.evaluate(() => window.mansionSiege.setState('under_attack'));
  const rows = await page.evaluate(async () => {
    const nav = await import('/src/mansion/siege/nav.js');
    const attackers = await import('/src/mansion/siege/attackers.js');
    const s = window.mansionSiege;
    /* The SAME ground function the attackers walk on, imported rather than
     * approximated -- a check that resolves height differently from the
     * thing it is checking measures its own arithmetic. */
     
    const heightAt = (a) => (a.y != null ? a.y : attackers.groundHeightAt(a.x, a.z));
    const fmt = (b) => [
      +b.min.x.toFixed(2), +b.min.y.toFixed(2), +b.min.z.toFixed(2),
      +b.max.x.toFixed(2), +b.max.y.toFixed(2), +b.max.z.toFixed(2),
    ];
    /* A box only obstructs when it stands a quarter of a metre PROUD of the
     * floor he is on. Below that it is a sill, a threshold, a kerb, a floor
     * inlay or the top of a stairwell newel -- docs/ENGINE-TRAPS.md says
     * nothing lying on a floor should be solid, and a route that steps over
     * a window sill on its way across a portico is not a route through a
     * wall. Measured from HIS feet, not from the box's own height, because
     * the thing that caught this was a 4 m post rising out of the basement
     * whose top clears the foyer floor by six centimetres. */
    const relevant = (box, y) => box?.min && box.max.y > y + 0.25 && box.min.y < y + 1.75;
    const standing = [];
    for (const anchor of nav.ANCHORS) {
      const y = heightAt(anchor);
      for (const box of s.colliders) {
        if (!relevant(box, y)) continue;
        if (anchor.x < box.min.x - 0.3 || anchor.x > box.max.x + 0.3) continue;
        if (anchor.z < box.min.z - 0.3 || anchor.z > box.max.z + 0.3) continue;
        standing.push({
          kind: 'anchor', id: anchor.id, at: [anchor.x, +y.toFixed(2), anchor.z], box: fmt(box),
        });
        break;
      }
    }
    /* And the legs, which is where a route walks through the billiard table
     * rather than round it. Slab test, inflated by half a shoulder. */
    const legs = [];
    const seen = new Set();
    for (const anchor of nav.ANCHORS) {
      for (const id of anchor.neighbors) {
        const other = nav.anchorById(id);
        const key = [anchor.id, id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const ya = heightAt(anchor);
        const yb = heightAt(other);
        const dx = other.x - anchor.x;
        const dz = other.z - anchor.z;
        for (const box of s.colliders) {
          if (!relevant(box, Math.min(ya, yb))) continue;
          let t0 = 0;
          let t1 = 1;
          let clear = false;
          for (const [from, delta, lo, hi] of [
            [anchor.x, dx, box.min.x - 0.25, box.max.x + 0.25],
            [anchor.z, dz, box.min.z - 0.25, box.max.z + 0.25],
          ]) {
            if (Math.abs(delta) < 1e-6) {
              if (from < lo || from > hi) { clear = true; break; }
              continue;
            }
            let near = (lo - from) / delta;
            let far = (hi - from) / delta;
            if (near > far) { const sw = near; near = far; far = sw; }
            if (near > t0) t0 = near;
            if (far < t1) t1 = far;
            if (t0 > t1) { clear = true; break; }
          }
          if (clear) continue;
          /* A pane he BREAKS is not a pane he walks through. The two flank
           * routes are supposed to cross glass; that is the whole beat. */
          const crossing = nav.crossingFor(
            { x: anchor.x, z: anchor.z, y: anchor.y },
            { x: other.x, z: other.z, y: other.y },
          );
          if (crossing?.opening.glass) continue;
          legs.push({ kind: 'leg', id: `${anchor.id} -> ${id}`, box: fmt(box) });
          break;
        }
      }
    }
    return { standing, legs };
  });
  for (const r of rows.standing) {
    console.log(`ANCHOR ${r.id.padEnd(20)} at (${r.at.join(', ')})  inside  x ${r.box[0]}..${r.box[3]}  y ${r.box[1]}..${r.box[4]}  z ${r.box[2]}..${r.box[5]}`);
  }
  for (const r of rows.legs) {
    console.log(`LEG    ${r.id.padEnd(44)} crosses  x ${r.box[0]}..${r.box[3]}  y ${r.box[1]}..${r.box[4]}  z ${r.box[2]}..${r.box[5]}`);
  }
  const total = rows.standing.length + rows.legs.length;
  console.log(total ? `\n${rows.standing.length} anchors and ${rows.legs.length} legs foul something` : '\nnothing is standing in anything');
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
