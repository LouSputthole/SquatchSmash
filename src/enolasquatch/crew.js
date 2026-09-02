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
 *  - Numbskull had none until 2026-09-01 and was procedural, the way
 *    `makeGuard`/`makeAssociate` figures are; his own photograph is on the
 *    index now and he wears it. Nobody else's photograph was ever borrowed
 *    for him — that is how a second identity gets minted by accident.
 */
import * as THREE from 'three';
import {
  fromWardrobe, makeFigure, setPose, nameTag, updateFigure, speak, walkTo,
  NECK_PITCH_MAX_DOWN, NECK_PITCH_MAX_UP,
} from '../beefrun/npc.js';
import { solid, boxGeo, cylGeo, mesh, group, clamp } from '../beefrun/util.js';
import { CAPTAIN_LOU_SASOLE } from '../core/wardrobe.js';

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

/* Scratch for the gaze frame conversion in `aimGaze()`. Module-scope and
 * reused, because this runs four times a frame for the whole flight and a
 * per-frame Vector3/Matrix4 pair is exactly the allocation that shows up as a
 * sawtooth in the heap trace of a scene that is otherwise steady. */
const _gazeInverse = new THREE.Matrix4();
const _gazeTarget = new THREE.Vector3();

/**
 * WHERE A SEATED MAN IS LOOKING.
 *
 * Owner playtest, 2026-08-19: *"Head/eye tracking is broken: he stares hard to
 * the right instead of engaging the player."*
 *
 * He did, and it was one line. `takeSeats()` used to write ONE fixed neck yaw
 * (`HEAD_TURN_INBOARD`, 0.92 rad) into Captain Sasole's neck and never touch it
 * again, on the reasoning that `updateFigure` skipped seated figures' look-at
 * so a static value would hold for the whole flight. `updateFigure` no longer
 * skips them — a seated man turns his neck and spills the rest into his torso
 * (see its `lookAt` block) — but the static write was still there, and
 * `crew.update()` passed `null` for the camera position once the crew were
 * aboard, so the one figure the player spends the whole mission sitting beside
 * was frozen at a bearing that was measurably wrong: the player's eye is 1.06 m
 * to Sasole's +X and 0.10 m forward of him, which is 1.32 rad off his seat's
 * own facing, and he was pinned at 0.92. Twenty-three degrees short, with no
 * vertical component at all against an eye half a metre above his own — which
 * from the left seat reads exactly as "staring hard past your shoulder".
 *
 * This replaces the frozen number with a gaze that is worth having: he looks at
 * whoever he is talking to WHILE he is talking, holds it a beat afterwards the
 * way people do, then breaks off to his own station — the panel, the glass, the
 * chart — and glances back every few seconds. Nothing about that is expensive:
 * it is one target vector a frame per man, handed to the look-at that already
 * exists, plus the vertical the shared rig does not carry.
 *
 * This also subsumes the 2026-08-04 note it replaces ("his face is also
 * missing"): that was the same defect one step earlier — a man with a
 * photograph for a face pointed at the windshield shows the player the plain
 * hair-coloured side of his skull. The frozen inboard yaw was the fix for it,
 * and a live gaze is the same fix without the freeze.
 *
 * The numbers are the human ones. A held gaze past about six seconds is a
 * stare; a break shorter than about two seconds is a twitch.
 */
