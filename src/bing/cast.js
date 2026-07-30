/**
 * Everyone in the Bing.
 *
 * They are people. The sasquatch is the club's mark -- it is on the sign, on
 * the machine, on the bandana half the crew wear -- but the Silver Sasquatches
 * are men and women who drink here, work here, and in Lou's case run the place
 * from a back room with a desk lamp on.
 *
 * One human figure, built from the same primitives as everything else, dressed
 * a dozen ways and driven at three levels of effort:
 *
 *   hero       - Lou, the bouncer, the bartender, the dealer, the guards.
 *                Full animation, gaze tracking, dialogue states.
 *   ambient    - patrons and staff. A short behaviour loop at 20Hz.
 *   background - the far end of the room, updated every sixth frame.
 *
 * Proportions are real ones: 1.78m to the top of the head, eyes at 1.66, which
 * is exactly where the player's camera sits. Standing in front of somebody in
 * here should feel like standing in front of somebody.
 */
import * as THREE from 'three';
import { mat, box, sphere, cylinder, group } from '../world/build.js';
import { rand, pick } from './kit.js';

/* Photo faces, the way the Initiation does them: one image on the front of a
 * box skull, the other five faces plain. Cached because Lou turns up in more
 * than one scene and the texture should be fetched once.
 *
 * The Initiation keeps its own copy of this in src/core/person.js on purpose --
 * CHARACTER-ALIGNMENT.md freezes that scene's runtime until its playtest, so
 * nothing here reaches into it. */
/* A snapshot is not a face texture: it arrives with a room behind it, and
 * mapped straight onto a head the wall and the window come too, so the man
 * reads as a photograph on a stick rather than as somebody sitting there.
 * The crop pulls the frame in to the head itself -- [u, v, width, height] in
 * texture space, v measured from the bottom. The default suits a phone
 * portrait held at arm's length, which is what these all are. */
const FACE_CROP = [0.20, 0.06, 0.60, 0.86];

const faceTexCache = new Map();
function faceTexture(url, crop) {
  const key = `${url}|${crop.join(',')}`;
  if (!faceTexCache.has(key)) {
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.offset.set(crop[0], crop[1]);
    tex.repeat.set(crop[2], crop[3]);
    faceTexCache.set(key, tex);
  }
  return faceTexCache.get(key);
}

const SKINS = [0xd9a97f, 0xc08a5e, 0xe8c39c, 0x8d5a3a, 0xf0cba6, 0x6f4529];
const HAIRS = [0x2a1c14, 0x14100e, 0x5a3a20, 0x8a7a5a, 0x9a9a9a, 0x4a2a18];
const SHIRTS = [0x2a2f3a, 0x3a2a2a, 0x1f2b22, 0x2e2438, 0x3a3320, 0x24303a, 0x6a5a3a];
const TRACKSUITS = [0x1c2f4a, 0x3a1c2a, 0x1f3a2a, 0x2a2a1c];
const BANDANA = 0xd92e2e;

/**
 * One person.
 *
 * Built to real proportions, because this is the first level with anybody
 * else in it and a figure that is off by 20% reads as a mannequin from across
 * a room. Seven and a half heads tall, shoulders about a quarter of the
 * height across, elbows at the navel, fingertips at mid-thigh, and a neck.
 * `build` thickens the body without widening the frame -- Lou is a big man,
 * not a big doorway.
 *
 * ---- On the blocky silhouette ----
 *
 * The body is cut from slabs, not balls. It used to be spheres and tapered
 * cylinders, and stacked spheres read from across a room as a column of
 * balloons rather than a torso -- the ribcage, waist and hips each caught
 * their own highlight and the join between them showed. The Squatchfather's
 * `characters/Figure.js` had already solved this with flat boxes, so this
 * builder was brought over to the same language: square limbs, a chest that
 * is one shape, a head with a flat front. The measurements did not move --
 * every joint sits exactly where it sat, so seat drops, gaits and the
 * animation timings above are untouched -- only the primitive changed.
 *
 * Curves are the exception and they are deliberate: the performers' figures
 * stay rounded, because that is the one place on this roster where the
 * silhouette is the point.
 *
 * @param {object} o
 *   height   metres to the top of the head (1.78 is the default adult)
 *   build    1.0 average, 1.4 is Lou
 *   dress    'suit' | 'shirt' | 'tracksuit' | 'tee' | 'waistcoat' | 'bikini' | 'work'
 *            | 'chef' | 'porter' | 'gown'
 *   hair     'short' | 'crop' | 'receding' | 'bald' | 'long' | 'tied'
 *   bandana  club colours, worn by the crew and the prospect
 *   face     image URL painted on the front of the skull, the way the
 *            Initiation gives the Circle their real faces. A photo brings its
 *            own hair, eyes and mouth, so the procedural ones stand down.
 */
