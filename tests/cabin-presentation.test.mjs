import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureDomShim();
ensureThreeShim();

const [
  presentation,
  playerBody,
  { FirstPersonBody, DEFAULT_PLAYER_OUTFIT },
  { CabinRangeSession },
  { CABIN_TORTURE_TOOL_MOTIONS, createCabinTortureToolPresentation },
  { CABIN_TORTURE_TOOL_PROFILES },
  THREE,
] = await Promise.all([
  import('../src/cabin/presentation.js'),
  import('../src/cabin/player-body.js'),
  import('../src/core/first-person-body.js'),
  import('../src/cabin/shooting-range.js'),
  import('../src/cabin/torture-tool-presentation.js'),
  import('../src/cabin/chapter-runtime.js'),
  import('three'),
]);

const mainSource = readFileSync(new URL('../src/cabin/main.js', import.meta.url), 'utf8');

test('all seven Cabin dungeon tools have distinct held motions and feedback while preserving their cues', () => {
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 100);
  const tools = createCabinTortureToolPresentation({ camera });
  const ids = [
    'battery', 'bucket', 'leads', 'pliers', 'saw', 'syringes', 'towels',
  ];
  const expectedCues = {
    battery: 'stunprod.arc',
    bucket: 'punch.heavy',
    leads: 'silent.arc',
    pliers: 'punch.light',
    saw: 'swing.whiff',
    syringes: 'switch.click',
    towels: 'cloth.snap',
  };
  const articulatedParts = {
    battery: [() => tools.tools.battery.getObjectByName('cabin-held-battery-positive').scale, 'y'],
    bucket: [() => tools.tools.bucket.getObjectByName('cabin-held-bucket-handle').rotation, 'x'],
    leads: [() => tools.tools.leads.getObjectByName('cabin-held-leads-clip').rotation, 'z'],
    pliers: [() => tools.tools.pliers.getObjectByName('cabin-held-pliers-jaw-1').rotation, 'z'],
    saw: [() => tools.tools.saw.getObjectByName('cabin-held-saw-handle').rotation, 'z'],
    syringes: [() => tools.tools.syringes.getObjectByName('cabin-held-syringe-plunger').position, 'y'],
    towels: [() => tools.tools.towels.getObjectByName('cabin-held-towel-fold').position, 'y'],
  };
  const transform = (tool) => [
    ...tool.position.toArray(),
    tool.rotation.x, tool.rotation.y, tool.rotation.z,
    ...tool.scale.toArray(),
  ];
  const near = (actual, expected) => Math.abs(actual - expected) <= 1e-8;
  const motionSignatures = new Set();

  assert.deepEqual(Object.keys(tools.tools).sort(), ids);
  assert.deepEqual(Object.keys(CABIN_TORTURE_TOOL_PROFILES).sort(), ids);
  assert.equal(new Set(Object.values(CABIN_TORTURE_TOOL_MOTIONS)).size, ids.length);
  assert.equal(new Set(Object.values(CABIN_TORTURE_TOOL_PROFILES).map(({ feedback }) => feedback)).size, ids.length);
  assert.equal(new Set(Object.values(CABIN_TORTURE_TOOL_PROFILES).map(({ cue }) => cue)).size, ids.length,
    'each dungeon tool needs its own audible identity');

  for (const id of ids) {
    const profile = CABIN_TORTURE_TOOL_PROFILES[id];
    assert.equal(profile.cue, expectedCues[id], `${id} changed its established cue identity`);
    assert.equal(profile.motion, CABIN_TORTURE_TOOL_MOTIONS[id]);
    assert.equal(tools.select(id), id);
    assert.deepEqual(
      Object.entries(tools.snapshot().visible).filter(([, visible]) => visible).map(([toolId]) => toolId),
      [id],
    );

    const resting = transform(tools.tools[id]);
    const [part, property] = articulatedParts[id];
    const restingPart = part()[property];
    assert.equal(tools.strike(profile), true);
    assert.equal(tools.snapshot().motion, profile.motion);
    tools.update(profile.duration * 0.31);
    const active = transform(tools.tools[id]);
    assert.equal(tools.snapshot().striking, true);
    assert.ok(active.some((value, index) => !near(value, resting[index])),
      `${id} needs visible held motion rather than a logical damage callback`);
    assert.ok(!near(part()[property], restingPart), `${id} needs tool-specific articulation`);
    motionSignatures.add(active.map((value, index) => (value - resting[index]).toFixed(4)).join(','));

    tools.update(profile.duration);
    assert.equal(tools.snapshot().striking, false);
    assert.equal(tools.snapshot().motion, null);
    assert.ok(transform(tools.tools[id]).every((value, index) => near(value, resting[index])),
      `${id} did not return to its held pose`);
    assert.ok(near(part()[property], restingPart), `${id} articulation did not reset`);
  }
  assert.equal(motionSignatures.size, ids.length, 'the seven held motions collapsed to a shared strike arc');

  assert.equal(tools.select(null), null);
  assert.equal(Object.values(tools.snapshot().visible).some(Boolean), false);
});

