/**
 * The siege's environmental damage: wrecks, fire, smoke, bodies, debris.
 *
 * THE RULE (docs/MANSION-SIEGE-NIGHT.md, PART 0). `MansionGrounds.js` and
 * `MansionInterior.js` are the canonical house and this file does not edit
 * them, fork them or copy them. It calls neither builder: it is handed their
 * RESULTS and hangs a second layer of objects over the top, every one of them
 * registered with `MansionDamageState` so a state change is a toggle rather
 * than a rebuild. Anything here that would be easier as an edit to the
 * interior goes in the future-edit table in that document instead, and waits
 * for the mansion overview.
 *
 * WHO OWNS THE COLLIDERS. Everything solid this module builds is registered
 * through `damage.group(...)`, so the OVERLAY enrols it and withdraws it. The
 * `colliders` array this returns is for accounting only -- the composition
 * root must NOT push it into the scene's collider list the way it does for
 * `silent.colliders`, or every wreck hull is solid during the walking tour and
 * solid twice during the fight. `damage.colliders` is already the scene's live
 * array; that is the only enrolment there is.
 *
 * WHAT IS DELIBERATELY PLACEHOLDER. The foyer centrepiece. The brief says the
 * final object in the middle of that hall is undecided, so this wrecks
 * WHATEVER THE BASE HOUSE IS STANDING THERE -- found by footprint, not by name
 * -- and puts its own rubble on the `siege.centrepiece` anchor. When the
 * overview settles the centrepiece, nothing here needs editing.
 *
 * ONE NOTE FOR WHOEVER WIRES THE COMPOSITION ROOT. Every practical light here
 * is parented INSIDE its own toggled group, so a fire that is not burning
 * cannot light the room -- but that also means the renderer stops counting it
 * when the group hides, and `main.js`'s light rig holds its visible count
 * CONSTANT precisely so three.js does not recompile every material. The two
 * only disagree in a state where the `battle` layer is dark, which the siege
 * scene never enters (the mission applies `under_attack` on its first frame).
 * If some future scene does run this dressing in `clean`, expect one shader
 * recompile per state change and decide there, not here.
 *
 * THE THREE THINGS THIS FILE IS NOT ALLOWED TO DO
 *   1. block the walk from the front door to either stair flight (FOYER_ROUTE)
 *   2. block the cellar corridor's walking lane (CORRIDOR_NAV)
 *   3. let smoke below SMOKE_FLOOR_CLEARANCE, where it would hide a man
 * All three are asserted in tests/mansion-siege-dressing.test.mjs.
 */
import * as THREE from 'three';

import {
  mat, box, boxFrom, cylinder, sphere, collider, group,
} from '../../world/build.js';
import { makeCar, makeVehicleCollider } from '../../bing/vehicles.js';
/* `HeistFigure` is the shared rig over `makePerson` from bing/cast.js -- the
 * same builder the whole campaign's cast comes off -- and it is what already
 * knows how a body goes down and STAYS down: `fallen()` tips on the figure's
 * own lateral axis so a man lies along the way he was facing, and `_settle()`
 * measures the posed figure and puts its lowest point exactly on the surface,
 * which is the difference between a corpse on a couch and a corpse inside a
 * couch. Nothing here re-derives a proportion. */
import { HeistFigure } from '../../heist/people.js';
import { DeathBloodPool } from '../../world/blood.js';
import {
  GROUND_Y, BASEMENT_Y, UPPER_Y, BUILDING, CELLAR_HALL,
  COURT_CENTRE, COURT_RADIUS, FRONT_DOOR,
} from '../scenes/MansionGrounds.js';
import {
  FOYER, GALLERY, OFFICE, STAIR_WEST, STAIR_EAST, CHANDELIER_POS,
} from '../scenes/MansionInterior.js';

const GY = GROUND_Y;   // 1.2
const BY = BASEMENT_Y; // -2.8
const UY = UPPER_Y;    // 6.0

/* ================================================================== */
/* The three constraints, as numbers                                    */
/* ================================================================== */

/**
 * The cellar corridor's walking lane.
 *
 * The corridor is 3.1 m deep (z 64.3..67.4) and the BASE house already pinches
 * it: the bench outside the theatre stands proud to z=64.90, and brick piers
 * eat 0.44 m off both long walls. This lane is what is left down the middle,
 * measured from that bench's own front face -- so "off the navigation line"
 * means the same thing for the siege's furniture as it already did for the
 * house's. 1.60 m clear, for a player of radius 0.30.
 */
export const CORRIDOR_NAV = Object.freeze({
  x0: CELLAR_HALL.x0, x1: CELLAR_HALL.x1, z0: 64.90, z1: 66.40,
});

/**
 * The two walks the foyer's dressing is kept off: front door to the foot of
 * each flight. Written as segments rather than a rectangle because the space
 * between them -- the middle of the hall, under the chandelier -- is exactly
 * where the base house already stands its centrepiece and where the siege
 * puts the wreckage of it.
 */
export const FOYER_ROUTE = Object.freeze([
  Object.freeze({
    id: 'door-to-west-flight',
    from: Object.freeze({ x: FRONT_DOOR.x, z: BUILDING.z0 + 0.6 }),
    to: Object.freeze({ x: (STAIR_WEST.x0 + STAIR_WEST.x1) / 2, z: STAIR_WEST.z0 - 0.6 }),
  }),
  Object.freeze({
    id: 'door-to-east-flight',
    from: Object.freeze({ x: FRONT_DOOR.x, z: BUILDING.z0 + 0.6 }),
    to: Object.freeze({ x: (STAIR_EAST.x0 + STAIR_EAST.x1) / 2, z: STAIR_EAST.z0 - 0.6 }),
  }),
]);
/** How wide a corridor each of those walks must keep. Player radius is 0.30. */
export const ROUTE_HALF_WIDTH = 0.85;

/**
 * The lowest any smoke this module makes is allowed to hang, above the floor
 * of the room it is in.
 *
 * The brief is explicit: smoke must not hide enemies, fill the house or cover
 * objective markers. An attacker tops out around 1.9 m and the player's eye is
 * at 1.66, so a ceiling layer whose underside is 2.6 m up can never be between
 * the two. Fire columns are exempt for their first metre -- smoke does come off
 * a fire at the fire -- and are kept to FIRE_SMOKE_RADIUS instead.
 */
export const SMOKE_FLOOR_CLEARANCE = 2.6;
/** No fire's smoke column is wider than this, so it is a column and not a fog. */
export const FIRE_SMOKE_RADIUS = 0.95;
/** No smoke this module draws is ever more opaque than this. */
export const SMOKE_MAX_OPACITY = 0.30;
/** Ceiling-layer slab thickness, and how far one drifts up and down. */
const SLAB_T = 0.26;
const SLAB_DRIFT = 0.06;

/**
 * The anchor the wrecked foyer centrepiece is built on.
 *
 * PENDING THE MANSION OVERVIEW. `docs/MANSION-SIEGE-NIGHT.md` PART XIV already
 * carries the row -- "Give the foyer centrepiece a named anchor", marked *now,
 * cheap* -- and until the base house exports one, this is it. The identity of
 * the object that stands here is NOT decided: today the house puts a gilded
 * centre table with a flower arrangement on the compass inlay, and the siege
 * shows whatever is there broken. Nothing below names a table.
 */
export const SIEGE_ANCHORS = Object.freeze({
  centrepiece: Object.freeze({ x: 0, y: GY, z: CHANDELIER_POS.z }),
  foyerFire: Object.freeze({ x: 7.85, y: GY, z: 37.9 }),
  cellarBody: Object.freeze({ x: -0.81, y: BY, z: 66.945 }),
  foyerBody: Object.freeze({ x: -7.25, y: GY, z: 38.6 }),
});

/** How far out from the centrepiece anchor counts as "standing on it". */
const CENTREPIECE_RADIUS = 1.5;

/**
 * Where the bottom of a box ends up once you tip it about Z.
 *
 * THE FAULT THIS EXISTS TO STOP, found by `tools/scene-audit.mjs`: seven
 * centrepiece fragments and two console legs were placed at
 * `y = floor + height / 2` and then given a `rotZ`, which is the position of
 * an UNROTATED box. Tipping it swings a corner down, so the piece ends up 5
 * to 13 cm under the marble -- rubble half-buried in a floor it was supposed
 * to have been thrown across. Every one of them read as FLOATING to the audit
 * for the same reason it read as wrong on screen: nothing was holding it up,
 * because the floor was above its lowest point rather than under it.
 *
 * A box of width `w` and height `h` tipped by `a` about Z has a half-height of
 * `(|w sin a| + |h cos a|) / 2`. Put the centre that far above the floor and
 * the lowest corner lands exactly on it.
 */
export function tippedRestY(floorY, w, h, angle) {
  const half = (Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle))) / 2;
  return floorY + half;
}

/** Seat an arbitrarily rotated mesh on a horizontal floor using the same
 * transformed local AABB that the geometry gate audits. */
function restMeshOnFloor(mesh, floorY) {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  mesh.updateMatrix();
  const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
  mesh.position.y += floorY - bounds.min.y;
  return mesh;
}

/* ================================================================== */
/* Palette                                                              */
/* ================================================================== */
const M_SOOT = mat({ color: 0x14120f, roughness: 0.98 });
const M_CHAR = mat({ color: 0x241f19, roughness: 0.95 });
const M_ASH = mat({ color: 0x4a463f, roughness: 1 });
const M_SCORCH = mat({ color: 0x2b2119, roughness: 1 });
const M_RUST = mat({ color: 0x5a3a24, roughness: 0.95 });
const M_STEEL = mat({ color: 0x6b6d74, roughness: 0.55, metalness: 0.7 });
/* Local safety enamel for the rail practical. The clamp stays bare steel so
 * its support reads honestly; only the post and housing get the high-value
 * coat that separates them from the brass baluster behind the fixture. */
const M_WORKLAMP_SAFETY = mat({ color: 0xffb31a, roughness: 0.72, metalness: 0.12 });
const M_BRASS = mat({ color: 0xb08b3a, roughness: 0.35, metalness: 0.85 });
const M_GLASSY = mat({
  color: 0x9fc4d2, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.55,
});
const M_BLOOD = mat({ color: 0x4a0d10, roughness: 0.55 });
const M_BLOOD_DRY = mat({ color: 0x33090c, roughness: 0.85 });
const M_PLASTER = mat({ color: 0xd8d2c2, roughness: 0.98 });
const M_DUST = mat({
  color: 0xbdb6a4, roughness: 1, transparent: true, opacity: 0.22, depthWrite: false,
});
const M_MARBLE_BROKEN = mat({ color: 0xdcd6c8, roughness: 0.62 });
const M_WOOD_SPLIT = mat({ color: 0x53381f, roughness: 0.92 });
const M_FABRIC_BURNT = mat({ color: 0x3a2b22, roughness: 0.98 });
const M_UPHOLSTERY = mat({ color: 0x3d3a46, roughness: 0.95 });
const M_RADIO = mat({ color: 0x1c1e22, roughness: 0.8 });
const M_LED = mat({ color: 0x000000, emissive: 0x2ad06a, emissiveIntensity: 2.4, roughness: 1 });
const M_PAPER = mat({ color: 0xd8d1b9, roughness: 0.96 });
const M_MARKER_RED = mat({ color: 0x8e2523, roughness: 0.9 });
const M_MARKER_BLUE = mat({ color: 0x274f78, roughness: 0.9 });
const M_MEDICAL = mat({ color: 0xe4e1d8, roughness: 0.96 });
/* The foyer centre table's arrangement, spilled. The same colours the base
 * house grows them in -- MansionInterior's foyer blooms -- so the wreck is
 * recognisably the corpse of the thing the tour stands here. All opaque. */
const M_BLOOM = mat({ color: 0xf4efe2, roughness: 0.8 });
const M_BLOOM_GOLD = mat({ color: 0xe0b448, roughness: 0.7 });
const M_LEAF = mat({ color: 0x2c5f37, roughness: 0.95 });

/* Fire is the one place a material gets mutated per frame, so every flame and
 * every puff gets its OWN material (`unique: true`). build.js shares materials
 * by default and the note there is explicit: clone or opt out before you write
 * to one at runtime, or a flicker on one car flickers every car in the scene. */
const flameMaterial = (colour, intensity) => mat({
  color: 0x000000, emissive: colour, emissiveIntensity: intensity, roughness: 1, unique: true,
});
const smokeMaterial = (colour, opacity) => mat({
  color: colour, roughness: 1, transparent: true, opacity, depthWrite: false, unique: true,
});

/* ================================================================== */
/* Small helpers                                                        */
/* ================================================================== */

/**
 * `cylinder()` and `sphere()` in world/build.js silently DROP the `name`
 * option -- only `box()` keeps it -- and unnamed geometry is geometry no
 * verifier can ever assert. Everything round in this file goes through here.
 */
function named(mesh, name) {
  mesh.name = name;
  return mesh;
}

/**
 * Name everything a shared factory left anonymous.
 *
 * `makeCar` and `makePerson` both emit a lot of geometry through `cylinder()`
 * and `sphere()`, which drop names, and through `box({ name: undefined })`.
 * That is fine where they are used; it is not fine here, because an unnamed
 * mesh is a mesh no verifier can ever assert on and the scene sweep counts
 * them. Purely additive -- nothing is moved, only labelled.
 */
function nameSubtree(node, prefix) {
  let n = 0;
  node.traverse((o) => {
    if (o.isMesh && !o.name) { o.name = `${prefix}.part.${n}`; n += 1; }
  });
  return n;
}