const GAZE = Object.freeze({
  /** Held on the player after his own line finishes. */
  afterTalk: 1.4,
  /** How long a natural break in eye contact lasts. */
  breakMin: 2.6,
  breakMax: 5.2,
  /** How long an unprompted glance back at the player lasts. */
  glanceMin: 1.3,
  glanceMax: 2.6,
  /** Neck pitch limits — a man in a seat does not crane. */
  pitchDown: -0.34,
  /* THIS NUMBER IS MEASURED OFF THE AEROPLANE, not chosen for feel.
   *
   * It was 0.42 rad (24.1 deg) and it was clipping the one look this whole
   * system exists to get right. Captain Sasole's neck joint sits at aeroplane
   * y 0.78: his seat group is at y 0.05 (`buildSeat` in scenes/EnolaSquatch.js),
   * the figure hangs `SEAT_DROP` 0.45 below it, `setPose(f,'sit')` puts the
   * hips at +0.52 and `makeFigure` hangs the neck +0.66 above those —
   * 0.05 - 0.45 + 0.52 + 0.66 = 0.78. The player's eye is the aeroplane's own
   * `pilotEye` at (0.55, 1.42, FUSE_LEN/2 - 0.15) and Sasole's neck is at
   * (-0.51, 0.78, FUSE_LEN/2 - 0.45), so the rise is 0.64 m over a horizontal
   * separation of 1.10 m: atan2(0.64, 1.10) = 0.526 rad, or 30.1 degrees.
   *
   * The old ceiling was six degrees under that, which is why he still read as
   * looking at the player's collar from the seat beside him. 0.55 clears the
   * measured requirement with a little margin for the seat-height and eye-height
   * tuning that has already moved twice, and is still well inside the shared
   * rig's `NECK_PITCH_MAX_UP` (60 deg) — this is a seated glance, not a craning
   * one. Irish, further aft at 2.75 m, only ever needs 0.227 rad and is
   * untouched by the change. */
  pitchUp: 0.55,
});

/**
 * Where each seated man's eyes go when they are NOT on the player, in
 * aeroplane-local metres. These are real places on this aeroplane: the
 * windshield ahead of the flight deck, Irish's own chart, the bombsight in the
 * nose, the empty sky behind the tail.
 */
const GAZE_STATION = Object.freeze({
  sasole: new THREE.Vector3(-0.2, 1.5, 14.0),
  irish: new THREE.Vector3(0.1, 0.45, 4.85),
  numbskull: new THREE.Vector3(0, -1.4, 14.0),
  shubes: new THREE.Vector3(0, 0.2, -34.0),
});

/**
 * One frame of one seated man's gaze.
 *
 * Writes `f.lookAt` (a world point `updateFigure`'s own look-at block converts
 * into the aeroplane's frame and damps the neck toward) and `f.gaze.pitch` (the
 * vertical `updateFigure` has no concept of). Everything else — the damping,
 * the seated torso spill, the sweep clamp — is the shared rig's, unchanged.
 *
 * @param {object} f      a seated crew figure carrying `f.gaze`
 * @param {number} dt
 * @param {THREE.Vector3} playerEye the player's camera position, in world space
 * @param {?THREE.Object3D} airframe the aeroplane, so an away-station authored
 *   in aeroplane-local metres lands where it was authored while it moves
 */
