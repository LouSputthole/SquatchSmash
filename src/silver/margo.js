/**
 * Margo's head.
 *
 * The one face in this building that is looked at from sixty centimetres for
 * twenty minutes under a lamp, built by the same slab language as everybody
 * else and to none of their measurements. The shared builder's face is a
 * crowd face: one brow ledge the width of the forehead, eyes a third of an
 * eye apart, a nose deeper than it is wide, a jaw as wide as the skull. At
 * three metres in a dark room that reads as "a person". Across a table it
 * read, in the owner's words, ugly as a mug — so she gets her own.
 *
 * What is deliberately different, and why:
 *
 *   - Two brows, not a ledge. The single 15cm brow bar is most of what made
 *     the stock face masculine at conversation distance.
 *   - Eyes an eye-width apart. The stock eyes sit 0.030 apart on a 0.042
 *     width — close-set enough to read as a squint. Hers are 0.040 wide and
 *     0.046 apart, with a white, an iris and a pupil, because at 0.7m an eye
 *     that is one dark rectangle reads as sunglasses.
 *   - A jaw narrower than the skull, and a chin that is a shape rather than
 *     a block. The taper is the whole femininity of a slab face.
 *   - A nose that stops 2.4cm off the face instead of 3.4. It is a nose,
 *     not a snout.
 *   - A mouth with an upper lip, a fuller lower lip and turned corners. Not
 *     painted red: she runs a kitchen and got one night off. The colour is
 *     lip, not lipstick.
 *   - Hair in shaped masses instead of a cap: a crown, a swept fringe, and
 *     the whole weight of it brought down her LEFT side in a fall that ends
 *     at the collarbone, with the right side tucked behind her ear. The
 *     asymmetry is the point — a cap plus bun reads bald from the front,
 *     and the front is where the entire date happens.
 *
 * The talk animation in `Npc.update` scales `parts.mouth` and reads
 * `userData.base`, so the lower lip is handed back as the mouth and its base
 * recorded after everything is placed.
 *
 * No photograph is involved anywhere here and none should ever be: she is a
 * civilian, and her face is authored geometry or it is nothing.
 */
import { mat, box } from '../world/build.js';

/** Her left, +x when facing +z — the side the hair comes down. */
export const HAIR_FALL_SIDE = 1;

/**
 * Rebuild the head of a `makePerson` figure as Margo's.
 *
 * Clears every child of the head group — skull, features and whatever hair
 * the builder rolled — and rebuilds the lot, reassigning `parts.mouth` and
 * `parts.eyes` so the behaviour class keeps animating the right meshes.
 *
 * @param {object} parts   the object returned by makePerson via Npc
 * @param {object} o       { skin, hairColour } — her canon colours
 */
