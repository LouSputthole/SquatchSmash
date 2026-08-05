/**
 * The things Lou navigates by.
 *
 * There is no GPS in the Brushrunner and the one radio that works only
 * receives. So the route is flown by looking out of the window: a tower with
 * the top missing, a river bent into a horseshoe, a volcano with a thin smoke
 * plume, a red cliff, and finally a waterfall with a mountain behind it and a
 * runway in front.
 *
 * Each landmark is a single group, built once and left in the world — they are
 * big enough to be visible from a long way off, which is the entire point of
 * them, so they are not part of the streaming.
 */
import * as THREE from 'three';
import {
  solid, unlit, mat, boxGeo, cylGeo, coneGeo, sphereGeo, planeGeo,
  mesh, flatMesh, group, signTexture, rng, clamp,
} from './util.js';
import { LANDMARKS } from './config.js';
import { terrainHeight } from './terrain.js';

/* The waterfall, in landmark-local metres. `FALL_FACE_Z` is the front plane of
 * the cliff, which is the plane the water runs down — the sheets used to hang
 * forty-one metres in front of it, which is what "free standing" meant. */
const FALL_HEIGHT = 176;
const FALL_WIDTH = 34;
const FALL_FACE_Z = -8;
const FALL_BASIN_Z = 22;
/* Half-depth of every rock in the wall. Fixed rather than random so "the rock
 * is behind the water" is arithmetic instead of luck: a column centred at
 * `FALL_FACE_Z - 30` reaches `FALL_FACE_Z - 8` at the front, ten metres clear
 * of the sheets. */
const CLIFF_DEPTH = 22;

/* How far a watercourse may turn in one step. Wide enough to find a valley,
 * narrow enough that it cannot double back and sit in its own pool. */
const COURSE_CONE = 0.8;           // radians, either side of the current heading
const STRAIGHT_ON = 1.4;           // how much a watercourse prefers not to turn
const MEANDER = 1.9;               // how hard the meander pushes against that

/* One water material for every still surface in the file: the horseshoe river,
 * the header stream above the falls, and the outflow below them. They are the
 * same water and they should look it. */
const STILL_WATER = mat({ color: 0x3f6f9a, roughness: 0.18, metalness: 0.05 });

/* The volcano's column. `PLUME_LIFE` is how long one puff takes to go from the
 * vent to nothing, `PLUME_RISE` how far it gets, `PLUME_DRIFT` how far the wind
 * has carried it by then. */
/* The mountain itself, kept as constants so the flank detail can be placed on
 * the cone's real surface rather than at guessed radii. */
const VOLCANO_R = 520;
const VOLCANO_H = 620;
const VOLCANO_CENTRE_Y = 250;

const PLUME_PUFFS = 22;
const PLUME_LIFE = 46;             // seconds
const PLUME_RISE = 1150;           // metres
const PLUME_DRIFT = 860;           // metres downwind by the top

/**
 * One step of a watercourse, taken along the ground rather than along a guess.
 *
 * Samples bearings inside a cone around the direction it is already going and
 * takes the one that descends fastest (`sign` +1) or climbs fastest (`sign`
 * -1). The cone is the important part: an unconstrained steepest-descent walk
 * stops the moment it reaches a hollow, and the first thing below a waterfall
 * is a plunge basin — measured, the outflow travelled 20 m and descended
 * nothing before it sat down in its own pool. A river arriving with momentum
 * keeps going and cuts its way out, so the walk keeps its heading and only
 * chooses within seventy degrees of it.
 *
 * `wander` biases the choice slightly so the result meanders instead of
 * running dead straight down the fall line.
 *
 * @param {number} ox landmark origin x
 * @param {number} oz landmark origin z
 * @param {number} lx current point, landmark-local
 * @param {number} lz current point, landmark-local
 * @param {number} sign +1 downhill, -1 uphill
 * @param {number} len metres per step
 * @param {number} wander a phase, so successive steps do not all pick alike
 * @param {number} heading the bearing it arrived on, in radians
 */
function traceSlope(ox, oz, lx, lz, sign, len, wander, heading = 0) {
  let best = null;
  const here = terrainHeight(ox + lx, oz + lz);
  /* `lean` is one coherent sideways push per step that reverses every few
   * steps, which is what turns a straight line into a meander. It has to beat
   * the straight-ahead preference to bend the course at all, and the
   * straight-ahead preference has to be strong, because on genuinely flat
   * ground the gradient term is zero — the first version of this used a
   * per-bearing sine that was worth more than going forwards, and the outflow
   * walked in a complete circle on the valley floor. */
  const lean = Math.sin(wander) * MEANDER;
  for (let i = -4; i <= 4; i++) {
    const a = heading + (i / 4) * COURSE_CONE;
    const nx = lx + Math.sin(a) * len;
    const nz = lz + Math.cos(a) * len;
    const rise = terrainHeight(ox + nx, oz + nz) - here;
    let drop = -rise * sign - Math.abs(i) * STRAIGHT_ON + lean * i;
    /* Water does not go over a hill to get somewhere. Without this the outflow
     * climbed a 97 m hillock in the middle of an otherwise flat valley floor
     * and came back down the other side. */
    if (rise * sign > 0.5) drop -= rise * sign * 6;
    if (!best || drop > best.drop) best = { drop, nx, nz, a };
  }
  return {
    nx: best.nx,
    nz: best.nz,
    mx: (lx + best.nx) / 2,
    mz: (lz + best.nz) / 2,
    len,
    heading: best.a,
    // A plane rotated -PI/2 about x lies flat; this z rotation aims it along
    // the step, the same convention `horseshoeRiver` uses.
    yaw: -Math.atan2(best.nx - lx, best.nz - lz),
  };
}

