import * as THREE from 'three';

import { resolveGear } from '../world/gear.js';
import { EVIDENCE_IDS } from './mission.js';

/* THE SECURITY ROOM'S RACK COLUMN, in one place.
 *
 * The racks, their instanced front panels, the indicator LEDs on those panels
 * and the shift-notes board hung off them are four separate pieces of code
 * that have to agree about where the column is. They did not: the column was
 * written out as 16.9 in one place, 16.36 in another and 16.31 in a third, so
 * moving it moved a quarter of it. `SECURITY_RACK_X` is the column's
 * centreline against the east wall (which is at 17.75); the face plane is
 * derived from it, and everything mounted on the front is derived from that.
 */
const SECURITY_RACK_X = 17.2;
const SECURITY_RACK_FACE_X = SECURITY_RACK_X - 0.54;
const SECURITY_RACK_Z0 = -14;
const SECURITY_RACK_Z1 = -6;
const SECURITY_RACK_PITCH = 2.1;

export const PALACE_ANCHORS = Object.freeze({
  approach: Object.freeze(new THREE.Vector3(14, 0, 76)),
  powerBox: Object.freeze(new THREE.Vector3(19.2, 1.15, 61.2)),
  perimeter: Object.freeze(new THREE.Vector3(14, 0, 51)),
  estate: Object.freeze(new THREE.Vector3(12.5, 0, 4)),
  belongings: Object.freeze(new THREE.Vector3(4.7, 0.72, -6.4)),
  paymentLedger: Object.freeze(new THREE.Vector3(-10.6, 0.88, -6.8)),
  securityStill: Object.freeze(new THREE.Vector3(14.8, 1.22, -10.2)),
  gallery: Object.freeze(new THREE.Vector3(0, 0, -25)),
  diningRoom: Object.freeze(new THREE.Vector3(0, 0, -42)),
  mark: Object.freeze(new THREE.Vector3(-3.2, 0, -40.8)),
  sauce: Object.freeze(new THREE.Vector3(3.2, 0, -40.8)),
  extraction: Object.freeze(new THREE.Vector3(0, 0, -55)),
});

const M = Object.freeze({
  stucco: new THREE.MeshStandardMaterial({ color: 0xc4aa82, roughness: 0.92 }),
  stuccoDark: new THREE.MeshStandardMaterial({ color: 0x8f7454, roughness: 0.96 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x665342, roughness: 0.94 }),
  stoneLight: new THREE.MeshStandardMaterial({ color: 0x9a8061, roughness: 0.88 }),
  tile: new THREE.MeshStandardMaterial({ color: 0x6f2e25, roughness: 0.88 }),
  tileDark: new THREE.MeshStandardMaterial({ color: 0x351c1a, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x3c2115, roughness: 0.82 }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0x6e4227, roughness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc79b49, roughness: 0.32, metalness: 0.76 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x16191b, roughness: 0.56, metalness: 0.58 }),
  plaster: new THREE.MeshStandardMaterial({ color: 0xe1d2b4, roughness: 0.91 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xddd0b9, roughness: 0.94 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x665044, roughness: 0.78 }),
  floorAccent: new THREE.MeshStandardMaterial({ color: 0xb38b57, roughness: 0.74 }),
  textile: new THREE.MeshStandardMaterial({ color: 0x5a1718, roughness: 0.98 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xe6d9b7, roughness: 1 }),
  ink: new THREE.MeshStandardMaterial({ color: 0x241e19, roughness: 1 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf1eee5, roughness: 0.95 }),
  red: new THREE.MeshStandardMaterial({ color: 0x6a1718, roughness: 0.86 }),
  green: new THREE.MeshStandardMaterial({ color: 0x213c2d, roughness: 0.96 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x1d3929, roughness: 0.99 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xd8eef0, roughness: 0.14, metalness: 0.06, transparent: true, opacity: 0.42,
  }),
  water: new THREE.MeshStandardMaterial({
    color: 0x164a59, roughness: 0.16, metalness: 0.08, transparent: true, opacity: 0.82,
  }),
  screen: new THREE.MeshStandardMaterial({
    color: 0x122329, emissive: 0x5c9aa3, emissiveIntensity: 0.9, roughness: 0.38,
  }),
  window: new THREE.MeshStandardMaterial({
    color: 0x101a1d, emissive: 0x203f43, emissiveIntensity: 0.34, roughness: 0.22, metalness: 0.12,
  }),
  lampWarm: new THREE.MeshBasicMaterial({ color: 0xffd69a }),
  lampCool: new THREE.MeshBasicMaterial({ color: 0x94dce5 }),
  blackout: new THREE.MeshBasicMaterial({ color: 0x080909 }),
  /* The dressing palette. Added by the 2026-08-20 owner playtest pass, which
   * asked every room to say who lived and worked here before the door came
   * in: cleaning plastic, service steel, a chef's whites, a cob of corn, and
   * the drinks a cartel dining room is measured by. */
  plastic: new THREE.MeshStandardMaterial({ color: 0x2c4f5e, roughness: 0.62 }),
  plasticPale: new THREE.MeshStandardMaterial({ color: 0xb9bfbc, roughness: 0.68 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa2a6, roughness: 0.38, metalness: 0.72 }),
  chefWhite: new THREE.MeshStandardMaterial({ color: 0xe9e6dd, roughness: 0.94 }),
  corn: new THREE.MeshStandardMaterial({
    color: 0xe0b53f, roughness: 0.66, emissive: 0x2a1d04, emissiveIntensity: 0.35,
  }),
  husk: new THREE.MeshStandardMaterial({ color: 0x7d8a49, roughness: 0.95 }),
  terracotta: new THREE.MeshStandardMaterial({ color: 0x8c4a2c, roughness: 0.9 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x241a13, roughness: 1 }),
  bottleGreen: new THREE.MeshStandardMaterial({
    color: 0x1d4a2a, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.72,
  }),
  bottleAmber: new THREE.MeshStandardMaterial({
    color: 0x8a4a12, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.7,
  }),
  velvet: new THREE.MeshStandardMaterial({ color: 0x3a1220, roughness: 1 }),
  curtain: new THREE.MeshStandardMaterial({ color: 0x4d1520, roughness: 0.99 }),
  canvasArt: new THREE.MeshStandardMaterial({ color: 0x394a3f, roughness: 0.97 }),
});

/* Framed-canvas tones, so the halls stop hanging the same picture eight
 * times. Each is a plain standard material -- the frames vary in size and
 * the fields in colour, which is the whole difference between a gallery and
 * one decoration repeated. */
const ART_TONES = Object.freeze([
  new THREE.MeshStandardMaterial({ color: 0x2f3f4e, roughness: 0.97 }),
  new THREE.MeshStandardMaterial({ color: 0x4a2a20, roughness: 0.97 }),
  new THREE.MeshStandardMaterial({ color: 0x24402f, roughness: 0.97 }),
  new THREE.MeshStandardMaterial({ color: 0x54401c, roughness: 0.97 }),
  new THREE.MeshStandardMaterial({ color: 0x3a2440, roughness: 0.97 }),
]);

/* ------------------------------------------------------------------ *
 * THE A-TEAM ART, AND WHY THE PALACE FINALLY READS THE ART MANIFEST.
 *
 * Owner punch list: *"Add substantial A-Team themed wall art throughout the
 * palace. The building needs more visual personality and parody flavour."*
 * Six finished pieces followed, with *"All this is Art for the Cartel Palace
 * only"* written across them.
 *
 * The pieces are NOT in the repository. They were pasted into a chat and
 * nothing was ever written to assets/art/. What is in the repository is the
 * system that has been hanging owner art since the apartment: a slot is
 * named in assets/art/manifest.json, src/world/gear.js `resolveGear` turns
 * that slot into the owner's file if the manifest names one and into a drawn
 * placeholder from its own FALLBACKS table if it does not, and the scene
 * never has to know which of the two it got. The mansion hangs its pictures
 * that way (`MANSION_ART_SLOTS`), so does the Bing (`artSticker`), so does
 * the Squatchfather. The palace read the manifest not at all -- which is
 * precisely the empty-walled building the owner reported.
 *
 * So every row below is a SLOT, not a file. Three things about the shape of
 * this table are load-bearing and none of them is taste:
 *
 *   The frames are authored at the DELIVERED shape. All six drawings are
 *   1456 x 1092, a 4:3 landscape, so `width` is authored and the height is
 *   derived from `A_TEAM_ART_ASPECT`. The frame then never resizes when the
 *   file lands. That is the whole point of the doorway proof in
 *   tests/cartel-palace-a-team-art.test.mjs: a frame that grew at load time
 *   could grow across a doorway, and no static measurement of the authored
 *   scene would ever have seen it happen.
 *
 *   `(x, y, z)` is a point ON the wall face, as `wallArt` above demands, and
 *   every one of them is a few millimetres proud of a face that was measured
 *   out of the geometry rather than guessed -- the same 2026-08-20 rule that
 *   pulled the gallery's frames back onto their panels.
 *
 *   The placeholder lettering lives in src/world/gear.js FALLBACKS, not
 *   here. It has to: this file is built headless by tests/cartel-palace-*,
 *   and every procedural texture in the project goes through a real 2D
 *   canvas, which Node has not got. `resolveGear` is therefore asked for
 *   these slots ASYNCHRONOUSLY and its failure is not an error -- in Node it
 *   fails on the first `document.createElement` and the frames keep the
 *   painted canvas they were built with, which is exactly what a test wants
 *   to measure anyway.
 *
 * Which picture hangs where, and why that wall:
 *
 *   THE A TEAM -- the crew posed in front of this building, cream stucco,
 *   red tile, the fountain, the flag -- hangs in the entry hall, on the west
 *   partition, in the first ten seconds of being inside. It is the only one
 *   of the six that is a picture OF the room the player is standing in.
 *
 *   A TEAM / WE DON'T MISS goes on the entry hall's east wall beside the
 *   watch desk, because that is where a guard actually sits (see cast.js,
 *   post `entry-watch`) and this is guardroom taste.
 *
 *   A TEAM ASSAULT -- four men coming through a set of double doors -- goes
 *   in the intelligence room the `service-hall` patrol works, on the one
 *   solid stretch of its west partition, below the doorway and clear of it.
 *
 *   EL JEFE goes on the dining room's rear wall at x -6.6, mirroring the
 *   family portrait already hung at x +6.6, so the wall Mark holds court
 *   against has a boss on each side of the extraction opening.
 *
 *   A TEAM CHAMPIONS (the 0-47 trophy wall) and A TEAM STRAT (Operation
 *   Dumb Luck, drawn on a table) go in the long room west of the gallery
 *   wall -- the empty room the owner asked to have turned into an
 *   operations gallery. It is still sealed today: the gallery's west wall
 *   runs z -33.9..-15.3 and the partitions either end close everything but
 *   about twelve centimetres, so cutting its door belongs to that separate
 *   pass. These two are hung on its west wall now, either side of the
 *   portrait that has hung at z -24 since the estate was built, so the pass
 *   that opens the door finds the room already saying what it is for -- and
 *   the room's whole east wall, eighteen metres of it, is deliberately left
 *   bare for the rest of that gallery.
 * ------------------------------------------------------------------ */
const A_TEAM_ART_ASPECT = 4 / 3;

const A_TEAM_ART = Object.freeze([
  Object.freeze({
    slot: 'cartel-palace.entry.the-a-team',
    room: 'entry',
    /* Entry hall, west partition. Inner face x 10.675 (`guest-service-
     * partition`, 0.35 thick at 10.5, solid z -8..12), which is the number
     * the four canvases already on this wall hang off. The run between the
     * canvas at z 4.4 and the one at z 9.0 is clear from 5.0 to 8.52, so a
     * 1.9 m picture centred at 6.75 leaves 80 cm of plaster on both sides.
     * Its foot at y 1.588 clears the dado rail (top 1.29); the cleaner's
     * cart and the wet-floor sign are floor furniture out at x 11.6+. */
    x: 10.68, y: 2.3, z: 6.75, yaw: Math.PI / 2, width: 1.9, tone: 4,
  }),
  Object.freeze({
    slot: 'cartel-palace.entry.we-dont-miss',
    room: 'entry',
    /* Entry hall, east wall. Inner face x 17.75 and no opening anywhere in
     * it -- the estate's east wall is solid z -50..12. The three canvases
     * here sit at z 10.0, -2.4 and -6.6, so z 5.0 is the middle of the only
     * long gap, and it is the piece of wall the seated watch guard at
     * (15.6, 5.35) has over his shoulder. Clear of the bin at z 3.5 and the
     * console table at z -1.6, both of which are under a metre tall. */
    x: 17.74, y: 2.2, z: 5.0, yaw: -Math.PI / 2, width: 1.5, tone: 1,
  }),
  Object.freeze({
    slot: 'cartel-palace.security.assault',
    room: 'security',
    /* Intelligence room, west partition. `security-service-partition` is
     * solid from z -22 to -14.5 and the doorway through to the guest suite
     * is the gap NORTH of it (z -14.5..-8), so a 1.6 m picture centred at
     * -16.3 stands a full metre clear of the opening -- which is the fault
     * this building has already been caught with once (the gallery's east
     * row, hung straight across the service doorway) and the Bing's back
     * office once. The east wall is not available at all:
     * the rack column occupies x 16.675..17.725 the length of the room. The
     * mop leaning against the sink tops out at y 1.65 but stands at x 11.1,
     * a third of a metre off the frame's front face. */
    x: 10.68, y: 2.25, z: -16.3, yaw: Math.PI / 2, width: 1.6, tone: 0,
  }),
  Object.freeze({
    slot: 'cartel-palace.dining.el-jefe',
    room: 'dining',
    /* Dining room, rear wall, on the panel at x -6.6. The panelled inset's
     * front face is z -49.6025 and this hangs 2.5 mm proud of it; the panel
     * is 3.1 wide and 2.6 tall about y 1.58, and a 2.2 x 1.65 picture at
     * y 1.8 sits inside the inset on all four sides. The rear wall segments
     * stop at |x| 3.2 -- the extraction opening -- and this is 2.3 m clear
     * of that edge, on the opposite side from Mark's family portrait. */
    x: -6.6, y: 1.8, z: -49.6, yaw: 0, width: 2.2, tone: 3,
  }),
  Object.freeze({
    slot: 'cartel-palace.ops.champions',
    room: 'operations',
    /* Operations room, west wall: the estate's own west wall, inner face
     * x -17.75, solid its whole length. North of the portrait that hangs at
     * z -24 (which spans -24.9..-23.1), leaving 2.1 m between them, and
     * 4.2 m south of the room's north partition at z -15. */
    x: -17.74, y: 2.3, z: -20.0, yaw: Math.PI / 2, width: 2.0, tone: 2,
  }),
  Object.freeze({
    slot: 'cartel-palace.ops.strat',
    room: 'operations',
    /* Operations room, same wall, south of the portrait by the same 2.1 m,
     * and 5 m clear of the dining partition at z -34.2. The plan of the job
     * belongs opposite the trophies for failing at it. */
    x: -17.74, y: 2.3, z: -28.0, yaw: Math.PI / 2, width: 2.0, tone: 0,
  }),
]);

function combatMaterialFor(material) {
  if (material === M.glass || material === M.window) return 'glass';
  if (material === M.plaster) return 'drywall';
  if (material === M.wood || material === M.woodLight) return 'wood_thin';
  if (material === M.iron || material === M.brass) return 'metal';
  if (material === M.stone || material === M.stoneLight) return 'stone';
  if (material === M.stucco || material === M.stuccoDark) return 'concrete';
  return null;
}

