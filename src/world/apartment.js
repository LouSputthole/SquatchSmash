/**
 * The apartment: shell, layout, lighting and every interaction in the room.
 *
 * Coordinate convention
 *   x: -5 (west) .. +5 (east)
 *   z: -4.5 (north) .. +4.5 (south)
 *   y: 0 (floor) .. 2.75 (ceiling)
 *
 * Yaw 0 looks north (-z); +x is east.
 */
import * as THREE from 'three';
import { box, boxFrom, cylinder, plane, mat, collider, group, yawToward } from './build.js';
import { makeMaterials } from './materials.js';
import * as T from './textures.js';
import * as P from './props.js';
import { resolveGear } from './gear.js';
import { Inventory, bindHeldItem } from '../core/inventory.js';
import { loadModels } from './models.js';

export const ROOM = { x0: -5, x1: 5, z0: -4.5, z1: 4.5, h: 2.75, wall: 0.16 };

/**
 * The closet, cut back into the south wall.
 *
 * `x0..x1` is the opening; the alcove runs from the wall's outer face back to
 * `back`. Shallow, because it is a studio flat and this is the cupboard that
 * came with it, not a walk-in.
 */
const CLOSET = { x0: 4.38, x1: 4.98, back: 5.40, h: 2.05 };

/**
 * Where the player's own art hangs. Keys match assets/art/manifest.json.
 * `h` is the picture height in metres; width follows the image's aspect ratio.
 */
export const WALL_SLOTS = [
  // West wall, over the bed and along past the lamp to the couch. Heights
  // deliberately stagger so it reads as a wall someone hung over years,
  // not a showroom row.
  { slot: 'bed.above', x: -4.97, y: 2.06, z: -3.95, rotY: Math.PI / 2, h: 0.42 },
  // The poster you actually wake up under.
  { slot: 'bed.poster', x: -4.97, y: 1.46, z: -3.98, rotY: Math.PI / 2, h: 0.60 },
  { slot: 'bed.mid', x: -4.97, y: 1.54, z: -3.20, rotY: Math.PI / 2, h: 0.36 },
  { slot: 'bed.right', x: -4.97, y: 2.02, z: -2.86, rotY: Math.PI / 2, h: 0.30 },
  { slot: 'gap.high', x: -4.97, y: 1.94, z: -2.22, rotY: Math.PI / 2, h: 0.32 },
  { slot: 'gap.low', x: -4.97, y: 1.46, z: -1.62, rotY: Math.PI / 2, h: 0.42 },
  { slot: 'gap.mid', x: -4.97, y: 1.94, z: -1.02, rotY: Math.PI / 2, h: 0.34 },
  { slot: 'couch.left', x: -4.97, y: 1.44, z: -0.30, rotY: Math.PI / 2, h: 0.42 },
  // The big one, hung dead centre over the couch. This is the wall you look
  // at when there is nothing to do, so it gets the space.
  { slot: 'feature.stacks', x: -4.97, y: 1.86, z: 0.62, rotY: Math.PI / 2, h: 0.92 },
  { slot: 'couch.right', x: -4.97, y: 1.30, z: 1.62, rotY: Math.PI / 2, h: 0.40 },
  { slot: 'west.late', x: -4.97, y: 1.84, z: 2.34, rotY: Math.PI / 2, h: 0.44 },
  { slot: 'west.low', x: -4.97, y: 1.26, z: 2.92, rotY: Math.PI / 2, h: 0.26 },
  { slot: 'west.corner', x: -4.97, y: 1.86, z: 3.56, rotY: Math.PI / 2, h: 0.36 },

  // North wall: one by the shelf, one riding high over the corkboard, and a
  // pair either side of the monitor with a small one stacked above.
  { slot: 'north.corner', x: -4.20, y: 1.70, z: -4.40, rotY: 0, h: 0.44 },
  { slot: 'shelf.left', x: -3.30, y: 1.98, z: -4.40, rotY: 0, h: 0.34 },
  /* Above the shelf, but pushed right of the crest, which is a 21cm radius
   * centred on x -2.70 and therefore owns -2.91 to -2.49. The first placement
   * sat almost exactly on top of it. */
  { slot: 'shelf.above', x: -2.16, y: 2.10, z: -4.40, rotY: 0, h: 0.26 },
  { slot: 'cork.above', x: -0.10, y: 2.20, z: -4.40, rotY: 0, h: 0.46 },
  { slot: 'desk.left', x: 0.95, y: 1.80, z: -4.40, rotY: 0, h: 0.44 },
  { slot: 'desk.right', x: 2.72, y: 1.62, z: -4.40, rotY: 0, h: 0.52 },
  { slot: 'desk.high', x: 2.72, y: 2.22, z: -4.40, rotY: 0, h: 0.24 },

  // South wall gallery, with a stacked pair in the middle of the run.
  // The stretch between the stacked pair and the front door was the last
  // empty run on this wall -- three metres of nothing you walk past on the
  // way out.
  /* Clear of the wall clock, which is a 15cm radius at x -1.00 and therefore
   * occupies out to -0.85. The first attempt started at exactly -0.85 and read
   * as hung on top of it. Dropped a little too, so it is not sharing a centre
   * line with the clock face either. */
  { slot: 'south.shield', x: -0.24, y: 1.62, z: 4.40, rotY: Math.PI, h: 0.44 },

  /* East wall. It had nothing on it at all: the window takes z -3.90..-2.30
   * and the fridge stands at z 1.95, which leaves this stretch in the middle
   * as the only bare wall left in the flat. */
  { slot: 'east.square', x: 4.97, y: 1.74, z: -0.60, rotY: -Math.PI / 2, h: 0.46 },
  /* The rest of that stretch, between the window's edge at z -2.30 and the
   * square above. Hung lower and smaller, so the pair reads as two things put
   * up separately rather than a matched set. */
  { slot: 'east.small', x: 4.97, y: 1.42, z: -1.62, rotY: -Math.PI / 2, h: 0.36 },
  { slot: 'door.side', x: 0.92, y: 1.74, z: 4.40, rotY: Math.PI, h: 0.46 },
  { slot: 'south.a', x: -2.10, y: 1.88, z: 4.40, rotY: Math.PI, h: 0.38 },
  { slot: 'south.b', x: -2.10, y: 1.36, z: 4.40, rotY: Math.PI, h: 0.34 },
  { slot: 'south.wide', x: -3.38, y: 1.66, z: 4.40, rotY: Math.PI, h: 0.34 },
  /* A tall portrait in the one stretch of this wall wide enough for it. The
   * gap between south.wide and the stacked pair is 0.67m; this is 0.30 across,
   * which leaves it looking hung rather than wedged. */
  { slot: 'south.stands', x: -2.72, y: 1.62, z: 4.40, rotY: Math.PI, h: 0.62 },
  { slot: 'south.portrait', x: -4.42, y: 1.72, z: 4.40, rotY: Math.PI, h: 0.54 },
  // Between the door and the Denver piece, which was the last empty stretch of
  // wall in the flat. Not a tournament photo.
  // Was at x 2.34, which is across the front door and its swing.
  { slot: 'poster.pinup', x: 1.72, y: 1.66, z: 4.40, rotY: Math.PI, h: 0.56 },
  // The other big one, facing you as you come away from the desk.
  { slot: 'feature.denver', x: 3.88, y: 1.82, z: 4.40, rotY: Math.PI, h: 0.86 },
];

/**
 * Bathroom walls. Small pieces, hung where you have nothing else to look at.
 * Coordinates use the BATH box declared in buildApartment.
 */
/**
 * Bathroom walls. Small pieces, hung where you have nothing else to look at.
 *
 * The tiling stops at 1.70m and nothing is hung on it -- you do not put a
 * frame on a wet wall -- so every one of these sits in the metre of painted
 * wall above it. Heights still stagger; a row of four at the same level
 * would look like a dentist's waiting room. Nothing goes over the bath.
 */
export const BATH_SLOTS = [
  // East wall above the toilet. You look up at this one, at length.
  { slot: 'bath.toilet', x: -0.31, y: 1.98, z: -6.55, rotY: -Math.PI / 2, h: 0.34 },
  // Above and behind the cistern.
  { slot: 'bath.far', x: -1.30, y: 2.10, z: -7.09, rotY: 0, h: 0.36 },
  // Over the mirror cabinet.
  { slot: 'bath.mirror', x: -0.31, y: 1.96, z: -5.02, rotY: -Math.PI / 2, h: 0.30 },
  // West wall between the bath and the door, high enough to stay dry.
  { slot: 'bath.high', x: -2.69, y: 2.24, z: -5.12, rotY: Math.PI / 2, h: 0.28 },
];

/**
 * Hanging cloth banners rather than framed pictures.
 *
 * The wall face is z -4.5 and the framed pieces hang at -4.436, so a banner at
 * -4.33 was standing 15cm off the wall -- twice as proud as anything around
 * it, which reads as floating rather than hanging. They sit in the same plane
 * as the frames now.
 *
 * Austin is 1.6m of cloth and was centred at 4.15, which put its right edge
 * 5cm from the east wall: not hung in the corner, wedged into it. Moved left
 * far enough to breathe, and still clear of desk.right at 3.015.
 */
const BANNER_SLOTS = [
  /* Was x 3.95 / h 0.60. desk.right's artwork was swapped for the official
   * logo, which is a wider image, so that frame grew from 0.59m to 0.94m and
   * walked into the banner's left edge. A picture's width is never written
   * down here -- it comes from the file's aspect ratio -- so swapping art
   * moves the edges of things that were fine yesterday. */
  { slot: 'banner.main', x: 4.08, y: 1.62, z: -4.42, rotY: 0, h: 0.56 },
  // Strung above the monitor, the way a setup backdrop goes up.
  { slot: 'banner.twitch', x: 1.90, y: 2.34, z: -4.42, rotY: 0, h: 0.30 },
];

/** Round crest hung above the bookshelf on the north wall. */
const CREST_SLOT = { slot: 'crest.round', x: -2.70, y: 2.13, z: -4.40, rotY: 0, r: 0.21 };

/** Photo frames that stand on furniture rather than hanging. */
const STANDING_SLOTS = [
  { slot: 'shelf.photo', x: -0.52, y: 0.723, z: 4.14, rotY: Math.PI - 0.30, h: 0.19 },
  { slot: 'sideboard.photo', x: -1.62, y: 0.723, z: 4.16, rotY: Math.PI + 0.22, h: 0.17 },
  { slot: 'desk.photo', x: 0.98, y: 0.740, z: -4.22, rotY: 0.22, h: 0.13 },
  { slot: 'night.photo', x: -3.02, y: 0.578, z: -4.20, rotY: -1.05, h: 0.15 },
];

/**
 * The fridge door. The sticker has been there longer than you have lived
 * here; the photographs are held on by magnets, the way photographs are.
 * Positions are local to the door, which swings, so they swing with it.
 */
const FRIDGE_MAGNET = { slot: 'fridge.magnet', w: 0.27 };
const FRIDGE_PHOTOS = [
  { slot: 'fridge.photo.a', y: 1.55, z: -0.19, w: 0.21, tilt: -0.07 },
  { slot: 'fridge.photo.b', y: 0.48, z: -0.42, w: 0.19, tilt: 0.09 },
  // Stuck on rather than magneted: no frame, no paper border, alpha cut out.
  { slot: 'sticker.fridge', y: 0.92, z: -0.06, w: 0.22, tilt: -0.13, sticker: true },
  /* The second one went on later and at a different angle, because nobody
   * lines up the second sticker with the first. */
  { slot: 'sticker.fridge.b', y: 1.24, z: 0.17, w: 0.19, tilt: 0.16, sticker: true },
];

/**
 * Inside the closet.
 *
 * `closet.back` is the whole reason the closet exists: it hangs where the
 * clothes cover it, and you only find it by shoving them out of the way. The
 * two shirts are on the rail in front of it; the two shrine photographs are
 * propped on the floor underneath, which is not where you keep photographs of
 * your friend, and is exactly where these are.
 */
