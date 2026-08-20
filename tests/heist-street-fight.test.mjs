/**
 * THE STREET FIGHT: waves, in front, moving.
 *
 * Owner: *"Im not sure the combat system is implemented in the street fight
 * at all. Everyones just standing ther enad the cops have spawned behind me
 * instead of infront of me. I want to fight my way through some waves of
 * cops. Use the systems weve implemented for the mansion siege. Waves combat
 * etc. We fight are way down the street to the van."*
 *
 * Half of it was implemented and invisible: `combat.updateHostile` has run
 * the shared perception/aim/ammunition/fire-control pipeline per officer
 * since it was written, and `updatePoliceWaves` has fed the block a wave at a
 * time. The two things the player could actually see were both wrong.
 *
 *   1. NOBODY MOVED. Not one line in the scene ever changed an officer's
 *      position. He was spawned at a coordinate, called `figure.aiming()`,
 *      and stood on it shooting until he was killed.
 *   2. THE WAVES CAME FROM BEHIND. `WAVE_ENTRY` said so in a comment —
 *      "Behind and beside, never in front" — and `bank_avenue`'s five entries
 *      were all between z 24 and z 32. The player leaves the bank at z 31 and
 *      works DOWN to the van at z 14, so every reinforcement arrived on the
 *      steps he had just left.
 *
 * This file is the geometry and the movement rule, headless: the entries are
 * ahead along the route, the opening contact stands on real cover, and a
 * simulated block of officers closes on the player without walking through
 * the parked cars or through each other.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import { AabbCombatSpace } from '../src/core/combat/spatial.js';
import { buildHeistLevel } from '../src/heist/level.js';

const MAIN_SOURCE = await readFile(new URL('../src/heist/main.js', import.meta.url), 'utf8');

/** Pull an authored table out of `main.js` without booting the scene. */
function tableFromSource(name) {
  const at = MAIN_SOURCE.indexOf(`const ${name} = Object.freeze({`);
  assert.ok(at >= 0, `${name} is gone from main.js`);
  const open = MAIN_SOURCE.indexOf('{', at + `const ${name} = Object.freeze(`.length);
  let depth = 0;
  let end = open;
  for (; end < MAIN_SOURCE.length; end++) {
    if (MAIN_SOURCE[end] === '{') depth++;
    else if (MAIN_SOURCE[end] === '}') { depth--; if (depth === 0) break; }
  }
  const body = MAIN_SOURCE.slice(open, end + 1)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // eslint-disable-next-line no-new-func
  return new Function(`return (${body});`)();
}

const WAVE_ENTRY = tableFromSource('WAVE_ENTRY');
const BLOCK_CONTACT = tableFromSource('BLOCK_CONTACT');

/* The route the player walks, from the phase's own spawn to the objective. */
const BANK_STEPS_Z = 31;
const DEAD_VAN_Z = 14;
const GARAGE_Z = -35;

test('every street wave arrives ahead of the player, along the way he is going', () => {
  /* The exact regression: `bank_avenue` staged its reinforcements between
   * z 24 and z 32, behind a player advancing from 31 toward 14. */
  for (const [x, z] of WAVE_ENTRY.bank_avenue) {
    assert.ok(z < DEAD_VAN_Z,
      `a bank_avenue wave enters at z ${z}, which is not past the van at ${DEAD_VAN_Z}`);
    assert.ok(z < BANK_STEPS_Z - 8, `a bank_avenue wave enters on the bank steps: z ${z}`);
    assert.ok(Math.abs(x) < 8.7, `a wave enters at x ${x}, inside the pavement`);
  }
  // Block two runs the other way down the same street, to the garage.
  for (const [x, z] of WAVE_ENTRY.market_street) {
    assert.ok(z < DEAD_VAN_Z - 20,
      `a market_street wave enters at z ${z}, behind a player leaving the van`);
    assert.ok(z > GARAGE_Z, `a market_street wave enters past the garage: z ${z}`);
    assert.ok(Math.abs(x) < 8.7, `a wave enters at x ${x}, inside the pavement`);
  }
  /* The garage is the one block that is a DEFENCE — the order is "hold the
   * garage entrance" — so its entry is the ramp, and that is correct. */
  for (const [, z] of WAVE_ENTRY.mercer_garage) {
    assert.ok(z > 9, `a garage wave does not come down the ramp: z ${z}`);
  }
  // And the rule that produced it is gone, rather than being contradicted.
  assert.doesNotMatch(MAIN_SOURCE, /^ \* Where a wave comes in from, per block\. Behind/m,
    'the table still declares that waves arrive behind the player');
});

