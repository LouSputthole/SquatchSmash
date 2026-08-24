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
import * as THREE from 'three';

import { makePerson } from '../src/bing/cast.js';
import {
  APE_FACE_URL,
  APE_FAMILY_MEMBER,
  APE_SILVER_ROOM,
} from '../src/bing/family-ape.js';
import { FAMILY } from '../src/bing/family.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { getCharacter } from '../src/core/characters.js';
import {
  SILVERCASE_APE_PRESENTATION,
  identifySilverCaseApe,
} from '../src/silvercase/cast/ape.js';
import { COLLAPSE, makeActor } from '../src/silvercase/cast/Actor.js';

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
  for (const field of ['height', 'build', 'hair', 'hairColour', 'beard', 'skin']) {
    assert.equal(SILVERCASE_APE_PRESENTATION.model[field], bingApe.model[field], field);
  }
});

test('Silver Room Ape has his exact formal look while Silver Case keeps his body and face', async () => {
  /* Imported lazily so a failure here reads as "the two scenes disagree"
   * rather than as a missing module in an unrelated suite. Clothes are the
   * intentional scene-local difference: this is the Pulp Fiction job. */
  const { SILVER_APE_PRESENTATION } = await import('../src/silver/cast.js');
  assert.equal(SILVERCASE_APE_PRESENTATION.characterId, SILVER_APE_PRESENTATION.characterId);
  assert.equal(SILVERCASE_APE_PRESENTATION.photo, SILVER_APE_PRESENTATION.photo);
  assert.equal(SILVERCASE_APE_PRESENTATION.face, SILVER_APE_PRESENTATION.face);
  assert.equal(SILVER_APE_PRESENTATION.model, APE_SILVER_ROOM);
  assert.equal(APE_SILVER_ROOM.face, APE_FACE_URL);
  for (const field of ['height', 'build', 'hair', 'hairColour', 'beard', 'skin']) {
    assert.equal(APE_SILVER_ROOM[field], APE_FAMILY_MEMBER.model[field], `Silver Room ${field}`);
    assert.equal(SILVERCASE_APE_PRESENTATION.model[field], APE_SILVER_ROOM[field], `Silver Case ${field}`);
  }

  assert.equal(APE_SILVER_ROOM.dress, 'suit');
  assert.equal(APE_SILVER_ROOM.shirt, 0x111317, 'black open-collar shirt');
  assert.equal(APE_SILVER_ROOM.shirtAccent, 0x111317, 'black shirt accent');
  assert.equal(APE_SILVER_ROOM.jacketColour, 0x30352d, 'charcoal-olive jacket');
  assert.equal(APE_SILVER_ROOM.trouserColour, 0x111214, 'black trousers');
  assert.equal(APE_SILVER_ROOM.tie, false);
  assert.equal(APE_SILVER_ROOM.workVest, false);
  assert.equal(APE_SILVER_ROOM.chain, 'silver');
  assert.equal(APE_SILVER_ROOM.watch, 'silver');
  assert.equal(SILVERCASE_APE_PRESENTATION.model.dress, 'suit');
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

test('Silver Case dresses the canonical Ape in a Pulp Fiction black suit, white shirt, and black tie', () => {
  const ape = makePerson({ ...SILVERCASE_APE_PRESENTATION.model, face: null });
  const namedMesh = (name) => ape.group.getObjectByName(name);
  const colour = (name) => namedMesh(name)?.material?.color?.getHex();

  assert.equal(ape.profile.outfit, 'suit');
  assert.equal(SILVERCASE_APE_PRESENTATION.model.dress, 'suit');
  assert.equal(SILVERCASE_APE_PRESENTATION.model.jacketColour, 0x111116);
  assert.equal(SILVERCASE_APE_PRESENTATION.model.shirtAccent, 0xf2efe7);
  assert.equal(SILVERCASE_APE_PRESENTATION.model.tieColour, 0x09090c);
  assert.equal(SILVERCASE_APE_PRESENTATION.model.trouserColour, 0x111116);
  assert.equal(colour('suit.lapel.left'), 0x111116);
  assert.equal(colour('suit.collar.point'), 0xf2efe7);
  assert.equal(colour('suit.tie'), 0x09090c);
  assert.equal(colour('suit.tie.knot'), 0x09090c);
});

test('Silver Case gives canonical Tony the matching suit contract and a visible white cuff', async () => {
  const {
    SILVERCASE_PROSPECT_PRESENTATION,
    makeSilverCaseProspectViewArm,
  } = await import('../src/silvercase/cast/prospect.js');
  const identity = getCharacter(CHARACTER_IDS.PROSPECT);
  const figure = makePerson({ ...SILVERCASE_PROSPECT_PRESENTATION.model, face: null });
  const viewArm = makeSilverCaseProspectViewArm();
  const colour = (root, name) => root.getObjectByName(name)?.material?.color?.getHex();

  assert.equal(SILVERCASE_PROSPECT_PRESENTATION.characterId, CHARACTER_IDS.PROSPECT);
  assert.equal(SILVERCASE_PROSPECT_PRESENTATION.canonicalName, identity.canonicalName);
  assert.equal(SILVERCASE_PROSPECT_PRESENTATION.subtitleName, identity.subtitleName);
  assert.equal(SILVERCASE_PROSPECT_PRESENTATION.voiceProfile, identity.voiceProfile);
  assert.equal(SILVERCASE_PROSPECT_PRESENTATION.face, null, 'do not invent a face Tony does not have');
  assert.equal(figure.profile.outfit, 'suit');
  assert.equal(colour(figure.group, 'suit.lapel.left'), 0x111116);
  assert.equal(colour(figure.group, 'suit.collar.point'), 0xf2efe7);
  assert.equal(colour(figure.group, 'suit.tie'), 0x09090c);
  assert.equal(viewArm.userData.characterPresentation.id, CHARACTER_IDS.PROSPECT);
  assert.equal(colour(viewArm, 'silvercase.viewmodel.suit-sleeve'), 0x111116);
  assert.equal(colour(viewArm, 'silvercase.viewmodel.shirt-cuff'), 0xf2efe7);
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

test('a Silver Case actor can enter the death pose with the current shared torso rig', () => {
  const root = new THREE.Group();
  const { actor } = makeActor({
    parent: root,
    name: 'Death pose regression',
    job: 'sit',
    collapse: COLLAPSE.seated,
    model: { height: 1.76 },
  });

  /* Breathing moved from the size-scaled ribcage mesh to a neutral wrapper,
   * so the shared builder intentionally no longer captures a legacy
   * `torso.userData.base`. Actor death must honor that live rig contract. */
  assert.equal(actor.parts.torso.userData.base, undefined);
  assert.ok(actor.parts.mouth.userData.base, 'the animated mouth still owns a rest scale');
  actor.parts.torsoWrap.scale.set(1.02, 1, 1.02);
  assert.doesNotThrow(() => actor.kill());
  assert.equal(actor.alive, false);
  assert.deepEqual(actor.parts.torsoWrap.scale.toArray(), [1, 1, 1]);
  assert.deepEqual(actor.parts.mouth.scale.toArray(), actor.parts.mouth.userData.base.toArray());
});
