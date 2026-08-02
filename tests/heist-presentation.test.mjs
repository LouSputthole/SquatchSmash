import assert from 'node:assert/strict';
import test from 'node:test';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import {
  HEIST_CREW_PRESENTATION,
  crewHeadingForPhase,
} from '../src/heist/cast.js';

test('safehouse crew face the briefing instead of presenting their backs to the player', () => {
  const table = { x: 0, z: 0.2 };
  for (const position of [
    { x: -3.4, z: -1.2 },
    { x: -1.7, z: -2.4 },
    { x: 0, z: -2.6 },
    { x: 1.8, z: -2.3 },
    { x: 3.5, z: -1.1 },
  ]) {
    const heading = crewHeadingForPhase('safehouse', position);
    const facing = { x: Math.sin(heading), z: Math.cos(heading) };
    const toward = { x: table.x - position.x, z: table.z - position.z };
    const length = Math.hypot(toward.x, toward.z);
    const dot = facing.x * toward.x / length + facing.z * toward.z / length;
    assert.ok(dot > 0.99, `safehouse facing dot was ${dot}`);
  }
});

test('Numbskull has an explicit named procedural face treatment', () => {
  assert.deepEqual(HEIST_CREW_PRESENTATION[CHARACTER_IDS.NUMBSKULL].proceduralFace, {
    treatment: 'round_glasses',
    brows: true,
    nose: true,
  });
});
