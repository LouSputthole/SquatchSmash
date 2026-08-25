import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import { CABIN, PROPERTY } from '../src/cabin/field.js';

ensureDomShim();
ensureThreeShim();

const [
  { buildCountrysideCabin },
  {
    WAG_ACTIVITY_LOOP,
    WAG_DIALOGUE_CATALOG,
    WAG_VOICE_PREFIX,
    buildWagActor,
    createWagHintDirector,
    speakWagLine,
  },
  { AudioEngine, RequiredRecordedAudioError },
  THREE,
] = await Promise.all([
  import('../src/cabin/world.js'),
  import('../src/cabin/wag.js'),
  import('../src/core/audio.js'),
  import('three'),
]);

const SOUND_MANIFEST = JSON.parse(fs.readFileSync(
  new URL('../assets/sfx/manifest.json', import.meta.url),
  'utf8',
));

test('Wag hints require explicit interaction, cool down, avoid repeats, and retire discovered targets', () => {
  const rolls = [0, 0, 0.45, 0.9];
  const director = createWagHintDirector({
    random: () => rolls.shift() ?? 0,
    cooldownSeconds: 5,
    chopCooldownSeconds: 8,
  });

  const initialEligible = director.debug.eligible;
  assert.ok(initialEligible.includes('cabin.computer'));
  assert.ok(initialEligible.includes('property.bridge'));

  const first = director.talk({ now: 0 });
  assert.equal(first.ok, true);
  assert.equal(first.cue, `${WAG_VOICE_PREFIX}${first.id}`);
  assert.equal(director.canTalk(1), false);
  assert.deepEqual(director.talk({ now: 1 }), {
    ok: false,
    reason: 'cooldown',
    remaining: 4,
  });

  const second = director.talk({ now: 5 });
  assert.equal(second.ok, true);
  assert.notEqual(second.id, first.id, 'random pools must not immediately repeat a line');

  for (const discovery of [
    'computer', 'drawing-board', 'bedroom', 'wardrobe', 'entertainment',
    'trailhead', 'bridge', 'creek', 'shed', 'overlook', 'firepit',
  ]) director.discover(discovery);

  const afterExploration = director.debug.eligible;
  assert.equal(afterExploration.some((id) => id.startsWith('cabin.')), false);
  assert.equal(afterExploration.some((id) => id.startsWith('property.')), false);
  assert.ok(afterExploration.some((id) => id.startsWith('after.')));

  const chop = director.reactToChop({ now: 13 });
  assert.equal(chop.ok, true);
  assert.equal(chop.cue, `${WAG_VOICE_PREFIX}${chop.id}`);
  assert.equal(director.reactToChop({ now: 15 }).reason, 'cooldown');
  const laterChop = director.reactToChop({ now: 21 });
  assert.equal(laterChop.ok, true);
  assert.notEqual(laterChop.id, chop.id);
});