function aimGaze(f, dt, playerEye, airframe) {
  const g = f.gaze;
  g.hold -= dt;
  /* A man looks at whoever he is talking to. `f.talk` is the shared rig's own
   * countdown, set by `speak()` off the real recording, so this is the take
   * driving the eyes rather than a clock guessing at them. */
  if (f.talk > 0) {
    g.onPlayer = true;
    g.hold = Math.max(g.hold, GAZE.afterTalk);
  } else if (g.hold <= 0) {
    g.onPlayer = !g.onPlayer;
    g.hold = g.onPlayer
      ? GAZE.glanceMin + Math.random() * (GAZE.glanceMax - GAZE.glanceMin)
      : GAZE.breakMin + Math.random() * (GAZE.breakMax - GAZE.breakMin);
  }

  if (!g.world) g.world = new THREE.Vector3();
  if (g.onPlayer) {
    g.world.copy(playerEye);
  } else if (airframe) {
    // The station is authored in aeroplane-local metres; the aeroplane moves.
    airframe.updateWorldMatrix(true, false);
    g.world.copy(g.station).applyMatrix4(airframe.matrixWorld);
  } else {
    g.world.copy(g.station);
  }
  f.lookAt = g.world;

  /* Vertical. Measured from the neck joint the rotation actually happens at,
   * not from the hips: the player's eye sits about half a metre above a seated
   * man's, and a look-at with no pitch in it is the other half of "staring
   * past your shoulder".
   *
   * MEASURED IN THE PARENT'S FRAME, NOT THE WORLD'S. Owner playtest,
   * 2026-08-24: the heads nod hard through every turn. This used to take the
   * neck's WORLD position and the target's WORLD y and subtract them, then
   * hand the difference to `neck.rotation.x`, which is a LOCAL rotation inside
   * an aeroplane that banks to 60 degrees and pitches through 30.
   *
   * Those are not the same quantity. The player's eye and the crewman's neck
   * are both bolted to the airframe: in AEROPLANE space their separation is a
   * fixed 0.64 m of rise over 1.10 m of reach and never changes for the whole
   * flight. Only the projection onto world Y changes — and at 90 degrees of
   * bank it is zero, and past that it INVERTS, so the same unmoved head is
   * asked for a full up-look, then nothing, then a full down-look, purely as a
   * function of how hard the aeroplane is turning.
   *
   * `updateFigure`'s yaw block already solved exactly this for the horizontal
   * half of the same look (src/beefrun/npc.js: it inverse-transforms the target
   * by `parent.matrixWorld` before taking a bearing). Both halves of one look
   * have to live in one frame or the head is aimed at two different places, so
   * this does the same conversion, off the same `f.group.parent` the yaw block
   * uses — the seat group, which is rigid in the airframe.
   *
   * The neck's own position comes back through the same inverse rather than
   * being recomputed from the pose, because `hips.rotation` carries the seated
   * torso spill and the sick lean and would have to be replayed by hand
   * otherwise. `getWorldPosition` refreshes the ancestor matrices itself. */
  if (!g.eye) g.eye = new THREE.Vector3();
  f.neck.getWorldPosition(g.eye);
  const frame = f.group.parent;
  if (frame && frame.matrixWorld) {
    frame.updateWorldMatrix(true, false);
    _gazeInverse.copy(frame.matrixWorld).invert();
    g.eye.applyMatrix4(_gazeInverse);
    _gazeTarget.copy(g.world).applyMatrix4(_gazeInverse);
  } else {
    _gazeTarget.copy(g.world);
  }
  const dy = _gazeTarget.y - g.eye.y;
  const flat = Math.hypot(_gazeTarget.x - g.eye.x, _gazeTarget.z - g.eye.z);
  const want = Math.max(GAZE.pitchDown, Math.min(GAZE.pitchUp, Math.atan2(dy, Math.max(flat, 0.2))));
  g.pitch += (want - g.pitch) * Math.min(1, dt * 4);
}

