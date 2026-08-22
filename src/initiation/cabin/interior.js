/**
 * INITIATION NIGHT — inside the cabin.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WARM ROOM, COLD ATMOSPHERE
 *
 * The owner's two words for this room are "old rustic wealth", and the second
 * word is the one that is easy to miss. This is not a hunting shack. The
 * timber is squared and fitted, the table is one piece of hardwood, the
 * frames on the wall are real frames, and everything in here has been here
 * longer than anyone standing in it. It says: this family has been doing this
 * for a very long time, in this room, and nobody has ever needed to say so.
 *
 * Against that, the temperature of the scene: nine men, standing, quiet,
 * watching one man being brought to the middle. Drinks poured and not touched.
 * Smoke in the air from a stove that has been in since the afternoon. The room
 * is warm and nothing in it is relaxed.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THE ROOM HAS TO DO, MECHANICALLY
 *
 *   - Leave the middle clear. Nine blocking marks and a ceremony centre are
 *     laid out in site.js and every one of them is checked against every piece
 *     of furniture in here by the staging test. Furniture goes to the walls.
 *   - Put the five ceremony objects within reach of the table's south side,
 *     which is the side the player is brought to.
 *   - Be lit by three things — the stove, one hanging lamp and the candle —
 *     because a room lit like an office is a room nobody is afraid in.
 */

import * as THREE from 'three';

import {
  assembly, bakedTexture, between, boxPart, casts, cylinderPart, effect,
  glowMaterial, namedGroup, part, rng, slab, speckle,
} from './kit.js';
import { buildCeremonyProps, restOn } from './props.js';
import {
  CUSHION, FURNITURE, POURED_DRINKS, ROOM, STOVE, TABLE,
} from './site.js';

const OAK = 0x53401f;
const OAK_DARK = 0x3a2b14;
const IRON = 0x24262b;
const STONE = 0x4a4c50;

/** Ceiling joists sit here; the hanging lamp hangs off their underside. */
const JOIST_BOTTOM = 2.6;
const JOIST_TOP = ROOM.ceilingY;

const furniture = (id) => FURNITURE.find((entry) => entry.id === id);

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

/**
 * The beams.
 *
 * Five of them, running the SHORT way across the room, which is how a roof of
 * this span is actually framed and also the direction that reads from the
 * door. They are marked structural because they are: something hangs off one.
 */
function buildBeams() {
  const beams = assembly('cabin.beams', 'initiation.cabin.beams');
  for (const x of [19.5, 21.75, 24, 26.25, 28.5]) {
    const beam = casts(slab('cabin.beam.joist',
      [x - 0.11, JOIST_BOTTOM, ROOM.minZ], [x + 0.11, JOIST_TOP, ROOM.maxZ], OAK_DARK));
    beam.userData.geometryGate = { structural: true, fixedSupportAnchor: true };
    beams.add(beam);
  }
  return beams;
}

function floorTexture() {
  return bakedTexture(256, (context, size) => {
    speckle(context, size, '#3f2f1a', ['#33260f', '#4a3823', '#2a1f0d', '#553f24'], 900,
      { grain: [3, 30], alpha: [0.2, 0.55] });
  }, { repeat: 6 });
}

