/**
 * The cabin's interior fixtures, its resident and the rifles on the wall.
 *
 * Five owner playtest notes from one walk around the Cabin Hideaway, each of
 * which turned out to be a different mechanism, and every number below was
 * measured off the built scene rather than eyeballed.
 *
 *   "Lag animation is bad for cutting firewood, hes like pumping his whole
 *    body and his top half goes off"
 *   "Picture on nightstand is detached from the stand holding up the picture"
 *   "Exterior wall around the bathroom is coming into the interior"
 *   "The mirror is fucked. I may also not have a body."
 *   "Rifles should be accessible before the night time scene.. And the hint at
 *    the shooting yard totally gives it away."
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureDomShim();
ensureThreeShim();

const [
  { buildCountrysideCabin },
  { buildLagActor },
  { mountArmory },
  P,
  { mat },
  { CABIN },
  THREE,
] = await Promise.all([
  import('../src/cabin/world.js'),
  import('../src/cabin/lag.js'),
  import('../src/core/weapons/Armory.js'),
  import('../src/world/props.js'),
  import('../src/world/build.js'),
  import('../src/cabin/field.js'),
  import('three'),
]);

const MAIN_SOURCE = readFileSync(new URL('../src/cabin/main.js', import.meta.url), 'utf8');
const PRESENTATION_SOURCE = readFileSync(new URL('../src/cabin/presentation.js', import.meta.url), 'utf8');

/** The interaction system's own reach and the Player's own capsule. */
const INTERACT_REACH = 2.7;
const EYE_HEIGHT = 1.66;
const CAPSULE_RADIUS = 0.30;
const CAPSULE_HEIGHT = 1.80;

let cabinPromise = null;
function cabinScene() {
  cabinPromise ??= (async () => {
    const scene = new THREE.Scene();
    const registered = [];
    const interaction = {
      register(mesh, descriptor) {
        mesh.userData.interact = descriptor;
        if (!registered.includes(mesh)) registered.push(mesh);
      },
    };
    const cabin = await buildCountrysideCabin({ scene, externalLighting: true, interaction });
    scene.updateMatrixWorld(true);
    return { scene, cabin, interaction, registered };
  })();
  return cabinPromise;
}

