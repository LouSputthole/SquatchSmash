#!/usr/bin/env node
/**
 * Wardrobe contact sheets — the visual gate for what the Family wears.
 *
 *   node tools/shots-wardrobe.mjs [names...]
 *   node tools/shots-wardrobe.mjs --all-appearances
 *
 * Opens the fitting room (`wardrobe.html`), drives it directly rather than
 * through its own UI, and writes one PNG per shot. The point is that a note
 * about a cuff can be made against a picture of the cuff: `verify:*` can
 * assert that `bomber.collar.knit` exists, and it does, but only a human can
 * say whether it looks like a flight jacket.
 *
 * Software rendering, so every frame is expensive: one page, reused, with the
 * room driven between captures instead of a reload per shot. The exhaustive
 * mode also writes a clickable index, one combined contact sheet and a JSON
 * geometry/coverage matrix beside the PNGs.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPEARANCES, CAMPAIGN_SCENE_COVERAGE, PROCEDURAL_APPEARANCE_TEMPLATES,
  SCENES, appearancesInScene, isShowable,
} from '../src/core/appearances.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5342;
const ARGS = process.argv.slice(2);
const ALL_APPEARANCES = ARGS.includes('--all-appearances');
const OUT = ALL_APPEARANCES
  ? path.join(ROOT, 'docs', 'validation', '2026-08-08', 'wardrobe-full-audit')
  : path.join(ROOT, 'docs', 'validation', '2026-08-05', 'wardrobe');
const ONLY = ARGS.filter((arg) => !arg.startsWith('--'));
const want = (name) => ONLY.length === 0 || ONLY.includes(name);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
};

/* One row per capture. `who` is a wardrobe key or null for the whole rail;
 * `mark` is a detail camera from src/wardrobe/preview.js.
 *
 * `spin` turns the FIGURE on the turntable -- the three-quarter view a full
 * length wants. `yaw` walks the CAMERA round instead, which is what a detail
 * wants: the mark is already aimed at the watch, and the only remaining
 * question is which side of the arm you are standing on.
 *
 * `scene` and `character` are the workshop's two ledger views. They keep the
 * page chrome -- the panel beside them IS the shot, because what they are for
 * is the comparison table and the flags, not the geometry. */
const POSE_SHOTS = [
  { name: 'pose-deathmegatron-stand', npcPose: { label: 'DeathMegatron — standing', model: 'DEATHMEGATRON', job: 'stand', time: 0 } },
  { name: 'pose-deathmegatron-sit', npcPose: { label: 'DeathMegatron — seated', model: 'DEATHMEGATRON', job: 'sit', time: 0 } },
  { name: 'pose-hogmama-stand', npcPose: { label: 'Hog Mama — standing', model: 'HOG_MAMA', job: 'stand', time: 0 } },
  { name: 'pose-hogmama-sit', npcPose: { label: 'Hog Mama — seated', model: 'HOG_MAMA', job: 'sit', time: 0 } },
  ...Array.from({ length: 4 }, (_, routine) => ({
    name: `pose-dancer-routine-${routine}`,
    npcPose: {
      label: `Bada Bing performer ${routine + 1} — ${['hip circle', 'pole work', 'drop', 'shimmy'][routine]}`,
      performer: routine, job: 'dance', routine, pole: routine < 3, time: 1.55,
    },
  })),
];

