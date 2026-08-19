import * as THREE from 'three';
import { Mouth } from '../../core/mouth.js';

// Shared blocky humanoid for everyone in the scene. Built from primitives with
// named joints so the controllers can pose it: standing, walking, seated,
// talking, leaning, reaching into a jacket, and going down.
//
// Local forward is +Z — the eyes, tie, shirt front and every gesture live on
// the +Z face, same as the game's crowd builder (yaw 0 looks along +Z). That
// is the OPPOSITE of the player's yaw (camera forward is -Z), so the mirror
// body adds pi when it follows the camera. The steering below (lookAt,
// walkTo, the seated legs) aims the +Z face; placements pass yaws in the
// same convention.

function box(w, h, d, color, x = 0, y = 0, z = 0, opts = null) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...(opts || {}) })
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Trim comes in sets — two cuffs, two collar points, a row of buttons — so a
// set is cut from ONE material rather than one material per slab.
function part(w, h, d, mat, x = 0, y = 0, z = 0, rotZ = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.z = rotZ;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// The one round thing on a figure cut from slabs: a button is a disc lying
// against the cloth, which is the same recipe the shared cast uses.
function disc(r, h, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), mat);
  m.position.set(x, y, z);
  m.rotation.x = Math.PI / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A seam, a hem or a stripe is the garment's own cloth under different light,
// never a second colour: positive darkens toward the shadow in the fold,
// negative lifts toward the chalk in the weave.
function shade(color, amount) {
  return new THREE.Color(color)
    .lerp(new THREE.Color(amount < 0 ? 0xffffff : 0x000000), Math.abs(amount))
    .getHex();
}

export const DEFAULTS = {
  coat: 0x1e1f28,
  trouser: null,        // defaults to the coat: a suit whose trousers match
  shirt: 0xe6e2d8,
  tie: 0x5a1e22,
  skin: 0xc79a72,
  hair: 0x2a2018,
  bulk: 1,
  height: 1,
  fur: false,
  // ---- tailoring ----
  // Trim is not free — collar, notches, buttons, pockets, cuffs, hem and
  // waistband are about twenty meshes on a figure. It goes to the men the
  // camera holds on across a table, not to the room behind them.
  trim: false,
  pinstripe: false,     // true chalks the coat's own cloth; a colour overrides
  pocketSquare: false,  // a colour puts one in the breast pocket
  tieBar: false,        // a colour clips a bar across the tie
  belt: false,          // a colour straps a waistband on under the jacket hem
  buckle: 0xb9993f,
  badge: false,         // a colour clips a shield on the belt beside the buckle
  holster: false,       // a colour runs a shoulder strap across the shirt
  // ---- face ----
  iris: 0x3a2a18,       // eye colour, for whoever leans in close
  brow: null,           // defaults to a shade darker than the hair
  browTilt: 0.09,       // radians of arch, outer end up; 0 reads flat
  browHeavy: false,     // thicker, lower brows — the bored-cop look
  lidHeavy: false,      // upper lids drooped over the eye whites
  lipTone: 0x9a6050,    // lip-tone, not lipstick
  hairStyle: 'short',   // 'short' | 'crop'
  temples: null,        // a colour greys the temples (the composed boss look)
};

/**
 * The head, to the game's current character standard (the Bing cast rebuild
 * and Margo, in this scene's own slab language): arched brows, eyes about an
 * eye-width apart with whites, irises and pupils, a two-part nose that stops
 * short of a snout, and a real mouth — an upper lip on the skull and a fuller
 * lower lip riding the jaw so talking reads as a shaped mouth opening.
 *
 * Face meshes are named `sf.face.*` and carry their sizes in userData.dim so
 * the verifier can measure the proportions instead of squinting. Returns the
 * animated pieces: `jaw` (a group the lower lip lives in) and `mouth` (the
 * lower lip itself, opened by scale against userData.base).
 */
