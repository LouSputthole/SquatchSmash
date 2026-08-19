import { CHARACTER_IDS } from '../core/campaign.js';
import { SmokeSystem } from '../world/smoke.js';
import { collectGolfBagGeometry } from './runtime.js';

import { CartPair } from './carts.js';
import { Golfer, makeBag, makeBall, makeBallMarker } from './cast.js';
import { heightAt } from './field.js';
import { createHeldProps } from './hands.js';
import { HOLE, setActiveHole } from './hole.js';
import {
  createGolfLandingPreview,
  createPlayerClubRig,
} from './presentation-geometry.js';
import { Course } from './terrain.js';

export const GOLF_RUNTIME_GOLFER_IDS = Object.freeze([
  CHARACTER_IDS.LOU,
  CHARACTER_IDS.RIPPINFLOW,
  CHARACTER_IDS.ERIC,
]);

const ALL_BALL_IDS = Object.freeze([
  ...GOLF_RUNTIME_GOLFER_IDS,
  CHARACTER_IDS.PROSPECT,
]);

function putBallsOnActiveTee(ballMeshes, markers) {
  const { x, z } = HOLE.teeMarks.ball;
  const y = heightAt(x, z);
  for (const [id, mesh] of ballMeshes) {
    mesh.position.set(x, y + 0.0213, z);
    const marker = markers.get(id);
    if (marker) marker.position.set(x, y + 0.055, z);
  }
}

/**
 * Build every scene-start geometry producer used by Silver Pines.
 *
 * The browser owns game systems around these objects; this module owns only
 * construction and deterministic checkpoint pose. It is therefore safe for
 * Node to import without executing WebGL, DOM wiring, audio, or campaign boot.
 */
export function buildGolfRuntimeGeometry(scene, camera, {
  renderer = null,
  hole = 1,
  grille = false,
} = {}) {
  if (![1, 2, 3].includes(hole)) throw new Error(`Golf runtime geometry: invalid hole ${hole}`);

  // HOLE is a live module binding. Reset it so repeated test builds cannot
  // inherit the prior descriptor's state before constructing the car park.
  setActiveHole(1);

  const smoke = new SmokeSystem(scene);
  const course = new Course(scene, renderer);
  const golfers = Object.fromEntries(GOLF_RUNTIME_GOLFER_IDS.map((id) => [
    id,
    new Golfer(scene, id, { ...HOLE.lot[id], yaw: Math.PI }),
  ]));
  const carts = new CartPair(scene);
  carts.parkInLot(HOLE.lot.carts);
  const bag = makeBag(scene, HOLE.lot.bag.x, HOLE.lot.bag.z, 0.4);
  // Later-hole checkpoints restore a round in which the player already
  // picked this bag up. Do not leave its Hole 1 world prop behind after
  // Course.load() removes the car-park terrain beneath it.
  if (hole !== 1) collectGolfBagGeometry(bag);

  const ballMeshes = new Map();
  for (const id of ALL_BALL_IDS) {
    const mesh = makeBall(scene, id === CHARACTER_IDS.PROSPECT ? 0xffffff : 0xeef0f4);
    mesh.name = `golf-ball-${id}`;
    ballMeshes.set(id, mesh);
  }

  const markers = new Map([
    [CHARACTER_IDS.PROSPECT, makeBallMarker(scene)],
    [CHARACTER_IDS.ERIC, makeBallMarker(scene, {
      name: 'npc-ball-flight-marker-eric', colour: 0x70d9ff, radius: 0.28, glowOpacity: 0.24,
    })],
    [CHARACTER_IDS.RIPPINFLOW, makeBallMarker(scene, {
      name: 'npc-ball-flight-marker-rippinflow', colour: 0xffc85c, radius: 0.30, glowOpacity: 0.24,
    })],
    [CHARACTER_IDS.LOU, makeBallMarker(scene, {
      name: 'npc-ball-flight-marker-lou', colour: 0xc2a2ff, radius: 0.30, glowOpacity: 0.24,
    })],
  ]);
  for (const marker of markers.values()) marker.visible = false;

  const landingPreview = createGolfLandingPreview(scene);
  const playerClub = createPlayerClubRig(camera);
  const heldProps = createHeldProps(camera);

  if (hole !== 1) {
    course.load(hole);
    for (const id of GOLF_RUNTIME_GOLFER_IDS) {
      const at = HOLE.teeMarks[id];
      if (!at) throw new Error(`Golf runtime geometry: Hole ${hole} has no tee mark for ${id}`);
      golfers[id].placeAt(at.x, at.z, Math.PI);
      golfers[id].idle();
    }
    carts.stage();
  }
  putBallsOnActiveTee(ballMeshes, markers);

  if (grille && hole !== 3) {
    throw new Error('Golf runtime geometry: grille staging requires Hole 3');
  }
  if (grille && course.gallery.length !== 5) {
    throw new Error(`Golf runtime geometry: grille expected 5 gallery figures, got ${course.gallery.length}`);
  }

  return Object.freeze({
    course,
    golfers,
    carts,
    bag,
    ballMeshes,
    markers,
    landingPreview,
    playerClub,
    heldProps,
    smoke,
    hole: HOLE.number,
    grille,
  });
}
