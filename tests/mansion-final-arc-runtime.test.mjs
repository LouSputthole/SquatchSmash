import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { ensureDomShim } from '../tools/three-shim.mjs';

ensureDomShim();

const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
const { AabbCombatSpace, resolveMaterialPath } = await import('../src/core/combat/index.js');
const {
  MANSION_RETURN_REPORT,
  mansionVisitMode,
} = await import('../src/mansion/campaign.js');
const { SEQUENCES } = await import('../src/mansion/script.js');

test('the quiet-evening guest bed is an exposed physical interaction target', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });

  assert.ok(interior.props.guestRoom.bed?.isObject3D);
  assert.match(interior.props.guestRoom.bed.name, /guest.*bed/i);
});

test('the built Siege mansion exposes a real thin hardwood combat surface and collider', () => {
  const grounds = buildMansionGrounds(null);
  const interior = buildMansionInterior({ grounds });
  const post = interior.root.getObjectByName('newel');
  const wood = interior.colliders.find((box) => (
    (box.userData?.combatMaterial ?? box.combatMaterial) === 'wood_thin'
    && Math.min(
      box.max.x - box.min.x,
      box.max.y - box.min.y,
      box.max.z - box.min.z,
    ) <= 0.35
  ));

  assert.ok(post?.isMesh, 'the authored hardwood newel is missing');
  assert.equal(post.userData.combatMaterial, 'wood_thin',
    'the visible hardwood surface is not tagged for combat rays');
  assert.ok(wood, 'no live thin-wood collider reached the Siege collision list');

  const center = wood.getCenter(new THREE.Vector3());
  const from = center.clone();
  const to = center.clone();
  from.x = wood.min.x - 0.2;
  to.x = wood.max.x + 0.2;
  const contacts = new AabbCombatSpace({ boxes: [wood] }).traceAll(from, to);
  const path = resolveMaterialPath(contacts, { penetration: 1, energy: 100 });

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].material, 'wood_thin');
  assert.ok(contacts[0].thickness <= 0.35);
  assert.equal(path.contacts[0].penetrated, true);
  assert.equal(path.blocked, false);
  assert.ok(path.remainingEnergy > 0 && path.remainingEnergy < 100);
});

test('the repaired return visit is explicit and carries only approved briefing facts', () => {
  assert.equal(mansionVisitMode({ search: '?visit=return' }), 'return');
  assert.equal(mansionVisitMode({ search: '?preview=1' }), 'silent_squatch');
  assert.deepEqual(MANSION_RETURN_REPORT, {
    wrongCityConfirmed: true,
    sauceMissingConfirmed: true,
    palaceLocationKnown: true,
  });
  assert.ok(Object.isFrozen(MANSION_RETURN_REPORT));
});

test('Lou alone interprets the Enola clue before the repaired-mansion report commits', () => {
  const lines = SEQUENCES.returnBriefing;
  assert.ok(Object.isFrozen(lines));
  assert.deepEqual(lines.map(({ speaker }) => speaker), [
    'LOU', 'PROSPECT', 'LOU', 'LOU', 'PROSPECT', 'LOU',
  ]);

  const text = lines.map(({ text }) => text).join('\n');
  assert.match(lines[0].text, /instrument was right.*briefing wasn’t.*wrong fucking city/i);
  assert.match(lines[2].text, /Squatchbourg is a crater.*desert compound is still/i);
  assert.match(lines[3].text, /Sauce went missing/i);
  assert.match(lines[5].text, /A-Team leadership estate.*tonight/i);
  assert.doesNotMatch(text, /\bMark\b/i,
    'Mark stays unnamed until the palace boss fight');
  assert.ok(lines.every(({ cue }) => cue?.startsWith('vo.silentsquatch.return.briefing.')),
    'every payoff line belongs to the return-only recording scope');
});
