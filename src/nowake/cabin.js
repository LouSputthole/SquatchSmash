/**
 * Below deck.
 *
 * "The companionway drops into a warm enclosed cabin. Engines go muffled and
 * physical. The hull creaks. Water taps the fiberglass."
 *
 * The redesign's spec also said "low ceiling… the room should feel smaller once
 * all four men are in it", and the 2026-08-06 playtest is what that produced:
 * "the confrontation plays out in a bathroom" (punch list N1). It was not a
 * figure of speech — the clear sole was 1.36 m across and 1.66 m fore and aft
 * under 1.82 m of headroom, which is a shower cubicle with a bar in it.
 *
 * So this is a SALON now. The sole dropped 0.32 m, the hull grew 0.36 m a side
 * and 0.70 m forward, the galley and dinette are shallower against their
 * liners, and there is a walkway across the front of the V-berth: 2.12 m of
 * clear floor between the two furniture runs, 2.33 m of it fore and aft, under
 * 2.08 m of headroom, with the table beside you instead of against your knees.
 * `tests/no-wake-deck.test.mjs` measures every one of those numbers.
 *
 * Everything in here is a child of the boat root, so the cabin is in the boat's
 * own coordinate system exactly like the deck is — the spec's "one stable local
 * coordinate system while aboard". Its solids live in `deck-collision.js` as
 * `CABIN_COLLIDERS` and are swept by the same resolver as the deck.
 *
 * The plan is the spec's, unchanged:
 *
 *   PORT       bar and galley — veneer counter, stainless sink, mirrored
 *              liquor cabinet, the tequila, four heavy-bottomed glasses, ice
 *              bucket, mini fridge, amber light under the cabinet, one fixed
 *              swivel stool, a bottle shelf.
 *   STARBOARD  curved dinette — booth, mounted table, Willy at the aft end,
 *              Lou at the far side, a clear firing line from the stairs, and
 *              nothing loose that can become slapstick debris.
 *   FORWARD    a partly visible V-berth behind a curtain. Not used. It is
 *              there for depth.
 *   AFT        a closed head door to starboard, a narrow sleeping compartment
 *              to port, and the companionway between them.
 *
 * Two things are load bearing and easy to undo:
 *
 *  - **The dinette's back is low (0.72 in the collision table).** Willy has to
 *    be a man the player can see and shoot over a booth, not a man behind a
 *    wall. The owner's complaint about the old scene was spawning behind a
 *    wall for the shooting beat; nothing in this room stands between the mark
 *    at the foot of the stairs and any of the three men.
 *  - **Nothing here is loose.** The bottle, the glasses and the ice bucket are
 *    authored props the scene moves by hand. No physics runs in this room, so
 *    the shot cannot turn the bar into confetti.
 *  - **Every height is written against `SOLE`, not as an absolute.** The sole
 *    moved 0.32 m for N1 and forty numbers in this file had to move with it;
 *    the ones that did not were the ones that broke. Nothing below is allowed
 *    to be a bare y again.
 */
import * as THREE from 'three';

import {
  beamBetween, box, cylinder, mat, mesh, proxy, textPlate, tube,
} from './build.js';
import { CABIN } from './deck-collision.js';

const SOLE = CABIN.height;              // -0.52
const CEILING = CABIN.ceiling;          // 1.56 — 2.08 m in the clear
/** Inboard face of the hull liner, port and starboard. */
const LINER = CABIN.halfBeam + .09;     // 2.03
/** Every working surface, measured off the sole so the room can be re-levelled. */
const COUNTER_TOP = SOLE + 0.98;
const BOOTH_SEAT = SOLE + 0.40;
const TABLE_TOP = SOLE + 0.82;
/** Centreline of the companionway, below deck. */
const STAIRS_X = -0.25;

/**
 * Build the cabin under the foredeck.
 *
 * @param {THREE.Group} root the boat root; everything is parented to it.
 */