export function makePerson(o = {}) {
  const {
    height = 1.78, build = 1, dress = 'shirt', hair = 'short',
    skin = pick(SKINS), hairColour = pick(HAIRS), shirt = pick(SHIRTS),
    bandana = false, chain = false, beard = false, glasses = false,
    gender = 'unspecified', bodyShape = 'average', adult = true,
    castShadow = true, face = null, faceCrop = FACE_CROP,
  } = o;

  /* Matte almost everywhere. The Squatchfather's cast is lit with Lambert and
   * has no specular at all; the club runs a standard material because its
   * lights need it, so the next best thing is to take the shine off. Skin that
   * catches a highlight on a sphere looks wet on a slab. */
  const skinMat = mat({ color: skin, roughness: 0.88 });
  const hairMat = mat({ color: hairColour, roughness: 0.98 });
  const performanceWear = dress === 'bikini';
  const cloth = mat({
    // Chef's whites are whites whatever colour the rest of the roster rolled.
    color: dress === 'chef' ? 0xe8e6e0 : shirt,
    // Stage costume catches the light, but it is fabric, not latex: too low a
    // roughness and the highlight rolls across it like it is wet.
    roughness: performanceWear ? 0.52 : 0.9,
    metalness: performanceWear ? 0.18 : 0,
  });
  const jacketColour = dress === 'suit' ? 0x1b1b22 : shirt;
  const jacket = mat({ color: jacketColour, roughness: 0.88 });
  const trousers = performanceWear
    ? skinMat
    : mat({
      color: dress === 'suit' ? 0x1b1b22 : dress === 'tracksuit' ? shirt : 0x232631,
      roughness: 0.92,
    });
  const shoe = mat({ color: 0x14141a, roughness: 0.5 });
  /* Sleeves: a tee, a bikini, a porter's vest and a gown leave the arms bare,
   * everything else covers them, and a waistcoat is a shirt with something
   * over the chest. */
  const sleeve = dress === 'tee' || performanceWear
    || dress === 'porter' || dress === 'gown'
    ? skinMat
    : (dress === 'suit' || dress === 'tracksuit' ? jacket : cloth);
  /* Whites, aprons and a gown, for the Silver Room. Kept in this builder rather
   * than a second one: the supper club needs a dozen jobs the Bing does not
   * have, and every one of them is this body with something tied over it. */
  const whites = mat({ color: 0xe8e6e0, roughness: 0.94 });
  const apronMat = mat({ color: dress === 'porter' ? 0x4a4a52 : 0xd8d5cc, roughness: 0.96 });

  const g = group('person');
  const body = group('body');
  g.add(body);

  /* Everything below is in metres on a 1.78m frame; `g.scale` handles the
   * rest, so `height` means height. `t` thickens with build; the frame does
   * not, or a heavy man ends up shaped like a wardrobe. */
  const curvy = bodyShape === 'curvy';
  const female = gender === 'female';
  /* The performer figure. Gated on the bikini rather than on `curvy` alone,
   * so the Silver Room's curvy women in shirts and gowns -- Margo among them
   * -- keep their own proportions. The character bible is explicit that this
   * presentation belongs to the stage roles and must not leak. */
  const showgirl = female && curvy && performanceWear && adult;
  const t = 0.55 + build * 0.45;          // 1.0 at build 1
  // Shoulders carry the blocky read, so they sit a little wider than the old
  // rounded frame -- still narrower than the chest is deep is wide.
  const SH = (female ? 0.193 : 0.226) * (0.85 + build * 0.15); // half shoulder width
  const D = (curvy ? 0.145 : 0.135) * t;                       // half chest depth

  /* ---- legs ----
   * Slab thigh, slab shin, a knee block between them, and a shoe that is a
   * wedge rather than a lozenge. The pivots and lengths are the old ones to
   * the centimetre: `Npc.sit()` drops the body 0.42 and folds these joints,
   * and the seated pose is measured against the floor. */
  function leg(side) {
    const pivot = group('leg');
    // A little more daylight between the legs than the rounded frame had, or
    // two slabs this close read as one column with a seam down it.
    pivot.position.set(side * (curvy ? 0.118 : 0.108) * t, 0.90, 0);
    pivot.add(box({ size: [0.175 * t, 0.44, 0.205 * t], pos: [0, -0.22, 0], mat: trousers }));
    const shin = group('shin');
    shin.position.set(0, -0.44, 0);
    shin.add(box({ size: [0.158 * t, 0.11, 0.188 * t], pos: [0, 0, 0], mat: trousers }));
    shin.add(box({ size: [0.15 * t, 0.42, 0.175 * t], pos: [0, -0.21, 0], mat: trousers }));
    shin.add(box({ size: [0.135, 0.068, 0.29], pos: [0, -0.436, 0.05], mat: shoe }));
    shin.add(box({ size: [0.135, 0.056, 0.08], pos: [0, -0.432, -0.078], mat: shoe }));
    pivot.add(shin);
    return pivot;
  }
  const legL = leg(-1);
  const legR = leg(1);
  g.add(legL, legR);

  /* ---- torso ----
   * Pelvis, waist and chest are three slabs that taper into each other, so
   * the whole trunk reads as one solid shape with a waist cut into it rather
   * than as separate lumps. The performers get the hips and the chest pushed
   * out; nobody else does. */
  const hipHalf = (curvy ? 0.205 : 0.155) * t
    * (build > 1.15 ? 1.06 : 1) * (showgirl ? 1.08 : 1);
  const hips = box({
    size: [hipHalf * 2, (curvy ? 0.14 : 0.105) * 2, (curvy ? D * 1.08 : D * 0.94) * 2],
    pos: [0, 1.0, 0],
    /* On a performer the pelvis is her, not the costume -- the bikini is the
     * band and the panels below. Colouring the whole pelvis block made the
     * bottom half one magenta box from thigh to navel. */
    mat: performanceWear ? skinMat : trousers,
  });
  body.add(hips);
  const waist = box({
    size: [
      // Close to the chest on a man so the trunk is one shape; cut in on a
      // woman, where the waist is the line the rest of the figure works from.
      (curvy ? 0.144 : 0.164) * t * (showgirl ? 0.86 : 1) * 2,
      0.135 * 2,
      D * 0.9 * 2,
    ],
    pos: [0, 1.15, 0],
    mat: performanceWear ? skinMat : (dress === 'suit' ? jacket : cloth),
  });
  body.add(waist);
  /* A big man is big at the middle, not at the shoulders. Anything over about
   * 1.15 build gets a front on him, which is most of what makes Lou Lou. */
  if (build > 1.15) {
    const heavy = (build - 1) * 0.9;
    // Wide and shallow, sunk into the torso: a front, not a beach ball
    body.add(box({
      size: [0.37 * t, 0.27 * t, 0.21 * t],
      pos: [0, 1.18, D * (0.45 + heavy * 0.2)], mat: dress === 'suit' ? jacket : cloth,
    }));
    // The shirt hangs over the belt, so the lower half is still shirt
    body.add(box({
      size: [0.33 * t, 0.20 * t, 0.18 * t],
      pos: [0, 1.05, D * (0.3 + heavy * 0.2)], mat: dress === 'suit' ? jacket : cloth,
    }));
  }
  /* The ribcage stops above the navel rather than running down to the hips.
   * A chest slab that reaches the waistband hides the waist behind it and the
   * whole figure goes rectangular -- which is what it did on the first pass,
   * most obviously on the dancers. */
  const torso = box({
    size: [(curvy ? 0.192 : 0.188) * t * 2, 0.16 * 2, D * 2],
    pos: [0, 1.365, 0],
    mat: performanceWear ? skinMat : cloth,
  });
  body.add(torso);
  // Shoulders: a slab the width of the frame, capped with square deltoids
  body.add(box({ size: [SH * 2.04, 0.13, D * 2.0], pos: [0, 1.465, 0], mat: dress === 'suit' || dress === 'tracksuit' ? jacket : cloth }));
  for (const sx of [-1, 1]) {
    body.add(box({
      size: [0.118 * t, 0.11, 0.128 * t],
      pos: [sx * SH, 1.45, 0],
      mat: sleeve === skinMat ? skinMat : (dress === 'suit' || dress === 'tracksuit' ? jacket : cloth),
    }));
  }

  // Adult performer silhouette. The coloured rounded forms are the bikini
  // itself, not exposed anatomy: two cups and straps above, a full bottom and
  // rounded rear panels below. It stays non-nude from every camera angle.
  const curves = {};
  if (showgirl) {
    /* The only round shapes left on the roster, and they are round on
     * purpose: against a body cut from slabs, a curve reads as a curve. The
     * bust and the rear sit proud of the trunk rather than flush with it,
     * which is what makes the figure show from the floor. */
    for (const sx of [-1, 1]) {
      /* Full, but inside the shoulder line. Pushed past it the two halves
       * stop reading as a chest and start reading as two spheres parked on
       * one, which is what the first pass looked like. Sat close together so
       * they meet in the middle and make a single shape. */
      const cup = sphere({
        r: 0.112 * t, ry: 0.108, rz: 0.098,
        pos: [sx * 0.078 * t, 1.383, D * 0.98],
        mat: cloth,
      });
      cup.name = `performer.bikini-top.${sx < 0 ? 'left' : 'right'}`;
      body.add(cup);
      curves[sx < 0 ? 'bustL' : 'bustR'] = cup;

      // Behind her, not beside her: pushed out at the hip these read as
      // saddlebags from the front instead of as a rear from the side.
      const rear = sphere({
        r: 0.132 * t, ry: 0.128, rz: 0.122,
        pos: [sx * 0.086 * t, 1.008, -D * 1.16],
        mat: cloth,
      });
      rear.name = `performer.bikini-bottom.rear.${sx < 0 ? 'left' : 'right'}`;
      body.add(rear);
      curves[sx < 0 ? 'rearL' : 'rearR'] = rear;

      // A hip flare, so the waist has something to be narrow against
      const flare = sphere({
        r: 0.088 * t, ry: 0.115, rz: 0.10,
        pos: [sx * hipHalf * 0.94, 1.03, 0],
        mat: cloth,
      });
      flare.name = `performer.bikini-bottom.hip.${sx < 0 ? 'left' : 'right'}`;
      body.add(flare);
      curves[sx < 0 ? 'hipL' : 'hipR'] = flare;

      // Over the shoulder, not past it: a strap that overshoots the shoulder
      // slab stands up beside the neck like an aerial.
      const strap = box({
        name: `performer.bikini-top.strap.${sx < 0 ? 'left' : 'right'}`,
        size: [0.026, 0.17, 0.02],
        pos: [sx * 0.112, 1.445, D * 1.02],
        mat: cloth,
      });
      strap.rotation.z = sx * -0.16;
      body.add(strap);
    }
    const topBand = box({
      name: 'performer.bikini-top.band',
      size: [0.36 * t, 0.055, 0.028],
      pos: [0, 1.302, D * 1.08],
      mat: cloth,
    });
    /* Wraps the whole pelvis, front to back, and -- the part that matters --
     * sits OUTSIDE it. Sized in absolute metres it ended up smaller than the
     * pelvis block on a wide-hipped figure and vanished inside her, which is
     * a costume failure and a canon one. Derive it from the hips instead so
     * it can never be swallowed again. */
    const bottomBand = box({
      name: 'performer.bikini-bottom.band',
      size: [hipHalf * 2.08, 0.19, D * 2.27],
      pos: [0, 1.02, 0],
      mat: cloth,
    });
    body.add(topBand, bottomBand);
    curves.topBand = topBand;
    curves.bottomBand = bottomBand;
  }

  if (dress === 'suit') {
    // A jacket is a slightly bigger torso with a shirt front cut out of it
    body.add(box({ size: [0.365 * t, 0.46, D * 2.1], pos: [0, 1.28, 0], mat: jacket }));
    body.add(box({ size: [0.075, 0.36, 0.02], pos: [0, 1.36, D * 1.06], mat: mat({ color: 0xe4e0d8, roughness: 0.9 }) }));
    for (const sx of [-1, 1]) {
      const lap = box({ size: [0.07, 0.26, 0.02], pos: [sx * 0.06, 1.36, D * 1.07], mat: jacket });
      lap.rotation.z = sx * 0.22;
      body.add(lap);
    }
    body.add(box({ size: [0.038, 0.2, 0.018], pos: [0, 1.35, D * 1.09], mat: mat({ color: 0x6a1a24, roughness: 0.7 }) }));
  }
  if (dress === 'waistcoat') {
    body.add(box({ size: [0.35 * t, 0.32, D * 2.06], pos: [0, 1.34, 0], mat: mat({ color: 0x191920, roughness: 0.82 }) }));
    body.add(box({ size: [0.075, 0.05, 0.02], pos: [0, 1.5, D * 1.05], mat: mat({ color: 0x6a1a24, roughness: 0.6 }) }));
  }
  if (dress === 'work') {
    body.add(box({ size: [0.35 * t, 0.22, D * 2.06], pos: [0, 1.1, 0], mat: mat({ color: 0x2a2a30, roughness: 0.95 }) }));
  }
  if (dress === 'chef') {
    // A double-breasted front: two rows of buttons is the whole silhouette
    body.add(box({ size: [0.355 * t, 0.42, D * 2.12], pos: [0, 1.3, 0], mat: whites }));
    for (const bx of [-0.055, 0.055]) {
      for (let i = 0; i < 4; i++) {
        body.add(sphere({ r: 0.014, pos: [bx * t, 1.46 - i * 0.1, D * 1.09], mat: mat({ color: 0xc8c4ba, roughness: 0.6 }) }));
      }
    }
    // Apron, from the waist down, and a towel over the shoulder
    body.add(box({ size: [0.30 * t, 0.5, D * 2.16], pos: [0, 0.98, D * 0.1], mat: apronMat }));
    const towel = box({ size: [0.07, 0.3, 0.05], pos: [-0.17 * t, 1.4, -0.02], mat: mat({ color: 0xd0ccc2, roughness: 0.97 }) });
    towel.rotation.z = 0.2;
    body.add(towel);
  }
  if (dress === 'porter') {
    // A long apron over a bare-armed tee, tied at the back
    body.add(box({ size: [0.32 * t, 0.72, D * 2.1], pos: [0, 0.94, D * 0.12], mat: apronMat }));
    body.add(box({ size: [0.09, 0.34, 0.02], pos: [-0.06, 1.34, D * 1.08], mat: apronMat }));
    body.add(box({ size: [0.09, 0.34, 0.02], pos: [0.06, 1.34, D * 1.08], mat: apronMat }));
  }
  if (dress === 'gown') {
    /* A gown is a skirt: the legs still articulate underneath, so she can walk,
     * but from the waist down what you see is one falling shape. It hangs off
     * the hips rather than sitting on them, which is the difference between a
     * dress and a lampshade. */
    const gownMat = mat({ color: shirt, roughness: 0.62, metalness: 0.08 });
    // Eight sides, not fourteen: faceted enough to belong beside square limbs
    body.add(cylinder({ rTop: 0.16 * t, rBottom: 0.24 * t, h: 0.78, seg: 8, pos: [0, 0.62, 0], mat: gownMat }));
    body.add(box({ size: [0.31 * t, 0.34, D * 2.05], pos: [0, 1.32, 0], mat: gownMat }));
    // Straps, and the neckline they imply
    for (const sx of [-1, 1]) {
      body.add(box({ size: [0.03, 0.14, 0.02], pos: [sx * 0.09, 1.47, D * 0.4], mat: gownMat }));
    }
  }
  if (chain) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 6, 18), mat({ color: 0xd9b64a, roughness: 0.2, metalness: 0.95 }));
    ring.position.set(0, 1.44, D * 1.4);
    ring.rotation.x = 1.42;
    body.add(ring);
  }

  /* ---- head ----
   * Sat on a neck, with a jaw, a nose and a brow. The features are small and
   * the brow is what actually reads at three metres. */
  const head = group('head');
  head.position.set(0, 1.50, 0);
  head.add(box({ size: [0.105, 0.10, 0.105], pos: [0, 0.04, -0.005], mat: skinMat }));     // neck

  /* A photo face is one image on the front of a box skull and plain colour on
   * the other five sides -- the Initiation's technique, and the reason Big
   * Uncle Lou looks like himself rather than like a generic heavy. The picture
   * already has hair, eyes and a mouth in it, so none of the procedural
   * features get built on top of it. */
  const eyes = [];
  let mouth;
  if (face) {
    const wrap = mat({ color: hairColour, roughness: 0.95 });
    const faceMat = new THREE.MeshStandardMaterial({
      map: faceTexture(face, faceCrop), roughness: 0.9, metalness: 0,
    });
    /* Narrower than it is tall, so the cropped photograph lands on the front
     * at close to its own aspect. A square skull stretches a face sideways
     * and the likeness -- the entire point of using the photo -- goes. */
    const skull = new THREE.Mesh(
      new THREE.BoxGeometry(0.162, 0.212, 0.19),
      [wrap, wrap, wrap, wrap, faceMat, wrap],   // +z is the face
    );
    skull.position.set(0, 0.168, 0);
    head.add(skull);
    /* The mouth still exists and is still driven by the talk animation -- it
     * is simply not drawn over a photograph of a real person's mouth. Talking
     * reads on a photo head through the head movement instead. */
    mouth = box({ size: [0.05, 0.011, 0.014], pos: [0, 0.112, 0.084], mat: mat({ color: 0x8a4a48, roughness: 0.6 }) });
    mouth.visible = false;
    head.add(mouth);
  } else {
    /* The skull is a slab, so its front is a flat plane at z = +0.10 and every
     * feature has to stand in front of it. On the old sphere the same numbers
     * worked because the surface fell away toward the edges; drop them onto a
     * box and the whole face sinks inside the head and the figure goes blank.
     * Each z below is chosen to clear the plane it sits on. */
    head.add(box({ size: [0.186, 0.216, 0.20], pos: [0, 0.165, 0], mat: skinMat }));       // skull, front at 0.100
    head.add(box({ size: [0.158, 0.085, 0.19], pos: [0, 0.115, 0.012], mat: skinMat }));   // jaw,   front at 0.107
    head.add(box({ size: [0.09, 0.05, 0.05], pos: [0, 0.088, 0.095], mat: skinMat }));     // chin
    for (const sx of [-1, 1]) {
      head.add(box({ size: [0.026, 0.058, 0.032], pos: [sx * 0.098, 0.163, -0.005], mat: skinMat }));
    }
    head.add(box({ size: [0.15, 0.03, 0.032], pos: [0, 0.206, 0.094], mat: skinMat }));    // brow
    /* Dark rectangles, because that is what reads at three metres -- the same
     * call the Squatchfather's figures make. The iris is inset in front of it
     * so there is still an eye colour when somebody leans in close. */
    for (const sx of [-1, 1]) {
      head.add(box({ size: [0.042, 0.03, 0.014], pos: [sx * 0.036, 0.181, 0.103], mat: mat({ color: 0x1a1410, roughness: 0.5 }) }));
      const iris = box({ size: [0.018, 0.017, 0.01], pos: [sx * 0.036, 0.1815, 0.111], mat: mat({ color: pick([0x3a2a18, 0x2a3a4a, 0x2a4a2a]), roughness: 0.35 }) });
      head.add(iris);
      eyes.push(iris);
    }
    head.add(box({ size: [0.032, 0.052, 0.042], pos: [0, 0.156, 0.113], mat: skinMat }));  // nose
    mouth = box({ size: [0.052, 0.012, 0.016], pos: [0, 0.113, 0.114], mat: mat({ color: 0x8a4a48, roughness: 0.6 }) });
    head.add(mouth);
  }

  if (hair !== 'bald' && !face) {
    // A flat cap of hair sat on the skull, the way the Squatchfather cuts it
    const cap = box({ size: [0.2, 0.08, 0.215], pos: [0, 0.238, -0.008], mat: hairMat });
    if (hair === 'receding') {
      cap.scale.set(0.185, 0.055, 0.185);
      cap.position.set(0, 0.252, -0.024);
    }
    if (hair === 'crop') cap.scale.multiplyScalar(0.98);
    head.add(cap);
    if (hair === 'long') {
      head.add(box({ size: [0.185, 0.2, 0.13], pos: [0, 0.09, -0.062], mat: hairMat }));
      /* Panels down either side of the face. Without them long hair is all
       * behind the head, and from the front -- which is every conversation in
       * the club -- a blonde and a brunette look identical. */
      for (const sx of [-1, 1]) {
        head.add(box({ size: [0.032, 0.19, 0.17], pos: [sx * 0.1, 0.115, -0.012], mat: hairMat }));
      }
    }
    if (hair === 'tied') {
      head.add(box({ size: [0.078, 0.078, 0.078], pos: [0, 0.15, -0.118], mat: hairMat }));
    }
  }
  if (beard && !face) {
    head.add(box({ size: [0.15, 0.075, 0.16], pos: [0, 0.105, 0.04], mat: hairMat }));
  }
  if (glasses) {
    for (const sx of [-1, 1]) {
      head.add(box({ size: [0.042, 0.032, 0.004], pos: [sx * 0.034, 0.181, 0.096], mat: mat({ color: 0x14141a, roughness: 0.35 }) }));
    }
    head.add(box({ size: [0.03, 0.004, 0.004], pos: [0, 0.181, 0.096], mat: mat({ color: 0x14141a, roughness: 0.35 }) }));
  }
  if (bandana) {
    head.add(box({ size: [0.185, 0.048, 0.195], pos: [0, 0.222, -0.006], mat: mat({ color: BANDANA, roughness: 0.92 }) }));
    const tail = box({ size: [0.035, 0.115, 0.018], pos: [0.012, 0.185, -0.1], mat: mat({ color: BANDANA, roughness: 0.92 }) });
    tail.rotation.x = 0.5;
    head.add(tail);
  }
  body.add(head);

  /* ---- arms ----
   * Elbow at the navel, fingertips at mid-thigh. The forearm is its own group
   * so a raised glass or a dealt card bends at the right place.
   */
  function arm(side) {
    const pivot = group('arm');
    pivot.position.set(side * SH, 1.44, 0);
    pivot.add(box({ size: [0.115 * t, 0.30, 0.125 * t], pos: [0, -0.15, 0], mat: sleeve }));
    const fore = group('forearm');
    fore.position.set(0, -0.30, 0);
    fore.add(box({ size: [0.105 * t, 0.10, 0.115 * t], pos: [0, 0, 0], mat: sleeve }));
    fore.add(box({ size: [0.10 * t, 0.27, 0.105 * t], pos: [0, -0.135, 0], mat: dress === 'waistcoat' ? cloth : sleeve }));
    fore.add(box({ size: [0.085, 0.115, 0.065], pos: [0, -0.3, 0.005], mat: skinMat }));
    pivot.add(fore);
    pivot.userData.fore = fore;
    return pivot;
  }
  const armL = arm(-1);
  const armR = arm(1);
  body.add(armL, armR);

  const heightScale = height / 1.78;
  g.scale.setScalar(heightScale);
  g.userData.profile = {
    adult,
    gender,
    bodyShape,
    outfit: dress,
    height,
  };
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = castShadow;
      m.receiveShadow = false;
    }
  });

  /* box() and sphere() in world/build.js put an object's SIZE in its scale --
   * they all share one unit geometry. So anything animated by scale has to be
   * animated relative to what it already is, or it snaps to a one-metre cube.
   * Breathing did exactly that, and the club filled up with pale boxes. */
  torso.userData.base = torso.scale.clone();
  mouth.userData.base = mouth.scale.clone();

  return {
    group: g, body, head, eyes, mouth, torso, waist, hips, curves,
    profile: g.userData.profile,
    heightScale,
    armL, armR, legL, legR,
    foreL: armL.userData.fore, foreR: armR.userData.fore,
    shinL: legL.children.find((c) => c.name === 'shin'),
    shinR: legR.children.find((c) => c.name === 'shin'),
  };
}