/** Boards over the floor slab, and one old rug in the middle of the room. */
function buildFloorDressing() {
  const group = assembly('cabin.floor.dressing', 'initiation.cabin.floor-dressing');
  const boards = part(
    new THREE.PlaneGeometry(ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ),
    new THREE.MeshLambertMaterial({ map: floorTexture() }),
    (ROOM.minX + ROOM.maxX) / 2, ROOM.floorY + 0.006, (ROOM.minZ + ROOM.maxZ) / 2,
    'cabin.floor.boards',
  );
  boards.rotation.x = -Math.PI / 2;
  boards.receiveShadow = true;
  group.add(boards);

  const rug = part(
    new THREE.PlaneGeometry(3.4, 2.5),
    new THREE.MeshLambertMaterial({ color: 0x5a2a26 }),
    24, ROOM.floorY + 0.012, 25.6, 'cabin.floor.rug',
  );
  rug.rotation.x = -Math.PI / 2;
  group.add(rug);
  return group;
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

/**
 * The long table.
 *
 * One slab of hardwood on four square legs, and it is at the BACK of the room
 * so that being brought to it is a walk. Its south side is clear: no bench, no
 * chairs, nothing between the player and the five objects on it.
 */
function buildTable() {
  const table = assembly('cabin.table', 'initiation.cabin.table');
  const halfWidth = TABLE.width / 2;
  const halfDepth = TABLE.depth / 2;
  const top = casts(slab('table.top',
    [TABLE.x - halfWidth, TABLE.topY - TABLE.thickness, TABLE.z - halfDepth],
    [TABLE.x + halfWidth, TABLE.topY, TABLE.z + halfDepth], OAK));
  table.add(top);
  for (const dx of [-halfWidth + 0.28, halfWidth - 0.28]) {
    for (const dz of [-halfDepth + 0.2, halfDepth - 0.2]) {
      table.add(slab('table.leg',
        [TABLE.x + dx - 0.06, 0, TABLE.z + dz - 0.06],
        [TABLE.x + dx + 0.06, TABLE.topY - TABLE.thickness, TABLE.z + dz + 0.06], OAK_DARK));
    }
  }
  /* A stretcher between the legs, low down, the way old tables are built. */
  table.add(slab('table.stretcher',
    [TABLE.x - halfWidth + 0.3, 0.22, TABLE.z - 0.04],
    [TABLE.x + halfWidth - 0.3, 0.3, TABLE.z + 0.04], OAK_DARK));
  return table;
}

/** The glasses poured for everybody else, which nobody is drinking. */
function buildPouredDrinks() {
  const group = assembly('cabin.drinks', 'initiation.cabin.drinks');
  for (const spot of POURED_DRINKS) {
    const glass = namedGroup('poured.glass');
    glass.add(part(
      new THREE.CylinderGeometry(0.035, 0.03, 0.085, 10, 1, true),
      new THREE.MeshLambertMaterial({
        color: 0xc8d2dc, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
      }), 0, 0.043, 0, 'poured.glass.wall',
    ));
    glass.add(cylinderPart('poured.glass.base', 0.03, 0.03, 0.01, 10, 0xb9c4d0, [0, 0.005, 0]));
    glass.add(cylinderPart('poured.glass.pour', 0.031, 0.029, 0.04, 10, 0x9a5a1e, [0, 0.03, 0]));
    restOn(glass, { x: spot.x, z: spot.z, surfaceY: TABLE.topY });
    group.add(glass);
  }
  return group;
}

/**
 * The lamp over the table.
 *
 * Hung from the middle joist on a chain that REACHES IT. A hanging light whose
 * chain stops short is the same defect as a floating prop, and the gate reads
 * it the same way: the top of this assembly is within four centimetres of the
 * underside of the beam, so it is attached to it, because it is.
 */
function buildHangingLamp() {
  const lamp = assembly('cabin.lamp', 'initiation.cabin.lamp');
  const bodyY = 2.05;
  /* The chain REACHES the beam: top exactly on the joist's underside, so the
   * gate reads the lamp as hung off it. The first pass stopped it 5 cm short —
   * one centimetre past the 4 cm tolerance — and the whole lamp reported as
   * floating over the table, which is what it was. */
  const chainBottom = bodyY + 0.1;
  const chainHeight = JOIST_BOTTOM - chainBottom;
  lamp.add(cylinderPart('lamp.chain', 0.012, 0.012, chainHeight, 5, IRON,
    [TABLE.x, chainBottom + chainHeight / 2, TABLE.z]));
  lamp.add(cylinderPart('lamp.shade', 0.26, 0.1, 0.16, 12, 0x2d2a26, [TABLE.x, bodyY + 0.04, TABLE.z]));
  lamp.add(cylinderPart('lamp.glass', 0.09, 0.075, 0.14, 10, 0xd8c79a, [TABLE.x, bodyY - 0.07, TABLE.z]));
  const flame = effect(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glowMaterial(0xffc477, 2.2)));
  flame.name = 'lamp.wick.flame';
  flame.position.set(TABLE.x, bodyY - 0.07, TABLE.z);
  lamp.add(flame);
  const light = new THREE.PointLight(0xffbe80, 34, 9.5, 2);
  light.position.set(TABLE.x, bodyY - 0.12, TABLE.z);
  lamp.add(light);
  return { lamp, light, flame };
}

