import * as THREE from 'three';
import {
  box, cylinder, group, plane, sphere, mat,
} from '../../world/build.js';
import { buildSilverCaseApe } from '../cast/ape.js';

/**
 * The car ride over — a cutscene rig, not a drivable vehicle. Tony (the
 * player, "Prospect" in the dialogue) never gets the wheel because he was
 * never driving; Ape talks the whole way while the city slides past outside
 * a windshield that never needs to be more than a dark, lit-up smear.
 *
 * Kept small and centred near local origin — roughly x:[-1.2,1.2],
 * z:[-1.5,1.5] — so it never overlaps ApartmentScene.js's own coordinates
 * (hallway/apartment run x:[0,12]). main.js is expected to toggle
 * `root.visible` and teleport the player between the two rather than moving
 * either set of geometry.
 *
 * **This rig owns its own light.** It used to own none, and main.js made up
 * the difference with one 1.1-candela point light shared with the apartment —
 * which, under three.js's physical light units, is roughly a birthday candle
 * two metres away. The beat rendered as a black screen with a strip of
 * streetlights on it and no Ape in it at all: the first thing the player saw
 * of the mission was nothing. A car interior at night is a specific, cheap
 * look — a dim dome light, instruments glowing up onto the driver's face,
 * headlight spill coming back off the road, and streetlights sweeping through
 * — so all four are built here, parented to `root`, and go away with it.
 */

// ---- Anchors main.js feeds straight into the Player controller and Ape's
// seat. Player.js's yaw is a *camera* yaw, where forward = (-sin(yaw), 0,
// -cos(yaw)); yaw 0 already looks down -z (three.js's default camera
// forward), which is "straight out the windshield" here.
export const CAR_ANCHORS = Object.freeze({
  playerSeat: Object.freeze({ x: 0.62, y: 1.18, z: 0.46 }),
  playerYaw: 0,
  // Wide enough to turn and actually LOOK at the man talking to you. At the
  // old 1.15 the most you could get was his shoulder.
  yawRange: 1.5,
  pitchMin: -0.5,
  pitchMax: 0.42,
  // Driver's seat, to Tony's left. Facing forward at yaw 0, "left" is -x
  // (right = forward × up = +x, so left is the opposite). A full bench-width
  // apart: any closer and turning your head fills the frame with his elbow.
  // Four centimetres inboard keeps Ape's shoulder out of the driver-side
  // door card while leaving his forearm resting naturally on the armrest.
  driverSeat: Object.freeze({ x: -0.74, y: 0, z: 0.46 }),
  // The figure rig's own facing convention is different from the camera's:
  // heading 0 faces +z and heading PI faces -z — the same "out the
  // windshield" direction.
  driverYaw: Math.PI,
});

/** A cheap 128x32 canvas of blurred streetlights, tiled and scrolled. */
function windshieldTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#050608';
  g.fillRect(0, 0, 128, 32);
  const lights = [[6, '#ffcf8a'], [34, '#ffd9a8'], [58, '#ffb877'], [90, '#fff0c6'], [112, '#ffcf8a']];
  for (const [x, colour] of lights) {
    const grad = g.createRadialGradient(x, 14, 0, x, 14, 10);
    grad.addColorStop(0, colour);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - 12, 2, 24, 24);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(2.4, 1);
  return tex;
}