/* ------------------------------------------------------------------ */
/* Behaviour                                                           */
/* ------------------------------------------------------------------ */

const _v = new THREE.Vector3();

export class Npc {
  /**
   * @param {object} o
   *   name, tier ('hero' | 'ambient' | 'background')
   *   x, z, yaw, y
   *   job: 'stand' | 'sit' | 'lean' | 'work' | 'deal' | 'dance' | 'patrol' | 'drink'
   */
  constructor(scene, o = {}) {
    const {
      name = 'somebody', tier = 'ambient', x = 0, z = 0, yaw = 0, y = 0,
      job = 'stand', look = true, route = null, model = {}, colliders = null,
      navBlockers = null, routine = 0, pole = false,
    } = o;
    this.name = name;
    this.tier = tier;
    this.job = job;
    this.look = look;
    this.route = route;
    this.routeAt = 0;
    this.colliders = colliders;
    this.navBlockers = navBlockers;
    this.parts = makePerson({
      ...model,
      castShadow: model.castShadow ?? tier === 'hero',
    });
    this.group = this.parts.group;
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    this.group.userData.npc = {
      name,
      tier,
      role: model.role ?? null,
      ...this.parts.profile,
    };
    this.homeYaw = yaw;
    this.baseY = y;
    /* Where a mover belongs. The dance walks the floor around a pole and has
     * to come back to the same spot every bar rather than drifting off the
     * stage over the course of an evening. */
    this.homeX = x;
    this.homeZ = z;
    this.routine = routine;
    this.pole = pole;
    scene.add(this.group);

    this.t = rand(0, 10);
    this.phase = rand(0, 6.28);
    this.gaze = 0;
    this.speaking = 0;
    this.folded = false;
    this.targetYaw = undefined;
    this._acc = 0;
    this._every = 0;
    this._lastJob = null;
    this._syncJob(true);
  }