function brokenTower(x, z) {
  const g = group('landmark-tower');
  const steel = solid(0x8a5a42, { roughness: 0.85, metalness: 0.4 });   // rusted through
  const feet = [[-1, -0.6], [1, -0.6], [0, 1.2]];
  /* The tower's own footprint is 14 m across and the ground under it is not
   * flat, so one centre sample floats the downhill legs. The structure stays
   * level off the highest foot — which is what a levelled tower does — and
   * each leg's bottom section is lengthened to reach the dirt beneath it. */
  const footY = feet.map(([ax, az]) => terrainHeight(x + ax * 7, z + az * 7));
  const y = Math.max(...footY);
  for (let i = 0; i < 9; i++) {
    const level = i * 9;
    const shrink = 1 - i * 0.06;
    feet.forEach(([ax, az], f) => {
      const dig = i === 0 ? y - footY[f] : 0;             // reach down to my own ground
      const leg = mesh(boxGeo(1.1, 9 + dig, 1.1), steel, ax * 7 * shrink, y + level + 4.5 - dig / 2, az * 7 * shrink);
      leg.rotation.z = -ax * 0.03;
      g.add(leg);
    });
    g.add(mesh(boxGeo(15 * shrink, 0.7, 15 * shrink), steel, 0, y + level + 9, 0));
  }
  // The top, lying in the scrub where it landed — on its own patch of ground,
  // forty metres out, resting on the lowest corner of its own tumbled box.
  const fallen = mesh(boxGeo(4, 4, 30), steel, 40, 0, 26);
  fallen.rotation.set(0.1, 0.6, 0.06);
  fallen.updateMatrixWorld(true);
  fallen.position.y = terrainHeight(x + 40, z + 26) - new THREE.Box3().setFromObject(fallen).min.y;
  g.add(fallen);
  g.position.set(x, 0, z);
  return g;
}

/**
 * The horseshoe, and the river it is a bend in.
 *
 * Owner's note: *"The river you fly over just ends its just a horseshoe it
 * doesn't go anywhere."* Correct — it was 48 segments of a single 207-degree
 * arc and nothing else, so both ends stopped dead in open country. A horseshoe
 * is a MEANDER: a river that has swung so far round that it has nearly met
 * itself. It has to arrive from upstream and leave downstream, or it is a
 * moat.
 *
 * So the arc is now the middle of a course. Above the bend the river comes
 * down out of the northern hills, below it, it straightens out and runs away
 * south toward the coast, both reaches wandering and both fading over the
 * horizon rather than terminating. The neck of the meander — the narrow strip
 * of land the two arms nearly pinch off — gets its own gravel spit, because
 * that neck is the only reason anybody would call this a horseshoe from the
 * air, and it is the thing Sasole is telling you to look for.
 */
function horseshoeRiver(x, z) {
  const g = group('landmark-river');
  const water = STILL_WATER;
  const sand = solid(0xbaa87c, { roughness: 1 });

  /** Lay a run of river along a list of points, widening downstream. */
  const layCourse = (name, pts, width, bars) => {
    const run = group(name);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mid = a.clone().lerp(b, 0.5);
      const len = a.distanceTo(b);
      const w = typeof width === 'function' ? width(i / (pts.length - 1)) : width;
      const seg = flatMesh(planeGeo(w, len + 6), water, mid.x, terrainHeight(x + mid.x, z + mid.z) + 1.2, mid.z);
      seg.name = `${name}-${i}`;
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = -Math.atan2(b.x - a.x, b.z - a.z);
      run.add(seg);
      if (bars && i % 6 === 0) {
        const bar = flatMesh(new THREE.CircleGeometry(22, 10), sand,
          mid.x * 0.88, terrainHeight(x + mid.x * 0.88, z + mid.z * 0.88) + 1.3, mid.z * 0.88);
        bar.name = `${name}-bar-${i}`;
        bar.rotation.x = -Math.PI / 2;
        run.add(bar);
      }
    }
    g.add(run);
    return run;
  };

  // The bend itself, unchanged in shape — it is the landmark, and it works.
  const R = 420;
  const bend = [];
  for (let i = 0; i <= 48; i++) {
    const a = Math.PI * 1.15 * (i / 48) - Math.PI * 0.08;
    bend.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R * 0.8));
  }
  layCourse('river-horseshoe', bend, 64, true);

  /* Upstream: out of the hills to the north, wandering, and narrower than the
   * bend because it has not picked up the side valleys yet. */
  const head = bend[0];
  const upstream = [head.clone()];
  for (let i = 1; i <= 16; i++) {
    upstream.push(new THREE.Vector3(
      head.x + 120 * i + Math.sin(i * 0.8) * 130,
      0,
      head.z - 168 * i + Math.cos(i * 0.55) * 110,
    ));
  }
  layCourse('river-upstream', upstream, (t) => 58 - t * 16, false);

  /* Downstream: it leaves the bend, straightens, and widens on its way to the
   * coast. Neither reach terminates in view — both run past the fog. */
  const tail = bend[bend.length - 1];
  const downstream = [tail.clone()];
  for (let i = 1; i <= 18; i++) {
    downstream.push(new THREE.Vector3(
      tail.x - 96 * i + Math.sin(i * 0.62 + 1.3) * 150,
      0,
      tail.z + 176 * i + Math.cos(i * 0.44) * 120,
    ));
  }
  layCourse('river-downstream', downstream, (t) => 66 + t * 26, true);

  /* The neck: the pinched strip of land between the two arms of the meander,
   * with the gravel spit that is about to cut it off. This is the shape that
   * makes it read as a horseshoe from three thousand feet. */
  const neck = group('river-neck');
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 1.15 * (0.06 + i * 0.02) - Math.PI * 0.08;
    const nx = Math.cos(a) * R * 0.52;
    const nz = Math.sin(a) * R * 0.42;
    const spit = flatMesh(new THREE.CircleGeometry(26 - i * 3, 10), sand, nx, terrainHeight(x + nx, z + nz) + 1.35, nz);
    spit.name = `river-neck-spit-${i}`;
    spit.rotation.x = -Math.PI / 2;
    neck.add(spit);
  }
  g.add(neck);

  g.position.set(x, 0, z);
  return g;
}