const BASE_SHOTS = [
  /* THE WORKSHOP. A scene apiece for the rooms with the most people in them,
   * and the four people the appearance ledger found something wrong with. */
  { name: 'scene-bada-bing', scene: 'bada_bing' },
  { name: 'scene-mansion-house', scene: 'mansion_house' },
  { name: 'scene-mansion-siege', scene: 'mansion_siege' },
  { name: 'scene-no-wake', scene: 'no_wake' },
  { name: 'scene-golf', scene: 'golf' },
  { name: 'scene-bank-heist', scene: 'bank_heist' },
  { name: 'character-lou', character: 'lou' },
  { name: 'character-sasole', character: 'captain_lou_sasole' },
  { name: 'character-numbskull', character: 'numbskull' },
  { name: 'character-deathmegatron', character: 'deathmegatron' },
  { name: 'character-snow', character: 'snow' },
  { name: 'character-shubenator', character: 'shubenator' },

  { name: 'rail-a-studio', who: null, rig: 'studio', from: 0, count: 8 },
  { name: 'rail-b-studio', who: null, rig: 'studio', from: 8, count: 8 },
  { name: 'rail-a-bing', who: null, rig: 'bing', from: 0, count: 8 },
  { name: 'rail-b-bing', who: null, rig: 'bing', from: 8, count: 8 },

  { name: 'lou-full', who: 'lou', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'lou-bing', who: 'lou', rig: 'bing', mark: 'full', spin: 0.5 },
  { name: 'lou-chest', who: 'lou', rig: 'studio', mark: 'chest', yaw: 0.16 },
  { name: 'lou-watch', who: 'lou', rig: 'studio', mark: 'wrist', yaw: 0.75 },
  { name: 'lou-waist', who: 'lou', rig: 'studio', mark: 'waist', yaw: 0.2 },
  { name: 'lou-feet', who: 'lou', rig: 'studio', mark: 'feet', yaw: 0.3 },

  /* The pinstripe is a SCENE OUTFIT, not WARDROBE.lou. These two captures
   * deliberately address the appearance ledger row so a plain canonical Lou
   * can never masquerade as evidence for the Bing three-piece again. */
  { name: 'lou-pinstripe-full', appearance: { character: 'lou', scene: 'bada_bing' },
    rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'lou-pinstripe-chest', appearance: { character: 'lou', scene: 'bada_bing' },
    rig: 'studio', mark: 'chest', yaw: 0.16 },

  /* Silver Pines uses its own exact argyle table. These address those four
   * appearance rows, never the canonical rail models, and frame the torso so
   * diamond registration/chest separation are visible. */
  { name: 'golf-lou-argyle-chest', appearance: { character: 'lou', scene: 'golf' },
    rig: 'day', mark: 'chest', yaw: 0.12 },
  { name: 'golf-rippinflow-argyle-chest', appearance: { character: 'rippinflow', scene: 'golf' },
    rig: 'day', mark: 'chest', yaw: 0.12 },
  { name: 'golf-eric-argyle-chest', appearance: { character: 'eric', scene: 'golf' },
    rig: 'day', mark: 'chest', yaw: 0.12 },
  { name: 'golf-prospect-argyle-chest', appearance: { character: 'prospect', scene: 'golf' },
    rig: 'day', mark: 'chest', yaw: 0.12 },

  { name: 'sasole-full', who: 'captain_lou_sasole', rig: 'day', mark: 'full', spin: 0.5 },
  { name: 'sasole-front', who: 'captain_lou_sasole', rig: 'studio', mark: 'full', spin: 0 },
  { name: 'sasole-chest', who: 'captain_lou_sasole', rig: 'studio', mark: 'chest', yaw: 0.2 },
  { name: 'sasole-back', who: 'captain_lou_sasole', rig: 'studio', mark: 'full', spin: Math.PI },
  { name: 'sasole-cuff', who: 'captain_lou_sasole', rig: 'studio', mark: 'wrist', yaw: 0.75 },

  { name: 'booski-full', who: 'booski', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'booski-chain', who: 'booski', rig: 'studio', mark: 'chest', yaw: 0.12 },
  { name: 'booski-watch', who: 'booski', rig: 'studio', mark: 'wrist', yaw: 0.75 },

  { name: 'deathmegatron-full', who: 'deathmegatron', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'deathmegatron-chest', who: 'deathmegatron', rig: 'studio', mark: 'chest', yaw: 0.12 },
  /* The 2026-08-13 pass: her gown's belt line and Ape's vest are new, so both
   * get the close camera the tux and the chains already had. */
  { name: 'deathmegatron-waist', who: 'deathmegatron', rig: 'studio', mark: 'waist', yaw: 0.2 },
  { name: 'deathmegatron-bing', who: 'deathmegatron', rig: 'bing', mark: 'full', spin: 0.5 },
  { name: 'ape-full', who: 'ape', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'ape-chest', who: 'ape', rig: 'studio', mark: 'chest', yaw: 0.12 },
  { name: 'ape-bing', who: 'ape', rig: 'bing', mark: 'full', spin: 0.5 },
  { name: 'snow-full', who: 'snow', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'rippinflow-chain', who: 'rippinflow', rig: 'studio', mark: 'chest', yaw: 0.12 },
  { name: 'numbskull-full', who: 'numbskull', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'hogmama-full', who: 'hogmama', rig: 'studio', mark: 'full', spin: 0.5 },
  { name: 'hogmama-wrist', who: 'hogmama', rig: 'studio', mark: 'wrist', yaw: 0.75 },
  { name: 'billy-full', who: 'billy', rig: 'studio', mark: 'full', spin: 0.5 },

  { name: 'blond-full', who: 'james_blond', rig: 'bing', mark: 'full', spin: 0.5 },
  { name: 'blond-front', who: 'james_blond', rig: 'bing', mark: 'full', spin: 0 },
  { name: 'blond-chest', who: 'james_blond', rig: 'bing', mark: 'chest', yaw: 0 },
  ...POSE_SHOTS,
];

