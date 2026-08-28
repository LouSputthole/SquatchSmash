#!/usr/bin/env node
/**
 * Verify The Enola Squatch end to end in a real browser: boot, the on-foot
 * walkaround (six real checks driven through the real interaction system, the
 * crew standing round the aeroplane, boarding through the crew door), the
 * seated crew, cockpit preflight, taxi, takeoff (real thrust from all four
 * engines), climb-out and turn, the cruise nav-correction barks, the detection
 * corridor, the compound's defensive fire (damage API) and the rear gunner,
 * the bombing approach over Squatchbourg, the quiet order/nav wrong-city clue,
 * the bomb-bay malfunction, a real 1-5
 * release-line choice (payload detaches, mass drops), the falling whistle, the
 * detonation, the crater the city used to be in, escape, the engine emergency,
 * return, landing (grading), and the epilogue/report card. Asserts no
 * console/page errors across the whole run.
 *
 * Drives the mission through `window.__enolaSquatch` (see
 * `src/enolasquatch/main.js`) rather than simulating raw key/mouse input for
 * every leg: some inter-phase transitions are exercised organically (real
 * physics integration, real phase-exit conditions), others are jumped via
 * `.go(phase)` where holding a precise flight attitude for real would make
 * this script fragile rather than meaningfully more thorough — each shortcut
 * is called out in a comment at the point it is taken.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isEnolaPreloadCue } from '../src/enolasquatch/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5225;

// The residency contract this mission is held to — see src/enolasquatch/audio.js.
const soundManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
const soundIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'));
const indexedFiles = new Set(soundIndex.files || []);
const selectedEnolaCues = soundManifest.sfx.filter((cue) => isEnolaPreloadCue(cue));
const expectedEnolaResidentNames = selectedEnolaCues
  .filter((cue) => indexedFiles.has(cue.file || `${cue.name}.mp3`))
  .map((cue) => cue.name)
  .sort();
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the Enola Squatch.');
  process.exit(1);
}

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
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({
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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text().slice(0, 240));
  });

  /* Playwright's default `goto` budget is thirty seconds, and this page builds
   * Squatchbourg, the airfield, the aeroplane, the crew and a route mesh before
   * it fires `load`. On a quiet machine that is a few seconds; on a shared one
   * with two or three other headless SwiftShader runs going it is not, and the
   * whole verification then dies at line one with a bare TimeoutError that says
   * nothing about the mission. Ninety seconds costs nothing when the page is
   * quick and is the difference between a red run and a real one when it is
   * not. */
  /* airSeed pins the gust field -- unseeded weather was cause #1 of two
   sessions of "flaky" autopilot checks (docs/ENGINE-TRAPS.md entry 7). */
  await page.goto(`http://localhost:${PORT}/enolasquatch.html?preview=1&airSeed=1945`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.__squatch?.enolaSquatch === true, null, { timeout: 90000 });
  check('the page boots and signals the watchdog', true);

  /* ---- Start button really boots the mission (not just go()) ---- */
  const booted = await page.evaluate(() => {
    document.getElementById('start-btn').click();
    const h = window.__enolaSquatch;
    return {
      overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
      // The flight HUD is deliberately DOWN on the apron — there is no flight
      // to instrument yet — and the preflight checklist is up in its place.
      hudUp: !document.getElementById('br-hud').classList.contains('hidden'),
      checklistUp: !document.getElementById('br-checklist').classList.contains('hidden'),
      phase: h.mission.phase,
      inCockpit: h.mission.inCockpit,
      playerEnabled: h.player.enabled,
      browserInput: h.browserInput.snapshot(),
      onGround: Math.abs(h.player.position.y - (h.groundHeight(h.player.position.x, h.player.position.z) + 1.66)) < 0.2,
    };
  });
  check('the Start button arms canonical on-foot input without faking capture from a synthetic click',
    booted.overlayHidden && !booted.hudUp && booted.checklistUp
      && booted.phase === 'walkaround' && booted.inCockpit === false
      && !booted.playerEnabled && booted.onGround
      && booted.browserInput.captureMode === 'pointer-lock-or-drag'
      && booted.browserInput.inputEnabled
      && !booted.browserInput.captured,
    JSON.stringify(booted));

  /* Semantic smoke: this is the browser path the old verifier skipped. The
   * Adapter must earn Player authority from a real canvas click, then a real
   * mouse move and held W must change the live view and position. */
  await page.locator('#scene').click({ position: { x: 420, y: 280 } });
  await page.waitForFunction(() => window.__enolaSquatch.browserInput.snapshot().captured, null, {
    timeout: 5000,
  });
  const beforeRealInput = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    return { x: h.player.position.x, z: h.player.position.z, yaw: h.player.yaw };
  });
  await page.mouse.move(420, 280);
  await page.mouse.move(490, 245, { steps: 2 });
  await page.keyboard.down('w');
  await page.waitForFunction(({ x, z }) => {
    const player = window.__enolaSquatch.player;
    return Math.hypot(player.position.x - x, player.position.z - z) > 0.35;
  }, beforeRealInput, { polling: 'raf', timeout: 5000 });
  const heldRealInput = await page.evaluate(() => ({
    keys: [...window.__enolaSquatch.player.keys],
    yaw: window.__enolaSquatch.player.yaw,
  }));
  await page.keyboard.up('w');
  const afterRealInput = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    return {
      x: h.player.position.x,
      z: h.player.position.z,
      yaw: h.player.yaw,
      keys: [...h.player.keys],
      input: h.browserInput.snapshot(),
    };
  });
  check('real click, mouse, and W input capture, look, move, and release on the apron',
    afterRealInput.input.captured
      && heldRealInput.keys.includes('KeyW')
      && !afterRealInput.keys.includes('KeyW')
      && Math.hypot(
        afterRealInput.x - beforeRealInput.x,
        afterRealInput.z - beforeRealInput.z,
      ) > 0.35
      && Math.abs(afterRealInput.yaw - beforeRealInput.yaw) > 0.01,
    JSON.stringify({ beforeRealInput, heldRealInput, afterRealInput }));

  /* ---- Bloom mounts at NO WAKE's own tuning (this is the same class of
   * scene — open-air, night, distant lights — see main.js's own comment on
   * why it borrows those exact numbers) with the auto-fallback still armed. */
  const postfxBoot = await page.evaluate(() => {
    const fx = window.__enolaSquatch.postfx;
    return {
      present: Boolean(fx),
      enabled: fx?.enabled,
      hasComposer: Boolean(fx?.composer),
      hasBloom: Boolean(fx?.bloom),
      strength: fx?.bloom?.strength ?? null,
      threshold: fx?.bloom?.threshold ?? null,
      manual: fx?._manual,
    };
  });
  check('PostFX mounts enabled with the tuned-down exterior bloom and the auto-fallback armed',
    postfxBoot.present && postfxBoot.enabled && postfxBoot.hasComposer && postfxBoot.hasBloom
      && postfxBoot.strength === 0.25 && postfxBoot.threshold === 1.18 && postfxBoot.manual === false,
    JSON.stringify(postfxBoot));

  const terrainCoverage = await page.evaluate(() => {
    const ground = window.__enolaSquatch.eastGround;
    ground.geometry.computeBoundingBox();
    return {
      name: ground.name,
      minX: ground.position.x + ground.geometry.boundingBox.min.x,
      maxX: ground.position.x + ground.geometry.boundingBox.max.x,
      safetyBoundaryX: 13400,
      scatter: window.__enolaSquatch.scene.getObjectByName('eastbound terrain scatter')?.count ?? 0,
    };
  });
  check('the eastbound terrain continues beyond the target and the mission boundary, with no visible map edge on the bomb break',
    terrainCoverage.name === 'eastbound terrain ground'
      && terrainCoverage.minX <= -1400 && terrainCoverage.maxX >= 14500
      && terrainCoverage.maxX > terrainCoverage.safetyBoundaryX
      && terrainCoverage.scatter >= 600,
    JSON.stringify(terrainCoverage));

  /* ---- Audio residency: startAudio() decodes in the background rather
   * than awaiting anything (see main.js's own comment on why), and it now
   * decodes in three ordered banks — apron, flight, far end — so wait for
   * the whole chain to settle before reading what actually got decoded. */
  await page.evaluate(async () => {
    const banks = window.__enolaSquatch.audioBanks;
    if (banks) await banks.whenAllSettled();
    const engine = window.__enolaSquatch.audio.engine;
    if (engine._manifestLoadPromise) await engine._manifestLoadPromise;
  });
  const enolaAudioResidency = await page.evaluate(() => {
    const engine = window.__enolaSquatch.audio.engine;
    return {
      plan: engine.preloadStats ?? null,
      loaded: engine.loadedCount,
      resident: [...engine.buffers.keys()].sort(),
    };
  });
  const missingEnolaNames = expectedEnolaResidentNames
    .filter((name) => !enolaAudioResidency.resident.includes(name));
  const unexpectedEnolaNames = enolaAudioResidency.resident
    .filter((name) => !expectedEnolaResidentNames.includes(name));
  check('The Enola Squatch decodes exactly its own scoped cue set (vo.enolasquatch.*/enolasquatch.*/enola.*/footstep.*/ambience.*/shared effects) — no more, no less',
    enolaAudioResidency.plan?.manifestTotal === soundManifest.sfx.length
      && enolaAudioResidency.plan?.selected === expectedEnolaResidentNames.length
      && enolaAudioResidency.loaded === expectedEnolaResidentNames.length
      && enolaAudioResidency.resident.length === expectedEnolaResidentNames.length
      && missingEnolaNames.length === 0
      && unexpectedEnolaNames.length === 0,
    JSON.stringify({
      plan: enolaAudioResidency.plan,
      loaded: enolaAudioResidency.loaded,
      expected: expectedEnolaResidentNames.length,
      missing: missingEnolaNames.slice(0, 5),
      unexpected: unexpectedEnolaNames.slice(0, 5),
    }));
  check('the resident bank is a small slice of the shared manifest, not the whole bank',
    expectedEnolaResidentNames.length < soundManifest.sfx.length * 0.1,
    JSON.stringify({ resident: expectedEnolaResidentNames.length, manifest: soundManifest.sfx.length }));

  /* ---- The crew are actually there, standing round the aeroplane ---- */
  const crewOnApron = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const p = h.physics.position;
    return {
      count: h.crew.all.length,
      names: h.crew.all.map((f) => f.group.name),
      aboard: h.crew.aboard,
      inScene: h.crew.all.every((f) => f.group.parent === h.scene),
      // Everybody within twenty metres of the aeroplane, and nobody inside it.
      near: h.crew.all.every((f) => {
        const d = Math.hypot(f.group.position.x - p.x, f.group.position.z - p.z);
        return d > 1 && d < 22;
      }),
      // Sasole is Sasole. Big Uncle Lou is not on this aeroplane.
      sasoleIsPilot: h.crew.sasole.group.name === 'captain_lou_sasole',
      noBigLou: h.crew.all.every((f) => f.group.name !== 'lou' && f.group.name !== 'big_uncle_lou'),
    };
  });
  check('the four crew stand round the aeroplane on the apron, and Sasole is not Big Uncle Lou',
    crewOnApron.count === 4 && !crewOnApron.aboard && crewOnApron.inScene && crewOnApron.near
      && crewOnApron.sasoleIsPilot && crewOnApron.noBigLou,
    JSON.stringify(crewOnApron));

  /* ---- The pilot can see out, and the four nose propellers stay outboard ----
   * This is measured from the built browser scene rather than inferred from
   * the constructor constants.  The eye has to sit above the panel, inside
   * the windshield's vertical band, with the glass ahead of it; the nearest
   * propeller hub must remain well outside the forward centreline. */
  const cockpitSightline = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const a = h.aircraft;
    const V = h.physics.position.constructor;
    a.group.updateMatrixWorld(true);
    const bounds = (o) => {
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      let minY = Infinity;
      let maxY = -Infinity;
      let centre = new V();
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const p = new V(x, y, z).applyMatrix4(o.matrixWorld);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
        centre.add(p);
      }
      centre.multiplyScalar(1 / 8);
      return { minY, maxY, centre };
    };
    const panel = a.parts.cockpit.children.find((o) => {
      const p = o.geometry?.parameters;
      return o.isMesh && Math.abs((p?.width ?? 0) - 2.3) < 0.01
        && Math.abs((p?.height ?? 0) - 0.95) < 0.01
        && Math.abs((p?.depth ?? 0) - 0.12) < 0.01;
    });
    const eye = a.pilotEye.clone().applyMatrix4(a.group.matrixWorld);
    const nose = new V(0, 0, 1).transformDirection(a.group.matrixWorld);
    const panelBox = panel ? bounds(panel) : null;
    const windshieldBox = bounds(a.parts.windshield);
    const propOffsets = a.parts.prop.map((p) => Math.abs(p.position.x - a.pilotEye.x));
    return {
      panelFound: !!panel,
      eyeY: eye.y,
      panelTop: panelBox?.maxY ?? Infinity,
      windshieldMinY: windshieldBox.minY,
      windshieldMaxY: windshieldBox.maxY,
      glassAhead: windshieldBox.centre.clone().sub(eye).dot(nose),
      nearestPropOffset: Math.min(...propOffsets),
      propCount: propOffsets.length,
    };
  });
  check('the seated pilot eye clears the panel, falls inside the windshield and has no nose propeller on the forward centreline',
    cockpitSightline.panelFound
      && cockpitSightline.eyeY > cockpitSightline.panelTop + 0.08
      && cockpitSightline.eyeY > cockpitSightline.windshieldMinY
      && cockpitSightline.eyeY < cockpitSightline.windshieldMaxY
      && cockpitSightline.glassAhead > 0.5
      && cockpitSightline.propCount === 4
      && cockpitSightline.nearestPropOffset > 5,
    JSON.stringify(cockpitSightline));

  /* ---- The club crest, on the aeroplane and on the bomb ----
   * Owner: "Aircraft is nice. Needs Squatch logo." + "Squatch logo on the bomb
   * too." Asserted as badges that EXIST and carry a texture, plus the fact
   * that the real artwork resolved off the existing `crest.round` art slot —
   * a badge wearing the drawn placeholder is a working fallback, but it is
   * not what was asked for. */
  const logo = await page.evaluate(async () => {
    const h = window.__enolaSquatch;
    // The gear resolve is a fire-and-forget promise in the composition root.
    for (let i = 0; i < 60 && h.state().clubLogo.realArtworkApplied === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const s = h.state().clubLogo;
    const badges = [...(h.aircraft.parts.clubLogo || []), ...(h.payload.parts.clubLogo || [])];
    return {
      ...s,
      allTextured: badges.every((b) => !!b.material?.map),
      onFin: (h.aircraft.parts.clubLogo || []).filter((b) => b.name === 'club-crest-fin').length,
      onNose: (h.aircraft.parts.clubLogo || []).filter((b) => b.name === 'club-crest-nose').length,
      inAircraftGroup: (h.aircraft.parts.clubLogo || []).every((b) => {
        let o = b; while (o) { if (o === h.aircraft.group) return true; o = o.parent; } return false;
      }),
      onBombBody: (h.payload.parts.clubLogo || []).every((b) => {
        let o = b; while (o) { if (o === h.payload.group) return true; o = o.parent; } return false;
      }),
    };
  });
  /* FOUR on the aeroplane since 2026-08-04, not three. Owner: "The squatch
   * head on towards the front of the plane — lets use the Squatch logo." The
   * drawn Sasquatch-face nose art on the port flank is gone and the club's
   * real crest stands at that station, so the nose carries a badge on both
   * sides and the total that has to resolve to real artwork is six. */
  check('the Silver Sasquatches crest is on the aeroplane (fin both sides, nose both sides) and on the Fat Squatch',
    logo.onAircraft === 4 && logo.onFin === 2 && logo.onNose === 2 && logo.onPayload === 2
      && logo.allTextured && logo.inAircraftGroup && logo.onBombBody
      && logo.realArtworkApplied === 6,
    JSON.stringify(logo));

  const noseArt = await page.evaluate(async () => {
    const h = window.__enolaSquatch;
    await h.aircraft.artReady;
    return h.state().noseArt;
  });
  check('the owner pin-up and SQUATCHOLA GAY name are paired, textured and separated on both flanks',
    noseArt.artReady && noseArt.loadState === 'ready' && !noseArt.loadError
      && noseArt.realArtworkApplied === 4
      && noseArt.pinups.count === 2 && noseArt.pinups.visible === 2
      && noseArt.pinups.textured === 2 && noseArt.pinups.ownerArtwork === 2
      && noseArt.names.count === 2 && noseArt.names.visible === 2
      && noseArt.names.textured === 2 && noseArt.names.ownerArtwork === 2
      && noseArt.paired && noseArt.noOverlap
      && noseArt.minimumGap >= noseArt.expectedGap - 1e-3
      && noseArt.sides.length === 2
      && noseArt.sides.every((side) => side.gap >= noseArt.expectedGap - 1e-3
        && side.topDelta < 1e-4 && side.outboard),
    JSON.stringify(noseArt));

  /* ---- Whispering Pines has grass and a treeline ----
   * Owner: "Missing all the grass and stuff at whispering pines airport." The
   * ground colour matters as much as the scatter: the route mesh used to
   * paint the whole aerodrome in the eastbound desert palette, so a forest
   * airstrip rendered grey. Sampled straight off the mesh's vertex colours. */
  const scenery = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const s = h.state().scenery;
    const named = (n) => h.scene.getObjectByName(n);
    const trunks = named('whispering-pines-trunks');
    const canopies = named('whispering-pines-canopies');
    const tufts = named('whispering-pines-tufts');
    const pad = named('enola-hardstand');
    // Is the ground round the field actually green? Read the route mesh's own
    // vertex colours near the airfield and compare red against green.
    let greenVerts = 0;
    let sampled = 0;
    for (const o of h.scene.children) {
      const col = o.isMesh && o.geometry?.attributes?.color;
      const pos = o.isMesh && o.geometry?.attributes?.position;
      if (!col || !pos || pos.count < 5000) continue;
      for (let i = 0; i < pos.count; i++) {
        const wx = o.position.x + pos.getX(i);
        const wz = o.position.z + pos.getZ(i);
        if (Math.abs(wx) > 300 || Math.abs(wz - 380) > 300) continue;
        sampled++;
        if (col.getY(i) > col.getX(i) * 1.25) greenVerts++;
      }
      break;
    }
    return {
      trees: s.trees,
      tufts: s.tufts,
      trunkInstances: trunks?.count ?? 0,
      canopyInstances: canopies?.count ?? 0,
      tuftInstances: tufts?.count ?? 0,
      hardstand: !!pad,
      // The scatter is instanced, not hundreds of meshes.
      sceneryMeshes: named('whispering-pines-scenery')?.children.length ?? 0,
      sampled,
      greenFraction: sampled ? +(greenVerts / sampled).toFixed(2) : 0,
      // Nothing may have been planted on the runway.
      onRunway: (() => {
        if (!trunks) return -1;
        const m = new (h.camera.matrixWorld.constructor)();
        let hits = 0;
        for (let i = 0; i < trunks.count; i++) {
          trunks.getMatrixAt(i, m);
          const x = m.elements[12]; const z = m.elements[14];
          if (Math.abs(x) < 40 && Math.abs(z) < 480) hits++;
        }
        return hits;
      })(),
    };
  });
  check('Whispering Pines has grass, a pine treeline and a hardstand — and nothing grows on the runway',
    scenery.trees > 250 && scenery.trunkInstances === scenery.trees
      && scenery.canopyInstances === scenery.trees && scenery.tuftInstances > 400
      && scenery.hardstand && scenery.sceneryMeshes < 20
      && scenery.greenFraction > 0.9 && scenery.onRunway === 0,
    JSON.stringify(scenery));

  /* ---- The walkaround, played for real ----
   * Every check below is reached by standing the player where a person would
   * stand and pointing his head at the part, then pressing E through the real
   * `InteractionSystem` — no `onUse` is called directly. That is deliberate:
   * the failure this guards against is a check the player can SEE and cannot
   * REACH, which is a bug this project has already shipped once (the Beef
   * Run's fuel sample) and which calling the handler directly cannot detect. */
  const walkaround = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const log = [];
    let firstMiss = null;
    let guard = 0;
    while (!h.preflight.complete && guard++ < 40) {
      const at = h.standAtNextCheck(2.0);
      if (!at) break;
      const before = h.preflight.doneCount;
      /* `interaction.current` is the object the real crosshair found. Its
       * `.name` is often empty (a bare `THREE.Group` for a propeller hub, for
       * instance), so presence is what is asserted and the label the HUD would
       * print is what is logged — a name test would fail on parts that are
       * perfectly reachable. */
      const target = h.interaction.current;
      const desc = target?.userData?.interact;
      const label = desc ? (typeof desc.label === 'function' ? desc.label() : desc.label) : null;
      if (!target && !firstMiss) {
        /* A reachability failure is otherwise just "prompted:false", which
         * cannot tell a bad authored proxy from a bad camera pose or a stale
         * scene graph. Capture the exact ray the real interaction system just
         * used, plus both the matrices it saw and the bounds implied by the
         * objects' local transforms. This is diagnostic evidence only: it
         * never updates an Object3D matrix or changes the player's pose. */
        const expected = h.preflight.markerTarget();
        const ray = h.interaction.raycaster.ray;
        const authoredWorld = (object) => {
          const chain = [];
          for (let o = object; o; o = o.parent) chain.push(o);
          const matrix = new object.matrixWorld.constructor().identity();
          for (let i = chain.length - 1; i >= 0; i--) {
            const o = chain[i];
            const local = new object.matrixWorld.constructor()
              .compose(o.position, o.quaternion, o.scale);
            matrix.multiply(local);
          }
          return matrix;
        };
        const boundsFor = (matrixOf) => {
          let bounds = null;
          expected?.traverse?.((o) => {
            if (!o.isMesh || !o.geometry) return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const box = o.geometry.boundingBox?.clone();
            if (!box) return;
            box.applyMatrix4(matrixOf(o));
            if (bounds) bounds.union(box); else bounds = box;
          });
          return bounds ? {
            min: bounds.min.toArray().map((n) => +n.toFixed(3)),
            max: bounds.max.toArray().map((n) => +n.toFixed(3)),
          } : null;
        };
        const nearest = h.interaction.raycaster
          .intersectObjects(h.interaction.targets, true)
          .slice(0, 5)
          .map((hit) => ({
            distance: +hit.distance.toFixed(3),
            object: hit.object.name || hit.object.type,
            owner: h.interaction._ownerOf(hit.object)?.name || null,
            point: hit.point.toArray().map((n) => +n.toFixed(3)),
          }));
        const anchor = h.preflight.markerAnchor(new h.camera.position.constructor());
        const aim = anchor?.clone().sub(ray.origin).normalize();
        firstMiss = {
          check: at.name,
          stand: at.stand,
          player: h.player.position.toArray().map((n) => +n.toFixed(3)),
          camera: h.camera.position.toArray().map((n) => +n.toFixed(3)),
          rayOrigin: ray.origin.toArray().map((n) => +n.toFixed(3)),
          rayDirection: ray.direction.toArray().map((n) => +n.toFixed(5)),
          markerAnchor: anchor?.toArray().map((n) => +n.toFixed(3)) ?? null,
          aimDot: aim ? +aim.dot(ray.direction).toFixed(6) : null,
          staleBounds: boundsFor((o) => o.matrixWorld),
          authoredBounds: boundsFor(authoredWorld),
          nearest,
        };
      }
      // Hold long enough to satisfy the longest hold in the walk (1.0 s).
      h.pressE(1.3);
      log.push({
        check: at.name,
        prompted: !!target,
        label,
        countBefore: before,
        countAfter: h.preflight.doneCount,
      });
    }
    /* STAND THERE AND WATCH THE BOMB GO IN.
     *
     * LOAD FAT SQUATCH marks its own check done on the key press and then runs
     * a real animation — roll, lift, withdraw (`LOAD_TIMING` in
     * `src/enolasquatch/payload/BombTrolley.js`, about 5.1 s in total, with the
     * bomb becoming a child of the aeroplane at the end of the lift). The two
     * checks that follow it in walk order only account for about 2.6 s of that,
     * so a run that snapshotted the crew's beats the instant the elevator
     * moved was reading them while the Fat Squatch was still in the air on a
     * hoist — which is a player who has pressed the last key, not a player who
     * has finished the walkaround. Bounded by the trolley's own state rather
     * than by a hard-coded wait, so a retune of `LOAD_TIMING` cannot silently
     * turn this into either a hang or a too-short wait, and `loadedInSeconds`
     * is reported so a sequence that never seats the bomb reads as exactly
     * that. */
    let loadWaited = 0;
    while (!h.mission.bombTrolley?.loaded && loadWaited < 20) {
      h.tick(0.25);
      loadWaited += 0.25;
    }
    return {
      log,
      complete: h.preflight.complete,
      done: h.preflight.doneCount,
      bombLoaded: !!h.mission.bombTrolley?.loaded,
      loadedInSeconds: +loadWaited.toFixed(2),
      tasks: Object.fromEntries(Object.entries(h.preflight.tasks)
        .map(([k, t]) => [k, `${t.count}/${t.need}`])),
      seen: {
        numbskull: h.dialogue.seen('preflight.numbskull'),
        restraints: h.dialogue.seen('preflight.restraints'),
        bombbay: h.dialogue.seen('preflight.bombbay'),
        shubes: h.dialogue.seen('preflight.shubes.first'),
      },
      /* Sasole's reaction half — added 2026-08-04, see the "walkaround patter"
       * block in `src/enolasquatch/dialogue/script.js`. */
      sasole: Object.fromEntries([
        'chocksDone', 'propOne', 'propTwo', 'propThree', 'propFour',
        'bayDone', 'payloadDone', 'tailDone', 'surfacesDone',
      ].map((k) => [k, h.dialogue.seen(`preflight.sasole.${k}`)])),
      phase: h.mission.phase,
      firstMiss,
    };
  });
  check('every walkaround check is reachable on foot and completes through the real interaction system',
    walkaround.complete && walkaround.done === 6
      && walkaround.log.every((row) => row.prompted)
      /* Ten presses for ten checks (2 chocks + 4 props + 1 each of bay,
       * payload, tail, surfaces). More than that means the crosshair had to be
       * re-aimed, i.e. something is only reachable by luck. */
      && walkaround.log.length === 10,
    JSON.stringify({ complete: walkaround.complete, tasks: walkaround.tasks, log: walkaround.log,
      firstMiss: walkaround.firstMiss }));

  /* ---- The four crew beats ----
   *
   * `preflight.numbskull`, `.restraints`, `.bombbay` and `.shubes.first` used
   * to fire off `updatePreflight`'s clock, at a player already strapped into
   * the left seat with nothing to look at. Moving them onto the parts they are
   * about is the whole reason `src/enolasquatch/preflight.js` exists.
   *
   * `restraints` is the one that fell through the gap. When the Fat Squatch
   * moved out from under the belly and onto a trolley (owner playtest,
   * 2026-08-19), the payload check started firing `preflight.loadSquatch`
   * instead, and nothing inherited "Payload secure?" / "Secure enough." — the
   * beat stayed authored, stayed commented as kept, and stopped being spoken on
   * the only route a player takes. It now hangs off `BombTrolley.onLoaded`,
   * which is why this block waits for the load above: the beat is fired by the
   * bomb arriving in the bay, not by the key press that started it moving. So
   * the bomb actually being aboard is asserted here too — four beats said by a
   * crew standing round an aeroplane that is loaded is the state this check is
   * really describing. */
  check('the walkaround fires the four crew beats that used to play at nobody from the left seat',
    walkaround.seen.numbskull && walkaround.seen.restraints
      && walkaround.seen.bombbay && walkaround.seen.shubes
      && walkaround.bombLoaded,
    JSON.stringify({ ...walkaround.seen, bombLoaded: walkaround.bombLoaded,
      loadedInSeconds: walkaround.loadedInSeconds }));

  /* ---- Sasole's new walkaround patter (owner: "whippy snappy voice lines") ---- */
  check('Sasole reacts to each check as it is finished, and the four propellers get four different lines',
    walkaround.sasole.chocksDone && walkaround.sasole.propOne && walkaround.sasole.propTwo
      && walkaround.sasole.propThree && walkaround.sasole.propFour && walkaround.sasole.bayDone
      && walkaround.sasole.payloadDone && walkaround.sasole.tailDone && walkaround.sasole.surfacesDone,
    JSON.stringify(walkaround.sasole));

  /* ---- THE BOARDING BLOCKER ----
   *
   * Owner playtest, 2026-08-04: "No way to board aircraft after precheck. The
   * walkaround completes and the player is stranded."
   *
   * The check this file used to make teleported the player to a pose 1.8 m off
   * the door with the crosshair already on it, and passed — which is precisely
   * why the bug shipped. Nothing verified that a player could FIND the door.
   * So this is now two checks:
   *
   *   1. GUIDANCE. When the last check completes, the walk's marker must move
   *      to the crew door rather than switching off, and the objective must
   *      carry a live distance. (The regression is `EnolaPreflight.update()`
   *      hiding the marker on `complete`.)
   *   2. END TO END, ON FOOT. From wherever the sixth check actually leaves
   *      the player — no teleport, no repositioning — face the door, hold W,
   *      and walk. The prompt must appear, and E must board. If a future
   *      change moves the door, shrinks the hit box or blocks the apron, this
   *      fails the way the player did.
   */
  const guidance = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    /* Stand still on the apron. Sasole is supposed to notice and say where the
     * door is — the beat that would have rescued the owner's playtest. Runs
     * before the walk to the door so it is tested from the stranded state.
     * Bounded, not fixed: the queue behind it is however long the walk made
     * it, and `preflight.sasole.boardNudge` waits for a gap. */
    let nudgeAfter = null;
    for (let s = 0; s < 90 && nudgeAfter === null; s++) {
      h.tick(1);
      if (h.dialogue.seen('preflight.sasole.boardNudge')) nudgeAfter = s + 1;
    }
    const d = h.mission.boardTarget;
    let markerAtDoor = false;
    if (d) {
      d.updateWorldMatrix(true, false);
      const e = d.matrixWorld.elements;
      const m = h.preflight.marker.position;
      markerAtDoor = Math.hypot(m.x - e[12], m.y - e[13], m.z - e[14]) < 1.2;
    }
    return {
      armed: !!d,
      markerVisible: h.preflight.marker.visible,
      guidingToDoor: h.preflight.guidingToDoor,
      markerAtDoor,
      objective: h.mission.objective,
      distance: h.mission.boardingDistance(),
      nudgeAfter,
    };
  });
  check('finishing the walk moves the guidance marker onto the crew door instead of switching it off',
    guidance.armed && guidance.markerVisible && guidance.guidingToDoor && guidance.markerAtDoor
      && /\d+\s*m\)/.test(guidance.objective) && guidance.distance > 2,
    JSON.stringify({ ...guidance, nudgeAfter: undefined }));

  check('a player who stands there not boarding is told, out loud, where the crew door is',
    guidance.nudgeAfter !== null, `Sasole's boardNudge played after ${guidance.nudgeAfter}s of standing still`);

  const boarding = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const door = h.mission.boardTarget;
    door.updateWorldMatrix(true, false);
    const e = door.matrixWorld.elements;
    const target = { x: e[12], y: e[13], z: e[14] };
    // Wherever the sixth check left him. Not moved, not re-aimed vertically.
    const from = { x: h.player.position.x, z: h.player.position.z };
    const startDistance = Math.hypot(from.x - target.x, from.z - target.z);
    h.player.yaw = Math.atan2(-(target.x - from.x), -(target.z - from.z));
    h.player.pitch = 0;              // looking dead level, like a person walking
    h.player.setKey('KeyW', true);
    let frames = 0;
    let prompted = false;
    for (; frames < 900; frames++) {
      h.tick(1 / 60);
      if (h.interaction.current === door) { prompted = true; break; }
    }
    h.player.setKey('KeyW', false);
    h.tick(0.1);
    const desc = h.interaction.current?.userData?.interact;
    const label = desc ? (typeof desc.label === 'function' ? desc.label() : desc.label) : null;
    const promptDistance = Math.hypot(h.player.position.x - target.x, h.player.position.z - target.z);
    h.pressE(0);
    return {
      startDistance: +startDistance.toFixed(1),
      walkedSeconds: +(frames / 60).toFixed(2),
      prompted,
      label,
      promptDistance: +promptDistance.toFixed(2),
      inCockpit: h.mission.inCockpit,
      phase: h.mission.phase,
      crewAboard: h.crew.aboard,
      playerEnabled: h.player.enabled,
      interactionPaused: h.interaction.paused,
      bayClosed: h.mission.bombBayOpen === false,
    };
  });
  check('a player who WALKS from the last check to the crew door gets the prompt and boards — no teleport',
    boarding.startDistance > 8 && boarding.prompted && boarding.promptDistance > 2.5
      && boarding.inCockpit && boarding.crewAboard && !boarding.playerEnabled
      && boarding.interactionPaused && boarding.bayClosed
      // Boarding off the apron runs the nightfall cut; the seat comes after it.
      && boarding.phase === 'nightfall',
    JSON.stringify(boarding));

  /* ---- The nightfall cut ----
   * Owner: "its also daytime... maybe a cutscene where it turns to night and
   * we are in the plane on the runway for takeoff". Asserted as three separate
   * facts, because each of them can break on its own: the sky really changes,
   * the aeroplane really moves to the runway, and the phase chain that follows
   * (preflight -> taxi -> takeoff) is untouched. */
  const cut = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const apron = {
      night: h.weather.night, dusk: h.weather.dusk,
      x: h.physics.position.x, z: h.physics.position.z, heading: h.physics.headingDeg,
      fade: h.mission.cutscene?.fade ?? null,
      captioned: !!h.mission.cutscene?.caption,
    };
    h.tick(6.0);                       // the sky runs down, live, in the world
    const middle = {
      night: h.weather.night, dusk: h.weather.dusk,
      x: h.physics.position.x, phase: h.mission.phase,
      fade: h.mission.cutscene?.fade ?? null,
    };
    h.tick(8.0);                       // through the black, up on the runway
    const a = h.airfield.anchors;
    return {
      apron,
      middle,
      end: {
        phase: h.mission.phase,
        cutsceneOver: !h.mission.cutscene?.active,
        night: h.weather.night,
        dusk: h.weather.dusk,
        staged: h.mission.nightfallStaged,
        x: +h.physics.position.x.toFixed(1),
        z: +h.physics.position.z.toFixed(1),
        heading: +h.physics.headingDeg.toFixed(0),
        lineUp: { x: a.lineUp.x, z: a.lineUp.z, heading: a.departHeading },
        distanceToLineUp: +Math.hypot(h.physics.position.x - a.lineUp.x, h.physics.position.z - a.lineUp.z).toFixed(1),
        onGround: h.physics.onGround,
        parkingBrake: h.physics.controls.parkingBrake,
        enginesRunning: h.engines.engines.filter((e) => e.running).length,
        runwayLampsLit: !!h.scene.getObjectByName('runway-36-edge-lights')?.visible,
        beats: {
          hatch: h.dialogue.seen('nightfall.hatch'),
          wait: h.dialogue.seen('nightfall.wait'),
          lineup: h.dialogue.seen('nightfall.lineup'),
        },
      },
    };
  });
  check('boarding cuts to nightfall: the sky really runs down from daylight to night in the world',
    cut.apron.night < 0.3 && cut.apron.dusk < 0.7
      && cut.middle.night > cut.apron.night && cut.middle.phase === 'nightfall'
      && cut.end.night === 1 && cut.end.dusk === 1,
    JSON.stringify({ apron: cut.apron, middle: cut.middle, endNight: cut.end.night }));

  check('the cut ends with the Enola Squatch lined up on the runway at night, engines cold, and hands control back',
    cut.end.phase === 'preflight' && cut.end.cutsceneOver && cut.end.staged
      && cut.end.distanceToLineUp < 2 && Math.abs(cut.end.heading - cut.end.lineUp.heading) < 2
      && cut.end.onGround && cut.end.parkingBrake && cut.end.enginesRunning === 0
      && cut.end.runwayLampsLit
      && cut.end.beats.hatch && cut.end.beats.wait && cut.end.beats.lineup,
    JSON.stringify(cut.end));

  /* ---- The crew are physically in their seats, riding the airframe ---- */
  const seated = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const inAircraft = (f) => {
      let o = f.group;
      while (o) { if (o === h.aircraft.group) return true; o = o.parent; }
      return false;
    };
    const world = (f) => {
      f.group.updateWorldMatrix(true, false);
      const e = f.group.matrixWorld.elements;
      return { x: e[12], y: e[13], z: e[14] };
    };
    const p = h.physics.position;
    const dist = (f) => {
      const w = world(f);
      return Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z);
    };
    return {
      allParented: h.crew.all.every(inAircraft),
      allSitting: h.crew.all.every((f) => f.pose === 'sit'),
      // Everybody inside the airframe's own envelope: nose to tail is about
      // 24 m, so nobody should be further than 14 m from the CG.
      distances: Object.fromEntries(h.crew.all.map((f) => [f.group.name, +dist(f).toFixed(1)])),
      gunnerInTurret: (() => {
        /* The seat and Shubes now traverse with the real turret, so neither
         * position is in aircraft-local coordinates here. Compare their world
         * origins instead of a nested group position against the legacy
         * zero-traverse compatibility anchor. */
        const seat = h.aircraft.parts.rearGunSeatMount.getWorldPosition(h.physics.position.clone());
        const g = world(h.crew.shubes);
        return Math.hypot(g.x - seat.x, g.y - seat.y, g.z - seat.z) < 0.6;
      })(),
      bombardierInNose: (() => {
        const st = h.aircraft.anchors.bombardierStation;
        const g = h.crew.numbskull.group.position;
        return Math.hypot(g.x - st.x, g.z - st.z) < 1.5;
      })(),
    };
  });
  check('all four crew are seated inside the airframe — Shubes in the tail turret, Numbskull in the nose',
    seated.allParented && seated.allSitting && seated.gunnerInTurret && seated.bombardierInNose
      /* The repaired rear-gun cup is a real aft station at ~17.3 m from CG,
       * clear of the rudder/elevator envelope. Its exact seat-anchor check
       * above is authoritative; the old blanket 14 m bound described the
       * shorter pre-repair tail and falsely rejected the correctly seated
       * gunner. Everyone in the inhabited fuselage still stays inside 14 m. */
      && Object.entries(seated.distances).every(([name, d]) => (
        name === 'shubes' ? d < 19 : d < 14
      )),
    JSON.stringify(seated));

  /* ---- The rear gun exists as a station, and it moves ---- */
  const gunStation = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const a = h.aircraft;
    const before = a.parts.rearGunTurret.rotation.y;
    h.tick(2.2);   // the idle sweep
    const swept = Math.abs(a.parts.rearGunTurret.rotation.y - before) > 0.02;
    // Now fire it, off the mission's own state rather than by poking the mesh.
    h.mission.gunFiring = true;
    h.mission.gunAim.set(h.physics.position.x - 600, h.physics.position.y - 300, h.physics.position.z);
    /* Sampled across the burst rather than at the end of it: the muzzle flash
     * is a few frames long on a twelve-rounds-a-second cadence, so a single
     * reading after the fact lands between shots more often than not. */
    let flashPeak = 0;
    for (let i = 0; i < 40; i++) {
      h.tick(1 / 60);
      flashPeak = Math.max(flashPeak, ...a.parts.gunFlash.map((f) => f.material.opacity));
    }
    const flashLit = flashPeak > 0.2;
    const aimed = Math.abs(a.parts.rearGunTurret.rotation.y) > 0.001;
    h.mission.gunFiring = false;
    h.tick(0.2);
    return {
      hasStation: !!a.parts.rearGunStation,
      barrels: a.parts.gunBarrels.length,
      flashes: a.parts.gunFlash.length,
      swept,
      flashLit,
      flashPeak: +flashPeak.toFixed(2),
      aimed,
      seatAnchor: !!a.anchors.rearGunSeat,
      muzzleAnchor: !!a.anchors.rearGunMuzzle,
    };
  });
  check('the rear gun is a real station: twin barrels, muzzle flashes, an idle sweep and an aimed burst',
    gunStation.hasStation && gunStation.barrels === 2 && gunStation.flashes === 2
      && gunStation.swept && gunStation.flashLit && gunStation.aimed
      && gunStation.seatAnchor && gunStation.muzzleAnchor,
    JSON.stringify(gunStation));

  /* ---- Squatchbourg is built, instanced, and inside its draw-call budget ---- */
  const cityBuilt = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const s = h.city.stats();
    let instanced = 0;
    let meshes = 0;
    h.city.group.traverse((o) => {
      if (o.isInstancedMesh) instanced++;
      else if (o.isMesh) meshes++;
    });
    /* The real frame cost, measured rather than asserted from the source: put
     * the camera over the city, render one frame, and read the renderer's own
     * counters. This is what "performance matters" has to mean for a browser
     * game — a number, from a render, not a claim about instancing. */
    const before = { calls: h.renderer.info.render.calls, tris: h.renderer.info.render.triangles };
    const cam = h.camera;
    const savedPos = cam.position.clone();
    const savedQuat = cam.quaternion.clone();
    cam.position.set(h.city.x - 1400, h.city.groundY + 900, h.city.z);
    cam.lookAt(h.city.x, h.city.groundY, h.city.z);
    h.renderer.info.reset();
    h.renderer.render(h.scene, cam);
    const overCity = { calls: h.renderer.info.render.calls, tris: h.renderer.info.render.triangles };
    cam.position.copy(savedPos);
    cam.quaternion.copy(savedQuat);
    return { ...s, instanced, meshes, destroyed: h.city.destroyed, before, overCity };
  });
  check('Squatchbourg is an extensive instanced city, not a few hundred separate meshes',
    cityBuilt.buildings > 2000 && cityBuilt.instanced >= 8 && cityBuilt.meshes < 90
      && cityBuilt.streetLights > 400 && !cityBuilt.destroyed,
    JSON.stringify({ ...cityBuilt, before: undefined, overCity: undefined }));

  /* ---- The elaborate city (owner: "I want it detailed... quite an elaborate
   * city to drop the bomb on so it's a powerful scene") ----
   * Asserted as STRUCTURE, because that is what was asked for and what a
   * texture cannot fake: six districts that actually contain different things,
   * a river with water in a carved channel, working frontage, and landmarks
   * that are individually placed rather than scattered. */
  const cityStructure = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const c = h.city;
    const s = c.stats();
    const seen = new Set();
    for (const l of c.lots) seen.add(l.district);
    const named = (n) => !!c.group.getObjectByName(n);
    // The river channel has to be a real dip in the ground the aeroplane flies
    // over, not a blue rectangle lying on the desert.
    const onRiver = { x: c.x, z: c.z + Math.cos(0.34) * -260 };
    const bankZ = c.z + Math.cos(0.34) * -260 + 220;
    const channel = h.groundHeight(onRiver.x, onRiver.z);
    const bank = h.groundHeight(onRiver.x, bankZ);
    return {
      ...s,
      districts: [...seen].sort(),
      landmarkNames: c.landmarks.map((l) => l.name),
      hasGround: named('squatchbourg-ground'),
      hasRiver: named('squatchbourg-river'),
      hasHouses: named('squatchbourg-houses'),
      hasRoofs: named('squatchbourg-roofs'),
      hasTrees: named('squatchbourg-trees'),
      hasRail: named('squatchbourg-rolling-stock'),
      hasCraft: named('squatchbourg-river-craft'),
      channelDepth: +(bank - channel).toFixed(1),
    };
  });
  check('Squatchbourg has districts, a working river frontage, industry and landmarks worth aiming at',
    cityStructure.districts.length >= 6
      && cityStructure.landmarks >= 18 && cityStructure.landmarkParts > 150
      && cityStructure.hasGround && cityStructure.hasRiver && cityStructure.hasHouses
      && cityStructure.hasRoofs && cityStructure.hasTrees && cityStructure.hasRail
      && cityStructure.hasCraft && cityStructure.channelDepth > 6,
    JSON.stringify({
      districts: cityStructure.districts,
      buildings: cityStructure.buildings,
      blocks: cityStructure.blocks,
      houses: cityStructure.houses,
      landmarks: cityStructure.landmarks,
      landmarkParts: cityStructure.landmarkParts,
      kitDrawCalls: cityStructure.kitDrawCalls,
      channelDepth: cityStructure.channelDepth,
    }));

  check('every landmark in the city costs a handful of draw calls between them, not one each',
    cityStructure.kitDrawCalls <= 12 && cityStructure.instancedMeshes <= 22
      && cityStructure.plainMeshes <= 4,
    `${cityStructure.landmarks} landmarks / ${cityStructure.landmarkParts} parts in `
    + `${cityStructure.kitDrawCalls} instanced kit meshes; the whole city is `
    + `${cityStructure.drawCallsApprox} draw calls and ~${cityStructure.trianglesApprox} triangles`);

  check('a whole frame with the city filling it stays inside a browser-game budget',
    cityBuilt.overCity.calls < 150 && cityBuilt.overCity.tris < 700000,
    `${cityBuilt.overCity.calls} draw calls, ${cityBuilt.overCity.tris} triangles for the whole scene from 3000 ft over the target`);

  /* ---- Cockpit preflight: all four engines start, brakes off, clears to taxi ----
   *
   * The phase chain is unchanged by the nightfall cut — preflight still gates
   * on battery, fuel selectors, all four engines and the parking brake, and
   * still hands off to `taxi`. What the cut DOES change is how long taxi
   * lasts: the aeroplane is already standing on the line-up anchor, so
   * `evaluateLineupGate` is satisfied on taxi's first frame and it clears
   * straight through to `takeoff`. That transition is therefore recorded
   * frame by frame rather than sampled at the end, so this still fails if
   * `taxi` is ever skipped rather than passed through. */
  const engineStart = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.engines.masterBattery = true;
    h.engines.fuelSelectors = true;
    h.input.throttle = 0.15;
    h.engines.crank(2);        // "three and four are yours, Prospect"
    h.engines.crank(3);
    const phases = [];
    const note = () => { if (phases[phases.length - 1] !== h.mission.phase) phases.push(h.mission.phase); };
    note();
    for (let i = 0; i < 300; i++) { h.tick(1 / 60); note(); }
    h.input.parkingBrake = false;
    for (let i = 0; i < 60; i++) { h.tick(1 / 60); note(); }
    return {
      running: h.engines.engines.map((e) => e.running),
      engineStartBeat: h.dialogue.seen('preflight.engineStart'),
      phases,
      phase: h.mission.phase,
      taxiBeat: h.dialogue.seen('taxi.line'),
    };
  });
  check('all four engines start, the start-sequence beat plays, and preflight clears through taxi',
    engineStart.running.every(Boolean) && engineStart.engineStartBeat
      && engineStart.phases.includes('taxi') && engineStart.taxiBeat
      && ['taxi', 'takeoff'].includes(engineStart.phase),
    JSON.stringify(engineStart));

  /* ---- Takeoff: real thrust from all four engines (the config.js design
   * note flags that only engines 0/1 fed physics unless engineNames encode
   * left/right — this proves both banks actually push). ---- */
  const takeoff = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('takeoff');
    const phaseAtStart = h.mission.phase;
    h.input.key('KeyW', true);
    h.input.throttle = 1;
    h.tick(8);
    h.input.key('KeyW', false);
    const musicKeys = [...h.audio.engine.loops.keys()].filter((key) => key.startsWith('music.'));
    const anthem = h.audio.engine.loops.get('music.takeoff');
    return {
      phaseAtStart,
      thrustL: h.physics.thrustL,
      thrustR: h.physics.thrustR,
      ias: h.physics.ias,
      groundSpeed: h.physics.groundSpeed,
      musicKeys,
      anthem: anthem ? { volume: anthem.volume, loop: anthem.element.loop } : null,
      anthemOptions: h.audio.takeoffAnthemOptions,
    };
  });
  check('go("takeoff") stages the runway, and all four engines produce real thrust under full power',
    takeoff.phaseAtStart === 'takeoff' && takeoff.thrustL > 1000 && takeoff.thrustR > 1000
      && (takeoff.ias > 5 || takeoff.groundSpeed > 5),
    JSON.stringify(takeoff));
  check('Fortunate Son has one owner, plays once at 13% lower volume, and fades at 2:30',
    takeoff.musicKeys.length === 1 && takeoff.musicKeys[0] === 'music.takeoff'
      && takeoff.anthem?.volume === 0.435 && takeoff.anthem.loop === false
      && takeoff.anthemOptions?.cutAt === 150 && takeoff.anthemOptions?.cutFade === 4,
    JSON.stringify({ keys: takeoff.musicKeys, anthem: takeoff.anthem, options: takeoff.anthemOptions }));

  /* Shortcut: an unassisted headless takeoff roll/rotation is a flight-model
   * timing question (already covered by `npm run check:flight`'s tuning
   * tests), not a wiring one — jump the remaining roll/rotate/liftoff. */
  const climbTurnEntry = await page.evaluate(() => window.__enolaSquatch.go('climbTurn'));
  check('go("climbTurn") reaches the climb-out phase', climbTurnEntry === 'climbTurn');

  /* ---- Climb/turn: the real past-the-turn-point + heading-hold logic. ---- */
  const turnBeat = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(6); // physically crosses TURN_POINT.z heading south, per go('climbTurn')'s pose
    return { turnCalled: h.mission.flags.turnCalled, sawTurnLine: h.dialogue.seen('climb.turn.east') };
  });
  check('crossing the real turn point fires the turn-onto-090 beat',
    turnBeat.turnCalled && turnBeat.sawTurnLine, JSON.stringify(turnBeat));

  const cruiseEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    // Heading-hold-for-2.5s is exercised for real; only the turn maneuver
    // itself is short-circuited by setting the heading directly.
    h.physics.setPose(h.physics.position.clone(), 90, Math.max(h.physics.velocity.length(), 60));
    h.tick(4);
    return h.mission.phase;
  });
  check('holding 090 for real transitions climbTurn into cruise', cruiseEntry === 'cruise', cruiseEntry);

  /* ---- Flight controls: actual browser A/D events, shared input, real
   * Enola physics and the authored wing frame. This guards the player-facing
   * polarity rather than merely checking the value written into `controls`:
   * A must bank/turn left and D must bank/turn right. Each direction starts
   * from the same high, level cruise pose so weather, ground contact and a
   * previous maneuver cannot contaminate the comparison.
   *
   * THE HEADING IS MEASURED OVER THREE SECONDS, NOT ONE.
   *
   * The bank and the wing frame are read at one second, where they always were
   * and where they are unambiguous (about 24 degrees of roll, left wing plainly
   * lower). The HEADING was read there too, against a threshold of 0.02
   * degrees, and that was never a measurement — it was a coin.
   *
   * A bank takes a moment to become a turn: in the first second the aeroplane
   * is still rolling, so the whole heading change the stick has earned is about
   * a quarter of a degree. Sitting underneath it is a steady rightward drift of
   * about the same size — measured hands-off from a matching staged pose,
   * -0.89, -0.51 and +0.14 degrees on three staged runs. The noise band is
   * bigger than the signal, and the threshold sat inside the noise band.
   *
   * AND THE NOISE IS NOT REMOVABLE. `?airSeed=1945` pins the gust field, but
   * `src/beefrun/engines.js` seeds each engine's idle-RPM wobble from
   * `performance.now()` — the WALL clock, not the simulation clock — so four
   * engines carry four wall-clock-dependent thrusts and the aeroplane yaws
   * differently on every run of the identical deterministic tick. Observed on
   * consecutive full runs of the SAME code: the one-second reading was -0.008
   * on one and +0.028 on the next, i.e. a fail and a pass, decided by nothing.
   *
   * Held for three seconds the turn is worth four to five degrees each way and
   * the drift is still a fraction of one, so the same claim is now made with a
   * signal-to-noise ratio of about twenty rather than about one. Measured over
   * three staged runs: A reached +4.32, +4.72 and +4.95; D reached -5.76,
   * -5.28 and -5.43; hands-off stayed inside +/-0.29. The one-second reading is
   * still reported next to it, because it is the number this file argued about
   * for two sessions and somebody will want to see it. ---- */
  const flyEnolaKey = async (code) => {
    await page.evaluate(() => {
      const h = window.__enolaSquatch;
      h.go('cruise');
      h.input.clear();
      h.mission.autopilot.disengage(null);
      const { x, z } = h.physics.position;
      h.physics.setPose(h.physics.position.clone().set(x, h.groundHeight(x, z) + 900, z), 0, 68);
      h.engines.forceRunning();
      h.mission.flags.enginesEverStarted = true;
      h.physics.controls.parkingBrake = false;
      h.tick(0);
    });
    await page.keyboard.down(code);
    let result;
    try {
      result = await page.evaluate(() => {
        const h = window.__enolaSquatch;
        const signed = () => ((h.physics.headingDeg + 540) % 360) - 180;
        h.tick(1);
        h.aircraft.group.updateMatrixWorld(true);
        const left = h.aircraft.group.getObjectByName('air-brake-left');
        const right = h.aircraft.group.getObjectByName('air-brake-right');
        const signedHeading = signed();
        const state = {
          controlRoll: h.physics.controls.roll,
          rollDeg: h.physics.rollDeg,
          signedHeading,
          leftY: left?.matrixWorld.elements[13] ?? null,
          rightY: right?.matrixWorld.elements[13] ?? null,
        };
        // Keep the stick where it is for two more seconds and let the bank
        // become a turn — see the note above for why the one-second reading is
        // kept but is no longer what the heading is judged on.
        h.tick(2);
        return { ...state, turnedBy: +signed().toFixed(3), rollAtThree: +h.physics.rollDeg.toFixed(2) };
      });
    } finally {
      await page.keyboard.up(code);
    }
    return result;
  };
  const aTurn = await flyEnolaKey('KeyA');
  const dTurn = await flyEnolaKey('KeyD');
  check('real A input banks the Enola Squatch left through its physics and visible wing frame',
    aTurn.controlRoll > 0.5 && aTurn.rollDeg > 2 && aTurn.turnedBy > 2
      && aTurn.leftY < aTurn.rightY,
    JSON.stringify(aTurn));
  check('real D input banks the Enola Squatch right through its physics and visible wing frame',
    dTurn.controlRoll < -0.5 && dTurn.rollDeg < -2 && dTurn.turnedBy < -2
      && dTurn.leftY > dTurn.rightY,
    JSON.stringify(dTurn));

  /* ---- The camera hint: the owner's requested twenty-seconds-after-takeoff
   * reminder must be a real visible control, and using the control must both
   * change the view and dismiss the reminder. `state().cameraTip` is painted
   * from the live DOM node, so this is evidence of presentation rather than a
   * source-string check. The one-second steps keep the mission deterministic;
   * the flight model itself advances on its fixed-step cap. ---- */
  const cameraHint = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('cruise');
    let shownAt = null;
    for (let i = 1; i <= 24; i++) {
      h.tick(1);
      const tip = h.state().cameraTip;
      if (tip.visible) { shownAt = tip.flying; break; }
    }
    const before = h.state();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', bubbles: true }));
    const after = h.state();
    h.cameras.setView('cockpit');
    h.go('cruise');
    return {
      shownAt,
      text: document.getElementById('enola-camera-tip')?.textContent || '',
      before: { view: before.camera.view, ...before.cameraTip },
      after: { view: after.camera.view, ...after.cameraTip },
    };
  });
  check('twenty seconds into real flight, the HUD visibly flashes the C camera instruction',
    cameraHint.shownAt !== null && cameraHint.shownAt >= 20 && cameraHint.shownAt <= 21
      && cameraHint.before.visible && cameraHint.before.opacity > 0
      && /C.*CHANGE THE CAMERA VIEW/i.test(cameraHint.text),
    JSON.stringify(cameraHint));
  check('pressing C changes the camera and dismisses the hint for the rest of the flight',
    cameraHint.after.view !== cameraHint.before.view
      && cameraHint.after.done && !cameraHint.after.visible,
    JSON.stringify(cameraHint));

  const earlyTurn = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('climbTurn');
    /* Start just shy of the radial fallback. During the 2.5 s heading hold the
     * aeroplane crosses that fallback but remains west of detection, so this
     * isolates climb-turn progression instead of immediately testing the
     * next phase too. */
    const x = 1900;
    const z = -1500;
    h.physics.setPose({ x, y: h.groundHeight(x, z) + 340, z }, 90, 62);
    h.tick(3.2);
    return {
      phase: h.mission.phase,
      turnCalled: h.mission.flags.turnCalled,
      onCourseSeconds: h.mission._onCourseT,
    };
  });
  check('an early turn onto 090 clears the climb instruction instead of soft-locking on the missed z line',
    earlyTurn.phase === 'cruise' && earlyTurn.turnCalled,
    JSON.stringify(earlyTurn));

  /* ---- Cruise: a real nav-correction bark when off-heading. ---- */
  const navBark = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    /* The early-turn check intentionally rewinds a phase. Restore the real
     * turn-on-course checkpoint so this assertion exercises updateCruise,
     * not whichever later phase its preceding simulation reached. */
    h.go('cruise');
    /* Heading 130 with a 090 corridor. This airframe's nose is +Z, so the
     * pilot's left is +X and headings count round toward +X — a RISING heading
     * is a LEFT turn. Sitting at 130 the aeroplane has already gone too far
     * left, so the correction Irish owes is RIGHT. He used to call the other
     * one, which is the same class of mistake as the mirrored Beef Run seats
     * and the reason this check now asserts the SIDE rather than just that
     * somebody said something. */
    h.physics.setPose(h.physics.position.clone(), 90 + 40, h.physics.velocity.length());
    h.tick(10); // clears cruise.settle's own queue and the 4s nav-call cooldown
    return {
      navOffCourse: h.mission.flags.navOffCourse,
      calledRight: h.dialogue.seen('nav.right5'),
      calledLeft: h.dialogue.seen('nav.left5'),
      wrongWay: h.dialogue.seen('nav.wrongWay'),
    };
  });
  check('flying 40 degrees off the 090 corridor fires a real Irish heading-correction bark',
    navBark.navOffCourse && (navBark.calledRight || navBark.calledLeft || navBark.wrongWay),
    JSON.stringify(navBark));

  check('and Irish calls the correction from inside the cockpit: too far left means come RIGHT',
    navBark.calledRight && !navBark.calledLeft, JSON.stringify(navBark));

  /* ---- Detection corridor: real exposure/attention accumulation, then a
   * real, unassisted straight-line crossing into the compound's defenses. ---- */
  const detectionEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.physics.setPose(h.physics.position.clone(), 90, h.physics.velocity.length());
    const phase = h.go('detection');
    return { phase, active: h.detection.active, state: h.detection.state };
  });
  check('go("detection") deploys the corridor patrol/radar stealth meter',
    detectionEntry.phase === 'detection' && detectionEntry.active
      && ['unnoticed', 'searching', 'located'].includes(detectionEntry.state),
    JSON.stringify(detectionEntry));

  const throughCorridor = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    // Hands-off flight is not trimmed for this loaded, heavy four-engine
    // bomber (per config.js's design note) — with no elevator input at all
    // it noses over into a dive within seconds, same as a real untrimmed
    // aircraft would. A light, duty-cycled climb input (20% of each second)
    // is the same real control the cockpit exposes, just automated rather
    // than held by a human hand, and is what keeps 40 real, physically
    // integrated seconds of forward flight clear of the ground.
    h.input.throttle = 0.85;
    for (let i = 0; i < 40; i++) {
      h.input.key('KeyS', true);
      h.tick(0.2);
      h.input.key('KeyS', false);
      h.tick(0.8);
    }
    return { phase: h.mission.phase, x: h.physics.position.x, agl: h.physics.agl, failed: h.mission.failed };
  });
  check('flying the real corridor for real clears past it into the compound\'s defenses',
    throughCorridor.phase === 'defense' && !throughCorridor.failed, JSON.stringify(throughCorridor));

  /* ---- Defense: the damage API affects real state without crashing. ---- */
  const defenseDamage = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const before = h.engines.engines[0].health;
    h.defense.damageEngine(0);
    h.defense.damageRudder();
    h.defense.damageElectrical();
    h.defense.damageFuel();
    h.tick(1);
    return {
      damage: { ...h.defense.damage, engines: h.defense.damage.engines.slice() },
      engineHealthDropped: h.engines.engines[0].health < before,
      sawHitLine: h.dialogue.seen('defense.hit'),
      phase: h.mission.phase,
    };
  });
  /* ---- The rear gunner works the gun off the mission's own state ---- */
  const gunnerOrganic = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    let firedFrames = 0;
    let maxYaw = 0;
    for (let i = 0; i < 480; i++) {
      h.tick(1 / 60);
      if (h.mission.gunFiring) firedFrames++;
      maxYaw = Math.max(maxYaw, Math.abs(h.aircraft.anim.gunYaw));
    }
    return {
      firedFrames,
      maxYaw: +maxYaw.toFixed(3),
      defenseState: h.defense.state,
      openBeat: h.dialogue.seen('defense.gunner.open'),
      readyBeat: h.dialogue.seen('defense.gunner.on'),
    };
  });
  check('the Shubenator works the rear gun for real during the defence phase, in bursts',
    gunnerOrganic.firedFrames > 30 && gunnerOrganic.firedFrames < 460
      && gunnerOrganic.openBeat && gunnerOrganic.maxYaw > 0.01,
    JSON.stringify(gunnerOrganic));

  check('Defense\'s damage API flips real state, damages the engine, and plays the hit beat without crashing',
    defenseDamage.damage.engines[0] === true && defenseDamage.damage.rudder
      && defenseDamage.damage.electrical && defenseDamage.damage.fuel
      && defenseDamage.engineHealthDropped && defenseDamage.sawHitLine
      && defenseDamage.phase === 'defense',
    JSON.stringify(defenseDamage));

  /* ================================================================
   * The 2026-08-04 escalation pass: night fighters, the autopilot, the tail
   * gun the player mans, and the refined flak. All of it exercised HERE,
   * mid-mission, with the aeroplane actually flying over the target — the
   * checkpoint restore at `go('bombApproach')` below wipes every bit of it
   * again, so nothing set up in this block leaks into the bombing run.
   * ================================================================ */

  /* ---- The flak, refined (owner: "let's really refine that") ---- */
  const flak = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const d = h.defense;
    const before = { bursts: d.burstsFired, near: d.nearMisses };
    /* FOR SHOW (owner, 2026-08-06). Everything the barrage DOES to the
     * aeroplane is sampled either side of thirty seconds of real shooting, so
     * the check below can say the show ran and the bill did not. */
    const costBefore = {
      wing: h.physics.damage.wing,
      hits: d.hitCount,
      engines: d.damage.engines.filter(Boolean).length,
      rudder: d.damage.rudder, electrical: d.damage.electrical, fuel: d.damage.fuel,
    };
    // Straight and level: the predictor is supposed to get the range.
    const bursts = [];
    d.onFlakBurst = (dist, point, severity) => bursts.push({ dist: Math.round(dist), severity: +severity.toFixed(2) });
    let elevated = 0;
    for (let i = 0; i < 60 * 30; i++) {
      h.tick(1 / 60);
      // Sampled across the run, not at one instant: which batteries are in
      // range of the aeroplane changes as it crosses the target.
      if (i % 30 === 0) {
        elevated = Math.max(elevated, d.batteries.filter((b) => b.pitch > 0.05).length);
      }
    }
    const settled = d.trackQuality;
    // Now throw it about and watch the solution fall apart.
    let heading = h.physics.headingDeg;
    for (let i = 0; i < 60 * 6; i++) {
      h.input.key(i % 120 < 60 ? 'KeyA' : 'KeyD', true);
      h.tick(1 / 60);
      h.input.key('KeyA', false);
      h.input.key('KeyD', false);
    }
    const jinked = d.trackQuality;
    /* One controlled spent puff: the visual should leave a black flower, then
     * recycle before it becomes a stationary circle left in the sky. */
    const quietPoint = h.physics.position.clone().add({ x: 0, y: 400, z: 0 });
    d._burst(quietPoint, h.physics.position);
    const puffsBeforeRecycle = d._activeFlak.length;
    d._updateFlak(6);
    const puffsAfterSixSeconds = d._activeFlak.length;
    void heading;
    return {
      batteries: d.batteries.length,
      gunsPerBattery: d.batteries[0]?.guns.length ?? 0,
      elevated,
      shellsSeen: d.burstsFired - before.bursts,
      bursts: bursts.length,
      nearMissesSeen: d.nearMisses - before.near,
      closest: bursts.length ? Math.min(...bursts.map((b) => b.dist)) : null,
      settled: +settled.toFixed(2),
      jinked: +jinked.toFixed(2),
      intensity: +d.intensity.toFixed(2),
      liveFire: d.liveFire,
      puffsBeforeRecycle,
      puffsAfterSixSeconds,
      cost: {
        wing: +(h.physics.damage.wing - costBefore.wing).toFixed(4),
        hits: d.hitCount - costBefore.hits,
        engines: d.damage.engines.filter(Boolean).length - costBefore.engines,
        newRudder: d.damage.rudder !== costBefore.rudder,
        newElectrical: d.damage.electrical !== costBefore.electrical,
        newFuel: d.damage.fuel !== costBefore.fuel,
      },
    };
  });
  check('the flak is a battery problem now: real guns, real salvos, and a predictor that can be beaten',
    flak.batteries >= 6 && flak.gunsPerBattery === 4 && flak.elevated > 0
      && flak.shellsSeen > 12 && flak.bursts > 4
      && flak.settled > 0.7 && flak.jinked < flak.settled,
    JSON.stringify(flak));

  check('a burst that goes off near the aeroplane is reported with its real distance',
    flak.closest !== null && flak.closest < 900,
    `closest burst reported at ${flak.closest} m of ${flak.bursts} heard`);

  check('spent flak puffs recycle instead of remaining as black circles in the sky',
    flak.puffsBeforeRecycle > 0 && flak.puffsAfterSixSeconds === 0,
    JSON.stringify({ before: flak.puffsBeforeRecycle, after: flak.puffsAfterSixSeconds }));

  /* ---- FOR SHOW: the barrage is scenery you fly through, not a fight you
   * lose. Owner, 2026-08-06: "I take too much of a beating on the fly in,
   * theres really no targets to shoot out. Lets just have all the flak and
   * fighters for show." The check is deliberately both halves at once — thirty
   * seconds of real salvos, real bursts and real near misses (measured above),
   * and not one thing off the aeroplane. ---- */
  check('the flak is for show: the whole barrage still happens and none of it costs the aeroplane anything',
    flak.liveFire === false
      && flak.shellsSeen > 12 && flak.bursts > 4 && flak.nearMissesSeen > 0
      && flak.cost.wing === 0 && flak.cost.hits === 0 && flak.cost.engines === 0
      && !flak.cost.newRudder && !flak.cost.newElectrical && !flak.cost.newFuel,
    `${flak.shellsSeen} shells, ${flak.bursts} bursts heard, ${flak.nearMissesSeen} near misses, `
    + `cost ${JSON.stringify(flak.cost)}`);

  /* ---- Night fighters (owner: "not too hard not too easy... they try and
   * shoot you down") ---- */
  const fighters = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.spawnFighters(3, 0);
    const states = new Set();
    // FOR SHOW, the air half: what two minutes of firing passes costs.
    const costBefore = {
      wing: h.physics.damage.wing,
      hits: h.defense.hitCount,
      engines: h.defense.damage.engines.filter(Boolean).length,
    };
    let maxEngaged = 0;
    let calledOut = false;
    for (let i = 0; i < 60 * 120; i++) {
      h.tick(1 / 60);
      const f = h.state().fighters;
      f.states.forEach((s) => states.add(s));
      maxEngaged = Math.max(maxEngaged, f.engaged);
      if (h.dialogue.seen('fighters.first')) calledOut = true;
      if (states.has('attack') && maxEngaged > 0 && f.roundsAtUs > 60) break;
    }
    const f = h.state().fighters;
    return {
      count: f.active,
      states: [...states].sort(),
      maxEngaged,
      roundsAtUs: f.roundsAtUs,
      hitsTaken: f.hitsTaken,
      calledOut,
      warned: [...(h.flightHud._warnState || [])].includes('fighters'),
      liveFire: h.liveFire.fighters,
      barked: h.dialogue.seen('fighters.first'),
      cost: {
        wing: +(h.physics.damage.wing - costBefore.wing).toFixed(4),
        hits: h.defense.hitCount - costBefore.hits,
        engines: h.defense.damage.engines.filter(Boolean).length - costBefore.engines,
      },
    };
  });
  check('the fighters hunt: they set up, commit, make a firing pass and are called out on the intercom',
    fighters.count > 0 && fighters.states.includes('attack')
      && fighters.maxEngaged >= 1 && fighters.maxEngaged <= 2
      && fighters.roundsAtUs > 40 && fighters.calledOut && fighters.warned,
    JSON.stringify(fighters));

  /* ---- FOR SHOW, the air half. They still come, still commit, still fire and
   * are still called out — and their rounds no longer take anything off the
   * aeroplane. `hitsTaken` is deliberately allowed to be non-zero: the rounds
   * still CONNECT and are still heard and felt, which is the show; only the
   * damage the mission's `onFighterHit` used to apply is gone. ---- */
  check('the fighters are for show too: the passes and the hits still land, the damage does not',
    fighters.liveFire === false && fighters.roundsAtUs > 40 && fighters.barked
      && fighters.cost.wing === 0 && fighters.cost.hits === 0 && fighters.cost.engines === 0,
    `${fighters.roundsAtUs} rounds at us, ${fighters.hitsTaken} of them on, `
    + `cost ${JSON.stringify(fighters.cost)}`);

  const fightersBreak = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const seen = new Set();
    for (let i = 0; i < 60 * 90; i++) {
      h.tick(1 / 60);
      h.state().fighters.states.forEach((s) => seen.add(s));
      if (seen.has('breakoff') && seen.has('reposition')) break;
    }
    return { states: [...seen].sort() };
  });
  check('a fighter breaks off across the tail and comes round for another pass',
    fightersBreak.states.includes('breakoff') && fightersBreak.states.includes('reposition'),
    JSON.stringify(fightersBreak));

  /* ---- The autopilot, and what it costs ----
   *
   * The HOLD is measured with the battery paused and the sky empty, because
   * that is the only way to measure a control law: with flak bursting and two
   * fighters making passes, the autopilot is correctly thrown off every few
   * seconds (`onShrapnel` and `onFighterHit` both kick it, on purpose), and a
   * test that cannot tell "it cannot hold a heading" from "it was shot off the
   * heading" is not testing anything. The TRADE is measured separately, below,
   * with everything switched back on. */
  const autopilot = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const wasDeployed = h.defense.deployed;
    h.defense.deployed = false;                 // pause the battery
    h.interceptors.clear();                     // and empty the sky
    /* And keep it empty. `updateDefensePhase` re-scrambles a wave the moment
     * it notices there are fewer than three fighters up, which is exactly what
     * it should do in a game and exactly what makes a control-law measurement
     * meaningless — the first run of this check reported a 245 m altitude
     * wander that turned out to be the aeroplane flying itself into the
     * ground AFTER a fighter had shot the autopilot off at the twelve-second
     * mark. One method stubbed, for one block, restored below. */
    const realScramble = h.mission.scrambleFighters;
    h.mission.scrambleFighters = () => false;
    /* And four working engines. The damage-API check above deliberately put
     * engine one out, and an autopilot with `PITCH_LIMIT` of authority
     * genuinely CANNOT hold an altitude on a heavy bomber that is down an
     * engine — measured here at about five metres a second of sink, which is
     * the "limited authority" the system is designed to have and not a fault.
     * That case belongs to the flying, not to the control law, so the law is
     * measured on an aeroplane that is not already broken. */
    h.engines.reset(false);
    h.engines.forceRunning();
    /* AND THE REST OF THE AEROPLANE, which healing the engines alone missed.
     *
     * The same damage-API check put the RUDDER out, killed the ELECTRICS and
     * opened a FUEL leak, and three fighter passes had put real damage into
     * the wing. All of that was still on the aeroplane while this measured
     * "can the control law hold an altitude", and all of it is exactly the
     * limited authority the autopilot is designed to lose to. Healing one of
     * the four and leaving three was the reason the number never made sense:
     * on a fresh airframe at the same altitudes the law holds to between 0.2
     * and 1.5 metres at a predictability of 0.98, measured across six
     * altitudes from 56 m of terrain clearance to 958 m. Same law, same tick.
     * The difference was entirely the state of the aeroplane. */
    for (let i = 0; i < 4; i++) h.mission.defense.damage.engines[i] = false;
    h.mission.defense.damage.rudder = false;
    h.mission.defense.damage.electrical = false;
    h.mission.defense.damage.fuel = false;
    h.mission.defense.damage.catastrophic = false;
    h.physics.damage.wing = 0;
    h.physics.damage.tail = 0;
    /* Somewhere real. By this point the aeroplane has flown four minutes of
     * unattended headless flight through a barrage and three fighter passes,
     * and it is wherever physics left it — which is quite often a spiral into
     * the ground. `engage()` correctly refuses an aeroplane that is on the
     * deck, on its side or below its stall, so the pose is staged the same way
     * every other leg of this script stages the one it means to test. */
    const at = h.physics.position.clone();
    /* AND WITH ROOM TO RUN — the same lesson the tail-gun block below already
     * paid for, arrived at from the other end.
     *
     * This was the LAST cause of a check that had never once been seen to
     * pass. Measured with the instrumentation this comment replaces: `took`
     * was true, the control law held heading to 0.0 degrees and altitude to a
     * single metre for the whole window — and at the forty-fifth second the
     * check reported `engaged: false`, `reason: null` and 225 m of drift.
     *
     * `reason: null` is the tell. Every way the AEROPLANE takes the autopilot
     * away passes a reason string and starts a lockout (`Autopilot.disengage`);
     * null is reserved for a hand-back the PLAYER asked for. Nobody asked. The
     * caller was `MissionController.fail()`, which disengages with null on its
     * way out — and the reason it fired was `You have left the area the map
     * covers`: by the time this block runs, the script has flown four unbroken
     * minutes of eastbound flight through the corridor, the barrage, two
     * minutes of fighter passes and a breakoff pass, and the aeroplane is out
     * past x = 19,000 with the map ending at 13,400 (`updateFlightCommon`).
     * The block then staged its measurement wherever that had left it and flew
     * another three kilometres in the same direction. The drift it printed was
     * a bomber nosing over unattended after the mission had already ended.
     *
     * That is the MISSION behaving correctly and the TEST flying out of the
     * world, exactly as it was for the turret. So the window starts from a
     * known place with the whole map ahead of it: x = 3200, heading 090, about
     * 3.1 km covered in the 46.5 s of flight below, ending near x = 6300 with
     * seven kilometres of margin. The phase at this point is `release` parked
     * on `awaitChoice`, which has no distance gate of its own, so nothing else
     * moves underneath the measurement — and `failed`/`endedAtX` are reported
     * either way, so if this ever runs out of room again it says so instead of
     * blaming the control law. */
    at.x = 3200;
    at.y = h.groundHeight(at.x, at.z) + 620;
    /* AND HIGH ENOUGH NOT TO FLY INTO A HILL.
     *
     * This is the one that was actually failing, and it was never the
     * autopilot. Measured second by second in still air, the control law holds
     * the altitude to between one and five metres with a predictability of
     * 0.98 — it is very good. Then, at about forty-five seconds, it disengaged
     * with the reason "on the ground", at five hundred metres, undamaged, at
     * cruise speed, and the aeroplane nosed over and dived three hundred and
     * fifty metres into the deck.
     *
     * Because it WAS flying into the ground. An autopilot holds an ALTITUDE;
     * the eastbound route climbs. Over the three kilometres the aeroplane
     * covers in this window the terrain goes from 153 m to 481 m, so the
     * clearance falls from 371 m to 45 m and then the hill arrives. The check
     * was flying a bomber into a mountain and reporting it as a control law
     * that could not hold an altitude — and the drift it printed was really a
     * measure of how far down the dive the forty-fifth second happened to
     * land, which is why it read 52.6 m one run and 92.6 m the next.
     *
     * So it is flown with real terrain clearance now. That is what this check
     * claims to measure and it is the only thing it measures. The behaviour it
     * found is real, and it belongs to the mission rather than to this file —
     * see `docs/FUTURE-EDITS.md`, "the autopilot has no idea the ground is
     * coming up".
     *
     * Note WHERE the ground is measured. The line above asks for the ground
     * the aeroplane is standing over RIGHT NOW, and at sixty-five metres a
     * second it is not over that ground for long: `+ 620` meant 620 m of
     * clearance at the start and 45 m of it three kilometres later. So the
     * clearance is struck from the highest ground along the whole run. */
    let highest = 0;
    for (let dx = 0; dx <= 3600; dx += 150) {
      highest = Math.max(highest, h.groundHeight(at.x + dx, at.z));
    }
    at.y = Math.max(at.y, highest + 620);
    h.physics.setPose(at, 90, 66);
    h.physics.omega.set(0, 0, 0);
    h.input.throttle = 0.7;
    /* And take the shooting away for the measurement window.
     *
     * This check is about the CONTROL LAW — can it hold a heading and an
     * altitude — which is why the engines are healed above. Leaving the
     * batteries and the fighters live measured something else entirely: they
     * pick their moments with Math.random(), so a wave that commits inside the
     * 45 s damages the aeroplane, it sinks, and both the drift and the
     * settledness the law reports are really a report on how the dice fell.
     * Observed across runs of the same deterministic tick: 52.6 m and 0.75
     * one time, 92.6 m and 0.31 another. Restored immediately after, so the
     * checks below still meet a live battlefield. */
    h.interceptors.clear();
    h.defense.suppress();
    /* AND THE AIR, for the same reason and with more of the blame.
     *
     * Clearing the shooting above was the right instinct and it did not fix
     * this: the check still swung between 52.6 m and 92.6 m on identical
     * ticks. The remaining source is not the dice the fighters roll, it is
     * `src/beefrun/weather.js`, which seeds `_gustPhase` with three
     * `Math.random()` calls IN ITS CONSTRUCTOR — so the gust field is a
     * different function of time on every page load, and a forty-five-second
     * altitude hold is measured against different weather every run. The
     * heading drift stayed at 0.4 degrees throughout, which is the tell: the
     * control law was never the thing varying.
     *
     * So the window is still air. That is what "can it hold an altitude"
     * means, and holding one in a gust that only exists on some runs is not a
     * check, it is a coin. Restored immediately after, so everything below
     * still meets real weather.
     *
     * Since then WeatherSystem grew a seed and this page is loaded with
     * `?airSeed=1945`, so "real weather" below is now the SAME real weather
     * every run. Still air here stays: this window measures the control law
     * in isolation, seeded or not. */
    const airBefore = { turbulence: h.weather.turbulence, crosswind: h.weather.crosswind };
    h.weather.setConditions({ turbulence: 0, crosswind: 0 });
    h.tick(1.5);

    const heading = h.physics.headingDeg;
    const altitude = h.physics.position.y;
    const preflightState = {
      onGround: h.physics.onGround,
      tas: +h.physics.tas.toFixed(1),
      roll: +h.physics.rollDeg.toFixed(1),
      pitch: +h.physics.pitchDeg.toFixed(1),
      stallT: +h.physics.stallT.toFixed(2),
      lockout: +h.autopilot.lockout.toFixed(2),
      alreadyEngaged: h.autopilot.engaged,
    };
    const startedAtX = Math.round(h.physics.position.x);
    const phaseAtStart = h.mission.phase;
    const failedAtStart = h.mission.failed;
    const took = h.autopilotToggle();
    h.tick(45);
    const held = {
      took,
      preflightState,
      /* WHAT ELSE HAPPENED IN THE 45 s. `failed` is the one that matters: the
       * mission ending mid-window is what a `reason: null` disengage means, and
       * without these three the check reported it as a control law that could
       * not hold an altitude. See the ROOM TO RUN note above. */
      startedAtX,
      endedAtX: Math.round(h.physics.position.x),
      phase: `${phaseAtStart} -> ${h.mission.phase}`,
      phaseHeld: h.mission.phase === phaseAtStart,
      failed: h.mission.failed,
      failedDuringWindow: !!h.mission.failed && !failedAtStart,
      engaged: h.autopilot.engaged,
      reason: h.autopilot.reason,
      headingDrift: +Math.abs(((h.physics.headingDeg - heading + 540) % 360) - 180).toFixed(2),
      altitudeDrift: +Math.abs(h.physics.position.y - altitude).toFixed(1),
      predictability: +h.autopilot.predictability.toFixed(2),
      fighterPredictability: +h.interceptors._predictability.toFixed(2),
      readout: h.autopilot.readout(),
      strip: document.getElementById('enola-autopilot')?.style.display,
    };
    h.weather.setConditions(airBefore);
    h.defense.intensity = 1;

    // And the aeroplane takes itself back when something hits it.
    h.mission.autopilot.disengage('blast wave');
    const kicked = { engaged: h.autopilot.engaged, lockout: h.autopilot.lockout > 0 };
    const refused = h.autopilotToggle();
    h.tick(4);
    const after = h.autopilotToggle();
    h.defense.deployed = wasDeployed;
    h.mission.scrambleFighters = realScramble;
    return { held, kicked, refused, after };
  });
  /* The drift bounds are the ones this law was always held to (4 degrees, 60
   * metres). They are not the interesting half any more: with the window given
   * room to run, the measured numbers are 0.0 degrees and about a metre. What
   * is added is `failed` — the state the window is measured IN — because a
   * check that cannot tell "it could not hold an altitude" from "the mission
   * ended underneath it" is the check that hid this for two sessions.
   *
   * `phaseHeld` is REPORTED but deliberately not asserted. Which phase the
   * script happens to be in when it reaches this block depends on how early the
   * fighter blocks above break out of their own loops, and one of the
   * candidates (`bombMalfunction`) advances on an eight-second timer of its
   * own — asserting the phase never moved would make this check fail for a
   * reason that has nothing to do with the control law, which is the exact
   * mistake being corrected here. If a transition ever does take the aeroplane
   * away, `engaged` catches it and the transition is printed alongside. */
  check('the autopilot really holds a heading and an altitude while nobody is in the seat',
    autopilot.held.took && autopilot.held.engaged
      && !autopilot.held.failed
      && autopilot.held.headingDrift < 4 && autopilot.held.altitudeDrift < 60
      && autopilot.held.readout && autopilot.held.strip === 'block',
    JSON.stringify(autopilot.held));

  check('and it is not free: flying itself makes the aeroplane a measurably easier target',
    autopilot.held.predictability > 0.6
      && Math.abs(autopilot.held.fighterPredictability - autopilot.held.predictability) < 0.25,
    `predictability ${autopilot.held.predictability}, and the fighters are reading ${autopilot.held.fighterPredictability}`);

  check('a hit throws the autopilot off and it will not take the aeroplane straight back',
    autopilot.kicked.engaged === false && autopilot.kicked.lockout
      && autopilot.refused === false && autopilot.after === true,
    JSON.stringify({ kicked: autopilot.kicked, refusedDuringLockout: autopilot.refused, afterLockout: autopilot.after }));

  /* ---- The gyro's AGL floor ----
   *
   * The defect the flaky-autopilot investigation actually found: the gyro
   * holds an ALTITUDE, the eastbound route CLIMBS, and the first warning used
   * to be the autopilot leaving — "on the ground", at cruise, with the player
   * in the tail turret the mission had just invited him into. The fix is a
   * warning, deliberately not a control change: under the floor the TERRAIN
   * lamp goes red and the crew call it out, and the aeroplane still does
   * exactly what it was told. */
  const terrainFloor = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    /* Level flight with clearance under the floor — the profile the
     * descending-only terrain check can never fire on (vspeed ~ 0). Shooting
     * and flak are stilled so the 1.5 s window measures the floor and not a
     * lucky hit knocking the gyro off; both are restored by the next block,
     * which stages its own battlefield. */
    h.interceptors.clear();
    h.defense.suppress();
    const at = h.physics.position.clone();
    at.y = h.groundHeight(at.x, at.z) + 180;
    h.physics.setPose(at, 90, 66);
    h.physics.omega.set(0, 0, 0);
    h.input.throttle = 0.7;
    if (!h.autopilot.engaged) h.autopilotToggle();
    const engagedBefore = h.autopilot.engaged;
    const altitudeBefore = h.physics.position.y;
    const barked = [];
    const dialogue = h.mission.dialogue;
    const realBark = dialogue.bark.bind(dialogue);
    dialogue.bark = (pool, opts) => {
      barked.push(pool);
      return realBark(pool, opts);
    };
    h.tick(1.5);
    dialogue.bark = realBark;
    h.defense.intensity = 1;
    return {
      engagedBefore,
      engagedAfter: h.autopilot.engaged,
      climbed: +(h.physics.position.y - altitudeBefore).toFixed(1),
      agl: +h.physics.agl.toFixed(0),
      lampUp: [...(h.flightHud._warnState || [])].includes('terrain'),
      calledOut: barked.includes('terrainClose'),
    };
  });
  check('the gyro calls the rising ground BEFORE it arrives: red TERRAIN lamp and the crew callout under the AGL floor, and no quiet climb',
    terrainFloor.engagedBefore && terrainFloor.lampUp && terrainFloor.calledOut
      && terrainFloor.engagedAfter && Math.abs(terrainFloor.climbed) < 40,
    JSON.stringify(terrainFloor));

  /* ---- The tail gun, manned by the player, ON THE LEG HOME ----
   *
   * Real fighters, real rounds, and a real hit test through the turret's own
   * arc — `aimGunAt` goes through `GunnerStation.pointAt()`, which clamps to
   * exactly the stops a player has, so a fighter that can only be reached from
   * outside the traverse is reported as out of arc rather than quietly hit.
   *
   * WHICH LEG THIS IS, AND WHY IT MOVED. Owner playtest, 2026-08-19:
   *
   *   *"Outbound: player stays pilot. NO tail-gunner takeover at all. Return
   *   (after the bomb drops): enemy aircraft arrive, Capt Sasole takes the
   *   flying ('Plane's mine, you go shoot'), prompt T — TAKE OVER TAIL GUN
   *   prominently."*
   *
   * `MissionController.toggleGun()` enforces exactly that now: it refuses
   * outright until `offerTailGun()` has run, and `offerTailGun()` is called by
   * `updateReturn` when the first wave of `RETURN_WAVES` arrives. This block
   * used to stage the turret mid-raid, over the target, on the outbound leg —
   * the leg the owner asked to have it taken OFF — so with the new rule in
   * place `gunToggle()` correctly did nothing and four checks in a row reported
   * that the turret was broken.
   *
   * So the whole thing is staged where the toy now lives, and the refusal is
   * asserted rather than worked around: T is pressed once BEFORE the offer (it
   * must do nothing and must leave the player in the seat), then the mission is
   * put on the leg home and left alone until Sasole makes the offer himself.
   * Nothing here calls `offerTailGun()` by hand — the check would then prove
   * only that the method exists. */
  const gunnery = await page.evaluate(async () => {
    const h = window.__enolaSquatch;
    const { TAKE_BLEND_SECONDS } = await import('/src/enolasquatch/systems/GunnerStation.js');

    /* THE FIRST HALF OF THE OWNER'S NOTE. The mission is still outbound here —
     * `release`, holding on the bomb-line choice — so T must be refused and the
     * player must still be flying. */
    const outbound = {
      phase: h.mission.phase,
      offered: h.mission.gunOffered,
      took: h.gunToggle(),
      manned: h.gunner.manned,
    };

    /* And now the leg home. `setPhase` rather than `go('return')`: `go` routes
     * through `restoreCheckpoint('return')`, which would re-pose and re-weather
     * the aeroplane out from under the staging below and rewrite the score. The
     * checkpoint bookkeeping `setPhase('return')` does IS a side effect that
     * would leak — the restart block much further down needs `preRelease` and
     * its saved data — so it is put back at the end of this block, the same way
     * the battery and the fighter scramble are put back by the autopilot block
     * above. */
    const keepCheckpoint = { name: h.mission.checkpoint, data: h.mission.checkpointData };
    h.mission.setPhase('return');

    const at = h.physics.position.clone();
    /* ROOM TO RUN. This block flies unattended for up to two minutes while the
     * player works the turret, and a healthy Enola Squatch covers the better
     * part of eight kilometres doing it. It used to start from wherever the
     * flak block had left the aeroplane and get away with it for a reason that
     * has now been deliberately removed: the barrage used to shoot two engines
     * out and put the wing damage at its limit, so the cripple never got very
     * far. With the guns firing blanks (`LIVE_FIRE`, src/enolasquatch/
     * config.js) and ten per cent more thrust, it flew straight past the map's
     * eastern bound (`updateFlightCommon`'s ±13.4 km), the mission correctly
     * failed, `fail()` took the player off the gun, and the turret test found
     * itself testing nothing.
     *
     * The leg home runs the other way — `RETURN_HEADING` is 270 — so "room to
     * run" is now room to the WEST: eleven kilometres out, with the field at
     * x 0 and `updateReturn` handing off to the approach at x 1600. Measured,
     * the whole sequence (ten seconds to the first wave, six to let it close,
     * and a kill inside about three hundred passes) covers roughly 2.7 km, so
     * this leaves seven kilometres of margin at both ends — and `ranOutOfMap`
     * and `leftTheLeg` say so if either end is ever reached anyway. */
    at.x = 11000;
    let highest = 0;
    for (let dx = 0; dx <= 9000; dx += 150) {
      highest = Math.max(highest, h.groundHeight(at.x - dx, at.z));
    }
    at.y = highest + 620;
    h.physics.setPose(at, 270, 66);
    h.physics.omega.set(0, 0, 0);
    h.input.throttle = 0.7;

    /* "Plane's mine, you go shoot." Waited for, not called: `RETURN_WAVES[0]`
     * is at ten seconds and `updateReturn` is what turns the offer on. */
    let offerWait = 0;
    while (!h.mission.gunOffered && offerWait < 40) {
      h.tick(0.5);
      offerWait += 0.5;
    }
    const offer = {
      gunOffered: h.mission.gunOffered,
      inSeconds: offerWait,
      waveIndex: h.mission._waveIndex,
      // He is flying it, so the gyro really is flying it, before T is touched.
      sasoleFlying: h.autopilot.engaged,
      beat: h.dialogue.seen('fighters.sasoleTakesIt'),
    };

    if (h.state().fighters.active === 0) h.spawnFighters(2, 0);
    h.tick(6);

    const before = { autopilot: h.autopilot.engaged };
    const took = h.gunToggle();
    /* THE CAMERA TRAVELS, IT DOES NOT CUT. Owner playtest, 2026-08-19: "camera
     * transitions to the rear gun". `GunnerStation.take()` starts a
     * `TAKE_BLEND_SECONDS` ease from wherever the view was, so this asserts
     * both halves of that — one frame after T the view is still up the
     * fuselage, and a blend later it is on the gunner's eye. The old check read
     * the camera one frame after T and expected it to be in the turret already,
     * which was true of the teleport this replaced and is now the description
     * of a bug. Anchored on the module's own exported constant so a retune of
     * the swoop cannot quietly turn this back into a teleport test. */
    const eyeAtTake = h.aircraft.rearGunEyeWorld();
    const camTravelling = h.camera.position.distanceTo(eyeAtTake) > 0.05;
    h.tick(TAKE_BLEND_SECONDS + 1 / 60);
    const eye = h.aircraft.rearGunEyeWorld();
    const camAtTurret = h.camera.position.distanceTo(eye) < 0.05;
    const hudUp = document.getElementById('enola-combat')?.style.display;
    // While the player has it, the mission's own gunner state follows the
    // player's trigger and not the Shubenator's burst timer.
    const shubesQuiet = h.mission.gunFiring === h.gunner.firing;

    let killed = 0;
    let shots = 0;
    let inArc = false;
    let closest = Infinity;
    let ranOutOfMap = false;
    let leftTheLeg = false;
    for (let pass = 0; pass < 1600 && killed === 0; pass++) {
      /* If the stress test ever does reach the edge again, SAY SO. A silent
       * `fail()` mid-loop takes the player off the gun and every assertion
       * below then reports "the turret does not work", which is a diagnosis of
       * the wrong system entirely — it cost an hour once. `leftTheLeg` is the
       * western half of the same tell: reaching the circuit hands off to
       * `landing`, which takes the player off the gun on purpose. */
      if (Math.abs(h.physics.position.x) > 12800 || h.mission.failed) {
        ranOutOfMap = true;
        break;
      }
      if (h.mission.phase !== 'return') {
        leftTheLeg = true;
        break;
      }
      const live = h.interceptors.fighters.filter((f) => f.alive);
      if (!live.length) break;
      live.sort((a, b) => a.position.distanceTo(h.physics.position) - b.position.distanceTo(h.physics.position));
      const t = live[0];
      const range = t.position.distanceTo(h.physics.position);
      closest = Math.min(closest, range);
      // Lead it the way a gunner has to: the round takes time to get there.
      const aim = t.position.clone().addScaledVector(t.velocity, range / 860);
      const r = h.aimGunAt(aim.x, aim.y, aim.z);
      inArc = inArc || r.inArc;
      if (r.inArc && range < 1200) {
        h.gunner.setFiring(true);
        h.tick(3 / 60);
        h.gunner.setFiring(false);
      } else {
        h.tick(5 / 60);
      }
      shots = h.gunner.shots;
      killed = h.gunner.kills;
    }
    const state = h.gunner.readout();
    const autopilotBefore = h.autopilot.engaged;
    const left = h.gunToggle();
    /* The one leak this block would otherwise leave behind — see the note on
     * `keepCheckpoint` above. Everything else it touched (the phase, the pose,
     * the fighters) is either restaged or cleared by the `go()` that follows. */
    h.mission.checkpoint = keepCheckpoint.name;
    h.mission.checkpointData = keepCheckpoint.data;
    return {
      outbound, offer, took, before, camTravelling, camAtTurret, inArc, shots, killed,
      closest: Math.round(closest),
      belt: state.rounds, heat: +state.heat.toFixed(2),
      hits: state.hits, hudUp, shubesQuiet,
      leftGun: left === false, backInSeat: h.gunner.manned === false,
      autopilotBefore, autopilotAfter: h.autopilot.engaged,
      hudDown: document.getElementById('enola-combat')?.style.display,
      ranOutOfMap, leftTheLeg,
      endedAtX: Math.round(h.physics.position.x), phase: h.mission.phase,
      failed: h.mission.failed,
    };
  });
  /* Both halves of the owner's rule in one check, because they are one rule:
   * outbound the tail gun is not on offer at all, and on the leg home Sasole
   * offers it, takes the flying himself, and T then really does put the player
   * down the back with the trigger in his hands and the Shubenator off it. */
  check('taking the tail gun puts the player in the turret, engages the autopilot, and hands Shubes off the trigger',
    gunnery.outbound.took === false && gunnery.outbound.manned === false
      && gunnery.offer.gunOffered && gunnery.offer.sasoleFlying && gunnery.offer.beat
      && gunnery.took && gunnery.camTravelling && gunnery.camAtTurret
      && gunnery.shubesQuiet && gunnery.hudUp === 'block',
    JSON.stringify({ ...gunnery, shots: undefined, killed: undefined }));

  check('the player can actually shoot a night fighter down from the tail',
    gunnery.inArc && gunnery.shots > 0 && gunnery.killed > 0 && gunnery.belt < 1400
      && !gunnery.ranOutOfMap && !gunnery.leftTheLeg,
    `${gunnery.shots} rounds away, ${gunnery.hits} on, ${gunnery.killed} destroyed, `
    + `${gunnery.belt} left in the belt; closest pass ${gunnery.closest} m; `
    + `ended at x ${gunnery.endedAtX}${gunnery.ranOutOfMap ? ' — RAN OUT OF MAP' : ''}`
    + `${gunnery.leftTheLeg ? ' — REACHED THE CIRCUIT' : ''}`);

  /* ---- E2: returning to the pilot seat disengages the autopilot automatically ----
   *
   * Owner playtest, 2026-08-06: "When the player returns to the pilot seat,
   * autopilot should disengage automatically." Taking the tail gun requires
   * the autopilot (`toggleGun()`), and since 2026-08-19 `offerTailGun()` has
   * already engaged it before T is even available — Sasole takes the flying as
   * part of the offer — so `gunnery.autopilotBefore` is true here either way;
   * coming back forward (`leaveGun()`, ../src/enolasquatch/
   * mission/MissionController.js) now gives the aeroplane back the same way
   * the `P` key would -- this used to read "does not change who is flying",
   * which was the bug the owner hit, not a feature. */
  check('coming forward again gives the gun back and disengages the autopilot automatically',
    gunnery.leftGun && gunnery.backInSeat && gunnery.hudDown === 'none'
      && gunnery.autopilotBefore === true && gunnery.autopilotAfter === false,
    JSON.stringify({
      leftGun: gunnery.leftGun,
      backInSeat: gunnery.backInSeat,
      autopilot: `${gunnery.autopilotBefore} -> ${gunnery.autopilotAfter}`,
    }));

  /* ---- E2, isolated: a minimal, synthetic seat re-entry (no fighters, no
   * gunnery loop) so a regression here reads as exactly what broke, and pins
   * that the disengage uses the SAME cue the scene already plays for a
   * player-requested hand-back (`auto.off`, not `auto.kicked` -- nothing
   * forced this) and the same predictability reset the fighters read.
   *
   * Deliberately run straight after the block above and NOT restaged: it rides
   * on the leg home that block left the mission on, which is the only leg where
   * `toggleGun()` will take T at all now (`gunOffered`, set by
   * `offerTailGun()`). Restaging it anywhere else is how this check reads as
   * "the turret is broken" when what is actually being tested is a T press on
   * the outbound leg, where the owner asked for it to do nothing. ---- */
  const seatSwitch = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const m = h.mission;
    h.physics.setPose(h.physics.position.clone(), h.physics.headingDeg, 66);
    h.physics.omega.set(0, 0, 0);
    m.autopilot.disengage(null);
    m.autopilot.lockout = 0;
    if (m.gunner.manned) m.leaveGun();
    // Forget both cues, not just the one this test expects -- 'auto.kicked'
    // was already played earlier in this run (the blast-wave disengage
    // above), and `seen()` reads all of dialogue history, not just what this
    // block does. Without this the assertion below is testing stale state.
    h.dialogue.forget('auto.off', 'auto.kicked');
    h.interceptors.setPredictability(0.77); // a nonzero value the reset has to actually change
    // `setPose()` writes velocity/position but `tas` is only recomputed by
    // `AircraftPhysics.advance()` -- tick once so `engage()` (inside the
    // gunToggle below) reads a live airspeed rather than whatever `tas` was
    // before this synthetic re-pose.
    h.tick(1 / 60, 1 / 60);
    const took = h.gunToggle();            // T -- into the turret; requires+engages the autopilot
    const engagedInTurret = m.autopilot.engaged;
    const manningTurret = m.gunner.manned;
    const left = h.gunToggle();            // T -- back to the pilot's seat
    h.tick(1 / 60);
    return {
      took, engagedInTurret, manningTurret, left,
      manned: m.gunner.manned,
      autopilotEngaged: m.autopilot.engaged,
      autopilotReason: m.autopilot.reason,
      autoOffPlayed: h.dialogue.seen('auto.off'),
      autoKickedPlayed: h.dialogue.seen('auto.kicked'),
      fighterPredictability: h.interceptors._predictability,
      // The leg this is legal on, and the flag that makes it legal.
      phase: m.phase,
      gunOffered: m.gunOffered,
    };
  });
  check('a synthetic seat re-entry (T, T) leaves the autopilot state false, with the player-hand-back cue, not the forced-kick one',
    seatSwitch.phase === 'return' && seatSwitch.gunOffered
      && seatSwitch.took && seatSwitch.engagedInTurret && seatSwitch.manningTurret
      && seatSwitch.left === false && seatSwitch.manned === false
      && seatSwitch.autopilotEngaged === false && seatSwitch.autoOffPlayed
      && !seatSwitch.autoKickedPlayed && seatSwitch.fighterPredictability === 0,
    JSON.stringify(seatSwitch));

  /* ---- The HUD instruction follows the character, per the tone doctrine ---- */
  const instruction = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.mission.armCombatInstruction('TEST INSTRUCTION', 500);
    h.dialogue.play('fighters.first', { urgent: true });
    const whileTalking = { busy: h.dialogue.busy, pending: !!h.mission._pendingInstruction };
    for (let i = 0; i < 60 * 40 && h.mission._pendingInstruction; i++) h.tick(1 / 60);
    return { whileTalking, drained: !h.mission._pendingInstruction };
  });
  check('a combat instruction waits for the crew to stop talking before it reaches the glass',
    instruction.whileTalking.busy && instruction.whileTalking.pending && instruction.drained,
    JSON.stringify(instruction));

  /* ---- The one authored engine problem (owner: "for show", 2026-08-06) ----
   *
   * `LIVE_FIRE` is off, so the barrage above cost the aeroplane nothing — the
   * flak and fighter checks proved exactly that. This is the mission's one
   * deliberate, non-random consequence of flying through it: an engine
   * derated, not killed, toward the end of the flak/fighter stretch. Reset to
   * a clean, fully-healed airframe first (`restoreCheckpoint('turnOnCourse')`
   * — real saved data by this point, from the organic `cruise` phase entry
   * above) so this reads the TRIGGER, not residual damage from the stress
   * test just run. */
  const engineOut = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.mission.restoreCheckpoint('turnOnCourse');
    const beforeFired = h.mission._engineOutFired;
    const beforeHealth = h.engines.engines.map((e) => +e.health.toFixed(3));
    // `go('defense')` poses at TARGET_X - 1600 (7400), already past
    // ENGINE_OUT_TRIGGER_X (TARGET_X - 2400 = 6600) — see MissionController.js.
    h.go('defense');
    h.tick(0.1);
    const idx = h.mission._engineOutIndex;
    return {
      beforeFired, beforeHealth,
      fired: h.mission._engineOutFired,
      index: idx,
      health: idx === null || idx === undefined ? null : +h.engines.engines[idx].health.toFixed(3),
      otherEnginesFull: h.engines.engines.every((e, i) => i === idx || e.health === 1),
      combatDamageUntouched: h.defense.damage.engines.every((v) => v === false),
      dialoguePlayed: h.dialogue.seen('defense.engineStrain'),
      smokeCreated: !!h.mission._engineSmoke,
    };
  });
  check('the one authored engine problem fires toward the end of the flak/fighter stretch: a derate, not a kill, ~7% of total power, one crew line',
    engineOut.beforeFired === false
      && engineOut.fired && engineOut.index === 2
      && engineOut.health >= 0.71 && engineOut.health <= 0.73
      && engineOut.otherEnginesFull && engineOut.combatDamageUntouched
      && engineOut.dialoguePlayed && engineOut.smokeCreated,
    JSON.stringify(engineOut));

  /* Shortcut: the rest of the run to the target is straight, undamaging
   * flight already proven above (corridor crossing) — jump to the approach. */
  const bombApproachEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const phase = h.go('bombApproach');
    /* The combat block above is a stress test — it deliberately flies into a
     * barrage and lets three fighters make passes, and it leaves the skin in a
     * state no ordinary run would reach. `restoreCheckpoint('preRelease')`
     * only restores damage when there is saved checkpoint DATA, and on this
     * route the checkpoint has never actually been reached organically, so it
     * has none. Reset it here rather than measure the blast's damage against a
     * wing that is already at its limit. */
    h.physics.damage.wing = 0;
    h.physics.damage.gear = 0;
    h.physics.damage.tireBurst = false;
    return phase;
  });
  check('go("bombApproach") stages the bombing run', bombApproachEntry === 'bombApproach');

  /* ---- THE DIAMOND ON THE CITY ----
   *
   * Owner, 2026-08-06: "I also want a diamond marker on the city where to drop
   * the bomb and a diamond marker on the airport for the return." Both are the
   * flight HUD's own objective marker (`FlightHud.setDirection`, plus the
   * bearing bug and range on the heading tape) driven off one per-phase target,
   * which is the idiom `src/beefrun/mission.js` already uses. Read off the real
   * DOM, projected through the real camera. */
  const cityMarker = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(0.5);
    const dir = document.getElementById('br-dir');
    const s = h.state().marker;
    return {
      ...s,
      hidden: dir.classList.contains('hidden'),
      edge: dir.classList.contains('edge'),
      left: dir.style.getPropertyValue('--x'),
      top: dir.style.getPropertyValue('--y'),
      navLine: document.getElementById('br-nav').textContent,
      navHidden: document.getElementById('br-nav').classList.contains('hidden'),
      bugHidden: document.getElementById('br-bug').classList.contains('hidden'),
      // The aeroplane is west of the target flying east, so the target is ahead
      // and the diamond has to be ON it rather than pinned to a frame edge.
      target: { x: 9000, z: -500 },
      me: { x: Math.round(h.physics.position.x), heading: Math.round(h.physics.headingDeg) },
    };
  });
  check('a diamond marker stands on Squatchbourg through the whole run in, with the range under it',
    !cityMarker.hidden && cityMarker.label === 'SQUATCHBOURG'
      && cityMarker.onScreen === true && !cityMarker.edge
      && /SQUATCHBOURG/.test(cityMarker.tag || '') && /NM/.test(cityMarker.tag || '')
      && cityMarker.nm > 0.5 && cityMarker.nm < 1.2
      && !cityMarker.navHidden && !cityMarker.bugHidden
      && /SQUATCHBOURG/.test(cityMarker.navLine),
    JSON.stringify(cityMarker));

  /* ---- THE DETAIL THE CREW MISSES ----
   * Owner, 2026-08-26: the wrong-city clue is visible during the flight,
   * possible to miss, and no line points it out. Read the actual cockpit DOM:
   * the order's DESERT COMPOUND and the nav's SQUATCHBOURG are both legible,
   * neither row calls itself a clue, and the state is still the same bombing
   * run rather than a second target or campaign branch. */
  const wrongCityClue = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const el = document.getElementById('enola-route-data');
    const bounds = el?.getBoundingClientRect();
    const style = el ? getComputedStyle(el) : null;
    return {
      ...h.state().wrongCityClue,
      phase: h.mission.phase,
      payloadReleased: h.mission.payloadReleased,
      display: style?.display ?? null,
      opacity: style?.opacity ?? null,
      width: bounds?.width ?? 0,
      height: bounds?.height ?? 0,
      onScreen: !!bounds && bounds.left >= 0 && bounds.top >= 0
        && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
    };
  });
  check('the cockpit quietly disagrees with itself: BOMB ORDER / DESERT COMPOUND, NAV FIX / SQUATCHBOURG',
    wrongCityClue.phase === 'bombApproach'
      && wrongCityClue.payloadReleased === false
      && wrongCityClue.visible && wrongCityClue.display !== 'none'
      && wrongCityClue.order === 'THE DESERT COMPOUND'
      && wrongCityClue.navigation === 'SQUATCHBOURG'
      && /BOMB ORDER THE DESERT COMPOUND/.test(wrongCityClue.text)
      && /NAV FIX SQUATCHBOURG/.test(wrongCityClue.text)
      && wrongCityClue.width > 120 && wrongCityClue.height > 20
      && wrongCityClue.onScreen,
    JSON.stringify(wrongCityClue));

  const wrongCityScreenshot = path.join(
    ROOT, 'artifacts', 'enolasquatch', 'job8-wrong-city-route-data.png',
  );
  await fsp.mkdir(path.dirname(wrongCityScreenshot), { recursive: true });
  await page.screenshot({ path: wrongCityScreenshot });

  /* And it is a marker on the WORLD, not a sticker on the middle of the glass:
   * turn away from the target and it leaves, as an arrowhead on the frame edge
   * pointing back at where the city actually is. */
  const markerTurns = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const facing = h.state().marker;
    const heading = h.physics.headingDeg;
    h.physics.setPose(h.physics.position.clone(), (heading + 180) % 360, h.physics.tas);
    h.tick(0.2);
    const away = h.state().marker;
    const dir = document.getElementById('br-dir');
    const edge = dir.classList.contains('edge');
    h.physics.setPose(h.physics.position.clone(), heading, h.physics.tas);
    h.tick(0.2);
    return { facing, away, edge, back: h.state().marker };
  });
  check('the marker is on the place, not on the screen: turn round and it becomes an edge arrow pointing back at it',
    markerTurns.facing.onScreen === true && markerTurns.away.onScreen === false
      && markerTurns.edge && markerTurns.back.onScreen === true,
    JSON.stringify({
      facing: markerTurns.facing.x, away: markerTurns.away.x, edge: markerTurns.edge,
    }));

  const targetingReal = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(1);
    return {
      onHeading: h.targeting.onHeading,
      onAltitude: h.targeting.onAltitude,
      distance: h.targeting.distance,
    };
  });
  check('Targeting really reads the staged approach as on heading and on altitude',
    targetingReal.onHeading && targetingReal.onAltitude && Number.isFinite(targetingReal.distance),
    JSON.stringify(targetingReal));

  /* Once the doors jam, the reset is committed for eight ACTIVE seconds. Use
   * real A/D browser input throughout, deliberately exceed the old 12-degree
   * attitude gate, and keep the mission paused between deterministic steps so
   * the page's autonomous RAF cannot smuggle time into the 7.99/8.01 boundary.
   * The pause is the one exception: it must still stop the authored clock. */
  const jamSetup = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    /* Stage and pause in the same browser task. Otherwise the autonomous RAF
     * can advance a few milliseconds between two Playwright evaluations and
     * make an exact 7.99/8.01 boundary a race. */
    const entry = h.go('bombMalfunction');
    h.mission.paused = true;
    const { x, z } = h.physics.position;
    h.physics.setPose(h.physics.position.clone().set(x, h.groundHeight(x, z) + 900, z), 90, 68);
    h.engines.forceRunning();
    h.mission.flags.enginesEverStarted = true;
    h.mission.autopilot.disengage(null);
    h.input.clear();
    return {
      entry,
      phase: h.mission.phase,
      timer: h.mission._malfHoldT,
      objective: h.mission.objective,
    };
  });
  check('go("bombMalfunction") stages the bomb-bay-doors-stuck beat',
    jamSetup.entry === 'bombMalfunction' && jamSetup.phase === 'bombMalfunction',
    JSON.stringify(jamSetup));
  await page.evaluate(() => window.__enolaSquatch.tick(2));
  const pausedJam = await page.evaluate(() => ({
    phase: window.__enolaSquatch.mission.phase,
    timer: window.__enolaSquatch.mission._malfHoldT,
  }));

  let maxAbsRoll = 0;
  const committedStep = async (code, seconds) => {
    await page.keyboard.down(code);
    try {
      return await page.evaluate((dt) => {
        const h = window.__enolaSquatch;
        h.mission.paused = false;
        h.tick(dt);
        h.mission.paused = true;
        return {
          phase: h.mission.phase,
          timer: h.mission._malfHoldT,
          rollDeg: h.physics.rollDeg,
          pitchDeg: h.physics.pitchDeg,
          objective: h.mission.objective,
          bombBayOpen: h.mission.bombBayOpen,
          releaseStep: h.mission._releaseStep,
        };
      }, seconds);
    } finally {
      await page.keyboard.up(code);
    }
  };
  let jamProgress = jamSetup;
  for (let i = 0; i < 8; i++) {
    jamProgress = await committedStep(i % 2 ? 'KeyD' : 'KeyA', 0.98);
    maxAbsRoll = Math.max(maxAbsRoll, Math.abs(jamProgress.rollDeg));
  }
  const beforeRelease = await committedStep('KeyA', 0.15); // 7.99 active seconds
  maxAbsRoll = Math.max(maxAbsRoll, Math.abs(beforeRelease.rollDeg));
  const releaseEntry = await committedStep('KeyD', 0.02); // 8.01 active seconds
  maxAbsRoll = Math.max(maxAbsRoll, Math.abs(releaseEntry.rollDeg));
  await page.evaluate(() => { window.__enolaSquatch.mission.paused = false; });

  check('a real pause remains the only thing that stops the committed bomb-bay reset clock',
    jamSetup.phase === 'bombMalfunction' && jamSetup.timer === 0
      && pausedJam.phase === 'bombMalfunction' && pausedJam.timer === 0,
    JSON.stringify({ jamSetup, pausedJam }));
  check('steering past the old attitude limit cannot finish or cancel the reset before eight active seconds',
    maxAbsRoll > 12 && beforeRelease.phase === 'bombMalfunction'
      && beforeRelease.timer >= 7.98 && beforeRelease.timer < 8,
    JSON.stringify({ maxAbsRoll, beforeRelease }));
  check('the same uninterrupted reset reaches the release choice at eight active seconds',
    releaseEntry.phase === 'release' && releaseEntry.timer >= 8
      && releaseEntry.bombBayOpen && releaseEntry.releaseStep === 'awaitChoice',
    JSON.stringify(releaseEntry));

  /* The steering proof above intentionally throws the aeroplane well off the
   * bombing line. Restore the same canonical release pose that the older
   * `go("release")` shortcut supplied, without re-entering/restarting the
   * release phase, so the existing independent impact/accuracy proof still
   * tests the bomb rather than inheriting our deliberate control excursion. */
  await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const x = 9000 - 700;
    const z = -500;
    h.input.clear();
    h.physics.setPose(h.physics.position.clone().set(x, h.groundHeight(x, z) + 350, z), 90, 60);
    h.engines.forceRunning();
    h.mission.flags.enginesEverStarted = true;
    h.input.throttle = 0.6;
    h.physics.controls.parkingBrake = false;
    h.tick(0);
  });

  /* ---- Release: a real 1-5 choice, the payload actually detaches, mass drops. ---- */
  const beforeMass = await page.evaluate(() => window.__enolaSquatch.physics.mass);
  const release = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const before = { released: h.payload.released, mass: h.physics.mass };
    const chose = h.mission.chooseReleaseLine('3'); // "Lou sends his regards."
    h.tick(4); // stuck -> kick -> payload.release()
    return {
      chose,
      before,
      released: h.payload.released,
      afterMass: h.physics.mass,
      phase: h.mission.phase,
      payloadReleasedFlag: h.mission.payloadReleased,
    };
  });
  check('choosing release line 3 via chooseReleaseLine actually detaches the Fat Squatch and drops the mass',
    release.chose && !release.before.released && release.released
      && release.payloadReleasedFlag
      && (release.before.mass - release.afterMass) > 2000
      && release.phase === 'explosion',
    JSON.stringify({ ...release, deltaMass: release.before.mass - release.afterMass }));
  check('the mass drop matches the Fat Squatch\'s payload mass',
    Math.abs((beforeMass - release.afterMass) - 2700) < 5,
    JSON.stringify({ beforeMass, afterMass: release.afterMass }));

  /* ---- The break turn: the seconds between the bomb and the flash ----
   * Owner's brief is that the blast is the payoff; the way to make it MEAN
   * something is to make the player earn their distance from it. The objective
   * has to say so, and `score.blastDistance` has to be the number that comes
   * out of it. */
  const breakTurn = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    return {
      phase: h.mission.phase,
      objective: h.mission.objective,
      calledOut: h.dialogue.seen('bomb.breakTurn')
        || h.dialogue.queue.some((l) => l.beat === 'bomb.breakTurn'),
      pointYet: h.mission.explosionPoint === null || h.mission.explosionPoint === undefined,
    };
  });
  check('the bomb being away starts a break turn rather than an empty objective and a wait',
    breakTurn.phase === 'explosion' && breakTurn.pointYet && breakTurn.calledOut
      && /turn/i.test(breakTurn.objective),
    JSON.stringify(breakTurn));

  /* ---- The whistle starts the moment the payload leaves the mount ---- */
  const whistle = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    return {
      // `ready` is false when the browser gave us no AudioContext at all, in
      // which case there is nothing to assert about a sound — but the mission
      // must still have ASKED for it, which is what `_fallSeconds` records.
      audioReady: !!h.audio.ready,
      whistling: !!h.audio.whistling,
      fallSeconds: h.mission._fallSeconds ?? null,
      saidFalling: h.dialogue.seen('bomb.falling') || h.dialogue.queue.some((l) => l.beat === 'bomb.falling'),
    };
  });
  check('releasing the Fat Squatch starts the falling whistle, timed to the real length of the fall',
    typeof whistle.fallSeconds === 'number' && whistle.fallSeconds > 3 && whistle.fallSeconds < 20
      && (!whistle.audioReady || whistle.whistling),
    JSON.stringify(whistle));

  /* ---- The drop camera ----
   *
   * Owner: "Maybe we experiment with moving the camera to the third person
   * automatically when you drop the bomb."
   *
   * The bomb left the mount two blocks ago, so the camera should be in chase
   * RIGHT NOW and should hand itself back a few seconds later. Both halves are
   * asserted, because the half that matters is the second one: a cinematic
   * camera that takes the view and keeps it is the reason people turn these
   * off.
   *
   * Deliberately does NOT tick: the bomb is in the air and the fall is the
   * next block's business, so this reads the state and leaves the clock alone.
   * The hand-back is asserted from inside the explosion flight below, which is
   * flying anyway. */
  const dropCam = await page.evaluate(() => window.__enolaSquatch.state().camera);
  check('the camera takes itself to third person the moment the bomb leaves the mount',
    dropCam.view === 'chase' && dropCam.dropCam > 0,
    JSON.stringify(dropCam));

  /* ---- Let the payload actually fall and detonate for real, then escape.
   * Escape's own gate needs `p.agl > 220`, and the beat is literally "climb,
   * bank, and don't look at it" — hold real climb input throughout, the same
   * trim reasoning as the corridor crossing above.
   *
   * The explosion phase runs 18 s now rather than 4.2 (the mushroom cap does
   * not finish rising until about 11), so this flies the whole of it. ---- */
  const explosionReal = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.input.throttle = 0.9;
    const seen = {
      flashPeak: 0, fireballPeak: 0, debris: 0, lightPeak: 0,
      shockSamples: [], flattened: 0, columnPeak: 0, capPeak: 0,
      wilson: 0, arrived: false, arrivedAt: null,
      wingBefore: h.physics.damage.wing, wingAfter: 0,
      /* The 2026-08-05 rework, measured in a browser rather than in a unit
       * test: the bubble the player ends up inside, the sweep across the
       * screen as the front crosses him, the turbulence spiking and then
       * going away again, and the camera taking itself to chase on the drop
       * and handing itself back. */
      bubblePeak: 0, washPeak: 0, washOverlayPeak: 0, washFrames: 0,
      turbPeak: 0, viewsSeen: [], dropCamSeen: false,
      nosePathDot: -1, noseY: 1,
    };
    /* The overlay is real DOM: read what the browser actually computed, not
     * the number the mission published. A sweep that is being written to a
     * property nobody paints is not a sweep. */
    const washEl = document.getElementById('enola-shock');
    /* Same duty-cycled climb input as the corridor crossing above (KeyS is
     * this flight model's nose-up — verified empirically) — held while the
     * payload really falls and the whole set-piece plays. Longer than it used
     * to be, because the column does not finish going up for half a minute. */
    /* Sampled after EVERY tick rather than once a second.
     *
     * The sweep as the front crosses the player is about a second wide and at
     * a short blast distance it is over inside two — a loop that looks once
     * per second would catch it by luck, and "the check passed on a good run"
     * is not a check. */
    const sample = () => {
      const st = h.state();
      seen.washPeak = Math.max(seen.washPeak, st.blast.wash);
      seen.turbPeak = Math.max(seen.turbPeak, st.blast.turbulence);
      if (st.blast.wash > 0.05) seen.washFrames += 1;
      if (washEl) {
        const painted = Number(getComputedStyle(washEl).opacity) || 0;
        seen.washOverlayPeak = Math.max(seen.washOverlayPeak, painted);
      }
      if (!seen.viewsSeen.includes(st.camera.view)) seen.viewsSeen.push(st.camera.view);
      if (st.camera.dropCam > 0) seen.dropCamSeen = true;
      if (h.payload.released && !h.payload.impacted && h.payload.velocity.lengthSq() > 0.01) {
        const V = h.physics.position.constructor;
        const nose = new V(0, 0, 1).applyQuaternion(h.payload.group.quaternion).normalize();
        const path = h.payload.velocity.clone().normalize();
        seen.nosePathDot = Math.max(seen.nosePathDot, nose.dot(path));
        seen.noseY = Math.min(seen.noseY, nose.y);
      }
      const vfx = h.mission._explosionVfx;
      if (vfx) seen.bubblePeak = Math.max(seen.bubblePeak, vfx.bubble.scale.x);
    };

    for (let i = 0; i < 46; i++) {
      h.input.key('KeyS', true);
      // "Climb, bank, and don't look at it." Flown, not just read: a bomber
      // that runs east for a minute after the drop leaves the map, which is
      // the map telling the truth rather than a bug.
      if (i > 14 && i < 34) h.input.key('KeyA', true);
      h.tick(0.25);
      sample();
      h.input.key('KeyS', false);
      h.input.key('KeyA', false);
      /* Three quarter-second steps rather than one three-quarter step, so
       * every sample in the whole flight is 0.25 s from the last one. The
       * sweep is about a second wide and the part of it above half is under
       * half a second; on the old 0.25/0.75 alternating grid the wide gap
       * could straddle the peak entirely and the check would pass or fail on
       * where the bomb happened to land. Same total flight, even sampling. */
      for (let k = 0; k < 3; k++) { h.tick(0.25); sample(); }
      const vfx = h.mission._explosionVfx;
      const st = h.state();
      if (vfx) {
        seen.flashPeak = Math.max(seen.flashPeak, vfx.flash.scale.x);
        seen.fireballPeak = Math.max(seen.fireballPeak, ...vfx.fire.map((b) => b.scale.x));
        seen.lightPeak = Math.max(seen.lightPeak, vfx.light.intensity);
        seen.debris = Math.max(seen.debris, vfx.debris.length);
        seen.columnPeak = Math.max(seen.columnPeak, vfx.stem.scale.y);
        seen.capPeak = Math.max(seen.capPeak, vfx.cap.scale.x);
        seen.wilson = Math.max(seen.wilson, vfx.wilson.material.opacity);
        seen.bubblePeak = Math.max(seen.bubblePeak, vfx.bubble.scale.x);
        seen.shockSamples.push(st.blast.shockRadius);
        seen.flattened = Math.max(seen.flattened, st.blast.cityFlattened);
        if (st.blast.shockArrived && !seen.arrived) {
          seen.arrived = true;
          seen.arrivedAt = st.blast.t;
          seen.wingAfter = h.physics.damage.wing;
        }
      }
    }
    /* And what is left in the sky at the end of it. `linger` is read AFTER the
     * flight rather than sampled during it, because the whole claim is about
     * the state the world is in once the event is over: the player has flown
     * the escape, he turns round, and the thing he did is still standing
     * there. Read off the real meshes. */
    const vfx = h.mission._explosionVfx;
    const linger = vfx ? {
      t: +h.mission.detonation.t.toFixed(1),
      lingering: !!h.mission.detonation.lingering,
      capOpacity: +vfx.cap.material.opacity.toFixed(3),
      capRadius: Math.round(vfx.cap.scale.x),
      capHeight: Math.round(vfx.cap.position.y),
      stemOpacity: +vfx.stem.material.opacity.toFixed(3),
      scorch: +vfx.scorch.material.opacity.toFixed(3),
      // The transient half must be OFF, not merely faded.
      transientDrawn: [vfx.flash, vfx.wilson, vfx.bubble, vfx.shellRing,
        vfx.front, vfx.dustRing, vfx.surge, vfx.skirt].filter((o) => o.visible).length,
      lightsOut: vfx.light.intensity === 0 && vfx.afterglow.intensity === 0,
    } : null;

    return {
      impacted: h.payload.impacted,
      bombAccuracy: h.mission.score.bombAccuracy,
      phase: h.mission.phase,
      agl: h.physics.agl,
      failed: h.mission.failed,
      whistleStopped: !h.audio.whistling,
      blastDistance: h.mission.score.blastDistance,
      turbNow: +(h.mission.weather?.turbulence ?? 0).toFixed(3),
      cameraEnd: h.state().camera,
      seen,
      linger,
    };
  });

  /* The whiteout is checked against the curve itself rather than by sampling
   * the overlay: the double flash is over in a second and a half and the loop
   * above steps in quarter-seconds, so a sampled peak would be luck. */
  const whiteout = await page.evaluate(() => {
    const el = document.getElementById('enola-blast');
    const L = window.__enolaSquatch.blastLuminance;
    return {
      first: +L(0.022).toFixed(3),
      dip: +L(0.19).toFixed(3),
      second: +L(0.78).toFixed(3),
      late: +L(8).toFixed(3),
      overlayExists: !!el,
      overlayBlend: el ? getComputedStyle(el).mixBlendMode : null,
    };
  });

  check('the Fat Squatch really falls, really impacts, and the mission really moves through explosion into escape',
    explosionReal.impacted && explosionReal.bombAccuracy > 0.5
      && ['escape', 'emergency', 'return'].includes(explosionReal.phase) && !explosionReal.failed
      && explosionReal.whistleStopped,
    JSON.stringify({ ...explosionReal, seen: undefined }));

  check('the Fat Squatch settles nose-first into its falling path instead of tumbling sideways',
    explosionReal.seen.nosePathDot > 0.94 && explosionReal.seen.noseY < -0.2,
    JSON.stringify({ dot: explosionReal.seen.nosePathDot, noseY: explosionReal.seen.noseY }));

  check('the detonation is on the scale the brief asked for: a huge flash, a real light, a fireball and a debris fan',
    explosionReal.seen.flashPeak > 500 && explosionReal.seen.fireballPeak > 400
      && explosionReal.seen.lightPeak > 1e5 && explosionReal.seen.debris >= 30,
    JSON.stringify({
      flashPeak: Math.round(explosionReal.seen.flashPeak),
      fireballPeak: Math.round(explosionReal.seen.fireballPeak),
      lightPeak: explosionReal.seen.lightPeak.toExponential(2),
      debris: explosionReal.seen.debris,
    }));

  check('the flash whites the cockpit out, and does it TWICE the way a real device does',
    whiteout.overlayExists && whiteout.overlayBlend === 'screen'
      && whiteout.first > 0.9 && whiteout.dip < whiteout.first * 0.75
      && whiteout.second > 0.9 && whiteout.late < 0.05,
    JSON.stringify(whiteout));

  check('the shock front visibly crosses the ground and takes the surviving city down as it reaches it',
    explosionReal.seen.shockSamples.length > 4
      && explosionReal.seen.shockSamples[explosionReal.seen.shockSamples.length - 1]
        > explosionReal.seen.shockSamples[0]
      && explosionReal.seen.shockSamples.every((r, i, a) => i === 0 || r >= a[i - 1])
      && explosionReal.seen.flattened > 100,
    `front reached ${explosionReal.seen.shockSamples[explosionReal.seen.shockSamples.length - 1]} m `
    + `and knocked ${explosionReal.seen.flattened} pieces of Squatchbourg down on its way past`);

  check('the column goes up and the cap unrolls off the top of it',
    explosionReal.seen.columnPeak > 1500 && explosionReal.seen.capPeak > 1200
      && explosionReal.seen.wilson > 0.1,
    `stem ${Math.round(explosionReal.seen.columnPeak)} m, cap radius `
    + `${Math.round(explosionReal.seen.capPeak)} m, condensation cloud peaked at `
    + `${explosionReal.seen.wilson.toFixed(2)}`);

  /* ---- The 2026-08-05 rework, in a browser ----
   *
   * Owner: "I want a shock wave to pass you ... it needs to be visible as it
   * passes over you that way the player doesn't miss it. Then I want a the
   * giant bubble explosion and the mushroom cloud and then the shockwave to
   * pass over you and simulate a brief moment of turbulence."
   *
   * Three separate claims, three separate checks, all of them measured off
   * what the page actually did rather than off the curve. */

  check('the front sweeps the SCREEN as it goes past, and it is really painted there',
    explosionReal.seen.washPeak > 0.5 && explosionReal.seen.washOverlayPeak > 0.4
      && explosionReal.seen.washFrames >= 2,
    JSON.stringify({
      washPeak: +explosionReal.seen.washPeak.toFixed(3),
      paintedOnTheOverlay: +explosionReal.seen.washOverlayPeak.toFixed(3),
      framesVisible: explosionReal.seen.washFrames,
    }));

  check('the pressure bubble grows past the aeroplane, so the front goes OVER the player rather than near him',
    explosionReal.seen.bubblePeak > explosionReal.blastDistance,
    `bubble reached ${Math.round(explosionReal.seen.bubblePeak)} m round a player `
    + `${Math.round(explosionReal.blastDistance)} m from the hole`);

  check('the buffet is a brief moment of turbulence and then it is over, not weather for the rest of the flight',
    explosionReal.seen.turbPeak > 0.6 && explosionReal.turbNow < explosionReal.seen.turbPeak * 0.85,
    `turbulence spiked to ${explosionReal.seen.turbPeak.toFixed(2)} and settled `
    + `back to ${explosionReal.turbNow.toFixed(2)}`);

  check('the mushroom cloud is STILL STANDING over the crater once the event is over',
    !!explosionReal.linger && explosionReal.linger.lingering
      && explosionReal.linger.capOpacity > 0.2 && explosionReal.linger.stemOpacity > 0.15
      && explosionReal.linger.capRadius > 2000 && explosionReal.linger.capHeight > 3000
      && explosionReal.linger.scorch > 0.3,
    JSON.stringify(explosionReal.linger));

  check('and the half of the event that was transient is switched OFF rather than left running',
    !!explosionReal.linger && explosionReal.linger.transientDrawn === 0
      && explosionReal.linger.lightsOut,
    JSON.stringify({
      stillDrawn: explosionReal.linger?.transientDrawn,
      lightsOut: explosionReal.linger?.lightsOut,
    }));

  /* The half of the drop camera that matters. It was proved to TAKE the view
   * before the fall; this is the one that stops it being the kind of automatic
   * camera people switch off — it lets go, on its own, and the player is back
   * where he was long before the escape. */
  check('the drop camera gives the view back on its own',
    explosionReal.seen.dropCamSeen === true
      && explosionReal.seen.viewsSeen.includes('chase')
      && explosionReal.seen.viewsSeen.includes('cockpit')
      && explosionReal.cameraEnd.view === 'cockpit'
      && explosionReal.cameraEnd.dropCam === 0,
    JSON.stringify({
      viewsDuringTheFlight: explosionReal.seen.viewsSeen,
      endedIn: explosionReal.cameraEnd,
    }));

  check('the blast wave catches up with the aeroplane and it costs something',
    explosionReal.seen.arrived
      && explosionReal.seen.wingAfter > explosionReal.seen.wingBefore
      && typeof explosionReal.blastDistance === 'number' && explosionReal.blastDistance > 50,
    `it arrived ${explosionReal.seen.arrivedAt}s after the flash at `
    + `${Math.round(explosionReal.blastDistance)} m; skin damage went `
    + `${explosionReal.seen.wingBefore.toFixed(3)} -> ${explosionReal.seen.wingAfter.toFixed(3)}`);

  /* ---- The crater: the city is gone, the ground is a hole, and physics knows ---- */
  const crater = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const c = h.crater;
    if (!c) return { crater: false };
    const centreNow = h.groundHeight(c.x, c.z);
    // Buildings inside the lip have to be gone. Sample the instance matrices.
    const buildings = h.city.parts.buildings;
    const m = new Float32Array(16);
    let insideAlive = 0;
    for (let i = 0; i < buildings.count; i++) {
      buildings.instanceMatrix.array.slice(i * 16, i * 16 + 16).forEach((v, k) => { m[k] = v; });
      const bx = m[12] + h.city.x;
      const bz = m[14] + h.city.z;
      const scaleY = Math.hypot(m[4], m[5], m[6]);
      if (Math.hypot(bx - c.x, bz - c.z) < c.radius * 0.9 && scaleY > 1) insideAlive++;
    }
    return {
      crater: true,
      cityDestroyed: h.city.destroyed,
      radius: c.radius,
      depth: c.depth,
      centreDrop: +(c.groundY - centreNow).toFixed(1),
      /* The hole has an edge: the profile is a real bowl with a raised lip
       * that runs out to exactly nothing, rather than an infinite depression
       * dragging the whole map down with it. */
      lipRise: +h.craterOffsetAt(c.radius + 1).toFixed(1),
      zeroBeyondLip: h.craterOffsetAt(c.radius + 400) === 0,
      craterMeshInScene: !!c.mesh.parent,
      insideAlive,
      streetsHidden: h.city.parts.streets.visible === false,
    };
  });
  check('the city is gone and a giant crater is in its place — in the mesh AND in the ground the aeroplane flies over',
    crater.crater && crater.cityDestroyed && crater.craterMeshInScene
      && crater.centreDrop > 80 && crater.insideAlive === 0 && crater.streetsHidden
      && crater.lipRise > 5 && crater.zeroBeyondLip,
    JSON.stringify(crater));

  /* ================================================================
   * THE RESTART — the blocker, owner 2026-08-06: "The enola restart from
   * latest checkpoint bug still happens where everything is already blown up
   * and I cant redrop the bomb."
   *
   * The city has just been destroyed for real, by a real bomb, and the shock
   * front has been through it. This is the moment the owner was restarting at.
   * Everything below is the second attempt: put the checkpoint back, prove
   * Squatchbourg is STANDING again — in the mesh, in the lights, in the street
   * plate and the river, and in the ground the aeroplane and the payload
   * actually collide with — and then drop the Fat Squatch on it a second time
   * and watch it go off.
   *
   * Deliberately driven through `requestRestart()`, which is exactly what the
   * Tab menu's "Restart from checkpoint" calls, rather than through `go()`.
   * ================================================================ */
  /* THE TOWN'S OWN TWO BRIGHTNESSES, read off the module the page actually
   * loaded rather than typed here as numbers.
   *
   * `TargetCity.destroy()` writes `DEAD_WINDOW_GLOW` and `restore()` writes
   * `WINDOW_GLOW`; those two constants exist precisely because the pair used to
   * be bare literals in two places and a restored city ended up dark. This file
   * had a third copy of the number — `windowGlow > 0.3`, written when
   * `WINDOW_GLOW` was 0.5 — and when the owner's 2026-08-19 playtest turned the
   * windows down to 0.2 ("far too intense — buildings read as lava towers")
   * that copy started failing a restore that was working perfectly. So the
   * check is anchored on the constants instead, and asserts something stronger
   * than "clearly lit": that the restore puts back EXACTLY the live value the
   * builder used, and that the destroy writes exactly the dead one. A retune of
   * either now moves both ends of the check with it. The tolerance is the
   * rounding in `state().target.windowGlow`, which reports to three places. */
  const cityGlow = await page.evaluate(async () => {
    const m = await import('/src/enolasquatch/scenes/TargetCity.js');
    return { live: m.WINDOW_GLOW, dead: m.DEAD_WINDOW_GLOW };
  });
  const glowIs = (reported, authored) => Math.abs(reported - authored) < 1e-3;

  const beforeRestart = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    // Everything the front had not reached yet goes now, so the restore is
    // tested against a city that is as flattened as it can get.
    h.city.advanceShock(6000);
    const t = h.state().target;
    return {
      ...t,
      checkpoint: h.mission.checkpoint,
      phase: h.mission.phase,
      payloadReleased: h.mission.payloadReleased,
      payloadGone: h.payload.released && h.payload.impacted,
      // What the mission's own ground function says at ground zero, which is
      // what physics, the payload's impact test, Defense and Targeting all use.
      groundAtTarget: +h.groundHeight(9000, -500).toFixed(1),
      /* The battle damage the blast wave did, which is a SECOND record of what
       * is broken, parallel to `engines`/`physics.damage` and never reset. */
      battle: {
        engines: h.defense.damage.engines.filter(Boolean).length,
        electrical: h.defense.damage.electrical,
        hitCount: h.defense.hitCount,
        deadDials: h.aircraft.instruments?.failed.size ?? 0,
        wing: +h.physics.damage.wing.toFixed(3),
      },
    };
  });
  check('after the raid the city really is gone: every lot down, the lights out, the water and the streets hidden',
    beforeRestart.destroyed && beforeRestart.standingLots === 0
      && beforeRestart.landmarksAlive === 0 && !beforeRestart.streetsVisible
      /* The lights: not "under 0.1" but exactly the `DEAD_WINDOW_GLOW` the
       * destroy writes — see the note above `cityGlow`. */
      && !beforeRestart.riverVisible && glowIs(beforeRestart.windowGlow, cityGlow.dead)
      && beforeRestart.crater && beforeRestart.craterMesh
      /* The hole, in the ground the aeroplane and the payload actually collide
       * with rather than only in the mesh: the full crater depth at ground
       * zero, and a real drop under the middle of town. See `state().target`
       * for why those are two different numbers. */
      && beforeRestart.holeAtCrater < -100 && beforeRestart.groundHole < -5,
    JSON.stringify(beforeRestart));

  const restarted = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const took = h.mission.requestRestart();
    /* Read the crew's memory on THIS frame, before the tick below. Half a
     * second into a restored bombing run the bombardier has already called the
     * city in sight again — which is the fix working, and would read as the
     * fix failing if it were sampled afterwards. */
    const beats = {
      cityInSight: h.dialogue.seen('bomb.cityInSight'),
      packageAway: h.dialogue.seen('bomb.packageAway'),
      flash: h.dialogue.seen('explosion.flash'),
      escapeTurn: h.dialogue.seen('escape.turn'),
      preflightDone: h.dialogue.seen('preflight.done'),
      taxi: h.dialogue.seen('taxi.line'),
    };
    h.tick(0.5);
    const t = h.state().target;
    return {
      took,
      ...t,
      phase: h.mission.phase,
      checkpoint: h.mission.checkpoint,
      /* THE BOMB. Back on the mount, in the scene graph, under the aeroplane —
       * not just a flag flipped. */
      payloadReleased: h.mission.payloadReleased,
      payloadOnMount: h.payload.group.parent === h.aircraft.anchors.payloadMount,
      payloadVisible: h.payload.group.visible,
      payloadFlags: { released: h.payload.released, impacted: h.payload.impacted },
      /* And the hole, in all three places it existed: the fine crater mesh, the
       * mission's ground function, and the sunken coarse ground mesh. */
      groundAtTarget: +h.groundHeight(9000, -500).toFixed(1),
      explosionPoint: !!h.mission.explosionPoint,
      detonationLive: h.detonation.live,
      blastFlash: +(h.mission.blastFlash || 0).toFixed(3),
      // Nothing left over from the attempt before.
      fighters: h.state().fighters.active,
      failed: h.mission.failed,
      /* And the crew have their lines back for the legs about to be reflown —
       * but not for the ones that are not. */
      battle: {
        engines: h.defense.damage.engines.filter(Boolean).length,
        electrical: h.defense.damage.electrical,
        hitCount: h.defense.hitCount,
        deadDials: h.aircraft.instruments?.failed.size ?? 0,
        wing: +h.physics.damage.wing.toFixed(3),
      },
      // The pre-tick sample taken above, NOT a fresh one: see its comment.
      beats,
      // And the same reading half a second later, which is a different
      // question — by then the bombardier has had time to use one of them.
      beatsAfterHalfASecond: { cityInSight: h.dialogue.seen('bomb.cityInSight') },
    };
  });
  check('restarting from the checkpoint puts Squatchbourg back — every lot standing, the lights on, the streets and the river drawn',
    restarted.took && restarted.destroyed === false
      && restarted.standingLots === restarted.totalLots && restarted.totalLots > 800
      && restarted.landmarksAlive > 15
      && restarted.streetsVisible && restarted.riverVisible
      /* THE LIGHTS ARE BACK ON, at exactly the brightness the builder used.
       *
       * This used to read `windowGlow > 0.3`, a third copy of a number that
       * lives in `TargetCity.js` — written when `WINDOW_GLOW` was 0.5, kept
       * through the 0.72 -> 0.5 retune of 2026-08-06, and finally broken by the
       * 0.5 -> 0.2 one of 2026-08-19 ("far too intense — buildings read as lava
       * towers"). Every other part of this check was passing; a working restore
       * was failing against a stale threshold. It is anchored on the constants
       * now (see the `cityGlow` note above), which is also stricter: "clearly
       * lit" would accept a restore that put back the wrong brightness, and
       * this does not. `dead` is asserted alongside it so the pair can never
       * quietly become the same number. */
      && glowIs(restarted.windowGlow, cityGlow.live)
      && !glowIs(cityGlow.live, cityGlow.dead)
      && restarted.flattened === 0,
    JSON.stringify({
      standing: `${restarted.standingLots}/${restarted.totalLots}`,
      landmarks: restarted.landmarksAlive,
      streets: restarted.streetsVisible, river: restarted.riverVisible,
      glow: restarted.windowGlow, authored: cityGlow, flattened: restarted.flattened,
    }));

  /* The same number, and now it has to be EXACTLY zero: a restored world with
   * any of the hole left in it stands the city in the air over a pit, and the
   * next bomb falls through the ground it was supposed to hit. */
  check('and the crater is filled in — the mesh is gone AND the ground the aeroplane flies over is whole again',
    !restarted.crater && !restarted.craterMesh
      && Math.abs(restarted.groundHole) < 0.01 && restarted.holeAtCrater === 0
      && restarted.groundAtTarget > beforeRestart.groundAtTarget,
    JSON.stringify({
      craterRecord: restarted.crater, craterMesh: restarted.craterMesh,
      groundWas: beforeRestart.groundAtTarget, groundNow: restarted.groundAtTarget,
      holeRemaining: restarted.groundHole,
    }));

  check('the second attempt starts on the bombing run with a Fat Squatch actually hanging in the bay',
    restarted.phase === 'bombApproach' && restarted.checkpoint === 'preRelease'
      && restarted.payloadReleased === false && restarted.payloadOnMount
      && restarted.payloadVisible && !restarted.payloadFlags.released
      && !restarted.payloadFlags.impacted
      && !restarted.explosionPoint && !restarted.detonationLive
      && restarted.blastFlash === 0 && restarted.fighters === 0 && !restarted.failed,
    JSON.stringify({
      phase: restarted.phase, payload: restarted.payloadFlags,
      onMount: restarted.payloadOnMount, released: restarted.payloadReleased,
    }));

  /* ---- The battle damage goes with the engines. `engines.reset(false)` inside
   * the restore rebuilds all four; `Defense.damage` is a second, parallel
   * record of what has been shot off and used to survive the restart, so the
   * mission believed in damage the aeroplane no longer had — most visibly an
   * ELECTRICAL FAULT stuck on the glass with a dead dial behind it. ---- */
  check('a restart hands back an aeroplane that is whole — no phantom battle damage from the attempt before',
    beforeRestart.battle.electrical && beforeRestart.battle.hitCount > 0
      && restarted.battle.engines === 0 && restarted.battle.electrical === false
      && restarted.battle.hitCount === 0 && restarted.battle.deadDials === 0
      && restarted.battle.wing === 0,
    `before: ${JSON.stringify(beforeRestart.battle)} after: ${JSON.stringify(restarted.battle)}`);

  /* ---- And the crew fly it with him. A second attempt used to be flown in
   * total silence — every `once: true` beat from the first run was still in
   * `dialogue.played`, so nobody called the city in sight, nobody said package
   * away, and nobody reacted to the flash. ---- */
  check('the crew get their lines back for the legs about to be reflown, and keep the ones that are not',
    restarted.beats.cityInSight === false && restarted.beats.packageAway === false
      && restarted.beats.flash === false && restarted.beats.escapeTurn === false
      && restarted.beats.preflightDone === true && restarted.beats.taxi === true
      /* And he uses one straight away: half a second into the restored run the
       * bombardier has called the city in sight again, which is the whole point
       * of giving the line back. */
      && restarted.beatsAfterHalfASecond.cityInSight === true,
    `${JSON.stringify(restarted.beats)} then cityInSight `
    + `${restarted.beatsAfterHalfASecond.cityInSight} half a second later`);

  /* ---- And it can be delivered a second time. Same route as the first drop:
   * stage the release beat, pick a line, and let the bomb fall for real. ---- */
  const secondDrop = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('release');
    const chose = h.mission.chooseReleaseLine('2');
    // Three seconds of "it's stuck / kick it", then eight or nine of fall.
    for (let i = 0; i < 60 * 20 && !h.payload.impacted; i++) h.tick(1 / 60);
    const atImpact = {
      impacted: h.payload.impacted,
      detonationLive: h.detonation.live,
      cityDestroyed: h.city.destroyed,
      craterMesh: !!h.city.crater,
      crater: !!h.crater,
    };
    // Let the front go out across the town again.
    for (let i = 0; i < 60 * 14; i++) h.tick(1 / 60);
    const t = h.state().target;
    return {
      chose,
      ...atImpact,
      phase: h.mission.phase,
      flattened: t.flattened,
      standingLots: t.standingLots,
      totalLots: t.totalLots,
      groundHole: t.groundHole,
      holeAtCrater: t.holeAtCrater,
      accuracy: h.mission.score.bombAccuracy,
      failed: h.mission.failed,
      saidItAgain: {
        packageAway: h.dialogue.seen('bomb.packageAway'),
        flash: h.dialogue.seen('explosion.flash'),
      },
    };
  });
  check('the Fat Squatch can be dropped AGAIN on the restored city, and it really detonates a second time',
    secondDrop.chose && secondDrop.impacted && secondDrop.detonationLive
      && secondDrop.cityDestroyed && secondDrop.craterMesh && secondDrop.crater
      && secondDrop.accuracy > 0.5
      && secondDrop.holeAtCrater < -100 && !secondDrop.failed,
    JSON.stringify({
      impacted: secondDrop.impacted, detonation: secondDrop.detonationLive,
      accuracy: secondDrop.accuracy, hole: secondDrop.holeAtCrater, phase: secondDrop.phase,
    }));

  check('and the second blast wave knocks the restored city down again rather than finding an empty crater',
    secondDrop.flattened > 0 && secondDrop.standingLots < secondDrop.totalLots * 0.4
      && secondDrop.saidItAgain.packageAway && secondDrop.saidItAgain.flash,
    `${secondDrop.totalLots - secondDrop.standingLots}/${secondDrop.totalLots} lots down, `
    + `${secondDrop.flattened} of them by the shock front; `
    + `crew said it again: ${JSON.stringify(secondDrop.saidItAgain)}`);

  /* ---- E1: the drop sequence starts early enough to land ON the target ----
   *
   * Owner playtest, 2026-08-06: "The bomb is great. The drop bomb sequence
   * should start a bit earlier so that you aren't so far over the target."
   *
   * Every release check above jumps straight past the trigger with `go()` /
   * `restoreCheckpoint()`, which stages the aeroplane at a fixed spot and
   * never exercises the DISTANCE the mission itself picks to start the
   * bomb-bay-malfunction beat (`updateBombApproach()`'s own
   * `BOMB_MALFUNCTION_TRIGGER_M`, ../src/enolasquatch/mission/
   * MissionController.js) — the thing the owner is actually flying against.
   * This one flies it organically from four kilometres out, forced onto the
   * DISTANCE fallback rather than the alignment gate (heading dead on the
   * bearing, but held a mere 10 m above `Targeting`'s altitude band ceiling,
   * so `onAltitude` — and therefore `aligned`/`readyToRelease` — never
   * trips, the same way a real approach under active flak rarely holds the
   * whole tolerance stack for a continuous 1.6 s), then gives the release
   * choice a 6-second read-and-decide before answering it — long enough to
   * actually read the five `RELEASE_LINES`, not an instant reflex click. */
  const dropSequence = await page.evaluate(async () => {
    const h = window.__enolaSquatch;
    const m = h.mission;
    m.finished = false; m.failed = null; m.paused = false;
    h.defense.clear();
    h.interceptors.clear();
    m.autopilot.disengage(null);
    m.autopilot.lockout = 0;
    // The second drop just above leaves a detonation animating (`live`).
    // `rearmPayload()` nulls `explosionPoint`, and `updateDetonation()` reads
    // it unconditionally whenever `detonation.live` -- same ordering
    // `restoreCheckpoint()` uses (dispose the detonation before rearming).
    h.detonation.dispose();
    m.rearmPayload();
    const TARGET_X = 9000;
    const START_X = TARGET_X - 4000;
    const Z = -500; // COMPOUND.z
    // This flies roughly a minute and a half of real engine time on top of
    // everything the suite has already burned from the SAME shared fuel
    // pool (`engines.fuel`) -- restored below so this synthetic run leaves
    // no residue for `escape`/`emergency` after it, which read that same
    // pool and stall (`hotScript` only decays while `e.running`, and an
    // empty tank kills `running` for every engine) if it runs dry.
    const fuelBefore = h.engines.fuel;
    h.weather.setConditions({ turbulence: 0, crosswind: 0 });
    h.physics.setPose({ x: START_X, y: 780, z: Z }, 90, 62);
    h.engines.forceRunning();
    m.flags.enginesEverStarted = true;
    h.input.throttle = 0.6;
    h.physics.controls.parkingBrake = false;
    if (!m.inCockpit) m.enterCockpit({ advance: false });
    m.setPhase('bombApproach');
    // Let `tas`/`onGround` settle from the teleport before `engage()` reads
    // them -- both are written by `AircraftPhysics.advance()`, not `setPose()`.
    h.tick(1 / 60, 1 / 60);
    const took = m.autopilot.engage({});

    const REACTION_S = 6;
    let malfunctionAt = null;
    let releaseEnteredAt = null;
    let choiceMade = false;
    let simT = 0;
    // `AircraftPhysics.advance()` integrates on its own FIXED=1/120s
    // accumulator capped at MAX_STEPS=8 per call (~0.067s of sim time) --
    // feeding it a bigger dt per `tick()` call doesn't move the aeroplane
    // further, the remainder is silently discarded. Stay under that budget.
    const stepSec = 1 / 30;
    let releasedAt = null;
    for (let i = 0; i < 12000; i++) {
      h.tick(stepSec, stepSec);
      simT += stepSec;
      if (!malfunctionAt && m.phase === 'bombMalfunction') malfunctionAt = { t: simT, x: h.physics.position.x };
      if (!releaseEnteredAt && m.phase === 'release') releaseEnteredAt = { t: simT, x: h.physics.position.x };
      if (m.phase === 'release' && m._releaseStep === 'awaitChoice' && !choiceMade
          && simT >= (releaseEnteredAt?.t ?? 0) + REACTION_S) {
        choiceMade = true;
        m.chooseReleaseLine('3');
      }
      if (h.payload.released && !releasedAt) {
        releasedAt = { x: h.physics.position.x, z: h.physics.position.z };
        break;
      }
      if (simT > 150) break; // safety valve, should never fire
    }
    h.engines.fuel = fuelBefore;
    return {
      took,
      malfunctionTriggerDistance: malfunctionAt ? +(TARGET_X - malfunctionAt.x).toFixed(1) : null,
      releasedAt,
      distanceFromTarget: releasedAt
        ? +Math.hypot(TARGET_X - releasedAt.x, Z - releasedAt.z).toFixed(1) : null,
    };
  });
  check('BOMB_MALFUNCTION_TRIGGER_M starts the drop sequence early enough to account for ballistic carry',
    dropSequence.took && dropSequence.malfunctionTriggerDistance !== null
      && dropSequence.malfunctionTriggerDistance > 1450 && dropSequence.malfunctionTriggerDistance < 1750,
    JSON.stringify(dropSequence));
  check('a real 6s read-the-choice reaction releases before the target with room for the bomb to fly',
    dropSequence.releasedAt && dropSequence.releasedAt.x < 9000
      && dropSequence.distanceFromTarget > 300 && dropSequence.distanceFromTarget < 750,
    `released ${dropSequence.distanceFromTarget} m from the target ` +
    `(malfunction triggered at ${dropSequence.malfunctionTriggerDistance} m out)`);

  /* ---- Back to where the run was, so the rest of the script still tests the
   * legs it was written to test: escape, the engine emergency, the return and
   * the landing. ---- */
  await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('escape');
    if (!h.defense.damage.engines.some(Boolean)) h.defense.damageEngine(0);
    h.physics.damage.wing = 0;
  });

  /* ---- Escape naturally finds the engine damaged earlier and raises the
   * engine emergency. What the player then DOES about it is the block after
   * this one, and it is no longer a menu — see there. ---- */
  const emergencyEntry = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    for (let i = 0; i < 12; i++) {
      h.input.key('KeyS', true);
      h.tick(0.25);
      h.input.key('KeyS', false);
      h.tick(0.75);
    } // escape's own 10s + margin decides emergency-or-return
    return {
      phase: h.mission.phase,
      engineHit: h.defense.damage.engines.findIndex(Boolean),
      agl: h.physics.agl,
      failed: h.mission.failed,
    };
  });
  check('escape finds the engine damaged during the defense phase and raises the engine emergency',
    emergencyEntry.phase === 'emergency' && emergencyEntry.engineHit >= 0 && !emergencyEntry.failed,
    JSON.stringify(emergencyEntry));

  /* ---- THE ENGINE IS FIXED WITH THE THROTTLE, NOT WITH A MENU ----
   *
   * Owner playtest, 2026-08-19: *"Require the player to actually reduce
   * throttle. Show engine temp/RPM falling. On clear: remove warning, update
   * objective, tell the player what happens next."*
   *
   * What this check used to do was call `chooseEmergencyResponse('baby')` and
   * assert it returned true — the three-option panel (baby / push / shut it
   * down) that answered an older brief. That panel is deliberately gone:
   * `setPhase('emergency')` now sets `_emergencyResolved` true on entry
   * precisely so `../src/enolasquatch/main.js` never raises it, and
   * `chooseEmergencyResponse` therefore refuses. The old assertion was pressing
   * a button that no player has.
   *
   * So the beat is flown instead of clicked, and the replacement is a stronger
   * check than the one it replaces because it exercises the mechanic the owner
   * actually asked for, end to end and through the real key:
   *
   *   - the menu really is gone (the call is refused AND the panel is not up);
   *   - the lever really comes back, driven by `Z` through `FlightInput`;
   *   - `emergency.stabilised` lands no sooner than `ENGINE_FIX.holdSeconds`
   *     of holding it there (sampled once a second, so this is "not early",
   *     not a stopwatch);
   *   - the temperature on the REAL engine really falls, from its peak to at
   *     or under `ENGINE_FIX.clearTemp`, with the scripted overheat run out;
   *   - no HOT lamp is left on the glass when the leg ends (which is a weaker
   *     statement than it looks, and deliberately reported rather than
   *     dressed up: measured, a throttled-back engine peaks around 238 °C and
   *     `updateFlightCommon` lights that lamp at 245, so pulling the lever back
   *     takes the warning off almost at once rather than at the end);
   *   - the engine is still RUNNING when the phase ends — `updateEmergency`
   *     also clears on a stopped engine, and a check that cannot tell "he
   *     nursed it" from "it died" is not testing the fix at all;
   *   - and the crew say what happens next before `return` begins.
   *
   * Every number comes from the exported `ENGINE_FIX` rather than from copies
   * typed here, so a retune of the gate moves the check with it. ---- */
  const emergencyResolved = await page.evaluate(async () => {
    const h = window.__enolaSquatch;
    const { ENGINE_FIX } = await import('/src/enolasquatch/mission/MissionController.js');
    const engineOf = () => h.engines.engines[h.mission._emergencyEngineIndex];

    /* The menu, twice over: the call the old 1/2/3 keys made, and the panel
     * `main.js` would have raised for them. */
    const menu = {
      chooseStillWorks: h.mission.chooseEmergencyResponse('baby'),
      panelUp: !!document.getElementById('es-choice')?.classList.contains('show'),
    };
    const tempAtEntry = +engineOf().temp.toFixed(1);

    /* Z, held, through the real input path — the same lever the objective names
     * (`ENGINE_FIX.key`). Bounded so a control that has stopped responding
     * reads as a stuck throttle rather than as a hung verification. */
    let pullSeconds = 0;
    while (h.input.throttle > ENGINE_FIX.throttle && pullSeconds < 10) {
      h.input.key('KeyZ', true);
      h.tick(0.1);
      pullSeconds += 0.1;
    }
    h.input.key('KeyZ', false);
    const throttleAfterPull = +h.input.throttle.toFixed(3);

    let minAgl = h.physics.agl;
    let tempPeak = 0;
    let maxThrottle = 0;
    let stabilisedAt = null;
    let seconds = 0;
    /* Keep flying while the authored 70-second overheat decays. The former
     * `tick(75)` left a heavy, untrimmed bomber completely hands-off; depending
     * on the approach state it hit terrain, killed the selected engine and
     * then reported an emergency-choice failure. Use the same light climb
     * correction as the escape leg above, through the real input/physics path
     * — and keep the lever back while doing it, because that is the whole of
     * what the player is being asked to do. */
    for (let i = 0; i < 120 && h.mission.phase === 'emergency' && !h.mission.failed; i++) {
      h.input.key('KeyS', true);
      h.tick(0.25);
      h.input.key('KeyS', false);
      h.tick(0.75);
      seconds += 1;
      if (h.input.throttle > ENGINE_FIX.throttle) {
        h.input.key('KeyZ', true);
        h.tick(0.05);
        h.input.key('KeyZ', false);
      }
      maxThrottle = Math.max(maxThrottle, h.input.throttle);
      tempPeak = Math.max(tempPeak, engineOf().temp);
      minAgl = Math.min(minAgl, h.physics.agl);
      if (stabilisedAt === null && h.mission._engineStabilised) stabilisedAt = seconds;
    }
    h.input.key('KeyS', false);
    h.input.key('KeyZ', false);
    const engine = engineOf();
    return {
      menu,
      pullSeconds: +pullSeconds.toFixed(2),
      throttleAfterPull,
      heldUnderGate: maxThrottle <= ENGINE_FIX.throttle + 1e-6,
      gate: { throttle: ENGINE_FIX.throttle, holdSeconds: ENGINE_FIX.holdSeconds, clearTemp: ENGINE_FIX.clearTemp },
      stabilisedAt,
      clearedInSeconds: seconds,
      tempAtEntry,
      tempPeak: +tempPeak.toFixed(1),
      tempAtClear: +engine.temp.toFixed(1),
      hotScript: +engine.hotScript.toFixed(1),
      phase: h.mission.phase,
      failed: h.mission.failed,
      minAgl: +minAgl.toFixed(1),
      hotLampUp: [...(h.flightHud._warnState || [])].includes('hot'),
      engine: { running: engine.running, dead: engine.dead },
      beats: {
        overheat: h.dialogue.seen('emergency.overheat'),
        throttleBack: h.dialogue.seen('emergency.throttleBack'),
        stabilised: h.dialogue.seen('emergency.stabilised'),
        cooled: h.dialogue.seen('emergency.cooled'),
      },
      objective: h.mission.objective,
    };
  });
  check('pulling the throttle back really cools the engine, and the mission moves on to return',
    // The menu is gone, both halves of it.
    emergencyResolved.menu.chooseStillWorks === false && emergencyResolved.menu.panelUp === false
    // The lever came back with Z and stayed back.
    && emergencyResolved.throttleAfterPull <= emergencyResolved.gate.throttle
    && emergencyResolved.heldUnderGate
    // Held long enough to earn the crew's confirmation, and not before.
    && emergencyResolved.stabilisedAt !== null
    && emergencyResolved.stabilisedAt >= Math.floor(emergencyResolved.gate.holdSeconds)
    && emergencyResolved.beats.stabilised
    // And the needle really came down on the real engine.
    && emergencyResolved.tempAtClear < emergencyResolved.tempPeak
    && emergencyResolved.tempAtClear <= emergencyResolved.gate.clearTemp
    && emergencyResolved.hotScript === 0 && !emergencyResolved.hotLampUp
    // Nursed home, not lost: the engine is still turning.
    && emergencyResolved.engine.running && !emergencyResolved.engine.dead
    // And the mission says what happens next.
    && emergencyResolved.beats.cooled
    && emergencyResolved.phase === 'return' && !emergencyResolved.failed,
    JSON.stringify(emergencyResolved));

  /* ---- THE DIAMOND ON THE AIRPORT. The other half of the owner's request:
   * the marker hands over from the target to the field the moment the job
   * becomes getting home. ---- */
  const fieldMarker = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.tick(0.5);
    const dir = document.getElementById('br-dir');
    return {
      ...h.state().marker,
      hidden: dir.classList.contains('hidden'),
      navLine: document.getElementById('br-nav').textContent,
      phase: h.mission.phase,
      x: Math.round(h.physics.position.x),
    };
  });
  check('on the way home the diamond is on Whispering Pines instead, with the distance to run',
    !fieldMarker.hidden && fieldMarker.label === 'WHISPERING PINES'
      && /WHISPERING PINES/.test(fieldMarker.tag || '')
      && fieldMarker.nm > 1 && /WHISPERING PINES/.test(fieldMarker.navLine),
    JSON.stringify(fieldMarker));

  /* ---- Return / landing: a real touchdown, a real grade. ---- */
  const landing = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    h.go('landing'); // stages a real touchdown pose on runway 18
    h.tick(2);        // registers the touchdown and grades it for real
    return {
      phase: h.mission.phase,
      finalLanding: h.mission.score.finalLanding,
      perfect: h.dialogue.seen('landing.perfect'),
      hard: h.dialogue.seen('landing.hard'),
    };
  });
  check('landing grades a real touchdown and reports a perfect-or-hard result',
    typeof landing.finalLanding === 'number' && landing.finalLanding >= 0 && landing.finalLanding <= 1
      && (landing.perfect || landing.hard) && landing.phase === 'epilogue',
    JSON.stringify(landing));

  /* ---- Epilogue / the report card. ---- */
  const epilogue = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    /* The 2026-08-28 Sasole apron closeout deliberately lengthened this beat
     * from eight to twelve seconds. Drive the published completion predicate
     * instead of freezing the verifier to another copy of that duration; the
     * twenty-second ceiling is only a hang guard and costs no extra work once
     * the real mission seam fires. */
    let elapsed = 0;
    while (!h.mission.finished && elapsed < 20) {
      h.tick(0.25);
      elapsed += 0.25;
    }
    return {
      elapsed,
      finished: h.mission.finished,
      report: h.mission.finished ? h.mission.report() : null,
    };
  });
  /* ---- And it leaves. A marker that is still on the glass over the report
   * card is a marker telling the player to fly to an airfield he has landed
   * at. `NAV_BY_PHASE` has no entry for `epilogue`, and `setPhase()` settles
   * the HUD on the frame the phase changes rather than waiting for a flying
   * frame that never comes. ---- */
  const markerGone = await page.evaluate(() => {
    const h = window.__enolaSquatch;
    const dir = document.getElementById('br-dir');
    return {
      phase: h.mission.phase,
      shown: !dir.classList.contains('hidden'),
      navShown: !document.getElementById('br-nav').classList.contains('hidden'),
      bugShown: !document.getElementById('br-bug').classList.contains('hidden'),
      target: h.mission.navTarget(),
    };
  });
  check('the marker comes down when it is nobody\'s job — no diamond over the epilogue',
    markerGone.phase === 'epilogue' && !markerGone.shown
      && !markerGone.navShown && !markerGone.bugShown && markerGone.target === null,
    JSON.stringify(markerGone));

  check('the epilogue completes the mission and produces a real report card',
    epilogue.finished && epilogue.report
      && typeof epilogue.report.rank === 'string'
      && Array.isArray(epilogue.report.stats) && epilogue.report.stats.length > 0,
    JSON.stringify({
      elapsed: epilogue.elapsed,
      finished: epilogue.finished,
      rank: epilogue.report?.rank,
      tier: epilogue.report?.tier,
    }));

  check('no runtime console/page errors occurred across the whole run', problems.length === 0, problems.join(' | '));

  await page.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log('Failed:');
  for (const f of failed) console.log(`  - ${f.name}`);
  process.exit(1);
}