/**
 * The smoking volcano.
 *
 * Owner's note: *"Volcano could use a little fine tuning. Better smoke."*
 *
 * The mountain was one nine-sided cone, which from the air is a pyramid: nine
 * flat faces meeting at nine hard vertical creases, and no flanks. It gets a
 * proper radial count, a talus skirt at the bottom where 620 metres of loose
 * rock would actually pile up, ribs down the flanks, three cooled lava tongues
 * on the runway side, and a crater with an inside rather than a lid.
 *
 * The smoke was fourteen spheres on one shared material at a fixed opacity,
 * pinned to fixed heights, wobbling sideways on a sine. It never rose, never
 * grew, never thinned and never renewed, so at any distance it was a string of
 * beads. It is a real column now: every puff owns its material, is born small
 * and dark at the vent, rises, expands, cools toward ash grey, thins out, and
 * is recycled back to the vent when it has faded — with the whole column leaned
 * downwind so it trails off across the valley instead of standing up like a
 * mast. Fourteen puffs became twenty-two, which is still nothing, and they are
 * all `MeshBasicMaterial` so none of them costs a light.
 */
function volcano(x, z) {
  const g = group('landmark-volcano');
  const y = terrainHeight(x, z);
  const rock = solid(0x4a4038, { roughness: 1 });
  const rockDark = solid(0x38302a, { roughness: 1 });
  const ash = solid(0x5a5048, { roughness: 1 });
  const basalt = solid(0x2a2420, { roughness: 0.95 });

  const cone = mesh(coneGeo(VOLCANO_R, VOLCANO_H, 26), rock, 0, y + VOLCANO_CENTRE_Y, 0);
  cone.name = 'volcano-cone';
  cone.receiveShadow = false;
  g.add(cone);
  /* Talus: the apron of shed rock round the foot, wider than the cone and much
   * shallower, which is what stops the mountain reading as a party hat set on
   * flat ground. */
  const talus = mesh(coneGeo(700, 180, 26), ash, 0, y + 62, 0);
  talus.name = 'volcano-talus';
  talus.receiveShadow = false;
  g.add(talus);
  /* Where the cone's own surface is, so everything hung on the flanks sits ON
   * the mountain instead of through it. `u` is the fraction of the way up:
   * the first attempt at ribs was eight tall cones dropped at a fixed radius,
   * and because the mountain narrows with height they came out as eight black
   * thorns sticking ninety metres out of the slope. */
  const coneBaseY = y + VOLCANO_CENTRE_Y - VOLCANO_H / 2;
  const surfaceY = (u) => coneBaseY + VOLCANO_H * u;
  const surfaceR = (u) => VOLCANO_R * (1 - u);

  // Shoulders and gullies on the flanks: half-buried lumps that break the
  // silhouette into something weathered rather than turned on a lathe.
  const rrand = rng(0x901ca);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const u = 0.1 + rrand() * 0.24;
    const rr = surfaceR(u);
    const lump = mesh(sphereGeo(1, 7, 5), i % 2 ? rockDark : ash);
    lump.name = `volcano-flank-${i}`;
    // 0.72 of the way out with a radius under a quarter of it stays inside.
    const size = Math.min(96, rr * 0.22);
    lump.scale.set(size * 1.8, size * 1.5, size * 1.8);
    lump.position.set(Math.cos(a) * rr * 0.72, surfaceY(u), Math.sin(a) * rr * 0.72);
    lump.receiveShadow = false;
    g.add(lump);
  }
  /* Three old lava tongues running down the runway side — black, glassy, and
   * the only part of the mountain a different colour from the rest. Placed on
   * the surface curve, so each one lies along the slope. */
  for (let i = 0; i < 3; i++) {
    const a = 1.4 + i * 0.42;
    for (let s = 0; s < 6; s++) {
      const u = 0.72 - s * 0.12;
      const rr = surfaceR(u) * 0.94;
      const flow = mesh(sphereGeo(1, 6, 4), basalt);
      flow.name = `volcano-lava-flow-${i}-${s}`;
      flow.scale.set(26 + s * 9, 13, 48 + s * 16);
      flow.position.set(Math.cos(a) * rr, surfaceY(u), Math.sin(a) * rr);
      flow.rotation.y = -a;
      g.add(flow);
    }
  }

  // Crater: a rim you can see the inside of, and the glow down in it.
  const rim = mesh(cylGeo(88, 130, 40, 18), solid(0x2e2822, { roughness: 1 }), 0, y + 545, 0);
  rim.name = 'volcano-crater-rim';
  g.add(rim);
  const bowl = mesh(coneGeo(84, 70, 18, 1, true), basalt, 0, y + 528, 0);
  bowl.name = 'volcano-crater-bowl';
  bowl.material.side = THREE.DoubleSide;
  g.add(bowl);
  const glow = flatMesh(new THREE.CircleGeometry(70, 16), unlit(0xd94f1e), 0, y + 506, 0);
  glow.name = 'volcano-crater-glow';
  glow.rotation.x = -Math.PI / 2;
  g.add(glow);
  // A second, dimmer ring just above it, so the light has some depth to it.
  const heat = flatMesh(new THREE.CircleGeometry(96, 16), new THREE.MeshBasicMaterial({
    color: 0xff7a34, transparent: true, opacity: 0.22, depthWrite: false,
  }), 0, y + 522, 0);
  heat.name = 'volcano-crater-heat';
  heat.rotation.x = -Math.PI / 2;
  g.add(heat);

  /* The column. Each puff carries its own age, so the stack is a continuous
   * emission rather than a fixed ladder — `update()` below ages them. */
  const plume = group('volcano-plume');
  const puffs = [];
  const ventY = y + 552;
  for (let i = 0; i < PLUME_PUFFS; i++) {
    const p = new THREE.Mesh(sphereGeo(1, 7, 5), new THREE.MeshBasicMaterial({
      color: 0x8f857c, transparent: true, opacity: 0, depthWrite: false, fog: true,
    }));
    p.name = `volcano-smoke-${i}`;
    // Spread the initial ages so the column is already full on the first frame.
    p.userData.age = (i / PLUME_PUFFS) * PLUME_LIFE;
    p.userData.wobble = rrand() * Math.PI * 2;
    p.userData.rise = 0.82 + rrand() * 0.42;
    p.userData.girth = 0.8 + rrand() * 0.55;
    p.frustumCulled = false;
    plume.add(p);
    puffs.push(p);
  }
  g.add(plume);

  g.position.set(x, 0, z);
  g.userData.puffs = puffs;
  g.userData.ventY = ventY;
  return g;
}