export function buildHead(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const b = o.bulk;
  const browColor = o.brow ?? Math.max(0, (o.hair & 0xfefefe) >> 1); // darker than the hair
  const head = new THREE.Group();
  head.name = 'sf.head';

  const put = (name, w, h, d, color, x, y, z, rotZ = 0) => {
    const m = box(w, h, d, color, x, y, z);
    m.name = name;
    m.rotation.z = rotZ;
    m.userData.dim = { w, h, d };
    head.add(m);
    return m;
  };

  // Skull and neck stub. The front plane lands at z=0.112; every feature
  // below is placed to clear the plane it stands on.
  put('sf.face.neck', 0.13 * b, 0.12, 0.13, o.skin, 0, 0.0, -0.01);
  const skull = put('sf.face.skull', 0.26 * b, 0.25, 0.235, o.skin, 0, 0.175, -0.005);
  for (const sx of [-1, 1]) {
    put(`sf.face.ear.${sx < 0 ? 'right' : 'left'}`, 0.024, 0.06, 0.036, o.skin, sx * 0.135 * b, 0.17, -0.015);
  }

  // The jaw is a group so the chin and the lower lip drop with it when he
  // talks. Its rest height is what the talk animation returns to.
  const jaw = new THREE.Group();
  jaw.name = 'sf.face.jaw.pivot';
  jaw.position.set(0, 0.065, 0.008);
  jaw.userData.baseY = jaw.position.y;
  head.add(jaw);
  const jawBox = box(0.2 * b, 0.09, 0.215, o.skin, 0, 0, 0);
  jawBox.name = 'sf.face.jaw';
  jawBox.userData.dim = { w: 0.2 * b, h: 0.09, d: 0.215 };
  jaw.add(jawBox);
  const chin = box(0.09 * b, 0.045, 0.05, o.skin, 0, -0.005, 0.1);
  chin.name = 'sf.face.chin';
  jaw.add(chin);

  // ---- brows and eyes ----
  // Two brows, never a ledge: heavy brows get thicker, not wider, and keep
  // clear skin between them.
  const browH = o.browHeavy ? 0.019 : 0.013;
  const browW = o.browHeavy ? 0.054 : 0.062;
  const browY = o.browHeavy ? 0.234 : 0.244;
  const eyes = [];
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'right' : 'left';
    put(`sf.face.brow.${side}`, browW * b, browH, 0.017, browColor,
      sx * 0.056 * b, browY, 0.118, -sx * o.browTilt);
    put(`sf.face.eye.${side}`, 0.05 * b, 0.028, 0.014, 0xe8e0d4, sx * 0.056 * b, 0.213, 0.1195);
    const iris = put(`sf.face.iris.${side}`, 0.021 * b, 0.021, 0.01, o.iris, sx * 0.056 * b, 0.212, 0.125);
    put(`sf.face.pupil.${side}`, 0.009, 0.01, 0.008, 0x100c0a, sx * 0.056 * b, 0.212, 0.129);
    if (o.lidHeavy) {
      put(`sf.face.lid.${side}`, 0.052 * b, 0.013, 0.016, o.skin, sx * 0.056 * b, 0.2255, 0.1205);
    }
    eyes.push(iris);
  }

  // ---- nose: a bridge and a tip, off the face plane but not a snout ----
  put('sf.face.nose.bridge', 0.026 * b, 0.055, 0.026, o.skin, 0, 0.188, 0.118);
  put('sf.face.nose.tip', 0.034 * b, 0.024, 0.03, o.skin, 0, 0.158, 0.122);

  // ---- mouth: upper lip on the skull, lower lip riding the jaw ----
  put('sf.face.lip.upper', 0.05 * b, 0.009, 0.014, o.lipTone, 0, 0.132, 0.12);
  const mouth = box(0.054 * b, 0.014, 0.016, o.lipTone, 0, 0.054, 0.112);
  mouth.name = 'sf.face.mouth';
  mouth.userData.dim = { w: 0.054 * b, h: 0.014, d: 0.016 };
  mouth.userData.base = { y: mouth.position.y, scaleY: 1 };
  jaw.add(mouth);
  for (const sx of [-1, 1]) {
    const corner = box(0.01, 0.008, 0.012, o.lipTone, sx * 0.03 * b, 0.059, 0.109);
    corner.name = `sf.face.lip.corner.${sx < 0 ? 'right' : 'left'}`;
    corner.rotation.z = sx * 0.35;
    jaw.add(corner);
  }

  // ---- hair ----
  let hair;
  if (o.fur) {
    // A sasquatch does not lose the pelt just because he put on a suit:
    // fur crown, a heavy ridge above the brows, and tufts down the cheeks.
    hair = put('sf.hair.crown', 0.29 * b, 0.08, 0.27, o.hair, 0, 0.325, -0.015);
    put('sf.hair.ridge', 0.15 * b, 0.05, 0.26, o.hair, 0, 0.30, 0.0);
    put('sf.face.brow.ridge', 0.17 * b, 0.032, 0.05, o.hair, 0, 0.262, 0.108);
    put('sf.hair.back', 0.27 * b, 0.22, 0.05, o.hair, 0, 0.17, -0.125);
    for (const sx of [-1, 1]) {
      put(`sf.hair.cheek.${sx < 0 ? 'right' : 'left'}`, 0.035, 0.14, 0.1, o.hair, sx * 0.14 * b, 0.13, 0.02);
    }
  } else if (o.hairStyle === 'crop') {
    // Clipped tight: a low crown, a shadow down the back, thin sides.
    hair = put('sf.hair.crown', 0.27 * b, 0.045, 0.24, o.hair, 0, 0.315, -0.012);
    put('sf.hair.back', 0.265 * b, 0.08, 0.028, o.hair, 0, 0.255, -0.122);
    for (const sx of [-1, 1]) {
      put(`sf.hair.side.${sx < 0 ? 'right' : 'left'}`, 0.02, 0.06, 0.15, o.hair, sx * 0.134 * b, 0.245, -0.025);
    }
  } else {
    // 'short': crown, fringe, back and sides — a barbered head of hair.
    hair = put('sf.hair.crown', 0.28 * b, 0.06, 0.25, o.hair, 0, 0.322, -0.015);
    put('sf.hair.fringe', 0.27 * b, 0.045, 0.032, o.hair, 0, 0.303, 0.104);
    put('sf.hair.back', 0.27 * b, 0.12, 0.035, o.hair, 0, 0.235, -0.122);
    for (const sx of [-1, 1]) {
      put(`sf.hair.side.${sx < 0 ? 'right' : 'left'}`, 0.026, 0.09, 0.17, o.hair, sx * 0.138 * b, 0.24, -0.02);
    }
  }
  if (o.temples && !o.fur) {
    for (const sx of [-1, 1]) {
      put(`sf.hair.temple.${sx < 0 ? 'right' : 'left'}`, 0.024, 0.06, 0.11, o.temples, sx * 0.139 * b, 0.245, 0.035);
    }
  }

  return { group: head, skull, jaw, mouth, eyes, hair };
}