/* A bounded exhaustive run: every showable ledger row appears in its scene
 * page (eight figures maximum), and every distinct model identity gets one
 * close full-length studio capture. Shared frozen wardrobe objects collapse
 * duplicate scene rows without skipping another actual outfit. */
const sceneCoverageShots = Object.values(SCENES).flatMap((scene) => {
  const shown = appearancesInScene(scene.id).filter(isShowable);
  const pages = Math.max(1, Math.ceil(shown.length / 8));
  return Array.from({ length: pages }, (_, page) => ({
    name: `coverage-scene-${scene.id}-p${page + 1}`,
    scene: scene.id,
    scenePage: page,
    expectedKeys: shown.slice(page * 8, (page + 1) * 8).map((appearance) => appearance.character),
  }));
});

const uniqueModelRows = [];
for (const appearance of APPEARANCES.filter(isShowable)) {
  if (!uniqueModelRows.some((row) => row.model === appearance.model)) uniqueModelRows.push(appearance);
}
const uniqueOutfitShots = uniqueModelRows.map((appearance, index) => ({
  name: `coverage-outfit-${String(index + 1).padStart(3, '0')}-${appearance.scene}-${appearance.character.replace(/[^a-z0-9_-]+/gi, '_')}`,
  appearance: {
    character: appearance.character, scene: appearance.scene, variant: appearance.variant ?? null,
  },
  rig: 'studio',
  mark: 'full',
  spin: 0.42,
}));

const proceduralTemplateShots = PROCEDURAL_APPEARANCE_TEMPLATES.flatMap((template) => (
  template.fixtures.map((fixture) => ({
    name: `coverage-template-${template.id}-${fixture.id}`,
    proceduralTemplate: {
      id: template.id,
      fixture: fixture.id,
      scene: template.scene,
      sourceFamily: template.sourceFamily,
      job: template.job,
      model: fixture.model,
    },
  }))
));

const SHOTS = ALL_APPEARANCES
  ? [...sceneCoverageShots, ...uniqueOutfitShots, ...proceduralTemplateShots, ...POSE_SHOTS]
  : BASE_SHOTS;