function worldBox(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

/* ------------------------------------------------------------------ Lag */

/**
 * Every part of the upper body hangs off one `body` group whose origin is the
 * FLOOR, so `body.rotation.x` swings the torso about the ankles. Measured on
 * the shipped chop, per stroke: the head travelled 0.3770 m forward and the
 * pelvis slab 0.2513 m off a thigh that never moved. Hinging at the leg root
 * (0.922) instead leaves 0.0136 m at the pelvis and 0.1349 m at the head.
 *
 * These budgets are deliberately far tighter than the old numbers and far
 * looser than the new ones: a chop is allowed a lean, and is not allowed to
 * detach a man from his own legs.
 */
const MAX_PELVIS_DETACH = 0.05;
const MAX_HEAD_LURCH = 0.20;

test('Lag chops from the hips, and his pelvis stays on his legs', () => {
  const scene = new THREE.Scene();
  const lag = buildLagActor({ scene, x: 0, y: 0, z: 0, yaw: 0 });
  const parts = lag.npc.parts;
  const hips = parts.body.getObjectByName('hips');
  assert.ok(hips, 'the makePerson pelvis slab is the thing that visibly detaches');

  const pelvis = new THREE.Vector3();
  const legRoot = new THREE.Vector3();
  const head = new THREE.Vector3();
  let worstDetach = 0;
  let headMin = Infinity;
  let headMax = -Infinity;
  let headLow = Infinity;
  let headHigh = -Infinity;

  lag.update(0);
  for (let frame = 0; frame < 312; frame++) {
    lag.update(1 / 60);
    if (lag.debug.activity !== 'chop') break;
    scene.updateMatrixWorld(true);
    hips.getWorldPosition(pelvis);
    parts.legL.getWorldPosition(legRoot);
    parts.head.getWorldPosition(head);
    worstDetach = Math.max(worstDetach, Math.abs(pelvis.z - legRoot.z));
    headMin = Math.min(headMin, head.z);
    headMax = Math.max(headMax, head.z);
    headLow = Math.min(headLow, head.y);
    headHigh = Math.max(headHigh, head.y);
  }

  assert.ok(worstDetach <= MAX_PELVIS_DETACH,
    `pelvis left the leg root by ${worstDetach.toFixed(4)} m (budget ${MAX_PELVIS_DETACH})`);
  assert.ok(headMax - headMin <= MAX_HEAD_LURCH,
    `head pumped ${(headMax - headMin).toFixed(4)} m fore and aft (budget ${MAX_HEAD_LURCH})`);
  assert.ok(headHigh - headLow <= 0.05,
    `head dropped ${(headHigh - headLow).toFixed(4)} m, which is a man folding at the shoes`);
});

test('Lag faces the splitting block and the axe actually reaches the round', async () => {
  const { scene, cabin } = await cabinScene();
  const round = scene.getObjectByName('cabin-woodpile-round');
  assert.ok(round, 'the woodpile keeps an intact round on the block');

  const roundWorld = round.getWorldPosition(new THREE.Vector3());
  const local = cabin.lag.group.worldToLocal(roundWorld.clone());
  /* `makePerson` faces its own +Z. The placement used `yawToward`, which is
   * the camera's -Z convention, and put the block at local z -1.2787 -- dead
   * behind him. */
  assert.ok(local.z > 1.0, `the block sits at Lag-local z ${local.z.toFixed(4)}; he is facing away from it`);
  assert.ok(Math.abs(local.x) < 0.05, 'and it is dead ahead, not off one shoulder');

  const axeHead = cabin.lag.axe.getObjectByName('cabin-lag-axe-head');
  const target = new THREE.Vector3(roundWorld.x, roundWorld.y + 0.23, roundWorld.z);
  const at = new THREE.Vector3();
  let closest = Infinity;
  let highest = -Infinity;
  cabin.lag.update(0);
  for (let frame = 0; frame < 312; frame++) {
    cabin.lag.update(1 / 60);
    if (cabin.lag.debug.activity !== 'chop') break;
    scene.updateMatrixWorld(true);
    axeHead.getWorldPosition(at);
    closest = Math.min(closest, at.distanceTo(target));
    highest = Math.max(highest, at.y);
  }
  /* Before: the head never left 1.287..1.497 m and its closest approach was
   * 1.184 m, AT THE TOP OF THE WINDUP -- it was never travelling toward the
   * wood. After: 0.0286 m, and the swing goes overhead first. */
  assert.ok(closest <= 0.10, `axe head came no closer than ${closest.toFixed(4)} m to the round`);
  assert.ok(highest >= 2.2, `axe head only reached ${highest.toFixed(3)} m; that is a wave, not a swing`);
  cabin.lag.update(0);
});

/* ------------------------------------------------------ standing frames */

/**
 * The easel strut's setback was a constant while the strut's LENGTH is
 * h * 0.8, so tilting it swung the top end back by an amount that depended on
 * the picture. Measured in panel space, gaps between the strut's top corner
 * and the rear face of the frame it holds up: 0.0185 at h 0.14, 0.0170 at the
 * cabin nightstand's 0.15, 0.0123 at 0.18, 0.0107 at 0.19.
 */
test('every standing frame\'s easel strut touches the frame it holds up', () => {
  const M = { paper: mat({ color: 0xffffff }) };
  const corner = new THREE.Vector3();
  for (const h of [0.14, 0.15, 0.18, 0.19, 0.24]) {
    const frame = P.makeStandingFrame(M, { x: 0, y: 0, z: 0, w: h * 0.78, h });
    const panel = frame.group.getObjectByName('framePanel');
    const backing = panel.children[0];
    const glass = panel.children[3];

    const extent = (mesh) => {
      const g = mesh.geometry.parameters;
      let min = Infinity;
      let max = -Infinity;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        corner.set(sx * g.width * mesh.scale.x / 2, sy * g.height * mesh.scale.y / 2, sz * g.depth * mesh.scale.z / 2)
          .applyEuler(mesh.rotation).add(mesh.position);
        min = Math.min(min, corner.z);
        max = Math.max(max, corner.z);
      }
      return { min, max };
    };

    const leg = extent(frame.leg);
    const board = extent(backing);
    const gap = board.min - leg.max;
    assert.ok(gap <= 0, `h=${h}: the strut floats ${gap.toFixed(4)} m behind the frame`);
    assert.ok(gap >= -0.006, `h=${h}: the strut is buried ${(-gap).toFixed(4)} m into the frame`);
    // The original constraint: no part of the strut may reach the glass.
    assert.ok(leg.max < glass.position.z, `h=${h}: the strut has come round in front of the picture`);
  }
});