/**
 * The yaw that lays a `fallen()` figure along a chosen world heading.
 *
 * `HeistFigure.fallen()` tips the body about its own lateral axis AND rolls
 * it, and the roll swings the long axis off the heading you asked for. Give a
 * man on a corridor couch the obvious yaw and he ends up lying diagonally with
 * his boots in the walking lane -- measured, at 1.18 m inside CORRIDOR_NAV.
 * So solve for it: the posed body axis in the figure's own frame is
 * (-sin roll, ., cos roll * sin TIP), and a root yaw of `heading - atan2(bx,
 * bz)` swings that onto the heading. `heading` is THREE's own convention,
 * measured from +Z toward +X.
 */
const FALLEN_TIP = Math.PI / 2 - 0.12; // HeistFigure.fallen()'s own tip
export function fallenYaw(roll, heading) {
  const bx = -Math.sin(roll);
  const bz = Math.cos(roll) * Math.sin(FALLEN_TIP);
  return heading - Math.atan2(bx, bz);
}

/**
 * Put a re-posed figure back on its surface.
 *
 * `HeistFigure.fallen()` ends with its own settle, which measures the posed
 * body and lifts it so the lowest point lands exactly on `baseY` -- that is
 * what stops a body lying half inside the marble. Move a limb AFTERWARDS and
 * that measurement is stale, so this repeats it. Same arithmetic, spelled out
 * here rather than reaching into the figure's private one.
 */
function resettle(figure, y) {
  figure.tilt.position.y = 0;
  figure.root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(figure.root);
  if (Number.isFinite(b.min.y)) figure.tilt.position.y = y - b.min.y;
  figure.root.updateMatrixWorld(true);
  return figure;
}

/**
 * Withdraw a collider the BASE house already enrolled, so the overlay can own
 * it instead.
 *
 * This exists because `damage.suppress()` PUSHES its colliders on registration
 * (in `clean` a suppressed entry is live, because the thing it suppresses is
 * standing). Hand it a box that is already in the scene's array and the array
 * now holds that box twice; suppressing it later splices ONE of them out and
 * leaves the other behind. That is invisible glass you cannot walk through --
 * the exact fault the overlay was written to make impossible -- arriving by the
 * back door. So: take it out first, then let the overlay put it back.
 *
 * Identity, not geometry: the caller has the real Box3 instance.
 *
 * @returns {boolean} whether the box was found in any of the arrays
 */
export function takeBaseCollider(target, ...arrays) {
  let taken = false;
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    const at = arr.indexOf(target);
    if (at >= 0) { arr.splice(at, 1); taken = true; }
  }
  return taken;
}

/** True when `point` is inside `box` in x/z, ignoring height. */
export function boxCoversXZ(b, x, z, pad = 0) {
  return x >= b.min.x - pad && x <= b.max.x + pad && z >= b.min.z - pad && z <= b.max.z + pad;
}

/* ================================================================== */