/* ------------------------------------------------------------------ */
/* Heat                                                                */
/* ------------------------------------------------------------------ */

/**
 * The stove, the breast it vents into, and the fire in it.
 *
 * The flue goes SIDEWAYS into masonry rather than straight up through the
 * roof, which is both how a stove in a building with a chimney is actually
 * piped and the only version that does not put a steel tube through the
 * middle of a rafter.
 *
 * The breast is declared as part of `initiation.cabin.shell` even though it is
 * built here, because it is the same lump of stone as the stack outside: one
 * object, one owner, whichever file happens to draw each half of it.
 */
function buildStove() {
  const group = namedGroup('cabin.hearth');
  const breastBox = furniture('chimney-breast');
  const breast = assembly('cabin.chimney.breast', 'initiation.cabin.shell');
  const random = rng(0xb1a2e);
  const courses = 11;
  for (let i = 0; i < courses; i++) {
    const y0 = (i / courses) * ROOM.ceilingY;
    const y1 = ((i + 1) / courses) * ROOM.ceilingY - 0.015;
    const jitter = between(random, -0.02, 0.02);
    breast.add(slab('breast.course',
      [breastBox.minX + jitter, y0, breastBox.minZ],
      [breastBox.maxX + jitter, y1, breastBox.maxZ],
      i % 2 === 0 ? STONE : 0x404246));
  }
  group.add(breast);

  const hearth = assembly('cabin.hearth.pad', 'initiation.cabin.hearth');
  const padBox = furniture('stove');
  const pad = part(
    new THREE.PlaneGeometry(padBox.maxX - padBox.minX, padBox.maxZ - padBox.minZ),
    new THREE.MeshLambertMaterial({ color: 0x3a3c40 }),
    (padBox.minX + padBox.maxX) / 2, ROOM.floorY + 0.014, (padBox.minZ + padBox.maxZ) / 2,
    'hearth.pad',
  );
  pad.rotation.x = -Math.PI / 2;
  hearth.add(pad);
  group.add(hearth);

  const stove = assembly('cabin.stove', 'initiation.cabin.stove');
  const halfWidth = STOVE.width / 2;
  const halfDepth = STOVE.depth / 2;
  stove.add(casts(slab('stove.body',
    [STOVE.x - halfWidth, 0.12, STOVE.z - halfDepth],
    [STOVE.x + halfWidth, 0.12 + STOVE.height, STOVE.z + halfDepth], IRON)));
  for (const dx of [-halfWidth + 0.08, halfWidth - 0.08]) {
    for (const dz of [-halfDepth + 0.08, halfDepth - 0.08]) {
      stove.add(slab('stove.leg',
        [STOVE.x + dx - 0.035, 0, STOVE.z + dz - 0.035],
        [STOVE.x + dx + 0.035, 0.12, STOVE.z + dz + 0.035], 0x1b1d21));
    }
  }
  stove.add(slab('stove.top',
    [STOVE.x - halfWidth - 0.03, 0.12 + STOVE.height, STOVE.z - halfDepth - 0.03],
    [STOVE.x + halfWidth + 0.03, 0.12 + STOVE.height + 0.035, STOVE.z + halfDepth + 0.03], 0x1b1d21));

  /* The door, and the fire behind it. */
  const doorFrame = slab('stove.door',
    [STOVE.x - 0.22, 0.34, STOVE.z - halfDepth - 0.025],
    [STOVE.x + 0.22, 0.78, STOVE.z - halfDepth], 0x1b1d21);
  stove.add(doorFrame);
  const grate = effect(new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.26),
    glowMaterial(0xff6a1e, 1.9),
  ));
  grate.name = 'stove.fire.flame';
  grate.position.set(STOVE.x, 0.56, STOVE.z - halfDepth - 0.028);
  grate.rotation.y = Math.PI;
  stove.add(grate);

  /* Flue: up, then back into the stone. It STOPS at the masonry face. */
  const flueTop = 1.62;
  stove.add(cylinderPart('stove.flue.riser', 0.06, 0.06, flueTop - (0.12 + STOVE.height + 0.035), 8,
    0x1b1d21, [STOVE.x, (flueTop + 0.12 + STOVE.height + 0.035) / 2, STOVE.z]));
  const run = cylinderPart('stove.flue.run', 0.06, 0.06, STOVE.breastFaceZ - STOVE.z, 8, 0x1b1d21,
    [STOVE.x, flueTop, (STOVE.z + STOVE.breastFaceZ) / 2]);
  run.rotation.x = Math.PI / 2;
  stove.add(run);
  group.add(stove);

  const light = new THREE.PointLight(0xff7a2e, 26, 11, 2);
  light.position.set(STOVE.x, 0.62, STOVE.z - 0.5);
  group.add(light);

  return { group, light, grate };
}