const STAND_PELVIS = 0.92;
const SIT_PELVIS = 0.6;
// Seated, the shin has further to travel to reach the floor from a chair than
// it does when standing; stretching the lower leg keeps both ends in contact.
const SIT_SHIN_STRETCH = 1.2;

export function buildFigure(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const g = new THREE.Group();
  g.name = 'sf.figure';
  const bw = 0.52 * o.bulk;
  const bd = 0.3 * o.bulk;
  const trouser = o.trouser ?? o.coat;
  // The shirt's own front plane. The suit stacks against it in the order a man
  // puts it on — shirt, tie over the shirt, jacket front over the shirt's
  // edges — so nothing on the suit is drawn inside the garment beneath it.
  const suitFront = bd * 0.71;
  // One material per surface the trim is cut from, shared by every piece cut
  // from that surface.
  const trim = o.trim ? {
    linen: new THREE.MeshLambertMaterial({ color: o.shirt }),
    // A collar laid on the shirt front is the same cloth twice, so it only
    // reads as a collar if the top layer is carrying a shadow.
    collar: new THREE.MeshLambertMaterial({ color: shade(o.shirt, 0.16) }),
    silk: new THREE.MeshLambertMaterial({ color: o.tie }),
    seam: new THREE.MeshLambertMaterial({ color: shade(o.coat, 0.32) }),
    horn: new THREE.MeshLambertMaterial({ color: shade(o.coat, 0.66) }),
  } : null;

  // `root` tips the whole body in the character's own frame — used for falling.
  const root = new THREE.Group();
  root.name = 'sf.root';
  g.add(root);

  const pelvis = new THREE.Group();
  pelvis.name = 'sf.pelvis';
  pelvis.position.y = STAND_PELVIS;
  root.add(pelvis);
  const pelvisCoat = box(bw * 0.92, 0.2, bd, trouser, 0, -0.04, 0);
  pelvisCoat.name = 'sf.pelvis.coat';
  pelvis.add(pelvisCoat);

  // ---- Waistband: the join between the jacket and the trousers, low enough
  // on the hip that the jacket hem clears it instead of swallowing it.
  if (o.belt) {
    const strapMat = new THREE.MeshLambertMaterial({ color: o.belt });
    const beltY = 0.005;
    const strap = part(bw * 0.94, 0.046, bd * 1.02, strapMat, 0, beltY, 0);
    strap.name = 'sf.pelvis.belt.strap';
    const buckle = part(0.062, 0.05, 0.016, new THREE.MeshLambertMaterial({ color: o.buckle }),
      0, beltY, bd * 0.52);
    buckle.name = 'sf.pelvis.belt.buckle';
    const tongue = part(0.011, 0.03, 0.008, strapMat, 0, beltY, bd * 0.55);
    tongue.name = 'sf.pelvis.belt.tongue';
    pelvis.add(strap, buckle, tongue);
    // The shield rides the belt beside the buckle, on the hip a right hand
    // clears — clipped on and standing a centimetre off the strap, not a
    // decal and not a billboard.
    if (o.badge) {
      const shieldMat = new THREE.MeshLambertMaterial({ color: o.badge });
      const shield = part(0.04, 0.036, 0.012, shieldMat, -bw * 0.17, beltY + 0.008, bd * 0.51);
      shield.name = 'sf.pelvis.belt.badge';
      const point = part(0.026, 0.026, 0.011, shieldMat,
        -bw * 0.17, beltY - 0.012, bd * 0.51, Math.PI / 4);
      point.name = 'sf.pelvis.belt.badge.point';
      pelvis.add(shield, point);
    }
  }

  // ---- Legs: hip pivot → thigh → knee pivot → shin → shoe
  function leg(side) {
    const sideName = side < 0 ? 'left' : 'right';
    const hip = new THREE.Group();
    hip.name = `sf.leg.${sideName}.hip`;
    hip.position.set(side * 0.15 * o.bulk, -0.1, 0);
    pelvis.add(hip);
    const thigh = box(0.2 * o.bulk, 0.4, 0.21, trouser, 0, -0.2, 0);
    thigh.name = `sf.leg.${sideName}.thigh`;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.name = `sf.leg.${sideName}.knee`;
    knee.position.set(0, -0.4, 0);
    hip.add(knee);
    const shin = box(0.18 * o.bulk, 0.37, 0.19, trouser, 0, -0.185, 0);
    shin.name = `sf.leg.${sideName}.shin`;
    knee.add(shin);
    const shoe = box(0.19 * o.bulk, 0.1, 0.3, 0x14141a, 0, -0.37, 0.06);
    shoe.name = `sf.leg.${sideName}.shoe`;
    knee.add(shoe); // toes on the face side
    return { hip, knee };
  }
  const legL = leg(-1);
  const legR = leg(1);

  // ---- Torso
  const torso = new THREE.Group();
  torso.name = 'sf.torso';
  torso.position.set(0, 0.04, 0);
  pelvis.add(torso);

  // Pivot the complete fitted suit at the chest centre. Breathing this one
  // rig preserves the original coat motion while the shirt, tie and lapels
  // remain registered to it instead of hovering as static torso siblings.
  const torsoGarments = new THREE.Group();
  torsoGarments.name = 'sf.torso.garments';
  torsoGarments.position.y = 0.31 * o.height;
  torso.add(torsoGarments);

  const chest = box(bw, 0.62 * o.height, bd, o.coat);
  chest.name = 'sf.torso.chest';
  torsoGarments.add(chest);
  const shirt = box(
    bw * 0.44, 0.5 * o.height, bd * 0.62, o.shirt,
    0, 0.03 * o.height, bd * 0.4,
  );
  shirt.name = 'sf.torso.shirt';
  torsoGarments.add(shirt);
  // Proud of the shirt rather than inside it: a tie drawn behind the shirt
  // front is a tie nobody in the restaurant will ever see.
  const tie = box(
    bw * 0.13, 0.4 * o.height, 0.03, o.tie,
    0, -0.01 * o.height, suitFront - 0.008,
  );
  tie.name = 'sf.torso.tie';
  torsoGarments.add(tie);
  const lapels = [];
  for (const sx of [-1, 1]) {
    // The jacket front closes over the shirt's edges, which is what narrows
    // the visible shirt to a V instead of a bib.
    const lapel = box(
      bw * 0.2, 0.4 * o.height, 0.06, o.coat,
      sx * bw * 0.24, 0.05 * o.height, suitFront - 0.026,
    );
    lapel.name = `sf.torso.lapel.${sx < 0 ? 'left' : 'right'}`;
    torsoGarments.add(lapel);
    lapels.push(lapel);
  }
  const [lapelL, lapelR] = lapels;
  const shoulderBar = box(
    bw * 1.18, 0.16, bd * 1.05, o.coat,
    0, 0.29 * o.height, 0,
  );
  shoulderBar.name = 'sf.torso.shoulders';
  torsoGarments.add(shoulderBar);

  // ---- What a suit reads by at conversation distance: a notched lapel, a
  // collar with a knotted tie in it, buttons on the closing edge, a breast
  // pocket, and a hem that ends the jacket instead of letting it run into the
  // trousers. All of it hangs on the breathing garment rig with the coat.
  if (trim) {
    const collar = part(bw * 0.44, 0.042, bd * 0.72, trim.collar, 0, 0.298 * o.height, bd * 0.26);
    collar.name = 'sf.torso.collar.stand';
    const knot = part(bw * 0.17, 0.052, 0.038, trim.silk, 0, 0.212 * o.height, suitFront - 0.004);
    knot.name = 'sf.torso.tie.knot';
    const tip = part(bw * 0.16, 0.052, 0.028, trim.silk, 0, -0.203 * o.height, suitFront - 0.006);
    tip.name = 'sf.torso.tie.tip';
    const hem = part(bw * 1.01, 0.034, bd * 1.02, trim.seam, 0, -0.30 * o.height, 0);
    hem.name = 'sf.torso.jacket.hem';
    const welt = part(bw * 0.18, 0.016, 0.012, trim.seam, bw * 0.38, 0.115 * o.height, bd * 0.5 + 0.008);
    welt.name = 'sf.torso.pocket.welt';
    torsoGarments.add(collar, knot, tip, hem, welt);

    for (const sx of [-1, 1]) {
      const side = sx < 0 ? 'left' : 'right';
      const point = part(bw * 0.14, 0.082, 0.022, trim.collar,
        sx * bw * 0.115, 0.252 * o.height, suitFront - 0.006, sx * 0.34);
      point.name = `sf.torso.collar.point.${side}`;
      // The notch: a short wing off the top of the lapel toward the shoulder
      // seam, which is the step that separates a lapel from a slab of coat.
      const notch = part(bw * 0.16, 0.052, 0.058, trim.seam,
        sx * bw * 0.305, 0.238 * o.height, suitFront - 0.03, -sx * 0.4);
      notch.name = `sf.torso.lapel.notch.${side}`;
      // The roll line, kept clear of the shirt so it draws the jacket's own
      // edge rather than a stripe down the shirt front.
      const roll = part(0.014, 0.3 * o.height, 0.062, trim.seam,
        sx * bw * 0.245, 0.05 * o.height, suitFront - 0.024);
      roll.name = `sf.torso.lapel.roll.${side}`;
      torsoGarments.add(point, notch, roll);
    }

    // Buttons on the closing edge, on his left — the figure faces +Z, so his
    // left hand is on +X and a man's jacket buttons go with it.
    for (const by of [-0.03, -0.115]) {
      const button = disc(0.011, 0.006, trim.horn,
        bw * 0.245, by * o.height, suitFront + 0.008);
      button.name = 'sf.torso.jacket.button';
      torsoGarments.add(button);
    }

    if (o.pinstripe) {
      // Chalk stripe on the coat the jacket actually shows: the middle of the
      // chest is shirt and lapel, so a stripe there is a stripe nobody sees.
      const stripeMat = new THREE.MeshLambertMaterial({
        color: o.pinstripe === true ? shade(o.coat, -0.3) : o.pinstripe,
      });
      for (const sx of [-0.455, -0.375, 0.375, 0.455]) {
        const stripe = part(0.008, 0.44 * o.height, 0.008, stripeMat,
          sx * bw, 0, bd * 0.5 + 0.004);
        stripe.name = 'sf.torso.pinstripe';
        torsoGarments.add(stripe);
      }
    }
    if (o.pocketSquare) {
      const square = part(bw * 0.13, 0.026, 0.014,
        new THREE.MeshLambertMaterial({ color: o.pocketSquare }),
        bw * 0.38, 0.132 * o.height, bd * 0.5 + 0.012);
      square.name = 'sf.torso.pocket-square';
      torsoGarments.add(square);
    }
    if (o.tieBar) {
      const bar = part(bw * 0.19, 0.014, 0.016,
        new THREE.MeshLambertMaterial({ color: o.tieBar }),
        0, 0.06 * o.height, suitFront + 0.006);
      bar.name = 'sf.torso.tie.bar';
      torsoGarments.add(bar);
    }
    if (o.holster) {
      // Over the right shoulder and down under the jacket front, which is the
      // way the strap runs on a man who draws with his right hand. Kept off
      // the tie: a strap across the knot is a seatbelt, not a holster.
      const strap = part(0.034, 0.3 * o.height, 0.018,
        new THREE.MeshLambertMaterial({ color: o.holster }),
        -bw * 0.155, 0.12 * o.height, suitFront + 0.004, 0.2);
      strap.name = 'sf.torso.holster.strap';
      torsoGarments.add(strap);
    }
  }

  // ---- Head
  const neck = new THREE.Group();
  neck.name = 'sf.neck';
  neck.position.set(0, 0.68 * o.height, 0);
  torso.add(neck);
  const headKit = buildHead(o);
  neck.add(headKit.group);
  const { jaw, mouth, hair, eyes } = headKit;

  // ---- Arms
  function arm(side) {
    const sideName = side < 0 ? 'left' : 'right';
    const shoulder = new THREE.Group();
    shoulder.name = `sf.arm.${sideName}.shoulder`;
    shoulder.position.set(side * bw * 0.62, 0.55 * o.height, 0);
    torso.add(shoulder);
    const upperSleeve = box(0.15 * o.bulk, 0.34, 0.16, o.coat, 0, -0.17, 0);
    upperSleeve.name = `sf.arm.${sideName}.sleeve.upper`;
    shoulder.add(upperSleeve);
    const elbow = new THREE.Group();
    elbow.name = `sf.arm.${sideName}.elbow`;
    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);
    const forearmSleeve = box(0.13 * o.bulk, 0.32, 0.14, o.coat, 0, -0.16, 0);
    forearmSleeve.name = `sf.arm.${sideName}.sleeve.forearm`;
    elbow.add(forearmSleeve);
    const hand = box(0.13, 0.13, 0.15, o.skin, 0, -0.36, 0.02);
    hand.name = `sf.arm.${sideName}.hand`;
    elbow.add(hand);
    if (trim) {
      // A turnback at the end of the sleeve with a sliver of shirt cuff below
      // it — the wrist is where a suit either finishes or stops.
      const cuff = part(0.142 * o.bulk, 0.052, 0.152, trim.seam, 0, -0.276, 0);
      cuff.name = `sf.arm.${sideName}.cuff.coat`;
      const linen = part(0.133 * o.bulk, 0.032, 0.143, trim.linen, 0, -0.318, 0);
      linen.name = `sf.arm.${sideName}.cuff.shirt`;
      elbow.add(cuff, linen);
    }
    return { shoulder, elbow, hand };
  }
  const armL = arm(-1);
  const armR = arm(1);

  return {
    group: g, root, pelvis, torso, torsoGarments, neck, jaw, mouth, hair, eyes,
    head: headKit.group, chest, shirt, tie, lapelL, lapelR, shoulderBar,
    legL, legR, armL, armR,
  };
}