test('Cabin projects one truthful main objective and one contextual phone step', () => {
  const waitingPlan = {
    label: 'Lay low at the cabin',
    step: 'Answer Lou\u2019s call',
  };
  assert.deepEqual(presentation.cabinObjectivePresentation(waitingPlan), {
    label: 'Lay low at the cabin',
    step: 'Keep your phone close',
  });
  assert.deepEqual(presentation.cabinObjectivePresentation(waitingPlan, { phoneRinging: true }), {
    label: 'Answer Lou\u2019s call',
    step: 'Pick up the phone',
  });
  assert.deepEqual(presentation.cabinObjectivePresentation(waitingPlan, {
    phoneRinging: false,
    phoneConnected: true,
  }), {
    label: 'Hear Lou out',
    step: 'Stay on the line',
  });

  const restored = presentation.cabinObjectivePresentation({
    label: 'Finish Cabin Chapter',
    step: 'Finish the cabin chapter',
  });
  assert.equal(/finish.*cabin chapter/i.test(`${restored.label} ${restored.step}`), false);
  assert.match(mainSource, /onCallRinging:[\s\S]*?syncCampaignPresentation\(\)/,
    'the physical ring edge must repaint the main objective');
});

test('range HUD is scoped to the firing line and completed scores expire', () => {
  const line = { x: -33, z0: -26, z1: -14 };
  assert.equal(presentation.cabinRangeActivityContains({ x: -30.35, z: -20 }, line), true);
  assert.equal(presentation.cabinRangeActivityContains({ x: -23.5, z: -20 }, line), false);
  assert.equal(presentation.cabinRangeActivityContains({ x: -33, z: -4 }, line), false);

  const events = [];
  const session = new CabinRangeSession({ onEvent: (event) => events.push(event) });
  session.begin();
  session.recordShot({ triggerId: 'one' });
  assert.equal(session.finish('left-range'), true);
  const completed = session.snapshot();
  assert.equal(completed.finishReason, 'left-range');
  assert.equal(presentation.cabinRangeHudPresentation(completed, {
    now: 10,
    completeUntil: 14.5,
  }).visible, true);
  assert.equal(presentation.cabinRangeHudPresentation(completed, {
    now: 14.5,
    completeUntil: 14.5,
  }).visible, false);
  assert.equal(events.at(-1).type, 'complete');
  assert.match(mainSource, /updateShootingRangeLifecycle\(\)/);
  for (const reason of ['rest', 'level-transition', 'leave', 'pause']) {
    assert.match(mainSource, new RegExp(`clearShootingRange\\(\\{ reason: ['"]${reason}['"]`),
      `${reason} must clear the optional range lifecycle`);
  }
});

