import assert from 'node:assert/strict';
import test from 'node:test';

import { MissionController } from '../src/beefrun/mission.js';

function airborneLineupStub() {
  return {
    physics: {
      position: { x: 1000, z: 1000 },
      headingDeg: 90,
      groundSpeed: 30,
      ias: 65 / 1.943844,
      onGround: false,
      agl: 20,
    },
    airfield: { anchors: { lineUp: { x: 0, z: 0 }, departHeading: 180 } },
    flags: { lineupReady: false, rotateCalled: false, grassOffs: 0 },
    score: { patience: 1 },
    dialogue: { play() {} },
    setObjective(text) { this.objective = text; },
    gradeTakeoff() { this.graded = true; },
    setPhase(phase) { this.phase = phase; },
    restoreCheckpoint() {},
  };
}

test('an airborne player cannot remain softlocked in the runway lineup phase', () => {
  const mission = airborneLineupStub();

  MissionController.prototype.updateLineup.call(mission, 0.016);

  assert.equal(mission.flags.lineupReady, true);
  assert.equal(mission.graded, true);
  assert.equal(mission.phase, 'climbout');
});