/* ------------------------------------------------------------------ */
/* Furniture against the walls                                         */
/* ------------------------------------------------------------------ */

function buildSideboard() {
  const box = furniture('sideboard');
  const group = assembly('cabin.sideboard', 'initiation.cabin.sideboard');
  const topY = 0.95;
  group.add(casts(slab('sideboard.carcass',
    [box.minX, 0.14, box.minZ], [box.maxX, topY - 0.04, box.maxZ], OAK_DARK)));
  group.add(slab('sideboard.top',
    [box.minX - 0.03, topY - 0.04, box.minZ - 0.03], [box.maxX + 0.03, topY, box.maxZ + 0.03], OAK));
  for (const z of [box.minZ + 0.12, box.maxZ - 0.12]) {
    group.add(slab('sideboard.foot',
      [box.minX + 0.04, 0, z - 0.05], [box.maxX - 0.04, 0.14, z + 0.05], 0x2a1f10));
  }
  /* Bottles: brought years ago, opened at some point, never finished. */
  const random = rng(0x0b077);
  for (let i = 0; i < 4; i++) {
    const bottle = namedGroup('sideboard.bottle');
    const height = between(random, 0.24, 0.33);
    bottle.add(cylinderPart('bottle.body', 0.036, 0.04, height * 0.72, 9,
      i % 2 ? 0x2c4a2a : 0x4a2c1e, [0, height * 0.36, 0]));
    bottle.add(cylinderPart('bottle.neck', 0.014, 0.02, height * 0.3, 7, 0x22301f,
      [0, height * 0.85, 0]));
    restOn(bottle, {
      x: (box.minX + box.maxX) / 2 + between(random, -0.12, 0.12),
      z: box.minZ + 0.35 + i * 0.42,
      surfaceY: topY,
    });
    group.add(bottle);
  }
  return group;
}

function buildBench() {
  const box = furniture('bench-east');
  const group = assembly('cabin.bench', 'initiation.cabin.bench');
  group.add(casts(slab('bench.seat',
    [box.minX, CUSHION.bench - 0.06, box.minZ], [box.maxX, CUSHION.bench, box.maxZ], OAK)));
  for (const z of [box.minZ + 0.16, box.maxZ - 0.16]) {
    group.add(slab('bench.leg',
      [box.minX + 0.05, 0, z - 0.05], [box.maxX - 0.05, CUSHION.bench - 0.06, z + 0.05], OAK_DARK));
  }
  return group;
}

/**
 * A chair.
 *
 * `back` names the side the backrest is on, which is the side the sitter's
 * spine goes against — so it also decides which way the chair faces. The two
 * against the west wall have theirs on the east ('x'); the one at the head of
 * the table has it on the north ('z'), because Lou sits in it facing the
 * length of the room and a backrest drawn on the wrong side is a man sitting
 * with his chest against a plank.
 */
function buildChair(id, back = 'x') {
  const box = furniture(id);
  const group = assembly(`cabin.chair.${id}`, `initiation.cabin.chair.${id}`);
  group.add(slab('chair.seat',
    [box.minX, CUSHION.chair - 0.05, box.minZ], [box.maxX, CUSHION.chair, box.maxZ], OAK));
  for (const [dx, dz] of [[0.04, 0.04], [0.04, -0.04], [-0.04, 0.04], [-0.04, -0.04]]) {
    const x = dx > 0 ? box.minX + 0.03 : box.maxX - 0.09;
    const z = dz > 0 ? box.minZ + 0.03 : box.maxZ - 0.09;
    group.add(slab('chair.leg', [x, 0, z], [x + 0.06, CUSHION.chair - 0.05, z + 0.06], OAK_DARK));
  }
  if (back === 'z') {
    group.add(slab('chair.back',
      [box.minX + 0.02, CUSHION.chair, box.maxZ - 0.06],
      [box.maxX - 0.02, CUSHION.chair + 0.46, box.maxZ], OAK_DARK));
  } else {
    group.add(slab('chair.back',
      [box.maxX - 0.06, CUSHION.chair, box.minZ + 0.02],
      [box.maxX, CUSHION.chair + 0.46, box.maxZ - 0.02], OAK_DARK));
  }
  return group;
}