function assertValidGeometry(label, geometry) {
  const numbers = [
    ...geometry.bounds.min, ...geometry.bounds.max,
    ...geometry.bounds.size, ...geometry.bounds.centre,
  ];
  if (geometry.meshCount < 1 || geometry.vertexCount < 1
    || geometry.nonFiniteTransforms > 0 || numbers.some((value) => !Number.isFinite(value))
    || geometry.bounds.size.some((value) => value <= 0)) {
    throw new Error(`invalid wardrobe geometry for ${label}: ${JSON.stringify(geometry)}`);
  }
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
await new Promise((r) => server.listen(PORT, r));
await fsp.mkdir(OUT, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/* Wide enough for the workshop's comparison panel to be READ in the shot:
 * seven scenes of Big Uncle Lou beside a 360px table is the whole point of
 * the by-character view, and at 1280 that table is columns of one character. */
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
page.on('pageerror', (e) => { problems.push(e.message); console.error(`  [page] ${e.message}`); });
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  problems.push(m.text());
  console.error(`  [console] ${m.text()}`);
});

await page.goto(`http://localhost:${PORT}/wardrobe.html`, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(globalThis.fittingRoom), null, { timeout: 60_000 });
const initialWebgl = await page.evaluate(() => {
  const gl = globalThis.fittingRoom.renderer.getContext();
  return {
    contextLost: gl.isContextLost(),
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    error: gl.getError(),
  };
});
if (initialWebgl.contextLost || initialWebgl.drawingBuffer.some((value) => value < 1)) {
  throw new Error(`wardrobe WebGL renderer is unavailable: ${JSON.stringify(initialWebgl)}`);
}
/* The chrome is for the human at the keyboard; a contact sheet wants the
 * figure and the caption and nothing else. */
await page.addStyleTag({ content: '.hud { display: none !important; }' });