function box(size, position, material, name = '', { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.fromArray(position);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function cylinder(radius, height, position, material, name = '', segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.position.fromArray(position);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * One InstancedMesh for a fixed part the palace repeats at authored
 * transforms -- roof ridges, palm fronds, gate bars, chair parts, place
 * settings, drawer faces. Each repeat used to be its own Mesh and therefore
 * its own draw call; the batch keeps every position, rotation and scale
 * EXACTLY as authored and collapses only the draw-call structure. Same
 * doctrine as the mansion's sconce batches
 * (src/mansion/scenes/MansionInterior.js `buildSconceInstances`).
 *
 * Decorative repeats default to `cast = false` deliberately: the moon is
 * this scene's only shadow-casting light, and these parts are either inside
 * the roofed estate (where no shadow they cast can reach its map) or thinner
 * than the 1536 px map resolves (src/mansion/perf.js MIN_TEXELS), so casting
 * was a shadow-pass bill that never drew a visible shadow.
 *
 * @param {THREE.Object3D} parent  transforms are in this object's space
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @param {Array<(part: THREE.Object3D) => void>} placements one function per
 *   instance, posing a reset stand-in exactly as the old Mesh was posed
 */
const _placement = new THREE.Object3D();
function instanced(parent, geometry, material, placements, name, { cast = false, receive = true } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  for (let index = 0; index < placements.length; index++) {
    _placement.position.set(0, 0, 0);
    _placement.rotation.set(0, 0, 0);
    _placement.scale.set(1, 1, 1);
    placements[index](_placement);
    _placement.updateMatrix();
    mesh.setMatrixAt(index, _placement.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

/**
 * A collider with no mesh of its own, for geometry drawn somewhere else.
 *
 * `material` is optional and is the THREE material the visible geometry uses,
 * not a string -- it is passed through `combatMaterialFor` exactly as `solid`
 * does, so a block authored here and a block authored there stop a round the
 * same way. Leave it off and the collider is untagged, which the shared stack
 * reads as a stopper (docs/CONTEXT.md: appearance never implies penetration);
 * that is right for a door leaf and wrong for a stone reveal, which should
 * behave like the stone either side of it.
 */
function addCollider(colliders, center, size, name = '', material = null) {
  const c = new THREE.Vector3(...center);
  const half = new THREE.Vector3(...size).multiplyScalar(0.5);
  const collider = new THREE.Box3(c.clone().sub(half), c.clone().add(half));
  collider.name = name;
  const combatMaterial = material ? combatMaterialFor(material) : null;
  if (combatMaterial) {
    collider.combatMaterial = combatMaterial;
    collider.userData = { ...(collider.userData ?? {}), combatMaterial };
  }
  colliders.push(collider);
  return collider;
}

function solid(parent, colliders, size, position, material, name = '') {
  const mesh = box(size, position, material, name);
  parent.add(mesh);
  // Derive collision in world space after parenting. Guard housing is offset
  // from the compound root; a local Box3 here used to leave an invisible
  // guardhouse at the estate origin and no collision around the visible one.
  mesh.updateWorldMatrix(true, false);
  const collider = new THREE.Box3().setFromObject(mesh);
  collider.name = name;
  colliders.push(collider);
  mesh.userData.collider = collider;
  const combatMaterial = combatMaterialFor(material);
  if (combatMaterial) {
    mesh.userData.combatMaterial = combatMaterial;
    collider.combatMaterial = combatMaterial;
    collider.userData = { ...(collider.userData ?? {}), combatMaterial };
  }
  return mesh;
}

function removeCollider(colliders, collider) {
  const index = colliders.indexOf(collider);
  if (index >= 0) colliders.splice(index, 1);
}

/**
 * THE FRONT DOOR, AND WHY IT USED TO GO THROUGH THE ARCH.
 *
 * Owner, 2026-08-20 playtest: *"front door clips through the decorative
 * ring/arch"* and *"build out the top of the ring so the entrance is
 * architecturally complete instead of a floating trim piece"*.
 *
 * Both faults were the same fault. The old entrance was a 3.6 m half-torus
 * hung at z 11.68 and a 3.4 x 3.45 m slab hung at z 11.70 -- the same
 * two centimetres of air, so the leaf and the ring occupied one another,
 * and the ring's crown cut a stone band across the top of the door. Above
 * the ring, the wall gap ran on open to 4.8 m: the "arch" was a trim piece
 * floating in a hole with the roof visible through it.
 *
 * What is built here instead is a portal with a section:
 *
 *   z 11.75..12.25  the wall plane. A stucco HEADER fills the opening from
 *                   the door head to the wall top, so the hole is a hole no
 *                   longer -- and it is what the arch is applied to.
 *   z 11.94..12.06  the LEAF, inside the reveal, clear of everything. It
 *                   hinges on the west jamb and swings OUT over the step,
 *                   so an opened door never stands in the foyer.
 *   z 11.29..11.75  the facade order: jambs, imposts, a segmental arch ring
 *                   and its keystone, all proud of the wall and none of them
 *                   sharing a millimetre with the leaf.
 *
 * The ring is SEGMENTAL, not semicircular, and that is arithmetic rather
 * than taste: a semicircle over a 3.9 m opening rises 1.95 m and would crown
 * at 5.0 m, half a metre through a 4.8 m wall and well past the 4.48 m
 * facade cornice. A segment of radius 2.685 m carrying the same span rises
 * 0.85 m and crowns at 4.07 m -- inside the wall, under the cornice, and
 * with 2.6 m of head clearance in the doorway.
 */
const PORTAL = Object.freeze({
  x: 13.5,
  wallZ: 12,
  leaf: Object.freeze({ width: 3.02, height: 2.6, depth: 0.12 }),
  /* Segmental ring: half-span 1.96, rise 0.85 -> R = (rise^2 + span^2)/(2 rise). */
  ring: Object.freeze({ radius: 2.685, tube: 0.16, springY: 3.06, faceZ: 11.5 }),
});

function entrancePortal(parent, colliders) {
  const portal = new THREE.Group();
  portal.name = 'estate-entrance-portal';
  parent.add(portal);
  const { x, wallZ } = PORTAL;
  const { width, height, depth } = PORTAL.leaf;
  const { radius, tube, springY, faceZ } = PORTAL.ring;

  /* The header. The opening is 4.0 m wide and 4.8 m tall and the door is
   * 2.6 m; this is the 2.2 m of wall that was simply missing above it.
   *
   * IT ALSO HAD TO STOP A ROUND, and for a long time it did not. The tag on
   * the mesh below is real and was always right; what was missing is that the
   * mesh had no collider, and the collider array is the only thing the shared
   * ballistics and perception ever trace against. `estate-front-west` ends at
   * x 11.5 and `estate-front-east` starts at 15.5, while the door leaf covers
   * 11.99..15.01 up to y 2.6 -- so this 2.2 m band and a ~0.49 m slot down
   * each side were a hole in a wall the player sees as solid stucco and stone.
   * A guard in the entry hall could put rounds through it into a player who
   * had not opened the door yet, which is the owner's report that he "can be
   * shot through the service-wing door before entering".
   *
   * The reveals are tagged as the stone they are drawn as (the jamb boxes
   * below), the header as the stucco of the wall it continues. */
  const header = box([4.0, 4.8 - height, 0.5], [x, (4.8 + height) / 2, wallZ], M.stucco, 'estate-entry-header');
  header.userData.combatMaterial = 'concrete';
  portal.add(header);
  addCollider(colliders, [x, (4.8 + height) / 2, wallZ], [4.0, 4.8 - height, 0.5],
    'estate-entry-header', M.stucco);
  /* The two slots either side of the leaf, from the ground to the header. */
  const revealWidth = (4.0 - width) / 2;
  for (const side of [-1, 1]) {
    addCollider(
      colliders,
      [x + side * (width + revealWidth) / 2, height / 2, wallZ],
      [revealWidth, height, 0.5],
      'estate-entry-reveal',
      M.stoneLight,
    );
  }

  // Step and threshold, so the door meets the ground on something.
  portal.add(
    box([4.4, 0.12, 1.15], [x, 0.06, 12.75], M.stone, 'estate-entry-step', { cast: false }),
    box([4.0, 0.06, 0.5], [x, 0.03, wallZ], M.stoneLight, 'estate-entry-threshold', { cast: false }),
  );

  // Jambs, imposts and the ring, all forward of the wall face.
  const jambX = [x - 1.75, x + 1.75];
  for (const jx of jambX) {
    portal.add(
      box([0.42, springY - 0.16, 0.46], [jx, (springY - 0.16) / 2, faceZ], M.stoneLight, 'estate-entry-jamb'),
      box([0.56, 0.16, 0.58], [jx, springY - 0.08, faceZ], M.stoneLight, 'estate-entry-impost'),
    );
  }
  const halfAngle = Math.asin(1.96 / radius);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 8, 40, halfAngle * 2),
    M.stoneLight,
  );
  ring.name = 'estate-entry-arch-ring';
  ring.position.set(x, springY - radius * Math.cos(halfAngle), faceZ);
  ring.rotation.z = Math.PI / 2 - halfAngle;
  ring.castShadow = true;
  portal.add(ring);
  portal.add(box(
    [0.36, 0.54, 0.5],
    [x, springY - radius * Math.cos(halfAngle) + radius + 0.06, faceZ],
    M.stoneLight,
    'estate-entry-keystone',
  ));

  /* The tympanum the ring encloses -- applied to the header's face, and
   * carrying Mark's brass monogram, which is on everything else he owns. */
  portal.add(box([3.5, 0.72, 0.09], [x, height + 0.38, 11.68], M.stuccoDark, 'estate-entry-tympanum', { cast: false }));
  const slashA = box([0.1, 0.5, 0.07], [x - 0.15, height + 0.4, 11.75], M.brass, 'estate-entry-monogram');
  const slashB = slashA.clone();
  slashA.rotation.z = -0.42;
  slashB.position.x = x + 0.15;
  slashB.rotation.z = 0.42;
  portal.add(slashA, slashB);

  /* The leaf itself: panelled, handled, and inside the reveal.
   *
   * Its GROUP ORIGIN is the west hinge, not the leaf's centre, so opening it
   * is one rotation and no translation -- and no arithmetic anywhere else
   * has to know how wide the door is. */
  const door = new THREE.Group();
  door.name = 'estate-service-door';
  door.position.set(x - width / 2, 0, wallZ);
  const half = width / 2;
  door.add(box([width, height, depth], [half, height / 2, 0], M.wood, 'estate-service-door-leaf'));
  for (const py of [height * 0.72, height * 0.3]) {
    for (const px of [-0.68, 0.68]) {
      door.add(box([1.06, height * 0.3, 0.03], [half + px, py, -0.075], M.woodLight, 'estate-service-door-panel', { cast: false }));
    }
  }
  door.add(
    box([0.06, 0.3, 0.08], [half + 1.18, 1.06, -0.09], M.brass, 'estate-service-door-handle'),
    cylinder(0.05, 0.05, [half + 1.18, 1.24, -0.09], M.brass, 'estate-service-door-escutcheon', 10),
  );
  for (const hy of [0.42, height - 0.42]) {
    door.add(box([0.1, 0.24, 0.05], [half - 1.46, hy, 0.06], M.iron, 'estate-service-door-hinge', { cast: false }));
  }
  portal.add(door);
  /* THE LEAF STAYS UNTAGGED, AND THAT IS THE POINT.
   *
   * It is tempting to tag it `M.wood` so a round into it sounds like a round
   * into a door. Do not: `combatMaterialFor` maps every wood in this scene to
   * `wood_thin`, `wood_thin` is in the shared ballistics' PENETRABLE set, and
   * the leaf's collider is 0.30 m deep against a 0.35 m penetration ceiling --
   * so the tag that buys a nicer impact sound also puts rifle rounds straight
   * back through the shut door, which is the owner's original report. Untagged
   * is a stopper (see `addCollider`), and a shut door is a stopper. */
  const collider = addCollider(colliders, [x, height / 2, wallZ], [width, height, 0.3], 'estate-service-door');
  return { portal, door, collider };
}

function tiledRoof(parent, x, z, width, depth, y = 5.15) {
  for (const side of [-1, 1]) {
    const roof = box([width / 2 + 0.55, 0.18, depth + 0.85], [x + side * width / 4, y, z], M.tile, 'clay-tile-roof');
    roof.rotation.z = side * 0.19;
    parent.add(roof);
  }
  /* was: one cylinder Mesh per ridge row -- 89 draw calls across the estate
   * roof. One batch, identical rows; 7 cm trim the moon map cannot resolve,
   * so the ridges also stop casting into the shadow pass. */
  const ridgeRows = [];
  for (let rz = z - depth / 2; rz <= z + depth / 2; rz += 0.72) ridgeRows.push(rz);
  instanced(
    parent,
    new THREE.CylinderGeometry(0.07, 0.07, width + 0.9, 8),
    M.tileDark,
    ridgeRows.map((rz) => (ridge) => {
      ridge.position.set(x, y + 0.13, rz);
      ridge.rotation.z = Math.PI / 2;
    }),
    'roof-tile-ridge',
  );
}

function ironGate(width, height, name) {
  const gate = new THREE.Group();
  gate.name = name;
  /* was: one box and one cone Mesh per bar -- 36 draws for the service gate
   * alone. Both batches are children of the gate group, so the opened pose
   * (rotation/translation/visibility) moves every bar exactly as before.
   * 5.5 cm ironwork is below what the moon map resolves, so it stops casting. */
  const barOffsets = [];
  for (let x = -width / 2; x <= width / 2; x += 0.34) barOffsets.push(x);
  instanced(
    gate,
    new THREE.BoxGeometry(0.055, height, 0.08),
    M.iron,
    barOffsets.map((x) => (bar) => { bar.position.set(x, height / 2, 0); }),
    `${name}.bar`,
  );
  instanced(
    gate,
    new THREE.ConeGeometry(0.09, 0.24, 4),
    M.iron,
    barOffsets.map((x) => (point) => { point.position.set(x, height + 0.12, 0); }),
    `${name}.point`,
  );
  gate.add(
    box([width + 0.15, 0.11, 0.1], [0, 0.55, 0], M.iron),
    box([width + 0.15, 0.11, 0.1], [0, height - 0.35, 0], M.iron),
  );
  return gate;
}

function palm(parent, x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.name = 'date-palm';
  tree.position.set(x, 0, z);
  const trunk = cylinder(0.18 * scale, 4.8 * scale, [0, 2.4 * scale, 0], M.woodLight, 'date-palm-trunk', 9);
  trunk.rotation.z = (Math.sin(x * 2.1 + z) * 0.05);
  tree.add(trunk);
  /* was: nine frond Meshes per palm -- 45 draws of vegetation sprigs across
   * the courtyard. One batch per tree keeps the fronds inside the tree group
   * (the geometry gate's per-palm assembly), and sprigs stop casting; the
   * trunk is the palm's readable shadow and keeps its own. */
  const frondAngles = [];
  for (let i = 0; i < 9; i++) frondAngles.push((i / 9) * Math.PI * 2);
  instanced(
    tree,
    new THREE.BoxGeometry(0.12 * scale, 0.045, 2.7 * scale),
    M.leaf,
    frondAngles.map((angle) => (frond) => {
      frond.position.set(0, 4.7 * scale, 0);
      frond.rotation.y = angle;
      frond.rotation.x = 0.25;
      frond.translateZ(1.1 * scale);
    }),
    'palm-frond',
  );
  parent.add(tree);
}

function cypress(parent, x, z, height = 4.2) {
  const shrub = new THREE.Mesh(new THREE.ConeGeometry(0.72, height, 10), M.leaf);
  shrub.name = 'cypress';
  shrub.position.set(x, height / 2, z);
  shrub.castShadow = true;
  parent.add(shrub);
}

function vehicle(parent, x, z, yaw = 0, color = 0x16191e) {
  const car = new THREE.Group();
  car.name = 'cartel-suv';
  // Wheel radius is .36 around local y=.20, so the vehicle root belongs at .16.
  car.position.set(x, 0.16, z);
  car.rotation.y = yaw;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.36 });
  car.add(
    box([2.05, 0.72, 4.7], [0, 0.42, 0], bodyMat, 'suv-body'),
    box([1.82, 0.72, 2.35], [0, 1.02, -0.18], M.iron, 'suv-cabin'),
    box([1.68, 0.5, 0.035], [0, 1.1, 1.02], M.screen, 'suv-windshield'),
  );
  for (const sx of [-0.92, 0.92]) for (const sz of [-1.55, 1.55]) {
    const wheel = cylinder(0.36, 0.23, [sx, 0.2, sz], M.blackout, 'suv-wheel', 12);
    wheel.rotation.z = Math.PI / 2;
    car.add(wheel);
  }
  parent.add(car);
  return car;
}

function framedPortrait(parent, x, y, z, { scale = 1, facing = 'z' } = {}) {
  const portrait = new THREE.Group();
  portrait.name = 'mark-family-portrait';
  const frame = box([2.2 * scale, 2.7 * scale, 0.12], [0, 0, 0], M.brass, 'portrait-frame');
  const field = box([1.94 * scale, 2.44 * scale, 0.14], [0, 0, 0.04], M.red, 'portrait-field');
  portrait.add(frame, field);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36 * scale, 14, 10), M.stoneLight);
  head.position.set(0, 0.36 * scale, 0.17);
  const torso = box([0.88 * scale, 0.85 * scale, 0.18], [0, -0.47 * scale, 0.15], M.ink, 'portrait-mark');
  portrait.add(head, torso);
  // Mark's initial appears throughout the building before Mark does.
  const slashA = box([0.12, 0.62, 0.08], [-0.18, 0.94 * scale, 0.19], M.brass, 'mark-monogram');
  const slashB = slashA.clone();
  slashA.rotation.z = -0.45;
  slashB.position.x = 0.18;
  slashB.rotation.z = 0.45;
  portrait.add(slashA, slashB);
  portrait.position.set(x, y, z);
  /* Which way the wall LOOKS. 'x' faces +X, '-x' faces -X; the default
   * faces +Z. Before this the east gallery row passed 'x' like the west row
   * and yawed the same way, so every frame on that wall showed the player
   * its back. */
  if (facing === 'x') portrait.rotation.y = Math.PI / 2;
  else if (facing === '-x') portrait.rotation.y = -Math.PI / 2;
  parent.add(portrait);
  return portrait;
}

/**
 * One framed canvas, MOUNTED.
 *
 * Owner, 2026-08-20 playtest: *"check all wall-art depth so nothing floats or
 * is buried in geometry"*. Every picture in this estate used to be an
 * absolute world position guessed against a wall whose face nobody looked
 * up, so the gallery's eight frames hung 20-46 cm off their panels and the
 * entry had none at all.
 *
 * So this takes the WALL FACE, not a guess: `(x, y, z)` is a point ON the
 * surface the picture hangs on and `yaw` is the direction that surface
 * looks. Everything is built forward of local z = 0, which puts the back of
 * the frame exactly on the plaster whatever the wall is doing.
 *
 * `slot` turns one of these into a piece of OWNER art rather than a coloured
 * field: it names an `assets/art/manifest.json` slot, the canvas gets a
 * material of its own so a texture can be swapped onto it without repainting
 * every other frame in the building (`ART_TONES` entries are shared), and the
 * group's names change so the geometry allowlist's `wall-art-frame#n` paths
 * keep counting the frames they were written for. See `A_TEAM_ART` below.
 */
function wallArt(parent, {
  x, y, z, yaw = 0, width = 0.9, height = 1.15, tone = 0, slot = null,
}) {
  const art = new THREE.Group();
  art.name = slot ? 'palace-a-team-art' : 'palace-wall-art';
  art.position.set(x, y, z);
  art.rotation.y = yaw;
  const toneMaterial = ART_TONES[Math.abs(Math.trunc(tone)) % ART_TONES.length];
  const frame = box(
    [width, height, 0.07], [0, 0, 0.035], M.brass,
    slot ? 'a-team-art-frame' : 'wall-art-frame',
  );
  const field = box(
    [width - 0.14, height - 0.14, 0.075],
    [0, 0, 0.042],
    slot ? toneMaterial.clone() : toneMaterial,
    slot ? 'a-team-art-field' : 'wall-art-field',
    { cast: false },
  );
  const mount = box(
    [0.07, 0.07, 0.02], [0, height / 2 - 0.06, 0.01], M.iron,
    slot ? 'a-team-art-mount' : 'wall-art-mount',
    { cast: false },
  );
  art.add(frame, field, mount);
  if (slot) {
    art.userData.artSlot = slot;
    art.userData.artField = field;
  }
  parent.add(art);
  return art;
}

/** A potted plant: the cheapest honest sign that somebody lives somewhere. */
function pottedPlant(parent, x, z, { scale = 1, y = 0 } = {}) {
  const plant = new THREE.Group();
  plant.name = 'palace-potted-plant';
  plant.position.set(x, y, z);
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26 * scale, 0.19 * scale, 0.44 * scale, 12),
    M.terracotta,
  );
  pot.name = 'planter-pot';
  pot.position.y = 0.22 * scale;
  pot.castShadow = true;
  pot.receiveShadow = true;
  plant.add(pot);
  plant.add(cylinder(0.22 * scale, 0.04, [0, 0.43 * scale, 0], M.soil, 'planter-soil', 12));
  for (let index = 0; index < 7; index++) {
    const angle = (index / 7) * Math.PI * 2 + x * 0.31;
    const blade = box(
      [0.075 * scale, 0.9 * scale, 0.03],
      [0, 0.88 * scale, 0],
      M.leaf,
      'planter-frond',
      { cast: false },
    );
    blade.rotation.y = angle;
    blade.rotation.x = 0.24 + (index % 3) * 0.12;
    blade.translateZ(0.16 * scale);
    plant.add(blade);
  }
  parent.add(plant);
  return plant;
}

/**
 * A pendant lantern that is actually where its light is.
 *
 * The estate's generic practicals hang a fixture at y 4.18 and put the
 * PointLight at 2.7 -- a metre and a half of nothing between the lamp and
 * the glow. These carry their own light inside their own glass.
 */
function pendantLantern(parent, x, z, {
  y = 4.46, drop = 0.95, colour = 0xffb86f, intensity = 13, distance = 15, name = 'palace-pendant',
} = {}) {
  const fixture = new THREE.Group();
  fixture.name = name;
  fixture.position.set(x, y, z);
  const bodyY = -drop;
  fixture.add(
    cylinder(0.11, 0.05, [0, -0.02, 0], M.brass, `${name}.canopy`, 10),
    cylinder(0.018, drop - 0.2, [0, -(drop - 0.2) / 2 - 0.04, 0], M.brass, `${name}.chain`, 6),
    cylinder(0.2, 0.05, [0, bodyY + 0.24, 0], M.brass, `${name}.crown`, 10),
    cylinder(0.24, 0.06, [0, bodyY - 0.24, 0], M.brass, `${name}.base`, 10),
  );
  for (const [ox, oz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    fixture.add(box([0.03, 0.5, 0.03], [ox, bodyY, oz], M.brass, `${name}.post`, { cast: false }));
  }
  const glass = box([0.36, 0.46, 0.36], [0, bodyY, 0], M.glass, `${name}.glass`, { cast: false });
  fixture.add(glass);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7), M.lampWarm);
  bulb.name = `${name}.bulb`;
  bulb.position.y = bodyY;
  fixture.add(bulb);
  parent.add(fixture);
  /* The PointLight is parented to the ZONE, not to the fixture, and carries
   * world coordinates. `buildCartelPalace` publishes `lights` as a flat pool
   * that verifiers and the composition root read `position` off directly, so
   * a light whose position is local to a hanging fixture would report a
   * metre below the origin of the map. Fixtures never move; this costs
   * nothing and keeps the published pool honest. */
  const light = new THREE.PointLight(colour, intensity, distance, 2);
  light.name = `${name}.light`;
  light.position.set(x, y + bodyY, z);
  parent.add(light);
  return { fixture, light, bulb };
}

/** A wall sconce on a named face, light inside the shade rather than near it. */
function wallSconce(parent, { x, y, z, yaw = 0, colour = 0xffc27a, intensity = 6, distance = 8 }) {
  const sconce = new THREE.Group();
  sconce.name = 'palace-wall-sconce';
  sconce.position.set(x, y, z);
  sconce.rotation.y = yaw;
  sconce.add(
    box([0.16, 0.34, 0.06], [0, 0, 0.03], M.brass, 'sconce-backplate'),
    box([0.05, 0.05, 0.2], [0, 0.02, 0.13], M.brass, 'sconce-arm', { cast: false }),
  );
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.24, 10, 1, true), M.lampWarm);
  shade.name = 'sconce-shade';
  shade.position.set(0, 0.14, 0.22);
  shade.rotation.x = Math.PI;
  sconce.add(shade);
  parent.add(sconce);
  // World coordinates, for the same reason as pendantLantern's light.
  const light = new THREE.PointLight(colour, intensity, distance, 2);
  light.name = 'sconce-light';
  light.position.set(x + Math.sin(yaw) * 0.22, y + 0.1, z + Math.cos(yaw) * 0.22);
  parent.add(light);
  return { sconce, light };
}

/** A desktop computer: tower, monitor on a stand, keyboard, mouse, cabling. */
function deskComputer(parent, { x, y, z, yaw = 0, name = 'palace-workstation' }) {
  const rig = new THREE.Group();
  rig.name = name;
  rig.position.set(x, y, z);
  rig.rotation.y = yaw;
  rig.add(
    box([0.42, 0.03, 0.24], [0, 0.015, 0.02], M.iron, `${name}.monitor-foot`, { cast: false }),
    box([0.07, 0.24, 0.06], [0, 0.14, 0.02], M.iron, `${name}.monitor-neck`, { cast: false }),
    box([0.68, 0.42, 0.05], [0, 0.47, 0], M.iron, `${name}.monitor-shell`),
    box([0.62, 0.36, 0.02], [0, 0.47, -0.035], M.screen, `${name}.monitor-screen`, { cast: false }),
    /* Keyboard and mouse on the SAME side as the screen faces: the operator
     * sits at local -Z, which is also where the monitor looks. */
    box([0.46, 0.02, 0.17], [0, 0.012, -0.32], M.ink, `${name}.keyboard`, { cast: false }),
    box([0.07, 0.025, 0.11], [0.34, 0.014, -0.3], M.ink, `${name}.mouse`, { cast: false }),
    box([0.02, 0.02, 0.34], [-0.02, 0.012, 0.19], M.blackout, `${name}.cable`, { cast: false }),
  );
  for (let index = 0; index < 5; index++) {
    rig.add(box([0.024, 0.006, 0.16], [-0.16 + index * 0.08, 0.026, -0.32], M.iron, `${name}.key-row`, { cast: false }));
  }
  parent.add(rig);
  return rig;
}

/** Mug, saucer, ashtray, a slumped stack of paper: a desk somebody sat at. */
function deskClutter(parent, { x, y, z, seed = 0, name = 'palace-desk-clutter' }) {
  const clutter = new THREE.Group();
  clutter.name = name;
  clutter.position.set(x, y, z);
  const mug = cylinder(0.045, 0.1, [0, 0.05, 0], M.white, `${name}.mug`, 12);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 5, 10), M.white);
  handle.name = `${name}.mug-handle`;
  handle.position.set(0.05, 0.055, 0);
  handle.rotation.y = Math.PI / 2;
  const coffee = cylinder(0.038, 0.006, [0, 0.096, 0], M.ink, `${name}.coffee`, 10);
  clutter.add(mug, handle, coffee);
  const tray = cylinder(0.085, 0.022, [0.3, 0.011, 0.12], M.glass, `${name}.ashtray`, 12);
  clutter.add(tray);
  for (let index = 0; index < 3; index++) {
    clutter.add(box(
      [0.055, 0.006, 0.012],
      [0.29 + index * 0.02, 0.026, 0.1 + index * 0.02],
      M.white,
      `${name}.stub`,
      { cast: false },
    ));
  }
  for (let index = 0; index < 6; index++) {
    const sheet = box(
      [0.21, 0.004, 0.29],
      [-0.34, 0.004 + index * 0.005, -0.06],
      M.paper,
      `${name}.paper`,
      { cast: false },
    );
    sheet.rotation.y = ((index + seed) % 4) * 0.035 - 0.05;
    clutter.add(sheet);
  }
  parent.add(clutter);
  return clutter;
}

