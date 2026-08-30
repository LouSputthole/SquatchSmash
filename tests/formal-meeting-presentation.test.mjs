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
  specialMeetingModels,
} from '../src/specialmeeting/cast.js';
import { FAMILY } from '../src/bing/family.js';
import { ensureDomShim } from '../tools/three-shim.mjs';

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

/* The Special Meeting was the only scene in the campaign that staged named
 * Circle members and passed no `face` to the shared builder, so all four
 * attendees fell to the procedural drawn head while the same people wear the
 * owner's photographs in the Bing, the Mansion and the Initiation. That was
 * half of the owner's "missing faces" report (the other half was the unlit
 * cabin). These assertions are what nothing had: the scene's own model table
 * asked what each attendee is wearing, given an index of what has landed. */
test('the Special Meeting resolves its faces the way the club does', () => {
  const roster = new Map(FAMILY.map((member) => [member.id, member]));

  /* Nothing has landed: everybody keeps the authored head, and NOBODY carries
   * a path to a file that is not there. A model that names a missing PNG is a
   * 404 in every player's console, which is the reason the index exists. */
  for (const key of Object.keys(CAST_SPEC)) {
    assert.equal(SPECIAL_MEETING_MODELS[key].face, null,
      `${key} asks for a photograph with no index to say one exists`);
  }

  /* Everything has landed: all four wear a photograph, and the three on the
   * Bing roster wear the file THAT ROSTER names rather than one restated in
   * the scene. Kittenboss is not on the roster -- she is never in the club --
   * so the scene names hers, and this is the assertion that would catch it
   * drifting away from the name in `PHOTOS`. */
  const all = specialMeetingModels(new Set([
    'seff.png', 'lag.png', 'numbskull.png', 'kittenboss.png',
  ]));
  for (const [key, id] of [
    ['seff', CHARACTER_IDS.SEFF], ['lag', CHARACTER_IDS.LAG],
    ['numbskull', CHARACTER_IDS.NUMBSKULL],
  ]) {
    assert.equal(all[key].face, `assets/faces/${roster.get(id).photo}`,
      `${key} stopped taking his photograph's name from the Bing roster`);
  }
  assert.equal(all.kittenboss.face, 'assets/faces/kittenboss.png');

  /* A face is identity, so it has to survive the change of clothes: the
   * adapter strips garments off the canonical body and keeps everything else,
   * which is why the scene spreads `face` on BEFORE dressing anybody rather
   * than adding an option to `formalMeetingModel`. */
  assert.equal(all.kittenboss.gender, WARDROBE.kittenboss.gender);
  assert.equal(all.kittenboss.dress, 'suit');

  /* A landed photograph belonging to somebody ELSE changes nothing. None of
   * these four declares a `photoFallback` on the roster today -- the
   * Shubenator is the only member who does -- so the fallback branch is inert
   * here, and the failure it guards against is the one where a scene quietly
   * dresses a named character in the nearest portrait that happens to exist.
   * Which face a named character wears is the owner's call, never a
   * fallback's. */
  const someoneElse = specialMeetingModels(new Set(['stove.png', 'shubes.png']));
  for (const key of Object.keys(CAST_SPEC)) {
    assert.equal(someoneElse[key].face, null,
      `${key} put somebody else's photograph on his head`);
  }

  /* And the built cast is built from the resolved table, not from the bare
   * module-scope default -- the bug was never in the table, it was in nothing
   * ever handing one to the four bodies.
   *
   * The DOM shim is needed for exactly this line: a model that names a
   * photograph sends `makePerson` through `THREE.TextureLoader`, which builds
   * an <img>, and node has no document to build one with. It never resolves
   * and does not need to; what is being asked here is which URL the body was
   * built with. This is also why the headless gates get the no-arg default. */
  ensureDomShim();
  const scene = new THREE.Scene();
  const cast = buildSpecialMeetingCast(scene, { faces: new Set(['lag.png']) });
  assert.equal(cast.models.lag.face, 'assets/faces/lag.png');
  assert.equal(cast.models.seff.face, null);
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