test('creek focus raises flowing water, lowers the forest, and exits on input or movement', () => {
  const volumeCalls = [];
  const mode = presentation.createCabinCreekListeningMode({
    audio: {
      setLoopVolume(key, volume, ramp) { volumeCalls.push({ key, volume, ramp }); },
    },
  });
  assert.equal(mode.begin({ x: 4, z: -31.45 }, 10), true);
  assert.equal(mode.snapshot().active, true);
  assert.deepEqual(volumeCalls.slice(0, 2).map(({ key, volume }) => [key, volume]), [
    ['cabin.creek', 0.30],
    ['cabin.forest', 0.055],
  ]);
  assert.equal(mode.handleInput(10.1), null, 'the activation release stays inside a short grace window');
  assert.equal(mode.handleInput(10.3), 'input');
  assert.equal(mode.snapshot().active, false);
  assert.deepEqual(volumeCalls.slice(-2).map(({ key, volume }) => [key, volume]), [
    ['cabin.forest', 0.21],
    ['cabin.firepit', 0.15],
  ]);

  mode.begin({ x: 4, z: -31.45 }, 20);
  assert.equal(mode.update({ x: 4.10, z: -31.45 }), null);
  assert.equal(mode.update({ x: 4.20, z: -31.45 }), 'movement');
  assert.equal(mode.snapshot().active, false);

  assert.match(mainSource, /startLoop\(['"]cabin\.creek['"][\s\S]*?position:\s*cabin\.landmarks\.creek\.position/,
    'nearby creek flow remains a positional ambient bed outside focus mode');
  assert.match(mainSource, /onCreekListen:\s*beginCreekListening/);
});

test('radio station HUD shares the Cabin receiver audible radius', () => {
  const receiver = { x: 0, y: 1, z: 0 };
  assert.equal(presentation.CABIN_RADIO_AUDIBLE_DISTANCE, 20);
  assert.equal(presentation.cabinRadioHudVisible({ x: 20, y: 1, z: 0 }, receiver), true);
  assert.equal(presentation.cabinRadioHudVisible({ x: 20.01, y: 1, z: 0 }, receiver), false);
  assert.match(mainSource, /hudVisible:\s*\(\)\s*=>\s*cabinRadioHudVisible/);
  assert.match(mainSource, /onPause:[\s\S]*?radio\.pause\(\)/);
  assert.match(mainSource, /onResume:[\s\S]*?radio\.resume\(\)/);
});

test('Cabin mirror safely reuses one renderer and preserves its authored fallback', () => {
  class WorkingMirror {
    constructor(scene, mesh) { this.scene = scene; this.mesh = mesh; }
    render() {}
  }
  class BrokenMirror {
    constructor() { throw new Error('unsupported target'); }
  }
  const scene = new THREE.Scene();
  const mirrorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x999999 }),
  );
  scene.add(mirrorMesh);
  const first = presentation.createCabinPlanarMirror(scene, mirrorMesh, {}, { MirrorClass: WorkingMirror });
  const second = presentation.createCabinPlanarMirror(scene, mirrorMesh, {}, { MirrorClass: BrokenMirror });
  assert.equal(second, first);

  const fallbackMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x777777 }),
  );
  scene.add(fallbackMesh);
  const fallbackMaterial = fallbackMesh.material;
  assert.equal(presentation.createCabinPlanarMirror(scene, fallbackMesh, {}, {
    MirrorClass: BrokenMirror,
  }), null);
  assert.equal(fallbackMesh.material, fallbackMaterial);
  assert.equal(fallbackMesh.userData.planarMirrorFallback, true);
});

test('pleasant Cabin sky exposes a daytime sun and drifting scattered cloud banks', () => {
  const scene = new THREE.Scene();
  const sky = presentation.createCabinSky(scene, { radius: 120 });
  assert.equal(sky.mesh.name, 'cabin-pleasant-sky');
  assert.equal(sky.sun.name, 'cabin-sky-sun');
  assert.equal(sky.clouds.children.length, 6);
  sky.update({ hour: 12, isDark: false, elapsedReal: 10 }, new THREE.Vector3(4, 2, 8));
  assert.equal(sky.sun.visible, true);
  assert.ok(sky.sun.position.length() > 80, 'the sun disk sits visibly against the dome');
  const drift = sky.clouds.rotation.y;
  sky.update({ hour: 13, isDark: false, elapsedReal: 20 }, new THREE.Vector3(8, 2, 8));
  assert.ok(sky.clouds.rotation.y > drift, 'cloud banks move subtly over time');
  assert.deepEqual(sky.root.position.toArray(), [8, 2, 8]);
  sky.update({ hour: 23, isDark: true }, new THREE.Vector3());
  assert.equal(sky.sun.visible, false);
  sky.dispose();
  assert.equal(sky.root.parent, null);
});