/**
 * Age one column of volcanic smoke by `dt`.
 *
 * A puff is born at the vent small, dark and nearly opaque; it rises, is pushed
 * downwind by an amount that grows with height (because the wind does), swells,
 * pales toward ash, and fades out. When it is gone it goes back to the vent.
 * That single loop is the whole difference between "a plume" and "beads on a
 * string".
 */
function updatePlume(puffs, ventY, dt, t) {
  for (const p of puffs) {
    const d = p.userData;
    d.age += dt;
    if (d.age > PLUME_LIFE) d.age -= PLUME_LIFE;
    const k = d.age / PLUME_LIFE;                     // 0 at the vent, 1 spent
    const rise = k * PLUME_RISE * d.rise;
    // Downwind drift grows with height: shear, in one multiply.
    const drift = k * k * PLUME_DRIFT;
    p.position.set(
      drift + Math.sin(t * 0.21 + d.wobble) * (18 + rise * 0.06),
      ventY + rise,
      drift * 0.42 + Math.cos(t * 0.17 + d.wobble) * (14 + rise * 0.05),
    );
    const s = (26 + k * 200) * d.girth;
    p.scale.set(s, s * (0.72 + k * 0.3), s);
    /* In fast, out slow: it billows out of the vent and then takes its time
     * disappearing, which is what makes the top of a column feel high. */
    p.material.opacity = Math.min(k * 9, 1) * (1 - k) * (1 - k) * 0.62;
    // Hot and sooty at the bottom, cold ash at the top.
    p.material.color.setRGB(
      0.34 + k * 0.36,
      0.30 + k * 0.34,
      0.27 + k * 0.33,
    );
  }
}

function redCliff(x, z) {
  const g = group('landmark-cliff');
  const y = terrainHeight(x, z);
  const red = solid(0xa8442a, { roughness: 1 });
  const redDark = solid(0x7a2f1e, { roughness: 1 });
  // A face of stacked slabs, deliberately unmissable.
  for (let i = 0; i < 7; i++) {
    const w = 420 - i * 26;
    const slab = mesh(boxGeo(w, 42, 150 - i * 12), i % 2 ? red : redDark, (i % 2 ? 8 : -8), y + 20 + i * 40, 0);
    g.add(slab);
  }
  g.position.set(x, 0, z);
  g.rotation.y = 0.3;
  return g;
}

/**
 * The waterfall, and the valley it belongs to.
 *
 * Owner's note: *"whaterfall is free standing and not connected to anything."*
 * It was, in every sense that matters:
 *
 *  - the three water sheets hung at local z +13 while the rock shoulder they
 *    were supposed to be falling down sat at z -28 — forty-one metres BEHIND
 *    the water, so the fall was a lit card floating in clear air;
 *  - the pool was a disc at z +40, twenty-seven metres from where the water
 *    landed, so nothing caught it;
 *  - every rock column was founded on ONE terrain sample taken at the
 *    landmark's centre, so on ground that moves the wall floated at one end
 *    and buried itself at the other;
 *  - and there was no source and no outflow. Water arrived out of the sky at
 *    the top and stopped existing at the bottom.
 *
 * So the whole thing is built as one connected watercourse instead: a header
 * stream comes out of the high ground, runs to a lip cut in the rim, drops down
 * the FRONT FACE of a cliff founded column by column on its own ground, lands
 * in a plunge basin at the foot of that face, and leaves as a stream running
 * down the valley toward the strip. Every piece is placed off `crestY` and
 * `basinY`, which are two real terrain samples, so the drop is the height of
 * the actual cliff rather than a number that happened to look right.
 */