export function createCrew() {
  const sasole = makeFigure({
    name: 'captain_lou_sasole',
    actorRole: 'crew',
    /* His clothes and body palette are the same canonical contract Beef Run
     * already adapts onto this private block rig. The aeroplane owns only the
     * headset, face crop, pose and station below. */
    ...fromWardrobe(CAPTAIN_LOU_SASOLE),
    shades: true,
    hat: 'headset',
    face: 'assets/faces/sasole.png',
    /* THE NOSE. Owner playtest, 2026-08-19: *"His nose reads as a giant sphere
     * stuck on his face."*
     *
     * It is not geometry. Nothing in this mission, in `makeFigure()`, or in the
     * shared wardrobe ever builds a nose for this man: with `face:` set,
     * `makeFigure()` puts ONE photograph on material index 4 of a 0.24 x 0.28
     * head box and skips the procedural hair box and shades bar entirely. So
     * the owner's own instinct in the note — "check this is not a bad morph or
     * scale value rather than the geometry itself" — was right, and the bad
     * scale value is this crop.
     *
     * `assets/faces/sasole.png` is 256 x 256. `faceTexture()` writes the crop
     * straight into `offset`/`repeat`, and the old numbers asked for a 0.76 x
     * 0.35 region — 195 x 90 pixels, a wide letterbox strip — stretched onto a
     * nearly square face plate. That is a 2.5x VERTICAL stretch applied to the
     * band of the photograph that happens to contain his sunglasses, nose and
     * moustache, so the nose became a tall pale lobe filling the middle of his
     * head: a sphere stuck on his face, exactly as reported. (The comments in
     * this file and in `makeLou()` still described a 715 x 1462 portrait; the
     * asset has been square for some time and the crop never followed it.)
     *
     * The new crop is square-ish — 0.76 x 0.76, 195 x 195 px onto a 0.24 x 0.28
     * plate — and framed on the whole head: the backwards cap at the top, the
     * chin at the bottom, both ears inside the width. The nose is then simply
     * the size a nose is, because nothing is stretching it any more. */
    faceCrop: [0.10, 0.16, 0.76, 0.76],
  });
  sasole.tag = nameTag('CAPT. LOU SASOLE', COLOUR.SASOLE);
  sasole.group.add(sasole.tag);

  const irish = makeFigure({
    name: 'irish',
    actorRole: 'crew',
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
  board.name = 'irish-chart';
  irish.arms[1].elbow.add(board);
  irish.board = board;
  irish.tag = nameTag('IRISH', COLOUR.IRISH);
  irish.group.add(irish.tag);

  /* Numbskull: the loud coveralls and the wrench are the read — he is the
   * man who did the bomb-bay bolts — and since 2026-09-02 the face is his
   * own photograph rather than the built head he wore while none existed. */
  const numbskull = makeFigure({
    name: 'numbskull',
    actorRole: 'crew',
    face: 'assets/faces/numbskull.png',
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
  wrench.name = 'numbskull-wrench';
  numbskull.arms[0].elbow.add(wrench);
  numbskull.wrench = wrench;
  numbskull.tag = nameTag('NUMBSKULL', COLOUR.NUMBSKULL);
  numbskull.group.add(numbskull.tag);

  const shubes = makeFigure({
    name: 'shubes',
    actorRole: 'crew',
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
  helmet.name = 'shubes-flight-helmet';
  shubes.neck.add(helmet);
  for (const sx of [-0.14, 0.14]) {
    const cup = mesh(cylGeo(0.07, 0.07, 0.06, 8), solid(0x24262a, { roughness: 0.8 }), sx, 0.13, 0);
    cup.name = `shubes-headset-cup-${sx < 0 ? 'right' : 'left'}`;
    shubes.neck.add(cup);
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

  const sit = (f, parent, x, y, z, facing = 0) => {
    setPose(f, 'sit');
    /* YAW FIRST, THEN PITCH — the third thing that stopped these heads aiming.
     *
     * A neck here is two Euler angles: `rotation.y` from the shared rig's
     * look-at and `rotation.x` from the seated gaze below. three.js composes
     * the default 'XYZ' order as Rx·Ry·Rz — the head turns FIRST, and the
     * already-turned head is then tipped about the TORSO's fixed side-to-side
     * axis. For a head turned ninety degrees that axis runs straight out
     * through the nose, so the "pitch" is a head TILT and lifts the eyeline not
     * at all. In general the forward vector's height comes out as
     * -sin(pitch)·cos(yaw): at Sasole's 1.135 rad of yaw the cos factor throws
     * away 58 per cent of every degree of pitch he has. With the pitch itself
     * measured correctly at 0.526 rad he was still 18.1 degrees under the
     * player's eye, and no value of pitch — not even a physically impossible
     * one — could have closed it.
     *
     * 'YXZ' composes as Ry·Rx·Rz, so the nod happens about the head's own
     * side-to-side axis and the turn is then taken about the TORSO's vertical.
     * That is a neck: the joint under the skull nods, the joint below it
     * rotates about the spine. The forward height becomes -sin(pitch) flat,
     * independent of how far he has turned, and the aim lands on the eye.
     *
     * Set here rather than in `makeFigure()` on purpose. Every other scene's
     * figures are yawed within about a radian of their target and the
     * difference is a degree or two, but their geometry gates measure rendered
     * bounding boxes and would all have to be re-baselined for a change that
     * only this cockpit — where the player sits inside arm's reach of a man
     * turned two-thirds of a right angle toward him — can actually see. */
    f.neck.rotation.order = 'YXZ';
    f.walk = null;
    f.lookAt = null;
    parent.add(f.group);
    f.group.position.set(x, y, z);
    f.group.rotation.set(0, facing, 0);
    /* The name tag comes OFF, not merely `visible = false`: the gaze below
     * hands `updateFigure` a real camera position every frame from here on,
     * and its tag block would switch a hidden tag back on the moment the
     * player's head came within its fade radius — which, in a cockpit, is
     * always. Nobody wants a floating caption inside the cabin they are
     * sitting in. */
    if (f.tag) {
      f.tag.parent?.remove(f.tag);
      f.tag.material?.map?.dispose?.();
      f.tag.material?.dispose?.();
      f.tag = null;
    }
    /* Gaze bookkeeping. `station` is where his eyes rest when they are not
     * on anybody; `hold` counts the current state down. Everyone starts
     * looking at the man who has just climbed in, which is what four men in
     * an aeroplane do when a fifth arrives. */
    f.gaze = {
      station: GAZE_STATION[f.name === 'captain_lou_sasole' ? 'sasole' : f.name]
        ?? GAZE_STATION.sasole,
      onPlayer: true,
      hold: GAZE.glanceMax,
      pitch: 0,
      /* The shared rig's OWN `neck.rotation.x` from the previous frame, kept
       * apart from the gaze pitch layered on top of it in `crew.update`. Two
       * writers sharing one field with no separation between them is the whole
       * of the 2026-08-24 rolling-heads defect; this is the separation. */
      rigPitch: 0,
    };
  };

  /**
   * Put the Shubenator in the tail turret, wherever he walked in from.
   *
   * Factored out of `takeSeats()` because he can now arrive by two routes and
   * both must produce the same man in the same seat: the walk in
   * `sendShubesAboard()`, and the everybody-in reparent when the player boards.
   */
  const seatRearGunner = () => {
    const aircraft = crew.aircraft;
    const mount = aircraft?.parts?.rearGunSeatMount;
    if (!mount) return false;
    /* The Shubenator, in the tail turret, facing aft. Use the same measured
     * pan contact as every other seated crewman; the former extra 0.2 m drop
     * drove his torso 120 mm through the cushion. His legs fold tighter below
     * so the complete seated rig stays inside the turret glazing. */
    sit(shubes, mount, 0, -SEAT_DROP, -0.25, Math.PI);
    for (const leg of shubes.legs) {
      leg.hip.rotation.x = -1.8;
      leg.knee.rotation.x = 1.2;
    }
    return true;
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
    crew.aircraft = aircraft;
    const seats = aircraft.anchors.seats || {};
    /* Sasole, in the right-hand seat, turned toward the man flying — which is
     * the whole fix for "his face is missing". Keep the shared `SEAT_DROP`
     * contact datum: raising his whole rig to change apparent height left the
     * visible torso floating 120 mm above the pan. */
    if (seats.copilot) sit(sasole, seats.copilot, 0.04, -SEAT_DROP, SEAT_FORWARD, 0.16);
    /* Irish faces his chart table, which the seat itself is already turned
     * toward — so his head only needs a nudge back up the cabin toward the
     * flight deck he is calling headings to. */
    if (seats.navigator) {
      sit(irish, seats.navigator, 0, -SEAT_DROP, SEAT_FORWARD, 0);
      /* The stock sit pose hangs both hands below desk height. At this rotated
       * station that drove all four forearm/hand meshes through the table's
       * raised edge. Bring his elbows forward and up so he works over the
       * chart instead of through the furniture. */
      for (const arm of irish.arms) {
        arm.shoulder.rotation.x = -1.15;
        arm.elbow.rotation.x = -0.5;
      }
    }
    /* The generic sit pose was authored for chairs above open ground. On the
     * Enola's raised flight-deck finish it left every front boot 346.9 mm
     * through the floor. Fold the knees for this cramped bomber cabin; the
     * boot soles then meet the actual deck without moving either torso off its
     * pan. */
    for (const member of [sasole, irish]) {
      for (const leg of member.legs) {
        leg.hip.rotation.x = -2.325;
        leg.knee.rotation.x = 2.4;
      }
    }
    /* Numbskull rides the bombardier's station crouched inside the nose
     * glazing rather than on one of the flight-deck seats, which is why he is
     * placed off the anchor directly instead of off a seat group.
     *
     * Owner: "a lot of clipping and intersecting." He was one of them — sat
     * upright inside a nose cone that had tapered to about a metre across by
     * then, so his shoulders and the crown of his head stood out through the
     * skin. The cone now stops at the collar and the glasshouse in front of it
     * is a real, hollow, 1.25 m bubble (see `EnolaSquatch.build()`), so he
     * occupies its measured centre: the former 1.12 m drop put his right boot
     * 113.7 mm through the sphere. A 0.60 m drop balances crown and boots with
     * at least 0.36 m of radial clearance for the complete visible rig. */
    const bomb = aircraft.anchors.bombardierStation;
    sit(numbskull, aircraft.group, bomb.x, bomb.y - 0.60, bomb.z - 0.1, 0);
    /* The Shubenator, in the tail turret, facing aft. Use the same measured
     * pan contact as every other seated crewman; the former extra 0.2 m drop
     * drove his torso 120 mm through the cushion. His legs fold tighter below
     * so the complete seated rig stays inside the turret glazing. */
    /* He may already be in it: if he walked aboard during the walkaround
     * (`sendShubesAboard()`) this is a no-op that puts him in exactly the same
     * place, because both routes go through the one seating call. */
    shubes.boarding = null;
    seatRearGunner();
  };

  /**
   * THE SHUBENATOR BOARDS THE AEROPLANE.
   *
   * Owner playtest, 2026-08-19: *"He must not just appear near the aircraft. He
   * walks toward the plane, boards through the correct entrance, moves to his
   * assigned seat, and stays visibly aboard."*
   *
   * He used to do exactly the thing that note forbids: he stood at the tail
   * through the whole walkaround and then TELEPORTED into the turret inside
   * `takeSeats()` at the instant the player climbed the ladder — which is the
   * one man on this crew whose entire joke is that nobody saw him get on.
   *
   * The joke only works if you DO see him get on. So he walks it, and he walks
   * it in three legs because an aeroplane is in the way of a straight line:
   * out from under the tail to the port side, forward along the flank to the
   * crew door, then through the door. That last leg is the one that ends: the
   * moment he reaches the sill he is reparented into the airframe and put in
   * the tail turret, which is the seat he was always going to be in and is now
   * somewhere he demonstrably walked to rather than materialised in.
   *
   * Deliberately NOT a scripted cutscene, a camera move, or anything that can
   * take the player's controls away: it is three `walkTo()` calls on the shared
   * rig's own carrier, ticked by the same `crew.update()` that was already
   * running, and if the player boards first `takeSeats()` simply seats him
   * where he has got to. Nothing in here can stall the walkaround.
   *
   * @param {object} aircraft the EnolaSquatch
   * @param {?function} onAboard called once, when he is actually inside
   * @returns {boolean} false if he is already aboard or already walking
   */
  crew.sendShubesAboard = (aircraft, onAboard = null) => {
    if (crew.aboard || shubes.boarding) return false;
    const door = aircraft.anchors.crewDoor;
    if (!door) return false;
    crew.aircraft = aircraft;
    aircraft.group.updateWorldMatrix(true, false);
    /* The door in world space, and the two waypoints that keep him off the
     * tailplane and the port mainwheel on the way to it. Both are struck in
     * the aeroplane's own frame and then transformed, so a differently parked
     * aeroplane moves the route with it. */
    const at = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(aircraft.group.matrixWorld);
    const sill = at(door.x - 1.1, 0, door.z);
    const clearOfTail = at(door.x - 2.6, 0, door.z - 6.4);
    shubes.boarding = {
      legs: [clearOfTail, sill],
      leg: 0,
      onAboard,
    };
    walkTo(shubes, clearOfTail.x, clearOfTail.z, { speed: 1.35 });
    return true;
  };

  /** One frame of the Shubenator's own walk to the door. */
  const updateBoardingWalk = () => {
    const b = shubes.boarding;
    if (!b || crew.aboard) return;
    if (shubes.walk) return;                       // still on this leg
    b.leg += 1;
    if (b.leg < b.legs.length) {
      const next = b.legs[b.leg];
      walkTo(shubes, next.x, next.z, { speed: 1.35 });
      return;
    }
    // Through the door. From here he is part of the aeroplane.
    shubes.boarding = null;
    shubes.aboardEarly = true;
    seatRearGunner();
    b.onAboard?.();
  };

  /**
   * One frame of idle life for everybody. `camPos` drives the name-tag fade
   * and, on the apron, who they are looking at.
   */
  crew.update = (dt, camPos = null) => {
    if (shubes.boarding) updateBoardingWalk();
    for (const f of crew.all) {
      /* `f.gaze` is set by `sit()` and by nothing else, so it is the honest
       * "this man is aboard and strapped in" test — truer than `crew.aboard`
       * now that the Shubenator can walk aboard on his own several minutes
       * before anybody else does. */
      const riding = !!f.gaze;
      if (riding && camPos) aimGaze(f, dt, camPos, crew.aircraft?.group ?? null);
      /* Hand the shared rig back the value IT last wrote, before the seated
       * gaze below layered a pitch on top of it. See the long note at that
       * write: `updateFigure` damps `neck.rotation.x` RELATIVE to whatever it
       * finds there, so leaving last frame's composed angle in place is what
       * fed the gaze pitch back into itself and rolled the heads. */
      if (riding) f.neck.rotation.x = f.gaze.rigPitch;
      updateFigure(f, dt, riding ? null : camPos);
      /* Breathing belongs above the waist in a strapped-in aeroplane. The
       * shared block rig lifts the hips ±12 mm, which makes every boot and pan
       * alternately penetrate and hover. Hold the seated root at its authored
       * 0.52 m datum; neck/talk/face life continues independently. */
      if (riding && f.pose === 'sit') f.hips.position.y = 0.52;
      /* The vertical half of the look, which the shared rig does not carry:
       * `updateFigure` only ever writes `neck.rotation.y` from a look-at, and
       * writes `neck.rotation.x` itself. Applied AFTER it, so the talk bob
       * still reads on top of a head that is aimed at the right height — the
       * player's eye sits half a metre above Sasole's.
       *
       * MINUS, not plus. `rotation.x` is a right-handed rotation about +X, so a
       * POSITIVE angle carries the figure's own +Z face toward -Y — i.e. a
       * positive `rotation.x` looks DOWN. `gaze.pitch` is measured the human
       * way (positive means the target is above the eye), so it is subtracted.
       * Getting this backwards is worth 48 degrees on a man sitting next to a
       * player whose eye is half a metre above his own, which is most of the
       * "staring past your shoulder" read all by itself.
       *
       * THIS IS AN ASSIGNMENT AND NOT A `-=`, AND THAT IS THE BUG FIX.
       *
       * Owner playtest, 2026-08-24: *"Capt Sasole and Irish heads are rolling
       * around in circles when I look at them."* The line here used to read
       * `f.neck.rotation.x -= f.gaze.pitch`, on the assumption stated in the
       * comment above it — that `updateFigure` writes `neck.rotation.x`
       * absolutely, so each frame started from a clean base. It only does that
       * on the TALKING branch, where the angle is a sine bob written outright.
       * On the SILENT branch, which is nearly always, it damps toward zero
       * RELATIVE to whatever it finds: `damp(x, 0, 6, dt)` is
       * `lerp(x, 0, 1 - e^(-6dt))`, so it removes a FRACTION of the value and
       * leaves the rest.
       *
       * Subtracting a fresh `gaze.pitch` on top of that residue every frame is
       * a geometric series. It converges on a gain of 1/(1 - e^(-6dt)) — about
       * 5.5x at 30 fps, 10.5x at 60, 20.5x at 144 — so with a held pitch of
       * 0.55 rad the neck settles at 5.8 rad at 60 fps and past a full
       * revolution at 144. That the magnitude depends on frame rate is the
       * reason it read as continuous rolling rather than as a fixed bad pose,
       * and it is why the fix has to be an absolute write: composed once from
       * the rig's own base (restored above `updateFigure`) plus this frame's
       * pitch, assigned, so no residue of a previous frame can survive into the
       * next one.
       *
       * The clamp is the second half of the same lesson. Nothing bounded this
       * angle, which is how one sign error was able to produce a 250-degree
       * neck instead of a stiff one. `NECK_PITCH_MAX_UP`/`MAX_DOWN` are the
       * shared rig's own anatomy (see src/beefrun/npc.js) — clinical cervical
       * range of motion, 60 degrees of extension and 50 of flexion — so a
       * future arithmetic mistake in here shows up as a man with a crick in his
       * neck rather than as a man whose head is spinning. */
      if (riding) {
        f.gaze.rigPitch = f.neck.rotation.x;
        f.neck.rotation.x = clamp(
          f.gaze.rigPitch - f.gaze.pitch, NECK_PITCH_MAX_UP, NECK_PITCH_MAX_DOWN,
        );
      }
    }
    if (shubes.gaze && crew.aircraft?.parts?.rearGunYoke) {
      /* Shubes keeps hold of the reachable spade arc. These three measured
       * poses are continuous linear functions of the gun's real elevation;
       * interpolating through neutral gives the shoulder/elbow follow a human
       * gunner actually makes without adding a second skeleton system. */
      const pitch = crew.aircraft.parts.rearGunYoke.rotation.x;
      const down = Math.max(0, Math.min(1, -pitch / 0.38));
      const up = Math.max(0, Math.min(1, pitch / 0.58));
      const shoulderX = -0.83 + down * (-1.45 + 0.83) + up * (-0.595 + 0.83);
      const elbowX = -1.51 + down * (-0.95 + 1.51) + up * (-0.92 + 1.51);
      for (const arm of shubes.arms) {
        arm.shoulder.rotation.x = shoulderX;
        arm.elbow.rotation.x = elbowX;
      }
    }
  };

  /**
   * First-person ownership of the tail gun puts the camera at Shubes' eyes.
   * Keep his seated torso/arms visible through the glass, but hide the neck
   * subtree (head, helmet and headset) for that view and restore it verbatim
   * when the player hands the station back.
   */
  crew.setRearGunnerManned = (manned) => {
    shubes.neck.visible = !manned;
    return !!manned;
  };

  /**
   * Make the right man's head bob when a line of his plays -- and his mouth
   * move with it, on the take rather than on a clock (src/core/mouth.js).
   *
   * Most of this crew wear their real photographs on the front of the skull,
   * and a photograph cannot open its mouth; for them the head is the whole
   * read, exactly as before. Anyone with an authored face gets the mouth too.
   */
  crew.speak = (who, seconds, take = null) => {
    const f = crew.bySpeaker[who];
    if (f) speak(f, seconds, take);
  };

  /** Everybody looks at Tony while he is doing the walkaround. */
  crew.lookAt = (point) => {
    if (crew.aboard) return;
    // Anyone already aboard has his own gaze and must not be overwritten.
    for (const f of crew.all) if (!f.gaze) f.lookAt = point;
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