test('Cabin reflection resolves every persisted shared outfit ID without changing clothes', () => {
  const expectedIds = [
    'black_henley',
    'grey_henley',
    'good_shirt',
    'charcoal_suit',
    'cream_cashmere',
    'late-night_track_jacket',
    'cabin_workshirt',
  ];
  assert.deepEqual(Object.keys(playerBody.CABIN_PLAYER_OUTFITS).sort(), expectedIds.sort());
  for (const id of expectedIds) {
    assert.equal(playerBody.knownCabinPlayerOutfitId(id), id);
    assert.equal(playerBody.resolveCabinPlayerOutfit(id).id, id);
    const figure = playerBody.makeCabinPlayerFigure(id);
    assert.equal(figure.group.userData.resolvedOutfitId, id);
  }
  assert.equal(playerBody.knownCabinPlayerOutfitId('future_unknown_outfit'), DEFAULT_PLAYER_OUTFIT);

  const writes = [];
  const store = {
    read: () => 'future_unknown_outfit',
    write: (id) => { writes.push(id); return id; },
  };
  const canonical = playerBody.knownCabinPlayerOutfitId(store.read());
  const body = new FirstPersonBody(new THREE.Scene(), {
    factory: playerBody.makeCabinPlayerFigure,
    store,
    outfitId: canonical,
  });
  assert.equal(body.outfitId, DEFAULT_PLAYER_OUTFIT);
  assert.equal(body.group.userData.firstPersonBody.outfitId, DEFAULT_PLAYER_OUTFIT);
  assert.equal(body.group.userData.resolvedOutfitId, DEFAULT_PLAYER_OUTFIT);
  assert.equal(body.setOutfit('black_henley'), true);
  assert.deepEqual(writes, ['black_henley']);
  assert.match(mainSource, /store:\s*appearanceStore/);
  assert.match(mainSource, /outfitId:\s*initialCabinOutfitId/);
});

/* THE RIFLE HAS TO SURVIVE [Q].
 *
 * Owner: *"the gun at the cabin also isnt in my inventory i have it and then
 * I put it away and it dissapears instead of going into my inventory."* Two
 * halves fix that and both are asserted here, because neither shows up in a
 * headless scene run: the take has to spend a pocket, and the pocket has to
 * know how to draw a weapon id. `ITEMS` is the starter flat's catalog and a
 * slot holding `carbine` against it renders blank -- which is exactly what a
 * lost gun looks like. */
test('a rifle taken off a cabin rack lands in a pocket that can draw it', async () => {
  const { WEAPON_IDS, weaponDef } = await import('../src/core/weapons/index.js');
  const { ITEMS } = await import('../src/core/inventory.js');

  /* Every id mounted on a cabin rack, from all three mounts in main.js:
   * the cellar anteroom (dungeon.js armoryMounts), the main-room wall rack
   * (world.js CABIN_WALL_RACK_WEAPON) and the east-wall shotgun. */
  const rackIds = [
    WEAPON_IDS.AK47, WEAPON_IDS.BARRETT, WEAPON_IDS.CARBINE, WEAPON_IDS.SHOTGUN,
  ];
  for (const id of rackIds) {
    assert.ok(id, 'rack weapon id is defined');
    const def = weaponDef(id);
    assert.ok(def, `${id} has a weapon catalog entry`);
    assert.equal(typeof def.name, 'string');
    assert.ok(def.name.length > 0, `${id} has a name the pocket can print`);
    assert.equal(ITEMS[id], undefined, `${id} is not in the starter flat catalog`);
  }

  // The pocket catalog the HUD is handed, not the apartment one.
  assert.match(mainSource, /const CABIN_ITEMS = Object\.freeze\(\{/);
  assert.match(mainSource, /hud\.setInventory\(inventory, CABIN_ITEMS\)/);
  assert.doesNotMatch(mainSource, /hud\.setInventory\(inventory, ITEMS\)/);

  // The take spends a slot and selects it rather than selecting an empty one.
  assert.match(mainSource, /cabin\.inventory\.add\(event\.id\)/);
  assert.match(mainSource, /cabin\.inventory\.select\(slot\)/);
});