test('the cabin nightstand photograph stands on the nightstand', async () => {
  const { scene } = await cabinScene();
  const frame = scene.getObjectByName('cabin-art:night.photo');
  assert.ok(frame, 'the nightstand keeps its propped photograph');
  const box = worldBox(frame);
  // makeNightstand: h 0.55, top slab 0.05 thick, so its surface is 0.575.
  assert.ok(Math.abs(box.min.y - 0.575) < 0.02,
    `the frame's lowest point is ${box.min.y.toFixed(4)}, not on the 0.575 nightstand top`);
});

/* ------------------------------------------------------------ bathroom */

/**
 * The bathroom is a lean-to on the main room's north face. Its own three walls
 * are clad on the outside; the main room's north wall is a PARTY wall across
 * that span and was clad along its whole length anyway. Measured before the
 * fix: 26 log-siding boards standing 0.0725 m proud of the wall face at
 * z -5.20, floor to ceiling, across the room's entire 3.0 m width -- plus five
 * foundation piers 0.09 m proud of a bathroom floor laid at 0.016.
 */
test('no exterior cladding or footing stands inside the bathroom', async () => {
  const { scene } = await cabinScene();
  const envelope = scene.getObjectByName('cabin-timber-envelope');
  assert.ok(envelope, 'the cabin shell is one addressable assembly');

  /* The clear volume the player stands in: the authored bathroom rectangle,
   * stopped at the party wall's own north face rather than at the rectangle's
   * edge, and under the lean-to ceiling. The room's three real walls bound
   * this box and touch it with zero thickness; anything that takes a bite out
   * of it is standing in the room. */
  const partyWallFace = CABIN.main.z0 - 0.20;
  const room = new THREE.Box3(
    new THREE.Vector3(CABIN.bath.x0, 0.02, CABIN.bath.z0),
    new THREE.Vector3(CABIN.bath.x1, 2.90, partyWallFace),
  );
  const intruders = [];
  const overlap = new THREE.Vector3();
  envelope.traverse((object) => {
    if (!object.isMesh) return;
    const box = worldBox(object);
    if (!box.intersectsBox(room)) return;
    box.clone().intersect(room).getSize(overlap);
    const depth = Math.min(overlap.x, overlap.y, overlap.z);
    if (depth > 0.005) intruders.push(`${object.name || '(unnamed cladding)'} ${depth.toFixed(4)}`);
  });
  assert.deepEqual(intruders, [], 'shell geometry is standing inside the bathroom');
});

/* -------------------------------------------------------------- mirror */

