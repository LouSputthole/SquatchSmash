import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { fromWardrobe, makeOldStove } = await import('../src/beefrun/npc.js');
const { createCrew } = await import('../src/enolasquatch/crew.js');
const { CAPTAIN_LOU_SASOLE } = await import('../src/core/wardrobe.js');
const { makeMorningGuest } = await import('../src/world/dressing.js');
const { makeSilverCaseProspectViewArm } = await import('../src/silvercase/cast/prospect.js');

function semanticNames(figure) {
  const names = new Set();
  const anonymous = [];
  figure.group.traverse((object) => {
    if (object.name) names.add(object.name);
    else if (object.isObject3D) anonymous.push({
      type: object.type,
      parent: object.parent?.name || '(anonymous)',
    });
  });
  return { names, anonymous };
}

test('Old Stove exposes a semantic name for every reusable private-figure object', () => {
  const { names, anonymous } = semanticNames(makeOldStove());
  assert.deepEqual(anonymous, [], `Old Stove has anonymous reusable objects: ${JSON.stringify(anonymous)}`);
  for (const name of [
    'stove', 'stove-hips', 'stove-torso', 'stove-neck', 'stove-head',
    'stove-arm-right-shoulder', 'stove-arm-right-upper',
    'stove-arm-right-elbow', 'stove-arm-right-forearm', 'stove-arm-right-hand',
    'stove-arm-left-shoulder', 'stove-arm-left-upper',
    'stove-arm-left-elbow', 'stove-arm-left-forearm', 'stove-arm-left-hand',
    'stove-leg-right-hip', 'stove-leg-right-thigh', 'stove-leg-right-knee',
    'stove-leg-right-shin', 'stove-leg-right-boot',
    'stove-leg-left-hip', 'stove-leg-left-thigh', 'stove-leg-left-knee',
    'stove-leg-left-shin', 'stove-leg-left-boot',
    'stove-headset-cup-right', 'stove-headset-cup-left',
    'stove-headset-band', 'stove-headset-boom',
    'stove-parachute-front-strap-right', 'stove-parachute-front-strap-left',
    'stove-parachute-back-strap-right', 'stove-parachute-back-strap-left',
    'stove-parachute-leg-loop-right', 'stove-parachute-leg-loop-left',
    'stove-parachute-buckle-right', 'stove-parachute-buckle-left',
    'stove-parachute-chest-strap', 'stove-parachute-pack',
    'stove-folder', 'name-tag',
  ]) assert.ok(names.has(name), `Old Stove lost semantic object ${name}`);
});

test('all four fixed Enola crew figures expose semantic private-rig objects and carried gear', () => {
  const crew = createCrew();
  const expected = {
    sasole: [
      'captain_lou_sasole-hips', 'captain_lou_sasole-torso',
      'captain_lou_sasole-neck', 'captain_lou_sasole-head',
      'captain_lou_sasole-headset-cup-right', 'captain_lou_sasole-headset-cup-left',
      'captain_lou_sasole-headset-band', 'name-tag',
    ],
    irish: [
      'irish-hips', 'irish-torso', 'irish-neck', 'irish-head',
      'irish-chart', 'name-tag',
    ],
    numbskull: [
      'numbskull-hips', 'numbskull-torso', 'numbskull-neck', 'numbskull-head',
      'numbskull-cap-crown', 'numbskull-cap-brim', 'numbskull-wrench', 'name-tag',
    ],
    shubes: [
      'shubes-hips', 'shubes-torso', 'shubes-neck', 'shubes-head',
      'shubes-flight-helmet', 'shubes-headset-cup-right',
      'shubes-headset-cup-left', 'name-tag',
    ],
  };
  for (const [key, required] of Object.entries(expected)) {
    const { names, anonymous } = semanticNames(crew[key]);
    assert.deepEqual(anonymous, [],
      `${key} has anonymous reusable objects: ${JSON.stringify(anonymous)}`);
    for (const name of required) assert.ok(names.has(name), `${key} lost semantic object ${name}`);
  }
});

test('Enola Captain Sasole adapts the canonical wardrobe and keeps only scene-owned flight gear local', () => {
  const sasole = createCrew().sasole;
  const expected = fromWardrobe(CAPTAIN_LOU_SASOLE);
  const objects = new Map();
  sasole.group.traverse((object) => objects.set(object.name, object));
  const colour = (name) => objects.get(name)?.material?.color?.getHex();

  assert.equal(colour('captain_lou_sasole-torso'), expected.jacket);
  assert.equal(colour('captain_lou_sasole-jacket-front'), expected.shirt);
  assert.equal(colour('captain_lou_sasole-arm-left-hand'), expected.skin);
  assert.equal(colour('captain_lou_sasole-leg-left-thigh'), expected.trousers);
  assert.equal(sasole.head.material[0].color.getHex(), expected.hair);
  assert.equal(sasole.torso?.geometry?.parameters?.width
    ?? objects.get('captain_lou_sasole-torso').geometry.parameters.width,
  0.42 + expected.build * 0.16);

  for (const name of [
    'captain_lou_sasole-jacket-waistband', 'captain_lou_sasole-jacket-collar',
    'captain_lou_sasole-jacket-zip', 'captain_lou_sasole-jacket-patch-shoulder',
    'captain_lou_sasole-jacket-name-tape', 'captain_lou_sasole-belt',
    'captain_lou_sasole-belt-buckle', 'captain_lou_sasole-cuff-right',
    'captain_lou_sasole-cuff-left', 'captain_lou_sasole-watch',
    'captain_lou_sasole-trouser-crease-right',
    'captain_lou_sasole-trouser-crease-left',
    'captain_lou_sasole-headset-cup-right',
    'captain_lou_sasole-headset-cup-left', 'captain_lou_sasole-headset-band',
    'name-tag',
  ]) assert.ok(objects.has(name), `Enola Sasole lost canonical/local object ${name}`);
  assert.equal(sasole.pose, 'lean', 'Enola walkaround pose must remain scene-owned');
});

test('Apartment Margo exposes semantic names across her protected private rig', () => {
  const { names, anonymous } = semanticNames(makeMorningGuest());
  assert.deepEqual(anonymous, [],
    `Apartment Margo has anonymous reusable objects: ${JSON.stringify(anonymous)}`);
  for (const name of [
    'margo', 'margo.upper', 'margo.outfit.blouse',
    'margo.outfit.blouse.waist', 'margo.outfit.blouse.ribs',
    'margo.outfit.blouse.shoulders', 'margo.outfit.dress-closure',
    'margo.outfit.jeans.waistband', 'margo.legs',
    'margo.leg.right.shoe', 'margo.leg.left.shoe', 'margo.head',
  ]) assert.ok(names.has(name), `Apartment Margo lost semantic object ${name}`);
});

test('Silver Case Prospect view arm exposes semantic names for every reusable object', () => {
  const { names, anonymous } = semanticNames({ group: makeSilverCaseProspectViewArm() });
  assert.deepEqual(anonymous, [],
    `Silver Case Prospect arm has anonymous reusable objects: ${JSON.stringify(anonymous)}`);
  for (const name of [
    'silvercase.viewmodel.prospect-arm', 'silvercase.viewmodel.hand',
    'silvercase.viewmodel.shirt-cuff', 'silvercase.viewmodel.suit-sleeve',
  ]) assert.ok(names.has(name), `Silver Case Prospect arm lost semantic object ${name}`);
});