  get position() { return this.group.position; }

  /**
   * Fold at the hips and the knees and drop onto the seat.
   *
   * The drop is 0.42 because that is where the chairs in here are: thighs
   * horizontal at seat height, shins vertical, feet on the floor. Getting it
   * wrong by ten centimetres is the difference between sitting down and
   * hovering, and everybody in this club is sitting down.
   */
  sit() {
    this._neutralPose();
    this.seated = true;
    this.parts.legL.rotation.x = -1.45;
    this.parts.legR.rotation.x = -1.45;
    this.parts.shinL.rotation.x = 1.4;
    this.parts.shinR.rotation.x = 1.4;
    this.parts.armL.rotation.x = -0.5;
    this.parts.armR.rotation.x = -0.5;
    this.parts.foreL.rotation.x = -0.5;
    this.parts.foreR.rotation.x = -0.5;
    this.group.position.y = this.baseY - 0.42 * this.parts.heightScale;
  }

  stand() {
    this._neutralPose();
    this.seated = false;
    this.group.position.y = this.baseY;
  }

  _neutralPose() {
    this.parts.body.rotation.set(0, 0, 0);
    this.parts.head.rotation.set(0, 0, 0);
    for (const part of [
      this.parts.legL, this.parts.legR, this.parts.shinL, this.parts.shinR,
      this.parts.armL, this.parts.armR, this.parts.foreL, this.parts.foreR,
    ]) {
      part.rotation.set(0, 0, 0);
    }
  }