// Per-frame behaviour shared by everyone: breathing, talking, gestures,
// walking, and the two-stage hit → down.
export class Figure {
  constructor(opts = {}) {
    Object.assign(this, buildFigure(opts));
    this.t = Math.random() * 10;
    this.talkT = 0;
    /* The mouth, driven by the voice rather than by a clock -- one shared
     * implementation for the whole game (src/core/mouth.js). The numbers
     * reproduce the old `1 + j * 2.4` lip and `baseY - j * 0.038` jaw drop
     * exactly, so nobody's face changes shape; only what decides WHEN it
     * opens has moved. */
    this.voiceMouth = new Mouth(
      { mouth: this.mouth, jaw: this.jaw },
      { openScale: 2.4, jawDrop: 0.038, sink: 0.007 },
    );
    this.lean = 0;
    this.leanTarget = 0;
    this.gesture = null;
    this.gestureT = 0;
    this.neckTarget = 0;
    this.seated = false;
    this.down = false;
    this.deathT = 0;
    this.hitT = 0;
    this.walkT = 0;
    this.walkAmt = 0;
    this.setPose('stand');
  }

  place(x, z, facing) {
    this.group.position.set(x, 0.005, z);
    this.group.rotation.y = facing;
  }

  setPose(pose) {
    this.seated = pose === 'sit';
    if (this.seated) {
      this.pelvis.position.y = SIT_PELVIS;
      // Thighs swing up toward +Z — the knees end up under whatever the face
      // is pointed at, not poking out through the chair back.
      this.legL.hip.rotation.x = this.legR.hip.rotation.x = -Math.PI / 2;
      this.legL.knee.rotation.x = this.legR.knee.rotation.x = Math.PI / 2;
      this.legL.knee.scale.y = this.legR.knee.scale.y = SIT_SHIN_STRETCH;
      this.armL.shoulder.rotation.x = this.armR.shoulder.rotation.x = 0.35;
      this.armL.elbow.rotation.x = this.armR.elbow.rotation.x = -1.25;
    } else {
      this.pelvis.position.y = STAND_PELVIS;
      this.legL.hip.rotation.x = this.legR.hip.rotation.x = 0;
      this.legL.knee.rotation.x = this.legR.knee.rotation.x = 0;
      this.legL.knee.scale.y = this.legR.knee.scale.y = 1;
      this.armL.shoulder.rotation.x = this.armR.shoulder.rotation.x = 0.08;
      this.armL.elbow.rotation.x = this.armR.elbow.rotation.x = -0.22;
    }
  }

