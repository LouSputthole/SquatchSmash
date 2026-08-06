/**
 * Below deck.
 *
 * "The companionway drops into a warm enclosed cabin. Engines go muffled and
 * physical. Low ceiling. The hull creaks. Water taps the fiberglass. The room
 * should feel smaller once all four men are in it."
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
 */
import * as THREE from 'three';

import {
  beamBetween, box, cylinder, mat, mesh, proxy, textPlate, tube,
} from './build.js';
import { CABIN } from './deck-collision.js';

const SOLE = CABIN.height;          // -0.20
const CEILING = CABIN.ceiling;      // 1.62
const COUNTER_TOP = 0.78;
const BOOTH_SEAT = 0.20;
const TABLE_TOP = 0.62;

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
  group.add(box('cabin sole', [3.24, .08, 3.10], veneerDark, 0, SOLE - .04, -3.55));
  group.add(box('cabin sole runner', [1.10, .02, 2.30], runner, -.06, SOLE + .015, -3.20));
  for (const sx of [-1, 1]) {
    group.add(box(`cabin hull liner · ${sx < 0 ? 'port' : 'starboard'}`,
      [.10, 1.84, 3.10], liner, sx * 1.63, SOLE + .90, -3.55));
    group.add(box(`cabin veneer rail · ${sx < 0 ? 'port' : 'starboard'}`,
      [.06, .10, 3.10], veneer, sx * 1.57, COUNTER_TOP + .28, -3.55));
    // Portholes: dark water and, now and then, a shoreline light.
    for (const z of [-2.95, -3.75]) {
      const port = mesh(`cabin porthole glass ${sx < 0 ? 'port' : 'stbd'} ${z}`,
        new THREE.CircleGeometry(.15, 22), glassMaterial, sx * 1.575, 1.02, z);
      port.rotation.y = -sx * Math.PI / 2;
      const ring = mesh(`cabin porthole brass ring ${sx < 0 ? 'port' : 'stbd'} ${z}`,
        new THREE.TorusGeometry(.16, .022, 8, 20), brass, sx * 1.57, 1.02, z);
      ring.rotation.y = -sx * Math.PI / 2;
      group.add(port, ring);
    }
  }
  group.add(box('cabin ceiling panel', [3.30, .06, 3.30], liner, 0, CEILING + .03, -3.55));
  for (const z of [-2.60, -3.50, -4.40]) {
    group.add(box(`cabin ceiling beam ${z}`, [3.26, .07, .10], veneer, 0, CEILING - .04, z));
  }

  /* ---- port: bar and galley ---- */
  const galley = new THREE.Group();
  galley.name = 'galley and wet bar';
  group.add(galley);
  /* 2 cm taller than the counter needs, so the counter beds into the carcass
   * instead of balancing on its top face over a square metre of shared plane. */
  galley.add(box('galley cabinet carcass', [.96, .96, 1.12], veneerDark, -1.22, SOLE + .49, -3.30));
  galley.add(box('galley counter top', [1.00, .06, 1.14], veneer, -1.22, COUNTER_TOP, -3.30));
  galley.add(box('galley counter fiddle rail', [.04, .05, 1.14], brass, -.74, COUNTER_TOP + .05, -3.30));
  const sink = mesh('galley stainless sink basin',
    new THREE.CylinderGeometry(.17, .14, .16, 18, 1, true), steel, -1.20, COUNTER_TOP - .07, -3.72);
  galley.add(sink);
  galley.add(mesh('galley sink drain', new THREE.CircleGeometry(.14, 18), black, -1.20, COUNTER_TOP - .14, -3.72)
    .rotateX(-Math.PI / 2));
  galley.add(beamBetween('galley tap',
    new THREE.Vector3(-1.20, COUNTER_TOP, -3.90), new THREE.Vector3(-1.20, COUNTER_TOP + .22, -3.78), .018, steel, 8));
  // Mini fridge under the counter, with a brass latch.
  galley.add(box('galley mini fridge door', [.04, .52, .58], liner, -.75, SOLE + .40, -3.02));
  galley.add(box('galley mini fridge latch', [.05, .06, .12], brass, -.72, SOLE + .40, -2.82));
  // Mirrored liquor cabinet and a restrained bottle shelf above the counter.
  galley.add(box('galley mirrored liquor cabinet frame', [.16, .58, 1.10], veneer, -1.49, 1.16, -3.30));
  const mirrorPane = box('galley liquor cabinet mirror', [.02, .48, 1.00], mirror, -1.405, 1.16, -3.30);
  galley.add(mirrorPane);
  galley.add(box('galley bottle shelf', [.22, .04, 1.00], veneer, -1.36, .96, -3.30));
  galley.add(box('galley bottle shelf fiddle', [.02, .07, 1.00], brass, -1.26, 1.00, -3.30));
  for (const [i, z] of [-3.68, -3.52, -3.06, -2.92].entries()) {
    galley.add(tube(`galley shelf bottle ${i + 1}`, .035, .26, .022,
      mat(i % 2 ? 0x3d5b32 : 0x6a3a22, .42), -1.36, 1.11, z, 10));
  }
  /* The amber strip under the cabinet is the room's warmth. Named as a light
   * so the audit does not ask what is holding it up. */
  const underLight = box('galley under-cabinet amber light', [.10, .03, .96], mat(0xf0c274, .5), -1.44, .86, -3.30);
  underLight.material.emissive = new THREE.Color(0xd79138);
  underLight.material.emissiveIntensity = 1.4;
  galley.add(underLight);
  const barLamp = new THREE.PointLight(0xf2c078, 2.6, 3.4, 2);
  barLamp.name = 'galley amber cabinet lamp';
  barLamp.position.set(-1.30, .92, -3.30);
  galley.add(barLamp);

  // The one fixed swivel stool. Bolted to the sole, so it cannot be knocked over.
  const stool = new THREE.Group();
  stool.name = 'fixed swivel bar stool';
  stool.add(cylinder('bar stool base plate', .16, .04, steel, 0, SOLE + .02, 0, 16));
  stool.add(cylinder('bar stool column', .045, .58, steel, 0, SOLE + .30, 0, 12));
  stool.add(cylinder('bar stool cushion', .18, .09, vinyl, 0, SOLE + .62, 0, 18));
  stool.position.set(-.52, 0, -2.86);
  group.add(stool);

  // The tequila and four heavy-bottomed glasses. Authored props: the scene
  // pours one of them and rolls it across the sole, and nothing else moves.
  const bottle = new THREE.Group();
  bottle.name = 'tequila bottle';
  bottle.add(tube('tequila bottle body', .048, .24, .046, mat(0xcfc08a, .28), 0, .12, 0, 14));
  bottle.add(tube('tequila bottle shoulder', .046, .07, .018, mat(0xcfc08a, .28), 0, .27, 0, 14));
  bottle.add(cylinder('tequila bottle neck', .018, .10, mat(0xcfc08a, .28), 0, .35, 0, 12));
  bottle.add(cylinder('tequila bottle cork', .020, .04, veneerDark, 0, .41, 0, 12));
  bottle.add(box('tequila bottle label', [.07, .09, .002], mat(0xd8c98f, .8), 0, .13, .047));
  bottle.position.set(-1.06, COUNTER_TOP + .03, -3.42);
  group.add(bottle);

  const glasses = [];
  for (const [i, z] of [-3.20, -3.08, -2.96, -2.84].entries()) {
    const glass = new THREE.Group();
    glass.name = `heavy-bottomed glass ${i + 1}`;
    glass.add(cylinder(`glass ${i + 1} base`, .035, .026, glassMaterial, 0, .013, 0, 14));
    glass.add(mesh(`glass ${i + 1} wall`,
      new THREE.CylinderGeometry(.034, .032, .07, 14, 1, true), glassMaterial, 0, .062, 0));
    glass.position.set(-1.02, COUNTER_TOP + .03, z);
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
  radio.position.set(-1.26, COUNTER_TOP + .03, -2.62);
  group.add(radio);
  const radioTarget = proxy('cabin radio interaction', [.62, .52, .58], -1.20, COUNTER_TOP + .18, -2.62);
  group.add(radioTarget);

  /* ---- starboard: the curved dinette ---- */
  const dinette = new THREE.Group();
  dinette.name = 'curved dinette';
  group.add(dinette);
  dinette.add(box('dinette booth base', [1.06, .40, 1.24], veneerDark, 1.17, SOLE + .205, -3.24));
  dinette.add(box('dinette booth cushion', [1.06, .10, 1.24], vinyl, 1.17, BOOTH_SEAT + .06, -3.24));
  // Curved: two return cushions close the booth at each end.
  dinette.add(box('dinette booth cushion · forward return', [.72, .10, .38], vinyl, 1.34, BOOTH_SEAT + .06, -3.72));
  dinette.add(box('dinette booth base · forward return', [.72, .40, .38], veneerDark, 1.34, SOLE + .205, -3.72));
  dinette.add(box('dinette booth cushion · aft return', [.72, .10, .34], vinyl, 1.34, BOOTH_SEAT + .06, -2.76));
  dinette.add(box('dinette booth base · aft return', [.72, .40, .34], veneerDark, 1.34, SOLE + .205, -2.76));
  // A low back, on purpose: the man in this booth stays visible over it.
  dinette.add(box('dinette booth back rest', [.12, .42, 1.90], vinylDark, 1.55, .48, -3.24));
  dinette.add(box('dinette table pedestal', [.10, .74, .10], steel, .92, SOLE + .37, -3.24));
  dinette.add(box('dinette table top', [.62, .05, 1.02], veneer, .96, TABLE_TOP, -3.24));
  dinette.add(box('dinette table fiddle rail', [.66, .04, .03], brass, .96, TABLE_TOP + .04, -3.74));
  const ashtray = cylinder('dinette ashtray', .07, .03, mat(0x5c6163, .5), .84, TABLE_TOP + .04, -2.94, 14);
  dinette.add(ashtray);

  /* ---- forward: the V-berth, behind its curtain ---- */
  const berth = new THREE.Group();
  berth.name = 'forward V-berth';
  group.add(berth);
  /* Its foot is 2 cm below the sole, not level with it: the tarpaulin gets
   * laid on that sole and the two bottoms were fighting for the same plane. */
  berth.add(box('V-berth base', [3.10, .54, 1.24], veneerDark, 0, SOLE + .26, -4.52));
  berth.add(box('V-berth mattress', [2.90, .16, 1.16], vinyl, 0, .14, -4.52));
  berth.add(box('V-berth rumpled bedding', [2.10, .13, .78], mat(0x8a8272, .95), -.14, .26, -4.62));
  berth.add(box('V-berth pillow port', [.52, .13, .30], mat(0xc9c3b2, .92), -.78, .28, -4.94));
  berth.add(box('V-berth pillow starboard', [.52, .13, .30], mat(0xc9c3b2, .92), .70, .28, -4.94));
  berth.add(box('V-berth storage locker door', [1.30, .30, .04], veneer, 0, SOLE + .22, -3.87));
  berth.add(box('V-berth storage locker latch', [.09, .09, .04], brass, 0, SOLE + .22, -3.86));
  for (const sx of [-1, 1]) {
    const lamp = box(`V-berth reading lamp ${sx < 0 ? 'port' : 'starboard'}`, [.10, .09, .14], brass, sx * 1.40, 1.10, -4.60);
    berth.add(lamp);
    const glow = new THREE.PointLight(0xf3cd93, 1.1, 2.0, 2);
    glow.name = `V-berth reading lamp glow ${sx < 0 ? 'port' : 'starboard'}`;
    glow.position.set(sx * 1.28, 1.06, -4.60);
    berth.add(glow);
  }
  // The dark deck hatch overhead, and the curtain drawn most of the way across.
  berth.add(box('V-berth overhead hatch frame', [.66, .05, .66], veneerDark, 0, CEILING - .04, -4.60));
  berth.add(box('V-berth overhead hatch pane', [.56, .03, .56], black, 0, CEILING - .07, -4.60));
  const curtain = box('V-berth curtain', [2.34, .96, .05], mat(0x6d5f4c, .95), -.18, .90, -3.92);
  berth.add(curtain);
  berth.add(beamBetween('V-berth curtain rail',
    new THREE.Vector3(-1.52, 1.40, -3.92), new THREE.Vector3(1.52, 1.40, -3.92), .014, brass, 8));

  /* ---- aft bulkhead: head to starboard, mid-cabin berth to port ---- */
  const aft = new THREE.Group();
  aft.name = 'cabin aft bulkhead';
  group.add(aft);
  aft.add(box('aft bulkhead panel · starboard', [1.36, 1.82, .09], veneer, .98, SOLE + .91, -2.10));
  aft.add(box('closed head door', [.62, 1.56, .05], veneerDark, .86, SOLE + .78, -2.04));
  aft.add(box('head door brass handle', [.10, .05, .06], brass, 1.10, SOLE + .82, -2.00));
  aft.add(box('head door louvre', [.44, .22, .02], veneerDark, .86, SOLE + 1.42, -2.01));
  aft.add(box('aft bulkhead panel · port', [.62, 1.82, .09], veneer, -1.41, SOLE + .91, -2.10));
  // The narrow aft sleeping compartment: a low, dark opening under the bridge
  // deck. Deliberately not enterable; it is depth, not a room.
  aft.add(box('mid-cabin berth opening surround', [.66, .12, .10], veneerDark, -1.38, .58, -2.06));
  aft.add(box('mid-cabin berth darkness', [.60, .62, .06], mat(0x0d1012, 1), -1.38, .24, -2.08));
  aft.add(box('mid-cabin berth mattress edge', [.60, .10, .30], vinyl, -1.38, -.06, -2.22));

  /* ---- the companionway: steps, sill, sliding hatch and doors ---- */
  const companionway = new THREE.Group();
  companionway.name = 'companionway';
  group.add(companionway);
  companionway.add(box('companionway sill', [1.44, .30, .12], veneerDark, -.40, SOLE + .10, -2.06));
  /* Wider than a real one, on purpose: the spec asks for it so the two-person
   * carry animation has somewhere to be. Four treads from the cabin sole to
   * the cockpit sole. */
  for (let i = 0; i < 4; i++) {
    companionway.add(box(`companionway tread ${i + 1}`, [1.20, .07, .30], veneer,
      -.40, SOLE + .34 + i * .30, -1.90 + i * .34));
    companionway.add(box(`companionway riser ${i + 1}`, [1.20, .28, .04], veneerDark,
      -.40, SOLE + .20 + i * .30, -2.04 + i * .34));
  }
  for (const sx of [-1, 1]) {
    companionway.add(box(`companionway side rail ${sx < 0 ? 'port' : 'starboard'}`,
      [.07, 1.36, 1.44], veneer, -.40 + sx * .64, SOLE + .70, -1.60));
  }
  /* The doors Booski closes. Hinged as a pair so `setClosed` swings them shut
   * and the engines all but vanish. */
  const doorPort = box('companionway door · port leaf', [.60, 1.10, .05], veneerDark, .30, .55, 0);
  const doorStarboard = box('companionway door · starboard leaf', [.60, 1.10, .05], veneerDark, -.30, .55, 0);
  const doorHingePort = new THREE.Group();
  doorHingePort.name = 'companionway door hinge · port';
  doorHingePort.position.set(-1.02, SOLE + .10, -2.00);
  doorHingePort.add(doorPort);
  const doorHingeStarboard = new THREE.Group();
  doorHingeStarboard.name = 'companionway door hinge · starboard';
  doorHingeStarboard.position.set(.22, SOLE + .10, -2.00);
  doorHingeStarboard.add(doorStarboard);
  companionway.add(doorHingePort, doorHingeStarboard);

  const companionwayTarget = proxy('companionway interaction · below', [1.50, 1.70, .80], -.40, .70, -2.20);
  group.add(companionwayTarget);

  /* ---- the tarp and the body bag, in the locker under the dinette ---- */
  const tarp = box('folded tarpaulin', [.86, .12, .62], mat(0x2f4048, .95), .30, SOLE + .06, -2.70);
  tarp.visible = false;
  group.add(tarp);

  /* ---- practical light ---- */
  const cabinLight = new THREE.PointLight(0xf6d3a0, 3.4, 6.5, 2);
  cabinLight.name = 'cabin amber overhead light';
  cabinLight.position.set(0, CEILING - .18, -3.30);
  group.add(cabinLight);
  const dome = mesh('cabin overhead light dome',
    new THREE.SphereGeometry(.11, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    mat(0xf0dcb4, .5), 0, CEILING - .08, -3.30);
  dome.material.emissive = new THREE.Color(0xd8a862);
  dome.material.emissiveIntensity = 1.1;
  group.add(dome);
  group.add(mesh('cabin overhead light brass ring',
    new THREE.TorusGeometry(.12, .016, 8, 18), brass, 0, CEILING - .06, -3.30).rotateX(Math.PI / 2));

  let detailMeshes = 0;
  group.traverse((object) => { if (object.isMesh) detailMeshes++; });
  group.userData.detailMeshes = detailMeshes;

  return {
    group,
    targets: { radio: radioTarget, companionway: companionwayTarget },
    props: {
      bottle, glasses, shotGlass, tarp, radio, curtain, cabinLight, dome, barLamp,
      sinkFoot: new THREE.Vector3(-1.20, SOLE + .04, -3.72),
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
