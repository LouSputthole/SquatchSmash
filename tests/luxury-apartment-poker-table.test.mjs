/**
 * THE POKER TABLE IS FURNITURE.
 *
 * Owner playtest note, 2026-08-26, verbatim:
 *
 *   "Luxury apartment, who are these guys at my poker table? Get rid of them.
 *    Just leave the poker table for clearly fun when people are over and
 *    remove the poker mini game or give the player the option but just hint
 *    they have no one to play with when they select it and dont let them
 *    play."
 *
 * Two facts, and this file holds both:
 *
 *   1. NOBODY IS SEATED. The flat used to stage three civilian actors --
 *      luxury.poker.patron.{north,west,east} -- in the north, west and east
 *      chairs. They were its entire cast. The table, the rail, the chips and
 *      all four chairs stay; the people do not.
 *   2. THE PROMPT STAYS AND THE GAME DOES NOT. `Play poker` is still on the
 *      target. Selecting it answers with a line instead of dealing: the flat's
 *      table game was src/bing/blackjack.js re-seated on this felt, and it is
 *      no longer mounted here at all.
 *
 * The emptiness is measured, not asserted from the constructor: the volume
 * over every cushion is raycast-free and mesh-free, so a cast re-added by any
 * route -- a Person, a mannequin, a decorative torso -- fails this file.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';
import { collectActors } from '../src/core/staging.js';
import { readSpatialPrimitive } from '../src/core/spatial-contract.js';

ensureDomShim();
ensureThreeShim();

const [worldModule, runtimeModule, THREE] = await Promise.all([
  import('../src/luxury-apartment/world.js'),
  import('../src/luxury-apartment/runtime.js'),
  import('three'),
]);

const { buildLuxuryApartment } = worldModule;
const { LUXURY_POKER_REFUSAL, refuseLuxuryPoker } = runtimeModule;

const MAIN_SOURCE = readFileSync(new URL('../src/luxury-apartment/main.js', import.meta.url), 'utf8');

async function build() {
  const registered = new Map();
  const minigames = [];
  const world = await buildLuxuryApartment({
    scene: new THREE.Scene(),
    interaction: {
      register(target, descriptor) {
        registered.set(target, descriptor);
        target.userData.interact = descriptor;
      },
    },
    onMinigame: (id, station) => { minigames.push({ id, station }); },
  });
  world.root.updateMatrixWorld(true);
  return { world, registered, minigames };
}

function meshBounds(root) {
  const bounds = [];
  root.traverse((object) => {
    if (object.isMesh && object.visible !== false) bounds.push(new THREE.Box3().setFromObject(object));
  });
  return bounds;
}

test('the luxury poker table seats nobody, and the flat stages no cast at all', async () => {
  const { world } = await build();

  assert.deepEqual(collectActors(world.root, THREE), [],
    'the luxury flat is his alone; a staged actor here is the poker patrons coming back');
  assert.deepEqual(world.poker.patrons, [], 'world.poker.patrons is the empty seat count');
  assert.equal(world.metrics.pokerPatrons, 0);

  const named = [];
  world.root.traverse((object) => {
    if (/patron|guest|player-two|seated-npc/i.test(object.name ?? '')) named.push(object.name);
  });
  assert.deepEqual(named, [], 'no object in the flat is named as somebody sitting in it');

  world.dispose();
});

test('the table, its rail, its chips and all four chairs survive as furniture', async () => {
  const { world, registered } = await build();

  assert.ok(world.poker.felt?.isMesh, 'the felt is still there');
  assert.ok(world.poker.rail?.isMesh, 'the rail is still there');
  assert.equal(world.poker.felt.scale.x, world.poker.felt.scale.z,
    'the green playing surface must be circular at the source');
  assert.equal(world.poker.rail.scale.x, world.poker.rail.scale.z,
    'the surrounding rail must keep a consistent circular border');
  assert.ok(world.root.getObjectByName('luxury-poker-pedestal'), 'the pedestal is still there');
  assert.equal(world.poker.chips.length, 24, 'the chips are still on the felt');
  assert.equal(world.poker.seats.length, 4, 'all four chairs stay: he has the room, not the players');

  for (const seat of world.poker.seats) {
    const collider = world.colliders.find(({ name }) => name === `${seat.name}-collider`);
    assert.ok(collider, `${seat.name} is still a physical fixture`);
    const spatial = readSpatialPrimitive(collider);
    assert.equal(spatial.kind, 'seat');
    /* The three occupied chairs used to declare an intentional overlap with
     * the actor sitting in them. Nothing overlaps a cushion now, and a
     * re-declared overlap means a body came back with it. */
    assert.equal(spatial.intentionalOverlapWith, undefined,
      `${seat.name} no longer excuses an overlap with anybody`);
  }

  /* The prompt is the half the owner kept: "give the player the option". */
  const prompt = registered.get(world.gameStations.poker.target);
  assert.ok(prompt, 'the poker table is still an interactable');
  assert.match(prompt.label, /Play <b>poker<\/b>/);

  world.dispose();
});