  /**
   * @param {number} dur how long the head/gesture beat holds — and, with no
   *   recording, how long the mouth keeps working.
   * @param {object} [take] `{ source, analyser }` from the scene's own voice
   *   chain (squatchfather/audio/core.js `voiceTap()`), so the mouth runs on
   *   the take and stops when it stops, cut or finished.
   */
  speak(dur, take = null) {
    this.talkT = dur;
    this.voiceMouth.speak({ seconds: dur, ...(take || {}) });
  }

  /** Cut the line: the mouth shuts whatever the subtitle is still doing. */
  hush() {
    this.talkT = 0;
    this.voiceMouth.stop();
  }
  leanForward(on) { this.leanTarget = on ? 0.3 : 0; }
  playGesture(name, dur = 1.8) { this.gesture = name; this.gestureT = dur; }
  hit() { this.hitT = 0.22; this.gestureT = 0; this.talkT = 0; }

  // One transition point for deaths and checkpoint resets. Both directions
  // leave the garment rig neutral; living updates may resume breathing on
  // the next frame, while down updates keep it frozen there.
  setDown(down) {
    this.down = Boolean(down);
    this.torsoGarments.scale.set(1, 1, 1);
  }

  // Down on the floor, knees up, arms wrapped over the head, shaking — and
  // held there. Eases in from WHATEVER pose he was in (seated diners slide
  // off their chairs), so there is no snap to standing first.
  startCower() {
    this.cowering = true;
    this.gesture = null;
    this.gestureT = 0;
    this.talkT = 0;
    this.leanTarget = 0;
    this.seated = false;
  }

