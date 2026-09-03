import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { HOTDOG_PREVIEW_CHECKPOINTS } from '../src/bing/preview.js';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  { buildGeometrySceneState, GEOMETRY_SCENE_STATES },
  { collectGeometrySnapshot },
  { normalizeSceneColliders },
] = await Promise.all([
  import('../tools/geometry-scenes.mjs'),
  import('../tools/geometry-collect.mjs'),
  import('../tools/verify-geometry-worker.mjs'),
]);

const BING_STATE_IDS = Object.freeze([
  'bing:visit-one',
  'bing:party',
  'bing:attack',
  'bing:cleanup',
  'bing:graveyard',
]);

/* Record counts are fingerprints, not health. `bing:visit-one` is the one
 * state with a randomly generated crowd, and the worker seeds Math.random
 * process-globally to make it reproducible -- so anything that changes how many
 * times Math.random is called before the crowd is built reshuffles it. Every
 * THREE.Object3D constructor spends four calls on its UUID, so adding the two
 * hand sockets per figure moved this by one garment mesh. Health is asserted
 * separately below and did not move: 20 findings, 19 INTERPENETRATION, 1
 * WALL_EMBED, 0 FLOATING, 17 suppressions, in all five states.
 *
 * MOVED 2026-08-19, and verified against those health assertions first --
 * findings, kinds and suppressions are identical before and after:
 *
 *   visit-one  5996 -> 6027   Aubbie's lab coat (AUBBIE is `trim: true`
 *                             tailoring now, not a plain work shirt) plus the
 *                             restored MEN door plate, less the two brass
 *                             blackjack barrier posts; the crowd reshuffles
 *                             off the Math.random cost of the extra meshes.
 *   party      4397 -> 4696   the four people working the room (bartender,
 *                             blackjack dealer, two of Lou's men on the door),
 *                             Aubbie's coat and his pens/gloves in place of
 *                             the tool pouch and keys, the MEN plate, less the
 *                             brass posts and the floating TABLE CLOSED sign.
 *   attack     4397 -> 4696   same content as `party`.
 *   cleanup    4320 -> 4618   same, at the cleanup pose; Eric's hidden body
 *                             collider is disabled with him.
 *   graveyard  4249 -> 4546   same, with Billy and Eric gone and neither
 *                             hidden body publishing an active collider.
 *
 * Party and attack move by the same +299. Cleanup/graveyard deliberately
 * subtract the one/two hidden actor bodies from that content fingerprint.
 *
 * MOVED AGAIN 2026-08-25, on the same protocol, when the wardrobe pass landed:
 *
 *   visit-one  6027 -> 6017   `makePerson` gained an optional `tie` and the
 *                             performer curve/swim options, and the Bing's
 *                             performers moved to src/bing/performers.js. ONLY
 *                             this state moved, which is the signature of a
 *                             reshuffled random crowd rather than lost content:
 *                             nothing placed by hand changed, and every health
 *                             assertion below is identical in all five states
 *                             before and after.
 *
 * MOVED 2026-08-28 after the owner removed the TABLE CLOSED / FAMILY PARTY
 * sign. That one deliberate prop was 17 records in every HotDog state, so
 * party/attack are 4696 -> 4679, cleanup 4618 -> 4601, and graveyard
 * 4546 -> 4529. Visit one never mounted it and stays 6017. The measured
 * findings and suppression counts below are unchanged.
 *
 * MOVED 2026-08-31 on the owner's wardrobe rulings: Lag's camp shirt
 * (pattern grid, sleeve hems, front edges) and belt, Old Stove's suit, tie
 * and gold watch, and Irish's flat cap, trim and collar accent are +80
 * records on every state alike — the uniform-delta signature of clothing on
 * a cast present in all five, with nothing placed by hand moved. Measured
 * with tools/verify-geometry-worker.mjs per state. */
/* MOVED 2026-09-03, same protocol, when the sweep circle landed. Owner: "need
 * to highlight the ground where you need to clean in the hotdog incident
 * people seem to miss it." The marker is a group with a fill disc and a ring
 * round the blood, lit by `showHotDogCleanupGuidesGeometry` in the cleanup
 * and graveyard poses and hidden everywhere else -- so cleanup and graveyard
 * move by exactly +3 and the other three states do not move at all. */
const EXPECTED_RECORDS = Object.freeze({
  'bing:visit-one': 6097,
  'bing:party': 4759,
  'bing:attack': 4759,
  'bing:cleanup': 4684,
  'bing:graveyard': 4612,
});

function snapshotFor(built) {
  return collectGeometrySnapshot({
    roots: built.roots,
    colliders: normalizeSceneColliders(built),
    THREE: built.THREE,
  });
}

