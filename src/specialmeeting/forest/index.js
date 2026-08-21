/**
 * THE SPECIAL MEETING — the night forest road, as one call.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * THE SCENE THIS IS FOR
 *
 * The player has spent the entire campaign trying to become part of the
 * family. This is the drive to the night he finally gets it, and for the
 * ten minutes before he does he should be thinking that he has made a
 * catastrophic career decision. Three men he knows have rearranged an
 * entire car so that he ends up in the front seat, and nobody has been rude
 * to him, and nobody has explained anything.
 *
 * Everything in this subtree serves that. The road narrows, the trees close
 * in, the fog thickens and the light goes away, over about two minutes, and
 * at no point does the scene point at any of it. See
 * `docs/SPECIAL-MEETING-SCRIPT.md` and `docs/TONE-AND-PARODY.md`.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THIS OWNS, AND WHAT IT DOES NOT
 *
 * OWNS: the geography from the edge of town to the clearing — the road, the
 * ground, the forest, the car, the drive, the passenger seat and the
 * arrival.
 *
 * DOES NOT OWN: the block outside the flat (`../layout.js`, `../drive.js`),
 * the cast, the dialogue, the voice, the HUD, the campaign, or the walk up
 * the trail at the far end. It raises named events at the places on the road
 * where the script has beats and gets out of the way.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * USING IT
 *
 *   const forest = createNightForestRoad({ scene, renderer, player });
 *   forest.board();                       // the player is in the front seat
 *   forest.start();                       // and the car pulls away
 *   // per frame, before rendering:
 *   forest.update(dt);
 *
 * The beats come back through `onNode`:
 *
 *   createNightForestRoad({ …, onNode(id) {
 *     if (id === 'turn_off') dialogue.play(SM_220);
 *     if (id === 'chain') { chainBeat(() => forest.resume()); }
 *     if (id === 'arrival') { forest.killEngine(); }
 *   }})
 *
 * Two ids STOP the car and wait: `chain` (SM-260) and `arrival` (SM-330).
 * Nothing moves again until `resume()` is called, which is what lets a beat
 * take exactly as long as its lines take.
 *
 * The whole subtree is deterministic and has no audio, no DOM outside the
 * canvas textures, and no campaign dependency, so it can be built headless.
 */

import * as THREE from 'three';
import {
  cruiseSpeedAt, driveSeconds, minimumLegSeparation, roadAt, roadLength,
  ROAD_EVENTS, roadNodes, stageAt, STAGES,
} from './road.js';
import { groundAt, heightAt, surfaceAt, surfaceProps } from './field.js';
import { buildNightSedan, SEATS } from './car.js';
import { buildClearing } from './clearing.js';
import { ForestDrive } from './driver.js';
import { applyForestNight } from './night.js';
import { CREW_SEATS, PassengerRig, exitLookPoint, exitYaw } from './passenger.js';
import { buildRoadMesh } from './roadmesh.js';
import { disposeForestTextures } from './textures.js';
import { disposeFoliageGeometry } from './foliage.js';
import { ForestTerrain } from './terrain.js';
import { publishMeetingFramingBeats, spurFramingBeats } from '../shots.js';

/**
 * Build the drive.
 *
 * @param {object} options
 * @param {THREE.Scene} options.scene
 * @param {THREE.WebGLRenderer} [options.renderer] for tone mapping and
 *        shadows. Omit and the caller keeps its own renderer settings.
 * @param {object} [options.player] the core `Player`. Given one, the
 *        passenger seat is wired and `board()` puts him in it.
 * @param {object} [options.car] the car to drive. THE FINISHED SCENE SHOULD
 *        PASS ONE: the block outside the flat builds the Lincoln the player
 *        watches pull up and gets into (`../sedan.js`), and it has to be the
 *        same car that arrives in the woods — wrap it with
 *        `adaptMeetingSedan()` from `./sedan-adapter.js` and hand it in.
 *        Omitted, this builds its own, which is right for a preview page or a
 *        headless harness and wrong for the campaign.
 * @param {THREE.Box3[]} [options.colliders] a live array for the walk at the
 *        far end. Kept in place, never replaced.
 * @param {(id: string) => void} [options.onNode] the script's beats.
 * @param {(strength: number) => void} [options.onJolt] the cattle grid.
 * @param {number} [options.timeScale] stretch the drive to fit the dialogue.
 * @param {boolean} [options.shadows] headlamp shadow map. Off on a slow
 *        machine costs one good effect and buys a third of the frame.
 * @param {(stage: string) => void} [options.onProgress] loading captions.
 */
