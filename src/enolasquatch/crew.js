/**
 * The crew of the Enola Squatch — four men who are actually there.
 *
 * Until now the mission's four voices were subtitles with nobody attached:
 * `dialogue/script.js` had Captain Sasole starting engines, Irish calling
 * headings, Numbskull under the payload and the Shubenator on the rear gun,
 * and the scene contained none of them. The owner asked for two things this
 * fixes — "we need the actual back gunner" and "I also want all the other
 * characters to actually be sitting in it".
 *
 * So: one `makeFigure` rig each (the same blocky rig Lou, Cecilio and the El
 * Hueso guards use, from `src/beefrun/npc.js` — no new figure system), with
 * the supplied face photographs where they exist. During the walkaround they
 * stand around the parked aeroplane on the apron, at their own stations, and
 * look at Tony when he comes near. When he boards, `takeSeats()` reparents
 * every one of them INTO `aircraft.group` and sits them down, so from that
 * frame on they ride the airframe: the same rotation, the same turbulence,
 * visible out of the corner of the cockpit camera and through the glass from
 * the chase view.
 *
 * Identity rules this file is careful about:
 *
 *  - `captain_lou_sasole` (voice `lou2`) is the PILOT and is NOT Big Uncle Lou
 *    (`lou`/`lou1`). He gets `assets/faces/sasole.png`, the same photograph
 *    `makeLou()` in `src/beefrun/npc.js` gives him at Whispering Pines, and the
 *    same gold subtitle colour. Big Uncle Lou is not on this aeroplane; his
 *    only lines are the telephone call at the front and the arrival at the end.
 *  - Irish and the Shubenator have their own photographs.
 *  - Numbskull has none (`assets/faces/index.json`), so he is procedural, the
 *    way `makeGuard`/`makeAssociate` figures are. Nobody else's photograph is
 *    borrowed for him — that is how a second identity gets minted by accident.
 */
import {
  makeFigure, setPose, nameTag, updateFigure, speak, walkTo,
} from '../beefrun/npc.js';
import { solid, boxGeo, cylGeo, mesh, group } from '../beefrun/util.js';

/* Subtitle colours, kept identical to `dialogue/script.js`'s SPEAKERS so the
 * name over a man's head is the colour his lines come up in. */
const COLOUR = {
  SASOLE: '#e8c86a',
  IRISH: '#8ab4d9',
  NUMBSKULL: '#d9a25a',
  SHUBES: '#b49ad9',
};

/**
 * Where each man is parked, in aeroplane-local metres, once he is aboard.
 *
 * The three cockpit seats come off `aircraft.anchors.seats`, so they cannot
 * drift away from the furniture. The gunner comes off
 * `aircraft.anchors.rearGunSeat`, which `buildRearGun()` puts inside the
 * turret glazing rather than four metres behind the tail where the old
 * placeholder anchor was.
 *
 * `SEAT_DROP` is how far below the seat pan a figure's own origin has to sit:
 * `setPose(f, 'sit')` puts the hips at y 0.52 and the seat pan's top face is
 * 0.07 above the seat group's origin, so 0.52 - 0.07 = 0.45.
 */
const SEAT_DROP = 0.45;
const SEAT_FORWARD = -0.1;