function workerPayload(id) {
  const worker = spawnSync(process.execPath, ['tools/verify-geometry-worker.mjs', id], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(worker.status, 0, worker.stderr || worker.stdout);
  const marker = '@@SQUATCH_GEOMETRY_RESULT@@';
  const markerIndex = worker.stdout.lastIndexOf(marker);
  assert.notEqual(markerIndex, -1, 'geometry worker result marker missing for ' + id);
  return JSON.parse(worker.stdout.slice(markerIndex + marker.length));
}

function canonicalFinding(finding) {
  const { id, scene, state, ...geometry } = finding;
  return JSON.stringify(geometry)
    .replace(/root:bing-(?:one|two-(?:party|attack|cleanup|graveyard))/g, 'root:bing');
}

function visibleInHierarchy(object) {
  for (let current = object; current; current = current.parent) {
    if (current.visible === false) return false;
  }
  return true;
}

function actorByName(root, name) {
  let actor = null;
  root.traverse((object) => {
    if (object?.userData?.npc?.name === name) actor = object;
  });
  assert.ok(actor, 'missing Bing actor ' + name);
  return actor;
}

function namedVisibility(root, name) {
  const object = root.getObjectByName(name);
  assert.ok(object, 'missing Bing checkpoint object ' + name);
  return visibleInHierarchy(object);
}

test('Bing registry exactly covers visit one, its optional audit pose, and all public HotDog checkpoints', () => {
  assert.deepEqual(HOTDOG_PREVIEW_CHECKPOINTS, ['party', 'attack', 'cleanup', 'graveyard']);
  const descriptors = GEOMETRY_SCENE_STATES
    .filter(({ scene }) => scene === 'bing')
    .map(({ id, state, adapter, launcherIds, checkpoint = null }) => ({
      id, state, adapter, launcherIds: [...launcherIds], checkpoint,
    }));
  assert.deepEqual(descriptors, [
    { id: 'bing:visit-one', state: 'visit-one', adapter: 'bing', launcherIds: ['bing'], checkpoint: null },
    { id: 'bing:performer-bathroom', state: 'performer-bathroom', adapter: 'bing', launcherIds: [], checkpoint: null },
    { id: 'bing:party', state: 'party', adapter: 'bing-party', launcherIds: ['bing-two'], checkpoint: 'party' },
    { id: 'bing:attack', state: 'attack', adapter: 'bing-party', launcherIds: ['bing-two'], checkpoint: 'attack' },
    { id: 'bing:cleanup', state: 'cleanup', adapter: 'bing-party', launcherIds: ['bing-two'], checkpoint: 'cleanup' },
    { id: 'bing:graveyard', state: 'graveyard', adapter: 'bing-party', launcherIds: ['bing-two'], checkpoint: 'graveyard' },
  ]);
});

test('Bing headless Adapters mount the complete runtime producer sets', async () => {
  const visitOne = await buildGeometrySceneState('bing:visit-one');
  assert.deepEqual(visitOne.metadata, {
    checkpoint: null,
    geometryStage: 'startup',
    seatedActorCount: 28,
    occupiedFixtureCount: 26,
    occupiedDiningFixtureCount: 12,
    polePerformerCount: 3,
    castCount: 33,
    familyCount: 17,
    associateId: "Lou's associate",
    slotMounted: true,
    blackjackMounted: true,
    playerCarMounted: true,
    lotVehicleCount: 15,
  });

  const party = await buildGeometrySceneState('bing:party');
  /* 24, not 20: the closed party now has people WORKING it -- a bartender, a
   * blackjack dealer and two of Lou's men holding the inside of the club
   * doors (src/bing/hotdog-house-staff.js). 29 colliders, not 27, because the
   * two on the door are the only two of the four the player can walk into;
   * the bartender and the dealer stand inside furniture that already
   * collides and are deliberately given no body of their own. */
  assert.deepEqual(party.metadata, {
    checkpoint: 'party',
    npcCount: 24,
    partyColliderCount: 29,
    ownedPartyColliderCount: 29,
    seatedActorCount: 2,
    occupiedFixtureCount: 2,
    occupiedDiningFixtureCount: 12,
    polePerformerCount: 0,
    partyPerformancePropCount: 1,
  });
});

test('Bing gives every NPC a stable exact actor or occupied-fixture owner', async () => {
  for (const id of ['bing:visit-one', 'bing:party']) {
    const built = await buildGeometrySceneState(id);
    const actors = [];
    built.roots[0].root.traverse((object) => {
      if (!object?.userData?.npc) return;
      actors.push(object);
      const identity = String(object.userData.npc.characterId ?? object.userData.npc.name ?? '').trim();
      assert.ok(identity, id + ' has an NPC without a stable identity');
      const assemblyId = object.userData.geometryGate?.assemblyId;
      assert.match(
        assemblyId,
        /^bing-(?:visit-one-npc:|party-npc:|seat-fixture:|stage-pole-|bar-stool:|booth:|dining-fixture:|party-performance:)/,
        id + ' has an NPC without exact actor/fixture ownership',
      );
    });
    assert.equal(actors.length, id === 'bing:visit-one' ? 51 : 24);

    const snapshot = snapshotFor(built);
    assert.deepEqual(snapshot.collectionErrors, []);
    const assemblyCounts = new Map();
    for (const item of snapshot.items) {
      if (!item.assemblyId) continue;
      assemblyCounts.set(item.assemblyId, (assemblyCounts.get(item.assemblyId) ?? 0) + 1);
    }
    for (const [assembly, count] of [
      ['bing-coat-check-register', 2],
      ['bing-coat-check-hanging', 9],
      ['bing-bar-register', 2],
      ['bing-aubbie-service-panel', 3],
      ['bing-service-door-alarm', 3],
    ]) {
      assert.equal(
        assemblyCounts.get('root:' + built.roots[0].label + '/assembly:' + assembly),
        count,
        assembly + ' ownership drifted in ' + id,
      );
    }
  }
});

test('Bing shared checkpoint staging delivers the attack, cleanup, and handoff poses', async () => {
  const expected = {
    party: { hotdog: true, eric: true, blood: false, stool: false },
    attack: { hotdog: true, eric: true, blood: false, stool: false },
    cleanup: { hotdog: true, eric: false, blood: true, stool: true },
    graveyard: { hotdog: false, eric: false, blood: true, stool: true },
  };
  for (const checkpoint of HOTDOG_PREVIEW_CHECKPOINTS) {
    const built = await buildGeometrySceneState('bing:' + checkpoint);
    const root = built.roots[0].root;
    assert.equal(built.metadata.checkpoint, checkpoint);
    assert.equal(visibleInHierarchy(actorByName(root, 'Billy HotDog')), expected[checkpoint].hotdog);
    assert.equal(visibleInHierarchy(actorByName(root, 'Eric')), expected[checkpoint].eric);
    assert.equal(namedVisibility(root, 'hotdog.blood-splatter'), expected[checkpoint].blood);
    assert.equal(namedVisibility(root, 'broken.bar-stool'), expected[checkpoint].stool);
    assert.equal(namedVisibility(root, 'hotdog.wrap'), false);
    assert.equal(namedVisibility(root, 'service-exit-guide'), false);

    const visibleActorIds = new Set();
    root.traverse((object) => {
      const actorId = object.userData?.actor?.id;
      if (actorId && visibleInHierarchy(object)) visibleActorIds.add(actorId);
    });
    const orphanedBodies = normalizeSceneColliders(built)
      .filter(({ ownerActorId }) => ownerActorId && !visibleActorIds.has(ownerActorId))
      .map(({ spatialId, ownerActorId }) => ({ spatialId, ownerActorId }));
    assert.deepEqual(
      orphanedBodies,
      [],
      `${checkpoint} publishes actor-body ownership for hidden cast`,
    );
  }
});

test('Bing workers retain only the reviewed fitted club joins in every state', () => {
  let reference = null;
  for (const id of BING_STATE_IDS) {
    const payload = workerPayload(id);
    assert.equal(payload.id, id);
    assert.equal(payload.scene, 'bing');
    assert.equal(payload.scan.recordCount, EXPECTED_RECORDS[id]);
    assert.equal(payload.scan.findings.length, 20);
    assert.equal(payload.scan.findings.filter(({ kind }) => kind === 'INTERPENETRATION').length, 19);
    assert.equal(payload.scan.findings.filter(({ kind }) => kind === 'WALL_EMBED').length, 1);
    assert.equal(payload.scan.findings.filter(({ kind }) => kind === 'FLOATING').length, 0);
    assert.equal(payload.suppressions.overlap, 17);
    assert.equal(payload.suppressions.checkSupport, 0);
    assert.equal(payload.suppressions.sources.length, 17);
    assert.ok(payload.suppressions.sources.every(({ scope, overlap, checkSupport }) => (
      scope === 'direct' && overlap === 1 && checkSupport === 0
    )));

    const current = payload.scan.findings.map(canonicalFinding).sort();
    if (reference === null) reference = current;
    else assert.deepEqual(current, reference, id + ' introduced a state-specific geometry finding');
  }
});
