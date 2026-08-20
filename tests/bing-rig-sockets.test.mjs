/**
 * THE SHARED HUMAN RIG, AT THE THREE PLACES IT KEPT LYING TO ITS CALLERS.
 *
 * `makePerson()`/`Npc` in `src/bing/cast.js` is the one figure the whole game
 * is cast from — the club, the closed party, the golf gallery, the heist, the
 * palace. Three separate scenes had each grown their own workaround for the
 * same three rig defects, which is the shape a shared-rig bug always takes:
 *
 *   - a scripted `faceToward(..., true)` snap did not survive a single frame,
 *     because an ambient smooth `faceToward(x, z)` from any chatter system had
 *     pinned `targetYaw` permanently and `update()` dragged the figure back;
 *   - there was no hand to hang a prop on, only an anonymous slab inside the
 *     forearm, so every scene re-guessed the same magic y = -0.30 forearm
 *     offset and golf's beers ended up stuck to five men's wrists;
 *   - a bar stool is 0.315 m taller than a dining chair, and a scene that
 *     seats somebody on one from a base of zero buries them in it to the
 *     waist.
 *
 * The rig builds headlessly under the repo's Three shim, so these are real
 * geometry assertions on a real figure rather than source greps — except the
 * closed party's seating wiring at the bottom, which needs a whole club to
 * instantiate and is checked the way the rest of that file's tests check it.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { Npc, STOOL_SIT, makePerson } = await import('../src/bing/cast.js');

const SUIT = { height: 1.78, build: 1.0, dress: 'suit' };

/** Shortest signed distance between two headings, so ±π does not read as 2π. */
function yawGap(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function standing(model = SUIT) {
  return new Npc(new THREE.Scene(), {
    name: 'rig regression', tier: 'hero', job: 'stand', look: false, model,
  });
}

/* ------------------------------------------------------------------ */
/* Facing                                                              */
/* ------------------------------------------------------------------ */

test('a scripted snap-face is not undone by a previously-set smooth target', () => {
  const npc = standing();

  // Ambient chatter turns him to somebody at the bar. Smooth: a target only.
  npc.faceToward(0, 10);
  assert.notEqual(npc.targetYaw, undefined, 'a smooth faceToward still sets a target to ease toward');

  // The scene then snaps him round to face the man he is about to stab.
  const snapped = npc.faceToward(0, -10, true);
  assert.equal(npc.group.rotation.y, snapped, 'a snap puts the figure on the heading immediately');
  assert.equal(npc.targetYaw, undefined, 'a snap clears the stale smooth target');

  // Two seconds of update is far more than the old ~1 s drag-back took.
  for (let i = 0; i < 120; i++) npc.update(1 / 60);
  assert.ok(
    yawGap(npc.group.rotation.y, snapped) < 1e-6,
    `the snap heading drifted by ${yawGap(npc.group.rotation.y, snapped).toFixed(4)} rad`,
  );
  assert.ok(
    yawGap(npc.group.rotation.y, Math.atan2(0 - 0, 10 - 0)) > 1,
    'the figure must not have been dragged back to the ambient target',
  );
});

test('the smooth facing path still eases a figure round over time', () => {
  const npc = standing();
  const target = npc.faceToward(4, 4);
  assert.notEqual(npc.group.rotation.y, target, 'a smooth faceToward does not teleport the heading');

  const before = yawGap(npc.group.rotation.y, target);
  for (let i = 0; i < 10; i++) npc.update(1 / 60);
  const during = yawGap(npc.group.rotation.y, target);
  assert.ok(during < before, 'the smooth path closes on its target');

  for (let i = 0; i < 240; i++) npc.update(1 / 60);
  assert.ok(yawGap(npc.group.rotation.y, target) < 0.01, 'the smooth path arrives');
});

test('authored staging drops the smooth target it is overriding', () => {
  const source = fs.readFileSync(new URL('../src/bing/preview.js', import.meta.url), 'utf8');
  const start = source.indexOf('function pose(npc,');
  assert.ok(start >= 0, 'the shared staging helper is missing');
  const body = source.slice(start, source.indexOf('\n}\n', start));
  assert.match(body, /npc\.targetYaw = undefined/, 'a staged yaw must not be eased away again');
});

/* ------------------------------------------------------------------ */
/* Hands                                                               */
/* ------------------------------------------------------------------ */

/* Both the plain figure and the chamfered one: `slab()` builds those from two
 * different primitives (`box()` carries size in scale, `softBox()` does not),
 * and the whole point of the socket is that a caller does not have to know
 * which of the two it is holding. */
for (const [label, model] of [
  ['a plain figure', SUIT],
  ['a chamfered figure', { ...SUIT, gender: 'female', bodyShape: 'curvy' }],
]) {
  test(`${label} exposes a hand socket a prop can hang from`, () => {
    const parts = makePerson(model);

    for (const side of ['L', 'R']) {
      const fore = parts[`fore${side}`];
      const hand = parts[`hand${side}`];
      assert.ok(fore, `fore${side} must keep working — half the game poses arms through it`);
      assert.ok(hand, `the rig exposes no hand${side} socket`);
      assert.equal(hand.parent, fore, `hand${side} hangs off the forearm it belongs to`);

      /* Unscaled, so a prop parented here comes out life-size. A mesh slab
       * would not be: `box()` puts an object's SIZE in its scale. */
      assert.deepEqual(
        hand.scale.toArray(), [1, 1, 1],
        `hand${side} must be an unscaled basis or every prop hung on it is squashed`,
      );

      /* The hand itself is still a direct child of the forearm, because that
       * is where every existing measurement of this rig looks for it. */
      const slab = fore.children.find((c) => c.isMesh && (c.name === 'hand' || c.name.endsWith('.hand')));
      assert.ok(slab, `the ${side} hand slab must stay a direct child of the forearm`);

      parts.group.updateMatrixWorld(true);
      const socketAt = hand.getWorldPosition(new THREE.Vector3());
      const handAt = slab.getWorldPosition(new THREE.Vector3());
      assert.ok(
        socketAt.distanceTo(handAt) < 1e-9,
        `hand${side}'s socket is ${socketAt.distanceTo(handAt).toFixed(4)} m from the hand it names`,
      );

      /* And a prop put on it at the origin really lands inside the hand. */
      const prop = new THREE.Object3D();
      prop.name = 'test-prop';
      hand.add(prop);
      parts.group.updateMatrixWorld(true);
      const handBox = new THREE.Box3().setFromObject(slab);
      assert.ok(
        handBox.containsPoint(prop.getWorldPosition(new THREE.Vector3())),
        `a prop at hand${side}'s origin should be in the hand, not beside it`,
      );
    }
  });
}

test('the golf gallery holds its beer in the hand rather than off a forearm constant', () => {
  const source = fs.readFileSync(new URL('../src/golf/terrain.js', import.meta.url), 'utf8');
  const start = source.indexOf('function dressWaitingMan(');
  assert.ok(start >= 0, 'the gallery dressing call site is missing');
  const body = source.slice(start, source.indexOf('\n}\n', start));
  assert.match(body, /parts\?\.handR/, 'the beer hangs off the hand socket');
  assert.doesNotMatch(body, /-0\.30/, 'the hand-tuned forearm offset is gone');
});

/* ------------------------------------------------------------------ */
/* Seats                                                               */
/* ------------------------------------------------------------------ */

/* Both numbers are the ones STOOL_SIT is defined against in cast.js: the
 * club's chairs cushion at 0.53 and its bar stools at 0.845. */
const CHAIR_CUSHION = 0.53;
const STOOL_CUSHION = 0.845;

function seated(baseY) {
  const npc = new Npc(new THREE.Scene(), {
    name: 'seat regression', tier: 'hero', job: 'sit', look: false, y: baseY, model: SUIT,
  });
  npc.group.updateMatrixWorld(true);
  return {
    npc,
    figure: new THREE.Box3().setFromObject(npc.group),
    hips: new THREE.Box3().setFromObject(npc.parts.hips),
  };
}

test('STOOL_SIT seats a man on a bar stool, and a chair base does not', () => {
  const chair = seated(0);
  const stool = seated(STOOL_SIT);

  assert.ok(
    Math.abs((stool.npc.group.position.y - chair.npc.group.position.y) - STOOL_SIT) < 1e-9,
    'STOOL_SIT is the whole difference between the two seats',
  );

  // A chair sitter's feet are on the floor; a stool sitter's are on the ring.
  assert.ok(Math.abs(chair.figure.min.y) < 0.01, 'a chair sitter keeps both soles on the floor');
  assert.ok(
    stool.figure.min.y > 0.25,
    `a stool sitter's feet should clear the floor, not reach it (${stool.figure.min.y.toFixed(3)} m)`,
  );

  // The load-bearing half: hips ON the cushion rather than through it.
  assert.ok(
    stool.hips.min.y <= STOOL_CUSHION && stool.hips.max.y >= STOOL_CUSHION,
    `a stool sitter's hips (${stool.hips.min.y.toFixed(3)}–${stool.hips.max.y.toFixed(3)}) must straddle the 0.845 cushion`,
  );
  assert.ok(
    chair.hips.min.y <= CHAIR_CUSHION && chair.hips.max.y >= CHAIR_CUSHION,
    'the same rig on a chair base straddles the 0.53 chair cushion',
  );

  // Which is exactly the bug: a stool seated from a base of zero is buried.
  assert.ok(
    chair.hips.max.y < STOOL_CUSHION,
    'a chair base on a bar stool sinks a man below its cushion — that is the whole defect',
  );
});

test('the closed party seats Booski and Willy on their stools, not in them', () => {
  const source = fs.readFileSync(new URL('../src/bing/hotdog-party.js', import.meta.url), 'utf8');
  assert.match(source, /import \{[^}]*STOOL_SIT[^}]*\} from '\.\/cast\.js'/);
  assert.match(
    source,
    /const partyBarSeats = new Set\(\[CHARACTER_IDS\.BOOSKI, CHARACTER_IDS\.WILLY\]\)/,
    'the two bar seats are still the two men on stools',
  );
  assert.match(
    source,
    /npc\.baseY = [^\n]*barSeat \? STOOL_SIT : 0/,
    'the party seating chart applies STOOL_SIT to its bar seats',
  );
});