/** The cleaner's cart: bucket, wringer, mop, bottles, bagged trash. */
function cleaningCart(parent, colliders, x, z, yaw = 0) {
  const cart = new THREE.Group();
  cart.name = 'estate-cleaning-cart';
  cart.position.set(x, 0, z);
  cart.rotation.y = yaw;
  cart.add(
    box([0.62, 0.06, 0.98], [0, 0.24, 0], M.steel, 'cleaning-cart-deck'),
    box([0.62, 0.05, 0.98], [0, 0.78, 0], M.steel, 'cleaning-cart-shelf'),
    box([0.6, 0.04, 0.06], [0, 0.98, -0.46], M.steel, 'cleaning-cart-handle', { cast: false }),
  );
  for (const [ox, oz] of [[-0.27, -0.44], [0.27, -0.44], [-0.27, 0.44], [0.27, 0.44]]) {
    cart.add(box([0.04, 0.62, 0.04], [ox, 0.55, oz], M.steel, 'cleaning-cart-post', { cast: false }));
    const wheel = cylinder(0.06, 0.035, [ox, 0.06, oz], M.blackout, 'cleaning-cart-wheel', 10);
    wheel.rotation.z = Math.PI / 2;
    cart.add(wheel);
  }
  cart.add(
    cylinder(0.2, 0.34, [0.03, 0.44, 0.28], M.plastic, 'cleaning-cart-bucket', 14),
    cylinder(0.17, 0.03, [0.03, 0.58, 0.28], M.water, 'cleaning-cart-water', 14),
    box([0.2, 0.3, 0.12], [0.03, 0.62, 0.06], M.plasticPale, 'cleaning-cart-wringer'),
  );
  for (const [ox, oz, tone] of [[-0.16, -0.24, M.plasticPale], [-0.02, -0.26, M.plastic], [0.14, -0.22, M.plasticPale]]) {
    cart.add(cylinder(0.045, 0.22, [ox, 0.92, oz], tone, 'cleaning-cart-bottle', 10));
    cart.add(box([0.03, 0.05, 0.03], [ox, 1.05, oz], M.iron, 'cleaning-cart-trigger', { cast: false }));
  }
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), M.blackout);
  bag.name = 'cleaning-cart-refuse-bag';
  bag.position.set(-0.06, 0.44, -0.3);
  bag.scale.set(1, 1.25, 0.9);
  bag.castShadow = true;
  cart.add(bag);
  const mop = cylinder(0.022, 1.5, [0.28, 0.78, -0.2], M.woodLight, 'cleaning-cart-mop-handle', 8);
  mop.rotation.x = 0.2;
  mop.rotation.z = -0.16;
  cart.add(mop);
  const head = box([0.16, 0.24, 0.1], [0.42, 0.12, -0.34], M.plasticPale, 'cleaning-cart-mop-head');
  cart.add(head);
  parent.add(cart);
  addCollider(colliders, [x, 0.5, z], [0.9, 1.0, 1.2], 'estate-cleaning-cart');
  return cart;
}

function table(parent, colliders, x, z, width, depth, name = 'table') {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, 0, z);
  g.add(box([width, 0.12, depth], [0, 0.82, 0], M.woodLight, `${name}.top`));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box([0.12, 0.8, 0.12], [sx * (width / 2 - 0.16), 0.4, sz * (depth / 2 - 0.16)], M.wood, `${name}.leg`));
  }
  parent.add(g);
  addCollider(colliders, [x, 0.48, z], [width, 0.96, depth], name);
  return g;
}

/* was: seven Meshes per chair -- 42 draws for six identical chairs. The named
 * group survives as the authored placement (its collider and per-chair name
 * are unchanged); the parts are recorded here and batched once by
 * buildDiningChairInstances. Chairs live under the estate roof where no
 * shadow they cast can reach the moon's map, so the batches stop casting. */
function diningChair(parent, colliders, chairParts, x, z, yaw, index) {
  const chair = new THREE.Group();
  chair.name = `dining-chair.${index}`;
  chair.position.set(x, 0, z);
  chair.rotation.y = yaw;
  parent.add(chair);
  const at = (px, py, pz) => (part) => {
    part.position.set(x, 0, z);
    part.rotation.y = yaw;
    part.translateX(px);
    part.translateY(py);
    part.translateZ(pz);
  };
  chairParts.seats.push(at(0, 0.52, 0));
  chairParts.backs.push(at(0, 1.0, 0.34));
  chairParts.cushions.push(at(0, 0.64, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    chairParts.legs.push(at(sx * 0.3, 0.25, sz * 0.3));
  }
  addCollider(colliders, [x, 0.7, z], [0.9, 1.4, 0.9], chair.name);
  return chair;
}

/** The four fixed parts every dining chair is built from -- see diningChair. */
function buildDiningChairInstances(parent, chairParts) {
  instanced(parent, new THREE.BoxGeometry(0.76, 0.12, 0.76), M.woodLight, chairParts.seats, 'dining-chair-seat');
  instanced(parent, new THREE.BoxGeometry(0.76, 0.92, 0.12), M.wood, chairParts.backs, 'dining-chair-back');
  /* THE CUSHIONS. Owner, 2026-08-20: *"fix scale so they sit naturally
   * inside the chair frame -- nothing protruding underneath or ballooning up
   * through the seat"*. The old block was 0.58 TALL at seat-centre height, so
   * every chair had thirteen centimetres of upholstery hanging below its own
   * frame and a third of a metre swelling above it. The seat slab is 0.76 x
   * 0.12 with its top at y 0.58; a cushion is 0.12 thick, inset 8 cm all
   * round, and rests exactly on that top. */
  instanced(parent, new THREE.BoxGeometry(0.68, 0.12, 0.68), M.textile, chairParts.cushions, 'dining-chair-upholstery');
  instanced(parent, new THREE.BoxGeometry(0.085, 0.5, 0.085), M.wood, chairParts.legs, 'dining-chair-leg');
}

/* was: four Meshes per place setting -- 32 draws of tableware. The named
 * group survives for the authored table rhythm; the pieces are recorded in
 * the table's own space (exactly where the group used to carry them) and
 * batched once by buildPlaceSettingInstances. */
function diningPlaceSetting(parent, settingParts, x, z, index) {
  const setting = new THREE.Group();
  setting.name = `dining-place-setting.${index}`;
  setting.position.set(x, 0.88, z);
  parent.add(setting);
  const at = (px, py, pz) => (piece) => { piece.position.set(x + px, 0.88 + py, z + pz); };
  settingParts.plates.push(at(0, 0.013, 0));
  settingParts.rims.push(at(0, 0.032, 0));
  settingParts.glasses.push(at(0.28, 0.085, 0));
  settingParts.napkins.push(at(-0.28, 0.011, 0));
  return setting;
}

/** The four fixed pieces every place setting repeats -- see diningPlaceSetting. */
function buildPlaceSettingInstances(parent, settingParts) {
  instanced(parent, new THREE.CylinderGeometry(0.23, 0.23, 0.026, 18), M.white, settingParts.plates, 'dining-plate');
  instanced(parent, new THREE.CylinderGeometry(0.15, 0.15, 0.012, 18), M.floorAccent, settingParts.rims, 'dining-plate-rim');
  instanced(parent, new THREE.CylinderGeometry(0.055, 0.055, 0.17, 12), M.glass, settingParts.glasses, 'dining-glass');
  instanced(parent, new THREE.BoxGeometry(0.19, 0.022, 0.28), M.textile, settingParts.napkins, 'dining-napkin');
}

function diningChandelier(parent) {
  const fixture = new THREE.Group();
  fixture.name = 'dining-chandelier';
  fixture.position.set(0, 0, -42.4);
  fixture.add(cylinder(0.035, 0.78, [0, 4.12, 0], M.brass, 'dining-chandelier-chain', 8));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.055, 8, 32), M.brass);
  ring.name = 'dining-chandelier-ring';
  ring.position.y = 3.7;
  ring.rotation.x = Math.PI / 2;
  fixture.add(ring);
  const armAngles = [];
  for (let index = 0; index < 8; index++) armAngles.push((index / 8) * Math.PI * 2);
  for (const angle of armAngles) {
    const arm = box(
      [1.18, 0.045, 0.045],
      [Math.cos(angle) * 0.62, 3.7, Math.sin(angle) * 0.62],
      M.brass,
      'dining-chandelier-arm',
    );
    arm.rotation.y = -angle;
    fixture.add(arm);
  }
  /* was: a cup and a bulb Mesh per arm -- 16 draws of identical brass and
   * lamp glass. The eight arms stay authored meshes (they are the fixture's
   * readable silhouette); the round repeats batch and, hanging under the
   * dining ceiling, stop casting into the moon's map. */
  instanced(
    fixture,
    new THREE.CylinderGeometry(0.13, 0.13, 0.07, 10),
    M.brass,
    armAngles.map((angle) => (cup) => {
      cup.position.set(Math.cos(angle) * 1.24, 3.63, Math.sin(angle) * 1.24);
    }),
    'dining-chandelier-cup',
  );
  instanced(
    fixture,
    new THREE.SphereGeometry(0.105, 10, 7),
    M.lampWarm,
    armAngles.map((angle) => (bulb) => {
      bulb.position.set(Math.cos(angle) * 1.24, 3.58, Math.sin(angle) * 1.24);
    }),
    'dining-chandelier-bulb',
  );
  parent.add(fixture);
  return fixture;
}

/**
 * EVIDENCE #2 -- the chef's uniform.
 *
 * Owner, 2026-08-20 playtest: *"evidence #2 becomes the CHEF UNIFORM --
 * clearly readable as a chef outfit (apron/jacket/hat help sell it), not
 * generic clothing"*.
 *
 * The clue used to be a brown box on a bench captioned "chef whites", with
 * a 4 cm white slab standing in for the jacket. This is a dressing corner:
 * an open valet rail carrying a double-breasted whites jacket on a hanger --
 * two columns of buttons, a mandarin collar, cuffed sleeves -- with the
 * toque on the shelf above it, the apron folded over the rail, houndstooth
 * trousers beside it and his knife roll open on the bench. The clue TARGET
 * is the jacket, so what the player looks at while the line plays is the
 * uniform itself.
 */
function evidenceBelongings(parent, colliders) {
  const at = PALACE_ANCHORS.belongings;
  const bench = table(parent, colliders, at.x, at.z, 2.2, 0.8, 'guest-suite-luggage-bench');

  /* ONE z FOR THE STAND AND EVERYTHING HANGING ON IT.
   *
   * The stand sat at `at.z - 0.62` and its shelf, 0.5 m deep, reached back to
   * within 3 cm of the luggage bench in front of it -- 8 cm of overlap between
   * the two colliders. It wants to be further back, and the reason that was
   * not a one-character fix is that the whites are added to `parent` rather
   * than to the stand, each with `at.z - 0.62` written out again: moving the
   * stand on its own would have left the jacket, the apron and the trousers
   * hanging in the air where the rail used to be.
   *
   * So the offset is named once and used everywhere. Moving the stand now
   * moves what is on it. */
  const valetZ = at.z - 0.75;
  const valet = new THREE.Group();
  valet.name = 'guest-suite-detail.valet-rail';
  valet.position.set(at.x, 0, valetZ);
  valet.add(
    box([0.1, 2.06, 0.1], [-1.24, 1.03, 0], M.wood, 'valet-upright'),
    box([0.1, 2.06, 0.1], [1.24, 1.03, 0], M.wood, 'valet-upright'),
    box([2.6, 0.09, 0.5], [0, 2.02, 0], M.woodLight, 'valet-shelf'),
    box([2.6, 0.08, 0.42], [0, 0.16, 0], M.wood, 'valet-base', { cast: false }),
  );
  const rail = cylinder(0.028, 2.44, [0, 1.72, 0], M.brass, 'valet-rail', 10);
  rail.rotation.z = Math.PI / 2;
  valet.add(rail);

  /* THE JACKET. Its own material instance: collecting the clue zeroes
   * emissiveIntensity across the target's subtree, and doing that through a
   * shared palette material would have dimmed white props estate-wide. */
  const whites = new THREE.MeshStandardMaterial({ color: 0xeeece4, roughness: 0.93 });
  const target = new THREE.Group();
  target.name = 'evidence.sauce-belongings';
  // Local to the valet group, which already stands at the anchor.
  target.position.set(-0.35, 1.34, 0);
  target.userData.evidenceId = EVIDENCE_IDS.BELONGINGS;
  target.userData.evidenceTitle = 'Sauce\'s chef whites';
  target.userData.evidenceDetail = 'Pressed, hung, and monogrammed. His toque is on the shelf and his knives are rolled, not confiscated. Nobody packed this man in a hurry.';
  target.add(
    // Hanger, then the body of the jacket, then what makes it a chef's.
    box([0.34, 0.02, 0.02], [0, 0.42, 0], M.iron, 'chef-jacket-hanger', { cast: false }),
    box([0.03, 0.09, 0.02], [0, 0.49, 0], M.iron, 'chef-jacket-hanger-hook', { cast: false }),
    box([0.56, 0.72, 0.13], [0, 0.02, 0], whites, 'chef-jacket-body'),
    box([0.18, 0.5, 0.14], [-0.19, -0.05, 0], whites, 'chef-jacket-sleeve'),
    box([0.18, 0.5, 0.14], [0.19, -0.05, 0], whites, 'chef-jacket-sleeve'),
    box([0.19, 0.08, 0.15], [-0.19, -0.29, 0], M.floorAccent, 'chef-jacket-cuff', { cast: false }),
    box([0.19, 0.08, 0.15], [0.19, -0.29, 0], M.floorAccent, 'chef-jacket-cuff', { cast: false }),
    box([0.3, 0.09, 0.15], [0, 0.36, 0], whites, 'chef-jacket-mandarin-collar'),
  );
  // Two columns of knotted buttons -- the one detail that says "chef" and
  // not "white shirt" at five metres.
  for (const bx of [-0.075, 0.075]) {
    for (let index = 0; index < 5; index++) {
      target.add(cylinder(
        0.019, 0.02, [bx, 0.26 - index * 0.115, 0.07], M.ink, 'chef-jacket-button', 8,
      ));
    }
  }
  valet.add(target);

  // The rest of the outfit, so the jacket is not the only white thing here.
  const toque = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.3, 14), whites);
  toque.name = 'chef-toque';
  toque.position.set(at.x + 0.62, 2.22, valetZ);
  parent.add(toque);
  parent.add(cylinder(0.155, 0.07, [at.x + 0.62, 2.09, valetZ], whites, 'chef-toque-band', 14));

  const apron = box([0.44, 0.62, 0.05], [at.x + 0.52, 1.42, valetZ], whites, 'chef-apron');
  parent.add(apron);
  parent.add(
    box([0.46, 0.06, 0.06], [at.x + 0.52, 1.72, valetZ], M.floorAccent, 'chef-apron-tie', { cast: false }),
    box([0.42, 0.6, 0.06], [at.x + 1.0, 1.38, valetZ], M.stoneLight, 'chef-houndstooth-trousers'),
  );

  // The knife roll, open on the bench: eight tools, none of them removed.
  const knives = new THREE.Group();
  knives.name = 'guest-suite-detail.knife-roll';
  knives.position.set(at.x - 0.5, 0.89, at.z + 0.02);
  knives.rotation.y = 0.22;
  knives.add(box([0.86, 0.03, 0.34], [0, 0.015, 0], M.tile, 'knife-roll-canvas'));
  for (let index = 0; index < 8; index++) {
    const x = -0.36 + index * 0.1;
    knives.add(
      box([0.026, 0.012, 0.2], [x, 0.036, -0.03], M.steel, 'knife-blade', { cast: false }),
      box([0.03, 0.02, 0.09], [x, 0.04, 0.11], M.wood, 'knife-handle', { cast: false }),
    );
  }
  parent.add(knives);

  // And the luggage that was never repacked.
  const suitcase = box([1.05, 0.24, 0.6], [0, 1.0, 0.02], M.wood, 'sauce-open-suitcase');
  bench.add(suitcase);
  bench.add(
    box([1.0, 0.05, 0.56], [0, 1.14, 0.02], M.tile, 'sauce-suitcase-lining', { cast: false }),
    box([0.42, 0.09, 0.3], [0.24, 1.17, 0.02], whites, 'sauce-folded-shirts'),
    box([0.18, 0.035, 0.26], [-0.28, 1.16, 0.06], M.red, 'sauce-passport'),
    box([0.11, 0.02, 0.15], [-0.28, 1.18, 0.06], M.brass, 'sauce-passport-crest', { cast: false }),
  );
  parent.add(valet);
  addCollider(colliders, [at.x, 1.0, valetZ], [2.7, 2.1, 0.6], 'guest-suite-valet-rail');
  return target;
}

/**
 * EVIDENCE #3 -- the ledger, the corn, and the desk it is composed on.
 *
 * Owner, 2026-08-20 playtest: *"put the piece of corn with the third
 * evidence item on the desk. Compose the setup deliberately rather than
 * dropping an object on furniture: documents/photos, the corn, maybe a
 * handwritten note or recipe material, desk lamp aimed at the clue"*.
 *
 * So the desk is a scene: the payroll ledger open at the page that matters,
 * a fan of surveillance polaroids under it, a handwritten recipe card in
 * Sauce's hand weighted down by one cob of corn with the husk peeled back,
 * a pen laid across the page, and a gooseneck lamp bent over the lot. The
 * corn is the joke and the signature at once, which is why it is placed ON
 * the paperwork rather than left somewhere as loose set dressing.
 */
function evidenceLedger(parent, colliders) {
  const at = PALACE_ANCHORS.paymentLedger;
  const desk = table(parent, colliders, at.x, at.z, 2.6, 1.2, 'mark-office-desk');
  const ledgerPaper = new THREE.MeshStandardMaterial({ color: 0xe8dcbb, roughness: 1 });
  const target = box([0.62, 0.09, 0.78], [0, 0.94, 0], ledgerPaper, 'evidence.payment-ledger');
  target.rotation.y = -0.18;
  target.userData.evidenceId = EVIDENCE_IDS.PAYMENT_LEDGER;
  target.userData.evidenceTitle = 'Mark\'s payment ledger';
  target.userData.evidenceDetail = 'Sauce is listed as a consultant, paid every other Friday, and the first payment predates the attack on Lou\'s house. There is a cob of corn holding down his recipe card.';
  desk.add(target);
  for (let i = 0; i < 7; i++) {
    target.add(box([0.46, 0.008, 0.018], [0, 0.052, -0.24 + i * 0.075], M.ink, 'ledger-entry', { cast: false }));
  }
  // The line that matters, in red, and the spine and cover the pages sit in.
  target.add(
    box([0.48, 0.01, 0.026], [0, 0.056, 0.06], M.red, 'ledger-flagged-entry', { cast: false }),
    box([0.06, 0.03, 0.8], [-0.33, 0.9 - 0.9, 0], M.tile, 'ledger-spine', { cast: false }),
  );
  desk.add(
    box([0.02, 0.014, 0.15], [0.13, 0.995, 0.06], M.brass, 'mark-office-desk.pen', { cast: false }),
  );

  /* The paperwork the ledger sits on: three surveillance polaroids fanned
   * out, and Sauce's own recipe card in pencil. */
  const paperwork = new THREE.Group();
  paperwork.name = 'mark-office-desk.paperwork';
  paperwork.position.set(0.66, 0.885, -0.06);
  for (const [index, [px, pz, spin]] of [[-0.06, -0.14, 0.3], [0.06, 0.02, -0.22], [-0.02, 0.18, 0.11]].entries()) {
    const polaroid = box([0.19, 0.005, 0.23], [px, 0.004 + index * 0.006, pz], M.white, 'desk-polaroid');
    polaroid.rotation.y = spin;
    paperwork.add(polaroid);
    const image = box([0.15, 0.006, 0.15], [px, 0.008 + index * 0.006, pz - 0.02], M.canvasArt, 'desk-polaroid-image', { cast: false });
    image.rotation.y = spin;
    paperwork.add(image);
  }
  desk.add(paperwork);

  const recipe = new THREE.Group();
  recipe.name = 'mark-office-desk.recipe-card';
  recipe.position.set(-0.72, 0.885, 0.16);
  recipe.rotation.y = 0.26;
  recipe.add(box([0.34, 0.006, 0.24], [0, 0.003, 0], M.paper, 'recipe-card'));
  for (let index = 0; index < 6; index++) {
    recipe.add(box(
      [0.22 - (index % 2) * 0.05, 0.004, 0.008],
      [-0.02, 0.008, -0.08 + index * 0.03],
      M.ink,
      'recipe-handwriting',
      { cast: false },
    ));
  }
  desk.add(recipe);

  /* One cob of corn, husk peeled back, weighting down the recipe card. */
  const cob = new THREE.Group();
  cob.name = 'mark-office-desk.corn';
  cob.position.set(-0.66, 0.925, 0.1);
  cob.rotation.z = Math.PI / 2;
  cob.rotation.y = 0.4;
  const kernel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.031, 0.2, 12), M.corn);
  kernel.name = 'corn-cob';
  kernel.castShadow = true;
  kernel.receiveShadow = true;
  cob.add(kernel);
  cob.add(new THREE.Mesh(new THREE.SphereGeometry(0.031, 10, 7), M.corn));
  cob.children.at(-1).position.y = 0.1;
  cob.children.at(-1).name = 'corn-tip';
  for (let index = 0; index < 4; index++) {
    const husk = box([0.05, 0.22, 0.012], [0, -0.16, 0], M.husk, 'corn-husk-leaf');
    husk.rotation.y = (index / 4) * Math.PI * 2;
    husk.rotation.x = 0.22;
    husk.translateZ(0.03);
    cob.add(husk);
  }
  cob.add(box([0.012, 0.1, 0.012], [0, -0.3, 0], M.husk, 'corn-silk', { cast: false }));
  desk.add(cob);

  /* The gooseneck, bent over the clue. Its light is inside its own shade and
   * its cone is short-throw, so the composition is READ rather than haloed. */
  const lamp = new THREE.Group();
  lamp.name = 'mark-office-desk.clue-lamp';
  lamp.position.set(-1.06, 0.88, -0.34);
  lamp.add(
    cylinder(0.12, 0.035, [0, 0.018, 0], M.iron, 'clue-lamp-base', 12),
    cylinder(0.02, 0.5, [0, 0.27, 0], M.iron, 'clue-lamp-stem', 8),
  );
  const neck = cylinder(0.018, 0.46, [0.2, 0.52, 0.06], M.iron, 'clue-lamp-neck', 8);
  neck.rotation.z = -1.1;
  neck.rotation.x = -0.25;
  lamp.add(neck);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.18, 12, 1, true), M.lampWarm);
  shade.name = 'clue-lamp-shade';
  shade.position.set(0.42, 0.46, 0.14);
  shade.rotation.x = 1.05;
  shade.rotation.z = 0.62;
  lamp.add(shade);
  desk.add(lamp);
  // World coordinates -- `lights` is a flat published pool (see pendantLantern).
  const lampLight = new THREE.PointLight(0xffdbaa, 5.2, 3.6, 2);
  lampLight.name = 'office-clue-lamp-light';
  lampLight.position.set(at.x - 0.56, 1.22, at.z - 0.14);
  parent.add(lampLight);

  return { target, light: lampLight, desk };
}

