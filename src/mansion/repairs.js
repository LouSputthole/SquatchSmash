/**
 * THE HOUSE, STILL BEING PUT BACK TOGETHER.
 *
 * Owner playtest, verbatim:
 *
 *   "Repaired mansion is really just the same thing as the original mansion.
 *    [...] I want some things to be repaired. Like maybe the centerpiece in
 *    the foyer is clearly still half broken and being repaired. Maybe Snow is
 *    working on it as a maintenance man - lets give him a maintainence outfit
 *    and a voice line about how long its going to take to get everything
 *    fixed up."
 *
 * He is describing a real hole. `MansionInterior.js` builds ONE house and both
 * visits mount it: the night of PROJECT SILENT SQUATCH and the morning after
 * the siege get the same marble, the same flowers, the same unbroken
 * chandelier. A player who fought a war through that hall walks back into it
 * the next day and finds a room that has never heard of him.
 *
 * WHY THIS IS ITS OWN MODULE rather than a `visit` flag threaded through the
 * interior builder. That builder is fourteen thousand lines and the SIEGE
 * mounts it too; a branch inside it is a branch three scenes have to carry and
 * every geometry allowlist has to be re-anchored around. This is an ADAPTER in
 * the sense docs/REUSE-FIRST.md means it: the finished interior goes in, a
 * work site comes out on top of it, and the mission visit never calls it.
 *
 * WHAT IT ACTUALLY DOES, and why each piece is here:
 *
 *   - The chandelier's BOTTOM TIER comes down. `siege/state.js` already models
 *     this exact fixture as "a chandelier that is on the floor now" when the
 *     house is wrecked, so a morning-after where it is whole again skips the
 *     middle of its own story. Everything below the second tier is hidden and
 *     the tier itself is standing on a pallet by the wall, half under a dust
 *     sheet, waiting to go back up.
 *   - Half the centre table is under a sheet, with the scaffold over it that
 *     you need to reach 8.6 m of ceiling.
 *   - A patch of the compass inlay is LIFTED: bare grey screed where the
 *     marble was, the cut segments stacked beside it, a grout bucket. Snow's
 *     line is the reason this is the piece that shows -- "marble you can't
 *     patch, it has to come out and go back in" is a thing you can see.
 *
 * The module owns geometry only. Snow himself, his clothes and his lines are
 * `cast.js` and `script.js`, the same as every other person in this house.
 */
import * as THREE from 'three';

import { mat, box, cylinder, group } from '../world/build.js';

/** Everything on the work site is one of these five. */
const M = {
  sheet: mat({ color: 0xd8d4c6, roughness: 0.98 }),
  screed: mat({ color: 0x7b7973, roughness: 1 }),
  timber: mat({ color: 0x9c7a4a, roughness: 0.92 }),
  steel: mat({ color: 0x8d939c, roughness: 0.45, metalness: 0.7 }),
  marble: mat({ color: 0xe6e0d2, roughness: 0.3 }),
  gold: mat({ color: 0xcda434, roughness: 0.3, metalness: 0.8 }),
  hazard: mat({ color: 0xd8b62c, roughness: 0.9 }),
};

/**
 * The height below which a foyer-chandelier part counts as its bottom tier.
 *
 * The fixture's own local frame: tiers at y 0, -0.42 and -0.76, and the finial
 * ball at -1.00. -0.60 is the gap between the second tier's crystal drops
 * (which reach -0.42 - 0.30 = -0.72 at their lowest... see below) and the
 * third tier's arms, so the cut is taken on the ARM ring rather than on a
 * bounding box: a part belongs to the bottom tier when the part's own ORIGIN
 * sits below the line, which puts the third tier's arms, shades, bulbs and
 * drops on the floor and leaves the second tier's danglers hanging.
 */
const BOTTOM_TIER_Y = -0.60;

/**
 * Dress the return visit's foyer as a job that is not finished.
 *
 * @param {object} o
 *   scene      THREE.Object3D to add the work site to. Required.
 *   foyer      `interior.props.foyer` — read for `chandelier` and
 *              `chandelierLight`. Optional; without it the fixture is left
 *              whole and only the floor dressing is built.
 *   at         { x, z } the foyer's centre, and `y` its floor. Required.
 *   colliders  array to push the work site's blockers onto. Optional.
 * @returns {{ root, workSpot, tierDown, parts }} `workSpot` is where a man
 *   working on this stands, for whoever is placing him.
 */