let wrote = 0;
const measurements = [];
const poseMeasurements = [];
const proceduralTemplateMeasurements = [];
const scenePageMeasurements = [];
for (const shot of SHOTS) {
  if (!want(shot.name)) continue;
  const framing = await page.evaluate(({
    who, rig, mark, spin, yaw, from, count, scene, scenePage, character, appearance,
    npcPose, proceduralTemplate,
  }) => (async () => {
    const room = globalThis.fittingRoom;
    /* The rail needs the full width of the window: shot into the 750px column
     * between the two panels it loses the people at both ends. The workshop
     * views want the opposite -- their panel is half the point. */
    document.body.classList.toggle('bare', Boolean(npcPose || proceduralTemplate)
      || (who === null && !scene && !character && !appearance));
    globalThis.fittingRoomFit();
    if (scene || character || appearance || npcPose || proceduralTemplate) {
      if (scene) room.showScene(scene, { page: scenePage ?? 0 });
      else if (npcPose || proceduralTemplate) {
        const [cast, wardrobe] = await Promise.all([
          import('/src/bing/cast.js'), import('/src/core/wardrobe.js'),
        ]);
        room.showSolo(0);
        for (const child of [...room.stand.children]) {
          room.stand.remove(child);
          child.traverse?.((node) => node.geometry?.dispose?.());
        }
        const model = proceduralTemplate
          ? { ...proceduralTemplate.model, face: null }
          : npcPose.performer === undefined
            ? { ...wardrobe[npcPose.model], face: null }
            : {
              role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
              height: 1.73, build: 1.08, dress: 'bikini',
              ...cast.BADA_BING_PERFORMERS[npcPose.performer],
            };
        const poseName = proceduralTemplate
          ? `${proceduralTemplate.id}.${proceduralTemplate.fixture}`
          : shotName(npcPose);
        const job = proceduralTemplate?.job ?? npcPose.job;
        const npc = new cast.Npc(room.stand, {
          name: poseName, tier: 'hero', job,
          routine: npcPose?.routine ?? 0, pole: npcPose?.pole ?? false,
          look: false, model,
        });
        npc.t = npcPose?.time ?? 0;
        npc.phase = 0;
        npc._every = 0;
        npc.update(0, null);
        room.state.lineup = false;
        room.state.height = model.height ?? 1.78;
        room.state.row = [{
          key: poseName, label: poseName, sub: job,
          model, person: npc, x: npc.group.position.x,
        }];
        room.applyRig('studio');
        room.state.spin = 0.42;
        room.state.yaw = 0;
        room.applyMark('full');
        room.stand.rotation.y = room.state.spin;
        room.stand.updateMatrixWorld(true);
        const centre = room.measureRow()[0].bounds.centre;
        room.state.target.set(...centre);
        room.stand.worldToLocal(room.state.target);
      }
      else if (appearance) {
        const cast = room.showCharacter(appearance.character);
        const exact = cast?.find((row) => row.scene === appearance.scene
          && (!appearance.variant || row.variant === appearance.variant));
        if (!exact) throw new Error(`no such appearance: ${appearance.character}@${appearance.scene}${appearance.variant ? `#${appearance.variant}` : ''}`);
        room.showAppearance(exact);
        room.applyRig(rig ?? 'studio');
        room.applyMark(mark ?? 'full');
        room.state.spin = spin ?? 0;
        room.state.yaw = yaw ?? 0;
        room.applyMark(mark ?? 'full');
      }
      else room.showCharacter(character);
      room.state.turntable = false;
      globalThis.fittingRoomPaint();
      if (npcPose || proceduralTemplate) {
        document.querySelector('.name h2').textContent = proceduralTemplate
          ? `${proceduralTemplate.id} — ${proceduralTemplate.fixture}`
          : npcPose.label;
        document.querySelector('.name p').textContent = proceduralTemplate
          ? `Deterministic ${proceduralTemplate.job} fixture from ${proceduralTemplate.scene}/${proceduralTemplate.sourceFamily}`
          : `Deterministic ${npcPose.job} pose at t=${npcPose.time.toFixed(2)}s`;
      }
      return {
        target: room.state.target.toArray(), height: room.state.height,
        geometry: room.measureRow(),
      };
    }
    room.applyRig(rig);
    if (who === null) room.showLineup(from ?? 0, count ?? undefined);
    else {
      const index = room.keys().indexOf(who);
      if (index < 0) throw new Error(`no such wardrobe key: ${who}`);
      room.showSolo(index);
      room.applyMark(mark ?? 'full');
    }
    room.state.turntable = false;
    room.state.spin = spin ?? 0;
    room.state.yaw = yaw ?? 0;
    /* The mark aims at where the part is BEFORE the turntable moves; re-aim
     * once the spin is set so the stand-space target is read off the pose the
     * shot is actually taken in. */
    if (who !== null) room.applyMark(mark ?? 'full');
    globalThis.fittingRoomPaint();
    return {
      target: room.state.target.toArray(), height: room.state.height,
      geometry: room.measureRow(),
    };
    function shotName(pose) {
      return pose.performer === undefined
        ? `${pose.model.toLowerCase()}.${pose.job}`
        : `dancer.${pose.routine}`;
    }
  })(), shot);
  if (shot.mark === 'chest' && framing.target[1] < framing.height * 0.55) {
    throw new Error(`chest camera aimed below the chest for ${shot.name}: ${JSON.stringify(framing)}`);
  }

  /* Software rendering warms up slowly and the first frames after a rebuild
   * come back empty, so wait on real frames rather than on a timer. */
  await page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    (function spin() {
      if (++n >= 8) return resolve();
      return requestAnimationFrame(spin);
    }());
  }));
  await page.waitForTimeout(320);
  /* Read bounds after the same render frames the PNG sees. `state.spin` is
   * applied by render(), so measuring during the setup transaction would
   * describe the previous shot's turntable angle instead of this one. */
  const renderedGeometry = await page.evaluate(() => globalThis.fittingRoom.measureRow());
  const file = path.join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  const { size } = await fsp.stat(file);
  console.log(`  wrote ${shot.name}.png (${(size / 1024).toFixed(1)} kB)`);
  if (ALL_APPEARANCES && shot.scene) {
    const actualKeys = renderedGeometry.map((geometry) => geometry.key);
    if (JSON.stringify(actualKeys) !== JSON.stringify(shot.expectedKeys)) {
      throw new Error(`scene page ${shot.name} rendered ${JSON.stringify(actualKeys)}; expected ${JSON.stringify(shot.expectedKeys)}`);
    }
    renderedGeometry.forEach((geometry, index) => {
      assertValidGeometry(`${shot.name}[${index}]`, geometry);
    });
    scenePageMeasurements.push({
      shot: shot.name,
      scene: shot.scene,
      page: shot.scenePage,
      expectedKeys: shot.expectedKeys,
      renderedKeys: actualKeys,
      geometry: renderedGeometry,
    });
  }
  if (ALL_APPEARANCES && (shot.appearance || shot.npcPose || shot.proceduralTemplate)) {
    const geometry = renderedGeometry[0];
    assertValidGeometry(shot.name, geometry);
    const measured = { shot: shot.name, ...geometry };
    if (shot.appearance) measurements.push({ appearance: shot.appearance, ...measured });
    else if (shot.npcPose) poseMeasurements.push({ pose: shot.npcPose, ...measured });
    else proceduralTemplateMeasurements.push({ template: shot.proceduralTemplate, ...measured });
  }
  wrote += 1;
}