/**
 * The intelligence desk: a monitor on a real arm, showing a real file.
 *
 * Owner, 2026-08-20 playtest: *"the floating monitor needs physical
 * mounting — a ceiling-mounted articulated arm works well, with visible
 * brackets and cabling"*, and *"make the evidence interaction visually
 * distinct WITHOUT making it glow like a Skyrim quest item"*.
 *
 * The old clue was a screen-coloured slab hovering 40 cm above a table with
 * nothing holding it and one white rectangle for Sauce. Now it hangs off a
 * ceiling plate on a drop pole, a shoulder, an upper arm and a forearm, with
 * a cable loom taped along the arm and a spur running to the room's existing
 * tray; the panel carries an actual dossier layout -- gate-camera still,
 * mugshot card, highlighted payroll row, cartel header bar -- and what makes
 * it READ as the thing to look at is the task lamp aimed at the printed file
 * beneath it, not a halo on the prop.
 *
 * Its emissive materials are OWN INSTANCES, not the shared `M.screen`:
 * collecting the clue zeroes emissiveIntensity across the target's subtree,
 * and on the shared material that used to darken every screen in the estate.
 */
function evidenceSecurityStill(parent, colliders) {
  const at = PALACE_ANCHORS.securityStill;
  /* 3.4 m, not 4.2. The desk is 4.2 m wide at x 14.8, so its east end reached
   * 16.9 -- and the rack column stands from 16.375, which put half a metre of
   * operator's desk inside the servers. Narrowed here and the racks pushed
   * back to the wall below; between them the desk clears the racks by 17.5 cm
   * instead of overlapping them by 52.5. */
  const consoleTable = table(parent, colliders, at.x, at.z + 0.7, 3.4, 0.86, 'security-console');

  const mount = new THREE.Group();
  mount.name = 'security-detail.monitor-arm';
  mount.position.set(at.x, 0, at.z + 0.28);
  mount.add(
    box([0.46, 0.05, 0.46], [0, 4.44, 0], M.iron, 'monitor-arm-ceiling-plate'),
    box([0.1, 0.1, 0.1], [0.16, 4.4, 0.16], M.brass, 'monitor-arm-plate-bolt', { cast: false }),
    box([0.1, 0.1, 0.1], [-0.16, 4.4, -0.16], M.brass, 'monitor-arm-plate-bolt', { cast: false }),
    cylinder(0.045, 1.42, [0, 3.7, 0], M.iron, 'monitor-arm-drop-pole', 10),
    cylinder(0.085, 0.14, [0, 2.98, 0], M.steel, 'monitor-arm-shoulder', 12),
  );
  const upper = cylinder(0.038, 0.86, [0, 2.62, -0.2], M.steel, 'monitor-arm-upper', 10);
  upper.rotation.x = 0.42;
  mount.add(upper);
  mount.add(cylinder(0.07, 0.12, [0, 2.27, -0.36], M.steel, 'monitor-arm-elbow', 12));
  const fore = cylinder(0.034, 0.66, [0, 1.98, -0.34], M.steel, 'monitor-arm-forearm', 10);
  fore.rotation.x = -0.12;
  mount.add(fore);
  mount.add(
    cylinder(0.06, 0.1, [0, 1.68, -0.31], M.steel, 'monitor-arm-wrist', 12),
    box([0.24, 0.24, 0.04], [0, 1.66, -0.28], M.iron, 'monitor-arm-vesa-plate', { cast: false }),
  );
  /* Cable management, which is what makes a mount read as installed kit
   * rather than a prop: a loom taped down the arm and a spur to the tray. */
  const loom = cylinder(0.018, 1.5, [0.06, 3.66, 0.03], M.blackout, 'monitor-arm-cable', 6);
  loom.rotation.z = 0.02;
  mount.add(loom);
  const loomLower = cylinder(0.018, 1.0, [0.06, 2.6, -0.22], M.blackout, 'monitor-arm-cable', 6);
  loomLower.rotation.x = 0.36;
  mount.add(loomLower);
  for (const y of [4.02, 3.4, 2.78]) {
    mount.add(box([0.11, 0.03, 0.11], [0.03, y, 0.01], M.plasticPale, 'monitor-arm-cable-tie', { cast: false }));
  }
  const spur = box([2.9, 0.03, 0.03], [-1.45, 4.24, 0.02], M.blackout, 'monitor-arm-cable-spur', { cast: false });
  mount.add(spur);
  parent.add(mount);

  /* The panel. Its own emissive instance -- see the note above. */
  const panelGlass = new THREE.MeshStandardMaterial({
    color: 0x0e1a20, emissive: 0x2f5f6b, emissiveIntensity: 0.8, roughness: 0.34,
  });
  const target = box([1.42, 0.9, 0.05], [at.x, 1.66, at.z + 0.22], panelGlass, 'evidence.security-still');
  target.rotation.x = 0.12;
  target.userData.evidenceId = EVIDENCE_IDS.SECURITY_STILL;
  target.userData.evidenceTitle = 'Cartel dossier: SAUCE, R.';
  target.userData.evidenceDetail = 'Gate camera, 02:14. No restraints, no escort. Sauce keys himself in carrying a bottle for Mark, and the file has him on the payroll.';
  parent.add(target);
  target.add(box([1.5, 0.98, 0.07], [0, 0, -0.03], M.iron, 'security-still-bezel'));

  // The dossier layout, on the glass.
  const headerBar = new THREE.MeshStandardMaterial({
    color: 0x3d1418, emissive: 0x6d1c22, emissiveIntensity: 0.9, roughness: 0.5,
  });
  const highlight = new THREE.MeshStandardMaterial({
    color: 0x6a5a12, emissive: 0xb59216, emissiveIntensity: 1.1, roughness: 0.5,
  });
  const plate = new THREE.MeshStandardMaterial({
    color: 0x9fb4ba, emissive: 0x4d6a72, emissiveIntensity: 0.5, roughness: 0.6,
  });
  target.add(
    box([1.36, 0.09, 0.012], [0, 0.37, 0.028], headerBar, 'dossier-header', { cast: false }),
    // Gate-camera still, left: a lit gatehouse and one man walking in alone.
    box([0.6, 0.44, 0.012], [-0.35, 0.06, 0.028], plate, 'dossier-gate-still', { cast: false }),
    box([0.07, 0.17, 0.014], [-0.4, 0.0, 0.032], M.white, 'dossier-still-figure', { cast: false }),
    box([0.03, 0.06, 0.014], [-0.36, -0.03, 0.032], M.floorAccent, 'dossier-still-bottle', { cast: false }),
    // Mugshot card, right, above the file rows.
    box([0.28, 0.34, 0.012], [0.34, 0.13, 0.028], plate, 'dossier-mugshot', { cast: false }),
    box([0.11, 0.11, 0.014], [0.34, 0.19, 0.032], M.white, 'dossier-mugshot-head', { cast: false }),
  );
  for (let index = 0; index < 5; index++) {
    const row = index === 2 ? highlight : plate;
    target.add(box(
      [0.5, 0.032, 0.012],
      [0.34, -0.06 - index * 0.055, 0.028],
      row,
      index === 2 ? 'dossier-highlighted-row' : 'dossier-row',
      { cast: false },
    ));
  }
  for (let index = 0; index < 3; index++) {
    target.add(box(
      [0.56, 0.024, 0.012],
      [-0.35, -0.22 - index * 0.045, 0.028],
      plate,
      'dossier-caption',
      { cast: false },
    ));
  }

  /* The printed half of the file, on the desk under a task lamp -- this,
   * not a glow, is what tells the player there is something here. */
  const paperwork = new THREE.Group();
  paperwork.name = 'security-detail.dossier-paperwork';
  paperwork.position.set(at.x - 1.05, 0.88, at.z + 0.65);
  const folder = box([0.72, 0.02, 0.5], [0, 0.01, 0], M.floorAccent, 'dossier-folder');
  folder.rotation.y = -0.14;
  paperwork.add(folder);
  for (let index = 0; index < 4; index++) {
    const sheet = box([0.3, 0.004, 0.42], [0.16, 0.024 + index * 0.005, 0.01], M.paper, 'dossier-page', { cast: false });
    sheet.rotation.y = -0.14 + index * 0.03;
    paperwork.add(sheet);
  }
  const photo = box([0.2, 0.005, 0.26], [-0.16, 0.026, -0.02], M.white, 'dossier-photograph', { cast: false });
  photo.rotation.y = 0.22;
  paperwork.add(photo);
  paperwork.add(box([0.09, 0.006, 0.12], [-0.16, 0.03, -0.03], M.ink, 'dossier-photograph-figure', { cast: false }));
  parent.add(paperwork);

  const taskLamp = new THREE.Group();
  taskLamp.name = 'security-detail.task-lamp';
  taskLamp.position.set(at.x - 1.85, 0.88, at.z + 0.58);
  taskLamp.add(
    cylinder(0.11, 0.04, [0, 0.02, 0], M.iron, 'task-lamp-base', 12),
    cylinder(0.02, 0.44, [0, 0.24, 0], M.iron, 'task-lamp-stem', 8),
  );
  const arm = cylinder(0.018, 0.4, [0.15, 0.5, 0.06], M.iron, 'task-lamp-arm', 8);
  arm.rotation.z = -1.15;
  taskLamp.add(arm);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 10, 1, true), M.lampWarm);
  shade.name = 'task-lamp-shade';
  shade.position.set(0.32, 0.45, 0.08);
  shade.rotation.x = 0.9;
  shade.rotation.z = 0.5;
  taskLamp.add(shade);
  parent.add(taskLamp);
  // World coordinates -- `lights` is a flat published pool (see pendantLantern).
  const lampLight = new THREE.PointLight(0xffd9a8, 4.6, 3.4, 2);
  lampLight.name = 'security-task-lamp-light';
  lampLight.position.set(at.x - 1.43, 1.21, at.z + 0.74);
  parent.add(lampLight);

  return { target, light: lampLight, console: consoleTable };
}

/**
 * Build Mark's walled estate as its own map. It deliberately shares no Lou
 * mansion builder or palette: stucco, carved stone, clay tile, courtyards,
 * water, service rooms, and a long dining axis define this compound.
 */