test('the opening contact of a block stands on the street\'s own cover', () => {
  /* `spawnPolice` staged the first five on an arithmetic ladder down the
   * middle of the road — `[(i % 2 ? -1 : 1) * (4 + i), 0, baseZ - i * 5]` —
   * which depended on how many bodies the pool had already built and put
   * nobody near anything. */
  const street = buildHeistLevel(new THREE.Scene()).phases.street;
  const slots = street.firePositions;
  assert.ok(slots?.length >= 20, 'the street authored no fire positions');
  const ids = slots.map((slot) => slot.id);
  assert.equal(new Set(ids).size, ids.length, 'two fire positions share an id');

  const near = (x, z) => slots.some((slot) => Math.hypot(slot.x - x, slot.z - z) < 1.2);
  for (const [x, z] of BLOCK_CONTACT.bank_avenue) {
    assert.ok(near(x, z), `the contact at ${x},${z} is not on a fire position`);
    // In front of the bank steps, behind the van: this is the block.
    assert.ok(z < BANK_STEPS_Z - 7 && z > DEAD_VAN_Z - 8,
      `the opening contact at z ${z} is not on the block the player crosses`);
  }
  for (const [x, z] of BLOCK_CONTACT.market_street) {
    assert.ok(near(x, z), `the contact at ${x},${z} is not on a fire position`);
    assert.ok(z < DEAD_VAN_Z - 1 && z > GARAGE_Z + 8,
      `the second contact at z ${z} is not on the road to the garage`);
  }
  assert.ok(Object.keys(BLOCK_CONTACT).length === Object.keys(WAVE_ENTRY).length,
    'a block has waves but no opening contact, or the other way round');
});

test('no authored fire position stands inside a parked car or a pavement', () => {
  const street = buildHeistLevel(new THREE.Scene()).phases.street;
  const solids = street.colliders;
  for (const slot of street.firePositions) {
    assert.ok(Math.abs(slot.x) < 8.5,
      `${slot.id} is at x ${slot.x}, on or past the kerb`);
    for (const solid of solids) {
      // At shin height: this is about standing room, not about roofs.
      if (solid.min.y > 0.4 || solid.max.y < 0.4) continue;
      const inside = slot.x > solid.min.x - 0.3 && slot.x < solid.max.x + 0.3
        && slot.z > solid.min.z - 0.3 && slot.z < solid.max.z + 0.3;
      assert.ok(!inside,
        `${slot.id} at ${slot.x},${slot.z} is inside a solid`);
    }
  }
});