  _syncJob(force = false) {
    if (!force && this.job === this._lastJob) return;
    if (this.job === 'sit' || this.job === 'drink') this.sit();
    else this.stand();
    // Movers need visually smooth transforms even when their behavioural tier
    // is background. Thirty updates a second removes the old 18 cm jumps
    // without making every idle patron a per-frame actor.
    this._every = this.job === 'patrol' || this.job === 'dance'
      ? 1 / 30
      : this.tier === 'hero' ? 0 : this.tier === 'ambient' ? 1 / 20 : 1 / 6;
    this._lastJob = this.job;
  }

  /* Walls and furniture, plus the stage's nav-only blockers. Two lists rather
   * than one because doors splice their boxes in and out of the shared
   * colliders array live -- a merged copy would stop tracking them. */
  _navClear(x, z) {
    return this._clearOf(this.colliders, x, z) && this._clearOf(this.navBlockers, x, z);
  }

  _clearOf(list, x, z) {
    if (!list?.length) return true;
    const radius = 0.24;
    for (const b of list) {
      if (this.baseY > b.max.y || this.baseY + 1.8 < b.min.y) continue;
      const cx = Math.max(b.min.x, Math.min(b.max.x, x));
      const cz = Math.max(b.min.z, Math.min(b.max.z, z));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < radius * radius) return false;
    }
    return true;
  }

  /** Say something: the head moves and one hand comes up for `secs`. */
  say(secs = 2) {
    this.speaking = secs;
  }

  faceToward(x, z, snap = false) {
    const yaw = Math.atan2(x - this.group.position.x, z - this.group.position.z);
    if (snap) this.group.rotation.y = yaw;
    else this.targetYaw = yaw;
    return yaw;
  }

  update(dt, playerPos) {
    this._syncJob();
    if (this._every > 0) {
      this._acc += dt;
      if (this._acc < this._every) return;
      dt = this._acc;
      this._acc = 0;
    }
    this.t += dt;
    const t = this.t + this.phase;

    // Breathing, always. It is most of what separates a person from a prop.
    const breathe = 1 + Math.sin(t * 1.5) * 0.02;
    const base = this.parts.torso.userData.base;
    this.parts.torso.scale.set(base.x * breathe, base.y, base.z * breathe);
    if (this.speaking > 0) this.speaking -= dt;
    // Clear transient speaking/job rotations before applying this frame's
    // authored pose. Previously a speaker could keep a tilted head or raised
    // arm forever after the line ended or the job changed.
    this.parts.body.rotation.z = 0;
    /* The dance leans, arches and shifts the upper body off centre. Clear all
     * of it here too, or a dancer who is asked to stand still keeps the last
     * frame of her routine forever. */
    this.parts.body.rotation.x = 0;
    this.parts.body.position.x = 0;
    this.parts.body.position.z = 0;
    this.parts.head.rotation.x = 0;
    this.parts.head.rotation.z = 0;
    this.parts.armL.rotation.y = 0;
    this.parts.armL.rotation.z = 0;
    this.parts.armR.rotation.y = 0;
    this.parts.armR.rotation.z = 0;
    this.parts.foreL.rotation.y = 0;
    this.parts.foreL.rotation.z = 0;
    this.parts.foreR.rotation.y = 0;
    this.parts.foreR.rotation.z = 0;

    switch (this.job) {
      case 'work': {
        // Wiping, pouring, checking the till, and never still
        const cycle = (t * 0.5) % 4;
        if (cycle < 1.6) {
          // Wiping: the shoulder swings a little, the elbow a lot
          this.parts.armR.rotation.x = -0.45 + Math.sin(t * 6) * 0.16;
          this.parts.foreR.rotation.x = -1.0 + Math.sin(t * 6) * 0.3;
          this.parts.armL.rotation.x = -0.2;
          this.parts.foreL.rotation.x = -0.5;
        } else if (cycle < 2.8) {
          // Pouring, both hands up
          this.parts.armR.rotation.x = -0.7;
          this.parts.foreR.rotation.x = -1.1;
          this.parts.armL.rotation.x = -0.6 + Math.sin(t * 2) * 0.08;
          this.parts.foreL.rotation.x = -1.0;
        } else {
          this.parts.armR.rotation.x = -0.25 + Math.sin(t * 1.4) * 0.12;
          this.parts.foreR.rotation.x = -0.85;
          this.parts.armL.rotation.x = -0.25 - Math.sin(t * 1.4) * 0.12;
          this.parts.foreL.rotation.x = -0.8;
        }
        break;
      }
      case 'deal': {
        // Deal, collect, pay, wait. Mostly wait.
        const cycle = (t * 0.6) % 6;
        const swing = cycle < 1 ? Math.sin(cycle * Math.PI) : 0;
        this.parts.armR.rotation.x = -0.32 - swing * 0.35;
        this.parts.foreR.rotation.x = -1.15 - swing * 0.5;
        this.parts.armL.rotation.x = -0.3;
        this.parts.foreL.rotation.x = -1.1;
        break;
      }
      case 'dance': {
        /* Clothed, on the beat, and doing this for a living.
         *
         * Four bars on a loop rather than one sine wave: a hip-circle bar, a
         * bar working the pole (or the floor, for whoever has the runway and
         * no pole to hold), a drop, and a shimmy. Each dancer is offset into
         * a different bar of the routine so the stage never looks like a
         * chorus line doing PE.
         *
         * Everything is driven off `homeX/homeZ` and reset every frame, so a
         * dancer who orbits her pole for an hour is still standing on it at
         * the end. This runs at the mover cadence (30Hz), not per frame. */
        const b = t * 3.2;                                   // the beat
        const bars = 4;
        const barLen = 3.1;                                  // seconds per bar
        const clock = t + this.routine * barLen;             // stagger the cast
        const bar = Math.floor((clock / barLen) % bars);
        const k = (clock % barLen) / barLen;                 // 0..1 through the bar
        const ease = Math.sin(k * Math.PI);                  // in and out of the move

        // Hips lead and the shoulders answer half a beat later, which is most
        // of what separates dancing from swaying.
        this.parts.body.position.x = Math.sin(b) * 0.05;
        this.parts.body.position.z = Math.cos(b * 2) * 0.028;
        this.parts.body.rotation.z = Math.sin(b) * 0.14;
        this.parts.body.rotation.x = 0;
        this.parts.head.rotation.z = Math.sin(b + 0.9) * 0.12;

        let yaw = this.homeYaw + Math.sin(b * 0.5) * 0.6;
        let px = this.homeX;
        let pz = this.homeZ;
        let lift = Math.abs(Math.sin(b)) * 0.035;
        let bend = 0;

        if (bar === 0) {
          // Hip circles, hands tracing up the body and over the head
          this.parts.armL.rotation.z = 0.7 + Math.sin(b) * 0.7;
          this.parts.armR.rotation.z = -0.7 - Math.sin(b + 1) * 0.7;
          this.parts.armL.rotation.x = -0.5 + Math.sin(b * 0.5) * 0.6;
          this.parts.armR.rotation.x = -0.5 + Math.sin(b * 0.5 + 2) * 0.6;
          this.parts.foreL.rotation.x = -0.6;
          this.parts.foreR.rotation.x = -0.6;
          this.parts.body.rotation.z += Math.sin(b * 0.5) * 0.1;
        } else if (bar === 1 && this.pole) {
          /* Pole work: one hand stays up on the pole and she walks a small
           * circle around it, leaning out against her own grip. The lean is
           * what sells it -- an upright orbit just looks like pacing. */
          const orbit = b * 0.42;
          px = this.homeX + Math.sin(orbit) * 0.3 * ease;
          pz = this.homeZ + Math.cos(orbit) * 0.3 * ease;
          yaw = this.homeYaw + orbit + Math.PI / 2;
          /* High and gripping, but not straight overhead: a fully extended
           * arm puts her fingertips 25 cm above her own head and the scene
           * measures each dancer's bounding box against a 1.95 m ceiling.
           * A gripping hand at brow height reads the same and stays inside
           * it -- `node tools/shots-cast.mjs probe` reports the margin. */
          this.parts.armR.rotation.z = -2.2;
          this.parts.armR.rotation.x = -0.15;
          this.parts.foreR.rotation.x = -0.28;
          this.parts.armL.rotation.z = 0.5 + Math.sin(b) * 0.5;
          this.parts.armL.rotation.x = -0.35;
          this.parts.foreL.rotation.x = -0.8;
          this.parts.body.rotation.z = -0.3 * ease + Math.sin(b) * 0.08;
          bend = 0.2 * ease;
        } else if (bar === 1) {
          // No pole on the runway: a long slow walk down it and back
          const walk = Math.sin(b * 0.32);
          pz = this.homeZ + walk * 0.55 * ease;
          yaw = this.homeYaw + (walk > 0 ? 0.25 : -0.25);
          this.parts.armL.rotation.z = 0.8 + Math.sin(b) * 0.35;
          this.parts.armR.rotation.z = -0.8 - Math.sin(b + 1) * 0.35;
          this.parts.armL.rotation.x = -0.3;
          this.parts.armR.rotation.x = -0.3;
          this.parts.foreL.rotation.x = -0.7;
          this.parts.foreR.rotation.x = -0.7;
          bend = 0.12 * ease;
        } else if (bar === 2) {
          /* The drop. The knees fold and the hips come down; the feet stay
           * where they are. Kept shallow on purpose -- the stage is measured
           * and a deep squat would put her head through the floor of it. */
          const drop = ease;
          lift = -0.085 * drop;
          bend = 0.1 * drop;
          this.parts.legL.rotation.x = -0.5 * drop;
          this.parts.legR.rotation.x = -0.5 * drop;
          this.parts.shinL.rotation.x = 0.95 * drop;
          this.parts.shinR.rotation.x = 0.95 * drop;
          this.parts.armL.rotation.z = 0.95 * drop;
          this.parts.armR.rotation.z = -0.95 * drop;
          this.parts.armL.rotation.x = -0.9 * drop;
          this.parts.armR.rotation.x = -0.9 * drop;
          this.parts.foreL.rotation.x = -0.5;
          this.parts.foreR.rotation.x = -0.5;
          this.parts.body.rotation.z = Math.sin(b) * 0.08;
        } else {
          // Shoulder shimmy, back arched, chin up
          const fast = Math.sin(b * 2.6);
          this.parts.body.rotation.z = fast * 0.16;
          this.parts.armL.rotation.z = 1.15 + fast * 0.3;
          this.parts.armR.rotation.z = -1.15 - fast * 0.3;
          this.parts.armL.rotation.x = -0.75;
          this.parts.armR.rotation.x = -0.75;
          this.parts.foreL.rotation.x = -1.15;
          this.parts.foreR.rotation.x = -1.15;
          this.parts.head.rotation.x = -0.12 * ease;
          bend = -0.22 * ease;                               // the arch
        }

        if (bar !== 2) {
          // Weight shifting from one leg to the other, everywhere but the drop
          this.parts.legL.rotation.x = Math.sin(b) * 0.26;
          this.parts.legR.rotation.x = -Math.sin(b) * 0.26;
          this.parts.shinL.rotation.x = Math.max(0, -Math.sin(b)) * 0.3;
          this.parts.shinR.rotation.x = Math.max(0, Math.sin(b)) * 0.3;
        }

        this.parts.body.rotation.x = bend;
        this.group.position.set(px, this.baseY + lift, pz);
        this.group.rotation.y = yaw;
        break;
      }
      case 'drink': {
        // Sitting with a glass, raising it about once every eight seconds.
        // The shoulder barely moves; it is the elbow that does the work.
        const cycle = t % 8;
        const lift = cycle < 1.4 ? Math.sin((cycle / 1.4) * Math.PI) : 0;
        this.parts.armR.rotation.x = -0.5 - lift * 0.35;
        this.parts.foreR.rotation.x = -0.8 - lift * 1.1;
        this.parts.head.rotation.x = lift > 0.6 ? -0.12 : 0;
        break;
      }
      case 'patrol': {
        this.group.position.y = this.baseY;
        if (this.route && this.route.length > 1) {
          const target = this.route[this.routeAt];
          const dx = target.x - this.group.position.x;
          const dz = target.z - this.group.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.4) {
            this.routeAt = (this.routeAt + 1) % this.route.length;
          } else {
            const speed = 1.1;
            const stepX = (dx / d) * speed * dt;
            const stepZ = (dz / d) * speed * dt;
            // Moved means the position actually changed — a clear probe on an
            // axis whose step is ~zero is just "standing somewhere legal", and
            // counting it let NPCs slide against furniture animating forever.
            const wasX = this.group.position.x;
            const wasZ = this.group.position.z;
            if (this._navClear(wasX + stepX, wasZ)) this.group.position.x += stepX;
            if (this._navClear(this.group.position.x, wasZ + stepZ)) this.group.position.z += stepZ;
            const moved = Math.abs(this.group.position.x - wasX)
              + Math.abs(this.group.position.z - wasZ) > 1e-4;
            if (!moved) {
              // An authored waypoint ended up behind furniture. Advance
              // rather than walking through it or vibrating against it.
              this.routeAt = (this.routeAt + 1) % this.route.length;
              break;
            }
            const yaw = Math.atan2(dx, dz);
            const diff = Math.atan2(Math.sin(yaw - this.group.rotation.y), Math.cos(yaw - this.group.rotation.y));
            this.group.rotation.y += diff * Math.min(1, dt * 4);
            const gait = Math.sin(t * 5.2) * 0.42;
            this.parts.legL.rotation.x = gait;
            this.parts.legR.rotation.x = -gait;
            this.parts.armL.rotation.x = -gait * 0.55;
            this.parts.armR.rotation.x = gait * 0.55;
            this.group.position.y = this.baseY + Math.abs(Math.sin(t * 5.2)) * 0.012;
          }
        }
        break;
      }
      case 'lean':
        this.parts.body.rotation.z = 0.05;
        this.parts.armR.rotation.x = -0.25;
        break;
      case 'sit':
        this.parts.armL.rotation.x = -0.5 + Math.sin(t * 0.7) * 0.05;
        this.parts.armR.rotation.x = -0.5 + Math.sin(t * 0.6 + 1) * 0.05;
        break;
      default: {
        this.parts.body.rotation.z = Math.sin(t * 0.4) * 0.018;
        if (this.folded) {
          // Arms crossed: shoulders in, elbows hard, forearms across the chest
          this.parts.armL.rotation.set(-0.35, 0, 0.42);
          this.parts.armR.rotation.set(-0.35, 0, -0.42);
          this.parts.foreL.rotation.set(-1.45, 0.55, 0);
          this.parts.foreR.rotation.set(-1.45, -0.55, 0);
        } else {
          this.parts.armL.rotation.x = Math.sin(t * 0.5) * 0.045;
          this.parts.armR.rotation.x = Math.sin(t * 0.5 + 1) * 0.045;
        }
      }
    }

    // Talking: the jaw works, the head nods, one hand does the explaining
    if (this.speaking > 0) {
      const mb = this.parts.mouth.userData.base;
      this.parts.mouth.scale.set(mb.x, mb.y * (1 + Math.abs(Math.sin(t * 11)) * 2.6), mb.z);
      this.parts.head.rotation.x = Math.sin(t * 6) * 0.05;
      this.parts.armR.rotation.x = -0.35 + Math.sin(t * 4.5) * 0.14;
      this.parts.armR.rotation.z = -0.18;
      this.parts.foreR.rotation.x = -1.0 + Math.sin(t * 4.5 + 1) * 0.35;
    } else {
      this.parts.mouth.scale.copy(this.parts.mouth.userData.base);
    }

    // Heroes track the player once he is close enough to matter
    if (this.look && playerPos) {
      _v.copy(playerPos).sub(this.group.position);
      const dist = _v.length();
      if (dist < 7) {
        const want = Math.atan2(_v.x, _v.z) - this.group.rotation.y;
        const wrapped = Math.atan2(Math.sin(want), Math.cos(want));
        this.gaze += (Math.max(-1.0, Math.min(1.0, wrapped)) - this.gaze) * Math.min(1, dt * 3);
      } else {
        this.gaze += (0 - this.gaze) * Math.min(1, dt * 2);
      }
      this.parts.head.rotation.y = this.gaze;
    }

    if (this.targetYaw !== undefined) {
      const diff = Math.atan2(Math.sin(this.targetYaw - this.group.rotation.y), Math.cos(this.targetYaw - this.group.rotation.y));
      this.group.rotation.y += diff * Math.min(1, dt * 5);
    }
  }
}