export function createCrew() {
  const sasole = makeFigure({
    name: 'captain_lou_sasole',
    skin: 0xd8b48c,
    shirt: 0xd8d2c0,
    jacket: 0x5a3a22,          // the same old leather flight jacket
    trousers: 0xa89878,
    boots: 0x4a3320,
    hair: 0x4a4038,
    shades: true,
    hat: 'headset',
    build: 0.55,
    face: 'assets/faces/sasole.png',
    faceCrop: [0.08, 0.28, 0.84, 0.63],
  });
  sasole.tag = nameTag('CAPT. LOU SASOLE', COLOUR.SASOLE);
  sasole.group.add(sasole.tag);

  const irish = makeFigure({
    name: 'irish',
    skin: 0xe0b48c,
    shirt: 0x6a8ba8,
    jacket: 0x2f3a4a,
    trousers: 0x33384a,
    boots: 0x2a2620,
    hair: 0x8a4a24,
    build: 0.44,
    face: 'assets/faces/irish.png',
  });
  // The navigator's board goes everywhere with him.
  const board = mesh(boxGeo(0.3, 0.38, 0.03), solid(0xc9b78d, { roughness: 0.9 }), 0, -0.34, 0.08);
  irish.arms[1].elbow.add(board);
  irish.board = board;
  irish.tag = nameTag('IRISH', COLOUR.IRISH);
  irish.group.add(irish.tag);

  /* Numbskull: no photograph exists, so he is built rather than pasted. The
   * loud coveralls and the wrench are the read — he is the man who did the
   * bomb-bay bolts. */
  const numbskull = makeFigure({
    name: 'numbskull',
    skin: 0xb07a4e,
    shirt: 0xb8a04a,
    jacket: 0x5a5a3a,          // grease-shiny coveralls
    trousers: 0x5a5a3a,
    boots: 0x33291f,
    hair: 0x241c14,
    hat: 'cap',
    hatColor: 0x4a2f8f,
    build: 0.62,
  });
  const wrench = mesh(boxGeo(0.05, 0.42, 0.07), solid(0x9aa0a6, { roughness: 0.4, metalness: 0.7 }), 0, -0.36, 0.02);
  numbskull.arms[0].elbow.add(wrench);
  numbskull.wrench = wrench;
  numbskull.tag = nameTag('NUMBSKULL', COLOUR.NUMBSKULL);
  numbskull.group.add(numbskull.tag);

  const shubes = makeFigure({
    name: 'shubes',
    skin: 0xd8b48c,
    shirt: 0x8a7ab8,
    jacket: 0x3a2f5f,
    trousers: 0x2a2a34,
    boots: 0x1f1a16,
    hair: 0x2e2418,
    build: 0.58,
    face: 'assets/faces/shubes.png',
  });
  // Flying helmet, because he was not supposed to be here and found one.
  const helmet = mesh(cylGeo(0.15, 0.16, 0.2, 10), solid(0x4a4238, { roughness: 0.95 }), 0, 0.22, 0);
  shubes.neck.add(helmet);
  for (const sx of [-0.14, 0.14]) {
    shubes.neck.add(mesh(cylGeo(0.07, 0.07, 0.06, 8), solid(0x24262a, { roughness: 0.8 }), sx, 0.13, 0));
  }
  shubes.tag = nameTag('THE SHUBENATOR', COLOUR.SHUBES);
  shubes.group.add(shubes.tag);

  for (const f of [sasole, irish, numbskull, shubes]) setPose(f, 'idle');
  setPose(sasole, 'lean');
  setPose(numbskull, 'inspect');

  const crew = {
    sasole, irish, numbskull, shubes,
    all: [sasole, irish, numbskull, shubes],
    /** Set once `takeSeats()` has run; nothing walks anywhere after that. */
    aboard: false,
    /** Named lookup for the dialogue hook, by `script.js`'s speaker keys. */
    bySpeaker: { SASOLE: sasole, IRISH: irish, NUMBSKULL: numbskull, SHUBES: shubes },
  };

  /**
   * Stand everybody around the parked aeroplane, in world space, at the
   * station each one is talking about during the walkaround:
   *
   *  - Sasole by the nose, leaning on the port gear leg with the clipboard.
   *  - Numbskull under the open bomb bay, which is exactly why Tony's first
   *    line to him is "Should you be standing under that?"
   *  - Irish at the crew door with the flight plan.
   *  - Shubes at the tail, beside the gun he is not supposed to be manning.
   *
   * @param {THREE.Object3D} sceneRoot where the figures live while on foot
   * @param {{x:number,z:number,heading:number,elev:number}} park
   */
  crew.standOnApron = (sceneRoot, park) => {
    const yaw = (park.heading * Math.PI) / 180;
    // Aeroplane-local (x = port/starboard, z = fore/aft) -> world.
    const place = (f, lx, lz, facing) => {
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      const wx = park.x + lx * c + lz * s;
      const wz = park.z - lx * s + lz * c;
      f.group.position.set(wx, park.elev, wz);
      f.group.rotation.y = yaw + facing;
      f.station = { x: wx, z: wz };
      sceneRoot.add(f.group);
    };
    place(sasole, 4.2, 6.0, Math.PI * 0.85);
    place(numbskull, 0.0, 1.2, Math.PI);
    place(irish, -4.4, -3.6, Math.PI * 0.5);
    place(shubes, -2.6, -10.4, Math.PI * 0.25);
    crew.aboard = false;
  };

  /**
   * Get in. Every figure is reparented into `aircraft.group` and sat down, so
   * they ride the airframe from here to the ground at the far end.
   *
   * Reparenting rather than tracking-in-world is deliberate: three.js already
   * composes the aeroplane's transform for its own parts every frame, and a
   * seated man is a part of the aeroplane in exactly the same sense the
   * throttle levers are. Nothing here has to run per frame.
   */
  crew.takeSeats = (aircraft) => {
    if (crew.aboard) return;
    crew.aboard = true;
    const seats = aircraft.anchors.seats || {};
    const sit = (f, parent, x, y, z, facing = 0) => {
      setPose(f, 'sit');
      f.walk = null;
      f.lookAt = null;
      parent.add(f.group);
      f.group.position.set(x, y, z);
      f.group.rotation.set(0, facing, 0);
      // Nobody wants a floating name tag inside the cabin they are sitting in.
      if (f.tag) f.tag.visible = false;
    };
    if (seats.copilot) sit(sasole, seats.copilot, 0, -SEAT_DROP, SEAT_FORWARD);
    if (seats.navigator) sit(irish, seats.navigator, 0, -SEAT_DROP, SEAT_FORWARD);
    /* Numbskull rides the bombardier's station in the nose glazing: prone
     * behind the sight rather than in a seat, which is why he is placed off
     * the anchor directly instead of off a seat group. */
    const bomb = aircraft.anchors.bombardierStation;
    sit(numbskull, aircraft.group, bomb.x, bomb.y - 0.34, bomb.z - 0.5, 0);
    // The Shubenator, in the tail turret, facing aft.
    const gun = aircraft.anchors.rearGunSeat;
    sit(shubes, aircraft.group, gun.x, gun.y - 0.42, gun.z - 0.1, Math.PI);
  };

  /**
   * One frame of idle life for everybody. `camPos` drives the name-tag fade
   * and, on the apron, who they are looking at.
   */
  crew.update = (dt, camPos = null) => {
    for (const f of crew.all) updateFigure(f, dt, crew.aboard ? null : camPos);
  };

  /** Make the right man's head bob when a line of his plays. */
  crew.speak = (who, seconds) => {
    const f = crew.bySpeaker[who];
    if (f) speak(f, seconds);
  };

  /** Everybody looks at Tony while he is doing the walkaround. */
  crew.lookAt = (point) => {
    if (crew.aboard) return;
    for (const f of crew.all) f.lookAt = point;
  };

  /** Send a man to a spot on the apron — used when Shubes is caught. */
  crew.walk = (f, x, z, opts) => walkTo(f, x, z, opts);

  crew.dispose = (sceneRoot) => {
    for (const f of crew.all) f.group.parent?.remove(f.group);
    void sceneRoot;
  };

  return crew;
}

