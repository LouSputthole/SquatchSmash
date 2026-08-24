/**
 * THE FOUR SCENES THAT USED TO BE INVISIBLE TO THE STAGING GATE.
 *
 * The gate can only check bodies that carry `userData.actor`, so a scene that
 * does not stamp one is not passing — it is not being looked at. The mansion,
 * the Silver Case, the motel and No Wake were all in that position: the motel
 * had no marker anywhere, and the other three inherited the Bing `Npc`'s,
 * which takes its id from the DISPLAY NAME. That is right for forty anonymous
 * drinkers and wrong for a named cast: six men called 'a guard' came out as
 * 'a guard-4', two Apes in two mutually exclusive worlds came out as one id
 * twice, and every role in every one of those houses read `bystander`.
 *
 * So this holds the contract rather than the arithmetic (tools/staging-gate.mjs
 * has its own pure tests): every body in these scenes is marked, the ids are
 * authored and unique, the roles are told apart, and the marker's eye is
 * inside the head it belongs to rather than half a metre above it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { buildGeometrySceneState } = await import('../tools/geometry-scenes.mjs');
const { ACTOR_ROLES, collectActors } = await import('../src/core/staging.js');

/** The authored cast of one state per scene, by the id the gate knows. */
const EXPECTED = Object.freeze({
  'nowake:dock': ['booski', 'irish', 'lou', 'willy'],
  'silvercase:room': ['ape', 'ape-driving', 'chester', 'deke', 'pruitt', 'winston'],
  'motel:late-cast': [
    'chino-room', 'clerk', 'lookout', 'reinforcement-hook', 'reinforcement-pistol',
    'reinforcement-prod', 'rico-room', 'slicer-room', 'snow-exterior', 'watcher',
  ],
  'mansion:tour': [
    'ape', 'bartender', 'basement', 'booski', 'booth', 'deathmegatron', 'eric',
    'gateMan', 'gratin', 'hogmama', 'irish', 'lag', 'lou', 'numbskull', 'oldStove',
    'patrol0', 'patrol1', 'patrol2', 'poolPerformer0', 'poolPerformer1',
    'poolPerformer2', 'poolPerformer3', 'poolPerformer4',
    'rippin', 'sasole', 'sauce', 'seff', 'shubes', 'snow',
    'stairs', 'suitePerformer0', 'suitePerformer1', 'vault',
  ],
});

const built = new Map();
async function actorsOf(id) {
  if (!built.has(id)) {
    const state = await buildGeometrySceneState(id);
    built.set(id, state.roots.flatMap(({ root }) => collectActors(root, THREE)));
  }
  return built.get(id);
}

for (const [id, ids] of Object.entries(EXPECTED)) {
  test(`${id} marks its whole cast, with authored ids`, async () => {
    const actors = await actorsOf(id);
    assert.deepEqual(actors.map((one) => one.id).sort(), [...ids].sort());
    /* An id with a space in it came from a display name, which is the exact
     * regression this replaced: names are captions, ids are handles, and a
     * handle ends up in an allowlist. */
    for (const one of actors) assert.ok(!/\s/.test(one.id), `${one.id} reads like a caption`);
  });

  test(`${id} says which way it is pointed from inside its own head`, async () => {
    const box = new THREE.Box3();
    for (const one of await actorsOf(id)) {
      assert.ok(ACTOR_ROLES.includes(one.role), `${one.id} has role ${one.role}`);
      if (one.posture !== 'stand') continue;
      /* The marker's defaults are `core/person.js`'s Sasquatch — 2.30 m of
       * eye — and none of these scenes builds one. A declared height is only
       * worth declaring if it lands on the body: an eye ray that starts above
       * a man's head reports him looking OVER walls he is looking at. */
      box.setFromObject(one.object);
      assert.ok(one.eye[1] > box.min.y && one.eye[1] < box.max.y,
        `${one.id}: eye at ${one.eye[1].toFixed(3)} is outside his body (${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)})`);
      assert.ok(one.hip[1] < one.eye[1], `${one.id} has his hips above his eyes`);
    }
  });
}

test('the mansion tells a guard from the family from the floor show', async () => {
  const byRole = new Map();
  for (const one of await actorsOf('mansion:tour')) {
    byRole.set(one.role, (byRole.get(one.role) ?? 0) + 1);
  }
  /* Before the roles were authored this was one bucket of 31 bystanders, and
   * FACING_UNIFORM — which groups BY ROLE, so that a rank of guards facing one
   * way reads differently from a party facing one way — had nothing to group. */
  assert.deepEqual([...byRole.entries()].sort(), [
    ['bystander', 8], ['crew', 16], ['guard', 8], ['principal', 1],
  ]);
});