function waterfall(x, z) {
  const g = group('landmark-falls');
  const rand = rng(0xfa115);
  // The cliff mass stays safely east of final, while the water itself drops
  // on its runway-side shoulder: "fly toward the waterfall" now points the
  // nose into the correct valley instead of 260 metres away from the strip.
  const fallX = -205;
  /* Two samples decide everything. `basinY` is the ground the pool stands on,
   * out in front of the wall; `crestY` is the top of the cliff above it. The
   * drop is the difference, so the water can never be longer or shorter than
   * the rock it is running down. */
  const basinY = terrainHeight(x + fallX, z + FALL_BASIN_Z);
  const crestY = basinY + FALL_HEIGHT;
  const faceZ = FALL_FACE_Z;              // the front plane of the wall

  const rock = solid(0x465044, { roughness: 1 });
  const mossRock = solid(0x354a38, { roughness: 1 });
  const wetRock = solid(0x2c3a34, { roughness: 0.72 });

  const cliff = group('waterfall-cliff-wall');
  /* A broken wall of overlapping rock columns. Each one is founded on the
   * terrain UNDER ITSELF and grown up to just under the crest, so the wall is
   * continuous along the top and welded to the hillside along the bottom
   * whatever the ground is doing. */
  for (let i = 0; i < 15; i++) {
    const cx = -168 + i * 24 + (rand() - 0.5) * 8;
    /* Behind the water, and provably so: a column centred here with at most
     * `CLIFF_DEPTH` of half-depth cannot reach past `faceZ - 8`, which leaves
     * ten clear metres in front of it for the sheets. The first attempt put
     * the columns at faceZ - 16 with up to 24 m of half-depth, so the rock
     * closed over the water and the fall vanished behind its own cliff. */
    const cz = faceZ - 30 - rand() * 18;
    const foot = terrainHeight(x + cx, z + cz);
    const top = crestY - rand() * 16;
    const h = Math.max(60, top - foot);
    const boulder = mesh(sphereGeo(1, 8, 6), i % 3 === 0 ? mossRock : rock);
    boulder.name = `waterfall-cliff-column-${i}`;
    boulder.scale.set(26 + rand() * 20, h, CLIFF_DEPTH);
    // A sphere of unit radius scaled to h is 2h tall, so half of it is buried:
    // sitting its centre at foot + h/2 puts the base in the dirt and the top
    // at the crest, which is exactly what a cliff does.
    boulder.position.set(cx, foot + h * 0.5, cz);
    boulder.rotation.set(rand() * 0.18, rand() * 0.5, (rand() - 0.5) * 0.16);
    cliff.add(boulder);
  }
  /* Wing buttresses: the wall does not end in mid-air at either side, it runs
   * back into the ridge it is part of. */
  for (const [n, sx] of [[0, -1], [1, 1]]) {
    for (let i = 0; i < 3; i++) {
      const wx = sx * (190 + i * 46);
      const wz = faceZ - 40 - i * 34;
      const foot = terrainHeight(x + wx, z + wz);
      const h = Math.max(50, crestY - 26 - i * 20 - foot);
      const wing = mesh(sphereGeo(1, 7, 5), i % 2 ? rock : mossRock);
      wing.name = `waterfall-ridge-wing-${n}-${i}`;
      wing.scale.set(46 + i * 12, h, 40 + i * 10);
      wing.position.set(wx, foot + h * 0.5, wz);
      wing.rotation.y = sx * 0.3;
      cliff.add(wing);
    }
  }
  // The shoulder the water actually comes over, and the notch cut in it.
  const shoulder = mesh(sphereGeo(1, 8, 6), mossRock);
  shoulder.name = 'waterfall-shoulder';
  const shoulderFoot = terrainHeight(x + fallX, z + faceZ - 34);
  const shoulderH = Math.max(70, crestY - shoulderFoot);
  shoulder.scale.set(52, shoulderH, CLIFF_DEPTH);
  shoulder.position.set(fallX, shoulderFoot + shoulderH * 0.5, faceZ - 34);
  cliff.add(shoulder);
  g.add(cliff);

  /* The lip. A slab of wet rock at the crest with the water running over it,
   * flanked by two shoulders, so there is a visible place the fall begins. */
  const lip = group('waterfall-lip');
  const sill = mesh(boxGeo(FALL_WIDTH + 8, 5, 26), wetRock, fallX, crestY - 2, faceZ - 9);
  sill.name = 'waterfall-lip-sill';
  lip.add(sill);
  for (const [n, sx] of [[0, -1], [1, 1]]) {
    const cheek = mesh(boxGeo(16, 16, 24), rock, fallX + sx * (FALL_WIDTH / 2 + 11), crestY + 3, faceZ - 10);
    cheek.name = `waterfall-lip-cheek-${n}`;
    cheek.rotation.z = sx * 0.12;
    lip.add(cheek);
  }
  g.add(lip);

  /* The header stream: where the water comes FROM.
   *
   * It walks UPHILL from the lip by steepest ascent, so the channel is cut
   * into the real high ground behind the cliff rather than laid on a straight
   * line at made-up heights. Every segment is turned to face the way it is
   * going, so the run is a ribbon and not a row of tiles. */
  const header = group('waterfall-header-stream');
  let hx = fallX, hz = faceZ - 26;
  let hHeading = Math.PI / 2;                // along the crest, into the ridge
  for (let i = 0; i < 6; i++) {
    const step = traceSlope(x, z, hx, hz, -1, 44, i * 1.7, hHeading);
    hHeading = step.heading;
    const ground = terrainHeight(x + step.mx, z + step.mz);
    const hy = Math.max(crestY + 1 + i * 2.6, ground + 1.5);
    /* The spur the channel is cut into.
     *
     * The clifftop here is not terrain — the terrain is the flat valley floor
     * 176 m below, and the crest is the rock this landmark builds. Measured,
     * the first attempt at a header ran 300 m back from the lip on nothing at
     * all: an aqueduct of open water in mid-air, which is the owner's original
     * complaint with the water at the other end of it. Every segment now
     * carries a rock mass from its own ground up to the channel, so the stream
     * is cut through a spur that reaches the hillside rather than hanging off
     * the top of the fall. */
    const spurH = Math.max(24, hy - ground + 8);
    const spur = mesh(sphereGeo(1, 8, 6), i % 2 ? rock : mossRock);
    spur.name = `waterfall-header-spur-${i}`;
    spur.scale.set(40, spurH, 46);
    spur.position.set(step.mx, ground + spurH * 0.5 - 3, step.mz);
    header.add(spur);

    const seg = flatMesh(planeGeo(15 + i * 2, step.len + 6), STILL_WATER, step.mx, hy, step.mz);
    seg.name = `waterfall-header-${i}`;
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = step.yaw;
    header.add(seg);
    // Banks, so the channel is cut into something.
    for (const sx of [-1, 1]) {
      const bx = step.mx + Math.cos(step.yaw) * sx * (12 + i * 1.4);
      const bz = step.mz - Math.sin(step.yaw) * sx * (12 + i * 1.4);
      const bank = mesh(boxGeo(11, 8, step.len), rock, bx, hy - 1.4, bz);
      bank.name = `waterfall-header-bank-${i}-${sx < 0 ? 'w' : 'e'}`;
      bank.rotation.y = -step.yaw;
      header.add(bank);
    }
    hx = step.nx; hz = step.nz;
  }
  g.add(header);

  /* Three translucent ribbons at slightly different rates, so the fall remains
   * visibly alive from the cockpit rather than becoming a white card — now
   * hung on the FRONT of the wall, running the real crest-to-basin drop. */
  const waterSheets = [];
  for (let i = 0; i < 3; i++) {
    const sheet = flatMesh(planeGeo(FALL_WIDTH - i * 6, FALL_HEIGHT + 6), mat({
      color: i === 0 ? 0xf0fbff : 0xb9dce8,
      roughness: 0.08,
      emissive: 0x89b8c9,
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0.72 - i * 0.13,
      depthWrite: false,
    }), fallX - 6 + i * 6, basinY + FALL_HEIGHT / 2, faceZ + 1.2 + i * 0.9);
    sheet.name = `waterfall-sheet-${i + 1}`;
    sheet.userData.baseY = sheet.position.y;
    g.add(sheet);
    waterSheets.push(sheet);
  }
  // Where it hits: a white boil on the surface of the basin, and wet rock.
  const boil = flatMesh(new THREE.CircleGeometry(26, 14), mat({
    color: 0xeaf6fa, roughness: 0.1, transparent: true, opacity: 0.72, depthWrite: false,
  }), fallX, basinY + 3.4, faceZ + 16);
  boil.name = 'waterfall-plunge-boil';
  boil.rotation.x = -Math.PI / 2;
  g.add(boil);
  for (let i = 0; i < 6; i++) {
    const slab = mesh(sphereGeo(1, 6, 5), wetRock);
    slab.name = `waterfall-plunge-rock-${i}`;
    const sx = fallX - 34 + i * 14 + (rand() - 0.5) * 8;
    const sz = faceZ + 6 + rand() * 16;
    slab.scale.set(10 + rand() * 9, 7 + rand() * 6, 9 + rand() * 8);
    slab.position.set(sx, terrainHeight(x + sx, z + sz) + 2, sz);
    g.add(slab);
  }

  /* Spray, not weather. These used to reach 60 m of radius each — 120 m of
   * white ball across a 34 m fall — so from the approach the landmark was a
   * cloud with a cliff behind it and no water in it at all. They are the size
   * of the plunge now, and they sit low. */
  const mistMat = new THREE.MeshBasicMaterial({ color: 0xe4eef2, transparent: true, opacity: 0.3, depthWrite: false });
  const mist = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(sphereGeo(1, 7, 5), mistMat);
    m.name = `waterfall-mist-${i}`;
    const s = 7 + i * 2.4;
    m.scale.set(s, s * 0.7, s);
    m.position.set(fallX + (rand() - 0.5) * 38, basinY + 8 + rand() * 22, faceZ + 12 + rand() * 18);
    g.add(m);
    mist.push(m);
  }

  // The plunge basin, centred on where the water actually lands.
  const pool = flatMesh(new THREE.CircleGeometry(62, 18), mat({ color: 0x3f7f9a, roughness: 0.15 }), fallX, basinY + 3, FALL_BASIN_Z);
  pool.name = 'waterfall-pool';
  pool.rotation.x = -Math.PI / 2;
  g.add(pool);

  /* And where it GOES. A stream leaves the basin and runs off down the valley,
   * dropping with the ground, so the fall is one end of a river rather than a
   * feature that begins and ends inside its own footprint. */
  /* Where it goes: away, down the valley floor.
   *
   * Three dead ends came before this. Laying the stream on a fixed bearing
   * built a staircase of blue tiles UP the far valley wall. Pure steepest
   * descent stopped after 20 m, because the first thing below a waterfall is
   * its own plunge basin and a plunge basin is a hole — the walk reached the
   * bottom of the world and sat in it. Aiming it at the El Hueso strip fixed
   * the coiling and broke the physics: El Hueso is a MOUNTAIN airstrip at
   * 690 m and the basin is at 390, so "toward the strip" is 300 m uphill, and
   * the stream duly climbed a ridge.
   *
   * What is actually true here is that the fall lands on a wide flat valley
   * floor. So the walk keeps its heading, takes the lowest step inside a
   * narrow cone, and is forbidden from climbing at all — which on a floodplain
   * gives exactly what a floodplain gives: a river that meanders away and
   * keeps going. */
  const outflow = group('waterfall-outflow');
  let ox = fallX + 26, oz = FALL_BASIN_Z + 40;
  let oHeading = 0;                          // out of the hollow, runway side
  for (let i = 0; i < 16; i++) {
    const step = traceSlope(x, z, ox, oz, 1, 52, i * 1.3, oHeading);
    oHeading = step.heading;
    // Sit on the ground it is crossing, the way the horseshoe river does.
    const gy = terrainHeight(x + step.mx, z + step.mz) + 2.2;
    const seg = flatMesh(planeGeo(18 + i * 1.4, step.len + 8), STILL_WATER, step.mx, gy, step.mz);
    seg.name = `waterfall-outflow-${i}`;
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = step.yaw;
    outflow.add(seg);
    // Gravel bars on the inside of each bend.
    if (i % 3 === 1) {
      const bx = step.mx + Math.cos(step.yaw) * 13;
      const bz = step.mz - Math.sin(step.yaw) * 13;
      const bar = flatMesh(new THREE.CircleGeometry(13, 9), solid(0x9d9070, { roughness: 1 }), bx, gy + 0.3, bz);
      bar.name = `waterfall-outflow-bar-${i}`;
      bar.rotation.x = -Math.PI / 2;
      outflow.add(bar);
    }
    ox = step.nx; oz = step.nz;
  }
  g.add(outflow);

  // Dark-green crowns and trunks frame the water and tie it into El Hueso's
  // jungle palette without adding another streamed terrain chunk.
  const foliage = group('waterfall-foliage');
  for (let i = 0; i < 20; i++) {
    const tx = -160 + i * 17 + (rand() - 0.5) * 12;
    const tz = faceZ + 26 + (rand() - 0.5) * 70;
    const gy = terrainHeight(x + tx, z + tz);
    const trunk = mesh(cylGeo(0.9, 1.4, 15 + rand() * 9, 6), solid(0x3d3221, { roughness: 1 }), tx, gy + 8, tz);
    trunk.name = `waterfall-tree-trunk-${i}`;
    foliage.add(trunk);
    const crown = mesh(coneGeo(8 + rand() * 5, 18 + rand() * 10, 7), solid(i % 2 ? 0x245b31 : 0x31703b, { roughness: 1 }), tx, gy + 22, tz);
    crown.name = `waterfall-tree-crown-${i}`;
    foliage.add(crown);
  }
  g.add(foliage);
  g.position.set(x, 0, z);
  g.userData.mist = mist;
  g.userData.waterSheets = waterSheets;
  g.userData.fallX = fallX;
  g.userData.boil = boil;
  g.userData.crestY = crestY;
  g.userData.basinY = basinY;
  return g;
}