function buildIndoorFirewood() {
  const box = furniture('firewood');
  const group = assembly('cabin.firewood.inside', 'initiation.cabin.firewood-inside');
  const random = rng(0x1177d);
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 6; i++) {
      const log = cylinderPart('firewood.log', 0.07, 0.08, box.maxX - box.minX - 0.04, 6,
        row % 2 ? 0x4d3f28 : 0x3c301d,
        [(box.minX + box.maxX) / 2, 0.08 + row * 0.15, box.minZ + 0.14 + i * 0.32]);
      log.rotation.z = Math.PI / 2;
      log.rotation.x = between(random, -0.02, 0.02);
      group.add(log);
    }
  }
  return group;
}

/* ------------------------------------------------------------------ */
/* Walls                                                               */
/* ------------------------------------------------------------------ */

/**
 * One photograph, baked once and hung eight times.
 *
 * At the size these are printed and in the light this room is under, eight
 * separate 64-pixel canvases would be eight textures nobody could tell apart.
 * So there is one, and the FRAMES differ instead — which is also how a wall of
 * family photographs actually looks, because the frames were bought over
 * fifty years and the people in them were not.
 */
let photoMaterial = null;
function photoFace() {
  if (!photoMaterial) {
    const map = bakedTexture(64, (context, size) => {
      speckle(context, size, '#6b5f4a', ['#7d7059', '#574c3b', '#8b7f66'], 220, { grain: [4, 18] });
      context.fillStyle = '#3f3627';
      context.fillRect(size * 0.3, size * 0.3, size * 0.4, size * 0.5);
    }, { repeat: 1 });
    photoMaterial = new THREE.MeshLambertMaterial({ map });
  }
  return photoMaterial;
}

/**
 * Family photographs and framed portraits.
 *
 * They are hung FLAT AGAINST the inside face of the wall, which the gate
 * treats as attached rather than floating — and they are hung on the walls the
 * player can see from the middle of the room, because the point of them is
 * that he notices, while he is standing there, that everybody in every picture
 * is somebody's family.
 */
function buildWallPictures() {
  const group = assembly('cabin.pictures', 'initiation.cabin.pictures');
  /**
   * `side` is which way the picture STICKS OUT of the wall it is on: +1 for a
   * wall whose room is on its positive side, -1 for the back wall, where the
   * room is on its negative side. Without it every frame is built into the +
   * direction, which is correct on three walls and eight wall-embed findings
   * on the fourth — the portrait behind Lou was hanging inside the timber.
   */
  const hang = (name, { x, z, facing, width, height, y, side = 1 }) => {
    const frame = namedGroup(name);
    const depth = 0.05;
    const build = (colour, inset, out) => {
      const reach = out * side;
      const nearX = facing === 'x' ? Math.min(x, x + reach) : x - width / 2 + inset;
      const farX = facing === 'x' ? Math.max(x, x + reach) : x + width / 2 - inset;
      const nearZ = facing === 'x' ? z - width / 2 + inset : Math.min(z, z + reach);
      const farZ = facing === 'x' ? z + width / 2 - inset : Math.max(z, z + reach);
      return slab(`${name}.part`,
        [nearX, y - height / 2 + inset, nearZ],
        [farX, y + height / 2 - inset, farZ], colour);
    };
    frame.add(build(0x2e2415, 0, facing === 'x' ? depth : depth));
    const pane = build(0xffffff, 0.045, facing === 'x' ? depth + 0.004 : depth + 0.004);
    pane.material = photoFace();
    frame.add(pane);
    group.add(frame);
  };

  /* The big one, on the back wall, directly behind whoever is at the table. */
  hang('picture.portrait', {
    x: 24.0, z: ROOM.maxZ, facing: 'z', width: 0.8, height: 1.05, y: 1.85, side: -1,
  });
  /* A run down the west wall, and two on the south either side of the door. */
  const west = [{ y: 1.5, w: 0.42, h: 0.32 }, { y: 1.9, w: 0.34, h: 0.42 }, { y: 1.52, w: 0.3, h: 0.36 }];
  west.forEach((spec, index) => hang(`picture.west.${index}`, {
    x: ROOM.minX, z: 26.6 + index * 0.72, facing: 'x', width: spec.w, height: spec.h, y: spec.y,
  }));
  hang('picture.south.0', { x: 22.2, z: ROOM.minZ, facing: 'z', width: 0.46, height: 0.34, y: 1.72 });
  hang('picture.south.1', { x: 25.9, z: ROOM.minZ, facing: 'z', width: 0.38, height: 0.48, y: 1.78 });
  return group;
}