test('the cabin uses the canonical mirror with a persistent first-person reflection body', async () => {
  const { cabin } = await cabinScene();
  assert.match(MAIN_SOURCE, /core\/first-person-body\.js/,
    'the cabin must share the persistent mirror-body lifecycle');
  assert.match(MAIN_SOURCE, /new FirstPersonBody\(scene/,
    'the mirror must have an authored Prospect body to reflect');
  assert.match(MAIN_SOURCE, /createCabinPlanarMirror\(scene, cabin\.mirrorMesh/,
    'the bathroom fixture must mount through the cabin presentation helper');
  assert.match(PRESENTATION_SOURCE, /core\/planar-mirror\.js/,
    'the helper must consume the one canonical planar-mirror Module');
  assert.equal(cabin.mirrorMesh.userData.planarMirrorSurface, true);
  assert.equal(cabin.mirrorMesh.material.type, 'MeshStandardMaterial');
  assert.ok(cabin.mirrorMesh.material.metalness >= 0.4,
    'the authored silvered fallback remains legible if reflection setup fails');
});

/* ---------------------------------------------------------- the rifles */

test('the shooting range no longer announces the cellar, Gratin or the dungeon', () => {
  const empty = MAIN_SOURCE.slice(
    MAIN_SOURCE.indexOf('function useShootingRange'),
    MAIN_SOURCE.indexOf('function onRangeEvent'),
  );
  assert.ok(empty.length > 200, 'found the range handler');
  const spoilers = empty.split('\n').filter((line) => !line.trim().startsWith('*'))
    .join('\n');
  for (const tell of ['Gratin', 'below the cabin', 'opens the way', 'cellar', 'basement']) {
    assert.ok(!spoilers.includes(tell),
      `the range hint still gives away "${tell}" before the chapter turns`);
  }
});

test('a wall rack of rifles hangs in the main room, flush and clear', async () => {
  const { scene, cabin } = await cabinScene();
  const spec = cabin.wallRack?.racks?.[0];
  assert.ok(spec, 'the cabin publishes a main-room rack spec');
  assert.ok(spec.z > CABIN.main.z0 && spec.z < CABIN.main.z0 + 0.12,
    'the rack hangs on the north wall');
  // Left in the basement as well: the dungeon anteroom keeps its own two.
  assert.equal(cabin.basement.dungeon.armory.racks.length, 2,
    'the cellar armory is untouched');

  /* "Rifles should be accessible BEFORE the night time scene." The rack hangs
   * off `cabinRoot`, not the hidden dungeon root, and shares the dungeon
   * armory's gate -- which is scene liveness (`state.phase`, resting, carrying
   * a body) and carries no story flag. `main.js` sets phase 'active' on scene
   * start, so it is live from the first frame rather than after Gratin. */
  const mount = MAIN_SOURCE.slice(
    MAIN_SOURCE.indexOf('wallRack = mountArmory({'),
    MAIN_SOURCE.indexOf('gratinPistol = buildWeaponModel'),
  );
  assert.ok(mount.includes('parent: cabin.cabinRoot'), 'the rack lives in the main room');
  assert.ok(mount.includes('enabled: armoryEnabled'),
    'the wall rack must share the armory liveness gate, not grow a story condition');
  assert.ok(!/story\.|chapter\.|canReveal|cellarOpen/.test(mount),
    'nothing about the cellar may gate a rack in the main room');

  const { rackRoot } = await mountedRack();
  const box = worldBox(rackRoot);
  assert.ok(box.max.y < 1.40, 'the rack stays under the hung art at y 1.32');

  // Flush to the wall: contact, and under the gate's 2 cm wall-embed budget.
  const embed = CABIN.main.z0 - box.min.z;
  assert.ok(embed > 0, `the backboard floats ${(-embed).toFixed(4)} m off the wall`);
  assert.ok(embed <= 0.02, `the backboard is ${embed.toFixed(4)} m into the wall`);

  // Clear of everything already in the room, to the gate's own 3 cm.
  let worst = { name: null, depth: 0 };
  scene.traverse((object) => {
    if (!object.isMesh) return;
    for (let p = object; p; p = p.parent) if (p === rackRoot) return;
    const other = worldBox(object);
    const size = other.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.y, size.z) > 8) return;   // terrain and forest AABBs
    if (!other.intersectsBox(box)) return;
    const overlap = other.clone().intersect(box).getSize(new THREE.Vector3());
    const depth = Math.min(overlap.x, overlap.y, overlap.z);
    if (depth > worst.depth) worst = { name: object.name || '(unnamed)', depth };
  });
  assert.ok(worst.depth <= 0.03,
    `the rack is ${worst.depth.toFixed(4)} m inside ${worst.name}`);
});