test('the volume over every poker cushion is measurably empty', async () => {
  const { world } = await build();

  /* Measured on the authored chairs, not assumed: the cushion top sits at
   * y=0.56 in chair-local space (0.50 centre + 0.06 half-height), so a body in
   * the chair puts geometry in the 0.60-1.30 m band above it. That band is the
   * probe. Torso, head and folded arms of the removed 0.76-scale patrons all
   * fell inside it. */
  const raycaster = new THREE.Raycaster();
  for (const seat of world.poker.seats) {
    const cushion = seat.getObjectByName(`${seat.name}-seat`);
    const cushionBounds = new THREE.Box3().setFromObject(cushion);
    const centre = cushionBounds.getCenter(new THREE.Vector3());
    const probe = new THREE.Box3(
      new THREE.Vector3(centre.x - 0.20, cushionBounds.max.y + 0.04, centre.z - 0.20),
      new THREE.Vector3(centre.x + 0.20, cushionBounds.max.y + 0.74, centre.z + 0.20),
    );
    const chairParts = new Set();
    seat.traverse((object) => { if (object.isMesh) chairParts.add(object); });

    const intruders = [];
    world.root.traverse((object) => {
      if (!object.isMesh || object.visible === false || chairParts.has(object)) return;
      if (new THREE.Box3().setFromObject(object).intersectsBox(probe)) intruders.push(object.name || '(anonymous)');
    });
    assert.deepEqual(intruders, [], `${seat.name} has something sitting in it`);

    /* And a ray straight down through the seat finds only the chair. Object3D
     * .raycast reads matrixWorld and never recomputes it -- build() has
     * already called updateMatrixWorld(true), which is what makes this real. */
    raycaster.set(
      new THREE.Vector3(centre.x, cushionBounds.max.y + 0.80, centre.z),
      new THREE.Vector3(0, -1, 0),
    );
    raycaster.far = 0.80;
    const hitNames = raycaster.intersectObject(world.root, true)
      .map(({ object }) => object.name)
      .filter((name) => !name.startsWith(seat.name));
    assert.deepEqual(hitNames, [], `${seat.name} has a body between the ray and the cushion`);
  }

  world.dispose();
});

test('selecting poker refuses with a line instead of starting a game', async () => {
  const said = [];
  const toasted = [];
  const hud = {
    say: (line, ms) => said.push([line, ms]),
    toast: (text) => toasted.push(text),
  };

  assert.equal(refuseLuxuryPoker(hud), false,
    'the refusal must be falsy: the station uses its return value, and true would sit him down');
  assert.deepEqual(toasted, [LUXURY_POKER_REFUSAL.toast]);
  assert.deepEqual(said, [[LUXURY_POKER_REFUSAL.line, LUXURY_POKER_REFUSAL.durationMs]]);

  /* One flat line in his own voice, shared exactly with the booth cue. The
   * joke is the empty table; the line itself does not wink at the player. */
  assert.equal(LUXURY_POKER_REFUSAL.line, 'Not much of a poker game by myself.');
  assert.doesNotMatch(LUXURY_POKER_REFUSAL.line, /<[^>]+>/);
  assert.ok(LUXURY_POKER_REFUSAL.line.length > 20);
  assert.ok(LUXURY_POKER_REFUSAL.durationMs >= 2000);
  for (const wink of [/\bha\s*ha\b/i, /\blol\b/i, /\bloser\b/i, /\bno friends\b/i, /😂|🙃|😅/]) {
    assert.doesNotMatch(LUXURY_POKER_REFUSAL.line, wink, 'the joke is the situation, never the line');
  }

  /* Refusing with nothing at all is the other way to fail the owner's note:
   * he asked for the hint, not for a dead prompt. */
  assert.equal(refuseLuxuryPoker(null), false);
});

test('the poker station routes to the refusal, and no table game is mounted in the flat', () => {
  assert.match(
    MAIN_SOURCE,
    /if \(id === 'poker'\) \{[\s\S]*?return refuseLuxuryPoker\(hud\);\s*\}/,
    'the poker station must answer with the refusal',
  );
  assert.doesNotMatch(MAIN_SOURCE, /sitAt\('poker'/,
    'nothing sits him down at the poker table any more');
  assert.doesNotMatch(MAIN_SOURCE, /blackjack\.(sitDown|deal|hit|stand|double|setBet)\(/,
    'the flat no longer deals a hand');
  assert.doesNotMatch(MAIN_SOURCE, /from '\.\.\/bing\/blackjack\.js'/,
    "the Bing's dealer module is not mounted in the luxury flat");
  assert.doesNotMatch(MAIN_SOURCE, /state\.posture === 'poker'/,
    'the poker posture is unreachable, so no route may still claim the keyboard for it');
  assert.match(MAIN_SOURCE, /refuseLuxuryPoker/);
});