/**
 * The trophies.
 *
 * Two sets of antlers and a hide. Old, dusty, and nailed up by somebody who is
 * dead — which is the note this room is playing. Nothing here was bought.
 */
function buildTrophies() {
  const group = assembly('cabin.trophies', 'initiation.cabin.trophies');

  const antlers = (x, z, facing, y) => {
    const mount = namedGroup('trophy.antlers');
    const outward = facing === 'z' ? [0, 0, 1] : [1, 0, 0];
    const plaqueDepth = 0.06;
    mount.add(slab('trophy.plaque',
      [x - (facing === 'z' ? 0.16 : 0), y - 0.18, z - (facing === 'z' ? 0 : 0.16)],
      [x + (facing === 'z' ? 0.16 : plaqueDepth), y + 0.18, z + (facing === 'z' ? plaqueDepth : 0.16)],
      OAK_DARK));
    const skull = boxPart('trophy.skull', [0.16, 0.2, 0.22], [
      x + outward[0] * 0.14, y, z + outward[2] * 0.14,
    ], 0xcfc6ad);
    mount.add(skull);
    for (const side of [-1, 1]) {
      for (let tine = 0; tine < 3; tine++) {
        const beam = cylinderPart('trophy.tine', 0.018, 0.026, 0.28 + tine * 0.08, 5, 0xb6a684, [
          x + outward[0] * (0.2 + tine * 0.04) + (facing === 'z' ? side * (0.12 + tine * 0.07) : 0),
          y + 0.16 + tine * 0.1,
          z + outward[2] * (0.2 + tine * 0.04) + (facing === 'z' ? 0 : side * (0.12 + tine * 0.07)),
        ]);
        beam.rotation.z = facing === 'z' ? side * (0.5 + tine * 0.16) : 0;
        beam.rotation.x = facing === 'z' ? 0 : -side * (0.5 + tine * 0.16);
        /* No overlap suppression: every trophy on these walls is one assembly,
         * so a tine crossing its own skull is already the same object as the
         * skull. Suppressing it anyway would put twelve lines in the gate's
         * ledger to permit something the gate was never going to look at. */
        mount.add(beam);
      }
    }
    group.add(mount);
  };

  antlers(20.9, ROOM.minZ, 'z', 2.1);
  antlers(27.9, ROOM.minZ, 'z', 2.15);

  /* A hide, hung flat on the east wall. */
  const hide = slab('trophy.hide',
    [ROOM.maxX - 0.05, 1.35, 25.9], [ROOM.maxX, 2.35, 27.3], 0x5a4630);
  group.add(hide);
  return group;
}

/**
 * Smoke, hanging in the room.
 *
 * Sprites again, and low: pipe and cigarette smoke does not climb in a warm
 * room with the door shut, it sits at head height and moves when somebody
 * walks through it.
 */
function buildHaze() {
  const texture = bakedTexture(64, (context, size) => {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(214,206,190,0.30)');
    gradient.addColorStop(1, 'rgba(214,206,190,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  });
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, opacity: 0.34,
  });
  const group = namedGroup('cabin.haze.smoke.cloud');
  effect(group);
  const random = rng(0x4a2e);
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const sprite = new THREE.Sprite(material);
    sprite.name = 'haze.smoke.puff';
    const scale = between(random, 1.8, 3.6);
    sprite.scale.set(scale, scale * 0.55, 1);
    sprite.position.set(
      between(random, ROOM.minX + 1.2, ROOM.maxX - 1.2),
      between(random, 1.85, 2.5),
      between(random, ROOM.minZ + 1.2, ROOM.maxZ - 1.2),
    );
    puffs.push({ sprite, phase: random() * 10, drift: between(random, 0.1, 0.3) });
    group.add(sprite);
  }
  return { group, puffs };
}