/**
 * A radio mast with the Bureau's badge on it: an eagle holding a fork.
 * These are the things the player is supposed to stay away from on the way
 * back, and they are marked so there is no guessing involved.
 */
/** How much the ground moves across a mast's 6.8 m leg square. */
export function caibRelief(x, z) {
  let lo = Infinity, hi = -Infinity;
  for (const ax of [-3.4, 3.4]) {
    for (const az of [-3.4, 3.4]) {
      const h = terrainHeight(x + ax, z + az);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
  }
  return { relief: hi - lo, low: lo };
}

export function caibTower(x, z) {
  const g = group('caib-tower');
  // Found on the lowest leg corner so that no leg is left standing on air.
  const y = caibRelief(x, z).low;
  const steel = solid(0xb8bcc2, { roughness: 0.5, metalness: 0.6 });
  const red = solid(0xd92e2e, { roughness: 0.7 });
  for (let i = 0; i < 8; i++) {
    const band = i % 2 ? red : steel;
    for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const shrink = 1 - i * 0.07;
      g.add(mesh(boxGeo(0.5, 7, 0.5), band, ax * 3.4 * shrink, y + i * 7 + 3.5, az * 3.4 * shrink));
    }
    g.add(mesh(boxGeo(7 * (1 - i * 0.07), 0.4, 7 * (1 - i * 0.07)), steel, 0, y + i * 7 + 7, 0));
  }
  // Dishes, and the badge.
  for (const a of [0, 2.1, 4.2]) {
    const dish = mesh(cylGeo(2.4, 2.4, 0.4, 12), solid(0xd8d2c0, { roughness: 0.6 }), Math.cos(a) * 3.4, y + 44, Math.sin(a) * 3.4);
    dish.rotation.z = Math.PI / 2;
    dish.rotation.y = -a;
    g.add(dish);
  }
  const badge = flatMesh(planeGeo(6, 6), mat({ map: caibBadgeTexture(), roughness: 0.8, transparent: true }), 0, y + 20, 3.7);
  g.add(badge);
  const beacon = flatMesh(sphereGeo(0.8), unlit(0xff3a2a), 0, y + 57, 0);
  g.add(beacon);
  g.position.set(x, 0, z);
  g.userData.beacon = beacon;
  return g;
}