/* GEOMETRY_GATE_SIEGE_DRESSING_JOIN: exact wreck, bag, barricade, worklamp and damage-dressing contacts intentionally meet only their authored paving, rail or support face. */
export function buildSiegeDressing({
  damage, grounds, interior, smokeSystem = null, registerLight = null,
} = {}) {
  if (!damage) throw new Error('buildSiegeDressing needs the damage-state overlay');

  const root = new THREE.Group();
  root.name = 'MansionSiegeDressing';
  function geometryIntent(object, policy) {
    object.userData.geometryGate = { ...(object.userData.geometryGate ?? {}), ...policy };
    return object;
  }
  /** Every Box3 this module builds. Accounting only -- see the file header. */
  const colliders = [];
  /** Fires that need a flicker every frame. */
  const fires = [];
  /** Smoke columns and ceiling layers that need a drift every frame. */
  const smokes = [];
  const lights = [];

  const liveColliders = damage.colliders;
  const baseArrays = [liveColliders, grounds?.colliders, interior?.colliders];

  let time = 0;
  const sharedSmokeOrigin = new THREE.Vector3();
  const sharedSmokeUp = new THREE.Vector3(0, 1, 0);

  /** Add a group to the overlay AND to the scene graph, in one place. */
  function enrol(name, node, { boxes = [], layers = ['battle'] } = {}) {
    root.add(node);
    for (const b of boxes) colliders.push(b);
    damage.group(name, { object: node, colliders: boxes, layers });
    return node;
  }

  function addLight(light) {
    lights.push(light);
    registerLight?.(light);
    return light;
  }

  /** A collider from min/max corners, pushed nowhere -- the caller enrols it. */
  const hull = (x0, y0, z0, x1, y1, z1) => collider(
    [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
    [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
  );

  /* ---------------------------------------------------------------- */
  /* Fire and smoke                                                     */
  /*                                                                     */
  /* The runtime receives the canonical pooled SmokeSystem used elsewhere */
  /* in the campaign. Headless tests may omit it, in which case the bounded */
  /* mesh columns below remain as a deterministic fallback. A fire here is */
  /* a handful of emissive lumps that breathe, one point light that        */
  /* flickers, and either pooled billboards or a small recycled column.    */
  /* ---------------------------------------------------------------- */

  /**
   * A smoke column. Bounded on purpose: `radius` is capped at
   * FIRE_SMOKE_RADIUS, the puffs never exceed SMOKE_MAX_OPACITY, and the whole
   * thing is `count` spheres and nothing else.
   */
  function smokeColumn({
    x, y, z, name, count = 6, radius = 0.5, rise = 2.6, rate = 0.16, colour = 0x2b2924,
    peak = 0.24,
  }) {
    const r = Math.min(radius, FIRE_SMOKE_RADIUS);
    const g = group(name);
    const puffs = [];
    for (let i = 0; i < count; i++) {
      const material = smokeMaterial(colour, 0);
      const mesh = geometryIntent(named(sphere({
        r: r * 0.55, pos: [0, 0, 0], mat: material, cast: false, receive: false,
      }), `${name}.puff.${i}`), { overlap: false, checkSupport: false });
      g.add(mesh);
      puffs.push({
        mesh,
        material,
        t: i / count,
        drift: ((i * 37) % 100) / 100 - 0.5,
        seed: i * 1.7,
      });
    }
    g.position.set(x, y, z);
    const column = {
      group: g,
      puffs,
      peak: Math.min(peak, SMOKE_MAX_OPACITY),
      radius: r,
      rise,
      rate,
      tick(dt, t) {
        for (const p of this.puffs) {
          p.t += dt * rate;
          if (p.t >= 1) p.t -= 1;
          const k = p.t;
          const sway = Math.sin(t * 0.6 + p.seed) * this.radius * 0.45;
          p.mesh.position.set(
            sway + p.drift * this.radius * k * 1.4,
            k * this.rise,
            Math.cos(t * 0.5 + p.seed) * this.radius * 0.35,
          );
          /* sphere() writes the radius into mesh.scale, so this REPLACES the
           * size rather than multiplying it -- which is what is wanted here
           * and is a trap everywhere else (docs/ENGINE-TRAPS.md). */
          const s = this.radius * (0.35 + k * 0.85);
          p.mesh.scale.set(s, s, s);
          /* Fade in over the first fifth, out over the last half, so nothing
           * pops into existence at the base of the column. */
          p.material.opacity = this.peak * Math.min(1, k * 5) * (1 - k) ** 0.8;
        }
      },
    };
    smokes.push(column);
    return column;
  }

  /**
   * A fire: lumps of flame, a flickering light, and a column of smoke.
   *
   * `scale` is roughly the flame's height in metres. Everything is authored
   * about the fire's own origin so the group can be positioned once.
   */
  function makeFire({
    x, y, z, name, scale = 1, colour = 0xff8a2c, intensity = 9, range = 12, smoke = true,
  }) {
    const g = group(name);
    const lumps = [];
    const LUMP = [
      { x: 0, y: 0.30, z: 0, r: 0.34, c: 0xffb648, i: 3.0 },
      { x: 0.18, y: 0.58, z: -0.10, r: 0.24, c: 0xff8a2c, i: 2.6 },
      { x: -0.16, y: 0.62, z: 0.12, r: 0.22, c: 0xff7420, i: 2.4 },
      { x: 0.04, y: 0.92, z: 0.02, r: 0.17, c: 0xf05a18, i: 2.0 },
      { x: -0.06, y: 1.18, z: -0.04, r: 0.11, c: 0xd8461a, i: 1.6 },
    ];
    LUMP.forEach((l, i) => {
      const material = flameMaterial(l.c, l.i);
      const mesh = geometryIntent(named(sphere({
        r: l.r * scale,
        pos: [l.x * scale, l.y * scale, l.z * scale],
        mat: material,
        cast: false,
        receive: false,
      }), `${name}.flame.${i}`), { overlap: false });
      g.add(mesh);
      lumps.push({
        mesh, material, base: l.r * scale, baseIntensity: l.i, seed: i * 2.31,
      });
    });
    /* The bed the flame sits on: charred whatever-it-was, so the fire is
     * consuming something rather than burning in mid-air. */
    g.add(box({
      name: `${name}.embers`,
      size: [0.9 * scale, 0.06, 0.9 * scale],
      pos: [0, 0.03, 0],
      mat: M_CHAR,
      cast: false,
    }));

    const light = addLight(new THREE.PointLight(colour, intensity, range, 2));
    light.position.set(0, 0.7 * scale, 0);
    g.add(light);

    let column = null;
    if (smoke) {
      column = smokeColumn({
        x: 0,
        y: 1.1 * scale,
        z: 0,
        name: `${name}.smoke`,
        count: 6,
        radius: Math.min(0.42 * scale + 0.18, FIRE_SMOKE_RADIUS),
        rise: 2.2 * scale,
        rate: 0.17,
        peak: 0.22,
      });
      /* Browser scenes use the campaign's canonical pooled billboard smoke.
       * The bounded mesh column stays as the headless/test fallback only. */
      if (smokeSystem) column.group.visible = false;
      g.add(column.group);
    }

    g.position.set(x, y, z);
    const fire = {
      group: g,
      light,
      lumps,
      smoke: column,
      baseIntensity: intensity,
      seed: fires.length * 3.7,
      sharedClock: 0,
      smokeHeight: 1.05 * scale,
      tick(dt, t, emitShared = false) {
        /* Two sines of different periods, so the flicker never finds a beat.
         * The same trick the grounds' tiki torches use. */
        const flick = 0.72 + 0.28 * Math.sin(t * 9.1 + this.seed) * Math.sin(t * 3.3 + this.seed * 2);
        this.light.intensity = this.baseIntensity * flick;
        for (const l of this.lumps) {
          const k = 0.82 + 0.30 * Math.sin(t * (7 + l.seed) + l.seed * 3);
          const s = l.base * k;
          l.mesh.scale.set(s, s * 1.15, s);
          l.material.emissiveIntensity = l.baseIntensity * (0.7 + 0.45 * k);
        }
        if (emitShared && smokeSystem) {
          this.sharedClock -= dt;
          if (this.sharedClock <= 0) {
            this.sharedClock += 0.34;
            this.group.getWorldPosition(sharedSmokeOrigin);
            sharedSmokeOrigin.y += this.smokeHeight;
            smokeSystem.emit(sharedSmokeOrigin, sharedSmokeUp, {
              count: 2,
              speed: 0.18,
              spread: 0.28,
              size0: 0.16,
              size1: 1.2,
              life: 3.2,
              peak: 0.14,
              rise: 0.34,
            });
          }
        }
      },
    };
    fires.push(fire);
    return fire;
  }

  /**
   * A flat layer of smoke gathered under a ceiling.
   *
   * Never below SMOKE_FLOOR_CLEARANCE over its room's floor, never more opaque
   * than SMOKE_MAX_OPACITY, and it does not move enough to read as weather. It
   * is there to say the house is burning somewhere, not to be an effect.
   */
  function ceilingSmoke({
    x, z, floorY, name, w, d, y, layers = 3, colour = 0x2e2b26, peak = 0.14,
  }) {
    const lowest = floorY + SMOKE_FLOOR_CLEARANCE;
    const g = group(name);
    const slabs = [];
    for (let i = 0; i < layers; i++) {
      const material = smokeMaterial(colour, Math.min(peak, SMOKE_MAX_OPACITY) * (1 - i * 0.22));
      /* Clamp the slab's UNDERSIDE, not its centre, and leave room for the
       * drift below -- a layer whose midpoint clears the floor by 2.6 m still
       * hangs its bottom face 13 cm lower, which is how a "bounded" effect
       * ends up in somebody's eyeline. */
      const sy = Math.max(lowest + SLAB_T / 2 + SLAB_DRIFT, y - i * 0.34);
      const mesh = geometryIntent(box({
        name: `${name}.layer.${i}`,
        size: [w * (1 - i * 0.16), SLAB_T, d * (1 - i * 0.16)],
        pos: [0, sy - y, 0],
        mat: material,
        cast: false,
        receive: false,
      }), { overlap: false, checkSupport: false });
      g.add(mesh);
      slabs.push({ mesh, material, seed: i * 2.9, home: sy - y });
    }
    g.position.set(x, y, z);
    const layer = {
      group: g,
      slabs,
      lowestY: lowest,
      tick(dt, t) {
        for (const s of this.slabs) {
          s.mesh.position.x = Math.sin(t * 0.11 + s.seed) * 0.5;
          s.mesh.position.z = Math.cos(t * 0.09 + s.seed) * 0.5;
          s.mesh.position.y = s.home + Math.sin(t * 0.17 + s.seed) * SLAB_DRIFT;
        }
      },
    };
    smokes.push(layer);
    return layer;
  }

  /* ---------------------------------------------------------------- */
  /* Impact marks                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * A burst of rounds in a wall. `axis` is the wall's normal: 'z' for a wall
   * you look at along z, 'x' for one you look at along x.
   *
   * Lifted 12 mm off the surface. A decal AT the surface is the COPLANAR
   * fault -- the black bar that flickers in every doorway of this house until
   * somebody measures it.
   */
  function impacts({
    x, y, z, axis, name, count = 7, spread = 1.1, drop = 0.42, seed = 0,
  }) {
    const g = geometryIntent(group(name), { overlap: false });
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const jitter = ((i * 41 + seed * 17) % 100) / 100 - 0.5;
      const u = (t - 0.5) * spread * 2;
      const v = jitter * drop;
      const pos = axis === 'z' ? [u, v, 0] : [0, v, u];
      g.add(box({
        name: `${name}.pock.${i}`,
        size: axis === 'z' ? [0.11, 0.11, 0.012] : [0.012, 0.11, 0.11],
        pos,
        mat: M_SOOT,
        cast: false,
      }));
      g.add(box({
        name: `${name}.halo.${i}`,
        size: axis === 'z' ? [0.19, 0.19, 0.006] : [0.006, 0.19, 0.19],
        pos: axis === 'z' ? [u, v, -0.004] : [-0.004, v, u],
        mat: M_PLASTER,
        cast: false,
      }));
    }
    g.position.set(x, y, z);
    return g;
  }

  /* ================================================================== */
  /* 1. EXTERIOR VEHICLE WRECKS                                           */
  /*                                                                       */
  /* Believable as parked cars before they were wrecks, which is the brief's */
  /* own phrasing and also PART XIV's "Improve the forecourt vehicle         */
  /* turnaround" row. Two in the turnaround's south lobe -- where a guest      */
  /* leaving in a hurry would have swung -- and three abandoned down the       */
  /* drive with the doors open, which is what a car park looks like after      */
  /* ninety people have run for the gate.                                      */
  /*                                                                            */
  /* Nothing is parked on the arc between the fountain and the front steps.      */
  /* That is the attackers' own walk-in from `court_north` and it is the one     */
  /* piece of the forecourt that has to stay open.                              */
  /* ================================================================== */

  /** The turnaround's paved edge, so a spot can be checked against it. */
  const COURT = { x: COURT_CENTRE.x, z: COURT_CENTRE.z, r: COURT_RADIUS };
  /** Top of the authored driveway pavers; vehicle roots are tyre-contact datums. */
  const DRIVEWAY_SURFACE_Y = 0.05;

  /* Every one of these was measured against the base house's own colliders --
   * the fountain basin, the two cars already parked at (+/-11, 30), the
   * driveway kerbs (which run to z = 22.02) and the four lamp posts standing
   * IN the drive at x = +/-4.6. Nothing here overlaps any of them, and the
   * turnaround's north arc, z 27..34 between the fountain and the front steps,
   * is left completely empty because that is the attackers' walk-in. */
  const WRECK_SPOTS = [
    {
      id: 'burning',
      kind: 'suv',
      colour: 0x241d18,
      /* Park the shell beyond both the r=6 apron and the 0.6 m actor lane,
       * and south of the base motor-court car.  The old -8.75/24.8 datum left
       * no body-width channel between its collider and the fountain. */
      x: -11.5,
      z: 22.0,
      yaw: 0.35,
      condition: 'burning',
      note: 'a guest\'s car, slewed and alight in the turnaround',
    },
    {
      id: 'burnt',
      kind: 'sedan',
      colour: 0x17161a,
      /* Mirror the west-side route-clear datum. */
      x: 11.5,
      z: 22.0,
      yaw: -0.35,
      condition: 'burnt',
      note: 'burnt out and cold -- this one went up before he woke',
    },
    {
      id: 'stalled',
      kind: 'lincoln',
      colour: 0x1d1d24,
      x: 0,
      /* Leave a real standing-capsule bay between this cross-drive wreck and
       * the fountain's r=6 south apron.  At z18.4 its shell reached the only
       * safe spawn strip and every court_north attacker began inside steel. */
      z: 17.0,
      yaw: 0.18,
      condition: 'abandoned',
      note: 'stopped dead in the drive, both doors open',
    },
    {
      id: 'kerbed',
      kind: 'compact',
      colour: 0x2c2f36,
      /* Keep the body visibly over the west verge, but pull the inboard tyre
       * 5 cm off the curb it used to pass through. */
      x: -2.55,
      z: 13.0,
      yaw: -0.42,
      condition: 'abandoned',
      note: 'run off the drive and left running',
    },
    {
      id: 'drive',
      kind: 'sedan',
      colour: 0x33232a,
      x: 2.9,
      z: 12.4,
      /* Local +X is the bonnet. The old 0.10 rad yaw laid this 5 m sedan
       * broadside across the drive, through the east curb, hedge bed and four
       * flowers despite describing it as nose-to-gate. */
      yaw: Math.PI / 2,
      condition: 'abandoned',
      note: 'nose to the gate, driver gone',
    },
  ];

  const wrecks = {};
  for (const spot of WRECK_SPOTS) {
    const car = makeCar(spot.kind, spot.colour, {
      dented: true,
      spatialId: `mansion-siege.wreck.${spot.id}`,
    });
    car.group.name = `siege.wreck.${spot.id}`;
    car.group.position.set(spot.x, DRIVEWAY_SURFACE_Y, spot.z);
    car.group.rotation.y = spot.yaw;

    const wrap = geometryIntent(group(`siege.wreck.${spot.id}.group`), {
      assemblyId: `siege-wreck-${spot.id}`,
    });
    wrap.add(car.group);

    /* Damage passes. Materials are ASSIGNED, never mutated: build.js shares a
     * material between every caller that asks for the same one, so recolouring
     * `car.paint` in place would repaint every car on the property. */
    if (spot.condition !== 'abandoned') {
      car.glass.visible = false;
      car.body.material = spot.condition === 'burnt' ? M_SOOT : M_CHAR;
      car.cabin.material = M_SOOT;
      for (const h of car.heads) h.material = M_CHAR;
      for (const t of car.tails) t.material = M_CHAR;
      /* The greenhouse gone, so the silhouette reads as a burnt shell and not
       * as a black car: a roof rail and two pillars where the cabin was. */
      const s = car.shape;
      const cabinY = s.wheelR + s.bodyH;
      car.group.add(box({
        name: `siege.wreck.${spot.id}.rail`,
        size: [s.cabinL, 0.07, s.W * 0.92],
        pos: [s.cabinOff, cabinY + s.cabinH - 0.04, 0],
        mat: M_RUST,
      }));
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          car.group.add(box({
            name: `siege.wreck.${spot.id}.pillar`,
            size: [0.08, s.cabinH, 0.08],
            pos: [
              s.cabinOff + sx * (s.cabinL / 2 - 0.08),
              cabinY + s.cabinH / 2,
              sz * (s.W * 0.94 / 2 - 0.06),
            ],
            mat: M_RUST,
          }));
        }
      }
      /* Tyres down on the rims. `cylinder()` writes radius and height into the
       * mesh scale, so this is a fresh short cylinder rather than a squash of
       * the wheel that is already there. */
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          car.group.add(named(cylinder({
            r: s.wheelR * 0.58,
            h: 0.3,
            pos: [sx * (s.L / 2 - 1.1), s.wheelR * 0.58, sz * (s.W / 2 - 0.03)],
            mat: M_STEEL,
            rotX: Math.PI / 2,
          }), `siege.wreck.${spot.id}.rim`));
        }
      }
      /* Scorch on the ground under it, lifted clear of the paving. */
      wrap.add(geometryIntent(box({
        name: `siege.wreck.${spot.id}.scorch`,
        size: [s.L + 2.4, 0.014, s.W + 2.2],
        pos: [spot.x, 0.05, spot.z],
        mat: M_SCORCH,
        cast: false,
      }), { overlap: false }));
    } else {
      /* Abandoned, not wrecked: a door swung open and a bag dropped beside it.
       * The read at thirty metres is "somebody left in a hurry", which is a
       * different sentence from "somebody shot this". */
      const s = car.shape;
      car.group.add(box({
        name: `siege.wreck.${spot.id}.door`,
        size: [0.06, s.bodyH * 0.88, 1.15],
        pos: [s.cabinOff + 0.2, s.wheelR + s.bodyH / 2, -(s.W / 2 + 0.52)],
        mat: car.paint,
        rotY: -0.95,
      }));
      wrap.add(box({
        name: `siege.wreck.${spot.id}.bag`,
        size: [0.46, 0.26, 0.3],
        pos: [spot.x - Math.sin(spot.yaw) * 1.2, DRIVEWAY_SURFACE_Y + 0.13, spot.z - Math.cos(spot.yaw) * 1.2],
        mat: M_FABRIC_BURNT,
        rotY: spot.yaw + 0.4,
      }));
    }

    const hullBox = makeVehicleCollider(car);
    // makeVehicleCollider intentionally derives only X/Z from the car transform.
    hullBox.translate(new THREE.Vector3(0, DRIVEWAY_SURFACE_Y, 0));
    const entry = {
      id: spot.id,
      spot,
      car,
      group: wrap,
      collider: hullBox,
      fire: null,
      note: spot.note,
      /** True while this car's own paved footprint is inside the turnaround. */
      inCourt: Math.hypot(spot.x - COURT.x, spot.z - COURT.z) <= COURT.r,
    };

    if (spot.condition === 'burning') {
      const s = car.shape;
      entry.fire = makeFire({
        x: spot.x + Math.cos(spot.yaw) * 1.1,
        y: DRIVEWAY_SURFACE_Y + s.wheelR + s.bodyH - 0.1,
        z: spot.z - Math.sin(spot.yaw) * 1.1,
        name: `siege.fire.wreck.${spot.id}`,
        scale: 1.5,
        intensity: 16,
        range: 18,
      });
      wrap.add(entry.fire.group);
    }

    nameSubtree(wrap, `siege.wreck.${spot.id}`);
    enrol(`siege.wreck.${spot.id}`, wrap, { boxes: [hullBox] });
    wrecks[spot.id] = entry;
  }

  /* ================================================================== */
  /* 2. THE FOYER FIRE                                                    */
  /*                                                                       */
  /* One manageable fire near the front entrance: the east end of the       */
  /* entrance glazing, where a drape has come down across a console table   */
  /* that is now on its side. Movement, light, smoke.                       */
  /*                                                                        */
  /* WHERE IT IS NOT. Not on the walk from the front door to either flight   */
  /* (FOYER_ROUTE): it stands in the south-east pocket of the hall, past the */
  /* base house's own statue at x=5.6 and hard against the x=8.85 partition. */
  /* There is no extinguisher mechanic and it never spreads.                 */
  /* ================================================================== */
  const foyerFireGroup = geometryIntent(group('siege.fire.foyer'), {
    assemblyId: 'siege-fire-foyer',
  });
  {
    const a = SIEGE_ANCHORS.foyerFire;
    /* The console, on its side, one leg snapped. */
    foyerFireGroup.add(box({
      name: 'siege.fire.foyer.console',
      size: [0.52, 1.35, 0.42],
      pos: [a.x, GY + 0.27, a.z],
      mat: M_WOOD_SPLIT,
      rotZ: Math.PI / 2,
      rotY: 0.22,
    }));
    /* Two snapped legs, lying where they went. `tippedRestY` puts the low
     * corner of each ON the marble; the authored `GY + 0.16` put it 13 cm
     * UNDER it, which is a table leg growing out of the floor. */
    for (const [lx, lz, tip] of [[-0.3, 0.5, 0.5], [0.34, -0.44, -0.7]]) {
      foyerFireGroup.add(box({
        name: 'siege.fire.foyer.leg',
        size: [0.07, 0.62, 0.07],
        pos: [a.x + lx, tippedRestY(GY, 0.07, 0.62, tip), a.z + lz],
        mat: M_WOOD_SPLIT,
        rotZ: tip,
      }));
    }
    /* The drape that brought it down, half burnt away. */
    foyerFireGroup.add(box({
      name: 'siege.fire.foyer.drape',
      size: [0.1, 2.1, 1.5],
      pos: [FOYER.x1 - 0.22, GY + 1.6, a.z + 0.35],
      mat: M_FABRIC_BURNT,
      rotZ: 0.07,
    }));
    foyerFireGroup.add(box({
      name: 'siege.fire.foyer.drape.fallen',
      size: [1.3, 0.09, 1.7],
      pos: [a.x + 0.2, GY + 0.05, a.z + 0.2],
      mat: M_FABRIC_BURNT,
      cast: false,
    }));
    foyerFireGroup.add(geometryIntent(box({
      name: 'siege.fire.foyer.scorch',
      size: [2.4, 0.012, 2.6],
      pos: [a.x, GY + 0.035, a.z],
      mat: M_SCORCH,
      cast: false,
    }), { overlap: false }));
    /* Soot fanning up the partition above it. */
    foyerFireGroup.add(geometryIntent(box({
      name: 'siege.fire.foyer.soot',
      size: [0.012, 2.6, 2.0],
      pos: [FOYER.x1 - 0.012, GY + 2.2, a.z + 0.1],
      mat: M_SOOT,
      cast: false,
    }), { overlap: false }));
    const fire = makeFire({
      x: a.x,
      y: GY + 0.05,
      z: a.z,
      name: 'siege.fire.foyer.flame',
      scale: 1.05,
      intensity: 11,
      range: 13,
    });
    foyerFireGroup.add(fire.group);
    /* A shallow hull, so a body can take cover behind the console without the
     * fire itself becoming a wall. 1.0 m tall, and it stops 0.75 m short of
     * FOYER_ROUTE's east edge. */
    const fireBox = hull(a.x - 0.95, GY, a.z - 0.95, a.x + 0.95, GY + 1.0, a.z + 0.95);
    enrol('siege.fire.foyer', foyerFireGroup, { boxes: [fireBox] });
  }

  /* ================================================================== */
  /* 3. THE DESTROYED FOYER CENTREPIECE                                   */
  /*                                                                       */
  /* IDENTITY PENDING. The brief says the final object in the middle of      */
  /* this hall is undecided and PART XIV carries the row that gives it a     */
  /* real anchor. Until then the siege does two things and names neither of  */
  /* them a table:                                                           */
  /*                                                                          */
  /*   (a) suppresses WHATEVER THE BASE HOUSE STANDS on `siege.centrepiece`,  */
  /*       found by sweeping the interior's own children for anything inside  */
  /*       CENTREPIECE_RADIUS of the anchor and above the floor inlay. If the  */
  /*       overview replaces the table with a fountain, a plinth or a statue,   */
  /*       this suppresses that instead and nothing here needs editing.         */
  /*   (b) builds the wreck OF THAT OBJECT on the anchor -- the tipped top,    */
  /*       sheared pedestal, spilled urn and blooms, all opaque -- plus a       */
  /*       PARTIAL cover volume (1.05 m: crouch cover, not a wall) and impact   */
  /*       marks. See the block below for the "ghost bubble" playtest note.     */
  /* ================================================================== */
  const centrepiece = { suppressed: [], colliderTaken: false, fragments: null };
  {
    const a = SIEGE_ANCHORS.centrepiece;
    /* (a) Whatever is standing there now. `position` is the child's own local
     * transform and the interior parents everything either flat to its root
     * or one level down in a room-visibility group (an identity transform
     * directly under the root -- see the ROOM / PORTAL VISIBILITY section of
     * MansionInterior.js), so this is a world sweep in practice; the y floor
     * keeps the compass inlay, its gold rings and the floor topping -- all of
     * which are decals at or below GY+0.035 -- out of it, because a wrecked
     * centrepiece does not take the floor with it. */
    const standing = [];
    const sweepTop = [];
    for (const child of interior?.root?.children ?? []) {
      if (child.isGroup && child.name.startsWith('roomVisibility:')) {
        sweepTop.push(...child.children);
      } else {
        sweepTop.push(child);
      }
    }
    for (const child of sweepTop) {
      if (!child.isMesh) continue;
      const p = child.position;
      if (p.y <= GY + 0.04 || p.y >= GY + 2.9) continue;
      if (Math.hypot(p.x - a.x, p.z - a.z) >= CENTREPIECE_RADIUS) continue;
      standing.push(child);
    }
    centrepiece.suppressed = standing;
    /* One duck-typed object standing in for all of them: state.js only ever
     * writes `.visible`, so a fan-out is a legal object. */
    const standingProxy = {
      _visible: true,
      get visible() { return this._visible; },
      set visible(v) {
        this._visible = v;
        for (const m of standing) m.visible = v;
      },
    };
    /* Its collider, if it has one. Found by footprint rather than by name, for
     * the same reason as the meshes. */
    let standingBox = null;
    for (const b of interior?.colliders ?? []) {
      const c = b.getCenter(new THREE.Vector3());
      if (Math.hypot(c.x - a.x, c.z - a.z) > 0.6) continue;
      if (b.min.y > GY + 0.2 || b.max.y > GY + 3) continue;
      standingBox = b;
      break;
    }
    if (standingBox) {
      centrepiece.colliderTaken = takeBaseCollider(standingBox, ...baseArrays);
    }
    damage.suppress('siege.centrepiece.intact', {
      object: standingProxy,
      collider: standingBox,
      layers: ['battle'],
    });

    /* (b) The wreckage -- and it is the wreckage OF THE TABLE THE TOUR
     * STANDS HERE, not anonymous rubble. Owner, playtest 2026-08-13: *"main
     * centerpiece in foyer is just like a ghost bubble not sure what thats
     * supposed to look like"* -- what he was looking at was the old dust
     * ellipsoid: three metres of translucent haze hanging at chest height
     * over fragments too small to read, the biggest and brightest thing on
     * the anchor. The base house stands a round gilded centre table here
     * (marble top, wooden pedestal, gold urn, a dome of blooms), so the
     * wreck is now that object knocked over: the marble top tipped against
     * the sheared pedestal, the urn on its side, the arrangement spilled
     * across the inlay. Every material is opaque; the only dust left is a
     * knee-high skirt over the debris, where dust actually settles. */
    const g = geometryIntent(group('siege.centrepiece.wreck'), {
      assemblyId: 'siege-centrepiece-wreck',
    });
    /* The pedestal's marble base, still seated on the inlay. */
    g.add(named(cylinder({
      rTop: 0.62, rBottom: 0.78, h: 0.12, pos: [a.x, GY + 0.06, a.z], mat: M_MARBLE_BROKEN,
    }), 'siege.centrepiece.base'));
    /* The wooden column, sheared off at the knee... */
    g.add(named(cylinder({
      rTop: 0.3, rBottom: 0.42, h: 0.34, pos: [a.x, GY + 0.29, a.z], mat: M_WOOD_SPLIT,
    }), 'siege.centrepiece.stump'));
    /* ...with the rest of it thrown down beside the base. */
    const fallenColumn = named(cylinder({
      rTop: 0.28, rBottom: 0.3, h: 0.42,
      pos: [a.x + 0.62, GY + 0.16, a.z - 0.72], mat: M_WOOD_SPLIT,
      rotZ: Math.PI / 2 - 0.12, rotY: 0.5,
    }), 'siege.centrepiece.column');
    g.add(restMeshOnFloor(fallenColumn, GY));
    /* THE TABLETOP: the 2.7 m marble disc slid off and tipped, one rim on
     * the floor, the other resting across the pedestal's base. It stays
     * inside the crouch-cover line and (near enough) the cover collider's
     * footprint. This is the piece that names the wreck -- one look says
     * "that was the table". */
    const fallenTop = named(cylinder({
      r: 1.35, h: 0.09, pos: [a.x + 0.15, GY + 0.3, a.z + 0.55],
      mat: M_MARBLE_BROKEN, rotZ: 0.26, rotY: 0.3, seg: 28,
    }), 'siege.centrepiece.top');
    g.add(restMeshOnFloor(fallenTop, GY));
    /* The urn, on its side where it rolled, mouth toward the door. */
    const fallenUrn = named(cylinder({
      rTop: 0.34, rBottom: 0.2, h: 0.44,
      pos: [a.x - 1.02, GY + 0.28, a.z - 0.58], mat: M_BRASS,
      rotZ: Math.PI / 2 - 0.08, rotY: 0.35,
    }), 'siege.centrepiece.urn');
    g.add(restMeshOnFloor(fallenUrn, GY));
    /* The arrangement, spilled out of it: blooms in an arc from the mouth,
     * a few leaves. Deterministic golden-angle scatter, same as it grew. */
    for (let i = 0; i < 12; i++) {
      const ang = 3.6 + i * 2.399963;
      const dist = 0.35 + (i % 5) * 0.22;
      g.add(named(sphere({
        r: 0.055 + (i % 3) * 0.012,
        pos: [
          a.x - 1.02 - 0.35 - Math.abs(Math.cos(ang)) * dist * 0.8,
          GY + 0.07,
          a.z - 0.58 + Math.sin(ang) * dist,
        ],
        mat: i % 6 === 0 ? M_BLOOM_GOLD : M_BLOOM,
        cast: false,
      }), `siege.centrepiece.bloom.${i}`));
    }
    for (let i = 0; i < 4; i++) {
      const ang = 1.1 + i * 1.7;
      g.add(box({
        name: `siege.centrepiece.leaf.${i}`,
        size: [0.035, 0.012, 0.2],
        pos: [a.x - 1.3 - Math.cos(ang) * 0.4, GY + 0.045, a.z - 0.4 + Math.sin(ang) * 0.5],
        mat: M_LEAF,
        rotY: ang,
        cast: false,
      }));
    }
    /* Fragments, thrown out on a ring. Deterministic angles, so a screenshot
     * of this hall is the same screenshot every time. */
    const FRAG = [
      [0.42, 1.55, 0.62, 0.20, 0.34], [1.71, 1.10, 0.48, 0.16, 0.26],
      [2.66, 1.85, 0.74, 0.22, 0.30], [3.51, 1.35, 0.40, 0.13, 0.22],
      [4.30, 2.05, 0.86, 0.18, 0.36], [5.19, 1.20, 0.52, 0.15, 0.24],
      [5.96, 1.72, 0.66, 0.19, 0.28],
    ];
    FRAG.forEach(([ang, dist, w, h, d], i) => {
      const tip = i % 2 ? 0.22 : -0.16;
      g.add(box({
        name: `siege.centrepiece.fragment.${i}`,
        size: [w, h, d],
        /* On the marble, not in it. See `tippedRestY`: `GY + h / 2` is where
         * an UNTIPPED fragment's centre goes, and every one of these is
         * tipped, so all seven were sitting 4 to 7 cm below the floor of the
         * room the player fights his whole first firefight in. */
        pos: [a.x + Math.cos(ang) * dist, tippedRestY(GY, w, h, tip), a.z + Math.sin(ang) * dist],
        mat: i % 3 === 0 ? M_MARBLE_BROKEN : M_WOOD_SPLIT,
        rotY: ang * 1.3,
        rotZ: tip,
      }));
    });
    /* Gilt trim, torn off and lying flat. */
    for (let i = 0; i < 5; i++) {
      const ang = 0.9 + i * 1.21;
      g.add(box({
        name: `siege.centrepiece.trim.${i}`,
        size: [0.62, 0.035, 0.09],
        pos: [a.x + Math.cos(ang) * (1.1 + i * 0.16), GY + 0.04, a.z + Math.sin(ang) * (1.1 + i * 0.16)],
        mat: M_BRASS,
        rotY: -ang,
        cast: false,
      }));
    }
    /* Dust where dust settles: a knee-high skirt over the debris, under the
     * tabletop line. The old version of this was a 3 m translucent ellipsoid
     * at chest height -- the "ghost bubble" itself. */
    const dust = named(sphere({
      r: 1.9, ry: 0.2, rz: 1.9, pos: [a.x, GY + 0.22, a.z], mat: M_DUST, cast: false, receive: false,
    }), 'siege.centrepiece.dust');
    g.add(dust);
    /* Debris ring on the marble. */
    g.add(box({
      name: 'siege.centrepiece.debris',
      size: [4.4, 0.012, 4.4],
      pos: [a.x, GY + 0.04, a.z],
      mat: M_ASH,
      cast: false,
    }));
    /* Impact marks: the burst that did it, still in the west partition behind. */
    g.add(impacts({
      x: FOYER.x0 + 0.02,
      y: GY + 1.35,
      z: a.z - 0.4,
      axis: 'x',
      name: 'siege.centrepiece.impacts',
      count: 6,
      spread: 1.3,
      seed: 3,
    }));

    /* PARTIAL cover. 1.05 m and 2.2 m across: you crouch behind it, you do not
     * hide behind it, and it leaves the whole of FOYER_ROUTE alone because it
     * sits four metres north of the front door on the hall's centre line --
     * which is where the base house already stands its own centrepiece. */
    const coverBox = hull(a.x - 1.1, GY, a.z - 1.1, a.x + 1.1, GY + 1.05, a.z + 1.1);
    centrepiece.fragments = g;
    centrepiece.cover = coverBox;
    enrol('siege.centrepiece.wreck', g, { boxes: [coverBox] });
  }

  /* ================================================================== */
  /* 4. ARCHITECTURAL BATTLE LINE                                         */
  /*                                                                       */
  /* The live review showed a pristine shell behind convincing loose        */
  /* wreckage. This stays a state-layer overlay over the canonical mansion:  */
  /* surface marks stand millimetres proud of real walls/floors, add no      */
  /* collider, and disappear with the battle layer. The sequence follows the */
  /* mission's actual route: facade -> foyer -> gallery -> Lou's office.     */
  /* ================================================================== */
  const architecture = {
    group: group('siege.architecture.damage'),
    zones: {},
    colliders: [],
  };

  function architectureZone(name, populate) {
    const g = group(`siege.architecture.${name}`);
    populate(g);
    let markCount = 0;
    g.traverse((object) => {
      if (!object.isMesh) return;
      markCount += 1;
      /* Each leaf is a decal-like impact or floor scar authored millimetres
       * proud of existing architecture. Keep the exemption leaf-local so a
       * whole route-scale damage overlay can never become gate-invisible. */
      geometryIntent(object, { checkSupport: false, overlap: false });
    });
    architecture.group.add(g);
    const zone = { group: g, markCount };
    architecture.zones[name] = zone;
    return zone;
  }

  architectureZone('facade', (g) => {
    /* Incoming fire walks across both shoulders of the front glazing. The
     * marks stay on the south face and leave the actual door untouched. */
    g.add(impacts({
      x: -5.45, y: GY + 2.8, z: BUILDING.z0 - 0.025,
      axis: 'z', name: 'siege.architecture.facade.west', count: 8, spread: 1.45, seed: 7,
    }));
    g.add(impacts({
      x: 5.25, y: GY + 3.35, z: BUILDING.z0 - 0.025,
      axis: 'z', name: 'siege.architecture.facade.east', count: 7, spread: 1.25, seed: 19,
    }));
  });

  architectureZone('foyer', (g) => {
    /* Crossfire stitched the side walls above head height. The 20 mm
     * standoff keeps each cluster in the room instead of in the partition. */
    g.add(impacts({
      x: FOYER.x0 + 0.02, y: GY + 2.75, z: 40.4,
      axis: 'x', name: 'siege.architecture.foyer.west', count: 8, spread: 1.4, seed: 11,
    }));
    g.add(impacts({
      x: FOYER.x1 - 0.02, y: GY + 3.25, z: 42.1,
      axis: 'x', name: 'siege.architecture.foyer.east', count: 7, spread: 1.25, seed: 23,
    }));
    /* Hairline fractures radiate through the marble around the destroyed
     * centrepiece. Raised 12 mm: visible, non-coplanar and never solid. */
    const cracks = group('siege.architecture.foyer.floor-cracks');
    const CRACKS = [
      [-1.05, 43.85, 1.55, -0.25], [0.85, 44.85, 1.35, 0.42],
      [-0.35, 45.15, 1.05, 1.1], [1.15, 43.7, 0.9, -1.0],
      [-1.45, 44.55, 0.78, 0.62], [0.25, 43.55, 0.7, 1.45],
    ];
    CRACKS.forEach(([x, z, length, yaw], i) => {
      cracks.add(box({
        name: `siege.architecture.foyer.floor-crack.${i}`,
        size: [length, 0.012, 0.025], pos: [x, GY + 0.012, z],
        mat: M_SOOT, rotY: yaw, cast: false,
      }));
    });
    g.add(cracks);
  });

  architectureZone('gallery', (g) => {
    /* High wall strikes read from both the rail and the office approach
     * without entering the player's firing-step sightline. */
    g.add(impacts({
      x: -8.1, y: UY + 2.45, z: GALLERY.z1 - 0.02,
      axis: 'z', name: 'siege.architecture.gallery.west', count: 8, spread: 1.35, seed: 31,
    }));
    g.add(impacts({
      x: 7.7, y: UY + 2.15, z: GALLERY.z1 - 0.02,
      axis: 'z', name: 'siege.architecture.gallery.east', count: 7, spread: 1.2, seed: 43,
    }));
    for (const [x, z, yaw] of [[-4.2, 50.1, 0.22], [4.8, 49.75, -0.35], [1.7, 51.55, 1.1]]) {
      g.add(box({
        name: 'siege.architecture.gallery.floor-scar',
        size: [1.05, 0.012, 0.035], pos: [x, UY + 0.012, z],
        mat: M_SOOT, rotY: yaw, cast: false,
      }));
    }
  });

  architectureZone('office', (g) => {
    /* The people in Lou's room flinch at real impacts; the room now shows
     * where those rounds landed without moving a single base-room object. */
    g.add(impacts({
      x: OFFICE.x0 + 0.02, y: UY + 2.35, z: 67.2,
      axis: 'x', name: 'siege.architecture.office.west', count: 7, spread: 1.15, seed: 53,
    }));
    g.add(impacts({
      x: OFFICE.x1 - 0.02, y: UY + 2.0, z: 71.8,
      axis: 'x', name: 'siege.architecture.office.east', count: 7, spread: 1.05, seed: 67,
    }));
  });

  nameSubtree(architecture.group, 'siege.architecture');
  enrol('siege.architecture.damage', architecture.group);

  /* ================================================================== */
  /* 4a. DEFENCE OPERATIONS                                               */
  /*                                                                       */
  /* The ensemble already performs four jobs -- Lou works the command desk, */
  /* Shubenator runs a radio, Gratin treats a guard and everybody reloads -- */
  /* but the baseline frame gave them no physical equipment to work. These  */
  /* are the props those existing authored performances require, not new     */
  /* story. They are low/profile wall-or-table dressing, add no collider and */
  /* stay out of the gallery's central attacker/player lane.                */
  /* ================================================================== */
  const defenceStations = {
    group: group('siege.stations'),
    zones: {},
    colliders: [],
  };

  function defenceStation(name, role, anchor, populate) {
    const g = geometryIntent(group(`siege.station.${name}`), { assemblyId: `siege-station-${name}` });
    populate(g);
    nameSubtree(g, `siege.station.${name}`);
    let meshCount = 0;
    g.traverse((object) => { if (object.isMesh) meshCount += 1; });
    defenceStations.group.add(g);
    const station = {
      group: g,
      role,
      anchor: Object.freeze({ ...anchor }),
      meshCount,
    };
    defenceStations.zones[name] = station;
    return station;
  }

  defenceStation('officeCommand', 'command', { x: 0, y: UY, z: 71.05 }, (g) => {
    /* A battle map opened across the visitor edge of Lou's existing desk.
     * The centre stays clear for the mission case and nobody gains a new
     * collision volume around a desk that is already solid. */
    for (const [x, z, yaw, material, id] of [
      [-0.58, 71.03, -0.08, M_PAPER, 'west'],
      [0.58, 71.05, 0.1, M_PAPER, 'east'],
    ]) {
      g.add(box({
        name: `siege.station.officeCommand.command-map.${id}`,
        size: [1.0, 0.014, 0.72], pos: [x, UY + 0.855, z], mat: material, rotY: yaw, cast: false,
      }));
    }
    /* Grease-pencil routes and marked contact points make these operational
     * maps rather than two blank sheets. */
    for (const [x, z, length, yaw, material] of [
      [-0.72, 70.95, 0.55, 0.28, M_MARKER_RED],
      [-0.42, 71.18, 0.42, -0.45, M_MARKER_BLUE],
      [0.43, 70.92, 0.5, 0.55, M_MARKER_RED],
      [0.7, 71.18, 0.48, -0.2, M_MARKER_BLUE],
    ]) {
      g.add(box({
        name: 'siege.station.officeCommand.command-route',
        size: [length, 0.008, 0.025], pos: [x, UY + 0.867, z], mat: material, rotY: yaw, cast: false,
      }));
    }
    for (const [i, x, z, material] of [
      [0, -0.8, 71.2, M_MARKER_RED], [1, -0.3, 70.86, M_MARKER_BLUE],
      [2, 0.38, 71.2, M_MARKER_RED], [3, 0.8, 70.9, M_MARKER_BLUE],
    ]) {
      g.add(named(cylinder({
        r: 0.025, h: 0.012, pos: [x, UY + 0.878, z], mat: material, cast: false,
      }), `siege.station.officeCommand.command-marker.${i}`));
    }
  });

  defenceStation('radio', 'radio', { x: -1.85, y: UY, z: 58.75 }, (g) => {
    /* Shubenator's set sits on the real conference table (top y = UY+.81),
     * within arm's reach of his authored post at (-2.6, 59). */
    g.add(box({
      name: 'siege.station.radio.chassis',
      size: [0.78, 0.28, 0.44], pos: [-1.85, UY + 0.96, 58.75], mat: M_RADIO,
    }));
    g.add(box({
      name: 'siege.station.radio.tuner',
      size: [0.42, 0.09, 0.018], pos: [-1.85, UY + 1.0, 58.52], mat: M_GLASSY, cast: false,
    }));
    g.add(box({
      name: 'siege.station.radio.led',
      size: [0.08, 0.035, 0.02], pos: [-1.56, UY + 0.96, 58.51], mat: M_LED, cast: false,
    }));
    for (const [i, x] of [[0, -2.08], [1, -1.92], [2, -1.76]]) {
      g.add(named(cylinder({
        r: 0.035, h: 0.03, pos: [x, UY + 0.91, 58.5], mat: M_STEEL, rotX: Math.PI / 2,
      }), `siege.station.radio.knob.${i}`));
    }
    g.add(box({
      name: 'siege.station.radio.handset',
      size: [0.62, 0.09, 0.1], pos: [-1.85, UY + 1.17, 58.78], mat: M_RADIO, rotY: -0.12,
    }));
    g.add(named(cylinder({
      r: 0.012, h: 0.9, pos: [-2.18, UY + 1.5, 58.82], mat: M_STEEL, rotZ: -0.18,
    }), 'siege.station.radio.antenna'));
  });

  const TRIAGE_X = 4.5;
  defenceStation('triage', 'triage', { x: TRIAGE_X, y: UY, z: 50.65 }, (g) => {
    /* Gratin's open field case on the east gallery flank, beside his authored
     * position and outside the firing step. Its 65 cm east offset keeps the
     * open lid clear of both the wounded man's full prone pose and the +3.4
     * gallery plant. */
    g.add(box({
      name: 'siege.station.triage.case',
      size: [1.0, 0.28, 0.56], pos: [TRIAGE_X, UY + 0.14, 50.65], mat: M_RADIO,
    }));
    g.add(box({
      name: 'siege.station.triage.lid',
      size: [1.0, 0.06, 0.55], pos: [TRIAGE_X, UY + 0.58, 50.92], mat: M_RADIO, rotX: -0.18,
    }));
    g.add(box({
      name: 'siege.station.triage.cross.h',
      size: [0.34, 0.025, 0.1], pos: [TRIAGE_X, UY + 0.62, 50.64], mat: M_MARKER_RED, cast: false,
    }));
    g.add(box({
      name: 'siege.station.triage.cross.v',
      size: [0.1, 0.025, 0.34], pos: [TRIAGE_X, UY + 0.62, 50.64], mat: M_MARKER_RED, cast: false,
    }));
    for (let i = 0; i < 4; i++) {
      g.add(named(cylinder({
        r: 0.055, h: 0.22, pos: [TRIAGE_X - 0.3 + i * 0.2, UY + 0.36, 50.52],
        mat: M_MEDICAL, rotZ: Math.PI / 2, cast: false,
      }), `siege.station.triage.bandage.${i}`));
    }
    g.add(box({
      name: 'siege.station.triage.dressing',
      size: [0.42, 0.07, 0.32], pos: [TRIAGE_X + 0.3, UY + 0.34, 50.55], mat: M_MEDICAL, cast: false,
    }));
  });

  defenceStation('resupply', 'resupply', { x: -4.25, y: UY, z: 50.75 }, (g) => {
    /* The centre firing step keeps its belt boxes. This smaller flank cache
     * supports the people holding the west rail without duplicating a second
     * hero position. */
    for (const [i, x, y, z, yaw] of [
      [0, -4.48, UY + 0.18, 50.75, 0.08],
      [1, -4.05, UY + 0.18, 50.73, -0.06],
      [2, -4.27, UY + 0.52, 50.78, 0.12],
    ]) {
      g.add(box({
        name: `siege.station.resupply.ammo-can.${i}`,
        size: [0.38, 0.34, 0.62], pos: [x, y, z], mat: M_STEEL, rotY: yaw,
      }));
      g.add(box({
        name: `siege.station.resupply.can-latch.${i}`,
        size: [0.13, 0.05, 0.025], pos: [x, y + 0.1, z - 0.322], mat: M_BRASS, cast: false,
      }));
    }
    for (let i = 0; i < 5; i++) {
      g.add(box({
        name: `siege.station.resupply.magazine.${i}`,
        size: [0.09, 0.24, 0.045],
        pos: [-3.78 + i * 0.1, UY + 0.12, 50.55 + (i % 2) * 0.07],
        mat: M_RADIO, rotZ: -0.22 + i * 0.08, cast: false,
      }));
    }
  });

  /* The rail worklamp is a supported practical and stays the hero fixture,
   * but it is south of the LITTLE_FRIEND tableau. A compact battery flood on
   * the existing north-console top supplies the camera-facing side of both
   * figures without changing the room exposure or adding another floor prop.
   * Its battery is the stand: the base sits directly on the already-solid
   * console, so this battle-only layer still owns no navigation collider. */
  const taskFloodGroup = geometryIntent(group('siege.gallery.task-flood'), {
    assemblyId: 'siege-gallery-task-flood',
  });
  taskFloodGroup.add(box({
    name: 'siege.gallery.task-flood.battery',
    size: [0.44, 0.22, 0.26], pos: [0, 0.11, 0], mat: M_RADIO,
  }));
  for (const side of [-1, 1]) {
    taskFloodGroup.add(box({
      name: `siege.gallery.task-flood.yoke.${side < 0 ? 'left' : 'right'}`,
      size: [0.035, 0.23, 0.035], pos: [side * 0.17, 0.275, 0], mat: M_STEEL,
    }));
  }
  taskFloodGroup.add(box({
    name: 'siege.gallery.task-flood.housing',
    size: [0.36, 0.22, 0.16], pos: [0, 0.36, -0.035], mat: M_STEEL,
  }));
  taskFloodGroup.add(box({
    name: 'siege.gallery.task-flood.lens',
    size: [0.29, 0.15, 0.018], pos: [0, 0.36, -0.124],
    mat: mat({
      color: 0x000000, emissive: 0xffe2aa, emissiveIntensity: 3.2, roughness: 1,
    }),
    cast: false,
  }));
  const taskFloodLight = addLight(new THREE.PointLight(0xffdfaa, 18, 10, 2));
  taskFloodLight.position.set(0, 0.38, -0.14);
  taskFloodGroup.add(taskFloodLight);
  /* The console's bronze urn occupies x 4.96..5.44. Put the battery on the
   * same support top, but in the clear west half of the console. */
  taskFloodGroup.position.set(4.65, UY + 0.84, 52.44);
  nameSubtree(taskFloodGroup, 'siege.gallery.task-flood');
  defenceStations.group.add(taskFloodGroup);
  defenceStations.taskFlood = {
    group: taskFloodGroup,
    light: taskFloodLight,
    support: Object.freeze({ x: 4.65, y: UY + 0.84, z: 52.44 }),
  };

  enrol('siege.stations', defenceStations.group);

  /* ================================================================== */
  /* 4b. THE DEAD GUARD IN THE CELLAR CORRIDOR                            */
  /*                                                                       */
  /* "They were in the house before you woke up", readable in one look:      */
  /* a mansion guard across the corridor couch outside the theatre, weapon    */
  /* dropped, blood, the burst that killed him still in the wall behind him,  */
  /* and his security radio still going beside his hand.                      */
  /*                                                                           */
  /* OFF THE NAVIGATION LINE. The couch stands hard against the corridor's      */
  /* north wall in the 1.95 m of it between the theatre doorway (which ends at  */
  /* x = -1.87) and the first brick pier (which starts at x = 0.25). Its front   */
  /* face and every part of the body on it stay north of CORRIDOR_NAV.z1.        */
  /* ================================================================== */
  const cellarBody = {};
  {
    const g = geometryIntent(group('siege.body.guard'), { assemblyId: 'siege-body-guard-tableau' });
    /* The couch. Back to the wall at z=67.32 (the dado's inner face), seat
     * front at 66.70 -- 0.20 m clear of the walking lane. `siege.cellarBody`
     * is its anchor and the couch is built around it. */
    const CZ0 = 66.55;
    const CZ1 = 67.34;
    /* 2.09 m long, in the only 2.12 m of that wall with nothing in it: the
     * theatre doorway's east reveal is at x = -1.87 and the first brick pier
     * starts at x = 0.25. A pier in a doorway is furniture in a doorway with a
     * different name, and so is a couch. */
    const CX0 = SIEGE_ANCHORS.cellarBody.x - 1.045;
    const CX1 = SIEGE_ANCHORS.cellarBody.x + 1.045;
    const SEAT_Y = BY + 0.42;
    /* No arms. A settee in a service corridor does not have them, and more to
     * the point a body settled to the seat has its lowest point AT the seat --
     * so an arm block would be a box with a head inside it. */
    /* THE SEAT BITES 1 CM INTO THE BASE, and the back bites into the seat.
     * `scene-audit` had the base's top face and the seat's underside sharing
     * y = BY+0.34 over 1.23 m², which is a square metre of z-fight in the one
     * piece of furniture the mission asks the player to LOOK at -- the dead
     * guard is the sentence "they were in the house before you woke up", and
     * he is lying on a flickering settee. Upholstery is stapled to a frame; a
     * centimetre of overlap is the truthful version as well as the stable one. */
    g.add(boxFrom(CX0, BY, CZ0 + 0.06, CX1, BY + 0.34, CZ1 - 0.06, M_WOOD_SPLIT, { name: 'siege.body.guard.couch.base' }));
    g.add(boxFrom(CX0, BY + 0.33, CZ0, CX1, SEAT_Y, CZ1 - 0.14, M_UPHOLSTERY, { name: 'siege.body.guard.couch.seat' }));
    g.add(boxFrom(CX0, BY + 0.33, CZ1 - 0.15, CX1, BY + 0.94, CZ1, M_UPHOLSTERY, { name: 'siege.body.guard.couch.back' }));
    /* Two cushions, one of them under his head. */
    for (const [cx, cy] of [[CX0 + 0.34, 0.06], [CX0 + 1.34, 0.05]]) {
      g.add(boxFrom(cx - 0.28, SEAT_Y, CZ0 + 0.1, cx + 0.28, SEAT_Y + cy, CZ1 - 0.22, M_UPHOLSTERY, {
        name: 'siege.body.guard.couch.cushion', cast: false,
      }));
    }

    /* The man. `makePerson` proportions through HeistFigure, then `fallen()`,
     * whose `_settle()` puts his lowest point exactly on the seat rather than
     * inside it. Yaw runs him along the couch, head to the west arm. */
    const GUARD_ROLL = 0.62;
    const guard = new HeistFigure({
      name: 'siege.body.guard.figure',
      /* `fallen()` rotates about the feet, so the body runs OUT from the root
       * rather than about it: the root goes at the east end and the man lies
       * west from there. Measured, not guessed -- the posed figure is 2.13 m
       * from crown to heel and the settee is 2.09. */
      x: CX1 - 0.055,
      y: SEAT_Y,
      z: 66.86,
      /* Head to the west: the body lies along world -x, which is along the
       * couch and NOT across the corridor. See fallenYaw(). */
      yaw: fallenYaw(GUARD_ROLL, -Math.PI / 2),
      tier: 'ambient',
      model: {
        height: 1.80,
        build: 1.12,
        dress: 'suit',
        shirt: 0x1b1f26,
        hair: 'crop',
        hairColour: 0x241c14,
        skin: 0xc08a5e,
        gender: 'male',
        beard: true,
        castShadow: false,
      },
    });
    guard.fallen({ roll: GUARD_ROLL });
    /* `fallen()` flings both arms wide, which is right for a man who went down
     * in the open and wrong for one on a 0.79 m settee: measured, the default
     * spread put his elbow 1.18 m into the corridor's walking lane. One arm in
     * against the back, the other folded down toward the radio. */
    guard.parts.armL.rotation.set(-2.5, 0, -0.1);
    guard.parts.armR.rotation.set(-1.45, 0, 0.22);
    guard.parts.foreL.rotation.set(-0.5, 0, 0);
    guard.parts.foreR.rotation.set(-1.05, 0, 0);
    guard.parts.legL.rotation.x = -0.4;
    guard.parts.legR.rotation.x = -0.1;
    guard.parts.shinL.rotation.x = 0.9;
    guard.parts.shinR.rotation.x = 0.45;
    resettle(guard, SEAT_Y);
    guard.update(0, { fear: 0 });
    nameSubtree(guard.root, 'siege.body.guard.figure');
    geometryIntent(guard.root, { assemblyId: 'siege-body-guard-tableau' });
    g.add(guard.root);

    /* His weapon, dropped where his hand let go of it. Built LYING DOWN, every
     * part above its own origin: the first version stood the grip and the
     * magazine below the receiver and then laid the whole thing on the floor,
     * which put 11 cm of magazine through the concrete. */
    const gun = group('siege.body.guard.weapon');
    gun.add(box({
      name: 'siege.body.guard.weapon.body', size: [0.62, 0.06, 0.08], pos: [0, 0.03, 0], mat: M_STEEL,
    }));
    gun.add(box({
      name: 'siege.body.guard.weapon.grip', size: [0.10, 0.055, 0.15], pos: [-0.17, 0.028, 0.08], mat: M_SOOT, rotY: 0.18,
    }));
    gun.add(box({
      name: 'siege.body.guard.weapon.mag', size: [0.06, 0.05, 0.19], pos: [0.03, 0.025, -0.11], mat: M_SOOT, rotY: -0.12,
    }));
    gun.add(box({
      name: 'siege.body.guard.weapon.sight', size: [0.05, 0.04, 0.03], pos: [0.2, 0.08, 0], mat: M_STEEL,
    }));
    /* On the floor at the foot of the settee, still north of CORRIDOR_NAV --
     * everything in this tableau is, litter included, so the walking lane is
     * genuinely clear rather than clear-of-the-big-bits. */
    gun.position.set(CX1 - 0.45, BY + 0.012, CZ0 + 0.16);
    gun.rotation.y = 0.62;
    g.add(gun);

    /* The radio, still hissing. One LED, so it reads as ON. */
    const radio = group('siege.body.guard.radio');
    radio.add(box({
      name: 'siege.body.guard.radio.case', size: [0.08, 0.19, 0.05], pos: [0, 0.095, 0], mat: M_RADIO,
    }));
    radio.add(named(cylinder({
      r: 0.008, h: 0.16, pos: [0.025, 0.26, 0], mat: M_RADIO,
    }), 'siege.body.guard.radio.aerial'));
    radio.add(box({
      name: 'siege.body.guard.radio.led', size: [0.016, 0.016, 0.014], pos: [-0.02, 0.17, 0.027], mat: M_LED, cast: false,
    }));
    radio.position.set(CX0 + 1.02, BY + 0.04, CZ0 + 0.08);
    radio.rotation.y = -0.4;
    radio.rotation.z = 1.35;
    g.add(radio);

    /* Blood: on the couch, and run down onto the runner in front of it. Both
     * lifted clear of the surfaces they are on -- the mansion's own basement
     * blood pool was authored 1 mm under the floor and nobody ever saw it. */
    g.add(boxFrom(CX0 + 0.2, SEAT_Y + 0.005, CZ0 + 0.06, CX1 - 0.1, SEAT_Y + 0.017, CZ1 - 0.2, M_BLOOD, {
      name: 'siege.body.guard.blood.seat', cast: false,
    }));
    g.add(boxFrom(CX0 + 0.1, BY + 0.030, CZ0 - 0.04, CX1 - 0.25, BY + 0.042, CZ0 + 0.3, M_BLOOD_DRY, {
      name: 'siege.body.guard.blood.floor', cast: false,
    }));

    /* The burst that killed him, in the wall behind the settee. The corridor's
     * north wall band starts at z = 67.38 and its brick dado tops out at
     * BY + 1.125, so the marks go on the plaster just above that -- 8 mm proud
     * of the face, because a decal AT the face is the flicker in every doorway
     * of this house. */
    g.add(impacts({
      x: (CX0 + CX1) / 2,
      y: BY + 1.28,
      z: 67.372,
      axis: 'z',
      name: 'siege.body.guard.impacts',
      count: 6,
      spread: 0.85,
      drop: 0.5,
      seed: 5,
    }));

    /* No collider. A body is something you walk over, and giving this one a
     * hull would put a solid box in a corridor the mission has to be walked
     * down under fire. */
    enrol('siege.body.guard', g);

    g.updateMatrixWorld(true);
    cellarBody.figure = guard;
    cellarBody.group = g;
    cellarBody.couch = { x0: CX0, x1: CX1, z0: CZ0, z1: CZ1, seatY: SEAT_Y };
    /** The whole tableau -- settee, man, weapon, radio, blood. */
    cellarBody.bounds = new THREE.Box3().setFromObject(g);
    /** Just the man, for anything asking where the BODY is. */
    cellarBody.figureBounds = new THREE.Box3().setFromObject(guard.root);
  }

  /* ================================================================== */
  /* 4b. THE DEAD MANSION SERVER IN THE FOYER                              */
  /*                                                                       */
  /* A waistcoated house server, with the glass she had been clearing by her */
  /* hand. She is explicitly an unnamed civilian -- not Margo and not one of */
  /* the Bing performers. Put her where you SEE her walking in, the pocket   */
  /* west of the front door, rather than in the fight lane through the hall. */
  /* ================================================================== */
  const foyerBody = {};
  {
    const a = SIEGE_ANCHORS.foyerBody;
    const g = geometryIntent(group('siege.body.performer'), { assemblyId: 'siege-body-performer-tableau' });
    const HER_ROLL = -0.58;
    const her = new HeistFigure({
      name: 'siege.body.performer.figure',
      x: a.x,
      y: GY,
      z: a.z,
      /* Lying along world -z: head toward the front door she never reached. */
      yaw: fallenYaw(HER_ROLL, Math.PI),
      tier: 'ambient',
      model: {
        height: 1.64,
        build: 0.88,
        dress: 'waistcoat',
        shirt: 0xe1ddd2,
        trouserColour: 0x202329,
        hair: 'tied',
        hairColour: 0x5a3b22,
        skin: 0xb97852,
        gender: 'female',
        bodyShape: 'average',
        luxury: false,
        castShadow: false,
      },
    });
    her.root.userData.siegeIdentity = Object.freeze({
      role: 'mansion-service-staff',
      namedCharacter: null,
      isMargo: false,
    });
    /* GY is the slab datum; the visible foyer marble spans 1.20..1.22.
     * fallen() settles to baseY, so binding it to plain GY embedded the whole
     * rendered body 20 mm through the finish while the blood correctly sat
     * above it. */
    her.baseY = GY + 0.02;
    her.fallen({ roll: HER_ROLL });
    her.update(0, { fear: 0 });
    nameSubtree(her.root, 'siege.body.performer.figure');
    geometryIntent(her.root, { assemblyId: 'siege-body-performer-tableau' });
    g.add(her.root);

    /* The glass, on its side where it rolled out of her hand. */
    const glass = group('siege.body.performer.glass');
    glass.add(named(cylinder({
      rTop: 0.045, rBottom: 0.028, h: 0.13, pos: [0, 0, 0], mat: M_GLASSY, rotZ: Math.PI / 2,
    }), 'siege.body.performer.glass.bowl'));
    glass.add(named(cylinder({
      r: 0.032, h: 0.012, pos: [-0.072, 0, 0], mat: M_GLASSY, rotZ: Math.PI / 2,
    }), 'siege.body.performer.glass.foot'));
    glass.position.set(a.x + 0.62, GY + 0.046, a.z - 0.34);
    glass.rotation.y = 0.6;
    g.add(glass);
    g.add(box({
      name: 'siege.body.performer.spill',
      size: [0.34, 0.01, 0.26],
      pos: [a.x + 0.74, GY + 0.032, a.z - 0.36],
      mat: mat({
        color: 0x8a6a2c, roughness: 0.25, transparent: true, opacity: 0.55,
      }),
      cast: false,
    }));
    /* The old 0.9 x 0.7 opaque rectangle began at the body's north edge and
     * disappeared under the dark gown. Use the campaign's shared irregular
     * floor pool, centred from the actual fallen figure bounds, and advance
     * this pre-existing death to its fully spread state before first frame. */
    her.root.updateMatrixWorld(true);
    const bloodAt = new THREE.Box3().setFromObject(her.root).getCenter(new THREE.Vector3());
    /* Let the irregular edge emerge past the gown on three sides. The exact
     * figure-centre pool was technically present but completely occluded by
     * the dark dress in the real under-attack frame. */
    bloodAt.x += 0.4;
    bloodAt.z -= 0.42;
    const deathBlood = new DeathBloodPool(g, {
      capacity: 1,
      growthSeconds: 0.01,
      random: () => 0.37,
    });
    const bloodPool = deathBlood.spill(bloodAt, {
      /* `GY` is the structural slab datum. The foyer's 20 mm marble topping
       * and 30 mm border sit above it, so a shared pool at plain GY renders
       * under the finished floor. Pass the actual highest local finish; the
       * shared system adds its own 6 mm decal lift. */
      floorY: GY + 0.03,
      size: 1.9,
      opacity: 1,
      seed: 47,
    });
    deathBlood.update(1);
    /* Scene-specific low-light grade on the shared pooled mesh. This is a
     * bounded deep-red lift, not a glowing replacement decal; the shared
     * alpha-cut texture still owns the irregular silhouette. */
    bloodPool.material.emissive.setHex(0x420006);
    bloodPool.material.emissiveIntensity = 0.4;
    bloodPool.material.roughness = 0.42;
    bloodPool.material.needsUpdate = true;
    /* One shoe, off, a metre away, lying on its side. Rolled about y rather
     * than z: a rotZ of 1.4 on a 9 cm heel swings 5 cm of it under the
     * marble, which is the same arithmetic that buried the guard's magazine. */
    g.add(box({
      name: 'siege.body.performer.shoe',
      size: [0.23, 0.07, 0.09],
      pos: [a.x - 0.9, GY + 0.037, a.z - 0.72],
      mat: M_SOOT,
      rotY: 0.9,
    }));

    enrol('siege.body.performer', g);
    g.updateMatrixWorld(true);
    foyerBody.figure = her;
    foyerBody.group = g;
    foyerBody.identity = her.root.userData.siegeIdentity;
    foyerBody.blood = { system: deathBlood, pool: bloodPool };
    foyerBody.bounds = new THREE.Box3().setFromObject(g);
    foyerBody.figureBounds = new THREE.Box3().setFromObject(her.root);
  }

  /* ================================================================== */
  /* 5. INTERIOR DEBRIS                                                   */
  /*                                                                       */
  /* Overturned furniture, casings underfoot, a broken lamp, cover shoved    */
  /* across two doorway mouths, and smoke gathering at the ceilings.          */
  /*                                                                          */
  /* Every cover volume is PARTIAL -- 1.0-1.15 m, which is chest height on a   */
  /* crouching man -- and every one of them leaves at least a metre of floor   */
  /* beside it. A barricade that seals a doorway is a locked door with a       */
  /* sideboard in front of it, and the brief's own rule is that the friendly   */
  /* side never blocks the stairs.                                            */
  /* ================================================================== */
  const debris = {};

  /** Casings. Tiny, many, deterministic, and nothing solid about them. */
  function casings(name, cx, cz, floorY, count, spread) {
    const g = group(name);
    for (let i = 0; i < count; i++) {
      /* Golden-angle scatter: nothing lands in a ring and nothing needs a
       * random number, so the floor of this hall looks the same in every
       * screenshot anybody ever takes of it. */
      const ang = i * 2.399963;
      const r = spread * Math.sqrt((i + 0.5) / count);
      g.add(named(cylinder({
        r: 0.0055,
        h: 0.023,
        pos: [cx + Math.cos(ang) * r, floorY + 0.012, cz + Math.sin(ang) * r],
        mat: M_BRASS,
        rotX: Math.PI / 2,
        rotY: ang,
        cast: false,
      }), `${name}.case.${i}`));
    }
    return g;
  }

  /** A piece of furniture pushed over onto its side, plus its cover volume. */
  function overturned({
    name, x, z, floorY, w, h, d, yaw = 0, material = M_WOOD_SPLIT,
  }) {
    const g = group(name);
    g.add(box({
      name: `${name}.carcass`, size: [w, d, h], pos: [0, d / 2, 0], mat: material,
    }));
    /* The back panel, now the top face, split away at one corner.
     *
     * IT OVERLAPS THE CARCASS BY 8 MM RATHER THAN SITTING EXACTLY ON IT.
     * `scene-audit` found all three of these as COPLANAR over two to three
     * square metres apiece -- the panel's underside was at y = d and the
     * carcass's top face was at y = d, which is two surfaces in one plane and
     * the definition of z-fighting. Overlapping solids do not fight; only
     * coincident faces do. The panel is 4 cm thick, so 8 mm of bite costs
     * nothing anybody can see and removes the flicker outright. */
    g.add(box({
      name: `${name}.panel`, size: [w * 0.94, 0.04, h * 0.9], pos: [0, d + 0.012, 0.02], mat: material, cast: false,
    }));
    for (const sx of [-1, 1]) {
      g.add(box({
        name: `${name}.foot`,
        size: [0.08, 0.09, 0.08],
        pos: [sx * (w / 2 - 0.12), d / 2, -(h / 2 + 0.05)],
        mat: M_SOOT,
      }));
    }
    g.position.set(x, floorY, z);
    g.rotation.y = yaw;
    const halfX = Math.abs(Math.cos(yaw)) * (w / 2) + Math.abs(Math.sin(yaw)) * (h / 2);
    const halfZ = Math.abs(Math.sin(yaw)) * (w / 2) + Math.abs(Math.cos(yaw)) * (h / 2);
    const b = hull(x - halfX, floorY, z - halfZ, x + halfX, floorY + d, z + halfZ);
    return { group: g, collider: b, height: d };
  }

  /* -- The foyer: two pieces of cover and the floor of a firefight. ------ */
  {
    const g = group('siege.debris.foyer');
    /* A sideboard shoved behind the west flight to make cover facing the
     * front door. Its x remains in the west pocket, but it is north of the
     * `foyer_under -> foyer_arch_west` line: z=48.85 cleared the stair only by
     * replacing the visible penetration with a chest-high nav blocker. */
    const sideboard = overturned({
      name: 'siege.debris.foyer.sideboard',
      x: -6.55, z: 51.0, floorY: GY, w: 2.1, h: 0.62, d: 1.05, yaw: 0.28,
    });
    g.add(sideboard.group);
    /* And its opposite number in the supported pocket between the centreline
     * and the open basement shaft. The former x=7.1,z=49.35 position captured
     * `foyer_arch_east` and both edges through the lounge mouth. */
    const settle = overturned({
      name: 'siege.debris.foyer.settle',
      x: 4.2, z: 51.4, floorY: GY, w: 1.9, h: 0.58, d: 1.0, yaw: -0.36, material: M_UPHOLSTERY,
    });
    g.add(settle.group);
    /* Chairs on their backs. NO COLLIDERS, and that is deliberate: this engine
     * has no step-over. `Player._resolve` skips a box only when its top is
     * below the feet, so a 0.5 m chair on the floor of a firefight is a 0.5 m
     * wall you cannot see over and cannot walk round in a hurry. Everything
     * this module puts on a floor -- chairs, casings, litter, bodies, the
     * dropped rifle -- is walk-over dressing. The only solids it adds are the
     * things it MEANS as cover, and each of those is chest height. */
    /* TIPPED AS AN ASSEMBLY, NOT PART BY PART, and the difference is the
     * whole of `tippedRestY`'s docblock said a second time.
     *
     * These three chairs used to be built upright and then given `rotZ` on
     * EVERY PIECE. Rotating a box about its own centre does not move that
     * centre, so the pieces span but the joint does not: the seat turned on
     * the spot into a vertical panel 0.42 m up, the legs turned into
     * horizontal sticks at the same height, and the back turned flat and
     * stayed where the backrest had been. What stood in the foyer was not a
     * chair on its back -- it was four sticks, a panel and a plank sharing a
     * yaw, with 0.19 m of air under the seat. `tools/scene-audit.mjs` called
     * all three FLOATING, "1.39 m up with nothing under it", which is the
     * fault reading its own symptom back.
     *
     * So the parts are authored around the assembly's OWN CENTRE, an inner
     * group tips the whole chair once, and `tippedRestY` puts the outer group
     * at the height that lands the lowest corner exactly on the marble --
     * the same call the centrepiece rubble and the console legs already make
     * eleven lines and four hundred lines above. Yaw stays on the outer group
     * so it is still a yaw in the room and not a roll in the chair's frame. */
    const CHAIR_W = 0.46; // x extent upright, which is the tipped height
    const CHAIR_H = 0.99; // floor to the top of the backrest
    const CHAIR_TIP = Math.PI / 2;
    for (const [cx, cz, cy] of [[-3.4, 41.2, 0.9], [3.9, 42.4, -1.3], [1.4, 48.6, 2.4]]) {
      const chair = group('siege.debris.foyer.chair');
      const tip = group('siege.debris.foyer.chair.tip');
      /* Upright, measured from the assembly's centre: seat just below it, the
       * backrest above and behind, the legs hanging under. */
      tip.add(box({
        name: 'siege.debris.foyer.chair.seat', size: [0.46, 0.07, 0.46], pos: [0, -0.04, 0], mat: M_WOOD_SPLIT,
      }));
      tip.add(box({
        name: 'siege.debris.foyer.chair.back', size: [0.44, 0.5, 0.06], pos: [0, 0.245, -0.2], mat: M_WOOD_SPLIT,
      }));
      for (const [lx, lz] of [[-0.19, -0.19], [-0.19, 0.19], [0.19, -0.19], [0.19, 0.19]]) {
        tip.add(box({
          name: 'siege.debris.foyer.chair.leg', size: [0.05, 0.42, 0.05], pos: [lx, -0.285, lz], mat: M_WOOD_SPLIT,
        }));
      }
      tip.rotation.z = CHAIR_TIP;
      chair.add(tip);
      chair.position.set(cx, tippedRestY(GY, CHAIR_W, CHAIR_H, CHAIR_TIP), cz);
      chair.rotation.y = cy;
      g.add(chair);
    }
    /* The broken lamp: shade off, stem bent, bulb dark. */
    const lamp = group('siege.debris.foyer.lamp');
    lamp.add(named(cylinder({
      r: 0.16, h: 0.03, pos: [0, 0.015, 0], mat: M_STEEL, cast: false,
    }), 'siege.debris.foyer.lamp.base'));
    lamp.add(named(cylinder({
      r: 0.022, h: 1.32, pos: [0.42, 0.16, 0], mat: M_STEEL, rotZ: Math.PI / 2 - 0.22,
    }), 'siege.debris.foyer.lamp.stem'));
    lamp.add(named(cylinder({
      /* At this roll the 0.3 m rim contributes 0.293 m of vertical extent;
       * y=.2 buried that rim 128 mm through the marble. */
      rTop: 0.3, rBottom: 0.2, h: 0.32, pos: [1.24, 0.328, 0.16], mat: M_FABRIC_BURNT, rotZ: 1.35,
    }), 'siege.debris.foyer.lamp.shade'));
    lamp.add(named(sphere({
      r: 0.045, pos: [1.02, 0.2, 0.1], mat: M_ASH,
    }), 'siege.debris.foyer.lamp.bulb'));
    lamp.position.set(-8.15, GY, 51.2);
    lamp.rotation.y = 1.9;
    g.add(lamp);
    /* Casings, in the two places the fight actually happens: across the middle
     * of the hall and at the foot of each flight. */
    g.add(casings('siege.debris.foyer.casings.hall', 0, 43.6, GY, 44, 3.4));
    g.add(casings('siege.debris.foyer.casings.west', -6.6, 43.2, GY, 20, 1.5));
    g.add(casings('siege.debris.foyer.casings.east', 6.6, 43.2, GY, 20, 1.5));
    /* Plaster knocked off the partitions, both sides. */
    for (const [px, pz, ax] of [[FOYER.x0 + 0.02, 43.2, 'x'], [FOYER.x1 - 0.02, 41.0, 'x']]) {
      g.add(impacts({
        x: px, y: GY + 1.55, z: pz, axis: ax, name: 'siege.debris.foyer.impacts', count: 8, spread: 1.6, seed: px,
      }));
    }
    /* Smoke gathered at the top of the double-height hall. Its underside is
     * 4.35 m over the marble -- the chandelier hangs at 8.6 and the gallery
     * rail is at 6.0, so this is above BOTH and cannot come between the player
     * on the landing and anybody in the hall below. */
    const hallSmoke = ceilingSmoke({
      x: 0, z: 44.0, floorY: GY, y: GY + 4.6, w: 15.5, d: 10.0, name: 'siege.smoke.foyer', peak: 0.13,
    });
    g.add(hallSmoke.group);

    enrol('siege.debris.foyer', g, { boxes: [sideboard.collider, settle.collider] });
    debris.foyer = {
      group: g, sideboard, settle, smoke: hallSmoke,
    };
  }

  /* -- The cellar corridor: casings, a knocked-over bin, ceiling haze. --- */
  {
    const g = group('siege.debris.cellar');
    /* Keep the deterministic scatter inside the 3.1 m corridor. The old
     * 2.0/1.8 m radii planted four complete cases inside its end walls. */
    g.add(casings('siege.debris.cellar.casings.west', -6.2, 65.9, BY, 26, 1.45));
    g.add(casings('siege.debris.cellar.casings.east', 7.8, 65.9, BY, 22, 1.45));
    /* A service bin over on its side against the SOUTH wall, beside the base
     * house's own bench. Nothing here crosses CORRIDOR_NAV. */
    const bin = group('siege.debris.cellar.bin');
    bin.add(named(cylinder({
      r: 0.24, h: 0.66, pos: [0, 0.24, 0], mat: M_STEEL, rotZ: Math.PI / 2,
    }), 'siege.debris.cellar.bin.body'));
    bin.add(named(cylinder({
      r: 0.25, h: 0.03, pos: [0.42, 0.02, 0], mat: M_STEEL, cast: false,
    }), 'siege.debris.cellar.bin.lid'));
    /* Between the -8.5 and -6.2 brick piers, parallel to the wall. At the old
     * -8.4/0.5-rad placement the whole 0.48 m body passed through a pier and
     * its back 60 mm passed through the dado. */
    bin.position.set(-7.35, BY, CELLAR_HALL.z0 + 0.31);
    bin.rotation.y = 0;
    g.add(bin);
    /* Emergency-light spill is `night.js`'s job. What belongs here is the
     * smoke that has drifted down the stair from the fight upstairs -- thin,
     * and 2.6 m over the concrete, which is the hard floor for this module. */
    const hallSmoke = ceilingSmoke({
      x: 0,
      z: (CELLAR_HALL.z0 + CELLAR_HALL.z1) / 2,
      floorY: BY,
      y: BY + 2.62,
      w: 24,
      d: 2.6,
      name: 'siege.smoke.cellar',
      layers: 2,
      peak: 0.09,
    });
    g.add(hallSmoke.group);
    enrol('siege.debris.cellar', g);
    debris.cellar = { group: g, bin, smoke: hallSmoke };
  }

  /* -- The lounge: cover for the men coming through the bay glass. ------- */
  {
    const g = group('siege.debris.lounge');
    const table = overturned({
      name: 'siege.debris.lounge.table',
      x: 12.6, z: 42.8, floorY: GY, w: 1.8, h: 0.85, d: 1.0, yaw: 0.55, material: M_WOOD_SPLIT,
    });
    g.add(table.group);
    g.add(casings('siege.debris.lounge.casings', 13.4, 44.6, GY, 22, 1.9));
    const loungeSmoke = ceilingSmoke({
      x: 12.5, z: 45.5, floorY: GY, y: GY + 3.9, w: 6.0, d: 8.0, name: 'siege.smoke.lounge', layers: 2, peak: 0.10,
    });
    g.add(loungeSmoke.group);
    enrol('siege.debris.lounge', g, { boxes: [table.collider] });
    debris.lounge = { group: g, table, smoke: loungeSmoke };
  }

  /* ================================================================== */
  /* 6. THE FIRING STEP                                                   */
  /*                                                                       */
  /* PART VI: "The landing gives a commanding view, partial cover at the     */
  /* rail, an ammunition point, friendly positions to either side."          */
  /*                                                                        */
  /* The ammunition point had never been built and the "partial cover at the */
  /* rail" was the house's own balustrade, which is in every other bay of     */
  /* this gallery as well. So a first-time player arriving on the upper floor  */
  /* with LITTLE_FRIEND on the HUD sees thirty-two metres of identical         */
  /* landing and no reason to believe that one six-metre bay of it is the      */
  /* thing the mission is waiting for. He wanders. Twice, driven headless, the */
  /* run stalled here with the objective up and nothing happening.             */
  /*                                                                          */
  /* Three signals, because one is a guess and two is a coincidence:           */
  /*   1. an AMMUNITION POINT -- crates, open boxes, loose belt -- which is     */
  /*      the brief's own furniture and reads as "somebody set this up for you" */
  /*   2. SANDBAGS at the rail either side of centre: partial cover, 0.95 m,    */
  /*      which is the one thing on this landing that is a fighting position    */
  /*   3. a WORK LAMP over it, warm against nine red emergency fittings, so the */
  /*      bay is the brightest thing on the floor from the office door onward   */
  /*                                                                           */
  /* WHAT IT MUST NOT DO is stand in the attackers' way. `balcony_step` in      */
  /* nav.js is at (0, 47.4) with a 0.8 m spread and the leg feeding it runs     */
  /* straight down x = 0 from the gallery's centre; everything below is at      */
  /* |x| >= 1.35 or z <= 46.6, and `verify:mansion-siege` walks every anchor    */
  /* and every leg against the live colliders to prove it.                     */
  /* ================================================================== */
  /** MansionInterior.BALCONY -- the bay the mission calls the firing step. */
  const BALCONY = Object.freeze({ x0: -3, x1: 3, z0: 45.2, z1: 48 });
  const firingStep = {};
  {
    const UY = 6.0; // UPPER_Y
    const g = group('siege.step');
    const boxes = [];

    /* -- Sandbags at the rail, one stack either side of the middle. ------
     * 0.95 m: chest height on a crouching man and shin height on a standing
     * one, so it is cover you use rather than a wall you are behind. The
     * 2.7 m gap between them is the bit of rail you actually shoot from. */
    for (const sx of [-1, 1]) {
      const stack = geometryIntent(group('siege.step.sandbags'), {
        assemblyId: `siege-step-sandbags-${sx < 0 ? 'west' : 'east'}`,
      });
      const rows = [
        [0.00, 5, 0.92], [0.19, 4, 0.80], [0.38, 3, 0.62],
      ];
      rows.forEach(([dy, count, width], row) => {
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : i / (count - 1);
          stack.add(box({
            name: `siege.step.sandbag.${row}.${i}`,
            size: [width / count + 0.03, 0.185, 0.34],
            pos: [(t - 0.5) * width, dy + 0.0925, ((i + row) % 2) * 0.03 - 0.015],
            mat: M_FABRIC_BURNT,
            rotY: (((i * 37 + row * 11) % 20) - 10) / 140,
          }));
        }
      });
      /* A rifle case up-ended against the outer end of the stack, so the
       * silhouette is not two identical bricks. */
      stack.add(box({
        name: 'siege.step.case',
        size: [0.24, 0.96, 0.14],
        pos: [sx * 0.62, 0.48, 0.16],
        mat: M_STEEL,
        rotZ: sx * 0.11,
      }));
      stack.position.set(sx * 1.9, UY, 45.72);
      g.add(stack);
      boxes.push(hull(sx * 1.9 - 0.56, UY, 45.5, sx * 1.9 + 0.56, UY + 0.95, 45.96));
    }

    /* -- The ammunition point, at the bay's north-west shoulder. ---------
     * Two crates, one open with belts hanging out of it, one closed and used
     * as a table. It is the thing Gratin has been handing magazines out of. */
    const ammo = geometryIntent(group('siege.step.ammo'), { assemblyId: 'siege-step-ammo' });
    ammo.add(box({
      name: 'siege.step.ammo.crate.low',
      size: [0.86, 0.44, 0.58], pos: [0, 0.22, 0], mat: M_WOOD_SPLIT,
    }));
    /* Stacked, and biting 1 cm into the crate under it. Two crates whose
     * faces meet exactly is the same square metre of z-fight `overturned()`
     * had; the audit caught this one within a minute of it being written. */
    ammo.add(box({
      name: 'siege.step.ammo.crate.high',
      size: [0.74, 0.4, 0.5], pos: [0.06, 0.63, 0.04], mat: M_WOOD_SPLIT, rotY: 0.14,
    }));
    /* The open lid, leaning against the top crate with its low edge ON the
     * lower crate's lid line -- not hovering above it. A 0.74 m board tipped
     * 0.92 rad drops its corner 0.31 m, so the centre goes there and not at
     * the height the board would have been flat. Same arithmetic as
     * `tippedRestY`, against a crate rather than against the floor. */
    ammo.add(box({
      name: 'siege.step.ammo.lid',
      size: [0.74, 0.04, 0.5], pos: [-0.28, 0.747, 0.04], mat: M_WOOD_SPLIT, rotZ: -0.92, cast: false,
    }));
    /* Loose belt, over the lip and onto the floor. Three links, falling. */
    [[0.30, 0.80, 0.24, 0.5], [0.40, 0.52, 0.30, 0.9], [0.46, 0.16, 0.34, 1.3]]
      .forEach(([bx, by, bz, roll], i) => {
        ammo.add(box({
          name: `siege.step.ammo.belt.${i}`,
          size: [0.07, 0.05, 0.3], pos: [bx, by, bz], mat: M_BRASS, rotZ: roll, rotY: 0.4, cast: false,
        }));
      });
    /* North 150 mm from the west sandbag stack: the original crate corners
     * entered seven bags by as much as 90 mm. */
    ammo.position.set(-2.25, UY, 46.45);
    ammo.rotation.y = 0.42;
    g.add(ammo);
    boxes.push(hull(-2.85, UY, 46.05, -1.65, UY + 1.05, 46.90));

    /* -- The work lamp. -------------------------------------------------
     * Warm, and the only warm light on this floor once the alarm is going:
     * nine red fittings and one yellow one, and the yellow one is standing
     * over the place the mission wants you. It is clamped to the gallery
     * rail rather than free-standing, which is both how a work lamp gets
     * onto a balcony and why nothing is under it. */
    const lampGroup = geometryIntent(group('siege.step.worklamp'), {
      assemblyId: 'siege-step-worklamp',
    });
    lampGroup.add(named(cylinder({
      r: 0.035, h: 1.45, pos: [0, 0.72, 0], mat: M_WORKLAMP_SAFETY,
    }), 'siege.step.worklamp.post'));
    lampGroup.add(named(cylinder({
      r: 0.06, h: 0.14, pos: [0, 0.07, 0], mat: M_STEEL,
    }), 'siege.step.worklamp.clamp'));
    lampGroup.add(named(cylinder({
      rTop: 0.2, rBottom: 0.11, h: 0.22, pos: [0.12, 1.42, 0],
      mat: M_WORKLAMP_SAFETY, rotZ: -0.55,
    }), 'siege.step.worklamp.shade'));
    lampGroup.add(named(sphere({
      r: 0.07, pos: [0.19, 1.36, 0],
      mat: mat({
        color: 0x000000, emissive: 0xffd27a, emissiveIntensity: 3.2, roughness: 1,
      }),
      cast: false,
    }), 'siege.step.worklamp.bulb'));
    /* This is a local practical, not a room-wide exposure change. At 24 / 16
     * it wins the ten-light camera budget even while both nearby alarm
     * fittings are inside a live pulse, and throws a readable warm edge on
     * the two east-bay defenders; inverse-square decay still leaves the rest
     * of the floor under the authored siege night. */
    const worklamp = addLight(new THREE.PointLight(0xffd08a, 24, 16, 2));
    worklamp.position.set(0.22, 1.34, 0);
    lampGroup.add(worklamp);
    /* Seat the clamp around an interior east gallery-edge baluster beside the
     * LITTLE_FRIEND posts. The former end bay put the tilted shade through
     * the east newel finial; one bay in keeps every housing part clear. */
    lampGroup.position.set(4.726, UY, 48);
    g.add(lampGroup);

    /* Casings, so the step reads as somewhere that has been used rather than
     * somewhere that has been laid out.
     *
     * SPREAD 1.15, NOT 2.2, AND THE CENTRE IS 46.9 RATHER THAN 46.4. The bay
     * is only 2.8 m deep and its south edge at z 45.2 is a six-metre drop
     * into the foyer: a 2.2 m scatter threw four of the thirty over the rail,
     * where they hung in the air above the front door. `scene-audit` had them
     * within a minute of the step being written, which is the entire argument
     * for running it on a scene the same day you dress it. */
    g.add(casings('siege.step.casings', 0, 46.9, UY, 30, 1.15));

    enrol('siege.step', g, { boxes });
    firingStep.group = g;
    /* Exposed as the real interaction surface: this was authored as the
     * firing-step ammunition point, so resupply belongs on these crates rather
     * than on an invisible proxy beside them. */
    firingStep.ammo = ammo;
    firingStep.lamp = worklamp;
    firingStep.colliders = boxes;
    firingStep.bay = BALCONY;
    /* Where the HUD and the verifier should say "stand here". Centre of the
     * gap between the two sandbag stacks, a step back off the rail. */
    firingStep.stand = Object.freeze({ x: 0, y: UY, z: 46.4 });
  }

  /* ================================================================== */
  /* Per-frame                                                            */
  /* ================================================================== */
  function update(dt) {
    if (!(dt > 0)) return;
    time += dt;
    const battle = damage.activeLayers.has('battle');
    for (const fire of fires) fire.tick(dt, time, battle);
    for (const s of smokes) s.tick(dt, time);
    if (smokeSystem) {
      if (battle) {
        smokeSystem.update(dt);
      } else {
        /* A checkpoint restore can turn the battle layer off immediately.
         * Clear the shared pool in that same frame so the previous room's
         * haze cannot linger into the clean/exterior state. */
        for (const puff of smokeSystem.puffs ?? []) {
          puff.sprite.visible = false;
          if (puff.sprite.material) puff.sprite.material.opacity = 0;
        }
      }
    }
  }

  const props = {
    wrecks,
    fires: {
      forecourt: wrecks.burning?.fire ?? null,
      foyer: fires.find((f) => f.group.name === 'siege.fire.foyer.flame') ?? null,
      all: fires,
    },
    /* `performer` remains as a compatibility handle for old evidence tools;
     * new code should use the authored identity. Both point at one tableau. */
    bodies: { guard: cellarBody, staff: foyerBody, performer: foyerBody },
    debris,
    centrepiece,
    architecture,
    defenceStations,
    firingStep,
    smoke: {
      columns: smokes,
      floorClearance: SMOKE_FLOOR_CLEARANCE,
      maxOpacity: SMOKE_MAX_OPACITY,
      sharedSystem: smokeSystem,
      mode: smokeSystem ? 'shared-pooled-billboards' : 'bounded-mesh-fallback',
    },
    lights,
    anchors: SIEGE_ANCHORS,
  };

  return {
    root, colliders, props, update,
  };
}