export function buildCartelPalace(scene) {
  const root = new THREE.Group();
  root.name = 'cartel-palace.compound';
  scene.add(root);
  const colliders = [];
  const courtyardPracticalLights = [];
  const courtyardLampBulbs = [];
  /* Interior practicals now hang inside their own fixtures (pendantLantern /
   * wallSconce) instead of floating a metre and a half below a brass cap on
   * the ceiling. Each room pushes its lights here; the composition root still
   * gets one flat pool it can cap or disable. */
  const roomLights = [];

  const earth = new THREE.Mesh(new THREE.PlaneGeometry(150, 190), new THREE.MeshStandardMaterial({
    color: 0x171b17, roughness: 1,
  }));
  earth.name = 'palace-surrounding-land';
  earth.rotation.x = -Math.PI / 2;
  earth.position.set(0, -0.025, 10);
  earth.receiveShadow = true;
  root.add(earth);

  // Dirt approach and tire ruts stop the player materializing at a front door.
  root.add(box([7.8, 0.05, 36], [14, 0.015, 74], M.stone, 'dirt-service-road', { cast: false }));
  for (const x of [12.5, 15.5]) root.add(box([0.34, 0.018, 34], [x, 0.045, 74], M.ink, 'tire-rut', { cast: false }));

  const perimeter = new THREE.Group();
  perimeter.name = 'palace-perimeter';
  root.add(perimeter);
  solid(perimeter, colliders, [0.7, 4.6, 112], [-22, 2.3, 3], M.stuccoDark, 'west-compound-wall');
  solid(perimeter, colliders, [0.7, 4.6, 112], [22, 2.3, 3], M.stuccoDark, 'east-compound-wall');
  solid(perimeter, colliders, [19.2, 4.6, 0.7], [-12.75, 2.3, -53], M.stuccoDark, 'rear-compound-wall-west');
  solid(perimeter, colliders, [19.2, 4.6, 0.7], [12.75, 2.3, -53], M.stuccoDark, 'rear-compound-wall-east');
  solid(perimeter, colliders, [33.3, 4.6, 0.7], [-5.35, 2.3, 59], M.stuccoDark, 'front-compound-wall-west');
  solid(perimeter, colliders, [5.2, 4.6, 0.7], [19.4, 2.3, 59], M.stuccoDark, 'front-compound-wall-east');
  for (const x of [-22, -11, 0, 10.8, 17.2, 22]) {
    perimeter.add(box([1.15, 5.15, 1.15], [x, 2.58, 59], M.stoneLight, 'perimeter-pier'));
  }

  const serviceGate = ironGate(6.0, 3.8, 'service-gate');
  serviceGate.position.set(14, 0, 58.9);
  serviceGate.userData.closedRotation = 0;
  root.add(serviceGate);
  const serviceGateCollider = addCollider(colliders, [14, 2, 58.9], [6.1, 4.0, 0.3], 'service-gate');

  const powerBox = new THREE.Group();
  powerBox.name = 'service-power-box';
  powerBox.position.copy(PALACE_ANCHORS.powerBox);
  const cabinet = box([0.72, 1.05, 0.26], [0, 0, 0], M.iron, 'power-cabinet');
  cabinet.userData.actionTarget = 'power';
  powerBox.add(cabinet);
  for (const x of [-0.24, 0.24]) {
    powerBox.add(box([0.1, 0.65, 0.14], [x, -0.85, 0], M.iron, 'power-cabinet-support'));
  }
  const powerLight = box([0.1, 0.1, 0.03], [0.2, 0.28, -0.15], M.screen, 'power-status', { cast: false });
  powerBox.add(powerLight);
  root.add(powerBox);

  // Separate guard housing and vehicle yard make the compound read as defended.
  const guardhouse = new THREE.Group();
  guardhouse.name = 'guard-housing';
  guardhouse.position.set(15, 0, 48);
  root.add(guardhouse);
  solid(guardhouse, colliders, [9, 3.7, 11], [0, 1.85, 0], M.stucco, 'guardhouse-shell');
  // Seat the roof on the 3.7 m shell instead of leaving 17 cm of air.
  guardhouse.add(box([8.5, 0.26, 11.6], [0, 3.83, 0], M.tile, 'guardhouse-tile-roof'));
  // Door-sized visual recess on the west face.
  guardhouse.add(box([0.1, 2.4, 1.25], [-4.56, 1.2, 1.7], M.wood, 'guardhouse-door'));
  vehicle(root, -15, 50, Math.PI / 2, 0x0f1316);
  vehicle(root, -9.5, 50, Math.PI / 2, 0x282318);
  addCollider(colliders, [-15, 0.8, 50], [4.8, 1.6, 2.2], 'cartel-suv-one');
  addCollider(colliders, [-9.5, 0.8, 50], [4.8, 1.6, 2.2], 'cartel-suv-two');

  // Courtyard: tile axis, fountain, pool and vegetation instead of Lou's lawns.
  root.add(box([7.2, 0.08, 48], [0, 0.02, 34], M.floorAccent, 'courtyard-processional-tile', { cast: false }));
  root.add(box([42, 0.07, 41], [0, 0.01, 33], M.floor, 'courtyard-paving', { cast: false }));
  const fountain = cylinder(3.1, 0.52, [0, 0.26, 35], M.stoneLight, 'courtyard-fountain', 28);
  root.add(fountain);
  const fountainWater = cylinder(2.7, 0.04, [0, 0.54, 35], M.water, 'courtyard-fountain-water', 28);
  root.add(fountainWater);
  const pool = box([11, 0.12, 7], [-11, 0.02, 19], M.water, 'reflecting-pool', { cast: false });
  root.add(pool);
  root.add(box([12, 0.3, 8], [-11, -0.12, 19], M.stoneLight, 'pool-coping'));
  // Re-add a visible water plane slightly above the coping top.
  pool.position.y = 0.08;
  /* Courtyard planting, and it has to STAY in the courtyard.
   *
   * The estate front wall is at z = 12 and its only opening is the service
   * doorway between x 11.5 and 15.5. The palms at z = 8 and the whole cypress
   * row at z = 10 were therefore planted INSIDE the building: one cypress stood
   * dead centre in the doorway and a second a metre behind it, so stepping
   * through the door put you inside a 4.6 m tree, with palm fronds hanging
   * through the corridor ceiling above. Nothing was solid, so it did not stop
   * you -- it just filled the entry with foliage you had to walk through.
   *
   * They now stand in front of the facade at z = 13.8, and the pair that
   * frames the door sits clear of the 11.5-15.5 lane on either side. */
  for (const [x, z] of [[-18, 54], [-18, 32], [18, 31], [-18, 16], [18, 16]]) palm(root, x, z, 0.9);
  // Keep the east cypress crown clear of the neighboring palm's lowest frond.
  /* z 14.2, not 13.8. The row is 0.72 m in radius and the entry step runs to
   * z 13.325, so at 13.8 the cypress at x 15 had its lower 12 cm growing
   * through the stone. Forty centimetres further out clears it by 15 cm and
   * nobody will ever notice the trees moved. */
  for (const x of [-16, -12, 10, 15]) cypress(root, x, 14.2, 4.6);

  const courtyardDetails = new THREE.Group();
  courtyardDetails.name = 'courtyard-refinement';
  root.add(courtyardDetails);

  // The original basin had water but no fountain silhouette. A two-tier stone
  // centerpiece and six explicit arcs make it legible from the service gate.
  const centerpiece = new THREE.Group();
  centerpiece.name = 'courtyard-fountain-centerpiece';
  centerpiece.position.set(0, 0, 35);
  centerpiece.add(
    cylinder(0.68, 1.0, [0, 1.04, 0], M.stoneLight, 'courtyard-fountain-pedestal', 18),
    cylinder(1.02, 0.16, [0, 1.56, 0], M.stoneLight, 'courtyard-fountain-tier', 24),
    cylinder(0.25, 0.7, [0, 1.96, 0], M.stoneLight, 'courtyard-fountain-column', 16),
    cylinder(0.58, 0.14, [0, 2.34, 0], M.stoneLight, 'courtyard-fountain-tier', 20),
  );
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), M.brass);
  finial.name = 'courtyard-fountain-finial';
  finial.position.y = 2.58;
  centerpiece.add(finial);
  for (let index = 0; index < 6; index++) {
    const angle = (index / 6) * Math.PI * 2;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const curve = new THREE.QuadraticBezierCurve3(
      direction.clone().multiplyScalar(0.28).setY(2.42),
      direction.clone().multiplyScalar(1.08).setY(2.82),
      direction.clone().multiplyScalar(1.75).setY(0.64),
    );
    const jet = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.026, 5, false), M.glass);
    jet.name = 'courtyard-water-jet';
    jet.castShadow = false;
    centerpiece.add(jet);
  }
  courtyardDetails.add(centerpiece);
  addCollider(colliders, [0, 0.35, 35], [6.4, 0.7, 6.4], 'courtyard-fountain-collider');

  // A raised four-piece coping reads as an edge from any approach angle and
  // gives the reflecting pool the same physical truth as its stone surround.
  courtyardDetails.add(
    box([12.0, 0.22, 0.35], [-11, 0.14, 15.15], M.stoneLight, 'reflecting-pool-border'),
    box([12.0, 0.22, 0.35], [-11, 0.14, 22.85], M.stoneLight, 'reflecting-pool-border'),
    box([0.35, 0.22, 7.35], [-16.85, 0.14, 19], M.stoneLight, 'reflecting-pool-border'),
    box([0.35, 0.22, 7.35], [-5.15, 0.14, 19], M.stoneLight, 'reflecting-pool-border'),
  );
  addCollider(colliders, [-11, 0.22, 19], [12.0, 0.44, 8.0], 'reflecting-pool-collider');

  // The blank estate front now has repeated window bays, a plinth/cornice
  // hierarchy and wall lanterns. All pieces project from existing solid walls
  // and therefore introduce no new blockers in the courtyard route.
  courtyardDetails.add(
    box([29.5, 0.28, 0.2], [-3.25, 0.24, 12.34], M.stoneLight, 'estate-facade-plinth'),
    box([2.5, 0.28, 0.2], [16.75, 0.24, 12.34], M.stoneLight, 'estate-facade-plinth'),
    box([29.5, 0.26, 0.28], [-3.25, 4.48, 12.36], M.stoneLight, 'estate-facade-cornice'),
    box([2.5, 0.26, 0.28], [16.75, 4.48, 12.36], M.stoneLight, 'estate-facade-cornice'),
  );
  const bayColumns = [-15.0, -11.1, -7.2, -3.3, 0.6, 4.5, 8.4, 16.8];
  for (const x of bayColumns) {
    const bay = new THREE.Group();
    bay.name = 'estate-facade-bay';
    bay.position.set(x, 0, 12.43);
    bay.add(box([1.48, 1.78, 0.06], [0, 2.35, 0], M.window, 'estate-facade-window', { cast: false }));
    courtyardDetails.add(bay);
  }
  /* was: a sill, a header and two jambs per bay -- 32 draws of one repeated
   * stone trim set. The batch group carries the bay name so the geometry
   * gate's facade-assembly annotation still owns every instance, and trim
   * this thin is below what the moon's map resolves, so it stops casting. */
  const bayTrim = new THREE.Group();
  bayTrim.name = 'estate-facade-bay';
  courtyardDetails.add(bayTrim);
  instanced(
    bayTrim,
    new THREE.BoxGeometry(1.9, 0.18, 0.22),
    M.stoneLight,
    bayColumns.map((x) => (sill) => { sill.position.set(x, 1.42, 12.45); }),
    'estate-facade-window-sill',
  );
  instanced(
    bayTrim,
    new THREE.BoxGeometry(1.9, 0.22, 0.22),
    M.stoneLight,
    bayColumns.map((x) => (header) => { header.position.set(x, 3.3, 12.45); }),
    'estate-facade-window-header',
  );
  instanced(
    bayTrim,
    new THREE.BoxGeometry(0.18, 2.05, 0.2),
    M.stoneLight,
    bayColumns.flatMap((x) => [x - 0.86, x + 0.86]).map((x) => (jamb) => {
      jamb.position.set(x, 2.35, 12.44);
    }),
    'estate-facade-window-jamb',
  );
  for (const x of [-13.1, -5.25, 2.55, 10.35]) {
    const lantern = new THREE.Group();
    lantern.name = 'courtyard-wall-lantern';
    lantern.position.set(x, 2.8, 12.68);
    lantern.add(
      // Reach back to the facade with a two-centimetre keyed contact. The old
      // 22 cm plate stopped 24 cm short of the wall and the Adapter hid all
      // three lantern meshes from support checks.
      box([0.08, 0.42, 0.48], [0, 0, -0.21], M.brass, 'courtyard-lantern-bracket'),
      cylinder(0.16, 0.08, [0, 0.26, 0.06], M.brass, 'courtyard-lantern-cap', 10),
    );
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 7), M.lampWarm);
    bulb.name = 'courtyard-lantern-bulb';
    bulb.position.set(0, 0.05, 0.08);
    lantern.add(bulb);
    courtyardLampBulbs.push(bulb);
    courtyardDetails.add(lantern);
    const light = new THREE.PointLight(0xffb86f, 4.4, 9.5, 2);
    light.name = 'courtyard-wall-lantern-light';
    light.position.set(x, 2.75, 13.1);
    root.add(light);
    courtyardPracticalLights.push(light);
  }

  // Estate exterior and roof. The interior shell is built from segments so
  // the service and dining doors are real openings, not visual decals.
  const estate = new THREE.Group();
  estate.name = 'mark-estate';
  root.add(estate);
  estate.add(box([36, 0.14, 62], [0, 0.01, -19], M.floor, 'estate-tile-floor', { cast: false }));
  // Front, service doorway between x 11.5 and 15.5.
  solid(estate, colliders, [29.5, 4.8, 0.5], [-3.25, 2.4, 12], M.stucco, 'estate-front-west');
  solid(estate, colliders, [2.5, 4.8, 0.5], [16.75, 2.4, 12], M.stucco, 'estate-front-east');
  solid(estate, colliders, [0.5, 4.8, 62], [-18, 2.4, -19], M.stucco, 'estate-west-wall');
  solid(estate, colliders, [0.5, 4.8, 62], [18, 2.4, -19], M.stucco, 'estate-east-wall');
  solid(estate, colliders, [14.8, 4.8, 0.5], [-10.6, 2.4, -50], M.stucco, 'estate-rear-wall-west');
  solid(estate, colliders, [14.8, 4.8, 0.5], [10.6, 2.4, -50], M.stucco, 'estate-rear-wall-east');
  const entrance = entrancePortal(estate, colliders);
  tiledRoof(estate, 0, -19, 38, 64, 5.35);

  // A real interior shell keeps the exterior clay roof and its ridges out of
  // every eye-level room view. The panels meet at authored room boundaries;
  // they are visual soffits, not collision slabs, so the mission route and
  // headroom remain exactly as they were.
  const ceilings = new THREE.Group();
  ceilings.name = 'estate-interior-ceilings';
  estate.add(ceilings);
  for (const [name, size, position] of [
    ['estate-entry-ceiling', [7.0, 0.12, 16.0], [14.2, 4.54, 4.0]],
    ['mark-office-ceiling', [9.25, 0.12, 16.0], [-13.275, 4.54, -6.75]],
    ['guest-suite-ceiling', [18.95, 0.12, 16.0], [0.825, 4.54, -6.75]],
    ['security-room-ceiling', [7.0, 0.12, 14.0], [14.2, 4.54, -11.0]],
    ['service-corridor-ceiling', [7.0, 0.12, 16.0], [14.2, 4.54, -26.0]],
    ['portrait-gallery-ceiling', [28.0, 0.12, 18.8], [-3.7, 4.54, -24.6]],
    ['final-dining-ceiling', [35.5, 0.12, 15.35], [0, 4.54, -42.075]],
  ]) {
    ceilings.add(box(size, position, M.ceiling, name, { cast: false, receive: true }));
  }

  const estateDoor = entrance.door;
  const estateDoorCollider = entrance.collider;

  // Rooms and a continuous service corridor along the east edge.
  solid(estate, colliders, [0.35, 4.2, 20], [10.5, 2.1, 2], M.plaster, 'guest-service-partition');
  solid(estate, colliders, [0.35, 4.2, 7.5], [10.5, 2.1, -18.25], M.plaster, 'security-service-partition');
  solid(estate, colliders, [0.35, 4.2, 8.5], [10.5, 2.1, -30.75], M.plaster, 'gallery-service-partition');
  // West office / guest split with wide door gaps.
  solid(estate, colliders, [8.2, 4.2, 0.35], [-13.9, 2.1, 1.5], M.plaster, 'office-north-partition');
  solid(estate, colliders, [18.4, 4.2, 0.35], [1.3, 2.1, 1.5], M.plaster, 'guest-north-partition');
  solid(estate, colliders, [7.8, 4.2, 0.35], [-14.1, 2.1, -15], M.plaster, 'office-south-partition');
  solid(estate, colliders, [18.2, 4.2, 0.35], [1.4, 2.1, -15], M.plaster, 'guest-south-partition');
  // Gallery to dining partition, with a locked double door in the middle.
  solid(estate, colliders, [14.7, 4.3, 0.42], [-10.65, 2.15, -34.2], M.plaster, 'dining-partition-west');
  solid(estate, colliders, [14.7, 4.3, 0.42], [10.65, 2.15, -34.2], M.plaster, 'dining-partition-east');
  const diningDoors = new THREE.Group();
  diningDoors.name = 'dining-room-double-doors';
  diningDoors.position.set(0, 0, -34.15);
  const diningDoorLeft = box([3.1, 3.45, 0.2], [-1.58, 1.73, 0], M.wood, 'dining-door-left');
  const diningDoorRight = box([3.1, 3.45, 0.2], [1.58, 1.73, 0], M.wood, 'dining-door-right');
  diningDoors.add(diningDoorLeft, diningDoorRight);
  estate.add(diningDoors);
  const diningDoorCollider = addCollider(colliders, [0, 1.73, -34.15], [6.3, 3.45, 0.35], 'dining-room-doors');

  // Mark's authorship is everywhere before his body is: portraits, brass M,
  // family cars, account desk, and the crest over the final doors.
  framedPortrait(estate, -17.66, 2.15, -5.8, { scale: 0.82, facing: 'x' });
  framedPortrait(estate, -17.66, 2.15, -24, { scale: 0.82, facing: 'x' });
  /* On the west dining partition, not centred over the doors: the door gap is
   * a full-height opening (partitions only cover |x| >= 3.3), so a portrait at
   * x 0 hangs on nothing and the player walks through it once the doors open. */
  framedPortrait(estate, -5.2, 2.25, -33.9, { scale: 0.68 });

  /* ---------------------------------------------------------------- *
   * The entry hall.
   *
   * Owner, 2026-08-20 playtest: *"the foyer reads as one giant empty box"*,
   * *"the first five seconds inside should say people lived and worked here
   * before the player kicked the door in"*. It was 7 x 20 metres of tile
   * with a light in it. What it holds now is a WATCH: a desk facing the
   * door with a computer and somebody's cold coffee on it, a cleaner's cart
   * abandoned mid-shift, a bin, a bench, plants, and enough hung art that
   * the walls are somebody's taste rather than empty stucco.
   *
   * Every collider added here sits east of x 12.6 or west of x 12.0, so the
   * lane from the door to the corridor is untouched.
   * ---------------------------------------------------------------- */
  const entryDetails = new THREE.Group();
  entryDetails.name = 'estate-entry-refinement';
  estate.add(entryDetails);
  entryDetails.add(
    box([5.9, 0.035, 8.4], [14.2, 0.085, 6.2], M.textile, 'entry-detail.runner', { cast: false }),
    box([0.06, 0.045, 8.4], [11.28, 0.1, 6.2], M.brass, 'entry-detail.runner-border', { cast: false }),
    box([0.06, 0.045, 8.4], [17.12, 0.1, 6.2], M.brass, 'entry-detail.runner-border', { cast: false }),
    // Skirting and a dado rail down both long walls, so the box has a datum.
    box([0.07, 1.15, 19.4], [17.7, 0.6, 2.0], M.woodLight, 'entry-detail.wainscot'),
    box([0.09, 0.1, 19.4], [17.68, 1.24, 2.0], M.brass, 'entry-detail.dado-rail', { cast: false }),
    box([0.07, 1.15, 19.4], [10.72, 0.6, 2.0], M.woodLight, 'entry-detail.wainscot'),
    box([0.09, 0.1, 19.4], [10.74, 1.24, 2.0], M.brass, 'entry-detail.dado-rail', { cast: false }),
  );
  // was: nothing at all above the dado. Four canvases, four different fields.
  /* Hung on the FACES: the west partition's inner face is x 10.675 and the
   * east wall's is 17.75, and `wallArt` builds forward of the point it is
   * given, so these numbers are the plaster itself. */
  for (const [index, [z, height]] of [[9.0, 1.2], [4.4, 1.5], [-0.4, 1.1], [-5.0, 1.35]].entries()) {
    wallArt(entryDetails, {
      x: 10.68, y: 2.24, z, yaw: Math.PI / 2, width: height * 0.8, height, tone: index,
    });
  }
  for (const [index, [z, height]] of [[10.0, 1.05], [-2.4, 1.4], [-6.6, 1.15]].entries()) {
    wallArt(entryDetails, {
      x: 17.74, y: 2.2, z, yaw: -Math.PI / 2, width: height * 0.85, height, tone: index + 2,
    });
  }

  /* The watch desk. Its collider is 2.8 x 1.2 at x 15.6 -- the walking lane
   * west of x 14.2 never touches it. */
  const watchDesk = table(entryDetails, colliders, 15.6, 6.6, 2.6, 1.0, 'entry-watch-desk');
  watchDesk.add(
    box([2.62, 0.34, 0.06], [0, 0.65, 0.47], M.wood, 'entry-watch-desk.modesty', { cast: false }),
    box([2.7, 0.09, 0.16], [0, 0.93, -0.42], M.woodLight, 'entry-watch-desk.counter-lip', { cast: false }),
  );
  deskComputer(entryDetails, { x: 15.6, y: 0.88, z: 6.75, yaw: 0, name: 'entry-watch-computer' });
  deskClutter(entryDetails, { x: 14.75, y: 0.88, z: 6.6, seed: 1, name: 'entry-watch-clutter' });
  entryDetails.add(
    box([0.09, 0.05, 0.17], [16.62, 0.905, 6.4], M.iron, 'entry-watch-desk.handset', { cast: false }),
    box([0.13, 0.04, 0.2], [16.6, 0.9, 6.62], M.ink, 'entry-watch-desk.telephone', { cast: false }),
    // His sidearm, off his hip and on the blotter, which is why he is unarmed
    // in the chair -- see cast.js `seatedPose`.
    box([0.05, 0.03, 0.19], [14.85, 0.905, 7.0], M.iron, 'entry-watch-desk.sidearm', { cast: false }),
  );
  const watchChair = new THREE.Group();
  watchChair.name = 'entry-detail.watch-chair';
  watchChair.position.set(15.6, 0, 5.62);
  watchChair.add(
    box([0.62, 0.09, 0.62], [0, 0.46, 0], M.wood, 'entry-watch-chair-seat'),
    box([0.56, 0.12, 0.56], [0, 0.565, 0], M.textile, 'entry-watch-chair-cushion', { cast: false }),
    box([0.6, 0.76, 0.09], [0, 0.86, -0.27], M.wood, 'entry-watch-chair-back'),
    cylinder(0.05, 0.4, [0, 0.24, 0], M.iron, 'entry-watch-chair-post', 8),
    cylinder(0.26, 0.05, [0, 0.03, 0], M.iron, 'entry-watch-chair-base', 12),
  );
  entryDetails.add(watchChair);

  /* Somebody was cleaning this floor an hour ago. */
  cleaningCart(entryDetails, colliders, 11.6, 1.9, 0.28);
  entryDetails.add(
    box([0.9, 0.02, 1.5], [12.5, 0.075, 1.4], M.water, 'entry-detail.wet-floor-sheen', { cast: false }),
  );
  const wetSign = new THREE.Group();
  wetSign.name = 'entry-detail.wet-floor-sign';
  wetSign.position.set(12.7, 0, 3.3);
  wetSign.rotation.y = -0.5;
  for (const side of [-1, 1]) {
    /* y 0.31, not 0.34. The boards lean 0.16 rad, and leaning a 0.62 m board
     * lifts its own bounding box: at 0.34 the sign's feet finished 5.7 cm off
     * the floor, which is a wet-floor sign hovering over the puddle it is
     * there to warn about. */
    const board = box([0.34, 0.62, 0.02], [0, 0.31, side * 0.09], M.floorAccent, 'wet-floor-board');
    board.rotation.x = side * 0.16;
    wetSign.add(board);
  }
  entryDetails.add(wetSign);

  const trashCan = new THREE.Group();
  trashCan.name = 'entry-detail.trash-can';
  trashCan.position.set(17.16, 0, 3.5);
  trashCan.add(
    cylinder(0.23, 0.66, [0, 0.33, 0], M.steel, 'entry-trash-body', 14),
    cylinder(0.25, 0.05, [0, 0.68, 0], M.iron, 'entry-trash-rim', 14),
  );
  for (let index = 0; index < 3; index++) {
    trashCan.add(box(
      [0.15, 0.005, 0.19],
      [0.06 - index * 0.05, 0.71 + index * 0.01, -0.02 + index * 0.04],
      M.paper,
      'entry-trash-overflow',
      { cast: false },
    ));
  }
  entryDetails.add(trashCan);

  const consoleTableEntry = new THREE.Group();
  consoleTableEntry.name = 'entry-detail.console-table';
  consoleTableEntry.position.set(17.2, 0, -1.6);
  consoleTableEntry.add(
    box([0.6, 0.08, 1.9], [0, 0.86, 0], M.woodLight, 'entry-console-top'),
    box([0.5, 0.42, 1.7], [0, 0.6, 0], M.wood, 'entry-console-body'),
    box([0.09, 0.58, 0.09], [0, 0.29, -0.86], M.wood, 'entry-console-leg', { cast: false }),
    box([0.09, 0.58, 0.09], [0, 0.29, 0.86], M.wood, 'entry-console-leg', { cast: false }),
    cylinder(0.14, 0.36, [0, 1.08, -0.5], M.bottleGreen, 'entry-console-vase', 12),
  );
  for (let index = 0; index < 5; index++) {
    consoleTableEntry.add(box(
      [0.34, 0.004, 0.25],
      [0.02, 0.906 + index * 0.005, 0.42],
      M.paper,
      'entry-console-paperwork',
      { cast: false },
    ));
  }
  entryDetails.add(consoleTableEntry);
  addCollider(colliders, [17.2, 0.55, -1.6], [0.7, 1.1, 2.0], 'entry-console-table');

  const entryBench = new THREE.Group();
  entryBench.name = 'entry-detail.bench';
  entryBench.position.set(11.15, 0, -4.4);
  entryBench.add(
    box([0.62, 0.1, 2.1], [0, 0.46, 0], M.woodLight, 'entry-bench-seat'),
    box([0.52, 0.12, 1.9], [0, 0.57, 0], M.velvet, 'entry-bench-cushion', { cast: false }),
    box([0.1, 0.42, 0.1], [0, 0.21, -0.88], M.wood, 'entry-bench-leg', { cast: false }),
    box([0.1, 0.42, 0.1], [0, 0.21, 0.88], M.wood, 'entry-bench-leg', { cast: false }),
    // A jacket somebody put down and never came back for.
    box([0.44, 0.11, 0.62], [0.02, 0.57, 0.5], M.ink, 'entry-bench-jacket'),
  );
  entryDetails.add(entryBench);
  addCollider(colliders, [11.15, 0.5, -4.4], [0.72, 1.0, 2.2], 'entry-bench');

  pottedPlant(entryDetails, 11.35, 9.8, { scale: 1.15 });
  pottedPlant(entryDetails, 16.9, 9.8, { scale: 1.15 });
  pottedPlant(entryDetails, 17.1, -6.9, { scale: 0.95 });

  /* Entry lighting, rebuilt.
   *
   * Owner: *"rework entrance lighting: fixture position, brightness,
   * shadows, geometry intersections"*. The hall's two practicals were point
   * lights at y 2.7 with their brass fixtures at 4.18 -- a metre and a half
   * of nothing between the lamp and the glow, and both of them centred in
   * the walking lane. These are pendants that CARRY their light, hung off
   * the 4.48 m ceiling between the room's beams, plus a pair of sconces
   * flanking the door on the inside so the threshold is lit from the wall it
   * is cut into rather than from overhead. */
  const entryLights = [];
  for (const z of [9.0, 3.4, -2.2]) {
    const { light } = pendantLantern(entryDetails, 14.2, z, {
      y: 4.46, drop: 1.0, colour: 0xffb86f, intensity: 11, distance: 13, name: 'entry-pendant',
    });
    entryLights.push(light);
  }
  for (const [sx, yaw] of [[11.86, Math.PI / 2], [15.14, -Math.PI / 2]]) {
    const { light } = wallSconce(entryDetails, {
      x: sx, y: 2.35, z: 11.0, yaw, colour: 0xffc27a, intensity: 5.5, distance: 7.5,
    });
    entryLights.push(light);
  }
  const entryCoffers = new THREE.Group();
  entryCoffers.name = 'entry-detail.ceiling-beams';
  instanced(
    entryCoffers,
    new THREE.BoxGeometry(6.9, 0.14, 0.16),
    M.wood,
    [10.8, 7.4, 4.0, 0.6, -2.8, -6.2].map((z) => (beam) => { beam.position.set(14.2, 4.4, z); }),
    'entry-ceiling-beam',
  );
  entryDetails.add(entryCoffers);

  const securityStill = evidenceSecurityStill(estate, colliders);
  const paymentLedger = evidenceLedger(estate, colliders);
  roomLights.push(securityStill.light, paymentLedger.light);
  const evidence = {
    [EVIDENCE_IDS.BELONGINGS]: evidenceBelongings(estate, colliders),
    [EVIDENCE_IDS.PAYMENT_LEDGER]: paymentLedger.target,
    [EVIDENCE_IDS.SECURITY_STILL]: securityStill.target,
  };

  // Office shelves, guest bed and security racks make the clue rooms read as
  // rooms rather than three interaction boxes in a corridor.
  for (let z = -11.5; z <= -2; z += 2.2) {
    solid(estate, colliders, [0.75, 2.2, 1.5], [-16.6, 1.1, z], M.wood, 'mark-office-files');
  }

  const officeDetails = new THREE.Group();
  officeDetails.name = 'mark-office-refinement';
  estate.add(officeDetails);
  officeDetails.add(
    box([7.2, 0.035, 11.0], [-13.2, 0.07, -6.6], M.green, 'office-detail.rug', { cast: false }),
    box([0.08, 1.45, 12.5], [-17.69, 1.18, -6.5], M.woodLight, 'office-detail.wainscot'),
    box([0.08, 0.12, 12.5], [-17.63, 1.92, -6.5], M.brass, 'office-detail.dado-rail'),
  );
  const officeDrawers = new THREE.Group();
  officeDrawers.name = 'office-detail.file-drawers';
  /* was: a face and a pull Mesh per drawer -- 30 draws of one repeated
   * drawer front. Interior joinery under the roof: the batches stop casting. */
  const drawerSlots = [];
  for (let z = -11.5; z <= -2; z += 2.2) {
    for (const y of [0.46, 1.08, 1.7]) drawerSlots.push([y, z]);
  }
  instanced(
    officeDrawers,
    new THREE.BoxGeometry(0.035, 0.48, 1.18),
    M.woodLight,
    drawerSlots.map(([y, z]) => (face) => { face.position.set(-16.21, y, z); }),
    'office-file-drawer-face',
  );
  instanced(
    officeDrawers,
    new THREE.BoxGeometry(0.025, 0.08, 0.32),
    M.brass,
    drawerSlots.map(([y, z]) => (pull) => { pull.position.set(-16.18, y, z); }),
    'office-file-drawer-pull',
  );
  officeDetails.add(officeDrawers);

  const officeChair = new THREE.Group();
  officeChair.name = 'office-detail.desk-chair';
  officeChair.position.set(-10.6, 0, -8.25);
  officeChair.add(
    box([0.72, 0.12, 0.72], [0, 0.52, 0], M.wood, 'office-chair-seat'),
    box([0.72, 0.88, 0.12], [0, 1.0, -0.32], M.wood, 'office-chair-back'),
    /* was 0.18 tall at y 0.61: six centimetres of upholstery hanging out
     * below a seat whose top is at 0.58. It sits ON the seat now. */
    box([0.62, 0.12, 0.62], [0, 0.64, 0], M.textile, 'office-chair-cushion'),
  );
  for (const [x, z] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) {
    officeChair.add(box([0.08, 0.38, 0.08], [x, 0.275, z], M.wood, 'office-chair-leg'));
  }
  officeDetails.add(officeChair);

  /* The old `office-detail.desk-lamp` stood on the same desk the clue lamp
   * now bends over (see evidenceLedger) and the two shades intersected.
   * Mark's office keeps its secondary light as a floor lamp by the files,
   * which is where a man actually reads them. */
  const officeFloorLamp = new THREE.Group();
  officeFloorLamp.name = 'office-detail.reading-floor-lamp';
  /* x -15.8. The shade is 0.3 m in radius, the files stand at -16.6 and are
   * 0.75 m wide, so at -16.0 the shade had 6.7 cm of itself inside the
   * paperwork. Twenty centimetres east clears it and still reads as a lamp
   * beside the files rather than one stranded in the middle of the room. */
  officeFloorLamp.position.set(-15.8, 0, -3.2);
  officeFloorLamp.add(
    cylinder(0.24, 0.05, [0, 0.025, 0], M.iron, 'office-floor-lamp-base', 14),
    cylinder(0.026, 1.5, [0, 0.78, 0], M.brass, 'office-floor-lamp-stem', 8),
  );
  const officeShade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.38, 14, 1, true), M.lampWarm);
  officeShade.name = 'office-floor-lamp-shade';
  officeShade.position.set(0, 1.62, 0);
  officeShade.rotation.x = Math.PI;
  officeFloorLamp.add(officeShade);
  const officeLampLight = new THREE.PointLight(0xffcf9c, 6, 7.5, 2);
  officeLampLight.name = 'office-floor-lamp-light';
  officeLampLight.position.set(0, 1.5, 0);
  officeFloorLamp.add(officeLampLight);
  roomLights.push(officeLampLight);
  officeDetails.add(officeFloorLamp);

  /* A drinks cabinet: the one piece of furniture that says whose office this
   * is rather than what it is for. */
  const officeCabinet = new THREE.Group();
  officeCabinet.name = 'office-detail.drinks-cabinet';
  officeCabinet.position.set(-13.4, 0, -13.9);
  officeCabinet.add(
    box([2.0, 0.09, 0.56], [0, 1.06, 0], M.woodLight, 'office-cabinet-top'),
    box([1.86, 1.0, 0.5], [0, 0.56, 0], M.wood, 'office-cabinet-body'),
    box([0.86, 0.44, 0.03], [-0.46, 0.72, -0.26], M.woodLight, 'office-cabinet-door', { cast: false }),
    box([0.86, 0.44, 0.03], [0.46, 0.72, -0.26], M.woodLight, 'office-cabinet-door', { cast: false }),
    box([0.03, 0.12, 0.03], [-0.06, 0.72, -0.29], M.brass, 'office-cabinet-pull', { cast: false }),
    box([0.03, 0.12, 0.03], [0.06, 0.72, -0.29], M.brass, 'office-cabinet-pull', { cast: false }),
  );
  for (const [bx, bz, tone, height] of [
    [-0.62, -0.02, M.bottleAmber, 0.32], [-0.4, 0.08, M.bottleGreen, 0.28],
    [-0.2, -0.06, M.bottleAmber, 0.34], [0.62, 0.04, M.bottleGreen, 0.3],
  ]) {
    officeCabinet.add(
      cylinder(0.05, height, [bx, 1.105 + height / 2, bz], tone, 'office-cabinet-bottle', 10),
      cylinder(0.018, 0.09, [bx, 1.105 + height + 0.045, bz], M.brass, 'office-cabinet-bottle-neck', 8),
    );
  }
  for (const gx of [0.16, 0.3, 0.44]) {
    officeCabinet.add(cylinder(0.038, 0.11, [gx, 1.16, -0.1], M.glass, 'office-cabinet-tumbler', 10));
  }
  // A cigar box, open, with three left in it.
  officeCabinet.add(
    box([0.26, 0.09, 0.19], [0.2, 1.155, 0.16], M.tile, 'office-cigar-box'),
    box([0.26, 0.02, 0.19], [0.2, 1.29, 0.24], M.tile, 'office-cigar-lid', { cast: false }),
  );
  for (let index = 0; index < 3; index++) {
    officeCabinet.add(cylinder(
      0.011, 0.15, [0.14 + index * 0.06, 1.21, 0.16], M.woodLight, 'office-cigar', 8,
    ));
  }
  officeDetails.add(officeCabinet);
  addCollider(colliders, [-13.4, 0.6, -13.9], [2.1, 1.2, 0.66], 'office-drinks-cabinet');

  for (const [index, z] of [-3.4, -10.4].entries()) {
    wallArt(officeDetails, {
      x: -17.75, y: 2.6, z, yaw: Math.PI / 2, width: 0.95, height: 1.2, tone: index + 3,
    });
  }
  {
    const { light } = pendantLantern(officeDetails, -13.2, -6.6, {
      y: 4.46, drop: 1.05, colour: 0xffb66d, intensity: 11, distance: 14, name: 'office-pendant',
    });
    roomLights.push(light);
  }

  const officeCoffers = new THREE.Group();
  officeCoffers.name = 'office-detail.ceiling-beams';
  // was: five identical beams (already non-casting) -- now one draw.
  instanced(
    officeCoffers,
    new THREE.BoxGeometry(8.0, 0.14, 0.16),
    M.wood,
    [-12.5, -9.5, -6.5, -3.5, -0.5].map((z) => (beam) => { beam.position.set(-13.7, 4.4, z); }),
    'office-ceiling-beam',
  );
  officeDetails.add(officeCoffers);

  /* ---------------------------------------------------------------- *
   * The guest suite -- Sauce's room.
   *
   * Owner, 2026-08-20 playtest: *"push bed and furniture fully back against
   * the wall"*, *"add a wall-mounted TV across from the bed"*, *"flesh out
   * with nightstands, lamps, dresser, rug, clothes/shoes, personal/cartel
   * decor"*, and *"evidence #2 becomes the CHEF UNIFORM"*.
   *
   * The bed used to sit 2.5 m off the south wall with its headboard hanging
   * in open floor. It is now against the plaster (inner face z -14.825), and
   * the room reads in two halves: a sleeping end south of a media wall at
   * z -8.7, and a dressing end north of it where the chef's whites hang --
   * which is also where the clue has to live, because the evidence route
   * approaches the suite from the corridor at z -8..1.5.
   * ---------------------------------------------------------------- */
  solid(estate, colliders, [4.2, 0.68, 2.3], [4.7, 0.34, -13.49], M.wood, 'guest-suite-bed');
  estate.add(box([3.9, 0.16, 2.12], [4.7, 0.76, -13.49], M.white, 'guest-suite-linen'));

  const guestDetails = new THREE.Group();
  guestDetails.name = 'guest-suite-refinement';
  estate.add(guestDetails);
  guestDetails.add(
    box([9.2, 0.035, 5.6], [4.7, 0.07, -12.0], M.textile, 'guest-suite-detail.rug', { cast: false }),
    box([0.06, 0.045, 5.6], [0.07, 0.09, -12.0], M.brass, 'guest-suite-detail.rug-border', { cast: false }),
    box([0.06, 0.045, 5.6], [9.33, 0.09, -12.0], M.brass, 'guest-suite-detail.rug-border', { cast: false }),
    box([4.55, 1.55, 0.18], [4.7, 1.25, -14.73], M.wood, 'guest-suite-detail.headboard'),
    box([4.45, 0.28, 0.16], [4.7, 0.53, -12.28], M.woodLight, 'guest-suite-detail.footboard'),
    box([3.6, 0.11, 0.65], [4.7, 0.88, -12.72], M.floorAccent, 'guest-suite-detail.blanket-fold'),
    // Slept in and not made: the near half of the cover thrown back.
    box([1.7, 0.09, 1.5], [3.6, 0.9, -13.9], M.white, 'guest-suite-detail.thrown-cover'),
  );
  const guestPillows = new THREE.Group();
  guestPillows.name = 'guest-suite-detail.pillows';
  guestPillows.add(
    box([1.5, 0.18, 0.62], [3.75, 0.93, -14.28], M.white, 'guest-suite-pillow'),
    box([1.5, 0.18, 0.62], [5.65, 0.93, -14.28], M.white, 'guest-suite-pillow'),
    box([0.9, 0.14, 0.4], [4.7, 1.06, -14.5], M.floorAccent, 'guest-suite-cushion'),
  );
  guestDetails.add(guestPillows);
  const nightstands = new THREE.Group();
  nightstands.name = 'guest-suite-detail.nightstands';
  const bedsideLamps = new THREE.Group();
  bedsideLamps.name = 'guest-suite-detail.bedside-lamps';
  for (const [index, x] of [1.9, 7.5].entries()) {
    nightstands.add(
      box([0.9, 0.12, 0.78], [x, 0.64, -14.4], M.woodLight, 'guest-suite-nightstand-top'),
      box([0.68, 0.58, 0.58], [x, 0.31, -14.4], M.wood, 'guest-suite-nightstand-base'),
      box([0.5, 0.04, 0.5], [x, 0.46, -14.36], M.brass, 'guest-suite-nightstand-drawer', { cast: false }),
    );
    bedsideLamps.add(
      cylinder(0.13, 0.05, [x, 0.74, -14.4], M.brass, 'guest-suite-lamp-base', 10),
      cylinder(0.025, 0.4, [x, 0.94, -14.4], M.brass, 'guest-suite-lamp-stem', 8),
    );
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.26, 12, 1, true), M.lampWarm);
    shade.name = 'guest-suite-lamp-shade';
    shade.position.set(x, 1.2, -14.4);
    bedsideLamps.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 7), M.lampWarm);
    bulb.name = 'guest-suite-lamp-bulb';
    bulb.position.set(x, 1.16, -14.4);
    bedsideLamps.add(bulb);
    const bedsideLight = new THREE.PointLight(0xffd0a0, 4.2, 5.5, 2);
    bedsideLight.name = 'guest-suite-bedside-light';
    bedsideLight.position.set(x, 1.16, -14.4);
    bedsideLamps.add(bedsideLight);
    roomLights.push(bedsideLight);
    // What a man leaves on a nightstand: a glass, a watch, a paperback.
    if (index === 0) {
      nightstands.add(
        cylinder(0.045, 0.11, [x - 0.2, 0.755, -14.2], M.glass, 'guest-suite-nightstand-glass', 10),
        box([0.15, 0.035, 0.21], [x + 0.24, 0.717, -14.22], M.tile, 'guest-suite-nightstand-paperback', { cast: false }),
      );
    } else {
      nightstands.add(
        box([0.1, 0.02, 0.1], [x - 0.22, 0.71, -14.2], M.brass, 'guest-suite-nightstand-watch', { cast: false }),
        cylinder(0.075, 0.03, [x + 0.22, 0.715, -14.18], M.glass, 'guest-suite-nightstand-ashtray', 10),
      );
    }
  }
  guestDetails.add(nightstands, bedsideLamps);
  const guestWall = new THREE.Group();
  guestWall.name = 'guest-suite-detail.wall-panels';
  for (const x of [2.6, 4.7, 6.8]) {
    guestWall.add(box([1.65, 1.35, 0.08], [x, 2.78, -14.785], M.woodLight, 'guest-suite-wall-panel'));
  }
  guestDetails.add(guestWall);
  for (const [index, x] of [-0.6, 10.0].entries()) {
    wallArt(guestDetails, {
      x, y: 2.3, z: -14.825, yaw: 0, width: 0.82, height: 1.05, tone: index + 1,
    });
  }

  /* THE MEDIA WALL. The suite had no surface to hang a television on, and a
   * TV 16 m up the room on the far partition is not "across from the bed";
   * this stub carries the set, the dresser under it, and the line between
   * the sleeping and dressing ends. It leaves the corridor doorway at
   * x 10.5, z -14.5..-8 completely clear and can be walked around either
   * side (x < 2.2 or x > 7.2). */
  solid(guestDetails, colliders, [5.0, 2.9, 0.3], [4.7, 1.45, -8.7], M.plaster, 'guest-suite-detail.media-wall');
  guestDetails.add(
    box([5.3, 0.14, 0.44], [4.7, 2.97, -8.7], M.woodLight, 'guest-suite-detail.media-wall-cornice', { cast: false }),
    box([5.0, 0.1, 0.36], [4.7, 0.9, -8.7], M.woodLight, 'guest-suite-detail.media-wall-shelf', { cast: false }),
  );
  const television = new THREE.Group();
  television.name = 'guest-suite-detail.television';
  television.position.set(4.7, 1.98, -8.87);
  const tvGlass = new THREE.MeshStandardMaterial({
    color: 0x0b1013, emissive: 0x16262b, emissiveIntensity: 0.55, roughness: 0.26,
  });
  television.add(
    box([2.2, 1.28, 0.09], [0, 0, 0], M.iron, 'television-shell'),
    box([2.06, 1.15, 0.03], [0, 0, -0.06], tvGlass, 'television-screen', { cast: false }),
    box([0.5, 0.06, 0.06], [0, -0.66, 0.02], M.iron, 'television-bracket', { cast: false }),
    box([0.03, 0.5, 0.03], [0.2, -0.92, 0.05], M.blackout, 'television-cable', { cast: false }),
  );
  guestDetails.add(television);
  const dresser = new THREE.Group();
  dresser.name = 'guest-suite-detail.dresser';
  dresser.position.set(4.7, 0, -9.16);
  dresser.add(
    box([2.6, 0.08, 0.62], [0, 0.92, 0], M.woodLight, 'dresser-top'),
    box([2.44, 0.86, 0.56], [0, 0.47, 0], M.wood, 'dresser-body'),
    box([0.12, 0.16, 0.12], [-1.1, 0.08, 0.2], M.wood, 'dresser-foot', { cast: false }),
    box([0.12, 0.16, 0.12], [1.1, 0.08, 0.2], M.wood, 'dresser-foot', { cast: false }),
  );
  for (const dy of [0.28, 0.62]) {
    for (const dx of [-0.6, 0.6]) {
      dresser.add(
        box([1.1, 0.28, 0.03], [dx, dy, -0.29], M.woodLight, 'dresser-drawer-face', { cast: false }),
        box([0.26, 0.035, 0.03], [dx, dy, -0.32], M.brass, 'dresser-drawer-pull', { cast: false }),
      );
    }
  }
  // Half open, with a sleeve hanging out of it. Somebody packed in a hurry
  // exactly once in this house, and it was not this room.
  dresser.add(
    box([1.1, 0.28, 0.16], [0.6, 0.62, -0.4], M.woodLight, 'dresser-open-drawer'),
    box([0.16, 0.06, 0.24], [0.72, 0.55, -0.52], M.chefWhite, 'dresser-spilled-sleeve', { cast: false }),
    cylinder(0.09, 0.24, [-0.9, 1.08, -0.06], M.bottleAmber, 'dresser-decanter', 10),
    cylinder(0.04, 0.09, [-0.66, 1.005, -0.1], M.glass, 'dresser-tumbler', 10),
  );
  guestDetails.add(dresser);
  addCollider(colliders, [4.7, 0.5, -9.16], [2.7, 1.0, 0.7], 'guest-suite-dresser');

  // Shoes, kicked off, and a laundry basket. Nobody tidies a prisoner's room.
  const strays = new THREE.Group();
  strays.name = 'guest-suite-detail.strays';
  strays.add(
    box([0.11, 0.09, 0.29], [7.9, 0.045, -12.2], M.ink, 'guest-suite-shoe'),
    box([0.11, 0.09, 0.29], [8.14, 0.045, -12.44], M.ink, 'guest-suite-shoe'),
    box([0.34, 0.05, 0.5], [1.2, 0.025, -12.6], M.tile, 'guest-suite-dropped-towel', { cast: false }),
  );
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.5, 12, 1, true), M.woodLight);
  basket.name = 'guest-suite-laundry-basket';
  basket.position.set(8.6, 0.25, -10.3);
  basket.castShadow = true;
  strays.add(basket);
  strays.add(box([0.4, 0.16, 0.4], [8.6, 0.5, -10.3], M.chefWhite, 'guest-suite-laundry-pile'));
  guestDetails.add(strays);

  const guestCoffers = new THREE.Group();
  guestCoffers.name = 'guest-suite-detail.ceiling-beams';
  // was: six identical beams (already non-casting) -- now one draw.
  instanced(
    guestCoffers,
    new THREE.BoxGeometry(0.16, 0.14, 15.2),
    M.woodLight,
    [-6.5, -3.3, -0.1, 3.1, 6.3, 9.5].map((x) => (beam) => { beam.position.set(x, 4.4, -6.75); }),
    'guest-suite-ceiling-beam',
  );
  guestDetails.add(guestCoffers);
  /* The suite's overhead, hung between the beam runs at x -0.1 and 3.1 (and
   * 3.1/6.3), rather than a point light floating under a brass cap. */
  for (const [px, pz] of [[1.5, -12.4], [7.9, -4.6]]) {
    const { light } = pendantLantern(guestDetails, px, pz, {
      y: 4.46, drop: 1.1, colour: 0xffb66d, intensity: 10, distance: 13, name: 'guest-suite-pendant',
    });
    roomLights.push(light);
  }

  /* Flush to the east wall (17.75) rather than 32 cm shy of it. The column
   * used to stand at 16.9, far enough into the room to swallow the east end of
   * the operator's desk. Against the wall is also where server racks go.
   *
   * ONE NUMBER FOR THE WHOLE COLUMN. Moving it the first time left three
   * things behind that had the old 16.9 written out separately -- the
   * instanced rack FACES, the indicator LEDs on them, and the shift-notes
   * board -- so the racks slid east and their own front panels stayed where
   * they were, hanging thirty centimetres in front of nothing and clipping the
   * desk. Everything that belongs to this column is now derived from here. */
  for (let z = SECURITY_RACK_Z0; z <= SECURITY_RACK_Z1; z += SECURITY_RACK_PITCH) {
    solid(estate, colliders, [1.05, 2.4, 0.7], [SECURITY_RACK_X, 1.2, z], M.iron, 'security-rack');
  }

  const securityDetails = new THREE.Group();
  securityDetails.name = 'security-room-refinement';
  estate.add(securityDetails);
  securityDetails.add(
    box([6.5, 0.035, 10.5], [14.2, 0.07, -11.0], M.ink, 'security-detail.floor-field', { cast: false }),
    box([6.2, 0.025, 0.32], [14.2, 0.095, -6.8], M.floorAccent, 'security-detail.threshold-stripe', { cast: false }),
    /* The backdrop used to hang in mid-air at z -10.38 with the five monitors
     * at -10.48 -- BEHIND it, so the wall of screens the room exists for was
     * occluded by its own panel. The panel now stands on two posts and the
     * bank is mounted on its FRONT face, looking back at the operator. */
    box([3.5, 1.65, 0.12], [14.9, 2.15, -10.58], M.iron, 'security-detail.console-backdrop'),
    box([0.14, 1.32, 0.14], [13.3, 0.66, -10.58], M.iron, 'security-detail.backdrop-post'),
    box([0.14, 1.32, 0.14], [16.5, 0.66, -10.58], M.iron, 'security-detail.backdrop-post'),
    box([3.7, 0.1, 0.4], [14.9, 3.02, -10.58], M.iron, 'security-detail.backdrop-cornice', { cast: false }),
  );
  const monitorBank = new THREE.Group();
  monitorBank.name = 'security-detail.monitor-bank';
  // was: five monitor Meshes (already non-casting) -- now one draw.
  instanced(
    monitorBank,
    new THREE.BoxGeometry(0.82, 0.5, 0.06),
    M.screen,
    [[13.9, 2.35], [14.9, 2.35], [15.9, 2.35], [14.4, 1.75], [15.4, 1.75]]
      .map(([x, y]) => (monitor) => { monitor.position.set(x, y, -10.46); }),
    'security-monitor',
  );
  securityDetails.add(monitorBank);
  /* Somebody works a night shift in here: a chair pushed back, a keyboard,
   * cold coffee, an ashtray and half a plate of food nobody came back for. */
  deskComputer(securityDetails, {
    x: 16.2, y: 0.88, z: -9.55, yaw: Math.PI, name: 'security-detail.operator-station',
  });
  deskClutter(securityDetails, {
    x: 15.35, y: 0.88, z: -9.5, seed: 2, name: 'security-detail.operator-clutter',
  });
  const supper = new THREE.Group();
  supper.name = 'security-detail.abandoned-supper';
  supper.position.set(14.45, 0.88, -9.3);
  supper.add(
    cylinder(0.15, 0.02, [0, 0.01, 0], M.white, 'supper-plate', 16),
    box([0.13, 0.045, 0.09], [-0.03, 0.04, 0.02], M.woodLight, 'supper-half-eaten-roll'),
    box([0.09, 0.02, 0.07], [0.06, 0.03, -0.03], M.tile, 'supper-scraps', { cast: false }),
    box([0.012, 0.008, 0.17], [0.11, 0.026, 0.04], M.steel, 'supper-fork', { cast: false }),
    cylinder(0.035, 0.13, [0.26, 0.065, 0.06], M.bottleGreen, 'supper-bottle', 10),
  );
  securityDetails.add(supper);
  const notes = new THREE.Group();
  notes.name = 'security-detail.shift-notes';
  /* On the front plane of the racks and in the GAP between two of them. It
   * used to sit at the column's old centreline, which put the board inside a
   * rack rather than on it. */
  notes.position.set(SECURITY_RACK_FACE_X - 0.06, 0, -8.75);
  notes.add(box([0.05, 0.9, 0.68], [0, 1.62, 0], M.plasticPale, 'shift-notes-board'));
  for (const [ny, nz, tone] of [[1.86, -0.18, M.paper], [1.72, 0.16, M.floorAccent], [1.5, -0.06, M.paper], [1.42, 0.22, M.paper]]) {
    const sheet = box([0.02, 0.2, 0.15], [-0.035, ny, nz], tone, 'shift-note', { cast: false });
    sheet.rotation.x = (nz > 0 ? 1 : -1) * 0.06;
    notes.add(sheet);
  }
  securityDetails.add(notes);
  // A cable loom dropping from the tray into the console, so the kit is fed.
  securityDetails.add(
    box([0.03, 3.3, 0.03], [12.1, 2.55, -9.6], M.blackout, 'security-detail.console-feed', { cast: false }),
    box([2.6, 0.03, 0.03], [13.4, 0.9, -9.6], M.blackout, 'security-detail.console-feed', { cast: false }),
  );
  {
    const { light } = pendantLantern(securityDetails, 14.2, -8.4, {
      y: 4.46, drop: 0.85, colour: 0x9fc6cc, intensity: 9, distance: 12, name: 'security-pendant',
    });
    roomLights.push(light);
    const strip = box([3.4, 0.09, 0.22], [14.9, 3.16, -10.4], M.lampCool, 'security-detail.backdrop-strip', { cast: false });
    securityDetails.add(strip);
    const stripLight = new THREE.PointLight(0x86aeb2, 6, 7, 2);
    stripLight.name = 'security-backdrop-strip-light';
    stripLight.position.set(14.9, 3.0, -10.1);
    securityDetails.add(stripLight);
    roomLights.push(stripLight);
  }
  const rackFaces = new THREE.Group();
  rackFaces.name = 'security-detail.rack-faces';
  const indicators = new THREE.Group();
  indicators.name = 'security-detail.indicators';
  /* was: a face Mesh per rack and four indicator Meshes per face -- 20 draws
   * of one repeated rack front. Interior fittings under the roof: the face
   * batch stops casting (the indicators never cast). */
  const rackRows = [];
  for (let z = SECURITY_RACK_Z0; z <= SECURITY_RACK_Z1; z += SECURITY_RACK_PITCH) rackRows.push(z);
  instanced(
    rackFaces,
    new THREE.BoxGeometry(0.07, 1.95, 0.55),
    M.stone,
    rackRows.map((z) => (face) => { face.position.set(SECURITY_RACK_FACE_X, 1.2, z); }),
    'security-rack-face',
  );
  instanced(
    indicators,
    new THREE.BoxGeometry(0.025, 0.055, 0.055),
    M.lampCool,
    rackRows.flatMap((z) => [0.65, 1.05, 1.45, 1.85].map((y) => [y, z]))
      .map(([y, z]) => (indicator) => { indicator.position.set(SECURITY_RACK_FACE_X - 0.05, y, z); }),
    'security-rack-indicator',
  );
  securityDetails.add(rackFaces, indicators);
  const cableTray = new THREE.Group();
  cableTray.name = 'security-detail.cable-tray';
  cableTray.add(
    box([0.12, 0.12, 10.5], [11.35, 4.23, -11], M.iron, 'security-cable-rail', { cast: false }),
    box([0.12, 0.12, 10.5], [11.85, 4.23, -11], M.iron, 'security-cable-rail', { cast: false }),
  );
  // was: fourteen rung Meshes (already non-casting) -- now one draw.
  const rungRows = [];
  for (let z = -15.7; z <= -6.3; z += 0.7) rungRows.push(z);
  instanced(
    cableTray,
    new THREE.BoxGeometry(0.62, 0.04, 0.05),
    M.iron,
    rungRows.map((z) => (rung) => { rung.position.set(11.6, 4.2, z); }),
    'security-cable-rung',
  );
  securityDetails.add(cableTray);
  const stool = new THREE.Group();
  stool.name = 'security-detail.operator-stool';
  stool.position.set(13.25, 0, -8.7);
  stool.add(
    cylinder(0.3, 0.1, [0, 0.58, 0], M.woodLight, 'security-stool-seat', 14),
    cylinder(0.06, 0.55, [0, 0.29, 0], M.iron, 'security-stool-post', 8),
  );
  securityDetails.add(stool);

  /* ---------------------------------------------------------------- *
   * The service corridor -- the stretch between the intelligence room and
   * the gallery door, which was seven metres of empty tile with a light in
   * it. Owner's detail pass: *"large unused floor areas... rooms without a
   * clear purpose"*. Its purpose is that this is how the house is RUN:
   * pallets of stock, a mop sink, a fuse board, the crates the dining room's
   * bar is refilled from. Everything is against one wall or the other; the
   * lane between x 12.3 and 16.1 is untouched.
   * ---------------------------------------------------------------- */
  const corridorDetails = new THREE.Group();
  corridorDetails.name = 'service-corridor-refinement';
  estate.add(corridorDetails);
  corridorDetails.add(
    box([7.0, 0.03, 17.0], [14.2, 0.085, -25.0], M.stone, 'service-corridor-detail.floor-field', { cast: false }),
    box([0.07, 1.0, 17.0], [17.7, 0.5, -25.0], M.plaster, 'service-corridor-detail.kick-rail'),
    box([0.09, 0.09, 17.0], [17.68, 1.06, -25.0], M.iron, 'service-corridor-detail.bump-rail', { cast: false }),
  );
  // Wire tray and conduit, continuing the intelligence room's own run.
  corridorDetails.add(
    box([0.12, 0.12, 16.6], [11.35, 4.23, -25.0], M.iron, 'service-corridor-detail.cable-rail', { cast: false }),
    box([0.12, 0.12, 16.6], [11.85, 4.23, -25.0], M.iron, 'service-corridor-detail.cable-rail', { cast: false }),
    box([0.05, 0.05, 16.6], [17.5, 3.4, -25.0], M.blackout, 'service-corridor-detail.conduit', { cast: false }),
  );

  // Shelving down the east wall, loaded with the house's own supplies.
  const shelving = new THREE.Group();
  shelving.name = 'service-corridor-detail.shelving';
  for (const z of [-18.4, -21.6, -30.4]) {
    shelving.add(
      box([0.7, 0.06, 2.6], [17.3, 0.42, z], M.steel, 'service-shelf'),
      box([0.7, 0.06, 2.6], [17.3, 1.18, z], M.steel, 'service-shelf'),
      box([0.7, 0.06, 2.6], [17.3, 1.94, z], M.steel, 'service-shelf'),
    );
    for (const oz of [-1.2, 1.2]) {
      shelving.add(box([0.07, 2.2, 0.07], [17.3, 1.1, z + oz], M.steel, 'service-shelf-upright', { cast: false }));
    }
    for (const [index, y] of [0.62, 1.38, 2.14].entries()) {
      for (let slot = 0; slot < 3; slot++) {
        shelving.add(box(
          [0.5, 0.34, 0.6],
          [17.3, y, z - 0.85 + slot * 0.85],
          (index + slot) % 3 === 0 ? M.tile : (index + slot) % 3 === 1 ? M.woodLight : M.stone,
          'service-supply-crate',
        ));
      }
    }
    addCollider(colliders, [17.3, 1.1, z], [0.8, 2.2, 2.8], `service-shelving.${z}`);
  }
  corridorDetails.add(shelving);

  // Stacked liquor cases against the west partition -- the dining room's bar,
  // before it reaches the dining room.
  const cases = new THREE.Group();
  cases.name = 'service-corridor-detail.liquor-cases';
  for (const [index, [cz, high]] of [[-19.6, 3], [-28.0, 4], [-31.6, 2]].entries()) {
    for (let level = 0; level < high; level++) {
      const crate = box(
        [0.9, 0.36, 1.1],
        [11.25, 0.19 + level * 0.37, cz + (level % 2) * 0.06],
        level % 2 ? M.woodLight : M.wood,
        'service-liquor-case',
      );
      crate.rotation.y = (index + level) * 0.03;
      cases.add(crate);
      cases.add(box(
        [0.3, 0.1, 0.36],
        [11.25, 0.19 + level * 0.37, cz + (level % 2) * 0.06 - 0.56],
        M.paper,
        'service-case-label',
        { cast: false },
      ));
    }
    addCollider(colliders, [11.25, 0.6, cz], [1.0, 1.4, 1.2], `service-liquor-stack.${index}`);
  }
  corridorDetails.add(cases);

  // A mop sink and a fuse board: the two least glamorous objects in a palace.
  const utility = new THREE.Group();
  utility.name = 'service-corridor-detail.utility';
  /* NOT at z -24.4: that is dead centre of the gallery service doorway (the
   * gap in the east partitions between z -26.5 and -22, jambs and lintel
   * built below), and the evidence route walks through it. It stands against
   * the solid stretch north of the door instead. */
  utility.position.set(11.3, 0, -16.6);
  utility.add(
    box([0.72, 0.24, 0.9], [0, 0.12, 0], M.stoneLight, 'mop-sink-basin'),
    box([0.66, 0.05, 0.84], [0, 0.235, 0], M.water, 'mop-sink-water', { cast: false }),
    cylinder(0.022, 0.4, [0.12, 0.44, -0.3], M.brass, 'mop-sink-riser', 8),
    box([0.05, 0.05, 0.2], [0.12, 0.62, -0.2], M.brass, 'mop-sink-spout', { cast: false }),
    box([0.06, 1.5, 0.06], [-0.2, 0.9, 0.28], M.woodLight, 'mop-handle'),
    box([0.16, 0.22, 0.1], [-0.2, 0.16, 0.32], M.plasticPale, 'mop-head'),
  );
  corridorDetails.add(utility);
  addCollider(colliders, [11.3, 0.3, -16.6], [0.8, 0.6, 1.0], 'service-mop-sink');
  const fuseBoard = new THREE.Group();
  fuseBoard.name = 'service-corridor-detail.fuse-board';
  fuseBoard.position.set(17.62, 2.0, -27.4);
  fuseBoard.add(
    box([0.14, 0.9, 0.7], [0, 0, 0], M.iron, 'fuse-board-cabinet'),
    box([0.03, 0.8, 0.62], [-0.08, 0, 0.02], M.stone, 'fuse-board-door', { cast: false }),
  );
  for (let index = 0; index < 6; index++) {
    fuseBoard.add(box(
      [0.02, 0.06, 0.05],
      [-0.1, 0.3 - index * 0.11, -0.16],
      index % 2 ? M.lampCool : M.lampWarm,
      'fuse-board-breaker',
      { cast: false },
    ));
  }
  corridorDetails.add(fuseBoard);
  for (const z of [-19.6, -25.0, -30.4]) {
    const { light } = wallSconce(corridorDetails, {
      x: 17.72, y: 2.9, z, yaw: -Math.PI / 2, colour: 0x9fc6cc, intensity: 6, distance: 9,
    });
    roomLights.push(light);
  }

  /* ---------------------------------------------------------------- *
   * THE PORTRAIT GALLERY, AND THE ART THAT MADE ITS DOORWAY LOOK BROKEN.
   *
   * Owner, 2026-08-20 playtest: *"the dead-end doorway is fine; the art
   * placement makes it look broken"* -- left picture farther down the left
   * wall, the one across the doorway shifted off it and mounted properly,
   * the right-hand pair pushed toward the wall and down the hall, *"nothing
   * may visually block the doorway opening"*, *"check all wall-art depth so
   * nothing floats or is buried in geometry"*.
   *
   * Three separate faults, all measurable:
   *
   *   1. The east row ran z = -18, -21.5, -25, -28.5, -31. The service
   *      doorway is the gap in the east partition between z -26.5 and -22 --
   *      so the picture at z -25 hung dead across the opening, and the panel
   *      behind it filled the rest of it. Both rows are now authored from
   *      the doorway outward: nothing on the east wall enters -26.6..-21.9.
   *   2. Every frame on the east side faced +X, INTO the wall it hung on:
   *      `framedPortrait(..., facing: 'x')` yaws both sides the same way, so
   *      half the gallery showed the player the back of a frame. Each row now
   *      declares which way its wall looks.
   *   3. Depth. Portraits sat at |x| 9.8 and panels at |x| 10.08 against wall
   *      faces at |x| 10.34 -- 22 cm of air behind the panel and 46 cm behind
   *      the picture. Everything here is now measured off the face: panels
   *      touch the plaster, frames touch the panels.
   * ---------------------------------------------------------------- */
  const galleryRunner = box([5.2, 0.025, 17], [0, 0.09, -24.5], M.textile, 'portrait-gallery-runner', { cast: false });
  estate.add(galleryRunner);

  const galleryDetails = new THREE.Group();
  galleryDetails.name = 'portrait-gallery-refinement';
  estate.add(galleryDetails);
  // The west side previously had no mounting surface at all. This one solid
  // gallery wall gives the portrait sequence architectural depth without
  // changing the central patrol/combat aisle.
  solid(galleryDetails, colliders, [0.32, 4.2, 18.6], [-10.5, 2.1, -24.6], M.plaster, 'gallery-west-wall');

  /* Wall faces, measured: the west gallery wall is 0.32 thick at x -10.5 and
   * the east service partitions are 0.35 thick at x 10.5. */
  const GALLERY_WALLS = Object.freeze([
    Object.freeze({
      side: -1, face: -10.34, yaw: -Math.PI / 2,
      /* LEFT WALL -- pushed farther down the hall, and spread rather than
       * bunched at the entrance end. */
      art: Object.freeze([-19.4, -23.0, -26.6, -30.2]),
    }),
    Object.freeze({
      side: 1, face: 10.325, yaw: Math.PI / 2,
      /* RIGHT WALL -- the service doorway occupies z -26.5..-22, so the row
       * is authored either side of it and hard against the wall. */
      art: Object.freeze([-17.4, -20.2, -28.6, -31.4]),
    }),
  ]);
  for (const wall of GALLERY_WALLS) {
    for (const [index, z] of wall.art.entries()) {
      // Panel back ON the plaster; frame back ON the panel.
      galleryDetails.add(box(
        [0.09, 2.45, 2.3],
        [wall.face - wall.side * 0.045, 1.85, z],
        M.woodLight,
        'gallery-wall-panel',
      ));
      const front = wall.face - wall.side * 0.09;
      if (index % 2 === 0) {
        /* The frame body is 0.12 deep about its own origin, so back it off by
         * half of that to put its rear face on the panel rather than 6 cm in
         * front of it. */
        framedPortrait(galleryDetails, front - wall.side * 0.06, 1.85, z, {
          scale: 0.46, facing: wall.side > 0 ? '-x' : 'x',
        });
      } else {
        wallArt(galleryDetails, {
          x: front, y: 1.85, z, yaw: wall.yaw, width: 1.0, height: 1.3, tone: index + wall.side + 2,
        });
      }
      const pictureLight = new THREE.Group();
      pictureLight.name = 'gallery-picture-light';
      pictureLight.position.set(wall.face - wall.side * 0.3, 3.16, z);
      pictureLight.add(
        box([0.42, 0.06, 0.06], [wall.side * 0.16, 0, 0], M.brass, 'gallery-picture-light-arm'),
        box([0.06, 0.34, 0.06], [wall.side * 0.29, 0.16, 0], M.brass, 'gallery-picture-light-stem', { cast: false }),
      );
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 9, 6), M.lampWarm);
      bulb.name = 'gallery-picture-light-bulb';
      bulb.position.set(-wall.side * 0.06, -0.08, 0);
      pictureLight.add(bulb);
      galleryDetails.add(pictureLight);
    }
  }
  /* The doorway is now the only thing on that stretch of wall, and it is
   * FLANKED rather than blocked -- a console on the far side and a pair of
   * plants short of the jambs, which reads as "this way through" instead of
   * "somebody hung a picture over a door". */
  const galleryConsole = new THREE.Group();
  galleryConsole.name = 'gallery-detail.console';
  galleryConsole.position.set(-9.9, 0, -24.4);
  galleryConsole.add(
    box([0.52, 0.07, 1.7], [0, 0.88, 0], M.woodLight, 'gallery-console-top'),
    box([0.4, 0.5, 1.5], [0, 0.6, 0], M.wood, 'gallery-console-body'),
    box([0.09, 0.52, 0.09], [0, 0.26, -0.76], M.wood, 'gallery-console-leg', { cast: false }),
    box([0.09, 0.52, 0.09], [0, 0.26, 0.76], M.wood, 'gallery-console-leg', { cast: false }),
    cylinder(0.17, 0.42, [0, 1.12, -0.48], M.tile, 'gallery-console-urn', 12),
    cylinder(0.13, 0.3, [0, 1.06, 0.5], M.brass, 'gallery-console-bowl', 12),
  );
  galleryDetails.add(galleryConsole);
  addCollider(colliders, [-9.9, 0.5, -24.4], [0.6, 1.0, 1.8], 'gallery-console');
  for (const z of [-21.0, -27.6]) pottedPlant(galleryDetails, 9.75, z, { scale: 0.95 });
  galleryDetails.add(
    box([0.055, 0.04, 17.0], [-2.58, 0.115, -24.5], M.brass, 'gallery-runner-border', { cast: false }),
    box([0.055, 0.04, 17.0], [2.58, 0.115, -24.5], M.brass, 'gallery-runner-border', { cast: false }),
  );
  for (const z of [-16.6, -19.4, -22.2, -25.0, -27.8, -30.6, -33.2]) {
    galleryDetails.add(box([19.6, 0.14, 0.16], [0, 4.4, z], M.wood, 'gallery-ceiling-beam', { cast: false }));
  }
  for (const x of [-6.5, 0, 6.5]) {
    galleryDetails.add(box([0.16, 0.14, 17.9], [x, 4.4, -24.6], M.wood, 'gallery-ceiling-beam', { cast: false }));
  }
  /* The gallery's own practical, hung between the beam runs at x 0 and 6.5
   * and between the rows at z -25.0 and -22.2 -- the old point light floated
   * at y 3.35 with no fixture on it at all. */
  {
    const { light } = pendantLantern(galleryDetails, 2.6, -24.0, {
      y: 4.46, drop: 1.1, colour: 0xffa85a, intensity: 11, distance: 16, name: 'gallery-pendant',
    });
    roomLights.push(light);
  }
  for (const [index, x] of [-8.25, 8.25].entries()) {
    const bench = new THREE.Group();
    bench.name = 'gallery-bench';
    bench.position.set(x, 0, -24.6);
    bench.add(
      box([0.86, 0.14, 3.0], [0, 0.52, 0], M.woodLight, `gallery-bench.${index}.seat`),
      // Seat top is y 0.59; the old 0.18-thick pad at 0.63 hung below it.
      box([0.7, 0.12, 2.76], [0, 0.65, 0], M.textile, `gallery-bench.${index}.cushion`),
      box([0.12, 0.5, 0.12], [0, 0.25, -1.26], M.wood, `gallery-bench.${index}.leg`),
      box([0.12, 0.5, 0.12], [0, 0.25, 1.26], M.wood, `gallery-bench.${index}.leg`),
    );
    galleryDetails.add(bench);
    addCollider(colliders, [x, 0.52, -24.6], [1.0, 1.04, 3.2], `gallery-bench.${index}`);
  }
  // The existing east-side service-wall gap remains the evidence-route door;
  // an overhead lintel and jambs make that gap intentional without closing it.
  galleryDetails.add(
    box([0.4, 3.45, 0.28], [10.5, 1.73, -26.28], M.stoneLight, 'gallery-service-door-jamb'),
    box([0.4, 3.45, 0.28], [10.5, 1.73, -22.22], M.stoneLight, 'gallery-service-door-jamb'),
    box([0.4, 0.32, 4.35], [10.5, 3.62, -24.25], M.stoneLight, 'gallery-service-door-lintel'),
  );

  // Dining room: a formal cartel table staged as the final arena. The front
  // edge deliberately has no chairs: Mark and Sauce retain their canonical
  // positions and the player gets two clean flanking lanes around the table.
  const diningStage = new THREE.Group();
  diningStage.name = 'final-dining-refinement';
  estate.add(diningStage);
  diningStage.add(box([14.8, 0.04, 11.5], [0, 0.07, -42.15], M.textile, 'final-dining-rug', { cast: false }));

  const finalTable = table(diningStage, colliders, 0, -42.4, 9.8, 2.2, 'mark-dining-table');
  finalTable.add(box([8.7, 0.024, 0.54], [0, 0.892, 0], M.floorAccent, 'dining-table-runner', { cast: false }));
  // was: seven identical brass candles -- one batch along the runner.
  const candleColumns = [];
  for (let candleIndex = -3; candleIndex <= 3; candleIndex++) candleColumns.push(candleIndex * 1.3);
  instanced(
    finalTable,
    new THREE.CylinderGeometry(0.045, 0.045, 0.32, 8),
    M.brass,
    candleColumns.map((x) => (candle) => { candle.position.set(x, 1.064, 0); }),
    'dining-candle',
  );
  const settingParts = { plates: [], rims: [], glasses: [], napkins: [] };
  let settingIndex = 0;
  for (const z of [-0.62, 0.62]) {
    for (const x of [-3.55, -1.2, 1.2, 3.55]) {
      diningPlaceSetting(finalTable, settingParts, x, z, settingIndex++);
    }
  }
  buildPlaceSettingInstances(finalTable, settingParts);
  const chairParts = { seats: [], backs: [], cushions: [], legs: [] };
  let chairIndex = 0;
  for (const [x, z, yaw] of [
    [-3.6, -44.2, Math.PI], [-1.2, -44.2, Math.PI],
    [1.2, -44.2, Math.PI], [3.6, -44.2, Math.PI],
    [-5.55, -42.4, -Math.PI / 2], [5.55, -42.4, Math.PI / 2],
  ]) diningChair(diningStage, colliders, chairParts, x, z, yaw, chairIndex++);
  buildDiningChairInstances(diningStage, chairParts);

  for (const z of [-36.4, -38.8, -41.2, -43.6, -46.0, -48.4]) {
    diningStage.add(box([32.8, 0.12, 0.18], [0, 4.4, z], M.wood, 'dining-coffer-beam', { cast: false }));
  }
  /* CEILING CLIPPING. Owner, 2026-08-20: *"ceiling lights intersect the red
   * ceiling feature: lower/reposition, then check the whole ceiling for
   * clipping"*. The red feature is this dark-red coffer grid at y 4.34..4.46,
   * and the chandelier's suspension chain runs y 3.73..4.51 at dead centre --
   * straight through the x = 0 column, which is why the fixture looked
   * skewered. The column is replaced by a proper ceiling rose the chain
   * actually hangs from, and the room's other practicals are authored between
   * the runs rather than on them. */
  for (const x of [-12, -6, 6, 12]) {
    diningStage.add(box([0.18, 0.12, 13.6], [x, 4.4, -42.4], M.wood, 'dining-coffer-beam', { cast: false }));
  }
  diningStage.add(
    cylinder(0.44, 0.08, [0, 4.44, -42.4], M.woodLight, 'dining-ceiling-rose', 20),
    cylinder(0.3, 0.05, [0, 4.37, -42.4], M.brass, 'dining-ceiling-rose-collar', 20),
  );
  for (const x of [-17.7, 17.7]) {
    for (const z of [-37.0, -40.6, -44.2, -47.8]) {
      diningStage.add(box([0.08, 1.5, 2.6], [x, 1.2, z], M.woodLight, 'dining-wall-panel'));
    }
  }
  for (const x of [-14.2, -10.4, -6.6, 6.6, 10.4, 14.2]) {
    diningStage.add(
      box([3.1, 2.6, 0.08], [x, 1.58, -49.69], M.woodLight, 'dining-rear-wall-panel'),
      box([2.7, 2.2, 0.055], [x, 1.58, -49.63], M.textile, 'dining-rear-wall-inset'),
    );
  }
  diningChandelier(diningStage);

  solid(diningStage, colliders, [3.8, 1.1, 0.75], [-14.7, 0.55, -43.5], M.wood, 'dining-sideboard-west');
  solid(diningStage, colliders, [3.8, 1.1, 0.75], [14.7, 0.55, -43.5], M.wood, 'dining-sideboard-east');
  /* Hung over the x 6.6 rear-wall panel, east of the extraction opening: the
   * rear wall segments stop at |x| 3.2, so a portrait at x 0 sits entirely in
   * the 6.4 m gap the gate reveals. z clears the panel inset's front face. */
  framedPortrait(diningStage, 6.6, 2.5, -49.53, { scale: 1.05 });

  /* ---------------------------------------------------------------- *
   * DRESSING MARK'S DINING ROOM.
   *
   * Owner, 2026-08-20 playtest: *"another empty room -- add sideboard /
   * credenza, drinks / bottles / glasses, plates, papers, decorative
   * centrepiece, curtains or architectural trim, rugs, plants, small
   * furniture / cartel-luxury clutter. Keep it a wealthy criminal's house,
   * not an exploded furniture showroom."*
   *
   * The two sideboards were 3.8 x 0.75 wooden blocks with nothing on them.
   * They are laid now -- the west one as the bar, the east one as the
   * service end with the plates and the night's paperwork -- and the room
   * gets drapes and mirrors on its long walls, a bar cart, a serving
   * credenza and two urn palms. Nothing new carries a collider inside the
   * flanking lanes at x +-7.2; the fight is exactly the fight it was.
   * ---------------------------------------------------------------- */
  const diningDressing = new THREE.Group();
  diningDressing.name = 'dining-detail.dressing';
  diningStage.add(diningDressing);

  // Sideboard tops: doors, pulls, and the plinth they stand on.
  for (const sx of [-14.7, 14.7]) {
    diningDressing.add(
      box([3.9, 0.09, 0.85], [sx, 1.14, -43.5], M.woodLight, 'dining-sideboard-top'),
      box([3.9, 0.12, 0.85], [sx, 0.06, -43.5], M.wood, 'dining-sideboard-plinth', { cast: false }),
    );
    for (const dx of [-1.2, 0, 1.2]) {
      diningDressing.add(
        box([1.06, 0.72, 0.03], [sx + dx, 0.62, -43.11], M.woodLight, 'dining-sideboard-door', { cast: false }),
        box([0.22, 0.035, 0.03], [sx + dx, 0.62, -43.08], M.brass, 'dining-sideboard-pull', { cast: false }),
      );
    }
  }
  // WEST: the bar. Bottles, decanter, tumblers, ice bucket, a spilled tray.
  for (const [bx, tone, height] of [
    [-16.0, M.bottleAmber, 0.34], [-15.72, M.bottleGreen, 0.3], [-15.44, M.bottleAmber, 0.36],
    [-15.16, M.bottleGreen, 0.28], [-14.88, M.bottleAmber, 0.32],
  ]) {
    diningDressing.add(
      cylinder(0.052, height, [bx, 1.185 + height / 2, -43.68], tone, 'dining-bar-bottle', 10),
      cylinder(0.019, 0.1, [bx, 1.185 + height + 0.05, -43.68], M.brass, 'dining-bar-bottle-neck', 8),
    );
  }
  for (const gx of [-14.3, -14.06, -13.82, -14.18, -13.94]) {
    diningDressing.add(cylinder(0.04, 0.12, [gx, 1.245, -43.36], M.glass, 'dining-bar-tumbler', 10));
  }
  diningDressing.add(
    cylinder(0.19, 0.24, [-13.3, 1.305, -43.62], M.brass, 'dining-ice-bucket', 14),
    cylinder(0.16, 0.05, [-13.3, 1.42, -43.62], M.glass, 'dining-ice', 12),
    cylinder(0.14, 0.3, [-16.35, 1.335, -43.34], M.bottleGreen, 'dining-decanter', 12),
    box([0.7, 0.02, 0.42], [-14.5, 1.195, -43.3], M.brass, 'dining-bar-tray', { cast: false }),
  );
  // EAST: the service end. Plate stack, tureen, folded napkins, the night's
  // paperwork, and a cigar humidor because this is still a cartel dinner.
  for (let index = 0; index < 8; index++) {
    diningDressing.add(cylinder(
      0.16, 0.022, [13.6, 1.196 + index * 0.024, -43.62], M.white, 'dining-plate-stack', 16,
    ));
  }
  diningDressing.add(
    cylinder(0.26, 0.22, [14.5, 1.295, -43.66], M.white, 'dining-tureen', 16),
    cylinder(0.08, 0.06, [14.5, 1.435, -43.66], M.brass, 'dining-tureen-knob', 10),
    box([0.26, 0.08, 0.2], [15.35, 1.225, -43.6], M.textile, 'dining-folded-napkins'),
    box([0.26, 0.08, 0.2], [15.35, 1.31, -43.6], M.textile, 'dining-folded-napkins'),
    box([0.42, 0.13, 0.3], [16.3, 1.25, -43.5], M.tile, 'dining-humidor'),
    box([0.42, 0.02, 0.3], [16.3, 1.4, -43.7], M.tile, 'dining-humidor-lid', { cast: false }),
  );
  for (let index = 0; index < 9; index++) {
    const sheet = box(
      [0.24, 0.004, 0.32],
      [14.9 + (index % 3) * 0.03, 1.19 + index * 0.005, -43.24],
      M.paper,
      'dining-service-paperwork',
      { cast: false },
    );
    sheet.rotation.y = (index % 4) * 0.05 - 0.08;
    diningDressing.add(sheet);
  }
  diningDressing.add(box([0.3, 0.06, 0.2], [13.2, 1.215, -43.2], M.green, 'dining-banded-cash'));

  /* Drapes and mirrors: the long side walls carried four flat panels each and
   * nothing else. Curtains give the room its height back. */
  for (const side of [-1, 1]) {
    for (const z of [-38.8, -46.0]) {
      const wallX = side * 17.74;
      diningDressing.add(
        box([0.09, 3.3, 0.5], [wallX - side * 0.05, 1.9, z - 0.95], M.curtain, 'dining-drape'),
        box([0.09, 3.3, 0.5], [wallX - side * 0.05, 1.9, z + 0.95], M.curtain, 'dining-drape'),
        box([0.11, 0.16, 2.7], [wallX - side * 0.06, 3.62, z], M.brass, 'dining-drape-pelmet', { cast: false }),
        box([0.05, 2.4, 1.35], [wallX - side * 0.03, 1.9, z], M.glass, 'dining-wall-mirror', { cast: false }),
        box([0.07, 2.56, 1.5], [wallX - side * 0.015, 1.9, z], M.brass, 'dining-mirror-frame'),
      );
    }
  }

  // A bar cart and a serving credenza, both outside the flanking lanes.
  const barCart = new THREE.Group();
  barCart.name = 'dining-detail.bar-cart';
  barCart.position.set(-9.4, 0, -37.4);
  barCart.rotation.y = 0.3;
  barCart.add(
    box([0.94, 0.05, 0.56], [0, 0.78, 0], M.brass, 'bar-cart-top'),
    box([0.94, 0.05, 0.56], [0, 0.34, 0], M.brass, 'bar-cart-shelf'),
  );
  for (const [ox, oz] of [[-0.42, -0.24], [0.42, -0.24], [-0.42, 0.24], [0.42, 0.24]]) {
    barCart.add(box([0.035, 0.78, 0.035], [ox, 0.39, oz], M.brass, 'bar-cart-post', { cast: false }));
    const wheel = cylinder(0.05, 0.03, [ox, 0.05, oz], M.blackout, 'bar-cart-wheel', 10);
    wheel.rotation.z = Math.PI / 2;
    barCart.add(wheel);
  }
  barCart.add(
    cylinder(0.055, 0.3, [-0.24, 0.955, -0.06], M.bottleAmber, 'bar-cart-bottle', 10),
    cylinder(0.055, 0.26, [-0.06, 0.935, 0.1], M.bottleGreen, 'bar-cart-bottle', 10),
    cylinder(0.04, 0.12, [0.2, 0.865, -0.08], M.glass, 'bar-cart-tumbler', 10),
    cylinder(0.04, 0.12, [0.32, 0.865, 0.06], M.glass, 'bar-cart-tumbler', 10),
    cylinder(0.15, 0.05, [0.02, 0.385, 0], M.brass, 'bar-cart-bowl', 12),
  );
  diningDressing.add(barCart);
  addCollider(colliders, [-9.4, 0.5, -37.4], [1.1, 1.0, 0.8], 'dining-bar-cart');

  const credenza = new THREE.Group();
  credenza.name = 'dining-detail.serving-credenza';
  credenza.position.set(9.6, 0, -36.6);
  credenza.add(
    box([2.4, 0.08, 0.66], [0, 1.0, 0], M.woodLight, 'credenza-top'),
    box([2.24, 0.92, 0.6], [0, 0.5, 0], M.wood, 'credenza-body'),
    box([1.0, 0.5, 0.03], [-0.55, 0.62, -0.31], M.woodLight, 'credenza-door', { cast: false }),
    box([1.0, 0.5, 0.03], [0.55, 0.62, -0.31], M.woodLight, 'credenza-door', { cast: false }),
    box([0.03, 0.14, 0.03], [-0.08, 0.62, -0.34], M.brass, 'credenza-pull', { cast: false }),
    box([0.03, 0.14, 0.03], [0.08, 0.62, -0.34], M.brass, 'credenza-pull', { cast: false }),
    // The decorative centrepiece the room was missing: a gilt fruit bowl,
    // a candelabra, and a stack of somebody's clean plates.
    cylinder(0.3, 0.12, [-0.6, 1.1, 0], M.brass, 'credenza-fruit-bowl', 16),
  );
  for (const [fx, fz] of [[-0.7, -0.06], [-0.52, 0.05], [-0.62, 0.1], [-0.46, -0.09]]) {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.red);
    fruit.name = 'credenza-fruit';
    fruit.position.set(fx, 1.2, fz);
    fruit.castShadow = true;
    credenza.add(fruit);
  }
  credenza.add(cylinder(0.11, 0.06, [0.7, 1.07, 0], M.brass, 'credenza-candelabra-foot', 10));
  for (const [cx, cz] of [[0.7, 0], [0.52, 0], [0.88, 0]]) {
    credenza.add(
      cylinder(0.022, 0.34, [cx, 1.27, cz], M.brass, 'credenza-candelabra-arm', 8),
      cylinder(0.026, 0.16, [cx, 1.52, cz], M.white, 'credenza-candle', 8),
    );
  }
  diningDressing.add(credenza);
  addCollider(colliders, [9.6, 0.5, -36.6], [2.5, 1.0, 0.75], 'dining-serving-credenza');

  // Two urn palms flanking the doors, and a runner inside them.
  for (const px of [-8.6, 8.6]) pottedPlant(diningDressing, px, -35.4, { scale: 1.35 });
  diningDressing.add(
    box([9.4, 0.03, 2.2], [0, 0.075, -35.6], M.velvet, 'dining-door-runner', { cast: false }),
    box([0.06, 0.04, 2.2], [-4.73, 0.09, -35.6], M.brass, 'dining-door-runner-border', { cast: false }),
    box([0.06, 0.04, 2.2], [4.73, 0.09, -35.6], M.brass, 'dining-door-runner-border', { cast: false }),
  );
  // Table clutter that says a dinner was interrupted, not staged.
  finalTable.add(
    box([0.4, 0.1, 0.28], [-2.6, 0.94, 0.72], M.tile, 'dining-table-cigar-box'),
    cylinder(0.09, 0.05, [3.1, 0.915, 0.74], M.glass, 'dining-table-ashtray', 12),
    cylinder(0.06, 0.24, [1.9, 1.0, -0.76], M.bottleGreen, 'dining-table-wine', 10),
    box([0.28, 0.03, 0.2], [-3.9, 0.9, -0.74], M.paper, 'dining-table-menu-card', { cast: false }),
  );

  /* The room's practical light. The generic pool keeps the pool ABOVE the
   * table (see the light list below); these two hang between the coffer runs
   * at either end, and the side walls carry sconces so the mirrors have
   * something to return. */
  for (const [px, pz] of [[0, -37.4], [0, -47.2]]) {
    const { light } = pendantLantern(diningDressing, px, pz, {
      y: 4.46, drop: 1.35, colour: 0xffb16b, intensity: 9, distance: 15, name: 'dining-pendant',
    });
    roomLights.push(light);
  }
  for (const [sx, yaw] of [[-17.74, Math.PI / 2], [17.74, -Math.PI / 2]]) {
    const { light } = wallSconce(diningDressing, {
      x: sx, y: 2.75, z: -42.4, yaw, colour: 0xffd6a0, intensity: 5, distance: 9,
    });
    roomLights.push(light);
  }

  const extractionGate = ironGate(5.4, 3.7, 'terrace-extraction-gate');
  extractionGate.position.set(0, 0, -52.6);
  estate.add(extractionGate);
  const extractionCollider = addCollider(colliders, [0, 2, -52.6], [5.5, 4.0, 0.3], 'terrace-extraction-gate');

  // One pool of local lights; the composition root can cap or disable it.
  const lights = [...courtyardPracticalLights, ...entryLights, ...roomLights];
  for (const [x, y, z, color, intensity, distance] of [
    [0, 1.1, 35, 0x7ac4d1, 5.2, 15],
    [-11, 0.4, 19, 0x4ea6b8, 4.2, 13],
    [11, 3.1, 58.2, 0xffb66d, 12, 16],
    [17, 3.1, 58.2, 0xffb66d, 12, 16],
    // The dining room's own overhead pool, off the chandelier's axis and
    // between the coffer grid so nothing hangs through a beam.
    [0, 3.4, -42.4, 0xff9c51, 13, 20],
  ]) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z);
    root.add(light);
    lights.push(light);

    /* The light has a source in the world. Every INTERIOR practical is now an
     * authored fixture that carries its own PointLight (see pendantLantern /
     * wallSconce and the per-room blocks above), so the only lights still
     * needing a generic body are the exterior gate pair; the courtyard water
     * lights are recessed into the fountain and pool, and the dining room's
     * source is the authored chandelier directly above this one. */
    if (z >= 55) {
      const fixture = new THREE.Group();
      fixture.name = 'palace-ceiling-practical';
      fixture.position.set(x, 4.18, z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 7), M.lampWarm);
      bulb.position.y = -0.14;
      fixture.add(
        cylinder(0.2, 0.12, [0, 0, 0], M.brass, 'practical-brass-cap', 10),
        bulb,
        cylinder(0.035, 0.24, [0, 0.18, 0], M.brass, 'practical-suspension', 8),
        // Exterior pair hangs from the inside face of the front perimeter wall.
        box([0.07, 0.07, 0.46], [0, 0.30, 0.23], M.brass, 'practical-wall-bracket'),
      );
      root.add(fixture);
    }
  }

  let serviceGateOpen = false;
  let estateDoorOpen = false;
  let diningOpen = false;
  let extractionOpen = false;

  function openServiceGate() {
    if (serviceGateOpen) return false;
    serviceGateOpen = true;
    serviceGate.rotation.y = Math.PI / 2;
    // The leaf is authored around its centre, so the opened pose needs both
    // centre coordinates moved to keep one edge on the 11.1 m hinge. It swings
    // outward over the service road so the opposite end clears the guardhouse.
    serviceGate.position.set(11.1, 0, 61.9);
    removeCollider(colliders, serviceGateCollider);
    powerLight.material = M.blackout;
    for (const light of courtyardPracticalLights) light.intensity = 0;
    for (const bulb of courtyardLampBulbs) bulb.material = M.blackout;
    return true;
  }

  function openEstateDoor() {
    if (estateDoorOpen) return false;
    estateDoorOpen = true;
    /* The leaf's group origin IS its west hinge edge (see entrancePortal),
     * so opening it is one rotation about that origin and no translation at
     * all -- the old pose moved a centre-authored slab by hand and left the
     * open door standing across the foyer's own doorway. It swings out over
     * the step, clear of the jambs, the cypresses and the facade plinth. */
    estateDoor.rotation.y = -Math.PI / 2;
    removeCollider(colliders, estateDoorCollider);
    return true;
  }

  function openDiningRoom() {
    if (diningOpen) return false;
    diningOpen = true;
    diningDoorLeft.rotation.y = Math.PI / 2;
    diningDoorRight.rotation.y = -Math.PI / 2;
    diningDoorLeft.position.x = -3.05;
    diningDoorRight.position.x = 3.05;
    removeCollider(colliders, diningDoorCollider);
    return true;
  }

  function openExtraction() {
    if (extractionOpen) return false;
    extractionOpen = true;
    extractionGate.visible = false;
    removeCollider(colliders, extractionCollider);
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Hanging the six. See `A_TEAM_ART` at the top of this file for which
   * picture goes on which wall and what proves each position.
   *
   * They go in a group of their own, added to `estate` LAST, for a reason
   * that is not tidiness: tools/geometry-allowlists/cartel-palace.json
   * addresses objects by traversal path -- `name=wall-art-frame#6` and the
   * like -- so anything inserted ahead of the existing frames renumbers
   * entries that describe geometry nobody touched. Added last, and named
   * `a-team-art-*` rather than `wall-art-*` by `wallArt`, these six cannot
   * renumber anything at all.
   * ---------------------------------------------------------------- */
  const aTeamWall = new THREE.Group();
  aTeamWall.name = 'a-team-wall-art';
  estate.add(aTeamWall);
  const aTeamPieces = A_TEAM_ART.map((piece) => {
    const height = piece.width / A_TEAM_ART_ASPECT;
    const hung = wallArt(aTeamWall, {
      x: piece.x,
      y: piece.y,
      z: piece.z,
      yaw: piece.yaw,
      width: piece.width,
      height,
      tone: piece.tone,
      slot: piece.slot,
    });
    return { ...piece, height, group: hung, field: hung.userData.artField };
  });

  /**
   * Swap the resolved image onto each canvas.
   *
   * Deliberately applied whether or not the slot resolved to a real FILE:
   * `resolveGear` hands back the drawn placeholder for a slot the manifest
   * has no file for, and that placeholder -- cheap hand-lettered A-TEAM
   * parody, drawn by src/world/gear.js FALLBACKS -- is the point. A flat
   * coloured field is what these walls looked like before, and it is what
   * they look like for the few milliseconds between the room being built
   * and the manifest arriving.
   *
   * The frame is NOT resized from the file's aspect ratio the way the Bing
   * resizes its stickers, and that is the deliberate half: these frames were
   * authored at the delivered 4:3 and the doorway proof measures them there.
   * A frame that resized itself at load time would be a frame no static
   * check had ever measured.
   */
  function dressATeamArt(gear) {
    const dressed = [];
    for (const piece of aTeamPieces) {
      const resolved = gear.get(piece.slot);
      if (!resolved?.texture) continue;
      piece.field.material.dispose();
      piece.field.material = new THREE.MeshStandardMaterial({
        map: resolved.texture, roughness: 0.95,
      });
      piece.field.userData.art = {
        slot: piece.slot, real: resolved.real, file: resolved.file,
      };
      dressed.push(piece.slot);
    }
    return dressed;
  }

  /* Nothing waits on this. A failed manifest, a missing file, or a Node test
   * with no canvas to draw a placeholder into all land in the same place:
   * the frames keep what they were built with and the palace still stands. */
  const artReady = resolveGear(A_TEAM_ART.map((piece) => piece.slot))
    .then((gear) => dressATeamArt(gear))
    .catch(() => []);

  const environmentZones = Object.freeze({
    ceilings,
    courtyard: courtyardDetails,
    entry: entryDetails,
    serviceCorridor: corridorDetails,
    office: officeDetails,
    guestSuite: guestDetails,
    security: securityDetails,
    gallery: galleryDetails,
    dining: diningStage,
  });

  /**
   * Public, derived inspection data for Node and browser verification. Nothing
   * here is a hand-maintained promise: counts, names and bounds are recomputed
   * from the same live scene graph the player sees.
   */
  function inspectEnvironment() {
    root.updateMatrixWorld(true);
    let meshes = 0;
    let groups = 0;
    let namedMeshes = 0;
    let instancedMeshes = 0;
    let renderedParts = 0;
    root.traverse((object) => {
      if (object.isMesh) {
        meshes++;
        if (object.name) namedMeshes++;
        /* `meshes` counts scene-graph Mesh objects -- the draw-call shape.
         * `renderedParts` expands every InstancedMesh into its authored
         * repeats, so a richness check keeps counting what the player SEES
         * rather than penalising the batching that draws it cheaply. */
        if (object.isInstancedMesh) {
          instancedMeshes++;
          renderedParts += object.count;
        } else {
          renderedParts++;
        }
      }
      if (object.isGroup) groups++;
    });

    const zones = Object.fromEntries(Object.entries(environmentZones).map(([name, zone]) => {
      let zoneMeshes = 0;
      const names = new Set();
      zone.traverse((object) => {
        if (object.isMesh) zoneMeshes++;
        if (object.name) names.add(object.name);
      });
      const bounds = new THREE.Box3().setFromObject(zone);
      return [name, {
        meshes: zoneMeshes,
        names: [...names].sort(),
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      }];
    }));

    return {
      meshes,
      groups,
      namedMeshes,
      instancedMeshes,
      renderedParts,
      colliders: colliders.length,
      colliderNames: colliders.map((collider) => collider.name).filter(Boolean).sort(),
      solidWaterworks: colliders
        .filter((collider) => ['courtyard-fountain-collider', 'reflecting-pool-collider'].includes(collider.name))
        .map((collider) => collider.name),
      zones,
    };
  }

  root.updateMatrixWorld(true);
  return {
    root,
    colliders,
    floorZones: [],
    groundAt: () => 0,
    materialLanguage: 'stucco-stone-clay-tile-courtyard',
    anchors: PALACE_ANCHORS,
    /* The owner art, measured off the built scene rather than restated: the
     * boxes below come from the frames the player sees, so a picture that
     * moves in `A_TEAM_ART` moves here too and the doorway proof in
     * tests/cartel-palace-a-team-art.test.mjs moves with it. */
    art: {
      slots: A_TEAM_ART.map((piece) => piece.slot),
      ready: artReady,
      pieces: aTeamPieces.map((piece) => ({
        slot: piece.slot,
        room: piece.room,
        x: piece.x,
        y: piece.y,
        z: piece.z,
        yaw: piece.yaw,
        width: piece.width,
        height: piece.height,
        box: new THREE.Box3().setFromObject(piece.group),
      })),
    },
    evidence,
    targets: { powerBox: cabinet, estateDoor, diningDoor: diningDoors, extractionGate },
    doors: { openServiceGate, openEstateDoor, openDiningRoom, openExtraction },
    lights,
    inspectEnvironment,
    state: () => ({ serviceGateOpen, estateDoorOpen, diningOpen, extractionOpen }),
  };
}