  stopCower() {
    if (!this.cowering) return;
    this.cowering = false;
    this.torso.rotation.x = 0;
    this.neck.rotation.x = 0;
    this.armL.shoulder.rotation.z = 0;
    this.armR.shoulder.rotation.z = 0;
    this.setPose('stand');
  }

  #cowerPose(dt) {
    const k = Math.min(1, dt * 3.2);
    // Two incommensurate sines so the shake never settles into a metronome.
    const tr = Math.sin(this.t * 23) * 0.02 + Math.sin(this.t * 31.7) * 0.013;
    const to = (obj, prop, target) => { obj[prop] += (target - obj[prop]) * k; };
    to(this.pelvis.position, 'y', STAND_PELVIS - 0.44 + tr * 0.1);
    to(this.legL.hip.rotation, 'x', -1.85);
    to(this.legR.hip.rotation, 'x', -1.8);
    this.legL.knee.scale.y = this.legR.knee.scale.y = 1;
    to(this.legL.knee.rotation, 'x', 2.1);
    to(this.legR.knee.rotation, 'x', 2.05);
    to(this.torso.rotation, 'x', 0.72 + tr);
    to(this.neck.rotation, 'x', 0.55);
    to(this.neck.rotation, 'y', 0);
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]]) {
      to(arm.shoulder.rotation, 'x', -2.5 + tr * 2);
      to(arm.shoulder.rotation, 'z', -side * 0.5); // elbows flared out
      to(arm.elbow.rotation, 'x', -1.9);
    }
  }

  // Yaw the head toward a world point, clamped so nobody's neck snaps around.
  lookAt(target) {
    if (this.down) return;
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    // The face is on +Z, so the yaw that meets the target is atan2(dx, dz).
    const want = Math.atan2(dx, dz) - this.group.rotation.y;
    let a = ((want + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.neckTarget = Math.max(-1.0, Math.min(1.0, a));
  }

  // Walk toward a point; returns true once it arrives.
  walkTo(x, z, dt, speed = 1.5, faceTarget = true) {
    const dx = x - this.group.position.x;
    const dz = z - this.group.position.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, speed * dt);
    // Snap on the last step so a long frame can't overshoot and orbit forever
    if (d < 0.08 || d <= speed * dt) {
      this.group.position.x = x;
      this.group.position.z = z;
      this.walkAmt += (0 - this.walkAmt) * Math.min(1, dt * 8);
      return true;
    }
    this.group.position.x += (dx / d) * step;
    this.group.position.z += (dz / d) * step;
    if (faceTarget) {
      const want = Math.atan2(dx, dz); // face (+Z) leads the walk
      let diff = ((want - this.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.group.rotation.y += diff * Math.min(1, dt * 6);
    }
    this.walkT += dt * speed * 3.4;
    this.walkAmt += (1 - this.walkAmt) * Math.min(1, dt * 8);
    return false;
  }

  update(dt) {
    if (this.down) {
      this.torsoGarments.scale.set(1, 1, 1);
      this.deathT += dt;
      return; // controllers drive their own collapse
    }

    this.t += dt;
    const breathe = Math.sin(this.t * 1.6) * 0.012;
    this.torsoGarments.scale.set(1, 1 + breathe, 1 + breathe * 0.6);

    if (this.hitT > 0) {
      this.hitT -= dt;
      const k = Math.sin(((0.22 - this.hitT) / 0.22) * Math.PI);
      this.torso.rotation.x = -0.45 * k;
      this.neck.rotation.x = -0.3 * k;
      return;
    }
    if (this.cowering) {
      this.#cowerPose(dt);
      return;
    }

    /* A shaped mouth, not a slab on a hinge: the jaw (chin + lower lip) drops
     * and the lower lip opens tall against its base. It used to be
     * `|sin(t*16)|*0.7 + |sin(t*9.3)|*0.3` held for a guessed number of
     * seconds — two sines so the flap never looped, which is the tell that it
     * was never connected to anything. It runs on the take now. */
    this.voiceMouth.update(dt);
    if (this.talkT > 0) {
      this.talkT -= dt;
      this.neck.rotation.x = Math.sin(this.t * 3.1) * 0.05;
    } else {
      this.neck.rotation.x += (0 - this.neck.rotation.x) * Math.min(1, dt * 6);
    }
    this.neck.rotation.y += (this.neckTarget - this.neck.rotation.y) * Math.min(1, dt * 4);

    this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 3);
    this.torso.rotation.x = this.lean;
    this.torso.position.z = this.lean * -0.1;

    if (this.gestureT > 0) {
      this.gestureT -= dt;
      this.#applyGesture(dt);
    } else if (this.seated) {
      this.#relaxSeated(dt);
    }

    if (!this.seated) this.#walkPose(dt);
  }

  #walkPose(dt) {
    const s = Math.sin(this.walkT) * this.walkAmt;
    const c = Math.sin(this.walkT + Math.PI) * this.walkAmt;
    // Strides mirror the sit pose: negative hip x swings a leg toward the +Z
    // face, and the trailing knee folds the shin back behind it.
    this.legL.hip.rotation.x = -s * 0.55;
    this.legR.hip.rotation.x = -c * 0.55;
    this.legL.knee.rotation.x = Math.max(0, -s) * 0.75;
    this.legR.knee.rotation.x = Math.max(0, -c) * 0.75;
    if (this.gestureT <= 0) {
      const k = Math.min(1, dt * 6);
      this.armL.shoulder.rotation.x += (0.08 - c * 0.35 - this.armL.shoulder.rotation.x) * k;
      this.armR.shoulder.rotation.x += (0.08 - s * 0.35 - this.armR.shoulder.rotation.x) * k;
      this.armL.elbow.rotation.x += (-0.22 - this.armL.elbow.rotation.x) * k;
      this.armR.elbow.rotation.x += (-0.22 - this.armR.elbow.rotation.x) * k;
    }
    this.pelvis.position.y = STAND_PELVIS + Math.abs(s) * 0.03;
  }

  #relaxSeated(dt) {
    const k = Math.min(1, dt * 5);
    const idle = Math.sin(this.t * 0.8) * 0.03;
    for (const a of [this.armL, this.armR]) {
      a.shoulder.rotation.x += (0.35 + idle - a.shoulder.rotation.x) * k;
      a.shoulder.rotation.z += (0 - a.shoulder.rotation.z) * k;
      a.elbow.rotation.x += (-1.25 - a.elbow.rotation.x) * k;
    }
  }

  #applyGesture(dt) {
    const k = Math.min(1, dt * 7);
    const p = Math.sin(this.t * 5);
    const set = (arm, sx, sz, ex) => {
      arm.shoulder.rotation.x += (sx - arm.shoulder.rotation.x) * k;
      arm.shoulder.rotation.z += (sz - arm.shoulder.rotation.z) * k;
      arm.elbow.rotation.x += (ex - arm.elbow.rotation.x) * k;
    };
    switch (this.gesture) {
      case 'shrug': set(this.armL, 0.5, -0.55, -1.0); set(this.armR, 0.5, 0.55, -1.0); break;
      case 'hands': set(this.armL, 0.55 + p * 0.12, -0.3, -1.35); set(this.armR, 0.55 - p * 0.12, 0.3, -1.35); break;
      case 'drink': set(this.armR, 0.15, 0.1, -2.3); set(this.armL, 0.35, 0, -1.25); break;
      case 'eat': set(this.armR, 0.3 + p * 0.18, 0.05, -1.9 - p * 0.2); set(this.armL, 0.4, 0, -1.2); break;
      case 'point': set(this.armR, 0.85, 0.1, -0.45); set(this.armL, 0.35, 0, -1.25); break;
      case 'reach': set(this.armR, 0.25, -0.8, -2.1); set(this.armL, 0.35, 0, -1.25); break;
      case 'open': set(this.armR, 1.15, 0.15, -0.35); set(this.armL, 0.08, 0, -0.22); break;
      default: break;
    }
  }
}
