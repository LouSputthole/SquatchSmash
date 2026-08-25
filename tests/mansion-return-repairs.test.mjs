/**
 * THE MORNING AFTER LOOKS DIFFERENT FROM THE NIGHT BEFORE.
 *
 * Owner playtest, verbatim: *"Repaired mansion is really just the same thing
 * as the original mansion. The guards should have some voicelines
 * acknowledging your actions. Welcome back, nice work the other night. Etc. I
 * want some things to be repaired. Like maybe the centerpiece in the foyer is
 * clearly still half broken and being repaired. Maybe Snow is working on it as
 * a maintainence man - lets give him a maintainence outfit and a voice line
 * about how long its going to take to get everything fixed up."*
 *
 * The hole he found was structural rather than an oversight: `MansionInterior`
 * builds ONE house and both visits mount it, and `cast.js` is mounted twice
 * with the same barks. So the file is the check that the difference EXISTS and
 * is wired to the right visit, in both directions -- a return-visit line that
 * leaks onto the mission night is the same bug wearing the other face.
 *
 * `src/mansion/repairs.js` builds canvas-free geometry, so this needs only the
 * three shim, not the DOM one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

await ensureDomShim();
await ensureThreeShim();

const THREE = await import('three');
const { mountFoyerRepairs } = await import('../src/mansion/repairs.js');
const { SEQUENCES } = await import('../src/mansion/script.js');
const { SNOW, SNOW_MAINTENANCE } = await import('../src/core/wardrobe.js');
const {
  MANSION_RETURN_SCOPES, MANSION_START_SCOPES, MANSION_NEXT_BEAT_SCOPES,
} = await import('../src/mansion/audio-banks.js');

/** A stand-in for the built foyer chandelier: the real one's local tier ys. */
function fakeChandelier() {
  const g = new THREE.Group();
  /* The fixture's own frame: tiers at 0, -0.42 and -0.76, finial at -1.00,
   * and the rod running the whole drop. Two parts per tier is enough to say
   * which of them the cut takes. */
  for (const y of [0, 0, -0.42, -0.42, -0.76, -0.76, -1.00]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    m.position.y = y;
    g.add(m);
  }
  return g;
}

function mount() {
  const scene = new THREE.Group();
  const chandelier = fakeChandelier();
  const chandelierLight = { intensity: 9 };
  const colliders = [];
  const site = mountFoyerRepairs({
    scene,
    foyer: { chandelier, chandelierLight },
    at: { x: 0, y: 6.0, z: 44.4 },
    colliders,
  });
  return { scene, chandelier, chandelierLight, colliders, site };
}

test('the return visit takes the chandelier’s bottom tier down and stands it on a pallet', () => {
  const { chandelier, chandelierLight, site } = mount();
  const hidden = chandelier.children.filter((c) => c.visible === false);
  const shown = chandelier.children.filter((c) => c.visible !== false);
  assert.equal(site.tierDown, hidden.length);
  assert.ok(hidden.length >= 3, `expected the bottom tier down, ${hidden.length} parts hidden`);
  /* The cut is taken on the tier, not on an arbitrary height: everything at
   * -0.76 and below goes, everything at -0.42 and above stays. */
  for (const part of hidden) assert.ok(part.position.y < -0.6, `${part.position.y} was hidden`);
  for (const part of shown) assert.ok(part.position.y >= -0.6, `${part.position.y} was left up`);
  assert.ok(
    chandelierLight.intensity < 9,
    'a fixture missing its bottom tier throws less light than a whole one',
  );
});

test('the work site is on the floor, in front of the player, and solid where it should be', () => {
  const { scene, site, colliders } = mount();
  assert.ok(scene.children.includes(site.root));
  const names = [];
  site.root.traverse((o) => { if (o.isMesh && o.name) names.push(o.name); });
  /* The three things the owner named, each by the piece that says it: the
   * fixture is in bits on a pallet, the floor is open, and there is a
   * scaffold over the centrepiece. */
  for (const want of [
    'repairs-pallet', 'repairs-tier-arm', 'repairs-screed', 'repairs-marble-offcut',
    'repairs-scaffold-leg', 'repairs-scaffold-deck', 'repairs-centrepiece-sheet',
    'repairs-hazard-tape', 'repairs-toolbox',
  ]) {
    assert.ok(names.includes(want), `the work site is missing ${want}`);
  }

  /* Nothing may be built under the floorboards or inside the ceiling. */
  const bounds = new THREE.Box3().setFromObject(site.root);
  assert.ok(bounds.min.y >= 6.0 - 0.01, `something is under the floor at ${bounds.min.y}`);
  assert.ok(bounds.max.y < 6.0 + 5.4, `something reaches the ceiling at ${bounds.max.y}`);

  /* The scaffold and the trestle are things you walk into. The dust sheet and
   * the hazard tape are not -- a player who cannot reach the work cannot see
   * that it is work. */
  assert.equal(colliders.length, site.blockers.length);
  assert.equal(colliders.length, 3);

  /* THE SCAFFOLD CLEARS THE CENTRE TABLE. The table's own collider is
   * x -1.4..1.4 about the inlay; a scaffold standing through it is a tower
   * growing out of a marble tabletop. */
  for (const blocker of site.blockers) {
    const throughTable = blocker.min.x < 1.4 && blocker.max.x > -1.4
      && blocker.min.z < 44.4 + 1.4 && blocker.max.z > 44.4 - 1.4;
    assert.equal(throughTable, false, `${blocker.name} stands in the centre table`);
  }

  /* And the man doing it has somewhere to stand that is not inside any of it. */
  const spot = new THREE.Vector3(site.workSpot.x, 6.0 + 0.9, site.workSpot.z);
  for (const blocker of site.blockers) {
    assert.equal(blocker.containsPoint(spot), false, `Snow stands inside ${blocker.name}`);
  }
});