test('a block of officers closes on the player without walking through the cars', () => {
  /* The movement rule itself, run headless on the same shared module the
   * mansion siege uses (`AabbCombatSpace`), against the real street's real
   * colliders and the real authored fire positions.
   *
   * What it has to show: they get NEARER (they were static), they stop at a
   * standoff rather than piling onto the player, and at no point in the run
   * is anybody inside a parked car or inside somebody else. */
  const street = buildHeistLevel(new THREE.Scene()).phases.street;
  const colliders = street.colliders;
  const slots = street.firePositions;
  const space = new AabbCombatSpace({
    radius: 0.36, height: 1.82, separation: 0.94, verticalSeparation: 1.2,
  });

  const player = new THREE.Vector3(0, 0, BANK_STEPS_Z - 2);
  const officers = BLOCK_CONTACT.bank_avenue.map(([x, z], index) => ({
    id: `officer-${index}`,
    position: new THREE.Vector3(x, 0, z),
    standoff: 6.5 + (index / 5) * 8,
    mode: 'hold',
    clock: 0.4 + index * 0.5,
    slot: null,
    goal: null,
  }));
  const opening = officers.map((o) => o.position.distanceTo(player));

  const dt = 1 / 30;
  for (let frame = 0; frame < 30 * 26; frame++) {
    const taken = new Set(officers.map((o) => o.slot).filter(Boolean));
    for (const officer of officers) {
      officer.clock -= dt;
      if (officer.mode === 'hold') {
        if (officer.clock > 0) continue;
        const own = officer.position.distanceTo(player);
        let best = null;
        let bestScore = Infinity;
        for (const slot of slots) {
          if (taken.has(slot.id)) continue;
          const toPlayer = Math.hypot(slot.x - player.x, slot.z - player.z);
          if (toPlayer < officer.standoff - 1.5) continue;
          if (own - toPlayer < 3.0) continue;
          const travel = Math.hypot(slot.x - officer.position.x, slot.z - officer.position.z);
          if (travel > 16 || travel < 0.6) continue;
          const score = Math.abs(toPlayer - officer.standoff) + travel * 0.25;
          if (score < bestScore) { bestScore = score; best = slot; }
        }
        if (!best) { officer.clock = 2.3; continue; }
        taken.add(best.id);
        officer.slot = best.id;
        officer.goal = best;
        officer.mode = 'bound';
        officer.clock = 2.1;
        continue;
      }
      const step = new THREE.Vector3(
        officer.goal.x - officer.position.x, 0, officer.goal.z - officer.position.z,
      );
      const remaining = step.length();
      if (remaining <= 0.6 || officer.clock <= 0) {
        officer.mode = 'hold';
        officer.clock = 2.3;
        continue;
      }
      step.multiplyScalar(Math.min(1, (3.15 * dt) / remaining));
      space.move(officer.position, step, { boxes: colliders, bounds: null });
      space.separate(officer, officers, {
        boxes: colliders,
        bounds: null,
        positionOf: (peer) => peer.position,
        idOf: (peer) => peer.id,
        eligible: () => true,
      });
    }

    // Nobody is ever inside a car, and nobody is ever inside anybody.
    for (const officer of officers) {
      for (const solid of colliders) {
        if (solid.min.y > 0.9 || solid.max.y < 0.9) continue;
        const inside = officer.position.x > solid.min.x && officer.position.x < solid.max.x
          && officer.position.z > solid.min.z && officer.position.z < solid.max.z;
        assert.ok(!inside,
          `${officer.id} walked into a solid at frame ${frame}: `
          + `${officer.position.x.toFixed(2)},${officer.position.z.toFixed(2)}`);
      }
    }
    for (let a = 0; a < officers.length; a++) {
      for (let b = a + 1; b < officers.length; b++) {
        const gap = Math.hypot(
          officers[a].position.x - officers[b].position.x,
          officers[a].position.z - officers[b].position.z,
        );
        assert.ok(gap > 0.55,
          `${officers[a].id} and ${officers[b].id} are ${gap.toFixed(2)} m apart at frame ${frame}`);
      }
    }
  }

  // They closed. This is the whole of "everyone's just standing there".
  const closed = officers.filter((o, i) => opening[i] - o.position.distanceTo(player) > 2.5);
  assert.ok(closed.length >= 3,
    `only ${closed.length} of ${officers.length} officers moved toward the player at all`);
  // And they stopped, rather than ending the fight in the player's face.
  for (const [index, officer] of officers.entries()) {
    const range = officer.position.distanceTo(player);
    assert.ok(range > 4.5,
      `${officer.id} ended ${range.toFixed(2)} m from the player, inside his own standoff`);
    assert.ok(range < opening[index] + 0.6, `${officer.id} retreated`);
  }
});

test('the movement layer is wired, and bounds cost a man his accuracy', () => {
  assert.match(MAIN_SOURCE, /updatePoliceMovement\(dt\);\n\s*updatePoliceCombat\(dt\);/,
    'movement does not run before the aim pipeline that reads its positions');
  assert.match(MAIN_SOURCE, /new AabbCombatSpace\(/,
    'the street no longer uses the shared combat space the mansion siege uses');
  assert.match(MAIN_SOURCE, /accuracy: bounding \? accuracy \* 0\.35 : accuracy/,
    'a man sprinting across a road shoots as well as one behind a car');
  assert.match(MAIN_SOURCE, /spare\.movement = null;/,
    'a recycled body inherits the dead man\'s bound and keeps his fire position');
});