export function createNightForestRoad({
  scene,
  renderer = null,
  player = null,
  car: injectedCar = null,
  colliders = null,
  onNode = null,
  onJolt = null,
  timeScale = 1,
  shadows = true,
  onProgress = null,
} = {}) {
  if (!scene) throw new Error('createNightForestRoad needs a scene');

  const group = new THREE.Group();
  group.name = 'specialmeeting.forest';
  scene.add(group);

  onProgress?.('Night falling…');
  const night = applyForestNight(scene, { renderer });

  onProgress?.('Laying the road…');
  const roadMesh = buildRoadMesh(group);

  onProgress?.('Growing the woods…');
  const terrain = new ForestTerrain(group, { colliders });

  onProgress?.('Somebody is already here…');
  const clearing = buildClearing(group, { colliders });

  onProgress?.('The car…');
  const car = injectedCar ?? buildNightSedan(group, { shadows });
  const ownsCar = !injectedCar;
  /* An injected car is borrowed, not taken. It is re-parented under the forest
   * so one `remove` takes the whole scene away, and put back where it came
   * from on the way out — the block still needs it after the drive, and a
   * borrowed car quietly deleted at teardown is the sort of thing that shows
   * up two scenes later as nothing at the kerb. */
  const carHome = injectedCar ? injectedCar.group.parent : null;
  if (injectedCar && carHome !== group) group.add(injectedCar.group);

  const drive = new ForestDrive(car, {
    onNode: (id) => {
      /* Two things the geography itself is responsible for, done before the
       * caller hears about the beat: full beams when the tarmac ends, because
       * the driver would, and the phone going away at the arrival, because
       * SM-400 says Lag puts it away and that reads as worse than anything he
       * has said. Everything else is the scene's business, not the road's. */
      if (id === 'turn_off') car.setMainBeam(true);
      if (id === 'arrival') car.setPhone(false);
      /* AND THE SHOT LIST FOR THE SPUR, at the one moment the car is where it
       * is going to be. `src/specialmeeting/shots.js` says what a beat here
       * may honestly claim; this is why they are published HERE and not at
       * construction. Both spur beats are cameras derived from the parked car
       * -- the ground beside the front passenger door he steps out onto, and
       * the heading `PassengerRig.leave()` turns him to -- and the car spends
       * the preceding kilometre nowhere near either. Published at build time
       * they would describe a shot taken at the start of the road. */
      if (id === 'arrival') publishSpurShots();
      onNode?.(id, api);
    },
    onJolt,
    timeScale,
  });

  const passenger = player ? new PassengerRig(player, car, { seat: 'frontPassenger' }) : null;

  /* Prime the world around the start of the road before anybody sees it. A
   * tenth of a second here, behind whatever loading caption the scene is
   * showing, instead of four seconds of forest appearing around a moving car
   * while somebody is talking. */
  onProgress?.('Filling the dark in…');
  terrain.prime(car.group.position);

  /** The player's standing eye, in metres. `stage.js` builds him at it. */
  const PLAYER_EYE_M = 1.66;

  let elapsed = 0;

  /**
   * The two shots at the far end of the road, as data the framing gate reads.
   *
   * A function declaration rather than an inline block because it is called
   * from `ForestDrive`'s node callback, which is wired above the car it needs
   * -- hoisting is doing real work here and not tidiness.
   */
  function publishSpurShots() {
    const exit = car.exitWorld('frontPassenger', new THREE.Vector3());
    /* The eye, not the ground: `leave()` stands him up before it turns him,
     * and the heading is measured from where he ends up. */
    const standing = exit.clone().setY(exit.y + PLAYER_EYE_M);
    publishMeetingFramingBeats(group, spurFramingBeats({
      exit,
      /* `exitYaw()` and not a second opinion about it. The whole value of the
       * beat is that the shot list and the rig agree about which way he is
       * pointed; two copies of that rule is two things to keep true, and this
       * scene has already been bitten twice by a heading written down twice. */
      heading: exitYaw(car, standing),
      /* What that heading is pointed at, taken from the rule rather than
       * rebuilt from the car: one copy of "the back half of the Lincoln". */
      lookTarget: exitLookPoint(car),
      trailHeading: api.trailYaw,
      trailhead: clearing.trailhead,
      trailNext: clearing.path[1] ?? null,
    }));
  }

  const api = {
    /** Everything this built, under one node. Remove it and the forest is gone. */
    group,
    car,
    drive,
    passenger,
    terrain,
    roadMesh,
    clearing,
    night,

    /** The chain across the track. SM-260 opens it and closes it again. */
    get chain() { return roadMesh.chain; },

    /* ---- the road, for anything that wants to ask ---- */
    road: Object.freeze({
      at: roadAt,
      length: roadLength,
      stageAt,
      cruiseSpeedAt,
      events: ROAD_EVENTS,
      nodes: roadNodes,
      stages: STAGES,
    }),
    heightAt,
    groundAt,
    surfaceAt,
    surfaceProps,

    /** The player's world object, for a `Player` that has to walk at the end. */
    world: {
      colliders: colliders ?? [],
      floorZones: [],
      groundAt,
    },

    /* ---- staging ---- */

    /** Put the player in the front seat. Nobody asked him which seat he wanted. */
    board() {
      passenger?.board();
      return api;
    },

    /** Pull away. */
    start() {
      drive.start();
      return api;
    },

    /** Release a scripted stop — the chain, once it is down. */
    resume() {
      drive.resume();
      return api;
    },

    /**
     * SM-330. The engine goes off; the lights stay on for a moment, on
     * nothing, and then they go off too.
     *
     * Two calls rather than one, because the gap between them IS the beat:
     * three or four seconds of trunks and the dark between them, and then
     * total dark and the tick of a cooling engine.
     */
    killEngine() {
      drive.shutDown();
      return api;
    },

    killLights() {
      car.setHeadlights(false);
      car.setCabinLight(false);
      return api;
    },

    /** Get out. The door is not opened for him this time. */
    leave() {
      passenger?.leave();
      return api;
    },

    /* ---- the frame ---- */

    /**
     * One frame, in this order and no other.
     *
     * The drive moves the car; the passenger's eye is a point ON the car, so
     * it has to be read after; the terrain streams around wherever the eye
     * ended up; and the night follows the same focus. Reading the seat before
     * the car has moved is a head that lags the body by one frame, which at
     * nine metres a second is fifteen centimetres of judder on every bend.
     */
    update(dt) {
      elapsed += dt;
      drive.update(dt);
      passenger?.update(dt);

      const focus = passenger?.seated
        ? player.position
        : (player?.position ?? car.group.position);
      terrain.update(dt, focus);
      night.update(dt, { stage: drive.stage, progress: drive.progress, focus });
      clearing.update(dt, player?.camera ?? null);
      return api;
    },

    /* ---- places the scene above needs by name ---- */

    /** Where the walk starts. SM-500. */
    get trailhead() { return clearing.trailhead; },
    /**
     * The heading that starts UP the trail, in the player's own convention.
     *
     * SM-530 moves him to the trailhead and, until the framing gate was
     * pointed at this scene, changed nothing else -- so he arrived there still
     * carrying whichever way `leave()` had turned him at the car, which is
     * roughly back down the clearing. *"Trail's up there. Straight up. You
     * can't miss it."* He could.
     */
    get trailYaw() {
      const [head, next] = clearing.path;
      return Math.atan2(-(next.x - head.x), -(next.z - head.z));
    },
    /** The trail, surveyed once, for whatever walks it. */
    get trail() { return clearing.path; },
    get clearingCentre() { return clearing.centre; },
    /** Which seat each man is in. Numbskull is behind the Prospect. */
    seats: CREW_SEATS,
    seatLocals: SEATS,

    /** World position of a seat, for putting a body in one. */
    seatWorld(which, part = 'hip', out = new THREE.Vector3()) {
      return car.seatWorld(which, part, out);
    },

    /** Ground beside a door, for getting out. */
    exitWorld(which, out = new THREE.Vector3()) {
      return car.exitWorld(which, out);
    },

    /* ---- numbers, for a check or a report ---- */

    stats() {
      return {
        roadLength: roadLength(),
        driveSeconds: driveSeconds(),
        stages: [...STAGES],
        events: ROAD_EVENTS.map((event) => event.id),
        trees: terrain.treeCount,
        chunks: terrain.chunks.size,
        legSeparation: minimumLegSeparation().distance,
        elapsed,
        distance: drive.distance,
        speed: drive.speed,
        stage: drive.stage,
      };
    },

    dispose() {
      clearing.dispose();
      /* An injected car belongs to whoever built it — the block, which still
       * needs it after the drive. Only the lamps this subtree bolted on go. */
      car.dispose();
      if (!ownsCar) {
        group.remove(car.group);
        carHome?.add(car.group);
      }
      terrain.dispose();
      roadMesh.dispose();
      night.dispose();
      /* Shared across every chunk and every load — released last, once, and
       * only when the whole forest is going. */
      disposeFoliageGeometry();
      disposeForestTextures();
      scene.remove(group);
      return api;
    },
  };

  return Object.freeze(api);
}

/* The pieces, for anything that wants one without the whole drive — a
 * preview page, a geometry harness, or the block outside the flat, which
 * should build the SAME car rather than a second one that looks like it. */
export { buildNightSedan, SEATS } from './car.js';
export { adaptMeetingSedan } from './sedan-adapter.js';
export { ForestDrive } from './driver.js';
export { PassengerRig, CREW_SEATS, LOOK_CONE } from './passenger.js';
export { applyForestNight, FOG_BY_STAGE } from './night.js';
export { ForestTerrain } from './terrain.js';
export { buildRoadMesh } from './roadmesh.js';
export { buildClearing } from './clearing.js';
export {
  CLEARING, heightAt, groundAt, surfaceAt, surfaceProps, SURFACE, TRAIL,
} from './field.js';
export {
  cruiseSpeedAt, driveSeconds, minimumLegSeparation, roadAt, roadLength,
  ROAD_EVENTS, roadNodes, stageAt, STAGES, STAGE_SPEED,
} from './road.js';