/** A crate of tools Numbskull leaves under the bomb bay. Pure scenery. */
export function makeToolCart() {
  const g = group('tool-cart');
  g.add(mesh(boxGeo(1.5, 0.1, 0.8), solid(0x5a5248, { roughness: 0.95 }), 0, 0.75, 0));
  for (const sx of [-0.6, 0.6]) {
    for (const sz of [-0.3, 0.3]) {
      g.add(mesh(cylGeo(0.04, 0.04, 0.72, 6), solid(0x8a8f96, { roughness: 0.5, metalness: 0.6 }), sx, 0.38, sz));
      const wheel = mesh(cylGeo(0.09, 0.09, 0.05, 10), solid(0x1e2024, { roughness: 0.95 }), sx, 0.09, sz);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
  }
  // Things on it, in the project's usual register.
  g.add(mesh(boxGeo(0.34, 0.16, 0.24), solid(0xb8402a, { roughness: 0.8 }), -0.4, 0.88, 0));
  g.add(mesh(cylGeo(0.06, 0.06, 0.34, 8), solid(0x9aa0a6, { roughness: 0.35, metalness: 0.7 }), 0.2, 0.82, 0.1));
  const bolts = mesh(boxGeo(0.24, 0.1, 0.2), solid(0x6b5a3a, { roughness: 0.95 }), 0.55, 0.85, -0.1);
  g.add(bolts);
  return g;
}