/**
 * REACHABILITY, WITH A REAL RAY.
 *
 * `debugUse(name)` calls a handler and casts nothing; the bank exit shipped
 * unreachable behind exactly that check. This walks the legal standing cells
 * of the north-east quarter of the main room -- rejecting any the Player
 * capsule cannot occupy -- and casts the interaction system's own ray from eye
 * height at real sub-meshes of the rifles. Aim points are sub-meshes and not
 * bounding-box centres on purpose: a carbine is a thin thing with air inside
 * its own box, and aiming at the box centre from off to one side passes
 * between the receiver and the stock and lands on the backboard behind.
 */
test('every legal stance within reach of the rack can actually aim at a rifle', async () => {
  const { cabin, registered } = await cabinScene();
  const { guns } = await mountedRack();

  const aimPoints = [];
  for (const gun of guns) {
    gun.traverse((object) => {
      if (object.isMesh) aimPoints.push(worldBox(object).getCenter(new THREE.Vector3()));
    });
  }
  assert.ok(aimPoints.length > 60, 'the rack holds real weapon models, not silhouettes');

  const ray = new THREE.Raycaster();
  ray.far = INTERACT_REACH;
  const rayList = [...registered, ...(cabin.occluders ?? [])];
  const ownerOf = (object) => {
    for (let p = object; p; p = p.parent) if (p.userData?.interact) return p;
    return null;
  };

  const capsule = new THREE.Box3();
  const eye = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let inReach = 0;
  const unreachable = [];
  for (let x = 2.6; x <= 6.0; x += 0.12) {
    for (let z = -5.0; z <= -1.4; z += 0.12) {
      const floor = cabin.groundAt(x, z, 0);
      if (Math.abs(floor) > 0.01) continue;
      capsule.min.set(x - CAPSULE_RADIUS, floor + 0.01, z - CAPSULE_RADIUS);
      capsule.max.set(x + CAPSULE_RADIUS, floor + CAPSULE_HEIGHT, z + CAPSULE_RADIUS);
      if (cabin.colliders.some((volume) => volume.intersectsBox(capsule))) continue;

      eye.set(x, floor + EYE_HEIGHT, z);
      const reachable = aimPoints.filter((point) => eye.distanceTo(point) <= INTERACT_REACH);
      if (!reachable.length) continue;
      inReach++;

      let acquired = false;
      for (const point of reachable) {
        ray.set(eye, direction.copy(point).sub(eye).normalize());
        for (const hit of ray.intersectObjects(rayList, true)) {
          const owner = ownerOf(hit.object);
          if (!owner) break;
          if (owner.userData.interact.soft) continue;
          acquired = guns.includes(owner);
          break;
        }
        if (acquired) break;
      }
      if (!acquired) unreachable.push([+x.toFixed(2), +z.toFixed(2)]);
    }
  }

  assert.ok(inReach >= 300, `only ${inReach} stances are within reach of the rack at all`);
  assert.deepEqual(unreachable, [],
    `${unreachable.length} of ${inReach} legal stances cannot put the crosshair on a rifle`);
});

let mountedPromise = null;
/** Mount the rack the way `main.js` does, once, over the shared cabin. */
function mountedRack() {
  mountedPromise ??= (async () => {
    const { cabin, interaction, scene } = await cabinScene();
    const system = { firearm: () => ({ rounds: 10, capacity: 10, reserve: 40 }), equipped: null };
    mountArmory({
      parent: cabin.cabinRoot,
      system,
      interaction,
      racks: cabin.wallRack.racks,
      retainTaken: true,
      addCollider: (x0, x1, y0, y1, z0, z1) => {
        const volume = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
        volume.name = `cabin-wall-rack-${cabin.colliders.length}`;
        cabin.colliders.push(volume);
      },
    });
    scene.updateMatrixWorld(true);
    const rackRoot = cabin.cabinRoot.getObjectByName('armory');
    const guns = [];
    rackRoot.traverse((object) => {
      if (/^armory-[a-z0-9]+-\d+$/.test(object.name || '')) guns.push(object.children[0]);
    });
    assert.equal(guns.length, 3, 'the wall rack holds three rifles');
    return { rackRoot, guns };
  })();
  return mountedPromise;
}
