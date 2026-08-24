/**
 * THE A-TEAM'S COLOURS, WHEREVER THEY TURN UP.
 *
 * The crew that comes over the wall at Lou's mansion and the crew Mark sends
 * into his own dining room are the same organisation, so they wear the same
 * thing. This is that thing, in one place, because the alternative is two
 * scenes each authoring a red vest and drifting apart on the red.
 *
 * WHAT IT IS. A scrimmage vest -- a pinnie -- in the same red as the crew's
 * headband, with the letter on the chest and again on the back, worn OVER
 * whatever the man's role kit gave him. Over is the honest layer as well as
 * the readable one: a panel pushed in among webbing has to fight it for depth
 * and a panel worn on top of it does not, because that is what a pinnie is.
 *
 * THE PANEL IS DELIBERATELY NOT THE WIDTH OF A CHEST. A bib from collar to
 * belt hides the role kit underneath it, and the role kit is how a player
 * tells a suppressor from a gunner before either of them fires. 0.27 by 0.36
 * leaves the outer edges of the webbing and the bottom of every bandolier
 * showing.
 *
 * THE LETTER IS THREE BOXES AND NOT A TEXTURE, because it has to read as a
 * shape at forty metres in the dark, where a 128px canvas is four pixels of
 * mush. Its legs LEAN IN -- each one's top travels toward the centre line --
 * because two parallel bars and a crossbar is an H, which is what the first
 * pass of this rendered as.
 */
import * as THREE from 'three';

/** Jersey red and bone. */
export const ATEAM_COLOURS = Object.freeze({
  /* Not the headband's brighter 0xd92e2e: the band is a strip of dyed cotton
   * catching a light and the pinnie is a whole panel of it, and the same hex
   * on both reads as one plastic object worn twice. */
  cloth: 0xa8202a,
  /* Bone rather than white, which blows out under emergency lighting and
   * stops being a shape. */
  mark: 0xf2ede0,
});

/** Local Z of the vest's outer faces, clear of the role kits underneath. */
export const ATEAM_VEST_Z = 0.252;
/** The letter, printed proud of the panel it is on. */
const MARK_Z = ATEAM_VEST_Z + 0.012;

const box = (size, pos, material, rotation = null) => Object.freeze({
  shape: 'box',
  size: Object.freeze(size),
  pos: Object.freeze(pos),
  material,
  rotation: rotation ? Object.freeze(rotation) : null,
});

/** The A, on one face. */
const letterA = (z) => [
  box([0.032, 0.200, 0.010], [-0.048, 1.34, z], 'teamMark', [0, 0, -0.42]),
  box([0.032, 0.200, 0.010], [0.048, 1.34, z], 'teamMark', [0, 0, 0.42]),
  box([0.105, 0.028, 0.010], [0, 1.30, z], 'teamMark'),
];

/**
 * The pinnie, as data. Positions are in the wearer's TORSO space -- the same
 * space the Siege's role kits are authored in, where the floor is y 0 and the
 * chest faces +z.
 */
export const ATEAM_TEAM_KIT = Object.freeze({
  label: 'A-Team colours',
  pieces: Object.freeze([
    /* The panels. Front and back, hung off the shoulders. */
    box([0.27, 0.36, 0.018], [0, 1.31, ATEAM_VEST_Z], 'team'),
    box([0.27, 0.36, 0.018], [0, 1.31, -ATEAM_VEST_Z], 'team'),
    /* What holds them on, and what stops the front panel reading as a sign
     * floating in front of a man: the strap runs over the shoulder and joins
     * the two, so the eye has the whole garment. */
    box([0.085, 0.020, 0.54], [-0.125, 1.545, 0], 'team'),
    box([0.085, 0.020, 0.54], [0.125, 1.545, 0], 'team'),
    /* The letter, on both sides, because a crew is advancing at the player
     * half the time and away from him the other half. */
    ...letterA(MARK_Z),
    ...letterA(-MARK_Z),
  ]),
});

/**
 * The two materials, minted once and shared.
 *
 * One instance for the whole game rather than one per scene: this is cloth,
 * not a scene's own tint, and two copies is two chances for the red to drift.
 */
let _materials = null;
export function ateamKitMaterials() {
  if (!_materials) {
    _materials = Object.freeze({
      team: new THREE.MeshStandardMaterial({ color: ATEAM_COLOURS.cloth, roughness: 0.93 }),
      teamMark: new THREE.MeshStandardMaterial({ color: ATEAM_COLOURS.mark, roughness: 0.88 }),
    });
  }
  return _materials;
}

/**
 * One geometry per authored piece rather than per man, across every scene.
 *
 * Twenty-two attackers in the Siege plus a wave in the Palace, all wearing the
 * same seven shapes, was that many uploads of seven shapes. The transform
 * stays on the mesh, which is where it already was.
 */
const _geometries = new Map();
function geometryFor(piece) {
  const key = piece.shape === 'round'
    ? `r:${piece.radius}:${piece.height}`
    : `b:${piece.size.join(':')}`;
  let geometry = _geometries.get(key);
  if (!geometry) {
    geometry = piece.shape === 'round'
      ? new THREE.CylinderGeometry(piece.radius, piece.radius, piece.height, 8)
      : new THREE.BoxGeometry(...piece.size);
    _geometries.set(key, geometry);
  }
  return geometry;
}

/**
 * Put the colours on one man.
 *
 * @param {THREE.Object3D} torso the wearer's body group -- the space the kit
 *   is authored in. Everything is parented here, so the vest moves with him.
 * @returns {THREE.Mesh[]} the pieces, tagged `userData.ateamTeamPiece`.
 *
 * The tag matters and is not decoration: a role kit says what a man DOES and
 * a team kit says whose he is, and the Siege's silhouette gate measures role
 * kits. Counting the pinnie into that set collapses eight distinct outfits
 * into one.
 */
export function dressInATeamColours(torso, { name = 'ateam.colours', extra = null } = {}) {
  if (!torso?.add) throw new TypeError('dressInATeamColours needs a torso Object3D');
  const materials = ateamKitMaterials();
  const worn = [];
  ATEAM_TEAM_KIT.pieces.forEach((piece, index) => {
    const mesh = new THREE.Mesh(geometryFor(piece), materials[piece.material]);
    mesh.name = `${name}.${index}`;
    mesh.position.set(...piece.pos);
    if (piece.rotation) mesh.rotation.set(...piece.rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.ateamTeamPiece = true;
    mesh.userData.ateamKit = ATEAM_TEAM_KIT.label;
    if (extra) Object.assign(mesh.userData, extra);
    torso.add(mesh);
    worn.push(mesh);
  });
  return worn;
}