export function buildCabin(root) {
  const group = new THREE.Group();
  group.name = 'below-deck cabin';
  root.add(group);

  const veneer = mat(0x6b4a2c, .68);
  const veneerDark = mat(0x452c1a, .74);
  const liner = mat(0xd9d2c0, .86);
  const runner = mat(0x241d18, .96);
  const vinyl = mat(0xd8d2c2, .80);
  const vinylDark = mat(0x8d5b52, .82);
  const steel = mat(0xa8b0b1, .34, .70);
  const brass = mat(0xb08b3e, .32, .78);
  const black = mat(0x14181a, .78);
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x9fb0ae, roughness: .12, transmission: .82, transparent: true,
    opacity: .38, depthWrite: false,
  });
  const mirror = new THREE.MeshStandardMaterial({
    color: 0xb8c4c4, roughness: .08, metalness: .92,
  });

  /* ---- shell: sole, liner, ceiling ---- */
  group.add(box('cabin sole', [4.16, .08, 4.20], veneerDark, 0, SOLE - .04, -3.95));
  group.add(box('cabin sole runner', [1.40, .02, 2.60], runner, -.10, SOLE + .015, -3.40));
  for (const sx of [-1, 1]) {
    group.add(box(`cabin hull liner · ${sx < 0 ? 'port' : 'starboard'}`,
      [.10, 2.16, 4.20], liner, sx * LINER, SOLE + 1.04, -3.95));
    group.add(box(`cabin veneer rail · ${sx < 0 ? 'port' : 'starboard'}`,
      [.06, .10, 4.20], veneer, sx * (LINER - .06), COUNTER_TOP + .28, -3.95));
    // Portholes: dark water and, now and then, a shoreline light.
    for (const z of [-3.30, -4.30]) {
      const port = mesh(`cabin porthole glass ${sx < 0 ? 'port' : 'stbd'} ${z}`,
        new THREE.CircleGeometry(.15, 22), glassMaterial, sx * (LINER - .025), SOLE + 1.22, z);
      port.rotation.y = -sx * Math.PI / 2;
      const ring = mesh(`cabin porthole brass ring ${sx < 0 ? 'port' : 'stbd'} ${z}`,
        new THREE.TorusGeometry(.16, .022, 8, 20), brass, sx * (LINER - .03), SOLE + 1.22, z);
      ring.rotation.y = -sx * Math.PI / 2;
      group.add(port, ring);
    }
  }
  /* Two centimetres UP into the trunk roof, not level with its underside. The
   * roof's bottom face is at 1.56 and the old liner panel was authored at 1.65,
   * so three square metres of ceiling were inside the deck the player walks on.
   * It beds now, and the headroom came out of the floor instead. */
  group.add(box('cabin ceiling panel', [4.30, .06, 4.30], liner, 0, CEILING - .02, -3.95));
  for (const z of [-2.55, -3.55, -4.55, -5.45]) {
    group.add(box(`cabin ceiling beam ${z}`, [4.24, .07, .10], veneer, 0, CEILING - .09, z));
  }

  /* ---- port: bar and galley ---- */
  const galley = new THREE.Group();
  galley.name = 'galley and wet bar';
  group.add(galley);
  /* 2 cm taller than the counter needs, so the counter beds into the carcass
   * instead of balancing on its top face over a square metre of shared plane. */
  galley.add(box('galley cabinet carcass', [.88, .96, 1.52], veneerDark, -1.59, SOLE + .49, -3.68));
  galley.add(box('galley counter top', [.92, .06, 1.54], veneer, -1.59, COUNTER_TOP, -3.68));
  galley.add(box('galley counter fiddle rail', [.04, .05, 1.54], brass, -1.15, COUNTER_TOP + .05, -3.68));
  const sink = mesh('galley stainless sink basin',
    new THREE.CylinderGeometry(.17, .14, .16, 18, 1, true), steel, -1.60, COUNTER_TOP - .07, -4.10);
  galley.add(sink);
  galley.add(mesh('galley sink drain', new THREE.CircleGeometry(.14, 18), black, -1.60, COUNTER_TOP - .14, -4.10)
    .rotateX(-Math.PI / 2));
  galley.add(beamBetween('galley tap',
    new THREE.Vector3(-1.60, COUNTER_TOP, -4.28), new THREE.Vector3(-1.60, COUNTER_TOP + .22, -4.16), .018, steel, 8));
  // Mini fridge under the counter, with a brass latch.
  galley.add(box('galley mini fridge door', [.04, .52, .58], liner, -1.16, SOLE + .40, -3.20));
  galley.add(box('galley mini fridge latch', [.05, .06, .12], brass, -1.13, SOLE + .40, -3.00));
  // Mirrored liquor cabinet and a restrained bottle shelf above the counter.
  /* Its back beds 2 cm into the liner rather than sitting flush against it:
   * flush, the cabinet and 0.87 m² of hull side shared one x plane, which is
   * the flicker class the geometry audit exists to catch. Same reason the
   * mirror sits 4 mm INSIDE the frame's face instead of on it. */
  galley.add(box('galley mirrored liquor cabinet frame', [.16, .58, 1.50], veneer, -1.92, SOLE + 1.36, -3.68));
  const mirrorPane = box('galley liquor cabinet mirror', [.02, .48, 1.40], mirror, -1.826, SOLE + 1.36, -3.68);
  galley.add(mirrorPane);
  galley.add(box('galley bottle shelf', [.22, .04, 1.40], veneer, -1.77, SOLE + 1.16, -3.68));
  galley.add(box('galley bottle shelf fiddle', [.02, .07, 1.40], brass, -1.67, SOLE + 1.20, -3.68));
  for (const [i, z] of [-4.14, -3.94, -3.42, -3.24].entries()) {
    galley.add(tube(`galley shelf bottle ${i + 1}`, .035, .26, .022,
      mat(i % 2 ? 0x3d5b32 : 0x6a3a22, .42), -1.77, SOLE + 1.31, z, 10));
  }
  /* The amber strip under the cabinet is the room's warmth. Named as a light
   * so the audit does not ask what is holding it up. */
  const underLight = box('galley under-cabinet amber light', [.10, .03, 1.36], mat(0xf0c274, .5), -1.85, SOLE + 1.06, -3.68);
  underLight.material.emissive = new THREE.Color(0xd79138);
  underLight.material.emissiveIntensity = 1.4;
  galley.add(underLight);
  const barLamp = new THREE.PointLight(0xf2c078, 2.6, 3.9, 2);
  barLamp.name = 'galley amber cabinet lamp';
  barLamp.position.set(-1.71, SOLE + 1.12, -3.68);
  galley.add(barLamp);

  // Two fixed swivel stools now the bar is long enough for them. Bolted to the
  // sole, so they cannot be knocked over.
  const stools = [];
  for (const [i, z] of [-3.30, -4.02].entries()) {
    const stool = new THREE.Group();
    stool.name = `fixed swivel bar stool ${i + 1}`;
    stool.add(cylinder(`bar stool ${i + 1} base plate`, .16, .04, steel, 0, SOLE + .02, 0, 16));
    stool.add(cylinder(`bar stool ${i + 1} column`, .045, .58, steel, 0, SOLE + .30, 0, 12));
    stool.add(cylinder(`bar stool ${i + 1} cushion`, .18, .09, vinyl, 0, SOLE + .62, 0, 18));
    stool.position.set(-.95, 0, z);
    group.add(stool);
    stools.push(stool);
  }

  // The tequila and four heavy-bottomed glasses. Authored props: the scene
  // pours one of them and rolls it across the sole, and nothing else moves.
  const bottle = new THREE.Group();
  bottle.name = 'tequila bottle';
  bottle.add(tube('tequila bottle body', .048, .24, .046, mat(0xcfc08a, .28), 0, .12, 0, 14));
  bottle.add(tube('tequila bottle shoulder', .046, .07, .018, mat(0xcfc08a, .28), 0, .27, 0, 14));
  bottle.add(cylinder('tequila bottle neck', .018, .10, mat(0xcfc08a, .28), 0, .35, 0, 12));
  bottle.add(cylinder('tequila bottle cork', .020, .04, veneerDark, 0, .41, 0, 12));
  bottle.add(box('tequila bottle label', [.07, .09, .002], mat(0xd8c98f, .8), 0, .13, .047));
  bottle.position.set(-1.46, COUNTER_TOP + .03, -4.00);
  group.add(bottle);

  const glasses = [];
  for (const [i, z] of [-3.62, -3.50, -3.38, -3.26].entries()) {
    const glass = new THREE.Group();
    glass.name = `heavy-bottomed glass ${i + 1}`;
    glass.add(cylinder(`glass ${i + 1} base`, .035, .026, glassMaterial, 0, .013, 0, 14));
    glass.add(mesh(`glass ${i + 1} wall`,
      new THREE.CylinderGeometry(.034, .032, .07, 14, 1, true), glassMaterial, 0, .062, 0));
    glass.position.set(-1.42, COUNTER_TOP + .03, z);
    group.add(glass);
    glasses.push(glass);
  }
  // The one that gets poured. It starts on the counter with the others and
  // ends against the sink foot, which is where the scene rolls it to.
  const shotGlass = glasses[0];

  // The cabin radio: a small set on the counter, running the shared station
  // schedule. It is playing faintly when the player comes below.
  const radio = new THREE.Group();
  radio.name = 'cabin radio set';
  radio.add(box('cabin radio case', [.26, .15, .13], black, 0, .075, 0));
  const radioFace = textPlate('cabin radio dial face', '97.8', .16, .07, {
    foreground: '#e6c86f', background: '#111719', border: '#364044', font: 30,
  });
  radioFace.position.set(.02, .085, .067);
  radio.add(radioFace);
  radio.add(cylinder('cabin radio tuning knob', .026, .03, brass, -.10, .06, .07, 14).rotateX(Math.PI / 2));
  const radioLedMat = new THREE.MeshStandardMaterial({
    color: 0x24312b, emissive: 0x000000, emissiveIntensity: 0,
  });
  const radioLed = cylinder('cabin radio power lamp', .012, .014, radioLedMat, .10, .035, .07, 12);
  radioLed.rotation.x = Math.PI / 2;
  radio.add(radioLed);
  radio.position.set(-1.62, COUNTER_TOP + .03, -3.02);
  group.add(radio);
  const radioTarget = proxy('cabin radio interaction', [.72, .62, .68], -1.52, COUNTER_TOP + .20, -3.02);
  group.add(radioTarget);

  /* ---- starboard: the curved dinette ---- */
  const dinette = new THREE.Group();
  dinette.name = 'curved dinette';
  group.add(dinette);
  /* The main run is an L, not a solid rectangle. Its outboard spine retains
   * the full back of the booth and its inboard-forward remnant meets the
   * forward return; the inboard-aft quarter is the legwell for the man seated
   * on the aft return. A single 0.86 x 1.50 m moulding filled that quarter and
   * put Willy's thighs, shins and shoes inside the furniture. */
  dinette.add(box('dinette booth base · outboard spine', [.53, .40, 1.50],
    veneerDark, 1.765, SOLE + .205, -3.65));
  dinette.add(box('dinette booth cushion · outboard spine', [.53, .10, 1.50],
    vinyl, 1.765, BOOTH_SEAT + .06, -3.65));
  dinette.add(box('dinette booth base · forward inboard remnant', [.33, .40, .70],
    veneerDark, 1.335, SOLE + .205, -4.05));
  dinette.add(box('dinette booth cushion · forward inboard remnant', [.33, .10, .70],
    vinyl, 1.335, BOOTH_SEAT + .06, -4.05));
  // Curved: two return cushions close the booth at each end.
  /* The returns sit 2 cm lower than the run they meet. They overlap it — the
   * booth is one moulding, not three — and at exactly the same height the
   * overlap was a quarter of a square metre of shared top face on each side,
   * reported by the audit as the flicker it would have been. */
  dinette.add(box('dinette booth cushion · forward return', [.84, .10, .42], vinyl, 1.44, BOOTH_SEAT + .04, -4.20));
  dinette.add(box('dinette booth base · forward return', [.84, .40, .42], veneerDark, 1.44, SOLE + .185, -4.20));
  dinette.add(box('dinette booth cushion · aft return', [.84, .10, .38], vinyl, 1.44, BOOTH_SEAT + .04, -3.10));
  dinette.add(box('dinette booth base · aft return', [.84, .40, .38], veneerDark, 1.44, SOLE + .185, -3.10));
  // A low back, on purpose: the man in this booth stays visible over it.
  dinette.add(box('dinette booth back rest', [.12, .42, 1.86], vinylDark, 1.97, SOLE + .68, -3.65));
  dinette.add(box('dinette table pedestal', [.10, .795, .10], steel, 1.24, SOLE + .3975, -3.80));
  dinette.add(box('dinette table top', [.66, .05, .80], veneer, 1.32, TABLE_TOP, -3.85));
  dinette.add(box('dinette table fiddle rail', [.70, .04, .03], brass, 1.32, TABLE_TOP + .04, -4.25));
  const ashtray = cylinder('dinette ashtray', .07, .03, mat(0x5c6163, .5), 1.16, TABLE_TOP + .04, -3.75, 14);
  dinette.add(ashtray);

  /* ---- forward: the V-berth, behind its curtain ---- */
  const berth = new THREE.Group();
  berth.name = 'forward V-berth';
  group.add(berth);
  /* Its foot is 2 cm below the sole, not level with it: the tarpaulin gets
   * laid on that sole and the two bottoms were fighting for the same plane. */
  berth.add(box('V-berth base', [4.00, .54, .86], veneerDark, 0, SOLE + .25, -5.52));
  berth.add(box('V-berth mattress', [3.80, .16, .82], vinyl, 0, SOLE + .58, -5.52));
  berth.add(box('V-berth rumpled bedding', [2.60, .13, .60], mat(0x8a8272, .95), -.14, SOLE + .71, -5.60));
  berth.add(box('V-berth pillow port', [.60, .13, .30], mat(0xc9c3b2, .92), -.94, SOLE + .73, -5.82));
  berth.add(box('V-berth pillow starboard', [.60, .13, .30], mat(0xc9c3b2, .92), .86, SOLE + .73, -5.82));
  berth.add(box('V-berth storage locker door', [1.60, .30, .04], veneer, 0, SOLE + .22, -5.08));
  berth.add(box('V-berth storage locker latch', [.09, .09, .04], brass, 0, SOLE + .22, -5.07));
  for (const sx of [-1, 1]) {
    const lamp = box(`V-berth reading lamp ${sx < 0 ? 'port' : 'starboard'}`, [.10, .09, .14], brass, sx * 1.80, SOLE + 1.30, -5.60);
    berth.add(lamp);
    const glow = new THREE.PointLight(0xf3cd93, 1.1, 2.0, 2);
    glow.name = `V-berth reading lamp glow ${sx < 0 ? 'port' : 'starboard'}`;
    glow.position.set(sx * 1.68, SOLE + 1.26, -5.60);
    berth.add(glow);
  }
  // The dark deck hatch overhead, and the curtain drawn most of the way across.
  berth.add(box('V-berth overhead hatch frame', [.66, .05, .66], veneerDark, 0, CEILING - .10, -5.52));
  berth.add(box('V-berth overhead hatch pane', [.56, .03, .56], black, 0, CEILING - .13, -5.52));
  const curtain = box('V-berth curtain', [2.90, .96, .05], mat(0x6d5f4c, .95), -.18, SOLE + 1.10, -5.02);
  berth.add(curtain);
  berth.add(beamBetween('V-berth curtain rail',
    new THREE.Vector3(-1.90, SOLE + 1.60, -5.02), new THREE.Vector3(1.90, SOLE + 1.60, -5.02), .014, brass, 8));

  /* ---- aft bulkhead: head to starboard, mid-cabin berth to port ---- */
  const aft = new THREE.Group();
  aft.name = 'cabin aft bulkhead';
  group.add(aft);
  aft.add(box('aft bulkhead panel · starboard', [1.38, 2.08, .09], veneer, 1.39, SOLE + 1.04, -2.02));
  aft.add(box('closed head door', [.66, 1.80, .05], veneerDark, 1.30, SOLE + .91, -1.96));
  aft.add(box('head door brass handle', [.10, .05, .06], brass, 1.58, SOLE + .95, -1.92));
  aft.add(box('head door louvre', [.48, .22, .02], veneerDark, 1.30, SOLE + 1.62, -1.93));
  aft.add(box('aft bulkhead panel · port', [.88, 2.08, .09], veneer, -1.64, SOLE + 1.04, -2.02));
  // The narrow aft sleeping compartment: a low, dark opening under the bridge
  // deck. Deliberately not enterable; it is depth, not a room.
  aft.add(box('mid-cabin berth opening surround', [.72, .12, .10], veneerDark, -1.62, SOLE + .78, -1.98));
  aft.add(box('mid-cabin berth darkness', [.66, .62, .06], mat(0x0d1012, 1), -1.62, SOLE + .44, -2.00));
  aft.add(box('mid-cabin berth mattress edge', [.66, .10, .30], vinyl, -1.62, SOLE + .14, -2.14));

  /* ---- the companionway: steps, sill, sliding hatch and doors ---- */
  const companionway = new THREE.Group();
  companionway.name = 'companionway';
  group.add(companionway);
  companionway.add(box('companionway sill', [1.90, .30, .12], veneerDark, STAIRS_X, SOLE + .10, -2.06));
  /* Wider than a real one, on purpose: the spec asks for it so the two-person
   * carry animation has somewhere to be. Five treads now the sole is 0.32 m
   * deeper — the rise per tread is unchanged at 0.30, which is what keeps the
   * carry's authored climb reading as a climb. */
  for (let i = 0; i < 5; i++) {
    companionway.add(box(`companionway tread ${i + 1}`, [1.66, .07, .30], veneer,
      STAIRS_X, SOLE + .34 + i * .30, -1.94 + i * .30));
    companionway.add(box(`companionway riser ${i + 1}`, [1.66, .28, .04], veneerDark,
      STAIRS_X, SOLE + .20 + i * .30, -2.08 + i * .30));
  }
  for (const sx of [-1, 1]) {
    companionway.add(box(`companionway side rail ${sx < 0 ? 'port' : 'starboard'}`,
      [.07, 1.36, 1.50], veneer, STAIRS_X + sx * .87, SOLE + .70, -1.60));
  }
  /* The doors Booski closes. Hinged as a pair so `setClosed` swings them shut
   * and the engines all but vanish. */
  const doorPort = box('companionway door · port leaf', [.95, 1.40, .05], veneerDark, .475, .70, 0);
  const doorStarboard = box('companionway door · starboard leaf', [.95, 1.40, .05], veneerDark, -.475, .70, 0);
  const doorHingePort = new THREE.Group();
  doorHingePort.name = 'companionway door hinge · port';
  doorHingePort.position.set(STAIRS_X - .95, SOLE + .10, -2.00);
  doorHingePort.add(doorPort);
  const doorHingeStarboard = new THREE.Group();
  doorHingeStarboard.name = 'companionway door hinge · starboard';
  doorHingeStarboard.position.set(STAIRS_X + .95, SOLE + .10, -2.00);
  doorHingeStarboard.add(doorStarboard);
  companionway.add(doorHingePort, doorHingeStarboard);

  const companionwayTarget = proxy('companionway interaction · below', [1.90, 1.90, .90], STAIRS_X, SOLE + 1.00, -2.32);
  group.add(companionwayTarget);

  /* ---- the tarp and the body bag, in the locker under the dinette ---- */
  const tarp = box('folded tarpaulin', [.86, .12, .62], mat(0x2f4048, .95), .60, SOLE + .06, -3.00);
  tarp.visible = false;
  group.add(tarp);

  /* ---- practical light ---- */
  const cabinLight = new THREE.PointLight(0xf6d3a0, 3.9, 8.0, 2);
  cabinLight.name = 'cabin amber overhead light';
  cabinLight.position.set(0, CEILING - .24, -3.60);
  group.add(cabinLight);
  const dome = mesh('cabin overhead light dome',
    new THREE.SphereGeometry(.11, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    mat(0xf0dcb4, .5), 0, CEILING - .14, -3.60);
  dome.material.emissive = new THREE.Color(0xd8a862);
  dome.material.emissiveIntensity = 1.1;
  group.add(dome);
  group.add(mesh('cabin overhead light brass ring',
    new THREE.TorusGeometry(.12, .016, 8, 18), brass, 0, CEILING - .12, -3.60).rotateX(Math.PI / 2));

  let detailMeshes = 0;
  group.traverse((object) => { if (object.isMesh) detailMeshes++; });
  group.userData.detailMeshes = detailMeshes;

  return {
    group,
    targets: { radio: radioTarget, companionway: companionwayTarget },
    props: {
      bottle, glasses, shotGlass, tarp, radio, curtain, cabinLight, dome, barLamp, stools,
      sinkFoot: new THREE.Vector3(-1.60, SOLE + .04, -4.10),
    },
    controls: {
      radio: {
        root: radio,
        setOn(on) {
          radioLedMat.color.setHex(on ? 0x5bd889 : 0x24312b);
          radioLedMat.emissive.setHex(on ? 0x1d9a52 : 0x000000);
          radioLedMat.emissiveIntensity = on ? 1.8 : 0;
        },
      },
    },
    /** Booski closes the companionway; the engine room all but disappears. */
    setDoorsClosed(closed) {
      doorHingePort.rotation.y = closed ? 0 : -1.25;
      doorHingeStarboard.rotation.y = closed ? 0 : 1.25;
      group.userData.doorsClosed = closed;
    },
    /** The one lit surface in the room, dimmed for the confrontation. */
    setLampLevel(level) {
      cabinLight.intensity = 3.4 * level;
      barLamp.intensity = 2.6 * level;
    },
  };
}