/** Lit windows in the blocks going past the side glass. */
function sideWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#04050a';
  g.fillRect(0, 0, 128, 64);
  let x = 0;
  while (x < 128) {
    const w = 14 + Math.floor(Math.random() * 16);
    const top = 6 + Math.floor(Math.random() * 22);
    g.fillStyle = '#0a0c14';
    g.fillRect(x, top, w - 2, 64 - top);
    for (let wy = top + 4; wy < 58; wy += 8) {
      for (let wx = x + 3; wx < x + w - 5; wx += 6) {
        if (Math.random() < 0.42) {
          g.fillStyle = Math.random() < 0.25 ? '#ffe0a0' : '#c9d6ff';
          g.fillRect(wx, wy, 3, 4);
        }
      }
    }
    x += w;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Both hands on the wheel, re-applied every frame after the figure's own
 * update (which zeroes arm rotations by design — see Actor.js). `Npc.sit()`
 * has already folded the hips and knees; this is only the top half.
 */
function driverPose(parts) {
  // Both hands come IN toward the rim as well as forward, or a broad man's
  // arms hang wide of a 38 cm wheel and he reads as steering the door card.
  parts.armL.rotation.set(-0.78, 0, 0.22);
  parts.armR.rotation.set(-0.74, 0, -0.18);
  parts.foreL.rotation.set(-0.72, 0.26, 0.1);
  parts.foreR.rotation.set(-0.7, -0.24, -0.08);
}

export function buildCarInterior() {
  const root = new THREE.Group();
  root.name = 'carInterior';
  root.userData.geometryGate = {
    assemblyId: 'silvercase.car-interior',
  };

  const M = {
    dash: mat({ color: 0x1c1a1e, roughness: 0.7 }),
    trim: mat({ color: 0x100f12, roughness: 0.6 }),
    seat: mat({ color: 0x2a2224, roughness: 0.95 }),
    seatDark: mat({ color: 0x181314, roughness: 0.95 }),
    headliner: mat({ color: 0x262430, roughness: 0.9 }),
    carpet: mat({ color: 0x121114, roughness: 1 }),
    wheel: mat({ color: 0x141112, roughness: 0.55 }),
    chrome: mat({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.8 }),
  };

  // Floor + headliner, so the rig doesn't read as a dashboard floating in a
  // void when the player looks down or up.
  const floor = plane(2.4, 3.2, M.carpet);
  floor.name = 'silvercase.car.floor';
  floor.userData.geometryGate = {
    structural: true,
    fixedSupportAnchor: true,
    supportAssemblyId: 'silvercase.car-floor',
  };
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0.3);
  root.add(floor);
  const roof = plane(2.4, 3.2, M.headliner);
  roof.rotation.x = Math.PI / 2;
  roof.position.set(0, 1.95, 0.3);
  root.add(roof);
  // Rear bulkhead + parcel shelf, so looking over your shoulder is not a hole.
  root.add(box({ size: [2.3, 1.2, 0.1], pos: [0, 0.9, 1.55], mat: M.seatDark }));

  // Bench seat, wide enough for both of them.
  root.add(box({ size: [2.2, 0.42, 0.85], pos: [0, 0.21, 0.55], mat: M.seat }));
  root.add(box({ size: [2.2, 0.62, 0.16], pos: [0, 0.66, 0.98], mat: M.seatDark }));
  // Piping down the middle of the bench, the one detail that says "old car".
  root.add(box({ size: [0.04, 0.03, 0.85], pos: [0, 0.43, 0.55], mat: M.seatDark }));

  // Dashboard — ahead of the bench, below the windshield.
  root.add(box({ size: [2.3, 0.34, 0.55], pos: [0, 0.82, -0.85], mat: M.dash }));
  root.add(box({ size: [2.3, 0.08, 0.6], pos: [0, 1.0, -0.85], mat: M.trim }));
  root.add(box({ size: [2.3, 0.04, 0.06], pos: [0, 0.64, -0.6], mat: M.chrome }));

  // Instrument binnacle. Two dials with their own faint glow — the light that
  // puts a driver's face on screen at night.
  const dialGlass = new THREE.MeshStandardMaterial({
    color: 0x14161c,
    roughness: 0.4,
    emissive: new THREE.Color(0x2f6a4a),
    emissiveIntensity: 1.6,
  });
  const binnacle = new THREE.Group();
  binnacle.position.set(-0.78, 0.9, -0.62);
  root.add(binnacle);
  binnacle.add(box({ size: [0.52, 0.2, 0.06], pos: [0, 0, -0.03], mat: M.trim }));
  for (const dx of [-0.12, 0.12]) {
    binnacle.add(cylinder({
      r: 0.075, h: 0.02, pos: [dx, 0, 0.005], rotX: Math.PI / 2, mat: dialGlass,
    }));
  }
  const dashGlow = new THREE.PointLight(0x7fd8a8, 1.4, 1.6, 2);
  dashGlow.position.set(-0.78, 1.0, -0.48);
  root.add(dashGlow);

  // Radio, off, with one amber pilot lamp.
  root.add(box({ size: [0.34, 0.14, 0.05], pos: [0.1, 0.86, -0.6], mat: M.trim }));
  root.add(box({
    size: [0.05, 0.02, 0.01],
    pos: [0, 0.86, -0.575],
    mat: mat({ color: 0x2a1a06, emissive: 0xff9a3c, emissiveIntensity: 2.2, roughness: 0.5 }),
  }));

  /* ---------------- steering wheel + column ----------------
   *
   * The owner's note: *"Apes steering wheel is sideways."* It was.
   *
   * A `TorusGeometry` is built in the XY plane, so its axis is +Z — which in
   * this cabin (the windshield is at -z, the bench at +z) is already a steering
   * wheel facing the driver, at rotation zero. The old `rotation.x = PI/2.4`
   * is 75°, i.e. 15° off flat: it laid the wheel down like a table top with
   * the rim in his lap. A car wheel is tilted the other way and by a quarter
   * as much — the top edge rakes FORWARD, away from the driver, which is a
   * NEGATIVE rotation about x here (R_x sends the rim's top from +y toward
   * -z at negative angles).
   *
   * The whole assembly is one group now, so the rim, the spokes, the boss and
   * the column share that rake instead of each being placed by hand in world
   * space — which is why the old spokes sat in a flat plane of their own with
   * a `* 0.4` fudge on their y offsets and did not follow the rim at all. */
  const WHEEL_RAKE = -0.42; // ~24° off vertical, which is what a sedan has
  const wheelRig = new THREE.Group();
  wheelRig.name = 'steeringWheel';
  wheelRig.position.set(-0.78, 0.93, -0.52);
  wheelRig.rotation.x = WHEEL_RAKE;
  root.add(wheelRig);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.019, 10, 28), M.wheel);
  wheelRig.add(rim);
  // Three spokes at 12, 4 and 8 o'clock, in the wheel's OWN plane.
  for (const a of [Math.PI / 2, -Math.PI / 6, Math.PI + Math.PI / 6]) {
    const spoke = box({ size: [0.165, 0.016, 0.026], pos: [Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0], mat: M.wheel });
    spoke.rotation.z = a;
    wheelRig.add(spoke);
  }
  // Boss and horn ring, dished slightly toward the driver.
  wheelRig.add(cylinder({ r: 0.055, h: 0.03, pos: [0, 0, 0.012], rotX: Math.PI / 2, mat: M.trim }));
  wheelRig.add(cylinder({ r: 0.032, h: 0.012, pos: [0, 0, 0.03], rotX: Math.PI / 2, mat: M.chrome }));
  // Column, running down and forward out of the back of the boss on the same
  // rake, into the dash.
  wheelRig.add(cylinder({ r: 0.026, h: 0.30, pos: [0, -0.16, -0.02], mat: M.trim }));
  // Stalks: indicator on the left of the column, wiper on the right.
  wheelRig.add(cylinder({ r: 0.008, h: 0.16, pos: [-0.1, -0.09, 0.01], rotZ: 1.25, mat: M.chrome }));
  wheelRig.add(cylinder({ r: 0.008, h: 0.13, pos: [0.1, -0.1, 0.01], rotZ: -1.3, mat: M.chrome }));
  // Column shifter, out of the right of the column and up — the "three on the
  // tree" this car is old enough to have.
  const shifter = cylinder({ r: 0.009, h: 0.22, pos: [0.13, -0.2, 0.0], rotZ: -1.15, mat: M.chrome });
  wheelRig.add(shifter);
  wheelRig.add(sphere({ r: 0.022, pos: [0.235, -0.155, 0], mat: mat({ color: 0x2a1c14, roughness: 0.5 }) }));

  // Rear-view mirror, on the headliner, with a tiny pine tree on it.
  root.add(box({ size: [0.26, 0.075, 0.03], pos: [0, 1.72, -1.16], mat: M.trim }));
  const mirrorGlass = box({
    size: [0.235, 0.06, 0.008],
    pos: [0, 1.72, -1.143],
    mat: mat({ color: 0x0d1018, roughness: 0.08, metalness: 0.9 }),
  });
  root.add(mirrorGlass);
  root.add(cylinder({ r: 0.008, h: 0.09, pos: [0, 1.79, -1.2], rotX: 0.5, mat: M.trim }));
  root.add(box({
    size: [0.05, 0.08, 0.006],
    pos: [0, 1.6, -1.14],
    mat: mat({ color: 0x2c6b3a, roughness: 0.95 }),
  }));
  root.add(cylinder({ r: 0.0015, h: 0.06, pos: [0, 1.67, -1.14], mat: M.chrome }));

  /* ---------------- the rest of the cabin ----------------
   *
   * "Car interior few more details would be nice." Everything below is
   * decoration on the rig that already existed — no light, no anchor and no
   * collider changes — chosen for what is actually in frame from the passenger
   * seat at (0.62, 1.18, 0.46) inside a 1.5 rad look cone: the dash in front,
   * the driver's side to the left, the doors either side, and the floor. */

  // Sun visors, both sides, folded up against the headliner.
  for (const side of [-1, 1]) {
    root.add(box({
      size: [0.62, 0.22, 0.022], pos: [side * 0.52, 1.86, -1.24], mat: M.headliner, rotX: 0.32,
    }));
  }
  // Grab handle over the passenger door, which is the one thing a passenger
  // in this conversation would actually be holding.
  root.add(box({ size: [0.05, 0.03, 0.22], pos: [1.06, 1.62, 0.1], mat: M.trim }));
  for (const gz of [-0.09, 0.29]) {
    root.add(box({ size: [0.045, 0.06, 0.035], pos: [1.09, 1.6, gz], mat: M.trim }));
  }

  // Glovebox, ahead of the passenger: a lid, a seam and a chrome catch.
  root.add(box({ size: [0.5, 0.26, 0.03], pos: [0.62, 0.8, -1.11], mat: M.dash }));
  root.add(box({ size: [0.5, 0.012, 0.035], pos: [0.62, 0.93, -1.115], mat: M.trim }));
  root.add(box({ size: [0.055, 0.03, 0.02], pos: [0.62, 0.79, -1.13], mat: M.chrome }));

  // Dash vents either side of the radio.
  for (const vx of [-0.28, 0.44]) {
    const vent = group('vent');
    vent.add(box({ size: [0.15, 0.08, 0.03], pos: [0, 0, 0], mat: M.trim }));
    for (const sy of [-0.02, 0, 0.02]) {
      vent.add(box({ size: [0.13, 0.008, 0.032], pos: [0, sy, 0.004], mat: M.seatDark }));
    }
    vent.position.set(vx, 0.87, -0.585);
    root.add(vent);
  }

  // Ashtray, pulled out and full, and the lighter socket beside it.
  root.add(box({ size: [0.13, 0.045, 0.09], pos: [0.1, 0.75, -0.56], mat: M.chrome }));
  for (const [bx, bz, br] of [[0.07, -0.55, 0.4], [0.12, -0.575, -0.9], [0.14, -0.545, 0.2]]) {
    root.add(box({
      size: [0.055, 0.008, 0.008], pos: [bx, 0.775, bz], mat: mat({ color: 0xd8cfb8, roughness: 0.95 }), rotY: br,
    }));
  }
  root.add(cylinder({ r: 0.014, h: 0.02, pos: [-0.02, 0.75, -0.58], rotZ: Math.PI / 2, mat: M.chrome }));

  // Pedals and the driver's footwell, visible past the column.
  for (const [px, pw] of [[-0.92, 0.075], [-0.66, 0.075]]) {
    root.add(box({ size: [pw, 0.13, 0.03], pos: [px, 0.19, -1.0], mat: M.trim, rotX: -0.42 }));
  }
  root.add(box({ size: [0.11, 0.16, 0.03], pos: [-0.5, 0.16, -0.96], mat: M.trim, rotX: -0.5 }));
  // Rubber mats, both footwells.
  for (const side of [-1, 1]) {
    const footMat = plane(0.62, 0.5, mat({ color: 0x0b0b0e, roughness: 1 }));
    footMat.rotation.x = -Math.PI / 2;
    footMat.position.set(side * 0.72, 0.006, -0.55);
    root.add(footMat);
  }

  // Door cards: an armrest, a pull, a window winder and a lock knob a side.
  for (const side of [-1, 1]) {
    root.add(box({ size: [0.09, 0.055, 0.5], pos: [side * 1.06, 0.98, 0.32], mat: M.seat }));
    root.add(cylinder({
      r: 0.022, h: 0.035, pos: [side * 1.07, 0.86, -0.12], rotZ: Math.PI / 2, mat: M.chrome,
    }));
    root.add(box({ size: [0.02, 0.06, 0.02], pos: [side * 1.07, 0.9, -0.28], mat: M.chrome, rotZ: 0.5 }));
    root.add(cylinder({ r: 0.008, h: 0.05, pos: [side * 1.12, 1.28, -0.42], mat: M.chrome }));
  }

  // Headlining grab strap on the bulkhead, and a folded newspaper on the
  // parcel shelf behind them.
  root.add(box({ size: [0.28, 0.02, 0.2], pos: [0.42, 1.51, 1.46], mat: mat({ color: 0x6f6a5e, roughness: 1 }), rotY: 0.2 }));
  root.add(box({ size: [0.26, 0.015, 0.18], pos: [0.4, 1.53, 1.44], mat: mat({ color: 0x8a8578, roughness: 1 }), rotY: 0.1 }));

  // A paper coffee cup in the passenger footwell, and the bench's centre
  // hump between the two of them.
  root.add(cylinder({
    rTop: 0.038, rBottom: 0.03, h: 0.12, pos: [0.5, 0.06, -0.28], mat: mat({ color: 0xd9d2c4, roughness: 0.9 }),
  }));
  // Stops short of the bench's front edge (z=0.125) rather than growing up
  // through the cushion.
  root.add(box({ size: [0.24, 0.14, 1.0], pos: [0, 0.07, -0.4], mat: M.carpet }));

  // Side door panels + windows, so the cabin reads as enclosed.
  const sideTex = sideWindowTexture();
  const sideMat = new THREE.MeshStandardMaterial({
    color: 0x05070c,
    roughness: 0.25,
    transparent: true,
    opacity: 0.96,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: sideTex,
    emissiveIntensity: 0.85,
  });
  for (const side of [-1, 1]) {
    root.add(box({ size: [0.1, 1.05, 2.6], pos: [side * 1.15, 0.7, 0.3], mat: M.dash }));
    root.add(box({ size: [0.11, 0.035, 2.6], pos: [side * 1.15, 1.235, 0.3], mat: M.trim }));
    // Door pull and window winder, because a flat panel reads as a wall.
    root.add(box({ size: [0.05, 0.045, 0.34], pos: [side * 1.1, 0.92, 0.05], mat: M.chrome }));
    const win = plane(1.05, 0.6, sideMat);
    win.position.set(side * 1.14, 1.24, 0.15);
    win.rotation.y = Math.PI / 2;
    root.add(win);
  }

  // Windshield — dark, tinted, with a texture of streetlights that scrolls
  // sideways to fake motion cheaply.
  const windTex = windshieldTexture();
  const windMat = new THREE.MeshStandardMaterial({
    color: 0x03050a,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: windTex,
    emissiveIntensity: 0.9,
  });
  const windshield = plane(2.2, 1.05, windMat);
  windshield.position.set(0, 1.42, -1.42);
  windshield.rotation.x = -0.18;
  root.add(windshield);
  root.add(box({ size: [2.3, 0.1, 0.08], pos: [0, 1.95, -1.4], mat: M.trim }));

  // ---------------- light ----------------
  // Physical units: PointLight intensity is candela and falls off with the
  // square of distance, so the numbers here are the same order as the
  // apartment's own lamps rather than the fractional values that made this
  // beat black.
  root.add(new THREE.HemisphereLight(0x46506a, 0x101014, 0.9));
  const dome = new THREE.PointLight(0xffe2b4, 4.4, 4.6, 2);
  dome.position.set(-0.24, 1.8, 0.3);
  root.add(dome);
  // A soft fill from the passenger side, so that when he turns his head to
  // make a point there is a face there rather than a silhouette.
  const fill = new THREE.PointLight(0xffd6a8, 1.1, 2.4, 2);
  fill.position.set(0.36, 1.56, -0.18);
  root.add(fill);
  // Headlights coming back off the road, through the glass, onto both faces.
  const roadBounce = new THREE.PointLight(0xbfd4ff, 3.2, 5, 2);
  roadBounce.position.set(0, 1.1, -1.75);
  root.add(roadBounce);
  // The streetlight that sweeps the cabin every couple of seconds.
  const sweep = new THREE.PointLight(0xffc07a, 0, 5, 2);
  sweep.position.set(-1.6, 1.7, -0.6);
  root.add(sweep);

  // ---------------- Ape, at the wheel ----------------
  // The canonical Ape body, id and supplied face, wearing this mission's
  // scene-local black suit. See ../cast/ape.js.
  const apeNpc = buildSilverCaseApe(root, {
    /* Not 'ape': the corridor Ape carries that one, and both bodies are built
     * in every state this scene records. See markSilverCaseActor. */
    actorId: 'ape-driving',
    x: CAR_ANCHORS.driverSeat.x,
    y: CAR_ANCHORS.driverSeat.y,
    z: CAR_ANCHORS.driverSeat.z,
    yaw: CAR_ANCHORS.driverYaw,
    job: 'sit',
    look: false, // he glances over on his own beat below, not on a proximity test
  });

  let scrollT = 0;
  let glanceT = 0;
  function update(dt) {
    scrollT += dt * 0.12;
    windTex.offset.x = scrollT % 1;
    sideTex.offset.x = (scrollT * 5.5) % 1;
    windMat.emissiveIntensity = 0.75
      + Math.sin(scrollT * 14) * 0.08
      + Math.sin(scrollT * 31 + 1.3) * 0.05;

    // A streetlight goes past about every 1.9s: rises, crosses, falls.
    const phase = (scrollT * 5.2) % 1;
    const pulse = Math.max(0, Math.sin(phase * Math.PI)) ** 3;
    sweep.intensity = pulse * 7;
    sweep.position.set(-1.5 + phase * 3.0, 1.75, -1.1 + phase * 1.6);

    apeNpc.update(dt, null);
    driverPose(apeNpc.parts);
    // He drives with his eyes on the road and turns to make his points. The
    // supplied face lives on the FRONT of the head, so from the passenger
    // seat he is a silhouette until he actually looks over — which is most of
    // why this needs to be a real, held turn rather than a flicker.
    glanceT += dt;
    const glance = Math.sin(glanceT * 0.42);
    apeNpc.parts.head.rotation.y = glance > 0.15 ? -(glance - 0.15) * 1.42 : 0;
  }
  update(0);

  return {
    root,
    ape: apeNpc,
    update,
    anchors: CAR_ANCHORS,
  };
}