/* ------------------------------------------------------------------ */
/* The room                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build the inside of the cabin.
 *
 * Returns the group, the circle colliders for the furniture, the lights, the
 * five ceremony props by name, and an `update(dt)` that flickers the fire and
 * drifts the haze.
 */
export function buildCabinInterior() {
  const group = namedGroup('initiation.cabin.interior');
  const lights = [];

  group.add(buildFloorDressing());
  group.add(buildBeams());
  group.add(buildTable());
  group.add(buildPouredDrinks());

  const lamp = buildHangingLamp();
  group.add(lamp.lamp);
  lights.push(lamp.light);

  const hearth = buildStove();
  group.add(hearth.group);
  lights.push(hearth.light);

  group.add(buildSideboard());
  group.add(buildBench());
  group.add(buildChair('chair-west-a'));
  group.add(buildChair('chair-west-b'));
  /* The only chair anybody is sitting in tonight. See LOU_SEAT in site.js. */
  group.add(buildChair('chair-head', 'z'));
  group.add(buildIndoorFirewood());
  group.add(buildWallPictures());
  group.add(buildTrophies());

  const ceremony = buildCeremonyProps();
  group.add(ceremony.group);
  lights.push(ceremony.props.candle.light);

  const haze = buildHaze();
  group.add(haze.group);

  /**
   * Colliders: the walls are the exterior's business, these are the things
   * inside the room a man can walk into. The ceremony marks are all checked
   * clear of them by the staging test, so nothing here can trap the player at
   * the moment he is being made.
   */
  const colliders = [];
  for (const box of FURNITURE) {
    if (box.id === 'chimney-breast') continue;
    const centreX = (box.minX + box.maxX) / 2;
    const centreZ = (box.minZ + box.maxZ) / 2;
    const halfX = (box.maxX - box.minX) / 2;
    const halfZ = (box.maxZ - box.minZ) / 2;
    const steps = Math.max(1, Math.round(Math.max(halfX, halfZ) / 0.6));
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 0 : (i / (steps - 1) - 0.5) * 2;
      colliders.push({
        x: centreX + (halfX > halfZ ? t * (halfX - 0.3) : 0),
        z: centreZ + (halfZ >= halfX ? t * (halfZ - 0.3) : 0),
        r: Math.min(halfX, halfZ) + 0.3,
        /* The walk-around margin above inflates the RADIUS and must never
         * inflate the height: a table you can see over at 0.78 m is not one
         * you can see over at 1.08 m. See the note on FURNITURE for why an
         * unheighted circle made the framing gate call the ceremony
         * unwatchable. */
        y0: box.minY,
        y1: box.maxY,
        /* One piece of furniture, laid out as a row of circles along its long
         * axis, and consecutive circles in that row share ground on purpose --
         * a table approximated by three circles that merely touched would have
         * two seams a player could stand in. The geometry gate blocks
         * collider-collider penetration by default, so a tessellated run says
         * so at the point it is built. Circles belonging to DIFFERENT pieces
         * are not covered by this and are still audited against each other. */
        overlap: false,
      });
    }
  }

  let time = 0;
  const update = (dt) => {
    time += dt;
    /* The fire and the two flames breathe. Nothing else in here moves. */
    const flicker = 0.86 + Math.sin(time * 7.3) * 0.07 + Math.sin(time * 13.9) * 0.05;
    hearth.light.intensity = 26 * flicker;
    lamp.light.intensity = 34 * (0.96 + Math.sin(time * 2.1) * 0.03);
    ceremony.props.candle.light.intensity = 5.5 * (0.9 + Math.sin(time * 9.1) * 0.08);
    ceremony.props.candle.flame.scale.setScalar(0.94 + Math.sin(time * 11.4) * 0.08);
    for (const puff of haze.puffs) {
      puff.sprite.position.x += Math.sin(time * 0.21 + puff.phase) * puff.drift * dt;
      puff.sprite.position.y += Math.sin(time * 0.13 + puff.phase * 2) * 0.04 * dt;
    }
  };

  return { group, colliders, lights, props: ceremony.props, update };
}