test('every Wag subtitle owns one exact manifest cue and there are no kind-level voice banks', () => {
  assert.equal(WAG_DIALOGUE_CATALOG.length, 30);
  assert.equal(new Set(WAG_DIALOGUE_CATALOG.map(({ text }) => text)).size, 30,
    'distinct spoken subtitles must stay distinct production performances');
  assert.equal(new Set(WAG_DIALOGUE_CATALOG.map(({ cue }) => cue)).size, 30,
    'two subtitles cannot resolve to the same recording');

  const source = [...WAG_DIALOGUE_CATALOG]
    .map(({ cue, text }) => ({ name: cue, voice: 'wag', say: text }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const manifest = SOUND_MANIFEST.sfx
    .filter(({ name }) => name.startsWith(WAG_VOICE_PREFIX))
    .map(({ name, voice, say }) => ({ name, voice, say }))
    .sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(manifest, source,
    'src/cabin/wag.js and assets/sfx/manifest.json differ in one or both directions');
  assert.ok(SOUND_MANIFEST.voices.wag, 'Wag needs his own casting slot');

  for (const kind of new Set(WAG_DIALOGUE_CATALOG.map(({ kind }) => kind))) {
    assert.equal(SOUND_MANIFEST.sfx.some(({ name }) => name === `${WAG_VOICE_PREFIX}${kind}`), false,
      `${kind} regressed to a random bank instead of exact subtitle-to-cue routing`);
  }
});

test('Wag speech uses the shared positional receipt path with exact subtitle evidence', () => {
  const calls = [];
  const held = [];
  const audio = {
    manifest: SOUND_MANIFEST,
    hasSample: () => true,
    sampleDuration: () => 2.75,
    playWithReceipt(cue, options) {
      calls.push({ cue, options });
      return {
        source: { cue },
        receipt: {
          requested: cue,
          actual: cue,
          source: 'buffer',
          started: true,
          requiredRecorded: options.requiredRecorded,
          subtitle: options.subtitle,
        },
      };
    },
    hold(seconds) { held.push(seconds); },
  };
  const speaker = new THREE.Object3D();

  for (const line of WAG_DIALOGUE_CATALOG) {
    const spoken = speakWagLine(audio, { ...line, ok: true }, { speaker });
    assert.equal(spoken.cue, line.cue);
    assert.equal(spoken.subtitle, line.text);
    assert.equal(spoken.receipt.requested, line.cue);
    assert.equal(spoken.receipt.actual, line.cue);
    assert.equal(spoken.receipt.source, 'buffer');
  }

  assert.equal(calls.length, WAG_DIALOGUE_CATALOG.length);
  assert.equal(held.length, WAG_DIALOGUE_CATALOG.length);
  for (let index = 0; index < calls.length; index += 1) {
    const { cue, options } = calls[index];
    const line = WAG_DIALOGUE_CATALOG[index];
    assert.equal(cue, line.cue);
    assert.equal(options.subtitle, line.text);
    assert.equal(options.requiredRecorded, true);
    assert.equal(options.bus, 'voice');
    assert.equal(options.analyse, true);
    assert.equal(options.speakerId, 'cabin.wag');
    assert.equal(options.follow, speaker);
    assert.equal(options.ref, 2.2);
    assert.equal(options.maxDist, 30);
    assert.equal(options.rolloff, 0.7);
    assert.equal(options.requestedCue, undefined,
      'an exact Wag recording may not be disguised behind a requested-cue stand-in');
  }
});

test('strict QA fails closed instead of synthesizing or substituting a missing Wag take', () => {
  const line = WAG_DIALOGUE_CATALOG[0];
  const audio = new AudioEngine({ strictQa: true });
  /* Reach the missing-buffer gate without constructing a browser AudioContext.
   * Strict QA throws before graph creation, which is the behavior under test. */
  audio.ready = true;

  assert.throws(
    () => speakWagLine(audio, { ...line, ok: true }),
    (error) => error instanceof RequiredRecordedAudioError
      && error.receipt.requested === line.cue
      && error.receipt.actual === line.cue
      && error.receipt.source === 'synth'
      && error.receipt.requiredRecorded === true
      && error.receipt.started === false,
  );
  assert.equal(audio.qaViolations.length, 1);
  assert.equal(audio.playbackReceipts.length, 1);
});

test('Wag is a shared-rig country worker with a real four-state firewood loop and talk-facing', () => {
  const scene = new THREE.Scene();
  const wag = buildWagActor({ scene, x: 0, y: 0, z: 0, yaw: Math.PI });

  assert.equal(wag.group.parent, scene);
  assert.equal(wag.group.name, 'cabin-wag');
  assert.equal(wag.group.userData.npc.name, 'Wag');
  assert.equal(wag.group.userData.npc.outfit, 'work');
  assert.equal(wag.group.userData.actor.id, 'cabin.wag');
  assert.equal(wag.axe.parent, wag.npc.parts.handR);
  assert.equal(wag.carriedLog.parent, wag.npc.parts.handL);
  assert.deepEqual(WAG_ACTIVITY_LOOP.map(({ id }) => id), ['chop', 'stack', 'lean', 'idle']);

  assert.equal(wag.debug.activityAt(0), 'chop');
  assert.equal(wag.debug.activityAt(5.3), 'stack');
  assert.equal(wag.debug.activityAt(9.2), 'lean');
  assert.equal(wag.debug.activityAt(14.2), 'idle');
  assert.equal(wag.npc.speaking, 0, 'the ambient update must not emit dialogue by itself');

  wag.update(5.3, new THREE.Vector3(20, 0, 20));
  assert.equal(wag.debug.activity, 'stack');
  assert.equal(wag.axe.visible, false);
  assert.equal(wag.carriedLog.visible, true);

  wag.speakTo(new THREE.Vector3(4, 0, 0), 1);
  wag.update(0.1, new THREE.Vector3(4, 0, 0));
  assert.equal(wag.debug.activity, 'talk');
  assert.ok(Math.abs(wag.group.rotation.y - Math.PI / 2) < 1e-9, 'Wag turns to the player when spoken to');
  assert.ok(wag.npc.speaking > 0);

  wag.update(1.1, new THREE.Vector3(4, 0, 0));
  wag.update(0.01, new THREE.Vector3(4, 0, 0));
  assert.notEqual(wag.debug.activity, 'talk');
});

test('the built property registers Wag separately and firewood splitting is repeatable physical activity', async () => {
  const registered = new Map();
  const discoveries = [];
  const calls = { wag: 0, firepit: 0 };
  let wagEnabled = true;
  let firepitProgress = null;
  const cabin = await buildCountrysideCabin({
    scene: new THREE.Scene(),
    externalLighting: true,
    interaction: { register(target, descriptor) { registered.set(target, descriptor); } },
    onDiscover: (id) => discoveries.push(id),
    onLandmark: (id) => ({ id, firstVisit: true }),
    onWag: () => { calls.wag++; },
    canTalkToWag: () => wagEnabled,
    onFirepit: (progress) => {
      calls.firepit++;
      firepitProgress = progress;
    },
  });

  assert.equal(cabin.interactionTargets.wag, cabin.wag.group);
  assert.equal(cabin.wag.group.userData.interact, registered.get(cabin.wag.group));
  const wagView = cabin.interactionViewpoints.wag;
  const wagRay = new THREE.Raycaster(
    wagView.position,
    wagView.lookAt.clone().sub(wagView.position).normalize(),
    0,
    2.7,
  );
  assert.ok(wagRay.intersectObject(cabin.wag.group, true).length > 0, 'Wag has a live reachable talk ray');
  assert.equal(registered.get(cabin.wag.group).enabled(), true);
  registered.get(cabin.wag.group).onUse();
  assert.equal(calls.wag, 1);
  wagEnabled = false;
  assert.equal(registered.get(cabin.wag.group).enabled(), false);

  const woodDescriptor = registered.get(cabin.interactionTargets.woodpile);
  assert.equal(woodDescriptor.hold, 0.68);
  assert.equal(cabin.woodpileState.splitCount, 0);
  assert.equal(cabin.splitWood(), true);
  assert.equal(cabin.woodpileState.splitting, true);
  assert.equal(cabin.woodpileState.splitCount, 1);
  assert.equal(cabin.splitWood(), false, 'a log cannot be split twice during its kick animation');
  cabin.update(1.2, 1.2, new THREE.Vector3(0, 0, 0));
  assert.equal(cabin.woodpileState.splitting, false);
  assert.equal(cabin.splitWood(), true, 'a fresh round is set after the animation');

  registered.get(cabin.interactionTargets.firepit).onUse();
  assert.equal(calls.firepit, 1);
  assert.deepEqual(firepitProgress, { id: 'firepit', firstVisit: true });
  assert.ok(discoveries.includes('firepit'));

  /* Direct geometry evidence for the rest of the cabin-owned polish pass. */
  cabin.root.updateMatrixWorld(true);
  const terrain = cabin.root.getObjectByName('cabin-property-heightfield');
  const terrainWidth = Math.round((PROPERTY.maxX - PROPERTY.minX) / 2) + 1;
  const terrainDepth = Math.round((PROPERTY.maxZ - PROPERTY.minZ) / 2) + 1;
  assert.equal(
    terrain.geometry.index.count,
    (terrainWidth - 1) * (terrainDepth - 1) * 6,
    'terrain triangles continue beneath the cabin instead of leaving a blue gap',
  );

  const car = cabin.root.getObjectByName('cabin-parked-wagon');
  const wheels = car.children.filter((child) => child.name.startsWith('cabin-parked-wagon-wheel-'));
  assert.equal(wheels.length, 4);
  assert.ok(wheels.every((wheel) => Math.abs(Math.abs(wheel.position.x) - 0.94) < 1e-9));
  assert.ok(wheels.every((wheel) => Math.abs(Math.abs(wheel.position.z) - 1.45) < 1e-9));
  assert.ok(wheels.every((wheel) => Math.abs(wheel.rotation.z - Math.PI / 2) < 1e-9));
  assert.ok(Math.abs(car.rotation.y - 0.18) < 1e-9, 'body and wheels inherit one vehicle transform');

  const shedRoof = cabin.root.getObjectByName('cabin-forestry-shed-roof');
  assert.ok(shedRoof);
  assert.equal(shedRoof.rotation.x, 0, 'the level roof meets every level shed top plate');
  assert.equal(shedRoof.rotation.z, 0);

  const wardrobe = cabin.root.getObjectByName('cabin-wardrobe');
  const wardrobeBounds = new THREE.Box3().setFromObject(wardrobe);
  assert.ok(CABIN.main.z1 - wardrobeBounds.max.z < 0.16, 'wardrobe is backed against the cabin wall');
  assert.ok(wardrobeBounds.max.z <= CABIN.main.z1 + 0.03);

  const westChair = cabin.root.getObjectByName('cabin-central-chair-west');
  const eastChair = cabin.root.getObjectByName('cabin-central-chair-east');
  assert.ok(Math.abs(westChair.rotation.y - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(eastChair.rotation.y + Math.PI / 2) < 1e-9);

  const kitchen = cabin.root.getObjectByName('kitchen');
  assert.ok(kitchen, 'the cabin includes the shared kitchen assembly');
  const lowerPulls = [];
  const upperPulls = [];
  kitchen.traverse((object) => {
    if (object.name.startsWith('cabinet-pull:lower-')) lowerPulls.push(object);
    if (object.name.startsWith('cabinet-pull:upper-')) upperPulls.push(object);
  });
  lowerPulls.sort((a, b) => Number(a.name.split('-').at(-1)) - Number(b.name.split('-').at(-1)));
  upperPulls.sort((a, b) => Number(a.name.split('-').at(-1)) - Number(b.name.split('-').at(-1)));
  assert.equal(lowerPulls.length, 6);
  assert.equal(upperPulls.length, 5);
  for (const pulls of [lowerPulls, upperPulls]) {
    for (let i = 0; i + 1 < pulls.length; i += 2) {
      assert.ok(Math.abs(pulls[i + 1].position.z - pulls[i].position.z - 0.2) < 1e-9,
        'paired cabinet pulls sit together at their doors\' meeting edge');
    }
  }
  assert.ok(Math.abs(upperPulls.at(-1).position.z - 0.596) < 0.001,
    'an unpaired final upper door keeps one honest centred pull');

  assert.ok(cabin.desk.keyLeds.length >= 58, 'the PC has a visible keyboard and mouse lighting set');
  const deskPhoto = cabin.root.getObjectByName('cabin-art:desk.photo');
  assert.ok(deskPhoto.position.z < -4.7, 'the dog picture is behind the mouse pad');
  assert.ok(cabin.root.getObjectByName('cabin-art:bed.under'), 'the under-bed photo is an intentional inspectable object');

  assert.equal(cabin.mirrorMesh.userData.planarMirrorSurface, true);
  assert.ok(cabin.root.getObjectByName('cabin-bathroom-liner-north'));
  assert.ok(cabin.root.getObjectByName('cabin-bathroom-liner-west'));
  assert.ok(cabin.root.getObjectByName('cabin-bathroom-liner-east'));
  const toilet = cabin.root.getObjectByName('cabin-bath-toilet');
  const toiletRollBracket = cabin.root.getObjectByName('cabin-bath-toilet-roll-wall-bracket');
  assert.equal(toiletRollBracket.userData.geometryGate.assemblyId, toilet.userData.geometryGate.assemblyId);
  const northWallCollider = cabin.colliders.find(({ name }) => name === 'cabin-bath-north');
  const toiletCollider = cabin.colliders.find(({ name }) => name === 'cabin-bath-toilet');
  const eastWallCollider = cabin.colliders.find(({ name }) => name === 'cabin-bath-east');
  const sinkCollider = cabin.colliders.find(({ name }) => name === 'cabin-bath-sink');
  assert.ok(Math.abs(toiletCollider.min.z - northWallCollider.max.z) < 1e-9,
    'padded toilet and north-wall colliders stop at the same interior face');
  assert.ok(Math.abs(sinkCollider.max.x - eastWallCollider.min.x) < 1e-9,
    'padded sink and east-wall colliders stop at the same interior face');

  const sideboard = cabin.root.getObjectByName('cabin-entertainment-sideboard');
  assert.ok(Math.abs(sideboard.rotation.y - Math.PI) < 1e-9, 'drawers face the bed and room');
  const sideboardBounds = new THREE.Box3().setFromObject(sideboard);
  assert.ok(CABIN.main.z1 - sideboardBounds.max.z < 0.08, 'entertainment unit is flush to the wall');
  const wallClock = cabin.root.getObjectByName('cabin-south-wall-clock');
  assert.deepEqual(wallClock.position.toArray(), [-1.8, 2.37, CABIN.main.z1 - 0.01]);
  const mainBanner = cabin.root.getObjectByName('cabin-art:banner.main');
  assert.deepEqual(mainBanner.position.toArray(), [0.70, 1.85, CABIN.main.z1 - 0.04]);

  const chimney = cabin.root.getObjectByName('cabin-roof-chimney-stack');
  const chimneyBounds = new THREE.Box3().setFromObject(chimney);
  assert.ok(chimneyBounds.min.y > 3.05, 'roof chimney no longer intrudes into the kitchen');

  await cabin.models;
  cabin.dispose();
});
