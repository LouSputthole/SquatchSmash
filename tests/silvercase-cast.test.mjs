/**
 * The Silver Case's cast, and the one rule it kept breaking.
 *
 * Ape is a campaign character, not a room's decoration: the same man is on the
 * Bada Bing floor, at the pillar table in the Silver Room, in the Bada Bing
 * two attack and at the Initiation. This mission originally described him
 * locally — a `core/person.js` palette with a couple of colours copied out of
 * `APE_FAMILY_MEMBER` and a hand-rolled scale fudge against a made-up 1.9 m
 * reference — which is a lookalike, not the man. These are the contracts that
 * keep the mission building the real one.
 *
 * The scale half of this matters as much as the identity half: the whole cast
 * used to be built on the Sasquatch Smash rig, which is a 2.6 m frame with no
 * height slider, in a flat with a 2.6 m ceiling.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { APE_FACE_URL, APE_FAMILY_MEMBER } from '../src/bing/family-ape.js';
import { FAMILY } from '../src/bing/family.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { getCharacter } from '../src/core/characters.js';
import {
  SILVERCASE_APE_PRESENTATION,
  identifySilverCaseApe,
} from '../src/silvercase/cast/ape.js';
import { COLLAPSE } from '../src/silvercase/cast/Actor.js';

test('The Silver Case builds the canonical Bing FAMILY Ape, not a local lookalike', async () => {
  const bingApe = FAMILY.find((member) => member.id === CHARACTER_IDS.APE);
  const faceIndex = JSON.parse(await readFile(
    new URL('../assets/faces/index.json', import.meta.url),
    'utf8',
  ));

  assert.equal(bingApe, APE_FAMILY_MEMBER);
  assert.equal(SILVERCASE_APE_PRESENTATION.characterId, CHARACTER_IDS.APE);
  assert.equal(SILVERCASE_APE_PRESENTATION.photo, 'ape.png');
  assert.equal(SILVERCASE_APE_PRESENTATION.face, APE_FACE_URL);
  assert.equal(SILVERCASE_APE_PRESENTATION.face, 'assets/faces/ape.png');
  assert.ok(faceIndex.files.includes(SILVERCASE_APE_PRESENTATION.photo));
  assert.deepEqual(
    { ...SILVERCASE_APE_PRESENTATION.model, face: undefined },
    { ...bingApe.model, face: undefined },
  );
});

test('the Silver Case Ape and the Silver Room Ape are the same presentation', async () => {
  /* Imported lazily so a failure here reads as "the two scenes disagree"
   * rather than as a missing module in an unrelated suite. */
  const { SILVER_APE_PRESENTATION } = await import('../src/silver/cast.js');
  assert.deepEqual(SILVERCASE_APE_PRESENTATION, SILVER_APE_PRESENTATION);
});

test('The Silver Case stamps Ape with the stable campaign identity', () => {
  const npc = { group: { userData: { npc: {} } } };

  assert.equal(identifySilverCaseApe(npc), npc);
  assert.equal(npc.characterId, CHARACTER_IDS.APE);
  assert.equal(npc.familyMember, APE_FAMILY_MEMBER);
  assert.equal(npc.group.userData.npc.characterId, CHARACTER_IDS.APE);
  assert.equal(npc.group.userData.npc.family, true);

  const identity = getCharacter(CHARACTER_IDS.APE);
  assert.equal(identity.voiceProfile, 'ape');
  assert.equal(identity.species, 'human');
});

test('Ape is a person-sized person, on the shared 1.78 m reference frame', () => {
  /* `makePerson` scales its whole figure by height/1.78, so a `height` in real
   * metres is the only scale instruction the mission is allowed to give. The
   * replaced code multiplied a 2.6 m rig by `build` on x and z and by
   * height/1.9 on y, which is neither a height nor a build. */
  assert.equal(SILVERCASE_APE_PRESENTATION.model.height, 1.88);
  assert.ok(SILVERCASE_APE_PRESENTATION.model.height < 2.0);
  assert.equal(SILVERCASE_APE_PRESENTATION.model.build, 1.3);
});

test('a man shot sitting down stays in the seat he was sitting in', () => {
  /* The owner's note: "The Dead guy after you shoot him on the couch should
   * remain on the couch." The seated collapse must not move the figure's own
   * transform to the floor — it happens in the trunk and the head. */
  assert.equal(COLLAPSE.seated.seat, true);
  assert.equal(COLLAPSE.standing.seat, false);
  assert.ok(COLLAPSE.seated.sink < 0.1, 'a slump settles into the cushion, it does not fall');
  assert.equal(COLLAPSE.seated.pitch, undefined, 'the seated collapse never pitches the figure');
  assert.equal(COLLAPSE.seated.roll, undefined, 'the seated collapse never rolls the figure');
  assert.ok(COLLAPSE.seated.bodyRoll > 0 && COLLAPSE.seated.bodyPitch > 0);
  /* A toppled figure has to be lifted clear of the floor as it goes over, or
   * half its chest ends up underneath it. */
  assert.ok(COLLAPSE.standing.lift > 0.15);
});
