import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { buildHeistLevel } from '../src/heist/level.js';
import {
  SPATIAL_CHANNELS, SPATIAL_KINDS, readSpatialPrimitive,
} from '../src/core/spatial-contract.js';

/**
 * THE STREET AND THE GARAGE KNOW WHAT THEY ARE MADE OF.
 *
 * `tools/verify-staging.mjs` counts a collider as typed when its record
 * carries `spatial.typed === true`, and files every untyped one as
 * `spatial:heist:<state>:coverage:untyped-solids` in
 * `tools/certification-debt-baseline.json`. Before this file existed both of
 * these states were entirely untyped -- street-withdrawal 0 typed of 21,
 * mercer-garage 0 typed of 35 -- and the ratchet counted 56 units of debt for
 * them. Both read PASS now, and the two baseline records are gone.
 *
 * WHY IT IS HELD HERE RATHER THAN LEFT TO THE RATCHET. The ratchet only runs
 * in Verify, near the end of a job, behind the campaign marathon and thirty
 * other steps; a collider added without a kind therefore surfaces as a
 * DEBT_GREW on somebody else's push, days later, in a file nobody was
 * editing. `npm test` runs everywhere. This is the same question asked at the
 * point the mistake is made.
 *
 * The block channels are held too, and that is the half that protects
 * BEHAVIOUR rather than bookkeeping. `DEFAULT_BLOCKS` gives `trigger`,
 * `interaction` and `spawn` a clean sheet: nothing collides, nothing occludes,
 * nothing stops a bullet. Typing this street's parked cars as triggers would
 * take the coverage number to PASS and delete the cover the entire first
 * block is fought behind. Every solid in these two lists blocked all four
 * channels while it was untyped -- `Player._resolve` skips a box only for
 * `blocks.collision === false` -- so every solid in these two lists blocks all
 * four channels now.
 */

/** Measured 2026-08-26 on the built level. Minimums, not ceilings: a scene may
 *  gain a solid, but not by losing the ones the fight is staged around. */
const AUTHORED_SOLIDS = Object.freeze({ street: 21, garage: 35 });

/** One build for the file. `buildHeistLevel` also builds the fourteen-hundred
 *  piece escape city; nothing below mutates what it returns. */
let built = null;
function phases() {
  built ??= buildHeistLevel(new THREE.Scene());
  return built.phases;
}

/**
 * Every complaint the spatial contract has about one collider list.
 *
 * Returned rather than asserted so the test below can prove the check bites:
 * an untyped box run through this comes back with a finding, which is the
 * only evidence that a green result means anything.
 */
function spatialFindings(colliders, label) {
  const findings = [];
  const seen = new Map();
  colliders.forEach((collider, index) => {
    const where = `${label}[${index}]`;
    let record = null;
    try {
      record = readSpatialPrimitive(collider);
    } catch (error) {
      findings.push(`${where} carries an invalid spatial marker: ${error.message}`);
      return;
    }
    if (!record) {
      findings.push(`${where} is untyped: every heist ${label} collider needs a spatial kind`);
      return;
    }
    if (!SPATIAL_KINDS.includes(record.kind)) {
      findings.push(`${where} has unknown kind ${record.kind}`);
    }
    if (seen.has(record.id)) {
      findings.push(`${where} repeats the spatial id ${record.id} from ${seen.get(record.id)}`);
    }
    seen.set(record.id, where);
    for (const channel of SPATIAL_CHANNELS) {
      if (record.blocks[channel] !== true) {
        findings.push(
          `${where} (${record.id}, ${record.kind}) stopped blocking ${channel}; `
          + 'these solids all blocked everything before they were typed',
        );
      }
    }
  });
  return findings;
}

test('the withdrawal street types every solid it stages the firefight around', () => {
  const street = phases().street;
  assert.ok(street.colliders.length >= AUTHORED_SOLIDS.street,
    `the street lost solids: ${street.colliders.length} < ${AUTHORED_SOLIDS.street}`);
  assert.deepEqual(spatialFindings(street.colliders, 'street'), []);
});

test('the Mercer garage types every solid it stages the hold around', () => {
  const garage = phases().garage;
  assert.ok(garage.colliders.length >= AUTHORED_SOLIDS.garage,
    `the garage lost solids: ${garage.colliders.length} < ${AUTHORED_SOLIDS.garage}`);
  assert.deepEqual(spatialFindings(garage.colliders, 'garage'), []);
});

test('the cars are cars and the building is the building', () => {
  const kinds = (colliders) => new Set(colliders.map((c) => readSpatialPrimitive(c).kind));
  /* Not a census -- a census fails the day somebody adds a third crate, which
   * teaches people to edit tests instead of reading them. This is the claim
   * the migration actually makes: both states hold parked vehicles and both
   * states hold building fabric, and neither is filed as the other. */
  for (const [name, phase] of [['street', phases().street], ['garage', phases().garage]]) {
    const present = kinds(phase.colliders);
    assert.ok(present.has('vehicle'), `${name} has no vehicle solids; the parked cars are cars`);
    assert.ok(present.has('world'), `${name} has no world solids; the fabric is the building`);
    assert.ok(!present.has('actor-body'),
      `${name} files a person as a collider; bodies come from the cast, not the level`);
  }
});

test('the check bites: an untyped or a non-blocking solid is a finding', () => {
  const box = () => new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));

  const untyped = spatialFindings([box()], 'street');
  assert.equal(untyped.length, 1);
  assert.match(untyped[0], /is untyped/);

  /* The number-lowering shortcut this exists to stop: mark the parked car a
   * trigger, coverage reads PASS, and the car stops being cover. */
  const asTrigger = box();
  asTrigger.userData = {
    spatial: {
      schema: 'squatchsmash.spatial-primitive.v1',
      id: 'heist.street.cover-car.0',
      kind: 'trigger',
      blocks: {
        collision: false, vision: false, navigation: false, ballistics: false,
      },
    },
  };
  const softened = spatialFindings([asTrigger], 'street');
  assert.equal(softened.length, SPATIAL_CHANNELS.length);
  assert.match(softened[0], /stopped blocking collision/);

  const duplicated = spatialFindings(phases().street.colliders.slice(0, 2).concat(
    phases().street.colliders.slice(0, 1),
  ), 'street');
  assert.equal(duplicated.length, 1);
  assert.match(duplicated[0], /repeats the spatial id/);
});
