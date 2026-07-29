import assert from 'node:assert/strict';
import test from 'node:test';

import { AirstripMission } from '../src/airstrip/mission.js';

function reachOutbound(mission) {
  assert.equal(mission.meetCaptain(), true);
  for (const item of ['fuel', 'controls', 'propeller', 'cargo']) {
    assert.equal(mission.inspect(item), true);
  }
  assert.equal(mission.board(), true);
  assert.equal(mission.takeoff({ speed: 38, altitude: 3 }), true);
}

function reachLoadedReturn(mission) {
  reachOutbound(mission);
  assert.equal(mission.crossBorder(), true);
  assert.equal(mission.landRemote({ speed: 26, verticalSpeed: -1.5 }), true);
  assert.equal(mission.collectJerky(), true);
  assert.equal(mission.loadCargo(), true);
  assert.equal(mission.takeoffReturn({ speed: 38, altitude: 3 }), true);
}

test('the airstrip mission enforces every interactive story beat in order', () => {
  const mission = new AirstripMission();

  assert.equal(mission.state, 'meet_captain');
  assert.equal(mission.board(), false);
  assert.equal(mission.meetCaptain(), true);
  assert.equal(mission.state, 'preflight');
  assert.equal(mission.inspect('fuel'), true);
  assert.equal(mission.inspect('fuel'), false);
  assert.equal(mission.board(), false);
  for (const item of ['controls', 'propeller', 'cargo']) mission.inspect(item);
  assert.equal(mission.state, 'board');
  assert.equal(mission.board(), true);
  assert.equal(mission.state, 'takeoff');
  assert.equal(mission.takeoff({ speed: 20, altitude: 0 }), false);
  assert.equal(mission.takeoff({ speed: 38, altitude: 3 }), true);
  assert.equal(mission.state, 'outbound');
  assert.equal(mission.crossBorder(), true);
  assert.equal(mission.state, 'remote_approach');
  assert.equal(mission.landRemote({ speed: 40, verticalSpeed: -5 }), false);
  assert.equal(mission.landRemote({ speed: 26, verticalSpeed: -1.5 }), true);
  assert.equal(mission.collectJerky(), true);
  assert.equal(mission.loadCargo(), true);
  assert.equal(mission.takeoffReturn({ speed: 38, altitude: 3 }), true);
  assert.equal(mission.state, 'low_return');
  mission.setDetection(0.75);
  assert.equal(mission.crossBorderHome({ altitude: 58 }), true);
  assert.equal(mission.landHome({ speed: 27, verticalSpeed: -1.2 }), true);
  assert.equal(mission.state, 'complete');
  assert.equal(mission.cargoLoaded, true);
});

test('being detected fails the return but retries from the loaded remote checkpoint', () => {
  const mission = new AirstripMission();
  reachLoadedReturn(mission);

  mission.setDetection(1);
  assert.equal(mission.state, 'detected');
  assert.equal(mission.retry(), true);
  assert.equal(mission.state, 'low_return');
  assert.equal(mission.cargoLoaded, true);
  assert.equal(mission.detection, 0.35);
});

test('a crash retries at the latest safe checkpoint', () => {
  const outbound = new AirstripMission();
  reachOutbound(outbound);
  outbound.crash();
  assert.equal(outbound.state, 'crashed');
  assert.equal(outbound.retry(), true);
  assert.equal(outbound.state, 'takeoff');
  assert.equal(outbound.cargoLoaded, false);

  const returning = new AirstripMission();
  reachLoadedReturn(returning);
  returning.crash();
  assert.equal(returning.retry(), true);
  assert.equal(returning.state, 'low_return');
  assert.equal(returning.cargoLoaded, true);
});