/* ------------------------------------------------------------------ */
/* The population                                                      */
/* ------------------------------------------------------------------ */

/**
 * Twenty-nine people, which is a busy Tuesday.
 * @returns {{ all: Npc[], byName: Object<string, Npc> }}
 */
export function populate(scene, club, { includeMargo = true } = {}) {
  const a = club.anchors;
  const all = [];
  const by = {};
  const add = (key, npc) => {
    npc.colliders ??= club.colliders;
    npc.navBlockers ??= club.navBlockers ?? null;
    all.push(npc);
    if (key) by[key] = npc;
    return npc;
  };

  /* ---- heroes ---- */

  /* Lou: broad, patterned short-sleeve shirt, gold chain, and the man's own
   * face off the Initiation's photo set. He is a named founder, and the
   * character bible is explicit that named Circle members wear their supplied
   * photographs rather than a procedural approximation of them.
   *
   * No bandana. Half the crew in here wear the club's colours on their heads
   * and Lou is deliberately not one of them -- he runs the place from an
   * office, and the man who owns the building does not need the uniform. */
  add('lou', new Npc(scene, {
    name: 'Lou', tier: 'hero', job: 'sit',
    x: a.louSeat.x, z: a.louSeat.z, yaw: 0,
    model: {
      height: 1.8, build: 1.4, dress: 'shirt', shirt: 0x6a5a3a,
      hairColour: 0x4a4a48, chain: true, skin: 0xd2a074,
      face: 'assets/faces/lou.png', bandana: false,
    },
  }));

  add('bouncer', new Npc(scene, {
    name: 'the bouncer', tier: 'hero', job: 'stand',
    x: a.bouncerPost.x, z: a.bouncerPost.z, yaw: Math.PI,
    model: { height: 1.94, build: 1.45, dress: 'tee', shirt: 0x14141a, hair: 'bald', beard: true },
  }));
  by.bouncer.folded = true;

  add('bartender', new Npc(scene, {
    name: 'the bartender', tier: 'hero', job: 'work',
    x: a.bartender.x, z: a.bartender.z, yaw: Math.PI / 2,
    model: { height: 1.7, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'tied' },
  }));

  add('barback', new Npc(scene, {
    name: 'the barback', tier: 'ambient', job: 'work',
    x: a.barback.x, z: a.barback.z, yaw: Math.PI / 2,
    model: { height: 1.74, dress: 'tee', shirt: 0x1f2b22, hair: 'crop' },
  }));

  // The dealer: sharply dressed, older, and says almost nothing
  add('dealer', new Npc(scene, {
    name: 'the dealer', tier: 'hero', job: 'deal',
    x: a.dealer.x, z: a.dealer.z, yaw: 0,
    model: { height: 1.76, build: 0.95, dress: 'waistcoat', shirt: 0xe6e2da, hair: 'short', hairColour: 0x9a9a9a, glasses: true },
  }));

  add('hallGuard', new Npc(scene, {
    name: 'the guard', tier: 'hero', job: 'sit',
    x: a.hallGuard.x, z: a.hallGuard.z, yaw: -Math.PI / 2,
    model: { height: 1.82, build: 1.2, dress: 'tracksuit', shirt: pick(TRACKSUITS), hair: 'crop', bandana: false },
  }));

  /* His round goes down the east side, along the front wall, and down the
   * west side to the stage corner -- then back the way he came. The old loop
   * closed across the stage front, which meant a leg straight through the
   * runway now that the stage blocks navigation like the furniture does. */
  add('security', new Npc(scene, {
    name: 'security', tier: 'hero', job: 'patrol',
    x: -6.3, z: -4.5, yaw: 0,
    route: [
      { x: -6.3, z: -4.5 }, { x: -6.3, z: 5.7 },
      { x: -17.9, z: 5.7 }, { x: -17.9, z: -2.3 },
      { x: -17.9, z: 5.7 }, { x: -6.3, z: 5.7 },
    ],
    model: { height: 1.88, build: 1.3, dress: 'tee', shirt: 0x14141a, hair: 'bald' },
  }));

  add('security2', new Npc(scene, {
    name: 'security', tier: 'ambient', job: 'stand',
    x: 4.5, z: -9.4, yaw: -0.8,
    model: { height: 1.86, build: 1.28, dress: 'tee', shirt: 0x14141a, hair: 'crop', beard: true },
  }));
  by.security2.folded = true;

  add('dj', new Npc(scene, {
    name: 'the DJ', tier: 'ambient', job: 'work',
    x: a.dj.x, z: a.dj.z, yaw: Math.PI + 0.25,
    model: { height: 1.75, dress: 'tee', shirt: 0x2e2438, hair: 'long', bandana: true },
  }));

  /* ---- the stage ----
   *
   * Four women, authored rather than rolled, because "four random dancers"
   * gave the stage four of the same woman in different colours. Three of them
   * are fair and the fourth is not; the hair runs blonde, brunette and black
   * across the line so no two read the same from the floor.
   *
   * Three work a pole and the fourth has the runway, which is why she gets a
   * walk instead of an orbit. See the `dance` case for the routine itself.
   * Per the character bible this presentation belongs to these four roles and
   * nobody else in either scene. */
  const PERFORMERS = [
    { skin: 0xf0cba6, hairColour: 0xdcb04a, hair: 'long', shirt: 0xd94f9a },  // blonde
    { skin: 0xe8c39c, hairColour: 0x5a3a20, hair: 'tied', shirt: 0x9a4fd9 },  // brunette
    { skin: 0xf2d3b4, hairColour: 0x14100e, hair: 'long', shirt: 0x4fd9c0 },  // black
    { skin: 0x8d5a3a, hairColour: 0xe0c884, hair: 'tied', shirt: 0xd9c04f },  // platinum
  ];
  [...a.poles, a.runway].forEach((p, i) => {
    const look = PERFORMERS[i % PERFORMERS.length];
    add(`performer${i}`, new Npc(scene, {
      name: 'a dancer', tier: i === 3 ? 'ambient' : 'background', job: 'dance',
      x: p.x, z: p.z, y: p.y, yaw: 0, look: false,
      routine: i, pole: i < a.poles.length,
      model: {
        role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
        height: rand(1.70, 1.76), build: rand(1.04, 1.12), dress: 'bikini',
        ...look,
      },
    }));
  });

  /* ---- the table ---- */
  const seats = a.blackjackSeats;
  add('contractor', new Npc(scene, {
    name: 'the contractor', tier: 'ambient', job: 'sit',
    x: seats[0].x, z: seats[0].z, yaw: seats[0].faceYaw,
    model: { height: 1.79, build: 1.12, dress: 'shirt', shirt: 0x3a3320, hair: 'short', beard: true },
  }));
  add('regular', new Npc(scene, {
    name: 'the regular', tier: 'ambient', job: 'sit',
    x: seats[4].x, z: seats[4].z, yaw: seats[4].faceYaw,
    model: { height: 1.72, dress: 'tracksuit', shirt: pick(TRACKSUITS), hair: 'receding', glasses: true },
  }));

  /* ---- the floor ---- */
  const seatedSpots = [
    [a.booths[0], 0.6], [a.booths[1], -0.4], [a.booths[3], 0.2],
    [a.booths[5], 0.1], [a.booths[6], -0.2], [a.booths[7], 0.4],
  ];
  seatedSpots.forEach(([spot, off], i) => {
    add(`patron${i}`, new Npc(scene, {
      name: 'a regular', tier: i < 3 ? 'ambient' : 'background', job: i % 2 ? 'drink' : 'sit',
      x: spot.x + off, z: spot.z,
      yaw: spot.x > 0 ? -Math.PI / 2 : (spot.z > 5 ? Math.PI : 0),
      model: {
        height: rand(1.66, 1.9), build: rand(0.95, 1.3),
        dress: pick(['shirt', 'tracksuit', 'suit']),
        hair: pick(['short', 'crop', 'receding', 'long', 'tied']),
        bandana: Math.random() < 0.2,
      },
    }));
  });
  a.tables.slice(0, 3).forEach((t, i) => {
    add(`tabler${i}`, new Npc(scene, {
      name: 'a regular', tier: 'background', job: 'drink',
      x: t.x - 0.85, z: t.z + 0.2, yaw: 1.2,
      model: { height: rand(1.66, 1.84), dress: pick(['shirt', 'tracksuit']), hair: pick(['short', 'crop', 'tied']) },
    }));
  });

  const standing = [[-18.4, 0.6], [-18.4, 4.4], [-17.6, 7.4]];
  standing.forEach(([sx, sz], i) => {
    add(`stander${i}`, new Npc(scene, {
      name: 'a regular', tier: i === 0 ? 'ambient' : 'background', job: 'lean',
      x: sx, z: sz, yaw: -Math.PI / 2,
      model: {
        height: rand(1.68, 1.88), build: rand(1, 1.3),
        dress: pick(['shirt', 'tracksuit']), hair: pick(['short', 'crop', 'bald']),
      },
    }));
  });

  add('waiter1', new Npc(scene, {
    name: 'a waitress', tier: 'ambient', job: 'patrol',
    x: -10, z: 5, yaw: 0,
    route: [{ x: -10, z: 5 }, { x: -17, z: 2 }, { x: -17.9, z: 6.5 }, { x: -8, z: 8 }],
    model: { height: 1.68, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'tied' },
  }));
  add('waiter2', new Npc(scene, {
    name: 'a waiter', tier: 'background', job: 'patrol',
    x: -4, z: 2, yaw: 0,
    // Works the two-tops east of the runway; the old middle leg walked him
    // through the thrust now that the stage blocks the crowd's nav.
    route: [{ x: -4, z: 2 }, { x: -8.6, z: -1 }, { x: -8.1, z: 2.6 }, { x: -6, z: 6 }],
    model: { height: 1.77, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'crop' },
  }));
  add('cleaner', new Npc(scene, {
    name: 'the cleaner', tier: 'background', job: 'work',
    x: 6.9, z: 1.4, yaw: Math.PI,
    model: { height: 1.64, dress: 'work', shirt: 0x3a3a42, hair: 'tied', skin: 0x8d5a3a },
  }));
  add('delivery', new Npc(scene, {
    name: 'a delivery driver', tier: 'background', job: 'patrol',
    x: 22.5, z: 8, yaw: Math.PI,
    route: [{ x: 22.5, z: 8 }, { x: 22.5, z: -4 }, { x: 24, z: -4.6 }, { x: 22.5, z: 8 }],
    model: { height: 1.8, build: 1.15, dress: 'work', shirt: 0x3a3320, hair: 'crop', beard: true },
  }));

  /* On a stool at the far end, on her own, with a rye she has already sent two
   * ice cubes back from. She runs the kitchen at the all-night place on
   * Ashland and she is not connected to anybody in this room, which is the
   * entire point of her: the next chapter is a date, and you do not take the
   * family on a date.
   *
   * She is here at all because a woman who turns up in a later scene out of
   * nowhere is a prize, and a woman you talked to three nights earlier is a
   * person. Scene One only — by the second visit it is nearly midnight and the
   * evening has a different shape. */
  if (includeMargo && a.barStools?.length) {
    const stool = a.barStools[a.barStools.length - 1];
    add('margo', new Npc(scene, {
      name: 'Margo', tier: 'hero', job: 'drink',
      x: stool.x, z: stool.z, yaw: -Math.PI / 2,
      model: {
        height: 1.69, build: 1.06, dress: 'shirt', shirt: 0x24303a, hair: 'tied',
        hairColour: 0x2a1c14, skin: 0xd8a878,
        gender: 'female', bodyShape: 'curvy',
      },
    }));
    by.margo.seated = true;
  }

  // Two by the coat check with opinions about the butcher union
  add('gossip1', new Npc(scene, {
    name: 'a regular', tier: 'ambient', job: 'stand',
    x: -1.2, z: 9.4, yaw: 1.9,
    model: { height: 1.81, build: 1.15, dress: 'tracksuit', shirt: pick(TRACKSUITS), hair: 'crop', bandana: true },
  }));
  add('gossip2', new Npc(scene, {
    name: 'a regular', tier: 'ambient', job: 'stand',
    x: -0.2, z: 8.6, yaw: -1.2,
    model: { height: 1.74, dress: 'shirt', hair: 'receding', beard: true },
  }));

  return { all, byName: by };
}

/**
 * Lou's associate: sent out to fetch the prospect when he has been playing
 * cards too long. He is not in the room until he is needed.
 */
export function makeAssociate(scene, from, colliders = null, navBlockers = null) {
  const npc = new Npc(scene, {
    name: "Lou's associate", tier: 'hero', job: 'patrol',
    x: from.x, z: from.z, yaw: 0,
    colliders, navBlockers,
    model: { height: 1.84, build: 1.22, dress: 'tracksuit', shirt: 0x1c2f4a, hair: 'crop', bandana: true },
  });
  npc.group.visible = false;
  return npc;
}

export { BANDANA };