export function mountFoyerRepairs({ scene, foyer = null, at, colliders = null } = {}) {
  if (!scene || !at) return null;
  const { x: cx, z: cz } = at;
  const gy = at.y ?? 0;
  const root = group('mansion-foyer-repairs');
  const parts = {};
  const add = (mesh, name) => {
    if (name) mesh.name = name;
    root.add(mesh);
    return mesh;
  };

  /* ---- The tier that came down --------------------------------------- */
  let tierDown = 0;
  if (foyer?.chandelier) {
    for (const part of foyer.chandelier.children) {
      if (!part.isMesh) continue;
      if (part.position.y >= BOTTOM_TIER_Y) continue;
      part.visible = false;
      tierDown += 1;
    }
    /* A fixture missing its bottom tier throws less light, and saying so with
     * the light rather than only with the geometry is what stops the hall
     * reading as "finished, but oddly shaped". */
    if (foyer.chandelierLight) foyer.chandelierLight.intensity *= 0.62;
  }

  /* ...and where it went. A pallet against the west wall with the ring of gold
   * arms standing on edge in it, a sheet thrown over the near half. */
  const px = cx - 4.6;
  const pz = cz + 1.1;
  add(box({
    size: [1.5, 0.11, 1.2], pos: [px, gy + 0.055, pz], mat: M.timber, name: 'repairs-pallet',
  }));
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI - Math.PI / 2;
    add(box({
      size: [0.9, 0.05, 0.05],
      pos: [px + Math.sin(a) * 0.05, gy + 0.44, pz + Math.cos(a) * 0.30],
      mat: M.gold, rotY: a * 0.5, rotZ: Math.PI / 2 - 0.10, cast: false,
      name: 'repairs-tier-arm',
    }));
  }
  add(cylinder({
    r: 0.16, h: 0.20, pos: [px + 0.44, gy + 0.21, pz - 0.30], mat: M.gold, name: 'repairs-tier-finial',
  }));
  add(box({
    size: [1.30, 0.10, 1.00], pos: [px - 0.10, gy + 0.50, pz + 0.06], mat: M.sheet,
    rotZ: 0.05, cast: false, name: 'repairs-pallet-sheet',
  }));

  /* ---- The lifted inlay ----------------------------------------------- *
   * A rectangle of the compass floor is out, 2 mm below the marble around it
   * so the edge catches, and the cut segments are stacked on their side
   * beside the hole where a mason leaves them. */
  const hx = cx + 1.15;
  const hz = cz + 2.05;
  add(box({
    size: [1.85, 0.02, 1.40], pos: [hx, gy + 0.021, hz], mat: M.screed,
    cast: false, receive: true, name: 'repairs-screed',
  }));
  for (let i = 0; i < 4; i += 1) {
    add(box({
      size: [0.62, 0.045, 0.58],
      pos: [hx + 1.55 + i * 0.012, gy + 0.026 + i * 0.048, hz - 0.18 + i * 0.015],
      mat: M.marble, rotY: 0.06 * i, cast: false, name: 'repairs-marble-offcut',
    }));
  }
  add(cylinder({
    rTop: 0.17, rBottom: 0.14, h: 0.32, pos: [hx - 1.20, gy + 0.16, hz + 0.40],
    mat: M.steel, name: 'repairs-grout-bucket',
  }));

  /* ---- The scaffold ---------------------------------------------------- *
   * Two lifts of it, which is what 8.6 m of ceiling costs. It stands CLEAR of
   * the centre table's own collider (x -1.4..1.4 about the inlay) rather than
   * through it, and clear of the two stair feet the room's dressing is
   * already kept off. */
  const sx = cx - 2.35;
  const sz = cz - 0.10;
  const legs = [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]];
  for (const [ox, oz] of legs) {
    add(cylinder({
      r: 0.035, h: 4.30, pos: [sx + ox, gy + 2.15, sz + oz], mat: M.steel, name: 'repairs-scaffold-leg',
    }));
  }
  for (const ly of [1.90, 3.80]) {
    add(box({
      size: [1.36, 0.05, 1.36], pos: [sx, gy + ly, sz], mat: M.timber,
      cast: false, name: 'repairs-scaffold-deck',
    }));
    for (const [ox, oz] of [[0, -0.62], [0, 0.62]]) {
      add(box({
        size: [1.30, 0.04, 0.04], pos: [sx + ox, gy + ly + 0.95, sz + oz], mat: M.steel,
        cast: false, name: 'repairs-scaffold-rail',
      }));
    }
  }
  /* Diagonal braces on the two faces you can see from the front door. */
  for (const [ox, oz, rz] of [[0, -0.62, 1.22], [-0.62, 0, -1.22]]) {
    add(box({
      size: [2.30, 0.035, 0.035], pos: [sx + ox, gy + 0.95, sz + oz], mat: M.steel,
      rotZ: rz, rotY: ox === 0 ? 0 : Math.PI / 2, cast: false, name: 'repairs-scaffold-brace',
    }));
  }

  /* ---- The sheet over the near half of the centrepiece ----------------- *
   * Draped, not folded: one slab lying over the table top and one hanging
   * down its front. The table's own top is at floor + 0.825. */
  add(box({
    size: [2.40, 0.03, 1.30], pos: [cx, gy + 0.845, cz - 0.55], mat: M.sheet,
    rotX: -0.05, cast: false, name: 'repairs-centrepiece-sheet',
  }));
  add(box({
    size: [2.30, 0.72, 0.03], pos: [cx, gy + 0.50, cz - 1.16], mat: M.sheet,
    rotX: 0.07, cast: false, name: 'repairs-centrepiece-drape',
  }));

  /* ---- Trestle, tools and tape ----------------------------------------- */
  const tx = cx + 2.70;
  const tz = cz - 1.05;
  for (const ox of [-0.55, 0.55]) {
    for (const oz of [-0.22, 0.22]) {
      add(cylinder({
        r: 0.03, h: 0.78, pos: [tx + ox, gy + 0.39, tz + oz], mat: M.timber,
        rotZ: ox < 0 ? -0.16 : 0.16, name: 'repairs-trestle-leg',
      }));
    }
  }
  add(box({
    size: [1.60, 0.06, 0.44], pos: [tx, gy + 0.80, tz], mat: M.timber, name: 'repairs-trestle-top',
  }));
  add(box({
    size: [0.52, 0.22, 0.26], pos: [tx + 0.42, gy + 0.94, tz], mat: M.steel, name: 'repairs-toolbox',
  }));
  /* Hazard tape between two weighted stands, across the mouth of the hole. */
  for (const ox of [-1.35, 1.35]) {
    add(cylinder({
      rTop: 0.03, rBottom: 0.16, h: 0.92, pos: [hx + ox, gy + 0.46, hz - 0.92],
      mat: M.hazard, name: 'repairs-tape-stand',
    }));
  }
  add(box({
    size: [2.70, 0.05, 0.012], pos: [hx, gy + 0.86, hz - 0.92], mat: M.hazard,
    cast: false, name: 'repairs-hazard-tape',
  }));

  /* The scaffold and the trestle are things you walk into; the sheet, the tape
   * and the screed patch are not. Offered to the caller rather than pushed
   * into the world's list, the same arrangement the janitor cart uses -- the
   * mansion verifier adds the collider total up from its named contributors,
   * so a module that quietly appends one makes that sum wrong. */
  const blockers = [];
  const blocker = (x0, y1, z0, x1, z1, name) => {
    const b = new THREE.Box3(
      new THREE.Vector3(Math.min(x0, x1), gy, Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), gy + y1, Math.max(z0, z1)),
    );
    b.name = name;
    blockers.push(b);
    if (colliders) colliders.push(b);
    return b;
  };
  blocker(sx - 0.70, 4.30, sz - 0.70, sx + 0.70, sz + 0.70, 'mansion-repairs-scaffold-collider');
  blocker(tx - 0.85, 0.86, tz - 0.30, tx + 0.85, tz + 0.30, 'mansion-repairs-trestle-collider');
  blocker(px - 0.80, 0.60, pz - 0.65, px + 0.80, pz + 0.65, 'mansion-repairs-pallet-collider');

  scene.add(root);

  return {
    root,
    parts,
    /** How many chandelier parts were taken down. 0 means it was left whole. */
    tierDown,
    blockers,
    /** Where the man doing this stands: at the lifted inlay, facing it. */
    workSpot: { x: hx - 0.30, y: gy, z: hz - 1.55 },
    dispose() {
      root.parent?.remove(root);
    },
  };
}
