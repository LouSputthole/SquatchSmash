import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { makePerson } from '../src/bing/cast.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import {
  FORMAL_MEETING_STYLES,
  formalMeetingModel,
  formalMeetingStyle,
} from '../src/core/formal-appearance.js';
import { WARDROBE } from '../src/core/wardrobe.js';
import {
  INITIATION_BARRAGE_SHOTS,
  InitiationBarrageClock,
  buildInitiationExecutionRevolver,
  fireInitiationExecutionRevolver,
  mountInitiationExecutionRevolver,
  updateInitiationExecutionRevolver,
} from '../src/initiation/presentation.js';
import {
  CAST_SPEC,
  SPECIAL_MEETING_MODELS,
  buildSpecialMeetingCast,
} from '../src/specialmeeting/cast.js';

test('the formal adapter replaces only garments and keeps character identity', () => {
  const base = Object.freeze({
    height: 1.79, build: 1.06, gut: 0.2,
    gender: 'female', bodyShape: 'curvy', skin: 0xdcae86,
    hair: 'tied', hairColour: 0x241a12, face: 'face.png', glasses: true,
    dress: 'gown', shirt: 0x8d94a4, luxury: true, tuxedo: true,
    pinstripe: true, threePiece: true, hat: 'fedora', barefoot: true,
    chain: 'silver', watch: 'gold', belt: 'gold',
  });
  const formal = formalMeetingModel(CHARACTER_IDS.KITTENBOSS, base);
  assert.ok(Object.isFrozen(formal));
  for (const key of [
    'height', 'build', 'gut', 'gender', 'bodyShape', 'skin', 'hair',
    'hairColour', 'face', 'glasses', 'chain', 'watch',
  ]) assert.equal(formal[key], base[key], `${key} identity drifted`);
  assert.equal(formal.dress, 'suit');
  assert.equal(formal.trim, true, 'a nice suit needs its collar and tie knot');
  assert.equal(formal.trouserFit, 'creased');
  assert.equal(formal.belt, 'gold', 'personal accessories survive the change of clothes');
  assert.equal(formal.tuxedo, false);
  assert.equal(formal.pinstripe, false);
  assert.equal(formal.threePiece, false);
  assert.equal(formal.pocketSquare, false, 'formal is not super-fancy');
  assert.equal(formal.barefoot, false);
});
test('formal colourways are stable per identity and varied across the meeting', () => {
  assert.ok(Object.isFrozen(FORMAL_MEETING_STYLES));
  assert.equal(formalMeetingStyle(CHARACTER_IDS.SEFF), formalMeetingStyle(CHARACTER_IDS.SEFF));
  const styles = Object.values(CAST_SPEC).map((spec) => formalMeetingStyle(spec.characterId));
  assert.ok(new Set(styles.map((style) => style.jacket)).size >= 3,
    'the cast became a matching security uniform');
});

test('every Special Meeting attendee is their canonical body in a restrained formal suit', () => {
  for (const [key, spec] of Object.entries(CAST_SPEC)) {
    const model = SPECIAL_MEETING_MODELS[key];
    assert.ok(model, `${key} has no scene model`);
    assert.equal(model.dress, 'suit');
    assert.equal(model.trim, true);
    assert.equal(model.tuxedo, false);
    assert.equal(model.characterId, undefined, 'identity belongs to the actor, not garment data');
    if (key === 'kittenboss') {
      assert.equal(model.height, WARDROBE.kittenboss.height);
      assert.equal(model.gender, WARDROBE.kittenboss.gender);
      assert.equal(model.bodyShape, WARDROBE.kittenboss.bodyShape);
      assert.equal(model.hair, WARDROBE.kittenboss.hair);
    }
    assert.ok(spec.voice, `${key} lost its voice while changing clothes`);
  }

  const scene = new THREE.Scene();
  const cast = buildSpecialMeetingCast(scene);
  for (const [key, spec] of Object.entries(CAST_SPEC)) {
    assert.equal(cast[key].characterId, spec.characterId);
    assert.equal(cast[key].parts.profile.outfit, 'suit');
  }
});

test('the Initiation barrage is an authored 2/3/3 rhythm that survives slow frames', () => {
  assert.equal(INITIATION_BARRAGE_SHOTS.length, 8);
  assert.deepEqual(
    [0, 1, 2].map((group) => INITIATION_BARRAGE_SHOTS.filter((shot) => shot.group === group).length),
    [2, 3, 3],
  );
  const gaps = INITIATION_BARRAGE_SHOTS.slice(1)
    .map((shot, index) => +(shot.at - INITIATION_BARRAGE_SHOTS[index].at).toFixed(2));
  assert.ok(gaps[1] > gaps[0], 'the first group has no deliberate pause after it');
  assert.ok(gaps[4] > gaps[3], 'the second group has no deliberate pause after it');

  const clock = new InitiationBarrageClock().start();
  const events = [
    ...clock.update(0.01),
    ...clock.update(0.9),
    ...clock.update(2),
  ];
  assert.deepEqual(events.map((event) => event.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(clock.done, true);
});

test('the Initiation presentation uses the catalog revolver with flash and recoil', () => {
  const parts = makePerson({ height: 1.76, build: 1.3, dress: 'suit', trim: true, face: null });
  const holder = { parts };
  const gun = buildInitiationExecutionRevolver();
  assert.ok(gun.getObjectByName('revolver-barrel'));
  assert.equal(mountInitiationExecutionRevolver(holder, gun), gun);
  assert.equal(gun.userData.characterWeaponId, 'revolver');
  assert.equal(fireInitiationExecutionRevolver(gun, 4), true);
  assert.equal(gun.userData.initiationFlash.visible, true);
  assert.equal(gun.userData.initiationRecoil, 1);
  updateInitiationExecutionRevolver(gun, 0.2);
  assert.equal(gun.userData.initiationFlash.visible, false);
  assert.equal(gun.userData.initiationRecoil, 0);
});