/** The insignia: an eagle holding a fork. Nobody at the Bureau finds it funny. */
export function caibBadgeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#1b2a4a';
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8c88a';
  ctx.lineWidth = 7;
  ctx.stroke();
  // Eagle: a blocky heraldic bird.
  ctx.fillStyle = '#d8c88a';
  ctx.beginPath();
  ctx.moveTo(128, 62);
  ctx.lineTo(150, 96);
  ctx.lineTo(214, 108);
  ctx.lineTo(158, 126);
  ctx.lineTo(170, 176);
  ctx.lineTo(128, 150);
  ctx.lineTo(86, 176);
  ctx.lineTo(98, 126);
  ctx.lineTo(42, 108);
  ctx.lineTo(106, 96);
  ctx.closePath();
  ctx.fill();
  // The fork, held in the talons.
  ctx.strokeStyle = '#e8e2d0';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(128, 150);
  ctx.lineTo(128, 206);
  ctx.stroke();
  ctx.lineWidth = 5;
  for (const dx of [-14, 0, 14]) {
    ctx.beginPath();
    ctx.moveTo(128 + dx, 206);
    ctx.lineTo(128 + dx, 232);
    ctx.stroke();
  }
  ctx.fillStyle = '#e8e2d0';
  ctx.font = '900 22px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('C A I B', 128, 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ */

