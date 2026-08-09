import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { Actor, CAST } from '../src/motel/actors.js';

function blockedMotelContext(overrides = {}) {
  return {
    player: { x: 0, z: 2 },
    floorAt: () => 0,
    blocked: () => true,
    ...overrides,
  };
}

test('a cowed clerk reaches the wall, stops running, and keeps facing away', () => {
  const scene = new THREE.Scene();
  let arrivals = 0;
  const clerk = new Actor(scene, {
    ...CAST.clerk(), x: 0, z: 0, heading: 0, state: 'panic',
  });
  const ctx = blockedMotelContext({ onStuck: () => { arrivals++; } });

  for (let frame = 0; frame < 120; frame++) clerk.update(1 / 30, ctx);

  assert.equal(clerk.state, 'idle', 'the clerk never reached a terminal cowed state');
  assert.equal(arrivals, 1, 'the blocked arrival was not reported exactly once');
  assert.ok(Math.abs(clerk.position.x) < 1e-9 && Math.abs(clerk.position.z) < 1e-9,
    'the collision probe let the clerk through the wall');
  assert.ok(Math.abs(Math.abs(clerk.idleHeading) - Math.PI) < 0.15,
    `the clerk turned back toward Tony (${clerk.idleHeading})`);

  const settledPose = [
    clerk.rig.legL.rotation.x,
    clerk.rig.legR.rotation.x,
    clerk.rig.body.position.y,
  ];
  for (let frame = 0; frame < 60; frame++) clerk.update(1 / 30, ctx);
  assert.deepEqual([
    clerk.rig.legL.rotation.x,
    clerk.rig.legR.rotation.x,
    clerk.rig.body.position.y,
  ], settledPose, 'the running cycle continued after the clerk stopped');
});

test('Snow offers the recorded Family gun and Prospect confirms the concealment', async () => {
  const { SNOW_GUN_HANDOFF } = await import('../src/motel/dialogue.js');

  assert.deepEqual(SNOW_GUN_HANDOFF.offer, {
    speaker: 'Snow',
    line: 'Under the coat. Seven in it. Do not let them see the crest and do not make me explain a Family gun to a night clerk.',
    seconds: 5.4,
  });
  assert.match(SNOW_GUN_HANDOFF.offer.line, /seven/i);
  assert.match(SNOW_GUN_HANDOFF.offer.line, /Family gun/i);
  assert.deepEqual(SNOW_GUN_HANDOFF.transfer, {
    speaker: 'Prospect',
    line: 'It is under my coat. It stays under my coat.',
    seconds: 3.0,
  });
  assert.match(SNOW_GUN_HANDOFF.transfer.line, /under my coat/i);
});

test('inspection checks have paced, recorded seller responses', async () => {
  const { INSPECTION_MEETING_BEATS } = await import('../src/motel/dialogue.js');
  const { dialogueBeatLeadSeconds } = await import('../src/motel/dialogue-timing.js');
  const { motelVoiceCueSet } = await import('../src/motel/voice-catalog.js');
  const { motelVoiceCue } = await import('../src/motel/voice.js');
  const voiceCatalog = motelVoiceCueSet();

  assert.deepEqual(Object.keys(INSPECTION_MEETING_BEATS), [
    'smell', 'grain', 'taste', 'reference', 'scan',
  ]);

  const spoken = Object.values(INSPECTION_MEETING_BEATS).flat();
  assert.equal(spoken.length, 6, 'the inspection still has too few seller turns');
  for (const beat of spoken) {
    assert.notEqual(beat.speaker, '*', 'inspection pacing must be spoken, not stage copy');
    assert.ok(beat.seconds >= 2.4, `${beat.speaker}'s turn is too short to breathe`);
    assert.ok(dialogueBeatLeadSeconds(beat) >= 0.45,
      `${beat.speaker}'s response still steps on the inspection line`);
    assert.ok(voiceCatalog.has(motelVoiceCue(beat.speaker, beat.line)),
      `inspection response has no authored voice take: ${beat.speaker}: ${beat.line}`);
  }

  assert.deepEqual(INSPECTION_MEETING_BEATS.grain.map(({ speaker, line }) => ({ speaker, line })), [
    { speaker: 'Chino', line: 'Rico. He is asking who handled it.' },
    { speaker: 'Rico', line: 'Nobody handled it. It handles itself.' },
  ]);
  assert.equal(dialogueBeatLeadSeconds({}), 0.18,
    'ordinary dialogue should retain the shared Motel floor gap');
});

test('room entry establishes the transaction with an immutable recorded sequence', async () => {
  const { ROOM_ENTRY_BEATS } = await import('../src/motel/dialogue.js');
  const { dialogueBeatLeadSeconds } = await import('../src/motel/dialogue-timing.js');
  const { motelVoiceCueSet } = await import('../src/motel/voice-catalog.js');
  const { motelVoiceCue } = await import('../src/motel/voice.js');
  const voiceCatalog = motelVoiceCueSet();

  assert.deepEqual(ROOM_ENTRY_BEATS.map(({ speaker, line }) => ({ speaker, line })), [
    { speaker: 'Chino', line: 'Door stays shut. Air conditioning.' },
    { speaker: 'Rico', line: 'Mountain reserve. Eleven-year cure. No fillers.' },
    { speaker: 'Prospect', line: 'Eight in their case. One on the table. Neither of them is mine yet.' },
    { speaker: 'Rico', line: 'Meat first. Money second. That is how this works.' },
  ]);
  assert.ok(Object.isFrozen(ROOM_ENTRY_BEATS), 'room entry sequence can be reordered at runtime');
  for (const beat of ROOM_ENTRY_BEATS) {
    assert.ok(Object.isFrozen(beat), `${beat.speaker}'s room entry beat is mutable`);
    assert.ok(beat.seconds >= 3, `${beat.speaker}'s room entry turn is rushed`);
    assert.ok(dialogueBeatLeadSeconds(beat) >= 0.45,
      `${beat.speaker}'s room entry turn overlaps the prior take`);
    assert.ok(voiceCatalog.has(motelVoiceCue(beat.speaker, beat.line)),
      `room entry beat has no authored voice take: ${beat.speaker}: ${beat.line}`);
  }
});