let animatedWorldSurfaceMatrix = null;
if (ALL_APPEARANCES) {
  /* A static torso-space centre check missed the real defect: the suit could
   * stay internally registered while breathing away from the body's actual
   * front surface. Drive the public Npc wrapper through the three exact
   * breathing phases and compare world-space garment fronts to gut.belly. */
  animatedWorldSurfaceMatrix = await page.evaluate(async () => {
    const [THREE, cast, wardrobe] = await Promise.all([
      import('three'), import('/src/bing/cast.js'), import('/src/core/wardrobe.js'),
    ]);
    const scene = new THREE.Scene();
    const npc = new cast.Npc(scene, {
      name: 'Lou', tier: 'hero', job: 'sit', look: false,
      model: { ...wardrobe.BIG_UNCLE_LOU_BING, face: null },
    });
    const box = (object) => new THREE.Box3().setFromObject(object);
    const named = (name) => {
      const found = [];
      npc.group.traverse((object) => { if (object.name === name) found.push(object); });
      return found;
    };
    const belly = npc.group.getObjectByName('person.gut.belly');
    const waistcoat = named('suit.waistcoat.cloth');
    const lapelLeft = named('suit.lapel.left');
    const lapelRight = named('suit.lapel.right');
    const stripeFronts = named('suit.pinstripe.front');
    if (!belly || waistcoat.length !== 1 || lapelLeft.length !== 1
      || lapelRight.length !== 1 || stripeFronts.length !== 6) {
      throw new Error(`Lou surface anchors missing: ${JSON.stringify({
        belly: Boolean(belly), waistcoat: waistcoat.length,
        lapelLeft: lapelLeft.length, lapelRight: lapelRight.length,
        stripeFronts: stripeFronts.length,
      })}`);
    }
    const phases = [
      { label: 'exhale', phase: -Math.PI / 3 },
      { label: 'neutral', phase: 0 },
      { label: 'inhale', phase: Math.PI / 3 },
    ].map(({ label, phase }) => {
      npc.t = phase;
      npc.phase = 0;
      npc.update(0, new THREE.Vector3());
      npc.group.updateMatrixWorld(true);
      const bellySurfaceZ = box(belly).max.z;
      const gap = (object) => box(object).max.z - bellySurfaceZ;
      return {
        label,
        phase,
        torsoScaleX: npc.parts?.torsoWrap?.scale?.x ?? null,
        bellySurfaceZ,
        surfaceGapMetres: {
          waistcoatCloth: gap(waistcoat[0]),
          lapelLeft: gap(lapelLeft[0]),
          lapelRight: gap(lapelRight[0]),
          pinstripeFronts: stripeFronts.map(gap),
        },
      };
    });
    const scalarDrift = (key) => {
      const values = phases.map((entry) => entry.surfaceGapMetres[key]);
      return Math.max(...values) - Math.min(...values);
    };
    const stripeDrifts = stripeFronts.map((_, index) => {
      const values = phases.map((entry) => entry.surfaceGapMetres.pinstripeFronts[index]);
      return Math.max(...values) - Math.min(...values);
    });
    const driftMetres = {
      waistcoatCloth: scalarDrift('waistcoatCloth'),
      lapelLeft: scalarDrift('lapelLeft'),
      lapelRight: scalarDrift('lapelRight'),
      pinstripeFronts: stripeDrifts,
    };
    const maxDriftMetres = Math.max(
      driftMetres.waistcoatCloth, driftMetres.lapelLeft, driftMetres.lapelRight,
      ...driftMetres.pinstripeFronts,
    );
    return {
      reference: 'person.gut.belly world Box3.max.z',
      thresholdMetres: 0.0015,
      phases,
      driftMetres,
      maxDriftMetres,
    };
  });
  if (animatedWorldSurfaceMatrix.maxDriftMetres
    > animatedWorldSurfaceMatrix.thresholdMetres) {
    throw new Error(`animated Lou garment/body surface drift ${animatedWorldSurfaceMatrix.maxDriftMetres}m exceeds ${animatedWorldSurfaceMatrix.thresholdMetres}m: ${JSON.stringify(animatedWorldSurfaceMatrix)}`);
  }
}