test('mountFoyerRepairs refuses to build without a scene or a place to put it', () => {
  assert.equal(mountFoyerRepairs({ at: { x: 0, y: 0, z: 0 } }), null);
  assert.equal(mountFoyerRepairs({ scene: new THREE.Group() }), null);
});

test('the chandelier is optional: no foyer props, no fixture stripped, floor still dressed', () => {
  const scene = new THREE.Group();
  const site = mountFoyerRepairs({ scene, at: { x: 0, y: 6.0, z: 44.4 } });
  assert.equal(site.tierDown, 0);
  assert.ok(scene.children.includes(site.root));
});

/* ------------------------------------------------------------------------ */
/* THE LINES                                                                  */
/* ------------------------------------------------------------------------ */

test('every guard who has a mission line has a morning-after line, and they are different', () => {
  const pairs = [
    ['guardPathBark', 'guardPathReturn'],
    ['guardCameraBark', 'guardCameraReturn'],
    ['guardLapBark', 'guardLapReturn'],
    ['guardStairsBark', 'guardStairsReturn'],
    ['guardStairsIdle', 'guardStairsReturnIdle'],
    ['guardBasementBark', 'guardBasementReturn'],
    ['guardBasementIdle', 'guardBasementReturnIdle'],
    ['guardVaultBark', 'guardVaultReturn'],
    ['guardVaultIdle', 'guardVaultReturnIdle'],
  ];
  for (const [night, morning] of pairs) {
    assert.ok(Array.isArray(SEQUENCES[morning]), `${morning} is missing`);
    assert.ok(SEQUENCES[morning].length > 0, `${morning} is empty`);
    assert.notDeepEqual(
      SEQUENCES[morning].map((l) => l.text),
      SEQUENCES[night].map((l) => l.text),
      `${morning} just repeats ${night}`,
    );
    /* Same man, same voice. A "welcome back" in somebody else's throat is a
     * different bug and a worse one. */
    assert.equal(SEQUENCES[morning][0].speaker, SEQUENCES[night][0].speaker, morning);
  }
});

test('the morning-after lines are in their own audio scope, and only the return visit banks it', () => {
  const returnLines = Object.entries(SEQUENCES)
    .filter(([key]) => /Return|snowRepair/.test(key))
    .flatMap(([, lines]) => lines);
  assert.ok(returnLines.length >= 12, `expected the whole block, saw ${returnLines.length}`);
  for (const line of returnLines) {
    assert.match(line.cue, /^vo\.silentsquatch\.return\./, `${line.cue} is in the wrong scope`);
  }
  assert.deepEqual([...MANSION_RETURN_SCOPES], ['return']);
  assert.equal(MANSION_START_SCOPES.includes('return'), false);
  assert.equal(MANSION_NEXT_BEAT_SCOPES.includes('return'), false);
});

test('Snow’s maintenance kit is the same man in different clothes', () => {
  /* Only the clothes change. If his height, his build or his grey hair moved,
   * the return visit is a different actor wearing his face. */
  for (const key of ['height', 'build', 'hairColour', 'skin']) {
    assert.equal(SNOW_MAINTENANCE[key], SNOW[key], `${key} changed with the outfit`);
  }
  assert.equal(SNOW_MAINTENANCE.workVest, true, 'a maintenance man is wearing the vest');
  assert.equal(SNOW_MAINTENANCE.hat, 'flatcap');
  /* One colour head to foot is what makes a coverall read as a coverall. */
  assert.equal(SNOW_MAINTENANCE.trouserColour, SNOW_MAINTENANCE.shirt);
  assert.notEqual(SNOW_MAINTENANCE.shirt, SNOW.shirt);
});

test('Snow gets a line about how long it is going to take', () => {
  const said = [
    ...SEQUENCES.snowRepairFoyer, ...SEQUENCES.snowRepairIdle, ...SEQUENCES.snowRepairSecond,
  ].map((l) => l.text).join(' ');
  assert.match(said, /weeks|Christmas/, 'the owner asked for how long it is going to take');
  for (const line of [...SEQUENCES.snowRepairFoyer, ...SEQUENCES.snowRepairIdle]) {
    assert.equal(line.speaker, 'SNOW');
  }
});