export function buildLandmarks(scene) {
  const root = group('landmarks');
  scene.add(root);
  const built = {};
  const builders = {
    tower: brokenTower, river: horseshoeRiver, volcano, cliff: redCliff, falls: waterfall,
  };
  for (const lm of LANDMARKS) {
    const make = builders[lm.kind];
    if (!make) continue;
    const g = make(lm.x, lm.z);
    root.add(g);
    built[lm.id] = { ...lm, group: g };
  }

  // The Bureau's masts, scattered over the high ground on the way home.
  const rand = rng(0xca1b);
  const towers = [];
  for (let i = 0; i < 7; i++) {
    /* A mast is a rigid square on four legs. Dropped blind it lands on ground
     * that moves up to 22 m across its own footprint, and three of its legs
     * end up in the sky. Try a handful of spots along the same band and take
     * the flattest — the band is what matters, not the exact metre. */
    let x = 0, z = 0, best = Infinity;
    for (let tryN = 0; tryN < 12; tryN++) {
      const cx = (rand() - 0.5) * 1800;
      const cz = -1400 - i * 1150 - rand() * 400;
      const { relief } = caibRelief(cx, cz);
      if (relief < best) { best = relief; x = cx; z = cz; }
      if (relief <= 3) break;
    }
    const t = caibTower(x, z);
    root.add(t);
    towers.push({ group: t, position: new THREE.Vector3(x, terrainHeight(x, z), z) });
  }

  let t = 0;
  return {
    root, marks: built, towers,
    update(dt, focus) {
      t += dt;
      const vol = built.volcano?.group;
      if (vol) updatePlume(vol.userData.puffs, vol.userData.ventY, dt, t);
      const falls = built.falls?.group;
      if (falls) {
        for (let i = 0; i < falls.userData.mist.length; i++) {
          const m = falls.userData.mist[i];
          const s = 18 + i * 6;
          m.scale.set(s * (1 + Math.sin(t * 1.2 + i) * 0.12), s * 0.7, s * (1 + Math.cos(t * 0.9 + i) * 0.1));
        }
        for (let i = 0; i < falls.userData.waterSheets.length; i++) {
          const sheet = falls.userData.waterSheets[i];
          sheet.position.y = sheet.userData.baseY + Math.sin(t * (2.1 + i * 0.35) + i) * 0.9;
          sheet.material.opacity = 0.52 + Math.sin(t * 1.7 + i) * 0.08;
        }
        // The boil where it lands breathes with the sheets, so the top and the
        // bottom of the fall are visibly the same water.
        const boil = falls.userData.boil;
        if (boil) {
          const b = 1 + Math.sin(t * 2.4) * 0.09;
          boil.scale.set(b, b, 1);
          boil.material.opacity = 0.6 + Math.sin(t * 1.9) * 0.12;
        }
      }
      for (const tw of towers) {
        const b = tw.group.userData.beacon;
        if (b) b.visible = Math.sin(t * 2.6 + tw.position.x) > 0;
      }
      void focus; void clamp; void signTexture;
    },
  };
}