if (ALL_APPEARANCES) {
  const unshown = APPEARANCES.filter((appearance) => !isShowable(appearance)).map((appearance) => ({
    character: appearance.character,
    scene: appearance.scene,
    variant: appearance.variant ?? null,
    reason: appearance.from.unshown,
  }));
  const divergences = APPEARANCES.filter((appearance) => appearance.divergence).map((appearance) => ({
    character: appearance.character,
    name: appearance.name,
    scene: appearance.scene,
    status: appearance.divergenceStatus,
    reason: appearance.divergence,
  }));
  const unresolvedDivergences = divergences.filter(({ status }) => status === 'unresolved');
  if (unresolvedDivergences.length) {
    throw new Error(`unresolved wardrobe divergences: ${JSON.stringify(unresolvedDivergences)}`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    webgl: initialWebgl,
    summary: {
      campaignScenesClassified: Object.keys(CAMPAIGN_SCENE_COVERAGE).length,
      appearanceScenes: Object.keys(SCENES).length,
      appearanceRows: APPEARANCES.length,
      showableRows: APPEARANCES.filter(isShowable).length,
      sourceOnlyRows: unshown.length,
      intentionalDivergences: divergences.filter(({ status }) => status === 'intentional').length,
      unresolvedDivergences: unresolvedDivergences.length,
      sceneScreenshots: sceneCoverageShots.length,
      distinctRenderedModels: measurements.length,
      deterministicRuntimePoses: poseMeasurements.length,
      proceduralTemplateFamilies: PROCEDURAL_APPEARANCE_TEMPLATES.length,
      proceduralTemplateFixtures: proceduralTemplateMeasurements.length,
      verifiedScenePages: scenePageMeasurements.length,
      maxAnimatedSurfaceDriftMetres: animatedWorldSurfaceMatrix.maxDriftMetres,
      screenshotCount: wrote,
      pageErrors: problems.length,
    },
    campaignCoverage: CAMPAIGN_SCENE_COVERAGE,
    divergences,
    sourceOnlyAppearances: unshown,
    renderedModels: measurements,
    scenePages: scenePageMeasurements,
    runtimePoses: poseMeasurements,
    proceduralTemplates: proceduralTemplateMeasurements,
    animatedWorldSurfaceMatrix,
  };
  const reportFile = path.join(OUT, 'coverage-matrix.json');
  await fsp.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`  wrote ${path.basename(reportFile)} (${measurements.length} measured models)`);

  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const cards = (shots) => shots.filter((shot) => want(shot.name)).map((shot) => `
    <figure>
      <a href="${escapeHtml(`${shot.name}.png`)}"><img src="${escapeHtml(`${shot.name}.png`)}" alt="${escapeHtml(shot.name)}"></a>
      <figcaption>${escapeHtml(shot.name)}</figcaption>
    </figure>`).join('');
  const divergenceItems = divergences.map((entry) => `
    <li><strong>${escapeHtml(entry.name)} · ${escapeHtml(entry.scene)} · ${escapeHtml(entry.status)}</strong><br>${escapeHtml(entry.reason)}</li>`).join('');
  const contactHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wardrobe full-appearance audit</title><style>
  *{box-sizing:border-box}body{margin:0;background:#0c0d11;color:#f2efe4;font:14px/1.4 system-ui,sans-serif}
  header{position:sticky;top:0;z-index:2;padding:12px 18px;background:#101119eF;border-bottom:1px solid #343640}
  h1{margin:0;color:#e8c86a;font-size:18px}p{margin:4px 0;color:#aaa89f}h2{margin:20px 18px 8px;color:#e8c86a}
  .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:0 18px 20px}
  .decisions{margin:0 18px 24px;padding:12px 30px;background:#171820;border:1px solid #30323c}.decisions li{margin:8px 0}
  figure{margin:0;padding:6px;background:#171820;border:1px solid #30323c;border-radius:4px}
  img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#fff}
  figcaption{padding:6px 2px 1px;font:11px ui-monospace,monospace;overflow-wrap:anywhere}
</style></head><body>
<header><h1>Wardrobe full-appearance audit</h1><p>${wrote} screenshots · ${measurements.length} distinct rendered models · ${proceduralTemplateMeasurements.length} deterministic procedural fixtures · ${unshown.length} explicit source-only rows · WebGL ${initialWebgl.drawingBuffer.join('×')}</p></header>
<h2>Every appearance scene</h2><section class="grid">${cards(sceneCoverageShots)}</section>
<h2>Every distinct rendered model</h2><section class="grid">${cards(uniqueOutfitShots)}</section>
<h2>Finite procedural clothing and job templates</h2><section class="grid">${cards(proceduralTemplateShots)}</section>
<h2>Deterministic runtime poses</h2><section class="grid">${cards(POSE_SHOTS)}</section>
<h2>Cross-scene wardrobe decisions (${unresolvedDivergences.length} unresolved)</h2><ul class="decisions">${divergenceItems}</ul>
</body></html>`;
  const indexFile = path.join(OUT, 'index.html');
  await fsp.writeFile(indexFile, contactHtml, 'utf8');
  console.log(`  wrote ${path.basename(indexFile)} (clickable contact sheet)`);

  const indexUrl = path.relative(ROOT, indexFile).split(path.sep).map(encodeURIComponent).join('/');
  await page.goto(`http://localhost:${PORT}/${indexUrl}`, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    null, { timeout: 60_000 });
  const contactFile = path.join(OUT, 'contact-sheet.png');
  await page.screenshot({ path: contactFile, fullPage: true });
  console.log(`  wrote ${path.basename(contactFile)} (all ${wrote} screenshots)`);
}

await browser.close();
server.close();

if (problems.length) {
  console.error(`\n${problems.length} page error(s) -- the shots above may be wrong.`);
  process.exit(1);
}
console.log(`\n${wrote} shot(s) in ${path.relative(ROOT, OUT)}`);