export function restyleMargoHead(parts, o = {}) {
  const { skin = 0xd8a878, hairColour = 0x2a1c14 } = o;
  const head = parts.head;

  // Everything goes: the stock face is being replaced, not decorated.
  while (head.children.length) head.remove(head.children[0]);

  const skinMat = mat({ color: skin, roughness: 0.88 });
  const hairMat = mat({ color: hairColour, roughness: 0.98 });
  const browMat = mat({ color: 0x241812, roughness: 0.9 });
  const lashMat = mat({ color: 0x1a1210, roughness: 0.6 });
  const whiteMat = mat({ color: 0xe8e0d4, roughness: 0.45 });
  const irisMat = mat({ color: 0x4a2c18, roughness: 0.3 });
  const pupilMat = mat({ color: 0x100c0a, roughness: 0.3 });
  /* Deeper than they look in the hex: the front table's lamp sits a metre
   * from her face and washes everything two stops paler. */
  const lipMat = mat({ color: 0x8f4a42, roughness: 0.55 });
  const lipUpMat = mat({ color: 0x7e4038, roughness: 0.6 });

  const put = (spec) => {
    const m = box(spec);
    head.add(m);
    return m;
  };

  /* ---- the skull ----
   * Narrower than the stock 0.186 and the front plane sits at z=0.098;
   * every feature below is placed to clear the plane it stands on. */
  put({ name: 'margo.face.neck', size: [0.092, 0.10, 0.098], pos: [0, 0.04, -0.005], mat: skinMat });
  const skull = put({ name: 'margo.face.skull', size: [0.176, 0.212, 0.196], pos: [0, 0.168, 0], mat: skinMat });
  const jaw = put({ name: 'margo.face.jaw', size: [0.134, 0.082, 0.178], pos: [0, 0.112, 0.008], mat: skinMat });
  put({ name: 'margo.face.chin', size: [0.064, 0.046, 0.05], pos: [0, 0.083, 0.085], mat: skinMat });
  for (const sx of [-1, 1]) {
    put({
      name: `margo.face.cheek.${sx < 0 ? 'right' : 'left'}`,
      size: [0.05, 0.05, 0.028], pos: [sx * 0.056, 0.146, 0.088], mat: skinMat,
    });
    put({
      name: `margo.face.ear.${sx < 0 ? 'right' : 'left'}`,
      size: [0.022, 0.05, 0.03], pos: [sx * 0.092, 0.16, -0.01], mat: skinMat,
    });
  }

  /* ---- brows and eyes ---- */
  const eyes = [];
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'right' : 'left';
    // Arched a few degrees, outer end up: attentive, not surprised
    put({
      name: `margo.face.brow.${side}`,
      size: [0.05, 0.011, 0.014], pos: [sx * 0.043, 0.211, 0.099],
      rotZ: -sx * 0.10, mat: browMat,
    });
    put({
      name: `margo.face.lash.${side}`,
      size: [0.046, 0.009, 0.012], pos: [sx * 0.043, 0.196, 0.102], mat: lashMat,
    });
    put({
      name: `margo.face.eye.${side}`,
      size: [0.04, 0.026, 0.012], pos: [sx * 0.043, 0.182, 0.101], mat: whiteMat,
    });
    const iris = put({
      name: `margo.face.iris.${side}`,
      size: [0.019, 0.02, 0.01], pos: [sx * 0.043, 0.181, 0.108], mat: irisMat,
    });
    put({
      name: `margo.face.pupil.${side}`,
      size: [0.008, 0.009, 0.008], pos: [sx * 0.043, 0.181, 0.1125], mat: pupilMat,
    });
    eyes.push(iris);
  }

  /* ---- nose ---- */
  put({ name: 'margo.face.nose.bridge', size: [0.02, 0.042, 0.024], pos: [0, 0.167, 0.104], mat: skinMat });
  put({ name: 'margo.face.nose.tip', size: [0.026, 0.02, 0.03], pos: [0, 0.147, 0.107], mat: skinMat });

  /* ---- mouth ---- */
  put({ name: 'margo.face.lip.upper', size: [0.040, 0.008, 0.013], pos: [0, 0.119, 0.103], mat: lipUpMat });
  const mouth = put({ name: 'margo.face.mouth', size: [0.042, 0.013, 0.015], pos: [0, 0.109, 0.103], mat: lipMat });
  for (const sx of [-1, 1]) {
    put({
      name: `margo.face.lip.corner.${sx < 0 ? 'right' : 'left'}`,
      size: [0.010, 0.008, 0.011], pos: [sx * 0.0245, 0.1135, 0.100],
      rotZ: sx * 0.4, mat: lipMat,
    });
  }

  /* ---- the hair ----
   * Shaped masses, and the whole read is the asymmetry: crown and fringe up
   * top, a tucked panel on her right, and the fall down her left — four
   * masses that start at the crown and end at the collarbone. */
  const F = HAIR_FALL_SIDE;
  put({ name: 'margo.hair.crown', size: [0.19, 0.096, 0.208], pos: [0, 0.252, -0.012], mat: hairMat });
  put({ name: 'margo.hair.crown.dome', size: [0.16, 0.05, 0.18], pos: [0, 0.30, -0.02], mat: hairMat });
  put({ name: 'margo.hair.back', size: [0.182, 0.24, 0.08], pos: [0, 0.10, -0.098], mat: hairMat });
  // The fringe sweeps across the forehead and dips toward the fall side
  put({
    name: 'margo.hair.fringe',
    size: [0.164, 0.052, 0.034], pos: [F * 0.004, 0.248, 0.090],
    rotZ: -F * 0.12, mat: hairMat,
  });
  // Her right: tucked behind the ear, so one ear and the whole cheek show
  put({ name: 'margo.hair.tuck', size: [0.026, 0.15, 0.17], pos: [-F * 0.096, 0.17, -0.015], mat: hairMat });
  put({ name: 'margo.hair.tuck.front', size: [0.02, 0.10, 0.05], pos: [-F * 0.094, 0.13, 0.055], mat: hairMat });
  // Her left: the fall. Temple joins the fringe to the mass; the mass drops
  // past the jaw; a front lock frames the cheek; the end flicks outward.
  put({ name: 'margo.hair.fall.temple', size: [0.03, 0.09, 0.14], pos: [F * 0.092, 0.20, 0.02], mat: hairMat });
  put({
    name: 'margo.hair.fall.main',
    size: [0.052, 0.34, 0.15], pos: [F * 0.108, 0.03, -0.02],
    rotZ: F * 0.05, mat: hairMat,
  });
  put({
    name: 'margo.hair.fall.front',
    size: [0.034, 0.24, 0.055], pos: [F * 0.098, 0.10, 0.070],
    rotZ: F * 0.04, mat: hairMat,
  });
  put({
    name: 'margo.hair.fall.end',
    size: [0.06, 0.09, 0.11], pos: [F * 0.112, -0.16, -0.01],
    rotZ: F * 0.10, mat: hairMat,
  });

  /* ---- hand the animated pieces back ---- */
  head.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = false;
    }
  });
  /* ---- eyelids, for sleep ----
   * Owner, 2026-08-31: *"when she goes to sleep, let's have her actually
   * closing her eyes."* Two skin-toned lids just proud of the pupils
   * (pupil front z 0.1165; lids at 0.119), hidden until a sleeping scene
   * asks. Showing them covers white, iris and pupil in one move without
   * touching the meshes the behaviour class animates. */
  const eyeLids = [];
  for (const sx of [-1, 1]) {
    const lid = put({
      name: `margo.face.eyelid.${sx < 0 ? 'right' : 'left'}`,
      size: [0.044, 0.03, 0.006], pos: [sx * 0.043, 0.182, 0.119], mat: skinMat,
    });
    lid.visible = false;
    eyeLids.push(lid);
  }

  parts.mouth = mouth;
  mouth.userData.base = mouth.scale.clone();
  parts.eyes = eyes;
  parts.eyeLids = eyeLids;
  parts.skull = skull;
  parts.jaw = jaw;
  return parts;
}