const CLOSET_SLOTS = ['closet.shirt.a', 'closet.shirt.b',
  'shrine.a', 'shrine.b',
  /* Not in the closet at all: face down under the bed, and the only way to
   * see it is to go looking. Kept in this list because it is the same kind of
   * thing -- a picture that lives somewhere other than a wall. */
  'bed.under'];

/** Textures used on props rather than hung on a wall. */
const PROP_SLOTS = ['zyn.lid', 'label.beer', 'label.whiskey', 'eggs.carton', 'cereal.box',
  // Die-cut vinyl rather than framed art: these want a transparent PNG. Give
  // one a photo with a background and it reads as paper taped on instead.
  'sticker.tower', 'sticker.fridge', 'sticker.fridge.b'];

export async function buildApartment(ctx) {
  const { scene, audio, hud, interaction, time } = ctx;
  const M = makeMaterials();

  // Resolved up front: some of it is wall art, but some is the label on the
  // beer and the print on the egg carton, which the prop builders need.
  const gear = await resolveGear([
    ...WALL_SLOTS.map((s) => s.slot),
    ...BATH_SLOTS.map((s) => s.slot),
    ...BANNER_SLOTS.map((b) => b.slot),
    CREST_SLOT.slot,
    ...CLOSET_SLOTS,
    ...PROP_SLOTS,
    ...STANDING_SLOTS.map((s) => s.slot),
    FRIDGE_MAGNET.slot,
    ...FRIDGE_PHOTOS.map((f) => f.slot),
  ]);
  /** Only hand a texture to a prop if the real file resolved. */
  const propTex = (slot) => {
    const g = gear.get(slot);
    return g?.real ? g.texture : null;
  };
  P.beerLabelMaterial(propTex('label.beer'));

  const root = group('apartment');
  scene.add(root);

  const colliders = [];
  const floorZones = [];
  const ticks = [];        // per-frame updaters
  const addCollider = (b) => colliders.push(collider(b[0], b[1]));

  /* ================================================================ */
  /* Shell                                                             */
  /* ================================================================ */

  const { x0, x1, z0, z1, h, wall } = ROOM;

  const floor = boxFrom(x0, -0.1, z0, x1, 0, z1, M.floor, { cast: false });
  root.add(floor);
  const ceiling = boxFrom(x0, h, z0, x1, h + 0.1, z1, M.ceiling, { cast: false });
  root.add(ceiling);

  // Walls, with openings left for the two doors and the window.
  // North wall (z0): bathroom door at x -1.9..-0.9, otherwise solid.
  addWallRun(root, M, 'north', [[x0, -1.90], [-0.90, x1]], z0, wall, h);
  addDoorHeader(root, M, 'north', -1.90, -0.90, z0, wall, h, 2.05);

  /* South wall (z1): front door at x 2.30..3.30, and the closet beside it.
   *
   * The corner past the Denver piece is the only stretch of wall in the flat
   * that is free. Measured, after putting it somewhere that looked free and
   * finding the sideboard, the radio and the wall clock already in it: the
   * north wall is behind the bed for its whole western half, the west wall is
   * a gallery end to end, and the rest is doors, the window or the kitchen.
   *
   * It is 60cm wide, which is narrow for a closet and exactly right for the
   * one by the front door that came with the flat. */
  addWallRun(root, M, 'south', [[x0, 2.30], [3.30, CLOSET.x0], [CLOSET.x1, x1]], z1, wall, h);
  addDoorHeader(root, M, 'south', 2.30, 3.30, z1, wall, h, 2.05);
  addDoorHeader(root, M, 'south', CLOSET.x0, CLOSET.x1, z1, wall, h, CLOSET.h);

  // West wall: solid.
  addWallRunSide(root, M, 'west', [[z0, z1]], x0, wall, h);

  // East wall: window opening at z -3.90..-2.30, y 0.95..2.15.
  addWallRunSide(root, M, 'east', [[z0, -3.90], [-2.30, z1]], x1, wall, h);
  root.add(boxFrom(x1, 0, -3.90, x1 + wall, 0.95, -2.30, M.wall, { cast: false }));       // sill wall
  root.add(boxFrom(x1, 2.15, -3.90, x1 + wall, h, -2.30, M.wall, { cast: false }));       // header

  // Skirting board all the way round.
  const skirt = M.trim;
  root.add(boxFrom(x0, 0, z0, x1, 0.09, z0 + 0.02, skirt, { cast: false }));
  root.add(boxFrom(x0, 0, z1 - 0.02, x1, 0.09, z1, skirt, { cast: false }));
  root.add(boxFrom(x0, 0, z0, x0 + 0.02, 0.09, z1, skirt, { cast: false }));
  root.add(boxFrom(x1 - 0.02, 0, z0, x1, 0.09, z1, skirt, { cast: false }));

  // Room colliders (walls). The north wall is split so the bathroom doorway
  // at x -1.90..-0.90 is actually walkable.
  addCollider([[x0 - 0.5, 0, z0 - wall, ], [-1.90, h, z0]]);
  addCollider([[-0.90, 0, z0 - wall], [x1 + 0.5, h, z0]]);
  addCollider([[x0 - 0.5, 0, z0 - 0.5], [-1.90, h, z0 - wall]]);
  addCollider([[-0.90, 0, z0 - 0.5], [x1 + 0.5, h, z0 - wall]]);
  /* South side, split around the closet mouth so it is walkable, with the
   * alcove's own three walls closing it off behind. */
  addCollider([[x0 - 0.5, 0, z1], [CLOSET.x0, h, z1 + 0.5]]);
  addCollider([[CLOSET.x1, 0, z1], [x1 + 0.5, h, z1 + 0.5]]);
  // The closet is in the corner, so its east side is the room's own east wall.
  addCollider([[CLOSET.x0 - 0.5, 0, CLOSET.back], [CLOSET.x1 + 0.5, h, CLOSET.back + 0.5]]);
  addCollider([[CLOSET.x0 - 0.5, 0, z1], [CLOSET.x0, h, CLOSET.back + 0.2]]);
  addCollider([[CLOSET.x1, 0, z1], [CLOSET.x1 + 0.5, h, CLOSET.back + 0.2]]);
  addCollider([[x0 - 0.5, 0, z0 - 0.5], [x0, h, z1 + 0.5]]);
  addCollider([[x1, 0, z0 - 0.5], [x1 + 0.5, h, z1 + 0.5]]);

  /* ---- rug + floor surfaces ---- */
  const rug = boxFrom(-4.90, 0.001, -0.60, -2.30, 0.014, 2.00, M.rug, { cast: false });
  root.add(rug);
  floorZones.push({ box: new THREE.Box3(new THREE.Vector3(-4.90, 0, -0.60), new THREE.Vector3(-2.30, 1, 2.00)), surface: 'rug' });
  // Kitchen vinyl.
  const vinyl = boxFrom(3.60, 0.001, -2.30, x1, 0.008, 2.70, M.splash, { cast: false });
  root.add(vinyl);
  floorZones.push({ box: new THREE.Box3(new THREE.Vector3(3.60, 0, -2.30), new THREE.Vector3(x1, 1, 2.70)), surface: 'tile' });

  /* ---- kitchen splashback ---- */
  const splash = plane(4.0, 0.56, M.splash);
  splash.position.set(x1 - 0.005, 1.20, -0.20);
  splash.rotation.y = -Math.PI / 2;
  root.add(splash);

  /* ================================================================ */
  /* Window + the world outside                                        */
  /* ================================================================ */

  const win = group('window');
  const wz0 = -3.90, wz1 = -2.30, wy0 = 0.95, wy1 = 2.15;
  // Reveal + frame.
  win.add(boxFrom(x1, wy0 - 0.06, wz0 - 0.05, x1 + 0.05, wy0, wz1 + 0.05, M.trim, { cast: false }));
  for (const [a, b] of [[wz0 - 0.05, wz0 + 0.03], [wz1 - 0.03, wz1 + 0.05]]) {
    win.add(boxFrom(x1 - 0.02, wy0, a, x1 + 0.05, wy1, b, M.trim, { cast: false }));
  }
  win.add(boxFrom(x1 - 0.02, wy1 - 0.05, wz0 - 0.05, x1 + 0.05, wy1, wz1 + 0.05, M.trim, { cast: false }));
  // Centre mullion.
  win.add(boxFrom(x1 - 0.01, wy0, (wz0 + wz1) / 2 - 0.02, x1 + 0.03, wy1, (wz0 + wz1) / 2 + 0.02, M.trim, { cast: false }));
  // Glass.
  const glass = plane(wz1 - wz0, wy1 - wy0, M.windowGlass);
  glass.position.set(x1 + 0.01, (wy0 + wy1) / 2, (wz0 + wz1) / 2);
  glass.rotation.y = -Math.PI / 2;
  win.add(glass);
  // Backdrop, set back so it parallaxes a little as the player moves. Two
  // stacked planes: the day/night phases cross-fade between them rather than
  // popping from one painting to the next.
  const skyBase = plane(9, 4.6, new THREE.MeshBasicMaterial({ toneMapped: false }));
  skyBase.position.set(x1 + 2.6, 1.9, (wz0 + wz1) / 2);
  skyBase.rotation.y = -Math.PI / 2;
  win.add(skyBase);
  const skyOver = plane(9, 4.6, new THREE.MeshBasicMaterial({
    toneMapped: false, transparent: true, opacity: 0, depthWrite: false,
  }));
  skyOver.position.set(x1 + 2.58, 1.9, (wz0 + wz1) / 2);
  skyOver.rotation.y = -Math.PI / 2;
  skyOver.renderOrder = 1;
  win.add(skyOver);
  root.add(win);

  // Venetian blinds: a stack of slats that rolls up.
  const blinds = new THREE.Group();
  blinds.position.set(x1 - 0.06, wy1 - 0.02, (wz0 + wz1) / 2);
  const slatMat = mat({ color: 0xd6cdb8, roughness: 0.9, side: THREE.DoubleSide });
  const slats = [];
  const SLAT_N = 22;
  const SLAT_GAP = 0.053;
  for (let i = 0; i < SLAT_N; i++) {
    const s = box({ size: [0.055, 0.008, wz1 - wz0 - 0.06], pos: [0, -0.02 - i * SLAT_GAP, 0], mat: slatMat });
    blinds.add(s);
    slats.push(s);
  }
  root.add(blinds);
  let blindsOpen = false;   // "open" = rolled up
  let blindsT = 0;
  let _pcWas = null;        // last tower power state, so materials swap once

  /* ================================================================ */
  /* Doors                                                             */
  /* ================================================================ */

  const frontDoor = makeDoor(M, { x: 2.80, z: z1 - 0.02, w: 1.0, rotY: Math.PI });
  root.add(frontDoor.group);
  const bathDoor = makeDoor(M, { x: -1.40, z: z0 - wall / 2, w: 1.0, rotY: 0, hinge: -1 });
  root.add(bathDoor.group);

  /* ================================================================ */
  /* Bathroom, through the door in the north wall                      */
  /* ================================================================ */

  const BATH = { x0: -2.70, x1: -0.30, z0: -7.10, z1: z0 - wall };
  const bathTile = makeMaterials.bathTile || null;
  void bathTile;

  const bath = group('bathroom');
  root.add(bath);

  // Floor, ceiling and the three outer walls (the fourth is the room's own
  // north wall, which already has the door opening in it).
  bath.add(boxFrom(BATH.x0, -0.1, BATH.z0, BATH.x1, 0, BATH.z1, M.splash, { cast: false }));
  bath.add(boxFrom(BATH.x0, h, BATH.z0, BATH.x1, h + 0.1, BATH.z1, M.ceiling, { cast: false }));
  bath.add(boxFrom(BATH.x0 - wall, 0, BATH.z0 - wall, BATH.x1 + wall, h, BATH.z0, M.wall, { cast: false }));
  bath.add(boxFrom(BATH.x0 - wall, 0, BATH.z0 - wall, BATH.x0, h, BATH.z1, M.wall, { cast: false }));
  bath.add(boxFrom(BATH.x1, 0, BATH.z0 - wall, BATH.x1 + wall, h, BATH.z1, M.wall, { cast: false }));

  // Tiled to shoulder height, painted above.
  for (const [px, py, pz, pw, ph, ry] of [
    [(BATH.x0 + BATH.x1) / 2, 0.85, BATH.z0 + 0.005, BATH.x1 - BATH.x0, 1.7, 0],
    [BATH.x0 + 0.005, 0.85, (BATH.z0 + BATH.z1) / 2, BATH.z1 - BATH.z0, 1.7, Math.PI / 2],
    [BATH.x1 - 0.005, 0.85, (BATH.z0 + BATH.z1) / 2, BATH.z1 - BATH.z0, 1.7, -Math.PI / 2],
  ]) {
    const t = plane(pw, ph, M.splash);
    t.position.set(px, py, pz);
    t.rotation.y = ry;
    bath.add(t);
  }

  addCollider([[BATH.x0 - wall, 0, BATH.z0 - wall], [BATH.x1 + wall, h, BATH.z0]]);
  addCollider([[BATH.x0 - wall, 0, BATH.z0 - wall], [BATH.x0, h, BATH.z1]]);
  addCollider([[BATH.x1, 0, BATH.z0 - wall], [BATH.x1 + wall, h, BATH.z1]]);

  floorZones.push({
    box: new THREE.Box3(
      new THREE.Vector3(BATH.x0, 0, BATH.z0),
      new THREE.Vector3(BATH.x1, 1, BATH.z1),
    ),
    surface: 'tile',
  });

  const tub = P.makeTub(M, { x0: BATH.x0 + 0.02, z0: BATH.z0 + 0.02, x1: -1.90, z1: -5.50 });
  bath.add(tub.group);
  addCollider(tub.bounds);

  const toilet = P.makeToilet(M, { x: -1.32, z: -6.62, rotY: 0 });
  bath.add(toilet.group);
  addCollider(toilet.bounds);
  const toiletCollider = colliders[colliders.length - 1];

  const bathSink = P.makeBathSink(M, { x: -0.62, z: -5.55, rotY: -Math.PI / 2 });
  bath.add(bathSink.group);
  addCollider(bathSink.bounds);

  // Bath mat, and the fluorescent tube that buzzes.
  bath.add(boxFrom(-1.85, 0.001, -5.95, -1.05, 0.016, -5.35, M.rug, { cast: false }));
  const bathTube = box({
    size: [0.9, 0.06, 0.10], pos: [(BATH.x0 + BATH.x1) / 2, h - 0.09, -5.9], mat: M.bulbOff,
  });
  bath.add(bathTube);
  const bathLight = new THREE.PointLight(0xdff0ff, 0, 5.5, 1.9);
  bathLight.position.set((BATH.x0 + BATH.x1) / 2, h - 0.16, -5.9);
  bath.add(bathLight);

  /* ================================================================ */
  /* Furniture                                                         */
  /* ================================================================ */

  const bed = P.makeBed(M, { x: -4.15, z: -3.40 });
  root.add(bed.group);
  addCollider(bed.bounds);

  const nightstand = P.makeNightstand(M, { x: -3.15, z: -4.12 });
  root.add(nightstand.group);
  addCollider(nightstand.bounds);
  // Drawer height is knee height. Without a taller proxy you have to stare
  // at your own feet to open it -- same fix as the couch and the bed.
  const drawerHit = box({
    size: [0.60, 0.72, 0.52], pos: [-3.15, 0.90, -4.12],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  drawerHit.name = 'drawer';
  root.add(drawerHit);

  const clock = P.makeAlarmClock(M, { x: -3.15, y: nightstand.top, z: -4.12, rotY: 2.4 });
  root.add(clock.group);
  // A glass of water, mostly gone.
  root.add(cylinder({ r: 0.035, h: 0.11, pos: [-3.30, nightstand.top + 0.055, -3.98], mat: M.glass }));

  const desk = P.makeDesk(M, { x: 1.90, z: -4.07, towerSticker: propTex('sticker.tower') });
  root.add(desk.group);
  addCollider(desk.bounds);

  /* Turned to face the desk. makeChair puts its backrest at local z -0.20, so
   * at rotY ~0 the back lands at world z -3.42 -- between the seated camera at
   * -3.34 and the monitor at -4.07, which is precisely the thing that was in
   * the way. Half a turn puts the back behind you, where a chair back goes. */
  const chair = P.makeChair(M, { x: 1.68, z: -3.22, rotY: Math.PI + 0.12 });
  root.add(chair.group);

  // Zyns live on the desk, where the gaming happens.
  const zynPos = new THREE.Vector3(2.36, desk.top, -3.90);
  const zyn = P.makeZynCan(M, { x: zynPos.x, y: zynPos.y, z: zynPos.z, rotY: 0.6 });
  root.add(zyn.group);
  // Lid graphic is applied once the art manifest has resolved, below.
  const zynHit = box({
    size: [0.18, 0.16, 0.18], pos: [zynPos.x, zynPos.y + 0.06, zynPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(zynHit);

  const bobble = P.makeBobblehead(M, { x: 2.86, y: desk.top, z: -4.24, rotY: -0.5 });
  root.add(bobble.group);
  // Invisible proxy so a 4cm mascot is still comfortable to look at and poke.
  const bobbleHit = box({
    size: [0.20, 0.24, 0.20], pos: [2.86, desk.top + 0.10, -4.24],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(bobbleHit);
  // Desk clutter: a can and a notepad.
  const deskCan = P.makeBeerCan(M, { x: 2.62, y: desk.top, z: -3.86, rotY: 0.6 });
  root.add(deskCan.group);
  root.add(box({ size: [0.16, 0.006, 0.22], pos: [0.95, desk.top + 0.003, -3.86], mat: M.paper, rotY: -0.2 }));

  const fridge = P.makeFridge(M, { x: 4.64, z: 1.95 });
  root.add(fridge.group);
  addCollider(fridge.bounds);

  // A dozen pasture-raised, on the shelf above the beer. The radio has
  // opinions about these.
  const fin = fridge.interior;
  const eggs = P.makeEggCarton(M, {
    x: (fin.x0 + fin.x1) / 2, y: fin.shelfY[2] + 0.012, z: fin.z0 + 0.20,
    rotY: Math.PI / 2 + 0.06, texture: propTex('eggs.carton'),
  });
  root.add(eggs.group);
  // A 7cm carton on a shelf, like every other small prop, gets a proxy.
  // Sized to sit between the shelf it is on and the one above it.
  const eggHit = box({
    size: [0.36, 0.26, 0.26], pos: [(fin.x0 + fin.x1) / 2, fin.shelfY[2] + 0.14, fin.z0 + 0.20],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  eggHit.name = 'eggs';
  root.add(eggHit);

  // Cereal on top of the fridge, because there is nowhere else for it.
  const cereal = P.makeCerealBox(M, {
    x: fridge.centre.x + 0.02, y: fridge.top, z: fridge.centre.z - 0.08,
    rotY: -Math.PI / 2 - 0.12, texture: propTex('cereal.box'),
  });
  root.add(cereal.group);

  const kitchen = P.makeKitchen(M, { z0: -1.90, z1: 1.45, wallX: x1 });
  root.add(kitchen.group);
  addCollider(kitchen.bounds);

  // Pan, sitting on the hob where it has been since the last time.
  const panPos = kitchen.hob.clone();
  const pan = P.makePan(M, { x: panPos.x, y: panPos.y, z: panPos.z, rotY: -1.2 });
  root.add(pan.group);
  const panHit = box({
    size: [0.34, 0.52, 0.34], pos: [panPos.x, panPos.y + 0.24, panPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  panHit.name = 'pan';
  root.add(panHit);

  // Smokes and an ashtray on the countertop. Positions come from the kitchen
  // layout table so nothing lands in the sink or on the hob.
  const cigsPos = kitchen.spots.smokes.clone();
  const cigs = P.makeCigarettePack(M, { x: cigsPos.x, y: cigsPos.y, z: cigsPos.z, rotY: -0.55 });
  root.add(cigs.group);
  // A 4cm pack is a fiddly thing to aim at; give it a proxy like the bobblehead.
  const cigsHit = box({
    size: [0.22, 0.20, 0.20], pos: [cigsPos.x + 0.02, cigsPos.y + 0.08, cigsPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(cigsHit);

  const ashtray = P.makeAshtray(M, {
    x: kitchen.spots.ashtray.x, y: kitchen.top, z: kitchen.spots.ashtray.z, rotY: 0.4,
  });
  root.add(ashtray.group);

  // Bottle of whiskey. Hits about twice as hard as a beer.
  const whiskeyPos = kitchen.spots.bottle.clone();
  // Label out toward the room, so you read it as you walk up.
  const whiskey = P.makeWhiskeyBottle(M, {
    x: whiskeyPos.x, y: whiskeyPos.y, z: whiskeyPos.z, rotY: -Math.PI / 2 + 0.18,
    labelImage: propTex('label.whiskey')?.image || null,
  });
  root.add(whiskey.group);
  const whiskeyHit = box({
    size: [0.22, 0.34, 0.22], pos: [whiskeyPos.x, whiskeyPos.y + 0.15, whiskeyPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(whiskeyHit);
  root.add(P.makeShotGlass(M, {
    x: kitchen.spots.shot.x, y: kitchen.top, z: kitchen.spots.shot.z,
  }).group);

  const couch = P.makeCouch(M, { x: -4.55, z: 0.70 });
  root.add(couch.group);
  addCollider(couch.bounds);

  const table = P.makeCoffeeTable(M, { x: -3.30, z: 0.70 });
  root.add(table.group);
  addCollider(table.bounds);

  const pizza = P.makePizzaBox(M, { x: -3.48, y: table.top, z: 0.74, rotY: 0.26 });
  root.add(pizza.group);
  /* Standing, not crushed. Same reason as the one on the shelf: a crumpled can
   * at table height reads as a bent metal cylinder rather than as a can, and
   * you spend a moment working out what it is instead of not noticing it. The
   * crushed ones are the pool below, which you see him make. */
  root.add(P.makeBeerCan(M, { x: -2.92, y: table.top, z: 0.86, rotY: 1.1 }).group);
  root.add(P.makeBeerCan(M, { x: -3.70, y: table.top, z: 0.52, rotY: -0.4 }).group);

  // The other end of the coffee table. Neither of these is on the way out.
  // The table's front edge IS z 0.42, so the old position had it half off.
  /* Empties, pooled and hidden until you finish one. Lying on their side,
   * because a can you have put down does not stand up. */
  const emptyCans = [];
  let emptyCanNext = 0;
  for (let i = 0; i < 6; i++) {
    const c = P.makeBeerCan(M, { x: 0, y: 0, z: 0, crushed: true }).group;
    c.visible = false;
    root.add(c);
    emptyCans.push(c);
  }

  const bongPos = new THREE.Vector3(-3.06, table.top, 0.63);
  const bong = P.makeBong(M, { x: bongPos.x, y: bongPos.y, z: bongPos.z, rotY: -0.7 });
  root.add(bong.group);
  const bongHit = box({
    size: [0.20, 0.42, 0.20], pos: [bongPos.x, bongPos.y + 0.20, bongPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(bongHit);

  const shroomPos = new THREE.Vector3(-3.66, table.top, 0.52);
  const shrooms = P.makeMushrooms(M, { x: shroomPos.x, y: shroomPos.y, z: shroomPos.z, rotY: 0.5 });
  root.add(shrooms.group);
  const shroomHit = box({
    size: [0.20, 0.18, 0.18], pos: [shroomPos.x, shroomPos.y + 0.07, shroomPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(shroomHit);

  interaction.register(bongHit, {
    label: () => 'Pack a <b>bowl</b>',
    hold: 0.9,
    holdLabel: () => 'Hold it…',
    onUse: () => ctx.onBong?.(),
  });
  interaction.register(shroomHit, {
    label: () => 'Take some <b>mushrooms</b>',
    hold: 1.1,
    holdLabel: () => 'Are you sure…',
    onUse: () => ctx.onShrooms?.(),
  });

  const sideboard = P.makeSideboard(M, { x: -1.00, z: 4.22 });
  root.add(sideboard.group);
  addCollider(sideboard.bounds);

  const radio = P.makeRadio(M, { x: -1.10, y: sideboard.top, z: 4.16, rotY: Math.PI });
  root.add(radio.group);

  const plant = P.makePlant(M, { x: 3.95, z: 3.75 });
  root.add(plant.group);
  addCollider(plant.bounds);

  const lamp = P.makeFloorLamp(M, { x: -4.60, z: -1.30 });
  root.add(lamp.group);
  addCollider(lamp.bounds);

  const ceilLight = P.makeCeilingLight(M, { x: -0.40, z: 0.20 });
  root.add(ceilLight.group);

  const shelf = P.makeShelf(M, { x: -2.70, y: 1.46, z: -4.34 });
  root.add(shelf.group);
  const books = P.makeBooks(M, { x: -3.14, y: 1.478, z: -4.34, count: 9 });
  root.add(books.group);
  /* Left standing rather than crushed. Crumpled, at shelf height, in the
   * corner of your eye, it does not read as a can someone put down -- it reads
   * as a small grey object at a strange angle, which is a thing you notice and
   * then have to work out. Upright it is instantly a beer can on a shelf. */
  root.add(P.makeBeerCan(M, { x: -2.30, y: 1.478, z: -4.34 }).group);

  /* The glue and the tissues, on the desk under the crooked frame. */
  /* Set dressing only -- deliberately NOT interactive.
   *
   * The bit dies the moment the game offers you a thing called glue, so the
   * bottle is scenery at the far end of the desk and the whole sequence is
   * started from the crooked frame instead. What he fetches to fix it is not
   * announced until it is on the wall. */
  const gluekit = P.makeGlueAndTissues(M, { x: 0.98, y: 0.74, z: -3.92 });
  root.add(gluekit.group);

  const cork = P.makeCorkboard(M, { x: -0.10, y: 1.58, z: -4.40, rotY: 0 });
  root.add(cork.group);

  const wallClock = P.makeWallClock(M, { x: -1.00, y: 1.95, z: 4.40, rotY: Math.PI });
  root.add(wallClock.group);

  /* Candles, either side of the shrine. Lit. Nobody lights candles in a
   * cupboard for the light -- there is a bulb six inches above them -- so the
   * only reason for these is the two photographs they are standing next to,
   * which is the whole point and is never said out loud. */
  const candles = [
    /* In FRONT of the photographs, not level with them -- set alongside and
     * they are simply hidden behind the frames from the only angle you can
     * ever look at this from. */
    P.makeCandle(M, { x: (CLOSET.x0 + CLOSET.x1) / 2 - 0.19, y: 0.002, z: CLOSET.back - 0.33, h: 0.115, phase: 0 }),
    P.makeCandle(M, { x: (CLOSET.x0 + CLOSET.x1) / 2 + 0.20, y: 0.002, z: CLOSET.back - 0.30, h: 0.082, phase: 2.4, colour: 0xe8dcc4 }),
    P.makeCandle(M, { x: (CLOSET.x0 + CLOSET.x1) / 2 + 0.02, y: 0.002, z: CLOSET.back - 0.39, h: 0.062, phase: 4.1 }),
  ];
  for (const c of candles) root.add(c.group);
  /* One clock for all three, each with its own phase. Independent timers
   * started on the same frame breathe in unison, which reads as a machine. */
  ticks.push((dt, elapsed) => {
    for (const c of candles) c.flicker(elapsed);
  });

  /* Back against the south wall beside the front door, which is where boots
   * get kicked off. At z 3.90 they sat 46cm out into the floor, in the middle
   * of the walkway, looking placed rather than dropped. The skirting starts at
   * z 4.48, so 4.30 puts the heels near it without clipping through. */
  /* ---- taking a slice ----
   *
   * The box is on the table with three already gone. Taking one is a pickup
   * like any other; eating it happens in the hand, not here.
   */
  const pizzaHit = box({
    size: [0.34, 0.14, 0.34], pos: [pizza.group.position.x, table.top + 0.07, pizza.group.position.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(pizzaHit);
  interaction.register(pizzaHit, {
    label: () => (pizza.slicesLeft() ? 'Take a <b>slice</b>' : 'The box is <b>empty</b>'),
    enabled: () => pizza.slicesLeft() > 0 && !inventory.full,
    onUse: () => {
      if (!inventory.add('slice')) return;
      pizza.takeSlice();
      audio.play('pizza.take', { volume: 0.5, position: pizza.group.position });
      ctx.onNote?.('slice');
    },
  });

  /* ---- the television ----
   *
   * Facing the couch, past the coffee table. It plays a channel list rather
   * than running an OS: you never use this thing, you only ever change what is
   * on it from across the room. See core/tv.js.
   */
  const tv = P.makeTv(M, { x: -2.16, z: 0.72, rotY: -Math.PI / 2, w: 1.12 });
  root.add(tv.group);
  addCollider(tv.bounds);
  const tvGlow = new THREE.PointLight(0x9fb4cc, 0, 4.4, 2.0);
  tvGlow.position.copy(tv.screenPos).add(new THREE.Vector3(0.28, 0, 0));
  root.add(tvGlow);
  const tvHit = box({
    size: [0.44, 0.90, 1.30], pos: [tv.screenPos.x + 0.22, 0.85, tv.screenPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(tvHit);
  interaction.register(tvHit, {
    label: () => (state.tvOn ? 'Change <b>channel</b>' : 'Turn the <b>telly</b> on'),
    hold: 0.5,
    onTap: () => ctx.onTvTap?.(),
    onUse: () => ctx.onTvHold?.(),
  });

  /* ---- the revolver ----
   *
   * On the coffee table with everything else. It is not hidden, it is not
   * locked in anything, and nobody in this game ever remarks on it being
   * there, which is the joke. Six rounds and nothing to reload with.
   */
  const gunPos = new THREE.Vector3(-2.90, table.top, 0.60);
  const revolver = P.makeRevolver(M, { x: gunPos.x, y: gunPos.y, z: gunPos.z, rotY: 2.35 });
  root.add(revolver.group);
  const gunHit = box({
    size: [0.20, 0.10, 0.20], pos: [gunPos.x, gunPos.y + 0.05, gunPos.z],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(gunHit);
  interaction.register(gunHit, {
    label: () => 'Pick up the <b>revolver</b>',
    enabled: () => revolver.group.visible && !inventory.full,
    onUse: () => {
      if (!inventory.add('gun')) return;
      revolver.group.visible = false;
      audio.play('gun.pickup', { volume: 0.55, position: gunPos });
      ctx.onNote?.('gun');
    },
  });
  /** Put it back where it came from. */
  const dropGun = () => {
    revolver.group.visible = true;
    audio.play('gun.pickup', { volume: 0.4, position: gunPos });
  };

  root.add(P.makeBoots(M, { x: 2.20, z: 4.30, rotY: 0.4 }).group);
  root.add(P.makeLaundry(M, { x: -2.55, z: -3.55 }).group);
  root.add(P.makeCapOnPeg(M, { x: 0.10, y: 1.78, z: 4.42, rotY: Math.PI }).group);

  /* ---- the tap ----
   * A basin you can actually run. It does nothing and changes nothing, which
   * is the point: it is the sort of thing you do in your own kitchen while
   * thinking about something else. */
  const tapWater = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.016, 0.30, 8, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: 0xcfe6f2, roughness: 0.05, transmission: 0.75,
      transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  tapWater.position.set(kitchen.tapPos.x, kitchen.tapPos.y - 0.15, kitchen.tapPos.z);
  tapWater.visible = false;
  root.add(tapWater);

  const tapHit = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  tapHit.position.copy(kitchen.tapPos);
  root.add(tapHit);
  interaction.register(tapHit, {
    label: () => (state.tapOn ? 'Turn the <b>tap</b> off' : 'Turn the <b>tap</b> on'),
    onUse: () => {
      state.tapOn = !state.tapOn;
      tapWater.visible = state.tapOn;
      audio.play('tap.squeak', { volume: 0.5, position: kitchen.tapPos });
      if (state.tapOn) {
        audio.startLoop('tap.run', {
          volume: 0.20, position: kitchen.basinPos, ref: 1.2, maxDist: 8,
        });
        ctx.onTap?.();
      } else {
        audio.stopLoop('tap.run', 0.35);
      }
    },
  });

  /* ---- light switch by the front door ---- */
  const switchPlate = group('switchplate');
  switchPlate.position.set(1.95, 1.18, z1 - 0.01);
  switchPlate.add(box({ size: [0.09, 0.13, 0.012], pos: [0, 0, 0], mat: M.trim }));
  const toggle = box({ size: [0.03, 0.05, 0.016], pos: [0, 0.01, -0.012], mat: M.trim });
  switchPlate.rotation.y = Math.PI;
  switchPlate.add(toggle);
  root.add(switchPlate);

  /* ================================================================ */
  /* Wall art                                                          */
  /* ================================================================ */

  const frames = [];

  for (const slot of [...WALL_SLOTS, ...BATH_SLOTS]) {
    const g = gear.get(slot.slot);
    const height = slot.h * (g.scale || 1);
    const width = height * (g.aspect || 0.8);
    const f = P.makeFrame(M, {
      x: slot.x, y: slot.y, z: slot.z, rotY: slot.rotY,
      w: width, h: height, texture: g.texture,
    });
    root.add(f.group);
    frames.push({ ...slot, mesh: f.group, info: g });
  }

  const banners = [];
  for (const slot of BANNER_SLOTS) {
    const g = gear.get(slot.slot);
    const bh = slot.h * (g.scale || 1);
    const b = P.makeBanner(M, {
      x: slot.x, y: slot.y, z: slot.z, rotY: slot.rotY,
      w: bh * (g.aspect || 0.8), h: bh, texture: g.texture,
    });
    root.add(b.group);
    banners.push({ ...slot, mesh: b.group, info: g });
    frames.push({ ...slot, mesh: b.group, info: g });
  }

  // Round crest above the bookshelf.
  const crestGear = gear.get(CREST_SLOT.slot);
  const crest = P.makeRoundCrest(M, {
    x: CREST_SLOT.x, y: CREST_SLOT.y, z: CREST_SLOT.z, rotY: CREST_SLOT.rotY,
    r: CREST_SLOT.r * (crestGear.scale || 1), texture: crestGear.texture,
  });
  root.add(crest.group);
  frames.push({ ...CREST_SLOT, mesh: crest.group, info: crestGear });

  /* ---- the closet ----
   *
   * A rail of shirts with something behind them. The clothes are genuinely in
   * the way -- a rail you can see past is a rail with nothing to find -- so
   * the picture is not visible, or interactable, or hinted at, until you have
   * shoved them. Pushing them back covers it up again, which is the joke: it
   * is his flat and he is the one who hung it there.
   */
  /* The garment art is a studio product shot. Cut the white away so it hangs
   * as a shirt rather than as a rectangle with a shirt printed on it -- and
   * fall back to the plain coloured body if the image is not there. */
  const dieCutSlot = (slot) => {
    const g = gear.get(slot);
    if (!g?.real || !g.texture?.image) return null;
    try { return T.dieCut(g.texture.image); } catch { return null; }
  };
  const closetBack = gear.get('closet.back');
  const closet = P.makeCloset(M, {
    x0: CLOSET.x0 + 0.02, x1: CLOSET.x1 - 0.02, z0: z1, z1: CLOSET.back, h: CLOSET.h,
    back: closetBack?.real
      ? { texture: closetBack.texture, w: 0.40, h: 0.40 / (closetBack.aspect || 0.75), y: 1.16 }
      : null,
    garments: [
      { cut: dieCutSlot('closet.shirt.a'), colour: 0x6b4f9e, w: 0.34, h: 0.58 },
      { colour: 0x2a3038, w: 0.31, h: 0.55 },
      { cut: dieCutSlot('closet.shirt.b'), colour: 0x6b4f9e, w: 0.34, h: 0.58 },
      { colour: 0x4a3f33, w: 0.29, h: 0.62 },
    ],
  });
  root.add(closet.group);

  /* A closet is a box with one open side, so nothing in it catches the ceiling
   * spot and the whole interior renders as a silhouette -- the shirts came out
   * as black slabs and the picture at the back was invisible whether the
   * clothes were over it or not, which defeats the entire point of the thing.
   * A dim bulb inside, of the kind that is in every closet in every flat. */
  /* Dim, and it has to be. Bloom is thresholded at 0.82, so anything this
   * light pushes past that blooms -- and a 60cm box with a lamp 16cm off the
   * ceiling pushes almost all of itself past it, which is where the glow off
   * the top of the closet was coming from. Enough to lift the shirts out of
   * silhouette and no more. */
  const closetLight = new THREE.PointLight(0xffe9c4, 0.85, 1.45, 2.2);
  closetLight.position.set((CLOSET.x0 + CLOSET.x1) / 2, CLOSET.h - 0.16, CLOSET.back - 0.42);
  root.add(closetLight);

  /* The rail is the thing you interact with, not the picture. A hit box in
   * front of the clothes rather than on them, because they move and a target
   * that slides out from under the crosshair mid-press is unusable. */
  const closetHit = box({
    size: [CLOSET.x1 - CLOSET.x0 - 0.06, 1.05, 0.34],
    pos: [(CLOSET.x0 + CLOSET.x1) / 2, 1.18, z1 + 0.26],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  root.add(closetHit);
  interaction.register(closetHit, {
    label: () => (state.closetOpen ? 'Push the clothes <b>back</b>' : 'Push the clothes <b>aside</b>'),
    onUse: () => {
      state.closetOpen = !state.closetOpen;
      audio.play('closet.slide', {
        position: closet.centre, volume: 0.55, muffle: 2600,
      });
      ctx.onCloset?.(state.closetOpen);
    },
  });

  /* Sliding. Each hanger runs to its own target rather than the whole rail
   * moving as one -- they bunch at the far end, the way clothes actually do,
   * and the ones already there hardly move. */
  ticks.push((dt) => {
    const k = Math.min(1, dt * 7);
    for (const hgr of closet.hangers) {
      const want = state.closetOpen ? hgr.bunch : hgr.home;
      hgr.mesh.position.x += (want - hgr.mesh.position.x) * k;
    }
  });

  /* The shrine. Two photographs of Booski on the closet floor, propped against
   * the back wall. Nobody keeps photographs of their friend on the floor of a
   * cupboard. These are on the floor of a cupboard. */
  /* One of them is the shrine and the other is a supporting photograph, so
   * they are not the same size. The big one sits square against the back wall
   * with the candles in front of it; the small one is off to the side, tilted,
   * the way a second picture ends up when there was only room for one. */
  for (const [slot, sx, tilt, dz, size] of [
    /* shrine.b pulled in and pushed forward. At +0.19 its outer edge reached
     * x 4.982 against a closet that stops at 4.96 -- it was inside the side
     * wall -- and it was still touching shrine.a with 13mm of overlap. */
    ['shrine.a', -0.02, 0.05, 0, 0.22], ['shrine.b', 0.145, -0.26, 0.155, 0.125],
  ]) {
    const g = gear.get(slot);
    if (!g?.real) continue;
    const sf = P.makeStandingFrame(M, {
      x: (CLOSET.x0 + CLOSET.x1) / 2 + sx,
      /* Standing frames hang their easel leg below the origin, so a photo
       * "on the floor" has to sit ON it, not at it. */
      y: 0.035,
      z: CLOSET.back - 0.16 - dz,
      rotY: Math.PI + tilt,
      w: size * (g.aspect || 0.8),
      h: size,
      texture: g.texture,
    });
    root.add(sf.group);
    frames.push({ slot, mesh: sf.group, info: g, onFloor: true });
  }


  // Framed photos standing on the sideboard and the desk.
  for (const slot of STANDING_SLOTS) {
    const g = gear.get(slot.slot);
    const height = slot.h * (g.scale || 1);
    const sf = P.makeStandingFrame(M, {
      x: slot.x, y: slot.y, z: slot.z, rotY: slot.rotY,
      w: height * (g.aspect || 0.8), h: height, texture: g.texture,
    });
    root.add(sf.group);
    frames.push({ ...slot, mesh: sf.group, info: g });
  }

  // Zyn tin lid graphic.
  const zynLid = gear.get('zyn.lid');
  if (zynLid?.texture) {
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.0345, 28),
      mat({ map: zynLid.texture, roughness: 0.4 }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.0052;
    zyn.lid.add(face);
  }

  // Sticker on the fridge door, parented so it swings with it.
  const magnetGear = gear.get(FRIDGE_MAGNET.slot);
  const magnetW = FRIDGE_MAGNET.w * (magnetGear.scale || 1);
  const magnet = P.makeDecal(M, {
    texture: magnetGear.texture,
    w: magnetW,
    h: magnetW / (magnetGear.aspect || 1),
    magnet: true,
  });
  magnet.group.name = 'doorface:sticker';
  magnet.group.position.set(-0.034, 0.86, -0.36);
  magnet.group.rotation.set(0, -Math.PI / 2, 0.06);
  fridge.door.add(magnet.group);
  frames.push({ slot: FRIDGE_MAGNET.slot, mesh: magnet.group, info: magnetGear });

  for (const f of FRIDGE_PHOTOS) {
    const g = gear.get(f.slot);
    const w = f.w * (g.scale || 1);
    const photo = P.makeDecal(M, {
      texture: g.texture, w, h: w / (g.aspect || 1),
      // Stickers are stuck to the door; photographs are held on by a magnet.
      magnet: !f.sticker, sticker: !!f.sticker,
    });
    photo.group.name = `doorface:${f.slot}`;
    photo.group.position.set(-0.034, f.y, f.z);
    photo.group.rotation.set(0, -Math.PI / 2, f.tilt);
    fridge.door.add(photo.group);
    frames.push({ ...f, mesh: photo.group, info: g });
  }

  /* ================================================================ */
  /* Lighting                                                          */
  /* ================================================================ */

  const hemi = new THREE.HemisphereLight(0x6d7d9e, 0x352a20, 0.85);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x8d94a8, 0.45);
  scene.add(ambient);

  // Dawn through the east window.
  const sun = new THREE.DirectionalLight(0xffc49a, 1.35);
  sun.position.set(11.5, 4.2, -3.1);
  sun.target.position.set(-1.0, 0.6, -1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 24;
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -3;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.022;
  scene.add(sun, sun.target);

  // Cool fill bouncing off the far wall so shadows are not pitch black.
  const fill = new THREE.DirectionalLight(0x8fa6cf, 0.55);
  fill.position.set(-6, 3.5, 4);
  scene.add(fill);

  // Ceiling fixture.
  const ceilSpot = new THREE.SpotLight(0xffe0b0, 0, 7.5, 1.24, 0.62, 1.4);
  ceilSpot.position.copy(ceilLight.pos);
  ceilSpot.target.position.set(ceilLight.pos.x, 0, ceilLight.pos.z);
  ceilSpot.castShadow = false;   // enabled with the switch; see the tick below
  ceilSpot.shadow.mapSize.set(1024, 1024);
  ceilSpot.shadow.bias = -0.0018;
  ceilSpot.shadow.normalBias = 0.02;
  scene.add(ceilSpot, ceilSpot.target);

  const lampLight = new THREE.PointLight(0xffcf90, 0, 5.2, 1.9);
  lampLight.position.copy(lamp.pos);
  scene.add(lampLight);

  // Monitor glow, driven by whatever is on screen.
  const screenGlow = new THREE.PointLight(0x88b8ff, 0, 3.4, 2.0);
  screenGlow.position.set(desk.monitorPos.x, desk.monitorPos.y, desk.monitorPos.z + 0.35);
  scene.add(screenGlow);

  const towerGlow = new THREE.PointLight(0x4aa8ff, 0, 1.5, 2.2);
  towerGlow.position.set(2.76, 0.30, -4.00);
  scene.add(towerGlow);

  /* ================================================================ */
  /* State                                                             */
  /* ================================================================ */

  const inventory = new Inventory(5);
  const state = {
    fridgeOpen: false,
    fridgeT: 0,
    beersLeft: fridge.beerSlots.length,
    lightsOn: false,
    lampOn: false,
    pcOn: false,
    /** Running, and nobody is going to turn it off for you. */
    tapOn: false,
    /** The frame is back up and the bottle is empty. */
    glued: false,
    /** Messages on the second monitor you have not looked at. */
    chatUnread: 0,
    radioOn: false,
    blindsOpen: false,
    /* Defined as an accessor over `inventory` just below -- reading it gives
     * whatever is in the selected slot, assigning picks something up or puts
     * it down. See core/inventory.js for why it is done that way. */
    beersDrunk: 0,
    cigsLeft: 17,
    cigsSmoked: 0,
    whiskeyLeft: 6,      // pulls remaining in the bottle
    whiskeyDrunk: 0,
    bathDoorOpen: false,
    bathVisited: false,
    bathLightOn: false,
    lightsManual: false,   // set once the player works the switch themselves
    /** Mains multiplier and how long it has left. 1 is normal service. */
    sag: 1,
    sagT: 0,
    bladder: 0.12,       // 0..1; drinking fills it
    zynsLeft: 15,
    zynsTaken: 0,
    lipPacked: false,
    bowel: 0,            // 0..1; cigarettes fill it. 4 of them and you are running
    urgeAnnounced: false,
    toiletHinted: false,   // he only points out the cigarette trick once
    underBedOut: false,    // the photograph under the bed, pulled part way out
    underBedSeen: false,   // he only says the line the first time

    flushable: false,

    /* ---- getting ready for Wednesday. Once done, these stay done. ---- */
    showered: false,
    dressed: false,
    fed: false,
    /** Raw eggs are out of the fridge and in your hands. */
    hasEggs: false,
    /** 'raw' while they cook, 'done' once they are ready to eat. */
    panState: null,
    /** Deaths in Counter-Squatch. Five of them is "a game with the boys". */
    csDeaths: 0,
    /** The reply to HR has actually gone. */
    repliedHR: false,
    /** The clothes are shoved to one end and the picture is showing. */
    closetOpen: false,
    /** The telly is on. */
    tvOn: false,
  };
  bindHeldItem(state, inventory);

  /* ---- fridge ---- */
  audio.startLoop('fridge.hum', {
    volume: 0.16, position: new THREE.Vector3(4.5, 1.0, 1.95), ambience: true, ref: 1.0, maxDist: 9,
  });

  const setFridge = (open) => {
    if (state.fridgeOpen === open) return;
    state.fridgeOpen = open;
    if (open) ctx.onNote?.('fridge');
    audio.play(open ? 'fridge.open' : 'fridge.close', {
      position: new THREE.Vector3(4.3, 1.0, 1.6), volume: 0.9,
    });
    if (open) {
      audio.play('fridge.bottles', { position: new THREE.Vector3(4.5, 0.8, 1.9), volume: 0.5, delay: 0.25 });
      // Standing in the cold light with the door open is a thinking pose.
      audio.say('fridge', { chance: 0.3, delay: 1.2 });
    }
    hud.say(open
      ? 'Cold air. Six beers, half a lime, and something you should throw out.'
      : '', open ? 3600 : 1);
  };

  interaction.register(fridge.doorPivot, {
    label: () => (state.fridgeOpen ? 'Close the <b>fridge</b>' : 'Open the <b>fridge</b>'),
    onUse: () => setFridge(!state.fridgeOpen),
  });

  // Each beer in the door is grabbable while the door is open.
  fridge.beerSlots.forEach((can, i) => {
    interaction.register(can, {
      label: () => 'Take a <b>beer</b>',
      enabled: () => state.fridgeOpen && can.visible && !inventory.full,
      onUse: () => {
        can.visible = false;
        state.beersLeft--;
        state.heldItem = 'beer';
        hud.setHand({ icon: '🍺', name: 'Cold beer', hint: 'Hold [F] to drink' });
        audio.play('can.set', { volume: 0.5 });
        hud.toast('Picked up a beer', 'good');
        void i;
      },
    });
  });

  /* ---- zyns ---- */
  interaction.register(zynHit, {
    label: () => {
      if (state.lipPacked) return 'You already have one in';
      return state.zynsLeft > 0
        ? `Pack a <b>lip</b> <span style="opacity:.6">(${state.zynsLeft})</span>`
        : 'An empty <b>tin</b>';
    },
    onUse: () => {
      if (state.lipPacked) { hud.say('One at a time. You are not an animal.'); return; }
      if (state.zynsLeft <= 0) { hud.say('Empty tin. You have been busy.'); return; }
      ctx.onZyn?.();
    },
  });

  /* ---- cigarettes ---- */
  interaction.register(cigsHit, {
    label: () => (state.cigsLeft > 0
      ? `Take the <b>smokes</b> <span style="opacity:.6">(${state.cigsLeft})</span>`
      : 'An empty <b>pack</b>'),
    enabled: () => !inventory.full && cigs.group.visible,
    onUse: () => {
      if (state.cigsLeft <= 0) {
        hud.say('Empty. You knew it was empty.');
        return;
      }
      cigs.group.visible = false;
      state.heldItem = 'cigs';
      hud.setHand({ icon: '🚬', name: `Smokes (${state.cigsLeft})`, hint: 'Hold [F] to light one' });
      audio.play('cig.pack', { position: cigsPos, volume: 0.7 });
      hud.toast('Picked up the smokes', 'good');
    },
  });

  interaction.register(ashtray.group, {
    label: () => 'The <b>ashtray</b>',
    onUse: () => {
      audio.play('frame.adjust', { volume: 0.3 });
      hud.say(state.cigsSmoked > 2
        ? 'Filling up nicely. You are having a morning.'
        : 'Three dead ones and a lot of ash.');
    },
  });

  /* ---- whiskey ---- */
  interaction.register(whiskeyHit, {
    label: () => (state.whiskeyLeft > 0
      ? 'Pick up the <b>whiskey</b>'
      : 'An empty <b>bottle</b>'),
    enabled: () => !inventory.full && whiskey.group.visible,
    onUse: () => {
      if (state.whiskeyLeft <= 0) {
        hud.say('Dead soldier. You did that.');
        return;
      }
      whiskey.group.visible = false;
      state.heldItem = 'whiskey';
      hud.setHand({ icon: '🥃', name: "Jack & Daniel's", hint: 'Hold [F] to take a pull' });
      audio.play('whiskey.cap', { position: whiskeyPos, volume: 0.7 });
      hud.toast('Picked up the whiskey');
      hud.say('Old No. 7½. Sour mash. A questionable decision, at this hour.');
    },
  });

  /* ---- radio ---- */
  const radioPos = new THREE.Vector3(-1.10, sideboard.top + 0.12, 4.16);
  interaction.register(radio.group, {
    label: () => (state.radioOn
      ? 'Turn off the <b>radio</b> &middot; hold to <b>tune</b> &nbsp;<span style="opacity:.6">[R] skip</span>'
      : 'Turn on the <b>radio</b> &middot; hold to <b>tune</b>'),
    holdLabel: () => 'Tuning the <b>dial</b>…',
    hold: 0.6,
    onTap: () => ctx.onRadioToggle?.(),
    onUse: () => ctx.onRadioTune?.(),
  });

  /* ---- lights ---- */
  const setCeiling = (on, auto = false) => {
    if (!auto) state.lightsManual = true;
    state.lightsOn = on;
    ceilLight.bulb.material = on ? M.bulbOn : M.bulbOff;
    audio.play('switch.click', { position: new THREE.Vector3(1.95, 1.18, 4.4), volume: 0.7 });
  };
  interaction.register(switchPlate, {
    label: () => (state.lightsOn ? 'Lights <b>off</b>' : 'Lights <b>on</b>'),
    onUse: () => { ctx.onNote?.('lights'); setCeiling(!state.lightsOn); },
  });

  /**
   * Pull the mains down for a moment, the way they go when something big kicks
   * in two floors away. Nothing switches and nothing is touched -- the lights
   * that are on get dimmer and come back, the lights that are off stay off,
   * which is what makes it deniable.
   * @param {number} to      multiplier at the bottom of the dip, 0..1
   * @param {number} seconds how long before service resumes
   */
  const dipLights = (to = 0.3, seconds = 0.7) => {
    state.sag = to;
    state.sagT = seconds;
  };

  const setLamp = (on) => {
    state.lampOn = on;
    lamp.bulb.material = on ? M.bulbOn : M.bulbOff;
    audio.play('switch.click', { position: lamp.pos, volume: 0.6 });
  };
  interaction.register(lamp.group, {
    label: () => (state.lampOn ? 'Switch off the <b>lamp</b>' : 'Switch on the <b>lamp</b>'),
    onUse: () => setLamp(!state.lampOn),
  });

  /* ---- blinds ---- */
  interaction.register(blinds, {
    label: () => (state.blindsOpen ? 'Lower the <b>blinds</b>' : 'Raise the <b>blinds</b>'),
    onUse: () => {
      state.blindsOpen = !state.blindsOpen;
      blindsOpen = state.blindsOpen;
      ctx.onNote?.('blinds');
      audio.play('window.blinds', { position: new THREE.Vector3(4.8, 1.7, -3.1), volume: 0.8 });
      hud.say(state.blindsOpen
        ? 'Sunrise, whether you asked for it or not.'
        : 'Better. Gaming light.');
    },
  });

  /* ---- PC ---- */
  interaction.register(desk.panel, {
    label: () => (state.pcOn ? 'Sit down and <b>play</b>' : 'Sit down at the <b>PC</b>'),
    onUse: () => ctx.onSitPC?.(),
  });
  interaction.register(chair.group, {
    label: () => 'Sit in the <b>chair</b>',
    onUse: () => ctx.onSitPC?.(),
  });

  /* ---- somewhere to put yourself ----
   * Half the point of the place is that you can stop moving. The couch, the
   * edge of the bed and the bed itself are all things you can just be on.
   *
   * Both get an invisible hit volume standing well proud of the cushions.
   * A seat is knee height, so aiming at the real geometry from standing means
   * looking almost straight down; these let a glance at the furniture count.
   */
  const seatProxy = (name, [ax0, ay0, az0], [ax1, ay1, az1]) => {
    const m = boxFrom(ax0, ay0, az0, ax1, ay1, az1,
      new THREE.MeshBasicMaterial({ visible: false }), { cast: false, receive: false });
    m.name = name;
    root.add(m);
    return m;
  };

  // Seats stay unaimable while you are already in one -- otherwise the
  // prompt to sit down follows you onto the cushion.
  const standing = () => !ctx.isSeated?.();

  interaction.register(seatProxy('couchSeat', [-4.78, 0.40, -0.33], [-4.06, 1.06, 1.73]), {
    label: () => 'Sit on the <b>couch</b>',
    enabled: standing,
    onUse: () => { ctx.onNote?.('sit'); ctx.onSitCouch?.(); },
  });
  interaction.register(seatProxy('bedSeat', [-4.82, 0.62, -4.34], [-3.44, 1.10, -2.44]), {
    label: () => 'Sit on the <b>bed</b> &middot; hold to <b>lie down</b>',
    holdLabel: () => 'Lying <b>down</b>…',
    hold: 0.55,
    enabled: standing,
    onTap: () => { ctx.onNote?.('sit'); ctx.onSitBed?.(); },
    onUse: () => ctx.onLieBed?.(),
  });

  /* ---- getting ready ----
   * None of these announce themselves as tasks. They are things you would do
   * anyway; the front door is the only place they are ever added up.
   */
  interaction.register(tub.group, {
    label: () => (state.showered ? 'You have had a <b>shower</b>' : 'Have a <b>shower</b>'),
    enabled: () => !state.showered,
    onUse: () => ctx.onShower?.(),
  });

  interaction.register(drawerHit, {
    label: () => (state.dressed ? 'Already <b>changed</b>' : 'Find a <b>clean shirt</b>'),
    enabled: () => !state.dressed,
    hold: 0.8,
    holdLabel: () => 'Getting <b>dressed</b>…',
    onUse: () => {
      state.dressed = true;
      audio.play('bed.rustle', { volume: 0.55 });
      ctx.onDressed?.();
    },
  });

  // Eggs come out of the fridge; the pan is where they end up.
  interaction.register(eggHit, {
    label: () => 'Take the <b>eggs</b>',
    enabled: () => state.fridgeOpen && !state.hasEggs && !state.fed && !state.panState,
    onUse: () => {
      state.hasEggs = true;
      audio.play('can.set', { volume: 0.4 });
      hud.setHand({ icon: '🥚', name: 'Two eggs', hint: 'The hob is over there' });
      hud.say('Pasture raised. Regenerative. Certified humane. '
        + '<em>Irish has a whiteboard about these.</em>', 5000);
    },
  });

  interaction.register(panHit, {
    label: () => {
      if (state.panState === 'done') return 'Eat the <b>eggs</b>';
      if (state.panState === 'raw') return 'They are <b>cooking</b>';
      if (state.hasEggs) return 'Crack them into the <b>pan</b>';
      return 'A <b>pan</b>. Empty.';
    },
    // Always aimable, even empty. "A pan. Empty." is how you work out that
    // the pan is part of anything at all.
    onUse: () => {
      if (state.panState === 'done') ctx.onEat?.();
      else if (state.hasEggs) ctx.onCook?.();
      else if (state.fed) hud.say('Washed up, near enough.', 3000);
      else hud.say('A pan. There are eggs in the fridge.', 3600);
    },
  });

  /* ---- flavour interactions ---- */
  interaction.register(frontDoor.group, {
    label: () => 'Leave the <b>apartment</b>',
    onUse: () => ctx.onLeave?.(),
  });
  interaction.register(bathDoor.group, {
    label: () => (state.bathDoorOpen ? 'Close the <b>bathroom</b> door' : 'Open the <b>bathroom</b>'),
    onUse: () => {
      state.bathDoorOpen = !state.bathDoorOpen;
      audio.play('door.knob', { position: new THREE.Vector3(-1.4, 1.1, -4.3), volume: 0.7 });
      if (state.bathDoorOpen && !state.bathVisited) {
        state.bathVisited = true;
        state.bathLightOn = true;
        hud.say('The light buzzes. It has always buzzed.');
      }
    },
  });

  /* Under the bed: a framed photograph, face down, most of the way into the
   * dark. Pulling it out is the whole of the easter egg -- it never comes all
   * the way out and there is nothing to collect. You look, and then you know.
   *
   * The hit box is deliberately larger than the frame and sits at floor level
   * on the open side, because aiming at a 17cm object in shadow under a bed is
   * not a puzzle worth setting. */
  const underBed = { x: -3.62, z: -3.05, hidden: -0.34, shown: 0.06 };
  let underFrame = null;
  const underGear = gear.get('bed.under');
  if (underGear?.real) {
    const uf = P.makeStandingFrame(M, {
      x: underBed.x, y: 0.012, z: underBed.z,
      rotY: 0,
      w: 0.20 * (underGear.aspect || 0.75),
      h: 0.20,
      texture: underGear.texture,
    });
    /* Laid flat and FACE UP, so it reads as it slides out.
     *
     * A standing frame's picture faces +Z. Rolling it about Z keeps it
     * vertical and merely tips it onto its edge -- which is what it did. The
     * rotation that lays a picture down is -90 about X: local +Z maps to +Y,
     * and the face ends up pointing at the ceiling. The Z term is then just
     * which way up it lies on the floor, so it is a spin, not a roll. */
    /* Nothing props up a photograph lying face-up on the floor, and the strut
     * was the part hanging through the floorboards. Removed rather than
     * hidden: an invisible mesh is still in the group, still counts toward the
     * bounding box, and so is still "through the floor" to anything measuring
     * it -- which is exactly how it read to verify-art. */
    uf.leg.removeFromParent();
    /* And it is not leaning either. The panel carries a -0.13 easel tilt so a
     * frame standing on a shelf sits back on its strut; lying face-up on the
     * floor there is nothing to lean against, and the tilt was what still had
     * a corner of it under the boards. */
    uf.art.parent.rotation.x = 0;
    uf.group.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + 0.14);
    uf.group.position.x = underBed.x + underBed.hidden;
    root.add(uf.group);
    underFrame = uf.group;
    frames.push({ slot: 'bed.under', mesh: uf.group, info: underGear, onFloor: true });

    const reach = box({
      size: [0.66, 0.30, 0.92], pos: [underBed.x + 0.05, 0.15, underBed.z],
      mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
    });
    reach.name = 'under-bed';
    root.add(reach);

    // Slides rather than snaps, and never clears the bed frame.
    ticks.push((dt) => {
      const want = underBed.x + (state.underBedOut ? underBed.shown : underBed.hidden);
      underFrame.position.x += (want - underFrame.position.x) * Math.min(1, dt * 6);
    });
    interaction.register(reach, {
      label: () => (state.underBedOut
        ? 'Push it <b>back</b>'
        : 'Something <b>under the bed</b>'),
      onUse: () => {
        state.underBedOut = !state.underBedOut;
        audio.play('frame.adjust', { volume: 0.4, position: new THREE.Vector3(underBed.x, 0.1, underBed.z) });
        if (state.underBedOut && !state.underBedSeen) {
          state.underBedSeen = true;
          hud.say('Still there. Of course it is still there.', 4200);
        }
      },
    });
  }

  /* ---- the toilet ---- */
  interaction.register(toilet.group, {
    label: () => {
      if (state.bowel >= 1) return '<b>Sit down</b>. Quickly.';
      if (state.bowel > 0.55) return 'Sit on the <b>toilet</b>';
      if (state.bladder > 0.05) return 'Take a <b>leak</b>';
      return 'The <b>toilet</b>';
    },
    // Cigarettes are what fill the bowel meter, and nothing else in the game
    // says so. Said once, and only while there is genuinely nothing brewing --
    // after that the belly rumbles do the telling.
    onLook: () => {
      if (state.toiletHinted || state.bowel > 0.2) return;
      state.toiletHinted = true;
      audio.say('toilet.hint', { delay: 0.5 });
    },
    onUse: () => {
      if (state.bowel > 0.55) { ctx.onSitToilet?.(); return; }
      if (state.bladder <= 0.05) {
        hud.say('Nothing to give. You are all out.');
        return;
      }
      ctx.onStartPee?.();
    },
  });

  interaction.register(toilet.lidPivot, {
    label: () => 'Flush',
    enabled: () => state.flushable,
    onUse: () => {
      state.flushable = false;
      audio.play('toilet.flush', { position: toilet.bowl, volume: 0.85 });
      hud.say('Gone. Somebody else&rsquo;s problem now.');
    },
  });

  interaction.register(bathSink.group, {
    label: () => 'Look in the <b>mirror</b>',
    onUse: () => {
      audio.play('frame.adjust', { volume: 0.3 });
      hud.say(state.beersDrunk + state.whiskeyDrunk > 2
        ? 'You look exactly as well as you feel.'
        : 'Still you. Unfortunately.');
    },
  });
  // The card nobody has taken down. Reading it is how the game begins.
  /* The board's own notes front at z -4.385 and their pins at -4.379, so a
   card at -4.385 grows straight through the paper behind it. Clear both. */
  const note = P.makeCorkNote(M, { x: -0.10, y: 1.74, z: -4.366, rotY: 0.04 });
  root.add(note.group);
  interaction.register(note.group, {
    label: () => 'Read the <b>card</b>',
    onUse: () => {
      audio.play('frame.adjust', { volume: 0.4 });
      hud.say('<em>WED 7PM &middot; SQUATCH MEETING &middot; BOOSKI DRIVING.</em><br>'
        + 'Pinned there a fortnight ago. Today is Tuesday.', 6400);
      ctx.onLearn?.('the corkboard');
    },
  });

  /* The second monitor. Readable from the chair or standing at the desk, and
   * only worth reading if the PC is on -- a black panel says nothing. */
  interaction.register(desk.sidePanelObject, {
    label: () => (state.pcOn
      ? (state.chatUnread ? `Read <b>chat</b> (${state.chatUnread})` : 'Read the <b>chat</b>')
      : 'Second monitor'),
    onUse: () => {
      if (!state.pcOn) {
        hud.say('Black. The tower is off.', 2600);
        return;
      }
      audio.play('ui.select', { volume: 0.35 });
      ctx.onReadChat?.();
    },
  });

  interaction.register(cork.group, {
    label: () => 'Read the <b>evidence board</b>',
    onUse: () => {
      audio.play('frame.adjust', { volume: 0.5 });
      hud.say('Nine pins, five sightings, one very confident length of red string.');
    },
  });
  interaction.register(bobbleHit, {
    label: () => 'Boop the <b>bobblehead</b>',
    onUse: () => {
      bobbleVel += 7;
      audio.play('ui.select', { volume: 0.4 });
    },
  });
  interaction.register(pizza.group, {
    label: () => 'Inspect the <b>pizza</b>',
    onUse: () => hud.say('One slice left. It has gone the colour of the box.'),
  });
  interaction.register(bed.group, {
    label: () => 'Go back to <b>sleep</b>',
    onUse: () => {
      audio.play('bed.rustle', { position: new THREE.Vector3(-4.15, 0.7, -3.4), volume: 0.7 });
      hud.say(state.beersDrunk > 0
        ? 'Tempting. But the PC is right there and the beer is already open.'
        : 'You just got up. Give it an hour.');
    },
  });

  /*
   * The pictures talk back.
   *
   * Catching one under the crosshair is enough -- he says something without
   * you pressing anything, which is the whole point of hanging your own photos
   * in here. Rationed hard, though: a line every time your eye crossed a frame
   * would turn a wall of memories into a wall of noise. One per frame per
   * session, a chance roll on top, and a shared cooldown so sweeping the room
   * gets you one remark rather than nine.
   */
  const seenFrames = new Set();
  let lastPhotoLine = -999;
  const remarkOn = (f, deliberate) => {
    const now = performance.now() / 1000;
    if (!deliberate) {
      if (seenFrames.has(f.slot)) return;
      if (now - lastPhotoLine < 14) return;
      if (Math.random() > 0.55) return;
    }
    seenFrames.add(f.slot);
    lastPhotoLine = now;
    audio.say('photo', { delay: deliberate ? 0.35 : 0.55 });
  };

  for (const f of frames) {
    /* The one hung too high, which has been crooked for months. Using it
     * starts the fix; the label says nothing about what that involves. */
    if (f.slot === 'cork.above') {
      /* The one hung too high, on purpose, years ago. It has its own remarks
       * -- looking up at it is a bit in itself -- and using it starts the fix.
       * The label says nothing about what that involves. */
      interaction.register(f.mesh, {
        label: () => (state.glued
          ? 'Straight now. <b>Very</b> straight.'
          : 'Sort out the <b>crooked frame</b>'),
        onLook: () => {
          const now = performance.now() / 1000;
          if (now - lastPhotoLine < 9) return;
          lastPhotoLine = now;
          audio.say(state.glued ? 'hungfixed' : 'hunghigh', { chance: 0.7, delay: 0.4 });
        },
        onUse: () => {
          if (state.glued) { audio.say('hungfixed', { delay: 0.3 }); return; }
          ctx.onGlue?.();
        },
      });
      continue;
    }
    interaction.register(f.mesh, {
      label: () => `Look at <b>${f.info.title}</b>`,
      onLook: () => remarkOn(f, false),
      onUse: () => {
        audio.play('frame.adjust', { volume: 0.4 });
        remarkOn(f, true);
        hud.say(f.info.caption
          ? `<em>${f.info.title}.</em> ${f.info.caption}`
          : `<em>${f.info.title}.</em>`);
      },
    });
  }

  // Banners are in `frames` too, so this re-registration would otherwise drop
  // the remark the loop above just attached to them.
  for (const b of banners) {
    interaction.register(b.mesh, {
      label: () => `Look at <b>${b.info.title}</b>`,
      onLook: () => remarkOn(b, false),
      onUse: () => {
        audio.play('frame.adjust', { volume: 0.4 });
        remarkOn(b, true);
        hud.say(`<em>${b.info.title}.</em> ${b.info.caption}`);
      },
    });
  }

  /* ================================================================ */
  /* Animation                                                         */
  /* ================================================================ */

  let bobblePhase = 0;
  let bobbleVel = 0;
  let clockAcc = 0;
  let secondsReal = 0;
  let tickAcc = 0;
  let bathDoorT = 0;
  let skyPhaseA = null;
  let skyPhaseB = null;
  let seconds = 0;
  let minutes = 6 * 60 + 4;

  ticks.push((dt, elapsed) => {
    /* fridge door swing */
    const target = state.fridgeOpen ? 1 : 0;
    state.fridgeT += (target - state.fridgeT) * Math.min(1, dt * 6);
    fridge.doorPivot.rotation.y = state.fridgeT * 2.0;
    fridge.light.intensity = state.fridgeT * 0.85;

    /* the lamps look after themselves once it gets dark */
    if (time.isDark && !state.lightsOn && !state.lightsManual) {
      setCeiling(true, true);
      hud.say('You put the light on without really deciding to.', 4000);
    } else if (!time.isDark && state.lightsOn && !state.lightsManual) {
      setCeiling(false, true);
    }

    /* bathroom door + strip light */
    bathDoorT += ((state.bathDoorOpen ? 1 : 0) - bathDoorT) * Math.min(1, dt * 5);
    bathDoor.pivot.rotation.y = bathDoorT * 1.85;
    bathLight.intensity += ((state.bathLightOn ? 4.6 : 0) - bathLight.intensity) * Math.min(1, dt * 7);
    // Fluorescent tubes never quite settle.
    if (state.bathLightOn) bathLight.intensity *= 0.985 + Math.random() * 0.03;
    bathTube.material = state.bathLightOn ? M.bulbOn : M.bulbOff;

    /* blinds roll */
    blindsT += ((blindsOpen ? 1 : 0) - blindsT) * Math.min(1, dt * 3.5);
    for (let i = 0; i < slats.length; i++) {
      const rest = -0.02 - i * SLAT_GAP;
      const stacked = -0.02 - i * 0.006;
      slats[i].position.y = rest + (stacked - rest) * blindsT;
      // Shut: slats stand on edge and overlap. Open: flat, stacked at the top.
      slats[i].rotation.z = (1 - blindsT) * 1.35;
    }
    // Sun only really gets in once the blinds are up.
    // Direct light only really gets in when the blinds are up.
    sun.intensity = time.sunIntensity * (0.22 + blindsT * 0.78);
    sun.color.copy(time.sunColour);
    sun.position.copy(time.sunPos);
    fill.intensity = time.fillIntensity;
    hemi.intensity = time.hemiIntensity;
    hemi.color.copy(time.hemiSky);
    hemi.groundColor.copy(time.hemiGround);
    ambient.intensity = time.ambIntensity;
    ambient.color.copy(time.ambColour);

    // Cross-fade the view out of the window between phase paintings.
    if (skyPhaseA !== time.skyFrom) {
      skyPhaseA = time.skyFrom;
      skyBase.material.map = T.citySkyline(skyPhaseA);
      skyBase.material.needsUpdate = true;
    }
    if (skyPhaseB !== time.skyTo) {
      skyPhaseB = time.skyTo;
      skyOver.material.map = T.citySkyline(skyPhaseB);
      skyOver.material.needsUpdate = true;
    }
    skyOver.material.opacity = time.skyBlend;

    /* lights */
    /* `sag` is the mains dropping for a moment -- see dipLights(). It scales
     * the TARGETS rather than the intensities, because the intensities are a
     * ramp that is rewritten every frame and would simply undo anything set
     * from outside on the next tick. */
    if (state.sagT > 0) {
      state.sagT = Math.max(0, state.sagT - dt);
      if (!state.sagT) state.sag = 1;
    }
    const sag = state.sag;
    ceilSpot.intensity += ((state.lightsOn ? 9.5 * sag : 0) - ceilSpot.intensity) * Math.min(1, dt * 8);
    ceilSpot.castShadow = ceilSpot.intensity > 0.05;
    lampLight.intensity += ((state.lampOn ? 4.2 * sag : 0) - lampLight.intensity) * Math.min(1, dt * 8);
    towerGlow.intensity = state.pcOn ? 0.7 + Math.sin(elapsed * 1.7) * 0.12 : 0;
    // The tower breathes; the peripherals just sit there being lit.
    for (const strip of desk.rgb) {
      strip.material.emissiveIntensity = state.pcOn ? 1.6 + Math.sin(elapsed * 2.1) * 0.4 : 0;
    }
    for (const m of desk.keyLeds) {
      m.emissiveIntensity = state.pcOn ? 1.5 : 0;
    }
    if (state.pcOn !== _pcWas) {
      _pcWas = state.pcOn;
      desk.micLed.material = state.pcOn ? M.ledRed : M.bulbOff;
      desk.sideScreen.material = state.pcOn ? desk.sideOn : desk.sideOff;
      // Switching it on shows whatever landed while it was off.
      if (state.pcOn) ctx.onChatVisible?.();
      desk.powerLed.material = state.pcOn ? M.ledGreen : M.bulbOff;
    }

    /* bobblehead */
    bobbleVel += -bobblePhase * 42 * dt;
    bobbleVel *= 1 - Math.min(1, dt * 2.6);
    bobblePhase += bobbleVel * dt;
    bobble.head.rotation.z = bobblePhase * 0.09;
    bobble.head.position.y = 0.098 - Math.abs(bobblePhase) * 0.002;

    /* radio dial shimmer */
    if (state.radioOn) {
      radio.needle.position.x = Math.sin(elapsed * 0.6) * 0.052;
      radio.led.material = M.ledRed;
    } else {
      radio.led.material = M.bulbOff;
    }

    /* clocks */
    // Hands sweep continuously off the clock itself, so they are never stale
    // and never disagree with the HUD. The hour hand creeps between numerals
    // instead of jumping on the hour.
    const TAU = Math.PI * 2;
    wallClock.hourHand.rotation.z = -((time.minutes % 720) / 720) * TAU;
    wallClock.minHand.rotation.z = -((time.minutes % 60) / 60) * TAU;
    /* The second hand runs on REAL time, not game time.
     *
     * Truthfully it should turn once per in-game minute, but a day here is
     * fifteen real minutes, so that is a hand spinning about one and a half
     * times a second -- it stops reading as a clock and starts reading as a
     * fault. The hour and minute hands still tell you the actual time, which
     * is the part anyone reads; the second hand is texture, and texture that
     * blurs is worse than texture that is slightly a lie. */
    secondsReal += dt;
    wallClock.secHand.rotation.z = -((secondsReal % 60) / 60) * TAU;

    // The digital dial only needs redrawing when the shown minute changes.
    const shown = Math.floor(time.minutes);
    if (shown !== minutes || clockAcc > 90) {
      minutes = shown;
      clockAcc = 0;
      const hh = Math.floor(minutes / 60) % 12 || 12;
      const mm = String(minutes % 60).padStart(2, '0');
      clock.draw(`${hh}:${mm}`);
    }
    // The tick is room tone rather than a readout, so it stays on a real-time
    // cadence -- an in-game second is a hundredth of a real one.
    tickAcc += dt;
    if (tickAcc > 1) {
      tickAcc = 0;
      audio.play('clock.tick', { position: new THREE.Vector3(-1.0, 1.95, 4.3), volume: 0.6 });
    }
  });

  /* ================================================================ */
  /* Public surface                                                    */
  /* ================================================================ */

  const bedPose = {
    position: new THREE.Vector3(-4.15, 0.86, -3.35),
    yaw: Math.PI,
  };
  const bedExit = new THREE.Vector3(-3.05, 0, -3.05);

  const deskPose = {
    position: new THREE.Vector3(1.68, 1.24, -3.34),
    yaw: 0,
    pitch: -0.04,
  };
  const deskExit = new THREE.Vector3(1.05, 0, -2.85);

  // Sitting on the couch: back against the cushions, facing east into the room
  // so the window and the front door are both in view. Wide look cone --
  // there is nothing here you are supposed to be staring at.
  const couchPose = {
    position: new THREE.Vector3(-4.28, 1.12, 0.72),
    yaw: -Math.PI / 2,
    pitch: -0.06,
    yawRange: 1.5,
    pitchMin: -0.85,
    pitchMax: 0.70,
  };
  const couchExit = new THREE.Vector3(-3.55, 0, 0.72);

  // Perched on the edge of the mattress, feet on the floor.
  const bedSitPose = {
    position: new THREE.Vector3(-3.95, 1.22, -3.00),
    yaw: -Math.PI / 2,
    pitch: -0.10,
    yawRange: 1.5,
    pitchMin: -0.85,
    pitchMax: 0.70,
  };
  const bedSitExit = new THREE.Vector3(-3.20, 0, -3.00);

  /* Real models last, so anything with `replaces` has a procedural prop to
   * hide. Not awaited: the flat is fully playable without them and holding the
   * loading screen on a fetch that is usually a 404 would be daft. */
  const modelsReady = loadModels(root).then((r) => {
    if (r.loaded) console.log(`models: placed ${r.loaded}`);
    for (const f of r.failed) console.warn(`models: ${f}`);
    return r;
  });

  return {
    root,
    materials: M,
    colliders,
    floorZones,
    state,
    inventory,
    dropGun,
    /** Resolves once any .glb in assets/models/ has been placed. */
    models: modelsReady,
    pizza,
    tv,
    tvGlow,
    frames,

    bedPose,
    bedExit,
    bedLookYaw: yawToward(bedExit, new THREE.Vector3(2.0, 0, -1.0)),
    deskPose,
    deskExit,
    couchPose,
    couchExit,
    bedSitPose,
    bedSitExit,

    screen: desk.screen,
    desk,
    gluePos: gluekit.gluePos,
    /* Handles the comedown needs. Nothing here is a scripted scare -- it is a
     * door, a light and a lamp, moved by something that is deniably you. */
    bathDoorPivot: bathDoor.group,
    ceilingLamp: ceilLight,
    setCeiling,
    dipLights,
    screenGlow,
    radioPos,
    radioNeedle: radio.needle,
    chair: chair.group,
    /** Where the chair started, so rolling can be expressed as an offset. */
    chairHome: chair.group.position.clone(),
    fridgePos: new THREE.Vector3(4.4, 1.1, 1.95),

    setFridge,
    setCeiling,
    setLamp,

    bathroom: BATH,
    /** Where you stand under the shower, and where the water comes from. */
    showerStand: tub.standPos,
    showerHead: tub.headPos,
    /** Where it goes when you are already standing in there. */
    tubDrain: new THREE.Vector3(tub.standPos.x, 0.03, tub.standPos.z + 0.10),
    /** The pan, so the eggs can appear in it. */
    pan,
    panPos,
    /** Where the camera sits when you are on the toilet. */
    toiletSeat: new THREE.Vector3(toilet.bowl.x, 0.98, toilet.bowl.z + 0.06),
    toiletStand: new THREE.Vector3(toilet.bowl.x, 0, toilet.bowl.z + 0.85),
    toiletLid: toilet.lidPivot,
    toiletSeatPivot: toilet.seatPivot,
    toiletBowl: toilet.bowl,
    toiletBowlRadius: toilet.bowlRadius + 0.02,
    toiletCollider,
    setBathLight(on) { state.bathLightOn = on; },

    setPcOn(on) {
      state.pcOn = on;
    },

    /**
     * Finished one. The empty goes on the floor where you were standing.
     *
     * Six cans over a morning and none of them anywhere is a flat that tidies
     * itself, which is not this flat. They are pooled, so drinking the fridge
     * dry leaves exactly six and never grows the scene.
     */
    consumeBeer(where) {
      state.beersDrunk++;
      state.heldItem = 'empty';
      const can = emptyCans[emptyCanNext];
      emptyCanNext = (emptyCanNext + 1) % emptyCans.length;
      const p = where || new THREE.Vector3(0, 0, 0);
      // Just in front of the feet, rolled to wherever it settled.
      can.position.set(
        p.x + (Math.random() - 0.5) * 0.5,
        0.032,
        p.z + 0.25 + (Math.random() - 0.5) * 0.4,
      );
      can.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI * 2);
      can.visible = true;
    },

    /** Take a pull. Returns false when the bottle is dry. */
    consumeWhiskey() {
      if (state.whiskeyLeft <= 0) return false;
      state.whiskeyLeft--;
      state.whiskeyDrunk++;
      // Drop the level in the bottle to match.
      whiskey.liquid.scale.y = Math.max(0.04, state.whiskeyLeft / 6);
      return true;
    },

    /** Put the bottle back on the counter. */
    returnWhiskey() {
      whiskey.group.visible = true;
    },

    /** Take a pouch. Returns false when the tin is empty. */
    consumeZyn() {
      if (state.zynsLeft <= 0 || state.lipPacked) return false;
      state.zynsLeft--;
      state.zynsTaken++;
      state.lipPacked = true;
      return true;
    },

    /** Bin the one in your lip. */
    dropZyn() {
      state.lipPacked = false;
    },

    zynPos,

    /** Burn one from the pack. Returns false when it is empty. */
    consumeCigarette() {
      if (state.cigsLeft <= 0) return false;
      state.cigsLeft--;
      state.cigsSmoked++;
      return true;
    },

    /** Put the pack back on the counter (used when the player drops it). */
    returnCigarettes() {
      cigs.group.visible = true;
    },

    cigsPos,

    /** Nudge the dials to redraw immediately after the clock is moved. */
    refreshClocks() {
      clockAcc = 99;
    },

    update(dt, elapsed) {
      for (const t of ticks) t(dt, elapsed);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Shell helpers                                                       */
/* ------------------------------------------------------------------ */

/** Build a north/south wall as a set of x-ranges, leaving gaps for doors. */
function addWallRun(root, M, side, ranges, zAt, thick, h) {
  const inner = side === 'north' ? zAt - thick : zAt;
  const outer = side === 'north' ? zAt : zAt + thick;
  for (const [a, b] of ranges) {
    root.add(boxFrom(a, 0, inner, b, h, outer, M.wall, { cast: false }));
  }
}

/** Build a west/east wall as a set of z-ranges. */
function addWallRunSide(root, M, side, ranges, xAt, thick, h) {
  const inner = side === 'west' ? xAt - thick : xAt;
  const outer = side === 'west' ? xAt : xAt + thick;
  for (const [a, b] of ranges) {
    root.add(boxFrom(inner, 0, a, outer, h, b, M.wall, { cast: false }));
  }
}

/** The bit of wall above a door opening. */
function addDoorHeader(root, M, side, a, b, zAt, thick, h, doorH) {
  const inner = side === 'north' ? zAt - thick : zAt;
  const outer = side === 'north' ? zAt : zAt + thick;
  root.add(boxFrom(a, doorH, inner, b, h, outer, M.wall, { cast: false }));
  // Casing.
  root.add(boxFrom(a - 0.05, 0, inner, a, doorH + 0.05, outer, M.trim, { cast: false }));
  root.add(boxFrom(b, 0, inner, b + 0.05, doorH + 0.05, outer, M.trim, { cast: false }));
  root.add(boxFrom(a - 0.05, doorH, inner, b + 0.05, doorH + 0.05, outer, M.trim, { cast: false }));
}

/**
 * Panel door. `hinge` (-1 left, +1 right) puts the pivot on that edge so the
 * door can actually swing; without it the door is a fixed slab.
 */
function makeDoor(M, { x, z, w = 1.0, rotY = 0, h = 2.02, hinge = 0 }) {
  const g = group('door');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  const pivot = new THREE.Group();
  // Sit the pivot on the hinge edge, then offset the leaf back the other way.
  pivot.position.x = hinge * (w / 2);
  g.add(pivot);
  const leafX = -hinge * (w / 2);

  const doorMat = mat({ color: 0xd9d2c2, roughness: 0.75 });
  pivot.add(box({ size: [w - 0.04, h, 0.045], pos: [leafX, h / 2, 0], mat: doorMat }));
  // Recessed panels.
  for (const py of [h * 0.28, h * 0.70]) {
    pivot.add(box({
      size: [w - 0.28, h * 0.30, 0.012], pos: [leafX, py, 0.024],
      mat: mat({ color: 0xc6bfae, roughness: 0.8 }),
    }));
  }
  pivot.add(cylinder({
    r: 0.026, h: 0.05, pos: [leafX + (hinge >= 0 ? -1 : 1) * (w / 2 - 0.14), 1.02, 0.045],
    rotX: Math.PI / 2, mat: M.chrome,
  }));
  return { group: g, pivot };
}
