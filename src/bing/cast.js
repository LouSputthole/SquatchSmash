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
import { coarseActorRole, markActor, setActorPosture } from '../core/staging.js';
/* Read-only: her head is authored in the Silver Room's module and this is the
 * SAME woman, so the club borrows the builder rather than approximating her.
 * One Margo, one face, both scenes. */
import { restyleMargoHead } from '../silver/margo.js';
import { Mouth } from '../core/mouth.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { BADA_BING_BARTENDER, BIG_UNCLE_LOU_BING } from '../core/wardrobe.js';
import { mat, box, sphere, cylinder, group } from '../world/build.js';
import { rand, pick } from './kit.js';
import {
  BADA_BING_CORE_STAGE_COUNT, BADA_BING_PERFORMERS,
} from './performers.js';

export { BADA_BING_CORE_STAGE_COUNT, BADA_BING_PERFORMERS } from './performers.js';

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
 * How high a bar stool sits somebody.
 *
 * Npc.sit() folds the figure and drops it 0.42 from its base, and that 0.42
 * is measured against a CHAIR -- the office and blackjack seats have their
 * cushions at 0.53 and the pose lands square on them. A bar stool's cushion
 * is at 0.845. Anybody sat on one from a base of zero is therefore buried in
 * it to the waist, which is precisely where Booskibro and DeathMegatron have
 * been drinking. Raise the base by the difference and they sit ON the stool,
 * with their feet at the height of its brass ring rather than through it.
 */
export const STOOL_SIT = 0.315;

// The dress-shoe sole extends 2.2 cm below the old 0.90 leg root. Folding the
// same rig onto a chair needs another 3.8 cm of lower-leg lift to keep both
// soles on the floor without moving the hips off the authored cushion height.
/* Exported because a fixture pose that moves the leg root has to be able to
 * put it back: `sit()` raises it 38 mm so the thigh stays in the hip through a
 * seated rotation, and a pose that writes `STANDING` and then hands the figure
 * back leaves her sitting 38 mm wrong with nothing in the shared rig to
 * correct it -- `_neutralPose()` does not touch the leg root. */
export const STANDING_LEG_ROOT_Y = 0.922;
export const SEATED_LEG_ROOT_Y = 0.960;

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
 *   gut      0 by default. A real belly, sized on its own rather than derived
 *            from `build` -- see "gut" below, where it is built.
 *   dress    'suit' | 'shirt' | 'tracksuit' | 'tee' | 'waistcoat' | 'bikini' | 'work'
 *            | 'chef' | 'porter' | 'gown' | 'bomber'
 *   hair     'short' | 'crop' | 'receding' | 'bald' | 'long' | 'tied'
 *   bandana  club colours, worn by the crew and the prospect
 *   face     image URL painted on the front of the skull, the way the
 *            Initiation gives the Circle their real faces. A photo brings its
 *            own hair, eyes and mouth, so the procedural ones stand down.
 *   neckline false | 'v' -- an open knit collar rather than a crew neck
 *   tuxedo   a dinner jacket front: white dress shirt, satin lapels, studs,
 *            cummerbund and a pocket square. NOT the same thing as `neckline`
 *            -- a V cuts a hole in the shirt and shows skin, which on a dark
 *            jacket reads as an open-necked knit, not as black tie.
 *   luxury   richer fabric, piping and ribbing without changing the rig
 *   watch    false | 'gold' | 'silver' -- his own left wrist, which is +X
 *   bracelet false | 'gold' | 'silver' -- his own right, so the two never
 *            share a forearm and never share a name
 *   chainStyle 'single' | 'layered' -- the primary chain keeps its stable name
 *   pendantStyle 'disc' | 'crest' | 'horn' -- 'horn' is the cornicello, the
 *            twisted Italian horn, and it is built to hang clear of the man
 *            rather than on the chest plane; see makeHorn below
 *   hat      false | 'fedora' | 'flatcap'
 *   pinstripe chalk stripes on the suit and its trousers
 *   threePiece a waistcoat behind an open jacket, which is what puts a chain
 *            somewhere a chain can actually be seen
 *   argyle   { a, b, line } -- the diamond colourway for `dress: 'argyle'`
 *            and for the stockings `knickers` brings with it
 *   knickers plus-fours and tall socks instead of trousers
 *   shoeStyle 'plain' | 'saddle'
 */
/* ------------------------------------------------------------------ */
/* Softened slabs                                                      */
/* ------------------------------------------------------------------ */

/**
 * A box with its edges taken off.
 *
 * The club's figures are cut from slabs on purpose and that is staying. But
 * the stage is the one place the light is actually ON somebody, and a hard
 * 90-degree edge under a spot stops the highlight dead and reads as a crate.
 * This is the same box at the same size -- the silhouette does not move and
 * neither does anybody's height -- with a couple of centimetres of chamfer
 * so the light rolls round the corner instead.
 *
 * Geometry is cached by shape, because four dancers built from the same
 * dozen sizes should cost one set of them. Kept deliberately low-poly:
 * three curve segments and one bevel segment is a chamfer, not a pill.
 */
const _softGeo = new Map();
function softGeometry(w, h, d, r) {
  const rr = Math.min(r, w * 0.34, h * 0.34, d * 0.34);
  const key = `${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}:${rr.toFixed(4)}`;
  let geo = _softGeo.get(key);
  if (geo) return geo;
  // Rounded rectangle in XY, inset by the bevel so the bevel puts it back.
  const iw = w / 2 - rr;
  const ih = h / 2 - rr;
  const s = new THREE.Shape();
  s.moveTo(-iw + rr, -ih);
  s.lineTo(iw - rr, -ih);
  s.quadraticCurveTo(iw, -ih, iw, -ih + rr);
  s.lineTo(iw, ih - rr);
  s.quadraticCurveTo(iw, ih, iw - rr, ih);
  s.lineTo(-iw + rr, ih);
  s.quadraticCurveTo(-iw, ih, -iw, ih - rr);
  s.lineTo(-iw, -ih + rr);
  s.quadraticCurveTo(-iw, -ih, -iw + rr, -ih);
  geo = new THREE.ExtrudeGeometry(s, {
    depth: d - rr * 2,
    curveSegments: 3,
    bevelEnabled: true,
    bevelThickness: rr,
    bevelSize: rr,
    bevelOffset: 0,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -(d - rr * 2) / 2);
  _softGeo.set(key, geo);
  return geo;
}

/** Same call shape as build.js's box(), so a slab softens in place. */
function softBox({ size, pos, mat: material, name, rotX = 0, rotY = 0, rotZ = 0, r = 0.022 }) {
  const m = new THREE.Mesh(softGeometry(size[0], size[1], size[2], r), material);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rotX, rotY, rotZ);
  m.name = name ?? 'person.soft';
  return m;
}

/* ------------------------------------------------------------------ */
/* The corno                                                           */
/* ------------------------------------------------------------------ */

/**
 * Dimensions of the horn, published because the chain has to reserve room for
 * it before it is built. `length` is the horn alone; `neck` is the ferrule
 * between it and the bail; `bailR` is the ring the chain runs through.
 */
const HORN = Object.freeze({
  length: 0.106,
  topR: 0.0138,
  neck: 0.013,
  bailR: 0.0092,
  /* How far the whole thing reaches BEHIND the point it hangs from. The horn
   * is fattest at the top and hooks backwards at the tip, so this is the worse
   * of those two -- and the chain has to reserve it, or the hook is the one
   * part of the horn that ends up inside the man. */
  back: 0.024,
});

/**
 * A cornicello. The Italian horn, and the one piece of jewellery on this
 * roster whose SHAPE is the whole job.
 *
 * Four things make it read as a horn rather than as a gold carrot, and all
 * four are load-bearing:
 *
 * **It curves, and it curves in one plane.** A straight taper is a spike. The
 * spine below leans out and then hooks back at the tip, which is the pepper
 * shape everybody actually recognises. The curve lives mostly in X because
 * these figures are seen from the front; a horn that curved in Z would be a
 * horn that looked straight in every conversation in the game.
 *
 * **It is fattest at the top and needle-thin at the point**, on a curve rather
 * than a straight line -- `(1 - u^1.3)` keeps it broad through the first third
 * and then loses the radius quickly, which is what a real one does.
 *
 * **It is ribbed.** A smooth gold taper under one bulb takes a single long
 * highlight and reads as plastic. The rings break that into a row of separate
 * catches, and they are slanted rather than square-on because the ridges on a
 * real corno are a spiral.
 *
 * **It hangs from a bail.** Without a ring at the top the horn is a gold
 * object floating in front of a man's chest, related to the chain only by
 * being near it. The bail's axis runs along X so the chain passes THROUGH it,
 * which is why this is placed at the chain's low point rather than under it.
 *
 * Built pointing down from its own origin -- the bail centre -- so the caller
 * positions one point and gets a horn hanging off it.
 */
function makeHorn(metal) {
  const g = group('necklace.pendant.horn');

  const bail = new THREE.Mesh(
    new THREE.TorusGeometry(HORN.bailR, 0.0026, 6, 14),
    metal,
  );
  bail.name = 'necklace.pendant.horn.bail';
  bail.rotation.y = Math.PI / 2;          // the hole faces along the chain
  g.add(bail);

  // The ferrule: the collar the horn is capped with where the bail joins it.
  const cap = cylinder({
    r: HORN.topR * 0.72, h: HORN.neck,
    pos: [0, -HORN.bailR - HORN.neck / 2 + 0.002, 0], mat: metal, seg: 10,
  });
  cap.name = 'necklace.pendant.horn.cap';
  g.add(cap);

  const top = -HORN.bailR - HORN.neck + 0.003;
  const L = HORN.length;
  /* The spine, in metres, from the ferrule to the point. The last control
   * point pulls back in X and away in Z, which is the hook. */
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, top, 0),
    new THREE.Vector3(0.0068, top - L * 0.26, 0.0024),
    new THREE.Vector3(0.0186, top - L * 0.53, 0.0014),
    new THREE.Vector3(0.0284, top - L * 0.79, -0.0056),
    new THREE.Vector3(0.0288, top - L, -0.0192),
  ]);
  const radiusAt = (u) => HORN.topR * (1 - u ** 1.3) + 0.0009;

  const SEGMENTS = 13;
  const up = new THREE.Vector3(0, 1, 0);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < SEGMENTS; i++) {
    const u0 = i / SEGMENTS;
    const u1 = (i + 1) / SEGMENTS;
    spine.getPoint(u0, from);
    spine.getPoint(u1, to);
    dir.subVectors(to, from);
    const len = dir.length();
    /* CylinderGeometry takes (top, bottom) and its own +Y is the top, so the
     * far end of the segment is the "top" once it is aimed down the spine.
     * The last one closes to a real point instead of a flat disc. */
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(
        i === SEGMENTS - 1 ? 0 : radiusAt(u1),
        radiusAt(u0),
        len,
        9,
      ),
      metal,
    );
    seg.name = 'necklace.pendant.horn.segment';
    seg.position.copy(from).add(to).multiplyScalar(0.5);
    seg.quaternion.setFromUnitVectors(up, dir.normalize());
    g.add(seg);
  }

  /* The spiral ribs. Six rings, each sitting on the spine, aligned to the
   * tangent and then slanted by a constant angle -- at this scale a consistent
   * slant is what a helical ridge looks like, and it costs one rotation. */
  const RIBS = 6;
  for (let i = 0; i < RIBS; i++) {
    const u = (i + 0.6) / (RIBS + 0.4);
    spine.getPoint(u, from);
    const tangent = spine.getTangent(u).normalize();
    const r = radiusAt(u);
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.99, r * 0.19, 4, 10),
      metal,
    );
    rib.name = 'necklace.pendant.horn.rib';
    rib.position.copy(from);
    /* A torus lies in XY with its axis on +Z, so aiming +Z down the spine puts
     * the ring around the horn. */
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    rib.rotateX(0.42);
    g.add(rib);
  }

  return g;
}

export function makePerson(o = {}) {
  const {
    height = 1.78, build = 1, gut = 0, dress = 'shirt', hair = 'short',
    skin = pick(SKINS), hairColour = pick(HAIRS), shirt = pick(SHIRTS),
    bandana = false, chain = false, beard = false, glasses = false,
    gender = 'unspecified', bodyShape = 'average', adult = true,
    castShadow = true, face = null, faceCrop = FACE_CROP,
    /* Face fidelity, opted into by whoever the camera holds close. `iris`
     * pins an authored eye colour (the default draws one so a background
     * body costs nothing); `faceDetail` builds the Squatchfather head
     * standard in this rig's own slab language — whites and pupils, two
     * arched brows, a nose bridge and an upper lip. The mirror Prospect
     * wears it; a crowd should not. */
    iris: irisColour = null, faceDetail = false,
    /* `chain` is false, true/'gold', or 'silver'; `pendant` is whether it
     * ends in a medallion. Lou's is the heavy gold one with the disc on it.
     * Rippinflow wears a thin silver line and nothing hanging off it, which
     * is a different man saying a different thing with his neck. */
    pendant = true, chainStyle = 'single', pendantStyle = 'disc',
    neckline = false, luxury = false, shirtAccent = null, tie = true, tieColour = 0x6a1a24,
    pocketSquare = 0xb8a05a, watch = false,
    bracelet = false,
    /* Dinner-jacket details, all of them small and all of them the whole read
     * on the one man who needs them: a bow tie at the collar, the tuxedo front
     * behind it, and bare feet, because whoever tied him to that chair took
     * his shoes. */
    bowtie = false, bowtieColour = 0x101018, barefoot = false, tuxedo = false,
    /* Tailoring detail, off by default because a crowd of twenty extras does
     * not need waistbands. Turn it on for anyone the player stands next to.
     *   trim      collar points, placket, buttons and cuffs on a shirt;
     *             buttons, a pocket square and a real knotted tie on a suit
     *   belt      false | 'leather' | 'gold' -- a waistband and a buckle
     *   trouserFit 'plain' | 'creased' -- a front crease and turn-ups
     *   tie       false removes the business tie while retaining a tailored
     *             shirt front and collar (an open-collar dinner jacket)
     *   tieColour straight business-tie colour; pocketSquare may be a colour
     *              or false when the scene calls for plain, severe tailoring
     *   jacketColour override the garment colour independently of `shirt`,
     *             which a bomber needs because its knits are the accent
     *   patches   squadron patches on a bomber's shoulder and chest
     *   workVest  an open, sleeveless canvas layer over whatever `dress`
     *             already is -- unbuttoned, strapped over the shoulder, with a
     *             breast pocket. Two `frontPanel`s, exactly the camp shirt's
     *             own technique, so it drapes on a gut or over a belt instead
     *             of floating at a fixed depth in front of either */
    trim = false, belt = false, trouserFit = 'plain',
    jacketColour: jacketColourOption = null, waistcoatColour = 0x191920, patches = false,
    workVest = false, workVestColour = 0x33362a,
    /* Headwear, tailoring and the golf course. All off by default, because
     * every one of them is meshes on a figure and the room behind Lou does
     * not need a hat band.
     *   hat        'fedora' (the Bing) | 'flatcap' (Silver Pines)
     *   pinstripe  chalk stripes on the jacket, waistcoat and trousers
     *   threePiece a waistcoat behind an OPEN jacket -- the reason a chain
     *              worn over a suit is visible at all
     *   argyle     { a, b, line } diamonds, for the vest and the stockings
     *   knickers   plus-fours, so the sock is the leg from the knee down
     *   pattern    a repeating motif on a camp shirt's two front panels
     *   shoeStyle  'saddle' is the two-tone golf shoe
     *   gownStrapWidth  metres, the shoulder strap on `dress: 'gown'` -- 0.03
     *              is a thin evening strap; wider reads as a structured dress
     *              strap rather than a slip, without touching the bodice or
     *              skirt any other gown on the roster already relies on */
    hat = false, hatColour = null, pinstripe = false, threePiece = false,
    argyle = null, knickers = false, pattern = false, shoeStyle = 'plain',
    trouserColour = null, gownStrapWidth = 0.03,
    /* Adult performer resort/stage presentation. `curveScale` is deliberately
     * bounded below; it changes costume-covered curves only, never joints,
     * collision roots or the generic heavy-body path. */
    curveScale = 1, swimStyle = 'classic', swimAccent = null,
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
    roughness: performanceWear ? 0.52 : luxury ? 0.58 : 0.9,
    metalness: performanceWear ? 0.18 : luxury ? 0.08 : 0,
  });
  const jacketColour = jacketColourOption
    ?? (dress === 'suit' ? 0x1b1b22 : dress === 'bomber' ? 0x2f3138 : shirt);
  const jacket = mat({ color: jacketColour, roughness: 0.88 });
  /* Whether the figure has something ON over a shirt. The shoulder line, the
   * deltoids and the sleeves all have to agree about this: a bomber whose
   * shoulders were still taking the shirt colour came out sage with navy
   * epaulettes, because the garment had been added to the sleeve test and not
   * to the other two. */
  const outerwear = dress === 'suit' || dress === 'tracksuit' || dress === 'bomber';
  /* A knitted vest and a camp shirt are both "a garment with something under
   * it", and the something is what the arms and the throat wear. Kept as one
   * material so a sleeve, a collar and the strip of shirt showing at the neck
   * can never drift apart. */
  const vested = dress === 'argyle';
  const campShirt = dress === 'camp';
  const underMat = mat({
    color: shirtAccent ?? (vested ? 0xeae6db : 0xe8e6e2),
    roughness: 0.88,
  });
  const trousers = performanceWear
    ? skinMat
    : mat({
      color: trouserColour ?? (dress === 'suit' ? (jacketColourOption ?? 0x1b1b22)
        : dress === 'tracksuit' ? shirt
          : 0x232631),
      roughness: 0.92,
    });
  /* The check on a pair of plus-fours. One shade down from the cloth, because
   * a check with real contrast on a slab reads as a grid drawn on a leg. */
  const checkMat = knickers
    ? mat({
      color: new THREE.Color(trousers.color.getHex())
        .lerp(new THREE.Color(0x000000), 0.34).getHex(),
      roughness: 0.93,
    })
    : null;
  const shoe = mat({ color: 0x14141a, roughness: 0.5 });
  /* Sleeves: a tee, a bikini, a porter's vest and a gown leave the arms bare,
   * everything else covers them, and a waistcoat is a shirt with something
   * over the chest.
   *
   * A sweater vest has no sleeves at all, so its arms wear the shirt beneath
   * it; a camp shirt has sleeves that stop above the elbow, which is the
   * `shortSleeve` split below -- upper arm in cloth, everything past it bare. */
  const shortSleeve = campShirt;
  const sleeve = dress === 'tee' || performanceWear
    || dress === 'porter' || dress === 'gown'
    ? skinMat
    : vested ? underMat : (outerwear ? jacket : cloth);
  /* Whites, aprons and a gown, for the Silver Room. Kept in this builder rather
   * than a second one: the supper club needs a dozen jobs the Bing does not
   * have, and every one of them is this body with something tied over it. */
  const whites = mat({ color: 0xe8e6e0, roughness: 0.94 });
  const apronMat = mat({ color: dress === 'porter' ? 0x4a4a52 : 0xd8d5cc, roughness: 0.96 });

  /* ---- argyle ----
   *
   * Two diamond colours and an overstitch line, and that is the whole pattern.
   * It is deliberately the SAME three colours on the vest and on the stockings,
   * because that is what makes a golf outfit read as an outfit rather than as
   * a jumper and some socks -- see the colourways in src/golf/cast.js. Held as
   * one object so a scene passes a colourway rather than six loose hexes. */
  const diamonds = argyle ?? { a: 0x2f6b46, b: 0xe8e2cc, line: 0x1d3a2a };
  const diamondA = mat({ color: diamonds.a, roughness: 0.9 });
  const diamondB = mat({ color: diamonds.b, roughness: 0.9 });
  const stitchMat = mat({ color: diamonds.line, roughness: 0.92 });
  /* Chalk stripe. One shade off the cloth, never white: a stripe with real
   * contrast on a slab reads as a painted line rather than as a weave. */
  const stripeMat = pinstripe
    ? mat({
      color: new THREE.Color(jacketColour).lerp(new THREE.Color(0xffffff), 0.42).getHex(),
      roughness: 0.9,
    })
    : null;

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
  const requestedCurveScale = Number(curveScale);
  const performerCurveScale = showgirl
    ? THREE.MathUtils.clamp(Number.isFinite(requestedCurveScale) ? requestedCurveScale : 1, 1, 1.18)
    : 1;
  const normalizedSwimStyle = ['classic', 'halter', 'highwaist', 'onepiece'].includes(swimStyle)
    ? swimStyle
    : 'classic';
  const swimTrim = mat({
    color: swimAccent ?? shirt,
    roughness: 0.48,
    metalness: swimAccent === null ? 0.18 : 0.12,
  });
  /* Every structural slab on a stage figure gets its edges chamfered. It is
   * the same shape, the same size and the same style -- the owner's note was
   * "less blocky", not "not blocky" -- but nothing on the runway ends in a
   * hard right angle under the spot any more. Everyone else is unchanged, so
   * the club still reads as one cast cut from the same stock. */
  /* Chamfered slabs go to the stage roles and to the club's curvy women --
   * the bevel is geometry, not presentation, and it is the difference
   * between a figure and a stack of crates under a spot. It does NOT bring
   * any of the performer forms with it; those stay gated on `showgirl`. */
  const softFigure = showgirl || (female && curvy);
  const slab = (opts) => (softFigure
    ? softBox({ ...opts, name: `person.soft.${opts.name ?? 'slab'}` })
    : box(opts));
  const t = 0.55 + build * 0.45;          // 1.0 at build 1
  // Shoulders carry the blocky read, so they sit a little wider than the old
  // rounded frame -- still narrower than the chest is deep is wide.
  const D = (curvy ? 0.145 : 0.135) * t;                       // half chest depth
  const shoulderFrame = (female ? 0.193 : 0.226) * (0.85 + build * 0.15);
  /* The arm socket must clear the ribcage before an animation even starts.
   * The old fixed shoulder width grew much more slowly than `build`, so a
   * broad man's upper arm began several centimetres inside his shirt and no
   * later pose clamp could make that look correct. Keep a small deltoid seam,
   * but derive the minimum socket position from the actual chest and arm. */
  const chestHalf = (curvy ? 0.192 : 0.188) * t;
  const armHalf = 0.0575 * t;
  const SH = Math.max(shoulderFrame, chestHalf + armHalf - (female ? 0.022 : 0.012));
  /* A gut leans the man who carries it back a little, to counterbalance it --
   * but that lean has to live in POSITION, not rotation: Npc.update() zeroes
   * body and head rotation every single frame (see below), which is what
   * stops a raised arm sticking forever, and it would just as happily erase
   * a permanent tilt. Nudging the chest, shoulders, head and arm sockets back
   * by a couple of centimetres survives that reset because nothing there is
   * ever touched again after this function returns. */
  const gutOn = Math.max(0, gut);
  /* HOW FAR OUT THE SHOULDER SOCKET SITS, AND IT IS ONE NUMBER FOR A REASON.
   *
   * A real belly widens the whole resting silhouette, so a gutted figure's arm
   * socket moves outboard or his upper arm begins inside his own side. That is
   * right and it stays. What was wrong is that only the ARM knew about it: this
   * spread was computed down inside `arm()`, while the deltoid -- the shoulder
   * cap whose entire job is to close the seam between torso and arm -- was
   * placed at the bare `SH` a thousand lines earlier, under a comment saying
   * deltoids "remain at the fixed arm sockets". True when it was written, and
   * false from the moment the spread was added.
   *
   * Owner, 2026-08-24: *"Willys arms are detached from his body."* They were.
   * Willy carries the maximum gut on a comparatively narrow frame, which buys
   * the largest spread in the cast -- measured at 0.157 -- so his upper arms
   * hung that far outboard of the cap that was supposed to meet them, with
   * daylight between. Measured across the roster, his arms were the only ones
   * with a POSITIVE gap from the body: +0.051 a side, where Lou is -0.132 and
   * Booski -0.009. Lou has the same defect and hides it behind a wider frame.
   *
   * So it is derived once, here, and both the cap and the socket use it. */
  /* AND IT IS NOT CLAMPED DOWN TO THE BELLY, WHICH WAS THE FIRST ATTEMPT.
   *
   * The first fix capped the spread so the arm's inner face overlapped the
   * belly by a centimetre, on the theory that a socket outboard of the widest
   * body surface is a socket reaching for nothing. That is wrong twice over.
   * It is wrong about anatomy -- an arm hangs BESIDE a belly, it does not
   * embed in one, and `tests/gut-presentation.test.mjs` has required exactly
   * that separation since the belly was authored. And it is wrong about what
   * was broken: the arm was never attached to the belly. It attaches at the
   * shoulder, to the deltoid and the shoulders slab, and both of those now
   * read `armSocketX` too. Move the socket and the whole joint moves with it.
   *
   * So the original curve stands, and the seam is closed where the seam
   * actually is. */
  const armSocketX = SH + (gutOn > 0 ? (0.075 + gutOn * 0.075) * t : 0);
  const lean = gutOn > 0 ? -(0.014 + gutOn * 0.02) * t : 0;
  const gownOcclusion = dress === 'gown'
    ? { always: [], seated: [], visibleBelowHem: [] }
    : null;

  /* ---- legs ----
   * Slab thigh, slab shin, a knee block between them, and a shoe that is a
   * wedge rather than a lozenge. The pivots and lengths are the old ones to
   * the centimetre: `Npc.sit()` drops the body 0.42 and folds these joints,
   * and the seated pose is measured against the floor. */
  function leg(side) {
    const pivot = group('leg');
    // A little more daylight between the legs than the rounded frame had, or
    // two slabs this close read as one column with a seam down it.
    pivot.position.set(
      side * (curvy ? 0.118 : 0.108) * t,
      STANDING_LEG_ROOT_Y,
      0,
    );
    /* Plus-fours are cut FULL -- that is the whole point of them, and a
     * knickerbocker on a normal trouser leg is just a trouser leg with a band
     * round the bottom. Widen the thigh rather than adding a second shape. */
    const legWide = knickers && !performanceWear ? 1.16 : 1;
    pivot.add(slab({
      name: 'thigh',
      size: [0.175 * t * legWide, 0.44, 0.205 * t * legWide],
      pos: [0, -0.22, 0], mat: trousers,
    }));
    if (knickers && !performanceWear) {
      // The check: two warps and three wefts on the face of the leg.
      for (const cx of [-0.052, 0.052]) {
        pivot.add(box({
          name: 'knicker.check.warp',
          size: [0.010, 0.43, 0.008],
          pos: [cx * t, -0.22, 0.104 * t * legWide], mat: checkMat,
        }));
      }
      for (const cy of [-0.09, -0.22, -0.35]) {
        pivot.add(box({
          name: 'knicker.check.weft',
          size: [0.175 * t * legWide * 0.94, 0.010, 0.008],
          pos: [0, cy, 0.104 * t * legWide], mat: checkMat,
        }));
      }
    }
    if (trouserFit === 'creased' && !performanceWear) {
      /* The front crease. One narrow strip a shade lighter, running the length
       * of the leg -- it is what makes trousers look pressed, and on a slab it
       * is the only vertical the eye has to follow down. */
      const creaseMat = mat({
        color: new THREE.Color(trousers.color.getHex())
          .lerp(new THREE.Color(0xffffff), 0.055).getHex(),
        roughness: 0.9,
      });
      pivot.add(box({
        name: 'trouser.crease',
        size: [0.012, 0.43, 0.010],
        pos: [0, -0.22, 0.103 * t], mat: creaseMat,
      }));
      pivot.userData.creaseMat = creaseMat;
    }
    if (pinstripe && !performanceWear) {
      /* Down the front and the outside of the thigh. Two per leg is enough:
       * the eye reads "striped" off any two parallels and a full weave is
       * forty boxes a man. */
      for (const sx of [-0.045, 0.045]) {
        pivot.add(box({
          name: 'trouser.pinstripe',
          size: [0.007, 0.43, 0.008],
          pos: [sx * t, -0.22, 0.104 * t], mat: stripeMat,
        }));
      }
    }
    const shin = group('shin');
    shin.position.set(0, -0.44, 0);
    shin.add(slab({ name: 'knee', size: [0.158 * t, 0.11, 0.188 * t], pos: [0, 0, 0], mat: trousers }));
    if (knickers && !performanceWear) {
      /* ---- plus-fours ----
       *
       * A knickerbocker is not a short trouser. It is a full trouser gathered
       * and buttoned BELOW the knee, so what actually reads is the blouse: a
       * band of fabric wider than the leg, sitting under the kneecap, with the
       * stocking coming out of the bottom of it. Without that overhang the leg
       * is a trouser that has simply been cut off, which is a pair of shorts.
       */
      shin.add(box({
        name: 'knicker.blouse',
        size: [0.204 * t, 0.13, 0.234 * t],
        pos: [0, -0.055, 0], mat: trousers,
      }));
      for (const cx of [-0.052, 0.052]) {
        shin.add(box({
          name: 'knicker.check.warp',
          size: [0.010, 0.12, 0.008],
          pos: [cx * t, -0.055, 0.118 * t], mat: checkMat,
        }));
      }
      /* Wider than the blouse it gathers, or it is a band drawn INSIDE a
       * trouser leg and nobody ever sees it. */
      shin.add(box({
        name: 'knicker.band',
        size: [0.216 * t, 0.038, 0.246 * t],
        pos: [0, -0.118, 0], mat: mat({
          color: new THREE.Color(trousers.color.getHex())
            .lerp(new THREE.Color(0x000000), 0.55).getHex(),
          roughness: 0.9,
        }),
      }));
      shin.add(box({
        name: 'knicker.buckle',
        size: [0.022, 0.020, 0.010],
        pos: [0.054 * t, -0.118, 0.128 * t],
        mat: mat({ color: 0xc9b070, roughness: 0.3, metalness: 0.8 }),
      }));
      /* ---- the stocking ----
       * From under the blouse to the shoe, in the vest's own colourway, with
       * a ribbed turnover at the top and the diamonds down the front of the
       * calf where a man standing over a putt is actually seen from. */
      shin.add(box({
        name: 'stocking',
        size: [0.152 * t, 0.30, 0.177 * t],
        pos: [0, -0.29, 0], mat: diamondB,
      }));
      for (let i = 0; i < 3; i++) {
        shin.add(box({
          name: 'stocking.turnover.rib',
          size: [0.158 * t, 0.014, 0.183 * t],
          pos: [0, -0.152 - i * 0.017, 0], mat: diamondB,
        }));
      }
      for (let i = 0; i < 3; i++) {
        const dy = -0.225 - i * 0.072;
        const d = box({
          name: 'stocking.diamond',
          size: [0.052, 0.052, 0.008],
          pos: [0, dy, 0.089 * t],
          mat: i % 2 ? diamondA : stitchMat,
        });
        d.rotation.z = Math.PI / 4;
        shin.add(d);
      }
    } else {
      shin.add(slab({ name: 'shin', size: [0.15 * t, 0.42, 0.175 * t], pos: [0, -0.21, 0], mat: trousers }));
    }
    if (pinstripe && !knickers && !performanceWear) {
      for (const sx of [-0.04, 0.04]) {
        shin.add(box({
          name: 'trouser.pinstripe',
          size: [0.007, 0.41, 0.008],
          pos: [sx * t, -0.21, 0.089 * t], mat: stripeMat,
        }));
      }
    }
    if (trouserFit === 'creased' && !knickers && !performanceWear) {
      const creaseMat = pivot.userData.creaseMat;
      shin.add(box({
        name: 'trouser.crease',
        size: [0.012, 0.41, 0.010],
        pos: [0, -0.21, 0.088 * t], mat: creaseMat,
      }));
      /* Turn-ups. A hem with a cuff on it stops the leg; without one the
       * trouser runs straight into the shoe and the two read as one object. */
      shin.add(slab({
        name: 'trouser.turnup',
        size: [0.157 * t, 0.042, 0.182 * t],
        pos: [0, -0.393, 0], mat: trousers,
      }));
    }
    /* Barefoot is a smaller, skin-coloured foot rather than a missing shoe:
     * deleting the mesh leaves a trouser leg ending in mid-air. */
    const saddle = shoeStyle === 'saddle' && !barefoot;
    /* A saddle shoe is white with a dark band across the laces, and the band
     * is the entire read -- a plain white shoe at this scale is a bandage. */
    const saddleUpper = mat({ color: 0xf0ece0, roughness: 0.42 });
    const footMat = barefoot ? skinMat : (saddle ? saddleUpper : shoe);
    shin.add(box({
      name: barefoot ? 'foot.bare' : 'shoe.upper',
      size: barefoot ? [0.112, 0.056, 0.25] : [0.135, 0.068, 0.29],
      pos: [0, -0.44, barefoot ? 0.035 : 0.05], mat: footMat,
    }));
    if (saddle) {
      shin.add(box({
        name: 'shoe.saddle.band',
        size: [0.139, 0.070, 0.072],
        pos: [0, -0.439, 0.03], mat: shoe,
      }));
      shin.add(box({
        name: 'shoe.saddle.toe',
        size: [0.131, 0.062, 0.052],
        pos: [0, -0.441, 0.172], mat: shoe,
      }));
      /* The fringed tongue, which is the other half of why a golf shoe looks
       * like a golf shoe and a brogue does not. */
      shin.add(box({
        name: 'shoe.saddle.kiltie',
        size: [0.118, 0.014, 0.056],
        pos: [0, -0.406, 0.104], mat: shoe,
      }));
    }
    if (!barefoot) {
      shin.add(box({
        name: 'shoe.heel',
        size: [0.135, 0.056, 0.08], pos: [0, -0.432, -0.078],
        mat: saddle ? saddleUpper : shoe,
      }));
      /* A sole. One matte strip under a glossier upper, and the shoe stops
       * being a black wedge -- it is the cheapest possible read of "these are
       * shoes and that is a floor". */
      shin.add(box({
        name: 'shoe.sole',
        size: [0.139, 0.018, 0.30],
        pos: [0, -0.473, 0.046], mat: mat({ color: 0x24242a, roughness: 0.95 }),
      }));
      if (trim && !saddle) {
        // Toe cap and a heel counter, which is what a dress shoe has.
        shin.add(box({
          name: 'shoe.toecap',
          size: [0.129, 0.052, 0.072],
          pos: [0, -0.442, 0.162], mat: mat({ color: 0x0e0e13, roughness: 0.32 }),
        }));
        shin.add(box({
          name: 'shoe.laces',
          size: [0.046, 0.010, 0.070],
          pos: [0, -0.409, 0.058], mat: mat({ color: 0x0a0a0e, roughness: 0.9 }),
        }));
      }
    }
    pivot.add(shin);
    return pivot;
  }
  const legL = leg(-1);
  const legR = leg(1);
  g.add(legL, legR);
  if (gownOcclusion) {
    for (const legRoot of [legL, legR]) {
      const shinRoot = legRoot.children.find((child) => child.name === 'shin');
      const thigh = legRoot.getObjectByName('person.soft.thigh')
        || legRoot.getObjectByName('thigh');
      const knee = shinRoot?.getObjectByName('person.soft.knee')
        || shinRoot?.getObjectByName('knee');
      const shinMesh = shinRoot?.getObjectByName('person.soft.shin')
        || shinRoot?.getObjectByName('shin');
      for (const internal of [thigh, knee]) {
        if (!internal) continue;
        internal.visible = false;
        internal.userData.occludedBy = 'gown';
        gownOcclusion.always.push(internal);
      }
      if (shinMesh) {
        shinMesh.userData.occludedWhen = 'gown:seated';
        gownOcclusion.seated.push(shinMesh);
      }
      shinRoot?.traverse((node) => {
        if (!node.isMesh) return;
        if (node.name.startsWith('shoe.') || node.name === 'foot.bare') {
          gownOcclusion.visibleBelowHem.push(node);
        }
      });
    }
  }

  /* ---- torso ----
   * Pelvis, waist and chest are three slabs that taper into each other, so
   * the whole trunk reads as one solid shape with a waist cut into it rather
   * than as separate lumps. The performers get the hips and the chest pushed
   * out; nobody else does. */
  const breathingStructureParts = [];
  const hipHalf = (curvy ? 0.205 : 0.155) * t
    * (build > 1.15 ? 1.06 : 1) * (showgirl ? 1.08 : 1);
  const hips = slab({
    name: 'hips',
    size: [hipHalf * 2, (curvy ? 0.14 : 0.105) * 2, (curvy ? D * 1.08 : D * 0.94) * 2],
    pos: [0, 1.0, 0],
    /* On a performer the pelvis is her, not the costume -- the bikini is the
     * band and the panels below. Colouring the whole pelvis block made the
     * bottom half one magenta box from thigh to navel. */
    mat: performanceWear ? skinMat : trousers,
  });
  body.add(hips);
  /* A full opaque gown owns the visible silhouette from its skirt through its
   * overlapping bodice. Keep the named hip mesh in the rig for pose/collision
   * consumers, but do not render that internal anatomy through the faceted
   * cloth. Circumscribing this rounded rectangle with the eight-sided skirt
   * would invert the authored A-line on the widest procedural builds. */
  if (dress === 'gown') {
    hips.visible = false;
    hips.userData.occludedBy = 'gown';
    gownOcclusion.always.push(hips);
  }
  const waist = slab({
    name: 'waist',
    size: [
      // Close to the chest on a man so the trunk is one shape; cut in on a
      // woman, where the waist is the line the rest of the figure works from.
      (curvy ? 0.144 : 0.164) * t * (showgirl ? 0.86 : 1) * 2,
      0.135 * 2,
      D * 0.9 * 2,
    ],
    pos: [0, 1.15, lean],
    mat: performanceWear ? skinMat : (dress === 'suit' ? jacket : cloth),
  });
  body.add(waist);
  breathingStructureParts.push(waist);
  /* A big man is big at the middle, not at the shoulders. Anything over about
   * 1.15 build gets a front on him, which is most of what makes Lou Lou --
   * unless he has a real gut below, which stands in for this modest paunch
   * rather than stacking a second belly on top of it. */
  if (build > 1.15 && !gutOn) {
    const heavy = (build - 1) * 0.9;
    // Wide and shallow, sunk into the torso: a front, not a beach ball
    const heavyFront = box({
      name: 'torso.heavy.front',
      size: [0.37 * t, 0.27 * t, 0.21 * t],
      pos: [0, 1.18, D * (0.45 + heavy * 0.2)], mat: dress === 'suit' ? jacket : cloth,
    });
    // The shirt hangs over the belt, so the lower half is still shirt
    const heavyLower = box({
      name: 'torso.heavy.lower',
      size: [0.33 * t, 0.20 * t, 0.18 * t],
      pos: [0, 1.05, D * (0.3 + heavy * 0.2)], mat: dress === 'suit' ? jacket : cloth,
    });
    body.add(heavyFront, heavyLower);
    breathingStructureParts.push(heavyFront, heavyLower);
  }
  /* ---- gut ----
   * A real belly, general enough for any figure the cast wants one on --
   * Willy is the first, not the only. `build` thickens the whole frame
   * evenly and tops out in the modest paunch above; `gut` is a shape on top
   * of that, sized on its own. One ellipsoid gives it a genuinely round
   * silhouette; the old deep, narrow softBox read like a tube strapped to a
   * man's front. Coloured in `cloth`, not skin, so what shows is the shirt
   * stretched over it.
   *
   * Kept narrower than the hips and pulled up clear of where a seated thigh
   * swings to (a seat folds the thigh to roughly horizontal, and its
   * bounding box then tops out around y=1.01 regardless of build -- this
   * sits above that with room to spare). It is deliberately broader than it
   * is deep so Billy and Willy read as fat men rather than men with a hose
   * projecting from the waist. The gutted arm poses below keep the extra
   * width clear.
   *
   * Named so the belly can be measured on its own -- pinned against the
   * family's other seated men in tools/verify-bing.mjs -- and so an arm can
   * be checked against it directly rather than against the whole torso,
   * which an arm is supposed to sit close beside.
   */
  if (gutOn > 0) {
    const gutMat = dress === 'suit' ? jacket : cloth;
    const gutW = (0.30 + gutOn * 0.25) * t;               // full width
    /* How far the belly reaches forward.
     *
     * This used to be `(0.16 + gutOn * 0.22) * t`, and the `* t` was the bug:
     * `t` is already 0.55 + build*0.45, so a heavy frame was paid twice --
     * once in width, which is right, and again in projection, which is not.
     * A wide man's belly is WIDE. On Lou (build 1.38, gut 0.42) it came out
     * 0.47 across by 0.38 deep by 0.38 tall, which is a beach ball, and under
     * a suit it read as a bowling ball glued to the front of the jacket.
     * Projection is now `gut`'s business alone; `build` still owns the width.
     */
    const front = 0.16 + gutOn * 0.22;
    const back = -0.075;                                   // sunk into the torso behind it
    const gutH = 0.34 + Math.min(gutOn, 1.4) * 0.10;       // full height
    /* And it is a slab, not an ellipsoid.
     *
     * The whole figure is cut from chamfered boxes; the belly was the single
     * smooth surface on it, so it took one continuous highlight while
     * everything around it broke the light into facets, and the eye read it as
     * a separate round object rather than as part of the man. The earlier
     * softBox attempt failed because it was deep and narrow -- a tube strapped
     * to a man's front -- which is a proportion problem, not a primitive
     * problem, and the projection fix above is what actually addresses it.
     */
    const belly = softBox({
      name: 'person.gut.belly',
      size: [gutW, gutH, front - back],
      pos: [0, 1.15, lean + (front + back) / 2],
      mat: gutMat,
      // A generous chamfer: rounded enough to be a belly, faceted enough to
      // belong to a body cut from boxes. `slab` only chamfers curvy figures;
      // this belly must keep the same chamfer and public measurement name on
      // every build that has one.
      r: 0.075,
    });
    body.add(belly);
    breathingStructureParts.push(belly);
  }
  /* The ribcage stops above the navel rather than running down to the hips.
   * A chest slab that reaches the waistband hides the waist behind it and the
   * whole figure goes rectangular -- which is what it did on the first pass,
   * most obviously on the dancers. */
  /* BREATHING ANIMATES `torsoWrap`, NOT `torso` -- owner playtest, of Lou
   * specifically: "his shirt panels are coming way off his body".
   *
   * `torso` is a box() mesh, and box() puts an object's SIZE in its own
   * `.scale` (the unit-cube convention this whole file uses) -- so animating
   * torso.scale by a ~2% breathing factor is exactly correct for the ribcage
   * MESH. It stopped being correct the moment `frontPanel()` started
   * measuring garments off that mesh: a shirt panel is built once, and a
   * torso that then grows and shrinks every 1.5 seconds does not carry the
   * panel with it, because the panel is a SIBLING of `torso` under `body`,
   * not a child -- nothing about the ribcage's own scale animation ever
   * reaches it. On the exhale the panel is proud of the chest it is meant to
   * lie flat on; on the inhale it is buried in it. That is the "way off his
   * body": not a one-time offset but a gap that opens and closes forever.
   *
   * `torsoWrap` is a plain, unscaled Group standing where `torso` used to
   * stand; `torso` now sits at its own local origin, inside the wrap.
   * `update()` below scales the WRAP by a true ~2% multiplier instead of
   * scaling `torso` directly. The fitted structural waist/belly/heavy front
   * and every shirt panel `frontPanel()` builds ride in neutral-offset rigs
   * under the same wrap. A garment therefore follows the actual surface it
   * was fitted to, not merely another garment with the same parent. Hips stay
   * outside this breathing trunk so the pelvis remains planted. */
  const torso = slab({
    name: 'ribcage',
    size: [(curvy ? 0.192 : 0.188) * t * 2, 0.16 * 2, D * 2],
    pos: [0, 0, 0],
    /* The ribcage is also the side/back surface visible inside the shoulder
     * socket. A suit used to leave it in `cloth` (the white dress-shirt
     * material) while the deltoids and sleeves used the jacket, producing
     * bright white wedges under both raised arms. Outerwear owns the shell;
     * its deliberately exposed shirt is built separately on the front. */
    mat: performanceWear ? skinMat : (outerwear ? jacket : cloth),
  });
  const torsoWrap = group('torso-wrap', torso);
  torsoWrap.position.set(0, 1.365, lean);
  body.add(torsoWrap);
  /* Waist, belly and the optional heavy front were authored in body
   * coordinates before the chest existed. Preserve those neutral transforms
   * with the same cancelling offset used by garments, then breathe both rigs
   * through one trunk. Leaving these surfaces under `body` made Lou's
   * waistcoat open a 10.24mm world-space gap every breath even though a
   * torso-local centre test reported zero. */
  const torsoStructureRig = group('torso-structure');
  torsoStructureRig.position.copy(torsoWrap.position).multiplyScalar(-1);
  torsoWrap.add(torsoStructureRig);
  for (const part of breathingStructureParts) {
    body.remove(part);
    torsoStructureRig.add(part);
  }
  /* Details authored in body coordinates can still share the ribcage's live
   * breathing transform through this neutral-offset rig. The offset cancels
   * `torsoWrap.position` at rest; the wrapper then moves the jacket shell,
   * tailoring and jewellery as one dressed chest instead of breathing a
   * waistcoat out from under a stationary tie. */
  const torsoGarmentRig = group('torso-garments');
  torsoGarmentRig.position.copy(torsoWrap.position).multiplyScalar(-1);
  torsoWrap.add(torsoGarmentRig);
  const wearOnTorso = (part) => {
    torsoGarmentRig.add(part);
    return part;
  };
  /* Shoulders: the central slab is a fitted trunk surface; deltoids sit on the
   * arm sockets -- `armSocketX`, not `SH` -- so breathing cannot pull the
   * shoulder/arm seam and a belly cannot open one. See `armSocketX`. */
  torsoStructureRig.add(slab({ name: 'shoulders', size: [armSocketX * 2.04, 0.13, D * 2.0], pos: [0, 1.465, lean], mat: outerwear ? jacket : cloth }));
  for (const sx of [-1, 1]) {
    body.add(slab({
      name: 'deltoid',
      size: [0.118 * t, 0.11, 0.128 * t],
      pos: [sx * armSocketX, 1.45, lean],
      mat: sleeve === skinMat ? skinMat : (outerwear ? jacket : cloth),
    }));
  }

  /* ------------------------------------------------------------------ */
  /* Where the front of him actually is                                  */
  /* ------------------------------------------------------------------ */

  /**
   * The forward-most surface of the trunk, over a band of heights.
   *
   * This exists because `D` is a lie on half this roster. `D` is the half
   * depth of the RIBCAGE, and every garment detail in this builder used to be
   * placed at some multiple of it -- which is correct on a figure whose chest
   * is the front of him, and wrong on every figure carrying a paunch or a
   * gut. Lou is the case that proves it: his belly reaches nine centimetres
   * further forward than his chest does, so his waistcoat, his buttons, his
   * chalk stripes and his medallion were all being drawn INSIDE him. What you
   * saw was a man in a plain black sack with a chain floating on it.
   *
   * Everything structural is built before this point, so measuring is both
   * possible and cheap, and it keeps working for shapes nobody has built yet.
   * Call it before a garment to find out where to lay the garment.
   */
  /* Freeze the anatomical surface before any garment is added. `frontPanel`
   * used to traverse `body` live, so the first chalk stripe became part of
   * the "body" seen by the second stripe, the waistcoat measured over all six
   * stripes, and each lapel measured over the layer before it. On Lou that
   * built an order-dependent staircase more than ten centimetres off his
   * chest. Garments fit the wearer, never previously-built garments. */
  const torsoSurfaceMeshes = [];
  body.traverse((node) => {
    if (node.isMesh) torsoSurfaceMeshes.push(node);
  });
  const _frontProbe = new THREE.Box3();
  function structuralTorsoFront(y0, y1 = y0, halfWidth = 0.16) {
    body.updateMatrixWorld(true);
    let front = D;
    for (const m of torsoSurfaceMeshes) {
      _frontProbe.setFromObject(m);
      if (_frontProbe.max.y < y0 || _frontProbe.min.y > y1) continue;
      if (_frontProbe.min.x > halfWidth || _frontProbe.max.x < -halfWidth) continue;
      front = Math.max(front, _frontProbe.max.z);
    }
    return front;
  }

  /* Some later accessories deliberately clear the DRESSED figure. Lou's horn
   * is the important case: its back has to clear the waistcoat, not merely his
   * ribcage. Keep that live measurement distinct from the structural profile
   * used to CUT a garment, so layering cannot feed back into the cut itself. */
  function torsoFront(y0, y1 = y0, halfWidth = 0.16) {
    body.updateMatrixWorld(true);
    let front = D;
    body.traverse((m) => {
      if (!m.isMesh) return;
      _frontProbe.setFromObject(m);
      if (_frontProbe.max.y < y0 || _frontProbe.min.y > y1) return;
      if (_frontProbe.min.x > halfWidth || _frontProbe.max.x < -halfWidth) return;
      front = Math.max(front, _frontProbe.max.z);
    });
    return front;
  }

  /**
   * A garment panel that lies ON him instead of at a fixed depth.
   *
   * A waistcoat over a belly is not a flat board floating at chest depth: it
   * touches the chest at the top and the belly at the bottom, so it SLOPES.
   * That slope is the whole trick here -- measure the front at both ends and
   * tilt the panel to join them. On a figure with a flat front both ends come
   * back the same number, the tilt is zero, and this is exactly the flat panel
   * it always was.
   *
   * Anything that belongs on the garment -- buttons, stripes, a pattern -- is
   * added as a CHILD of the returned panel, at a small positive local z, so it
   * inherits the slope for free and can never drift off the cloth.
   *
   * It returns a GROUP rather than the cloth mesh, and that is not cosmetic:
   * `box()` carries an object's SIZE in its scale, so a button parented to the
   * mesh would be squashed by the panel's own dimensions -- a 6mm button on a
   * 20mm-thick panel came out 0.12mm thick and vanished. The group carries the
   * placement, the mesh inside it carries the size, and children of the group
   * are in plain metres.
   *
   * PARENTED TO `torsoWrap`, NOT `body` -- see the note over `torso`'s own
   * construction. `torsoFront()` reads world-space boxes, and at build time
   * nothing above `body` has moved yet, so world space and body space still
   * coincide; subtracting `torsoWrap.position` is the whole conversion from
   * a body-relative offset to a wrap-relative one. Every caller used to add
   * the returned group to `body` itself -- that add now happens here, once,
   * so a panel can never end up back on the unscaled body by a caller
   * forgetting the wrap.
   */
  function frontPanel({
    name, width, yTop, yBottom, thickness = 0.02, mat: material,
    lift = 0.004, x = 0, splay = 0,
  }) {
    const hw = Math.abs(x) + width / 2;
    const zTop = structuralTorsoFront(yTop, yTop, hw) + lift;
    const zBottom = structuralTorsoFront(yBottom, yBottom, hw) + lift;
    const h = Math.hypot(yTop - yBottom, zTop - zBottom);
    const panel = group(name);
    panel.position.set(
      x - torsoWrap.position.x,
      (yTop + yBottom) / 2 - torsoWrap.position.y,
      (zTop + zBottom) / 2 - torsoWrap.position.z,
    );
    panel.rotation.z = splay;
    panel.rotation.x = Math.atan2(zTop - zBottom, yTop - yBottom);
    panel.add(box({
      name: `${name}.cloth`,
      size: [width, h, thickness], pos: [0, 0, 0], mat: material,
    }));
    panel.userData.faceZ = thickness / 2;
    panel.userData.halfHeight = h / 2;
    torsoWrap.add(panel);
    return panel;
  }

  /* A rich knit reads in the details rather than as a louder colour. The
   * shallow ribs catch the office/bar lights, and the open V exposes a small
   * triangle of chest without replacing the existing torso or shoulder rig.
   * Both options are presentation data, so Lou and Booskibro can share the
   * finish while keeping completely different colours and silhouettes. */
  const shirtFront = D * 1.025 + 0.007;
  const accent = mat({
    color: shirtAccent ?? (luxury ? 0xc7a66a : shirt),
    roughness: luxury ? 0.52 : 0.8,
    metalness: luxury ? 0.025 : 0,
  });
  if (luxury && !performanceWear && dress !== 'suit') {
    for (const x of [-0.112, -0.084, -0.056, -0.028, 0.028, 0.056, 0.084, 0.112]) {
      const rib = box({
        name: 'shirt.luxury.rib',
        size: [0.004, 0.285, 0.006],
        pos: [x * t, 1.345, shirtFront],
        mat: accent,
      });
      wearOnTorso(rib);
    }
    const hem = box({
      name: 'shirt.luxury.hem',
      size: [0.34 * t, 0.012, 0.009],
      pos: [0, 1.205, shirtFront],
      mat: accent,
    });
    wearOnTorso(hem);
  }
  if (neckline === 'v' && !performanceWear) {
    const topY = 1.505;
    const bottomY = 1.355;
    const halfW = 0.092 * Math.min(t, 1.2);
    const shape = new THREE.Shape();
    shape.moveTo(-halfW, topY);
    shape.lineTo(halfW, topY);
    shape.lineTo(0, bottomY);
    shape.closePath();
    const opening = new THREE.Mesh(new THREE.ShapeGeometry(shape), skinMat);
    opening.name = 'shirt.neckline.v';
    opening.position.z = shirtFront + 0.005;
    wearOnTorso(opening);
    const collarLength = Math.hypot(halfW, topY - bottomY);
    for (const side of [-1, 1]) {
      const collar = box({
        name: `shirt.neckline.collar.${side < 0 ? 'left' : 'right'}`,
        size: [0.012, collarLength, 0.009],
        pos: [side * halfW * 0.5, (topY + bottomY) / 2, shirtFront + 0.012],
        mat: accent,
      });
      collar.rotation.z = side * -0.55;
      wearOnTorso(collar);
    }
  }

  /* ---- the dinner jacket ----
   *
   * The first pass at black tie was `neckline: 'v'` over a dark suit, and it
   * was wrong in a way the owner spotted immediately: the V block cuts a
   * skin-coloured triangle into the chest and hangs two pale bars either side
   * of it. On an open knit that is a collar. On a tuxedo it is a man with his
   * shirt undone to the sternum -- "a strange looking Vneck thing".
   *
   * A tuxedo is the opposite shape. The shirt is the bright thing and the
   * jacket is what is over it, so this builds the shirt as a solid bib with
   * studs down it, closes it at the waist with a cummerbund, and lays two
   * satin lapels over the top running out to the shoulders. Nothing here
   * removes any part of the torso -- it is all in front of the ribcage, on
   * the same plane the collar and the bow tie already use.
   *
   * The satin is the jacket's own colour lifted a little and taken to a low
   * roughness: on a slab figure under one bulb, a lapel reads because it
   * catches light the wool does not. */
  if (tuxedo && !performanceWear) {
    const shirtWhite = mat({ color: shirtAccent ?? 0xf0efe8, roughness: 0.62 });
    const satin = mat({
      color: new THREE.Color(jacketColour).lerp(new THREE.Color(0xffffff), 0.16).getHex(),
      roughness: 0.3,
      metalness: 0.12,
    });
    const studMat = mat({ color: 0x0a0a10, roughness: 0.35, metalness: 0.4 });
    const tuxFront = shirtFront + 0.006;
    /* The bib. Top edge under the collar line, bottom edge at the waistband.
     * Deliberately wider than the white you end up seeing: the lapels lie over
     * it and close in towards the waist, so the visible shirt narrows as it
     * descends the way a real dinner jacket makes it. Sizing the bib to the
     * gap instead leaves a slice of bare ribcage between shirt and lapel. */
    wearOnTorso(box({
      name: 'tuxedo.shirt.front',
      size: [0.17 * Math.min(t, 1.2), 0.30, 0.014],
      pos: [0, 1.352, tuxFront],
      mat: shirtWhite,
    }));
    // Shirt studs. Three, because a dress shirt has three showing.
    for (const sy of [1.428, 1.348, 1.268]) {
      wearOnTorso(box({
        name: 'tuxedo.shirt.stud',
        size: [0.016, 0.016, 0.008],
        pos: [0, sy, tuxFront + 0.009],
        mat: studMat,
      }));
    }
    /* The cummerbund. Without it the white bib stops in mid-air above the
     * trousers and the figure reads as a man in a bib, not a man in a tuxedo. */
    wearOnTorso(box({
      name: 'tuxedo.cummerbund',
      size: [0.20 * Math.min(t, 1.2), 0.052, 0.016],
      pos: [0, 1.196, tuxFront + 0.001],
      mat: mat({ color: 0x0d0d14, roughness: 0.48 }),
    }));
    /* The lapels. Each is one board leaning outward as it rises, so the pair
     * makes the wide shallow V of a dinner jacket rather than the deep narrow
     * one of an open collar -- and the shirt shows BETWEEN them instead of
     * through a hole in them. */
    for (const side of [-1, 1]) {
      const lapel = box({
        name: `tuxedo.lapel.${side < 0 ? 'left' : 'right'}`,
        size: [0.088 * Math.min(t, 1.2), 0.30, 0.016],
        pos: [side * 0.116 * Math.min(t, 1.2), 1.362, tuxFront + 0.004],
        mat: satin,
      });
      lapel.rotation.z = -side * 0.17;
      wearOnTorso(lapel);
      // The notch: a short satin wing out towards the shoulder seam.
      const notch = box({
        name: `tuxedo.lapel.notch.${side < 0 ? 'left' : 'right'}`,
        size: [0.062 * Math.min(t, 1.2), 0.052, 0.015],
        pos: [side * 0.176 * Math.min(t, 1.2), 1.475, tuxFront + 0.002],
        mat: satin,
      });
      notch.rotation.z = -side * 0.34;
      wearOnTorso(notch);
    }
    /* Breast pocket square, on his LEFT -- the figure faces +Z, so his left
     * hand is on +X and the pocket goes with it. */
    wearOnTorso(box({
      name: 'tuxedo.pocket-square',
      size: [0.048, 0.022, 0.010],
      pos: [0.182 * Math.min(t, 1.2), 1.398, tuxFront],
      mat: shirtWhite,
    }));
  }

  /* The bow tie. Two wings and a knot at the base of the throat, on the same
   * plane as the collar so it sits on the shirt rather than floating in front
   * of it. It is the single detail that turns a dark suit into a dinner
   * jacket at store-room distance. */
  if (bowtie && !performanceWear) {
    const tieMat = mat({ color: bowtieColour, roughness: 0.42 });
    // Just under the collar line the V-neck block uses, on the shirt front.
    const tieY = 1.495;
    const tieZ = (dress === 'waistcoat' ? D * 1.08 : shirtFront) + 0.016;
    for (const side of [-1, 1]) {
      const wing = box({
        name: `bowtie.wing.${side < 0 ? 'left' : 'right'}`,
        size: [0.042, 0.036, 0.014],
        pos: [side * 0.032, tieY, tieZ],
        mat: tieMat,
      });
      wing.rotation.z = side * 0.28;
      wearOnTorso(wing);
    }
    wearOnTorso(box({ name: 'bowtie.knot', size: [0.018, 0.024, 0.016], pos: [0, tieY, tieZ + 0.004], mat: tieMat }));
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
        r: 0.112 * t * performerCurveScale,
        ry: 0.108 * performerCurveScale,
        rz: 0.098 * performerCurveScale,
        pos: [sx * 0.078 * t, 1.383, D * 0.98],
        mat: cloth,
      });
      cup.name = `performer.bikini-top.${sx < 0 ? 'left' : 'right'}`;
      wearOnTorso(cup);
      curves[sx < 0 ? 'bustL' : 'bustR'] = cup;

      // Behind her, not beside her: pushed out at the hip these read as
      // saddlebags from the front instead of as a rear from the side.
      const rear = sphere({
        r: 0.132 * t * performerCurveScale,
        ry: 0.128 * performerCurveScale,
        rz: 0.122 * performerCurveScale,
        pos: [sx * 0.086 * t, 1.008, -D * 1.16],
        mat: cloth,
      });
      rear.name = `performer.bikini-bottom.rear.${sx < 0 ? 'left' : 'right'}`;
      body.add(rear);
      curves[sx < 0 ? 'rearL' : 'rearR'] = rear;

      // A hip flare, so the waist has something to be narrow against
      const flare = sphere({
        r: 0.088 * t * performerCurveScale,
        ry: 0.115 * performerCurveScale,
        rz: 0.10 * performerCurveScale,
        pos: [sx * hipHalf * 0.94, 1.03, 0],
        mat: cloth,
      });
      flare.name = `performer.bikini-bottom.hip.${sx < 0 ? 'left' : 'right'}`;
      body.add(flare);
      curves[sx < 0 ? 'hipL' : 'hipR'] = flare;

      // Over the shoulder, not past it: a strap that overshoots the shoulder
      // slab stands up beside the neck like an aerial.
      const halter = normalizedSwimStyle === 'halter';
      const strap = box({
        name: `performer.bikini-top.strap.${sx < 0 ? 'left' : 'right'}`,
        size: [0.026, 0.17, 0.02],
        pos: [sx * (halter ? 0.082 : 0.112), 1.445, D * 1.02],
        mat: cloth,
      });
      strap.rotation.z = sx * (halter ? -0.43 : -0.16);
      strap.userData.swimStyle = normalizedSwimStyle;
      wearOnTorso(strap);
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
    const highWaist = normalizedSwimStyle === 'highwaist';
    const bottomBand = box({
      name: 'performer.bikini-bottom.band',
      size: [hipHalf * 2.08, highWaist ? 0.29 : 0.19, D * 2.27],
      pos: [0, highWaist ? 1.07 : 1.02, 0],
      mat: cloth,
    });
    wearOnTorso(topBand);
    body.add(bottomBand);
    if (normalizedSwimStyle === 'onepiece') {
      const front = box({
        name: 'performer.swimwear.onepiece.front',
        size: [0.255 * t, 0.315, 0.034],
        pos: [0, 1.17, D * 1.105],
        mat: cloth,
      });
      wearOnTorso(front);
      for (const sx of [-1, 1]) {
        const sidePanel = box({
          name: `performer.swimwear.onepiece.side.${sx < 0 ? 'left' : 'right'}`,
          size: [0.026, 0.27, 0.008],
          pos: [sx * 0.116 * t, 1.17, D * 1.13],
          mat: swimTrim,
        });
        sidePanel.rotation.z = sx * -0.08;
        wearOnTorso(sidePanel);
      }
      curves.onePieceFront = front;
    }
    if (swimAccent !== null) {
      const topPiping = box({
        name: 'performer.swimwear.trim.top',
        size: [0.345 * t, 0.014, 0.034],
        pos: [0, 1.326, D * 1.095],
        mat: swimTrim,
      });
      const waistPiping = box({
        name: 'performer.swimwear.trim.waist',
        size: [hipHalf * 2.09, 0.018, D * 2.29],
        pos: [0, highWaist ? 1.205 : 1.11, 0],
        mat: swimTrim,
      });
      wearOnTorso(topPiping);
      body.add(waistPiping);
      curves.topPiping = topPiping;
      curves.waistPiping = waistPiping;
    }
    curves.topBand = topBand;
    curves.bottomBand = bottomBand;
  }

  if (dress === 'suit') {
    // A jacket is a slightly bigger torso with a shirt front cut out of it
    wearOnTorso(box({
      name: 'suit.jacket.chest',
      size: [0.365 * t, 0.46, D * 2.1], pos: [0, 1.28, 0], mat: jacket,
    }));
    if (pinstripe) {
      /* Chalk stripe, front and back. Three either side of the centre line on
       * each face: the middle of the chest is shirt, waistcoat and lapel, so a
       * stripe there is a stripe nobody ever sees.
       *
       * The front ones are panels rather than bars, because a stripe is woven
       * INTO the cloth and the cloth is over whatever the man is. Laid flat at
       * chest depth on Lou they ran straight through his middle and the whole
       * front of the suit came out plain black. */
      for (const sx of [-0.148, -0.104, -0.060, 0.060, 0.104, 0.148]) {
        // `frontPanel` parents itself to `torsoWrap` now -- see its own note.
        frontPanel({
          name: 'suit.pinstripe.front',
          width: 0.008, yTop: 1.500, yBottom: 1.060,
          thickness: 0.008, x: sx * t, mat: stripeMat, lift: 0.005,
        });
        wearOnTorso(box({
          name: 'suit.pinstripe.back',
          size: [0.008, 0.45, 0.008],
          pos: [sx * t, 1.28, -D * 1.052], mat: stripeMat,
        }));
      }
    }
    /* ---- the waistcoat, the lapels and the business tie ----
     *
     * All of it gated on `!tuxedo`. A tuxedo builds its own complete front a
     * few lines up in this same function -- bib, studs, cummerbund, satin
     * lapels, and (in the script) a bow tie -- on exactly this plane, and
     * until this gate existed this block ran anyway: Blond got a maroon
     * business necktie hidden behind his own shirt front (harmless, it lost
     * the z-fight) and, not harmless, a second pair of plain jacket-coloured
     * lapels drawn inside his satin ones at a different x and a different
     * lean, so a dark sliver of the wrong lapel showed past the satin one
     * right next to the bow tie on every figure that wore both. Blond is the
     * only tuxedo on the roster, which is the entire reason nobody had ever
     * put the two together — until the owner did, as *"we fucked up his
     * bowtie."*
     *
     * The rule the tuxedo wrote down applies again and in the same order:
     * build what is underneath first, then lay the outer garment over it. So
     * the shirt goes on, then the tie, then the waistcoat closes over the tie,
     * and only then do the lapels come across the waistcoat's edges. Do it the
     * other way round and the tie hangs over the waistcoat like a bib.
     *
     * It also earns its place mechanically: a chain worn over a BUTTONED
     * jacket is a chain nobody can see. An open jacket with a waistcoat behind
     * it is the only arrangement in which Lou's horn is on show and still
     * looks like a man wearing a suit.
     */
    const vestTop = 1.432;
    if (!tuxedo) {
      wearOnTorso(box({
        name: 'suit.shirt.front',
        size: [0.075, 0.36, 0.02],
        pos: [0, 1.36, D * 1.06],
        mat: mat({ color: shirtAccent ?? 0xe4e0d8, roughness: 0.9 }),
      }));
      if (threePiece) {
        const vestMat = mat({
          color: new THREE.Color(jacketColour).lerp(new THREE.Color(0x000000), 0.24).getHex(),
          roughness: 0.84,
        });
        const vestHalf = 0.112 * Math.min(t, 1.25);
        // `frontPanel` parents itself to `torsoWrap` now -- see its own note.
        const vest = frontPanel({
          name: 'suit.waistcoat',
          width: vestHalf * 2, yTop: vestTop, yBottom: 1.152,
          thickness: 0.022, mat: vestMat, lift: 0.008,
        });
        const face = vest.userData.faceZ;
        /* The point. A waistcoat finishes in a V below the last button, and
         * without it the garment ends in a straight hem that reads as a bib. */
        const point = box({
          name: 'suit.waistcoat.point',
          size: [vestHalf * 1.05, vestHalf * 1.05, 0.021],
          pos: [0, -vest.userData.halfHeight + 0.012, 0], mat: vestMat,
        });
        point.rotation.z = Math.PI / 4;
        vest.add(point);
        if (pinstripe) {
          for (const sx of [-0.062, 0, 0.062]) {
            vest.add(box({
              name: 'suit.waistcoat.pinstripe',
              size: [0.007, vest.userData.halfHeight * 1.88, 0.008],
              pos: [sx * Math.min(t, 1.25), 0, face + 0.003], mat: stripeMat,
            }));
          }
        }
        /* Buttons down the middle, in the panel's own space so they stay on the
         * cloth however far the belly under it tips the garment. */
        for (let i = 0; i < 4; i++) {
          const button = cylinder({
            r: 0.0085, h: 0.005, seg: 8,
            pos: [0, 0.096 - i * 0.062, face + 0.004], rotX: Math.PI / 2,
            mat: mat({ color: 0x0d0d12, roughness: 0.34, metalness: 0.3 }),
          });
          button.name = 'suit.waistcoat.button';
          vest.add(button);
        }
      }
      for (const sx of [-1, 1]) {
        /* An open jacket wears its lapels further out and leaning harder, which
         * is what opens the gap the waistcoat shows through -- and a jacket
         * front hangs on the man, so it slopes with him like everything else. */
        /* Only the plain box() branch needs adding here -- `frontPanel`
         * parents itself to `torsoWrap` now (see its own note), and adding
         * it a second time here would just reparent it back onto the
         * unscaled `body`, undoing that. */
        const lap = threePiece
          ? frontPanel({
            name: `suit.lapel.${sx < 0 ? 'left' : 'right'}`,
            width: 0.086, yTop: 1.500, yBottom: 1.190, thickness: 0.021,
            x: sx * 0.126 * Math.min(t, 1.25), mat: jacket,
            lift: 0.014, splay: sx * 0.26,
          })
          : box({
            name: `suit.lapel.${sx < 0 ? 'left' : 'right'}`,
            size: [0.07, 0.26, 0.02],
            pos: [sx * 0.06 * Math.min(t, 1.2), 1.352, D * 1.10], mat: jacket,
            rotZ: sx * 0.22,
          });
        if (!threePiece) wearOnTorso(lap);
      }
      if (tie) {
        wearOnTorso(box({
          name: 'suit.tie',
          /* Stops AT the waistcoat rather than in front of it: on a three-piece
           * the tie disappears at the top button and everything below that is
           * waistcoat. This is also what leaves the sternum free for the chain. */
          size: [0.038, threePiece ? 0.115 : 0.2, 0.018],
          pos: [0, threePiece ? (vestTop + 0.062) : 1.35, D * 1.075],
          mat: mat({ color: tieColour, roughness: 0.7 }),
        }));
      }
      if (trim) {
        /* What separates a suit from a dark rectangle: a knot at the top of the
         * tie, two buttons where a jacket actually closes, an optional pocket
         * square, and a collar with points. All of it in front of the chest,
         * none of it cutting into the figure. */
        if (tie) {
          const tieMat = mat({ color: tieColour, roughness: 0.7 });
          const knot = box({
            name: 'suit.tie.knot',
            size: [0.044, 0.042, 0.024], pos: [0, 1.462, D * 1.10], mat: tieMat,
          });
          wearOnTorso(knot);
          // The tip, wider than the neck of the tie, hanging below the last
          // button -- unless a waistcoat has already swallowed it.
          if (!threePiece) {
            wearOnTorso(box({
              name: 'suit.tie.tip',
              size: [0.046, 0.05, 0.017], pos: [0, 1.238, D * 1.09], mat: tieMat,
            }));
          }
        }
        const shirtMat = mat({ color: shirtAccent ?? 0xe4e0d8, roughness: 0.86 });
        for (const side of [-1, 1]) {
          const point = box({
            name: 'suit.collar.point',
            size: [0.052, 0.062, 0.014],
            pos: [side * 0.052, 1.455, D * 1.075], mat: shirtMat,
          });
          point.rotation.z = side * 0.34;
          wearOnTorso(point);
        }
        const buttonMat = mat({ color: 0x0d0d12, roughness: 0.34, metalness: 0.3 });
        /* An open jacket's buttons are on its own edge, out where the front
         * hangs -- not closed across a waistcoat it is not fastened over. */
        const buttonX = threePiece ? -0.152 : -0.052;
        for (const by of [1.268, 1.192]) {
          const button = cylinder({
            r: 0.0105, h: 0.005, seg: 8,
            pos: [buttonX * t, by, D * 1.10], rotX: Math.PI / 2, mat: buttonMat,
          });
          button.name = 'suit.jacket.button';
          wearOnTorso(button);
        }
        // Breast pocket square, on his left -- the figure faces +Z.
        if (pocketSquare !== false) {
          wearOnTorso(box({
            name: 'suit.pocket-square',
            size: [0.05, 0.022, 0.010],
            pos: [0.152 * t, 1.392, D * 1.115],
            mat: mat({ color: pocketSquare, roughness: 0.68 }),
          }));
        }
      }
    }               // !tuxedo
  }
  if (trim && (dress === 'shirt' || dress === 'tee') && !performanceWear && !neckline && !tuxedo) {
    /* A shirt with a front. A placket down the middle with buttons on it and
     * a collar sitting on the shoulders is the difference between a shirt and
     * a coloured torso, and it costs eight boxes. */
    const placketMat = mat({
      color: new THREE.Color(shirt).lerp(new THREE.Color(0x000000), 0.22).getHex(),
      roughness: 0.9,
    });
    wearOnTorso(box({
      name: 'shirt.placket',
      size: [0.036, 0.30, 0.012], pos: [0, 1.33, D * 1.05], mat: placketMat,
    }));
    const buttonMat = mat({ color: shirtAccent ?? 0xe8e4da, roughness: 0.5 });
    for (const by of [1.44, 1.365, 1.29, 1.215]) {
      const button = cylinder({
        r: 0.0085, h: 0.004, seg: 8,
        pos: [0, by, D * 1.062], rotX: Math.PI / 2, mat: buttonMat,
      });
      button.name = 'shirt.button';
      wearOnTorso(button);
    }
    for (const side of [-1, 1]) {
      const point = box({
        name: 'shirt.collar.point',
        size: [0.058, 0.066, 0.015],
        pos: [side * 0.055, 1.472, D * 1.02], mat: placketMat,
      });
      point.rotation.z = side * 0.3;
      wearOnTorso(point);
    }
    wearOnTorso(box({
      name: 'shirt.collar.stand',
      size: [0.19 * t, 0.036, D * 1.5], pos: [0, 1.508, lean * 0.5], mat: placketMat,
    }));
  }
  if (vested) {
    /* ---- the argyle sweater vest ----
     *
     * Same rule as the tuxedo and the waistcoat above: build the shirt first,
     * then lay the knit over it. The collared shirt is the whole torso and
     * both sleeves; the vest is a shell in front of and behind it with a V cut
     * at the throat, and the diamonds go on the front of the shell.
     *
     * The diamonds are a real lattice rather than a scatter: two interleaved
     * grids half a diamond apart, which is what makes argyle argyle. Each one
     * is a box turned 45 degrees -- on a figure cut from slabs a rotated slab
     * is a diamond, and a texture would be the only bitmap on the entire cast.
     */
    /* Keep the complete garment on the same neutral wrapper as the ribcage.
     * The shared idle animation breathes `torsoWrap`; leaving the vest as a
     * sibling made the chest recede while the knit stayed behind in space. */
    const vestRig = group('argyle.garment');
    vestRig.position.copy(torsoWrap.position).multiplyScalar(-1);
    torsoWrap.add(vestRig);
    const wear = (part) => { vestRig.add(part); return part; };
    const vestHalf = 0.196 * t;
    const vestTopY = 1.478;
    const vestBottomY = 1.192;
    /* The V, the ribs and the collar all live in the top third of the garment,
     * where nobody carries anything, so they share one plane. The diamonds do
     * not: they run down onto whatever the man's middle is doing, so each row
     * measures its own height -- one of the four on this course is Lou. */
    const vestFront = D * 1.06;
    wear(box({
      name: 'argyle.vest',
      size: [vestHalf * 2, vestTopY - vestBottomY, D * 2.12],
      pos: [0, (vestTopY + vestBottomY) / 2, 0], mat: cloth,
    }));
    /* The V. Subtractive on purpose and correct here -- what shows through it
     * is the shirt underneath, not skin, which is exactly the distinction
     * DRESSING-THE-CAST.md draws between a knit collar and a tuxedo. */
    const vBottomY = 1.352;
    const vHalf = 0.078 * Math.min(t, 1.2);
    const vShape = new THREE.Shape();
    vShape.moveTo(-vHalf, vestTopY);
    vShape.lineTo(vHalf, vestTopY);
    vShape.lineTo(0, vBottomY);
    vShape.closePath();
    const vOpen = new THREE.Mesh(new THREE.ShapeGeometry(vShape), underMat);
    vOpen.name = 'argyle.vest.opening';
    vOpen.position.z = vestFront + 0.012;
    wear(vOpen);
    // The ribbed band round the V, and the ribbed hem that stops the garment.
    for (const side of [-1, 1]) {
      const trimBar = box({
        name: 'argyle.vest.rib.v',
        size: [0.020, Math.hypot(vHalf, vestTopY - vBottomY), 0.012],
        pos: [side * vHalf * 0.5, (vestTopY + vBottomY) / 2, vestFront + 0.018],
        mat: stitchMat,
      });
      trimBar.rotation.z = side * -0.52;
      wear(trimBar);
    }
    wear(box({
      name: 'argyle.vest.rib.hem',
      size: [vestHalf * 2.02, 0.030, D * 2.14],
      pos: [0, vestBottomY + 0.012, 0], mat: stitchMat,
    }));
    // The collar of the shirt underneath, standing up out of the V.
    wear(box({
      name: 'argyle.shirt.collar.stand',
      size: [0.19 * t, 0.038, D * 1.5], pos: [0, 1.508, lean * 0.5], mat: underMat,
    }));
    for (const side of [-1, 1]) {
      const point = box({
        name: 'argyle.shirt.collar.point',
        size: [0.056, 0.064, 0.015],
        pos: [side * 0.054, 1.470, D * 1.055], mat: underMat,
      });
      point.rotation.z = side * 0.3;
      wear(point);
    }
    /* The lattice. `w`/`h` are the diamond's diagonals, and the second grid is
     * offset by half of each so the two tile edge to edge instead of leaving
     * gaps between them. Anything landing inside the V is skipped rather than
     * drawn behind it -- a diamond peeking out of a neckline is the tell that
     * the pattern was painted on afterwards. */
    const w = 0.098;
    const h = 0.104;
    for (const [grid, colour] of [[0, diamondA], [1, diamondB]]) {
      const off = grid * 0.5;
      for (let i = -2; i <= 2; i++) {
        for (let j = -1; j <= 2; j++) {
          const dx = (i + off) * w;
          const dy = 1.312 + (j + off) * h;
          if (dy > vestTopY - 0.03 || dy < vestBottomY + 0.045) continue;
          if (Math.abs(dx) > vestHalf - 0.045) continue;
          // Inside the V, where the shirt is.
          const vAt = dy > vBottomY
            ? ((dy - vBottomY) / (vestTopY - vBottomY)) * vHalf
            : 0;
          if (Math.abs(dx) < vAt + 0.028) continue;
          const diamondZ = Math.max(vestFront, structuralTorsoFront(dy, dy, vestHalf)) + 0.010;
          const d = box({
            name: 'argyle.diamond',
            size: [w * 0.66, h * 0.66, 0.008],
            pos: [dx, dy, diamondZ], mat: colour,
          });
          d.rotation.z = Math.PI / 4;
          wear(d);
          // The overstitch: one thin line through the diamond, which is the
          // detail that stops the lattice reading as a harlequin costume.
          const stitch = box({
            name: 'argyle.stitch',
            size: [0.006, h * 1.02, 0.006],
            pos: [dx, dy, diamondZ + 0.006], mat: stitchMat,
          });
          stitch.rotation.z = Math.PI / 4;
          wear(stitch);
        }
      }
    }
  }
  if (campShirt) {
    /* ---- an open camp shirt ----
     *
     * The torso is already the shirt colour, so the garment is two front
     * panels laid over a white undershirt with a gap between them, a camp
     * collar lying flat on the shoulders, and a hem that stops the sleeves.
     * Nothing is cut away: the white in the middle is a panel ADDED in front
     * of the ribcage, and the two dark panels are added in front of that.
     */
    const teeMat = mat({ color: 0xe6e3dc, roughness: 0.94 });
    /* The shirt is worn OUT, so both the tee and the fronts run past the
     * waistband -- and on Lou both of them therefore have to come over the
     * belly rather than stop above it. `frontPanel` is what does that. */
    const shirtTop = 1.498;
    const shirtBottom = 1.022;
    // `frontPanel` parents itself to `torsoWrap` now -- see its own note.
    const tee = frontPanel({
      name: 'camp.undershirt',
      width: 0.150 * Math.min(t, 1.25), yTop: shirtTop, yBottom: 1.16,
      thickness: 0.018, mat: teeMat, lift: 0.006,
    });
    // A crew neck on the undershirt, so it is a tee and not a bib.
    tee.add(box({
      name: 'camp.undershirt.neck',
      size: [0.124 * Math.min(t, 1.25), 0.028, 0.022],
      pos: [0, tee.userData.halfHeight - 0.010, 0.002], mat: teeMat,
    }));
    const placketMat = mat({
      color: new THREE.Color(shirt).lerp(new THREE.Color(0x000000), 0.28).getHex(),
      roughness: 0.9,
    });
    const tileA = mat({ color: shirtAccent ?? 0xd8cbb2, roughness: 0.9 });
    const tileB = mat({ color: 0x8f4436, roughness: 0.9 });
    for (const side of [-1, 1]) {
      /* Each front hangs open and slightly away from the middle, which is why
       * the two are splayed apart rather than parked side by side. */
      const width = 0.152 * t;
      // `frontPanel` parents itself to `torsoWrap` now -- see its own note.
      const panel = frontPanel({
        name: `camp.front.${side < 0 ? 'left' : 'right'}`,
        width, yTop: shirtTop, yBottom: shirtBottom,
        thickness: 0.020, mat: cloth, lift: 0.020,
        x: side * 0.132 * t, splay: side * 0.05,
      });
      const face = panel.userData.faceZ;
      // The turned edge of the placket, which is what makes it read as open.
      panel.add(box({
        name: 'camp.front.edge',
        size: [0.016, panel.userData.halfHeight * 2, 0.022],
        pos: [-side * (width / 2 - 0.008), 0, 0.004], mat: placketMat,
      }));
      if (pattern) {
        /* The motif. Not a print -- a grid of small tiles on the two fronts,
         * in the two accent colours, which at conversation distance is what a
         * busy shirt actually looks like. Children of the panel, so they ride
         * the same slope the cloth does. */
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 2; col++) {
            panel.add(box({
              name: 'camp.pattern.tile',
              size: [0.032, 0.020, 0.006],
              pos: [(col - 0.5) * 0.070 * t, 0.148 - row * 0.078, face + 0.002],
              mat: (row + col) % 2 ? tileA : tileB,
            }));
          }
        }
      }
      /* The camp collar: one flat wing per side, lying ON the shoulder rather
       * than standing up. That flat lie is the whole difference between a
       * camp collar and a dress collar, and it is one rotation each. */
      const wing = box({
        name: `camp.collar.${side < 0 ? 'left' : 'right'}`,
        size: [0.092 * t, 0.062, 0.032],
        pos: [side * 0.088 * t, 1.492, D * 0.90], mat: cloth,
      });
      wing.rotation.z = side * -0.34;
      wing.rotation.x = -0.42;
      wearOnTorso(wing);
    }
  }
  if (dress === 'waistcoat') {
    wearOnTorso(box({
      name: 'waistcoat.front',
      size: [0.35 * t, 0.32, D * 2.06],
      pos: [0, 1.34, 0],
      mat: mat({ color: waistcoatColour, roughness: 0.82 }),
    }));
    /* The legacy uniform used one small neck block as shorthand. A featured
     * server may request the proper two-wing bow tie above; do not stack the
     * shorthand through it. */
    if (!bowtie) {
      wearOnTorso(box({
        name: 'waistcoat.neck-tab',
        size: [0.075, 0.05, 0.02],
        pos: [0, 1.5, D * 1.05],
        mat: mat({ color: 0x6a1a24, roughness: 0.6 }),
      }));
    }
  }
  if (dress === 'work') {
    body.add(box({
      name: 'work.front',
      size: [0.35 * t, 0.22, D * 2.06], pos: [0, 1.1, 0],
      mat: mat({ color: 0x2a2a30, roughness: 0.95 }),
    }));
  }
  if (dress === 'chef') {
    // A double-breasted front: two rows of buttons is the whole silhouette
    wearOnTorso(box({
      name: 'chef.jacket',
      size: [0.355 * t, 0.42, D * 2.12], pos: [0, 1.3, 0], mat: whites,
    }));
    for (const [column, bx] of [-0.055, 0.055].entries()) {
      for (let i = 0; i < 4; i++) {
        wearOnTorso(sphere({
          name: `chef.button.${column}.${i}`,
          r: 0.014, pos: [bx * t, 1.46 - i * 0.1, D * 1.09],
          mat: mat({ color: 0xc8c4ba, roughness: 0.6 }),
        }));
      }
    }
    // Apron, from the waist down, and a towel over the shoulder
    body.add(box({
      name: 'chef.apron',
      size: [0.30 * t, 0.5, D * 2.16], pos: [0, 0.98, D * 0.1], mat: apronMat,
    }));
    const towel = box({
      name: 'chef.towel',
      size: [0.07, 0.3, 0.05], pos: [-0.17 * t, 1.4, -0.02],
      mat: mat({ color: 0xd0ccc2, roughness: 0.97 }),
    });
    towel.rotation.z = 0.2;
    body.add(towel);
  }
  if (dress === 'porter') {
    // A long apron over a bare-armed tee, tied at the back
    body.add(box({
      name: 'porter.apron',
      size: [0.32 * t, 0.72, D * 2.1], pos: [0, 0.94, D * 0.12], mat: apronMat,
    }));
    for (const [side, sx] of [['left', -1], ['right', 1]]) {
      wearOnTorso(box({
        name: `porter.strap.${side}`,
        size: [0.09, 0.34, 0.02], pos: [sx * 0.06, 1.34, D * 1.08], mat: apronMat,
      }));
    }
  }
  if (belt && !performanceWear) {
    /* A waistband and a buckle. This is the join the figure has never had --
     * shirt above, trousers below, and nothing saying where one stopped. On
     * Lou it is also the only gold on him below the neck, so it is worth the
     * four boxes.
     *
     * It sits on the hip line and is deliberately a shade darker than the
     * trousers even in leather, because a belt that matches is a stripe.
     *
     * A gown has no trousers to join to a shirt, and its skirt swallows the
     * hip line entirely -- the skirt's top radius is DEEPER than this band, so
     * a belt left at 1.145 is drawn inside the cloth and the buckle never
     * appears (rule 8: measure, do not assume). The gown's own waist is the
     * bodice/skirt seam just above it, so the band moves up onto the bodice,
     * clear of the skirt's top ring, and reads as a cinched dress belt. See
     * DeathMegatron, the one gown on the roster that wears one. */
    const gold = belt === 'gold';
    const strapMat = mat({
      color: gold ? 0x3a2a18 : 0x1a1416, roughness: 0.66, metalness: 0.04,
    });
    const buckleMat = mat({
      color: gold ? 0xd9b64a : 0xb9bec6, roughness: 0.2, metalness: 0.95,
    });
    const beltY = dress === 'gown' ? 1.19 : 1.145 + gutOn * 0.02;
    /* The bodice under a gown belt is on the BREATHING wrap and is itself
     * proud of the ribcage, so the band needs extra depth: at full inhale the
     * bodice front reaches D * 1.025 * 1.02, and a band at the suit depth
     * would be swallowed once a breath. Everyone else's belt sits on the
     * static hips and keeps the depth it always had. */
    const beltDeep = dress === 'gown' ? 1.045 : 1;
    body.add(box({
      name: 'belt.strap',
      size: [0.352 * t, 0.044, D * 2.09 * beltDeep], pos: [0, beltY, 0], mat: strapMat,
    }));
    body.add(box({
      name: 'belt.buckle',
      size: [0.062, 0.052, 0.014], pos: [0, beltY, D * 1.07 * beltDeep], mat: buckleMat,
    }));
    body.add(box({
      name: 'belt.buckle.tongue',
      size: [0.010, 0.030, 0.006], pos: [0, beltY, D * 1.085 * beltDeep], mat: strapMat,
    }));
    // Two keepers, so the strap reads as threaded rather than painted on.
    for (const side of [-1, 1]) {
      body.add(box({
        name: 'belt.keeper',
        size: [0.014, 0.050, D * 2.11 * beltDeep],
        pos: [side * 0.098 * t, beltY, 0], mat: mat({ color: 0x120e10, roughness: 0.8 }),
      }));
    }
  }

  if (workVest && !performanceWear) {
    /* ---- an open work vest ----
     *
     * A sleeveless canvas layer over whatever `dress` already built --
     * unbuttoned, strapped over the shoulder rather than sewn to it, with a
     * breast pocket. It is the camp shirt's own two-front technique
     * (`frontPanel` measures the torso at top and bottom and tilts each panel
     * to lie on it) without the camp shirt's collar or undershirt swap: a
     * vest has no collar, and what shows through the deliberate gap between
     * the fronts is the garment underneath, which is the whole point of
     * wearing this over something rather than instead of it.
     *
     * Ape is the wearer this was built for: the one who does the work,
     * dressed like it -- canvas, steel snaps, a pocket that holds something
     * -- rather than dressed like nothing. */
    const workVestMat = mat({ color: workVestColour, roughness: 0.86 });
    const workVestEdgeMat = mat({
      color: new THREE.Color(workVestColour).lerp(new THREE.Color(0x000000), 0.3).getHex(),
      roughness: 0.88,
    });
    const workVestSnapMat = mat({ color: 0x9a978c, roughness: 0.4, metalness: 0.55 });
    const vestTop = 1.498;
    const vestBottom = 1.048;
    const vestX = 0.128 * t;
    for (const side of [-1, 1]) {
      const width = 0.148 * t;
      // `frontPanel` parents itself to `torsoWrap` -- see its own note.
      const panel = frontPanel({
        name: `workvest.front.${side < 0 ? 'left' : 'right'}`,
        width, yTop: vestTop, yBottom: vestBottom,
        thickness: 0.020, mat: workVestMat, lift: 0.024,
        x: side * vestX, splay: side * 0.06,
      });
      const face = panel.userData.faceZ;
      // The turned edge of the open placket, same shape as the camp shirt's.
      panel.add(box({
        name: `workvest.front.${side < 0 ? 'left' : 'right'}.edge`,
        size: [0.016, panel.userData.halfHeight * 2, 0.022],
        pos: [-side * (width / 2 - 0.008), 0, 0.004], mat: workVestEdgeMat,
      }));
      // Two snap studs down the open edge -- a vest that fastens, worn open.
      for (const dy of [panel.userData.halfHeight * 0.35, -panel.userData.halfHeight * 0.35]) {
        panel.add(cylinder({
          name: 'workvest.snap',
          r: 0.008, h: 0.006, seg: 8, rotX: Math.PI / 2,
          pos: [-side * (width / 2 - 0.016), dy, face + 0.004], mat: workVestSnapMat,
        }));
      }
      // A patch pocket with a flap, on his left front -- the figures face +Z,
      // so a character's own left is +X (the pocket-square rule).
      if (side > 0) {
        panel.add(box({
          name: 'workvest.pocket',
          size: [width * 0.5, 0.072, 0.012],
          pos: [0, panel.userData.halfHeight * 0.3, face + 0.006], mat: workVestMat,
        }));
        panel.add(box({
          name: 'workvest.pocket.flap',
          size: [width * 0.56, 0.024, 0.014],
          pos: [0, panel.userData.halfHeight * 0.3 + 0.042, face + 0.008], mat: workVestEdgeMat,
        }));
      }
    }
    /* Shoulder straps, directly above each front so the vest hangs FROM them
     * -- the gown strap's own height and depth, which already clears the
     * head on every build on the roster; only width, x and colour differ. A
     * vest with no sleeves still has to be held up by something. */
    for (const side of [-1, 1]) {
      wearOnTorso(box({
        name: `workvest.strap.${side < 0 ? 'left' : 'right'}`,
        size: [0.080, 0.14, 0.02], pos: [side * vestX, 1.47, D * 0.4], mat: workVestMat,
      }));
    }
  }

  if (dress === 'bomber') {
    /* A flight jacket, and the thing that makes one is the knits.
     *
     * A bomber is not a coloured torso. Three ribbed bands -- collar, cuffs,
     * waistband -- in a contrasting yarn are what the eye actually reads, and
     * they are what makes the body above them look like a jacket rather than a
     * jumper. The waistband is the important one: it stops the garment at the
     * hip instead of letting it run into the trousers, which is the single
     * difference between a bomber and a shirt in the same colour.
     *
     * Built as a shell over the torso the same way the tuxedo is built in
     * front of it -- nothing here removes any part of the figure. */
    const knitColour = new THREE.Color(jacketColour).lerp(new THREE.Color(0x000000), 0.34).getHex();
    const knit = mat({ color: knitColour, roughness: 0.95 });
    const leather = mat({ color: jacketColour, roughness: 0.62, metalness: 0.06 });
    const hardware = mat({ color: 0xb9bec6, roughness: 0.24, metalness: 0.92 });

    // The shell, a touch proud of the torso all round so it hangs off it.
    wearOnTorso(box({
      name: 'bomber.shell',
      size: [0.372 * t, 0.40, D * 2.16], pos: [0, 1.31, 0], mat: leather,
    }));
    /* The waistband. Ribbed: five shallow slats rather than one band, because
     * a single box reads as a hem and the ribbing is the whole tell. */
    for (let i = 0; i < 5; i++) {
      wearOnTorso(box({
        name: 'bomber.waistband.rib',
        size: [0.378 * t, 0.019, D * 2.19],
        pos: [0, 1.128 + i * 0.021, 0],
        mat: knit,
      }));
    }
    /* The collar, standing rather than lying: a bomber's knit collar holds its
     * own shape, which is why it sits above the shoulder line. */
    wearOnTorso(box({
      name: 'bomber.collar',
      size: [0.215 * t, 0.062, D * 1.62], pos: [0, 1.532, lean * 0.5], mat: knit,
    }));
    for (const side of [-1, 1]) {
      const wing = box({
        name: 'bomber.collar.wing',
        size: [0.052 * t, 0.058, D * 0.9],
        pos: [side * 0.088 * t, 1.522, D * 0.72],
        mat: knit,
      });
      wing.rotation.y = -side * 0.42;
      wearOnTorso(wing);
    }
    /* The zip, off centre-left the way a flight jacket's is, with a pull that
     * hangs. Hardware is the only shiny thing on the garment. */
    wearOnTorso(box({
      name: 'bomber.zip.tape',
      size: [0.022, 0.40, 0.012], pos: [-0.012, 1.31, D * 1.10], mat: knit,
    }));
    wearOnTorso(box({
      name: 'bomber.zip.teeth',
      size: [0.010, 0.40, 0.008], pos: [-0.012, 1.31, D * 1.115], mat: hardware,
    }));
    wearOnTorso(box({
      name: 'bomber.zip.pull',
      size: [0.013, 0.034, 0.006], pos: [-0.012, 1.168, D * 1.125], mat: hardware,
    }));
    /* Shoulder yokes. Two seams running out to the sleeve head; on a slab
     * figure they are the only thing that says the garment has panels. */
    for (const side of [-1, 1]) {
      wearOnTorso(box({
        name: 'bomber.yoke',
        size: [0.166 * t, 0.016, D * 2.0],
        pos: [side * 0.104 * t, 1.474, 0],
        mat: knit,
      }));
    }
    // Two slash pockets at the hem, angled the way hands go into them.
    for (const side of [-1, 1]) {
      const slash = box({
        name: 'bomber.pocket.slash',
        size: [0.014, 0.108, 0.016],
        pos: [side * 0.126 * t, 1.212, D * 1.10],
        mat: knit,
      });
      slash.rotation.z = side * 0.5;
      wearOnTorso(slash);
    }
    if (patches) {
      /* Squadron flash on the chest and a name tape under it. Small, and
       * deliberately not legible -- a readable patch at this scale would be
       * three pixels of noise pretending to be text. */
      wearOnTorso(box({
        name: 'bomber.patch.squadron',
        size: [0.062, 0.062, 0.008], pos: [0.096 * t, 1.398, D * 1.10],
        mat: mat({ color: 0x8d2f2a, roughness: 0.9 }),
      }));
      wearOnTorso(box({
        name: 'bomber.patch.nametape',
        size: [0.086, 0.026, 0.007], pos: [-0.088 * t, 1.372, D * 1.10],
        mat: mat({ color: 0x6b5a34, roughness: 0.92 }),
      }));
    }
  }

  if (dress === 'gown') {
    /* A gown is a skirt: the legs still articulate underneath, so she can walk,
     * but from the waist down what you see is one falling shape. It hangs off
     * the hips rather than sitting on them, which is the difference between a
     * dress and a lampshade. */
    const gownMat = mat({ color: shirt, roughness: 0.62, metalness: 0.08 });
    // Eight sides, not fourteen: faceted enough to belong beside square limbs
    body.add(cylinder({
      name: 'gown.skirt',
      // Keep the authored hem at y=.23, but carry the same skirt up under the
      // bodice. Stopping at y=1.01 exposed the dark structural hips as a
      // brief-like band on every curvy gown.
      rTop: 0.16 * t, rBottom: 0.24 * t, h: 0.93, seg: 8,
      pos: [0, 0.695, 0], mat: gownMat,
    }));
    wearOnTorso(box({
      name: 'gown.bodice',
      size: [0.31 * t, 0.34, D * 2.05], pos: [0, 1.32, 0], mat: gownMat,
    }));
    /* Straps, and the neckline they imply. Width is the one thing that
     * differs gown to gown -- see `gownStrapWidth` above -- because a thin
     * strap reads as an evening slip and a wide one reads as a built dress,
     * and both are correct on different women. */
    for (const [side, sx] of [['left', -1], ['right', 1]]) {
      wearOnTorso(box({
        name: `gown.strap.${side}`,
        size: [gownStrapWidth, 0.14, 0.02], pos: [sx * 0.09, 1.47, D * 0.4], mat: gownMat,
      }));
    }
  }
  if (chain) {
    /* A necklace, not a hoop. The old torus floated a gold ring in the air a
     * hand's width off the sternum; this is a chain that comes over the
     * collar, drapes down the shirt front, and ends in a medallion lying flat
     * ON the chest. Everything rides just proud of the chest plane so the
     * links stay visible against the shirt instead of inside it. */
    const silver = chain === 'silver';
    const metal = silver
      ? mat({ color: 0xcfd6e0, roughness: 0.14, metalness: 0.98 })
      : mat({ color: 0xd9b64a, roughness: 0.2, metalness: 0.95 });
    /* A necklace rests on whatever covers the chest, so it follows the same
     * breathing rig for every outfit. Wrist pieces stay on their arm rigs. */
    const wearNecklace = wearOnTorso;
    const chestZ = D * (dress === 'suit' ? 1.07 : 1.02) + 0.016;
    const addDrape = ({ width, low, gauge, name, lowZ = chestZ + 0.003 }) => {
      /* The mid control points ride between the collar and wherever the low
       * point ended up, so a chain that has to come out over a belly leaves
       * the shoulders on the body and arcs forward on its way down instead of
       * kinking outward at the bottom. */
      const midZ = chestZ + (lowZ - chestZ) * 0.45;
      const drape = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-width, 1.518, D + 0.009),
        new THREE.Vector3(-width * 0.55, (1.518 + low) / 2, midZ),
        new THREE.Vector3(0, low, lowZ),
        new THREE.Vector3(width * 0.55, (1.518 + low) / 2, midZ),
        new THREE.Vector3(width, 1.518, D + 0.009),
      ]);
      /* Links, not a cable.
       *
       * A swept tube along the drape curve is a rope: one continuous surface
       * with one continuous highlight, which at any distance reads as piping.
       * A chain reads because it is made of separate pieces that each catch
       * the light at their own angle. So the curve is sampled and a short slab
       * is placed at every sample, turned to face along the tangent and
       * alternating 90 degrees the way real links interlock. The tube stays
       * underneath at a fraction of the gauge so there is no daylight between
       * links on a curve.
       */
      const links = group(name);
      const core = new THREE.Mesh(
        new THREE.TubeGeometry(drape, 28, gauge * 0.45, 6),
        metal,
      );
      core.name = `${name}.core`;
      links.add(core);
      const count = Math.max(18, Math.round(width * 260));
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i <= count; i++) {
        const u = i / count;
        const point = drape.getPoint(u);
        const tangent = drape.getTangent(u).normalize();
        const link = box({
          name: `${name}.link`,
          size: [gauge * 2.1, gauge * 2.9, gauge * 2.1],
          pos: [point.x, point.y, point.z],
          mat: metal,
        });
        link.quaternion.setFromUnitVectors(up, tangent);
        // Alternate links stand on edge, which is what makes a chain sparkle
        // rather than shine.
        if (i % 2) link.rotateY(Math.PI / 2);
        links.add(link);
      }
      wearNecklace(links);
      return links;
    };
    /* On a closed jacket the drape has to be narrow enough to pass BEHIND the
     * lapels. At the open-collar width it came up over the shoulders outside
     * them and read as a pair of braces, which is not what Lou is wearing.
     *
     * An OPEN jacket is the other case: the lapels have moved out of the way
     * and the chain hangs on the waistcoat like it would on a shirt, so it
     * gets the open-collar width and the open-collar length. */
    const openJacket = dress === 'suit' && threePiece;
    const closedJacket = (dress === 'suit' && !threePiece) || dress === 'waistcoat';
    const horn = pendant && pendantStyle === 'horn';
    const low = closedJacket ? 1.352 : openJacket ? 1.384 : 1.397;

    /* ---------------------------------------------------------------- */
    /* Where the pendant hangs                                           */
    /* ---------------------------------------------------------------- */
    /*
     * A pendant hangs in front of the MAN, and the man is not the ribcage.
     *
     * This is rule 8 again (see DRESSING-THE-CAST.md), and the chain is where
     * it bites hardest: `chestZ + 0.008` hung Lou's medallion with its lower
     * half inside his belly, and a horn -- four times as long as a disc is
     * tall -- would have been buried to the ribs. So `torsoFront` measures the
     * band of chest this pendant will actually occupy, garments included, and
     * the pendant plane clears the pendant's own BACK surface off that rather
     * than its centreline.
     *
     * The chain then meets it: the drape's low point is put ON the pendant
     * plane, so the bail is a ring the chain runs through instead of a ring
     * parked somewhere near it.
     */
    const pendantHalf = horn ? HORN.back : pendantStyle === 'crest' ? 0.006 : 0.0045;
    const pendantDrop = horn ? HORN.bailR + HORN.neck + HORN.length : 0.042;
    const pendantZ = pendant
      ? Math.max(
        chestZ + 0.008,
        torsoFront(low - pendantDrop, low + 0.03, 0.085) + pendantHalf + 0.005,
      )
      : chestZ + 0.003;

    addDrape({
      width: closedJacket ? 0.058 : 0.105,
      low,
      lowZ: pendant ? pendantZ : chestZ + 0.003,
      gauge: silver ? 0.0032 : chainStyle === 'layered' ? 0.0082 : 0.0065,
      name: silver ? 'necklace.chain.silver' : 'necklace.chain',
    });
    if (chainStyle === 'layered') {
      /* The second rope is shorter and finer, so it reads as deliberate
       * layering instead of two copies occupying the same pixels. It also
       * stops well above the pendant: two chains meeting at one ring is a
       * knot, not layering. */
      addDrape({
        width: closedJacket ? 0.05 : 0.092,
        low: closedJacket ? 1.396 : 1.435,
        gauge: silver ? 0.0025 : 0.0048,
        name: silver ? 'necklace.chain.silver.layered' : 'necklace.chain.layered',
      });
    }
    if (chainStyle === 'layered') {
      /* The clasp, at the nape. Nobody sees it from the front, and that is the
       * point -- it is there for the three-quarter-from-behind shots the club
       * cameras and the cutscenes actually use. */
      const clasp = cylinder({
        r: 0.009, h: 0.022, seg: 8,
        pos: [0, 1.524, -D * 0.92], rotZ: Math.PI / 2, mat: metal,
      });
      clasp.name = 'necklace.clasp';
      wearNecklace(clasp);
    }
    if (pendant && horn) {
      /* Hung from the low point of the chain itself, so the bail is a ring the
       * chain runs through rather than a ring parked near it. */
      const corno = makeHorn(metal);
      corno.position.set(0, low, pendantZ);
      wearNecklace(corno);
    } else if (pendant) {
      const crest = pendantStyle === 'crest';
      const disc = cylinder({
        r: crest ? 0.038 : 0.03,
        h: crest ? 0.012 : 0.009,
        pos: [0, low - (crest ? 0.026 : 0.015), pendantZ],
        rotX: Math.PI / 2,
        mat: metal,
      });
      disc.name = 'necklace.pendant';
      wearNecklace(disc);
      if (crest) {
        const insetMat = mat({ color: 0x2a1838, roughness: 0.32, metalness: 0.38 });
        const inset = cylinder({
          r: 0.024,
          h: 0.006,
          pos: [0, low - 0.026, pendantZ + 0.009],
          rotX: Math.PI / 2,
          mat: insetMat,
        });
        inset.name = 'necklace.pendant.crest';
        wearNecklace(inset);
        const crown = box({
          name: 'necklace.pendant.crown',
          size: [0.025, 0.012, 0.006],
          pos: [0, low - 0.021, pendantZ + 0.014],
          mat: metal,
        });
        wearNecklace(crown);
      }
    }
  }

  /* ---- head ----
   * Sat on a neck, with a jaw, a nose and a brow. The features are small and
   * the brow is what actually reads at three metres. */
  const head = group('head');
  head.position.set(0, 1.50, lean);
  head.add(box({
    name: 'person.neck',
    size: [0.105, 0.10, 0.105], pos: [0, 0.04, -0.005], mat: skinMat,
  }));

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
    skull.name = 'person.face.photo-skull';
    skull.position.set(0, 0.168, 0);
    head.add(skull);
    /* The mouth still exists and is still driven by the talk animation -- it
     * is simply not drawn over a photograph of a real person's mouth. Talking
     * reads on a photo head through the head movement instead. */
    mouth = box({
      name: 'person.face.mouth',
      size: [0.05, 0.011, 0.014], pos: [0, 0.112, 0.084],
      mat: mat({ color: 0x8a4a48, roughness: 0.6 }),
    });
    mouth.visible = false;
    head.add(mouth);
  } else {
    /* The skull is a slab, so its front is a flat plane at z = +0.10 and every
     * feature has to stand in front of it. On the old sphere the same numbers
     * worked because the surface fell away toward the edges; drop them onto a
     * box and the whole face sinks inside the head and the figure goes blank.
     * Each z below is chosen to clear the plane it sits on. */
    head.add(box({
      name: 'person.face.skull',
      size: [0.186, 0.216, 0.20], pos: [0, 0.165, 0], mat: skinMat,
    }));
    head.add(box({
      name: 'person.face.jaw',
      size: [0.158, 0.085, 0.19], pos: [0, 0.115, 0.012], mat: skinMat,
    }));
    head.add(box({
      name: 'person.face.chin',
      size: [0.09, 0.05, 0.05], pos: [0, 0.088, 0.095], mat: skinMat,
    }));
    for (const sx of [-1, 1]) {
      head.add(box({
        name: `person.face.ear.${sx < 0 ? 'left' : 'right'}`,
        size: [0.026, 0.058, 0.032], pos: [sx * 0.098, 0.163, -0.005], mat: skinMat,
      }));
    }
    head.add(box({
      name: 'person.face.brow',
      size: [0.15, 0.03, 0.032], pos: [0, 0.206, 0.094], mat: skinMat,
    }));
    /* Dark rectangles, because that is what reads at three metres -- the same
     * call the Squatchfather's figures make. The iris is inset in front of it
     * so there is still an eye colour when somebody leans in close. */
    for (const sx of [-1, 1]) {
      const side = sx < 0 ? 'left' : 'right';
      /* With faceDetail the slab is the WHITE of the eye rather than a dark
       * socket, which is what makes the iris and pupil read as an eye at
       * mirror distance instead of a hole. */
      head.add(box({
        name: `person.face.eye.${side}`,
        size: [0.042, 0.03, 0.014], pos: [sx * 0.036, 0.181, 0.103],
        mat: mat({ color: faceDetail ? 0xd8d2c4 : 0x1a1410, roughness: 0.5 }),
      }));
      const iris = box({
        name: `person.face.iris.${side}`,
        size: [0.018, 0.017, 0.01], pos: [sx * 0.036, 0.1815, 0.111],
        mat: mat({
          color: irisColour ?? pick([0x3a2a18, 0x2a3a4a, 0x2a4a2a]), roughness: 0.35,
        }),
      });
      head.add(iris);
      eyes.push(iris);
      if (faceDetail) {
        head.add(box({
          name: `person.face.pupil.${side}`,
          size: [0.009, 0.009, 0.006], pos: [sx * 0.036, 0.1815, 0.117],
          mat: mat({ color: 0x131008, roughness: 0.3 }),
        }));
        /* Two arched brows in the hair's colour over the skin ridge — outer
         * ends up, the Squatchfather figures' own browTilt. */
        head.add(box({
          name: `person.face.browline.${side}`,
          size: [0.058, 0.016, 0.02], pos: [sx * 0.038, 0.2085, 0.104],
          rotZ: sx * 0.09,
          mat: mat({ color: (hairColour & 0xfefefe) >> 1, roughness: 0.85 }),
        }));
      }
    }
    head.add(box({
      name: 'person.face.nose',
      size: [0.032, 0.052, 0.042], pos: [0, 0.156, 0.113], mat: skinMat,
    }));
    mouth = box({
      name: 'person.face.mouth',
      size: [0.052, 0.012, 0.016], pos: [0, 0.113, 0.114],
      mat: mat({ color: 0x8a4a48, roughness: 0.6 }),
    });
    head.add(mouth);
    if (faceDetail) {
      /* The two-part nose and the upper lip from the Squatchfather standard:
       * a bridge running up between the eyes, and a skin-dark lip over the
       * driven mouth so it reads as lips, not a painted line. The mouth mesh
       * itself stays the animation's — only the dressing is new. */
      head.add(box({
        name: 'person.face.nose.bridge',
        size: [0.022, 0.042, 0.024], pos: [0, 0.188, 0.105], mat: skinMat,
      }));
      head.add(box({
        name: 'person.face.lip.upper',
        size: [0.05, 0.009, 0.014], pos: [0, 0.1215, 0.1135],
        mat: mat({ color: 0x9a6050, roughness: 0.65 }),
      }));
    }
  }

  if (hair !== 'bald' && !face) {
    /* Shaped hair masses rather than one block cap. The single box read as a
     * painter's cap from across the room -- worst on the performers, where the
     * hair is half the look. Every style is built from the same three ideas:
     * a crown that wraps the top of the skull, hair at the back of the head,
     * and whatever the style does with the front and the sides. Nothing here
     * rises above the old cap's crown line, so nobody's height moves. */
    const hairPiece = (name, o) => {
      const m = box({ name: `person.hair.${name}`, ...o, mat: hairMat });
      head.add(m);
      return m;
    };
    if (hair === 'short') {
      hairPiece('crown', { size: [0.196, 0.055, 0.21], pos: [0, 0.257, -0.01] });
      hairPiece('fringe', { size: [0.188, 0.045, 0.03], pos: [0, 0.245, 0.088] });
      hairPiece('back', { size: [0.19, 0.115, 0.032], pos: [0, 0.196, -0.106] });
      for (const sx of [-1, 1]) {
        hairPiece(`side.${sx < 0 ? 'left' : 'right'}`, { size: [0.026, 0.085, 0.16], pos: [sx * 0.102, 0.21, -0.02] });
      }
    }
    if (hair === 'crop') {
      // Clipped tight: a low crown and a shadow of it down the back
      hairPiece('crown', { size: [0.192, 0.042, 0.205], pos: [0, 0.252, -0.008] });
      hairPiece('back', { size: [0.186, 0.07, 0.026], pos: [0, 0.212, -0.104] });
      for (const sx of [-1, 1]) {
        hairPiece(`side.${sx < 0 ? 'left' : 'right'}`, { size: [0.02, 0.06, 0.14], pos: [sx * 0.099, 0.222, -0.022] });
      }
    }
    if (hair === 'receding') {
      // The horseshoe: bare in front, a thin patch pushed back, full round the ears
      hairPiece('crown', { size: [0.15, 0.038, 0.125], pos: [0, 0.256, -0.06] });
      hairPiece('back', { size: [0.188, 0.09, 0.03], pos: [0, 0.185, -0.105] });
      for (const sx of [-1, 1]) {
        hairPiece(`side.${sx < 0 ? 'left' : 'right'}`, { size: [0.028, 0.075, 0.15], pos: [sx * 0.103, 0.19, -0.03] });
      }
    }
    if (hair === 'long') {
      hairPiece('crown', { size: [0.198, 0.06, 0.215], pos: [0, 0.255, -0.01] });
      hairPiece('fringe', { size: [0.19, 0.05, 0.032], pos: [0, 0.243, 0.09] });
      // The fall: down the back to the shoulder blades, thin like hair is
      hairPiece('fall', { size: [0.185, 0.3, 0.045], pos: [0, 0.065, -0.115] });
      /* Framing panels down either side of the face. Without them long hair
       * is all behind the head, and from the front -- which is every
       * conversation in the club -- a blonde and a brunette look identical. */
      for (const sx of [-1, 1]) {
        const panel = hairPiece(`side.${sx < 0 ? 'left' : 'right'}`, { size: [0.034, 0.24, 0.16], pos: [sx * 0.105, 0.1, -0.025] });
        panel.rotation.z = sx * -0.05;   // flares very slightly away from the jaw
      }
    }
    if (hair === 'tied') {
      hairPiece('crown', { size: [0.194, 0.05, 0.212], pos: [0, 0.253, -0.012] });
      hairPiece('sweep', { size: [0.182, 0.06, 0.05], pos: [0, 0.232, -0.098] });
      hairPiece('bun', { size: [0.08, 0.08, 0.075], pos: [0, 0.155, -0.125] });
      hairPiece('band', { size: [0.088, 0.016, 0.083], pos: [0, 0.198, -0.122] });
      for (const sx of [-1, 1]) {
        hairPiece(`side.${sx < 0 ? 'left' : 'right'}`, { size: [0.022, 0.07, 0.15], pos: [sx * 0.1, 0.215, -0.025] });
      }
    }
  }
  if (beard && !face) {
    head.add(box({
      name: 'person.face.beard',
      size: [0.15, 0.075, 0.16], pos: [0, 0.105, 0.04], mat: hairMat,
    }));
  }
  /* `&& !face` for the same reason as the hair above and the beard just now:
   * a photograph brings its own eyewear, or its own lack of it. Lag is the
   * only member on the roster with `glasses: true` and the man in lag.png is
   * not wearing any, so without this he got a pair of black plastic frames
   * hovering in front of a photo of his bare eyes. This is the guard the
   * comment on the photo-skull already claimed was here -- "none of the
   * procedural features get built on top of it" -- and glasses were the one
   * facial feature that never got it. */
  if (glasses && !face) {
    for (const sx of [-1, 1]) {
      head.add(box({
        name: `person.glasses.lens.${sx < 0 ? 'left' : 'right'}`,
        size: [0.042, 0.032, 0.004], pos: [sx * 0.034, 0.181, 0.096],
        mat: mat({ color: 0x14141a, roughness: 0.35 }),
      }));
    }
    head.add(box({
      name: 'person.glasses.bridge',
      size: [0.03, 0.004, 0.004], pos: [0, 0.181, 0.096],
      mat: mat({ color: 0x14141a, roughness: 0.35 }),
    }));
  }
  if (hat) {
    /* ---- headwear ----
     *
     * A hat is a crown and a brim and the relationship between them, and that
     * relationship is the entire difference between the two here: a fedora's
     * crown is tall and its brim reaches past the shoulders of the face, while
     * a flat cap has almost no crown and a stub of a peak at the front only.
     *
     * Both sit ON the hair rather than instead of it, because the photo faces
     * bring their own hair and a hat that replaced it would take the man's
     * hairline with it.
     */
    const feltMat = mat({
      color: hatColour ?? (hat === 'fedora' ? 0x4a3a28 : 0x5a5f52),
      roughness: hat === 'fedora' ? 0.94 : 0.97,
    });
    if (hat === 'fedora') {
      const brim = cylinder({
        r: 0.168, h: 0.014, pos: [0, 0.276, -0.006], mat: feltMat,
      });
      brim.name = 'hat.fedora.brim';
      brim.rotation.x = -0.07;             // snapped down at the front
      head.add(brim);
      head.add(box({
        name: 'hat.fedora.crown',
        size: [0.176, 0.116, 0.188], pos: [0, 0.338, -0.006], mat: feltMat,
      }));
      /* The pinch. Two blocks either side of a gap down the middle of the
       * crown -- without it a fedora is a top hat that was cut short. */
      for (const sx of [-1, 1]) {
        const pinch = box({
          name: 'hat.fedora.pinch',
          size: [0.048, 0.040, 0.13], pos: [sx * 0.055, 0.404, -0.006], mat: feltMat,
        });
        pinch.rotation.z = sx * 0.16;
        head.add(pinch);
      }
      head.add(box({
        name: 'hat.fedora.band',
        size: [0.182, 0.030, 0.194], pos: [0, 0.294, -0.006],
        mat: mat({ color: 0x1b1a1e, roughness: 0.7 }),
      }));
    } else {
      // Flat cap: a low crown pulled forward, and a short stiff peak.
      const crown = box({
        name: 'hat.flatcap.crown',
        size: [0.212, 0.070, 0.216], pos: [0, 0.268, -0.014], mat: feltMat,
      });
      crown.rotation.x = -0.10;
      head.add(crown);
      /* Pulled forward over the brow, which is where the peak has to start
       * from or it reads as a peakless beanie in a front three-quarter. */
      head.add(box({
        name: 'hat.flatcap.front',
        size: [0.206, 0.046, 0.052], pos: [0, 0.252, 0.086], mat: feltMat,
      }));
      const peak = box({
        name: 'hat.flatcap.peak',
        size: [0.186, 0.016, 0.098], pos: [0, 0.234, 0.150], mat: feltMat,
      });
      peak.rotation.x = 0.26;
      head.add(peak);
      /* The button on top, which is the one detail that says "cap" and not
       * "beret" from behind. */
      const stud = cylinder({
        r: 0.014, h: 0.008, pos: [0, 0.306, -0.016], mat: feltMat,
      });
      stud.name = 'hat.flatcap.button';
      head.add(stud);
    }
  }
  if (bandana) {
    head.add(box({
      name: 'person.bandana.wrap',
      size: [0.185, 0.048, 0.195], pos: [0, 0.222, -0.006],
      mat: mat({ color: BANDANA, roughness: 0.92 }),
    }));
    const tail = box({
      name: 'person.bandana.tail',
      size: [0.035, 0.115, 0.018], pos: [0.012, 0.185, -0.1],
      mat: mat({ color: BANDANA, roughness: 0.92 }),
    });
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
    /* The socket is `armSocketX`, derived once beside `SH` so the deltoid that
     * caps this joint is placed from the same number. See the note there. */
    pivot.position.set(side * armSocketX, 1.44, lean);
    pivot.add(slab({ name: 'upperarm', size: [0.115 * t, 0.30, 0.125 * t], pos: [0, -0.15, 0], mat: sleeve }));
    if (shortSleeve) {
      /* A short sleeve is not a shorter arm. The upper arm keeps the shirt and
       * a hem stops it above the elbow, and everything past that hem is the
       * man -- which is also what makes the watch and the bracelet below the
       * two things anybody actually looks at on this outfit. */
      pivot.add(box({
        name: 'camp.sleeve.hem',
        size: [0.124 * t, 0.026, 0.134 * t],
        pos: [0, -0.238, 0], mat: mat({
          color: new THREE.Color(shirt).lerp(new THREE.Color(0x000000), 0.28).getHex(),
          roughness: 0.9,
        }),
      }));
    }
    if (pinstripe && sleeve === jacket) {
      pivot.add(box({
        name: 'suit.pinstripe.sleeve',
        size: [0.008, 0.29, 0.008],
        pos: [side * 0.03 * t, -0.15, 0.064 * t], mat: stripeMat,
      }));
    }
    const fore = group('forearm');
    fore.position.set(0, -0.30, 0);
    const foreMat = shortSleeve ? skinMat : sleeve;
    fore.add(slab({ name: 'elbow', size: [0.105 * t, 0.10, 0.115 * t], pos: [0, 0, 0], mat: foreMat }));
    fore.add(slab({ name: 'forearm', size: [0.10 * t, 0.27, 0.105 * t], pos: [0, -0.135, 0], mat: dress === 'waistcoat' ? cloth : foreMat }));
    fore.add(slab({ name: 'hand', size: [0.085, 0.115, 0.065], pos: [0, -0.3, 0.005], mat: skinMat }));
    /* THE HAND SOCKET -- where a prop goes.
     *
     * The hand slab above is a real hand and stays a direct child of the
     * forearm, because that is what every existing measurement looks for. But
     * it is NOT something you can hang a beer off: `box()` carries a mesh's
     * SIZE in its scale (see the note over `mouth.userData.base`), so a can
     * parented to the hand slab would be squashed to 0.085 x 0.115 x 0.065 of
     * itself, while the same can parented to a CHAMFERED figure's hand -- a
     * `softBox`, which has real geometry and unit scale -- would come out full
     * size. Two different results from one line of caller code.
     *
     * So the attach point is this empty Group, sitting exactly on the hand's
     * centre with an unscaled basis: +Y is up the arm, +Z is out the back of
     * the hand, and the origin is the middle of the fist. Callers place props
     * in those terms and stop guessing forearm offsets -- which is what golf's
     * beer cans were doing, at a hand-tuned y = -0.30 that put the can in
     * front of the wrist rather than in the hand. */
    const hand = group('hand.socket');
    hand.position.set(0, -0.3, 0.005);
    fore.add(hand);
    /* Where the sleeve's surface actually is. Every piece of jewellery below
     * is placed off this rather than off a hand-tuned constant, which is what
     * stops it disappearing inside a heavier man's arm -- see the watch. */
    const armFrontZ = 0.0525 * t;
    const armHalfX = 0.05 * t;
    if (dress === 'bomber') {
      /* The cuff, in the same ribbed yarn as the waistband and collar. Three
       * bands is enough to read as knit; the point is that the sleeve stops
       * with something rather than just ending. */
      const cuffKnit = mat({
        color: new THREE.Color(jacketColour).lerp(new THREE.Color(0x000000), 0.34).getHex(),
        roughness: 0.95,
      });
      for (let i = 0; i < 3; i++) {
        fore.add(slab({
          name: 'bomber.cuff.rib',
          size: [0.106 * t, 0.020, 0.111 * t],
          pos: [0, -0.234 - i * 0.022, 0],
          mat: cuffKnit,
        }));
      }
      /* Pen pocket on the left upper sleeve, which is the detail that says
       * flight jacket rather than varsity jacket. */
      if (side < 0) {
        pivot.add(box({
          name: 'bomber.sleeve.pocket',
          size: [0.062, 0.086, 0.014],
          pos: [-0.062 * t, -0.14, 0.006], mat: cuffKnit,
        }));
        for (const px of [-0.014, 0.014]) {
          pivot.add(box({
            name: 'bomber.sleeve.pen',
            size: [0.008, 0.05, 0.008],
            pos: [-0.062 * t + px, -0.104, 0.012],
            mat: mat({ color: 0x1c1c22, roughness: 0.4 }),
          }));
        }
      }
    }
    if (trim && (dress === 'shirt' || dress === 'suit' || dress === 'waistcoat') && !performanceWear) {
      /* A shirt cuff showing past the jacket sleeve. On a suit this is the
       * half-inch of white that separates a man who owns his clothes from a
       * man wearing a rectangle. */
      const cuffMat = mat({ color: shirtAccent ?? 0xe4e0d8, roughness: 0.86 });
      const cuff = slab({
        name: 'shirt.cuff',
        size: [0.098 * t, 0.032, 0.103 * t],
        pos: [0, -0.256, 0.001], mat: cuffMat,
      });
      /* Keep one public name across the box and chamfered variants. The soft
       * branch namespaces structural slabs, but this garment is consumed by
       * the same watch-clearance contract on every body shape. */
      cuff.name = 'shirt.cuff';
      fore.add(cuff);
      /* Proud of the cuff, not inside it. At z 0.03 this sat well behind the
       * cuff's own front face and was a gold cube buried in a sleeve. */
      fore.add(box({
        name: 'shirt.cuff.link',
        size: [0.009, 0.009, 0.007],
        pos: [side * 0.048 * t, -0.256, armFrontZ + 0.006], mat: mat({
          color: watch === 'silver' ? 0xdce2e8 : 0xd9b64a, roughness: 0.2, metalness: 0.9,
        }),
      }));
    }
    if (watch && side > 0) {
      /* A watch, not a coin on a hoop.
       *
       * On his own LEFT wrist, which is +X -- the figures face +Z, so a
       * character's own left hand is on +X and the pocket square has always
       * been placed at +0.182 for that reason. The watch was on -X, which is
       * his right hand, while both this file and DRESSING-THE-CAST.md said
       * "left". It is invisible in a front view and wrong the moment anybody
       * turns round, which is the exact failure the handedness note warns
       * about.
       *
       * The old one was a torus with two discs stacked on it, which at three
       * metres is a bracelet with a button on it. A wristwatch reads because
       * of four things, in this order: a bracelet that wraps the wrist in
       * links rather than a smooth ring, lugs joining the case to it, a bezel
       * standing proud of the dial, and a crown on the side. The hands are the
       * last thing anyone sees and the first thing everybody expects, so they
       * are here too and they are stopped at ten past ten, the way a watch is
       * photographed.
       *
       * ---- and it has to be OUTSIDE the arm ----
       *
       * Every dimension here used to be an absolute constant against a forearm
       * that scales with `build`. The forearm's front face is at 0.0525 * t and
       * the case sat at 0.045 * t, so on ANY figure the case was inside the
       * sleeve, and on Lou -- t = 1.17 -- the bezel was inside it too. What you
       * actually saw was four markers and two hands floating on a sleeve.
       * Likewise the bracelet: it ringed the wrist at 0.0355 * t, which is
       * inside a slab whose half-width is 0.05 * t, so not one link of it was
       * ever drawn. It was a gold watch nobody could see.
       *
       * Everything below is therefore measured off `armFrontZ` and `armHalfX`.
       * The caseback sinks slightly INTO the wrist, the way a watch worn by a
       * person does; every part of it that is meant to be seen is in front of
       * the sleeve by construction rather than by luck.
       */
      const silverWatch = watch === 'silver';
      const watchMetal = mat({
        color: silverWatch ? 0xdce2e8 : 0xe0b94f,
        roughness: 0.14,
        metalness: 0.98,
      });
      const caseR = 0.0245;
      /* Up the forearm far enough that the case clears both the shirt cuff
       * (top edge -0.240) and the top of the hand (-0.2425). A watch sits
       * above the cuff; it does not share the wrist bone with it. */
      const wristY = -0.210;
      const faceZ = armFrontZ + 0.004;
      const wrist = armHalfX + 0.0065;

      /* The bracelet. Ten links around the wrist, each a slab tangent to the
       * circle, so it catches light in facets the way a metal bracelet does
       * and a swept tube does not. The two under the arm are dropped -- they
       * are never seen and they are where the geometry would z-fight. */
      const bracelet = group('person.watch.bracelet');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
        if (Math.cos(a) > 0.72) continue;
        const link = box({
          name: 'person.watch.link',
          size: [0.0125, 0.0175, 0.0075],
          pos: [Math.sin(a) * wrist, 0, Math.cos(a) * wrist * 1.06],
          mat: watchMetal,
        });
        link.rotation.y = a;
        bracelet.add(link);
      }
      bracelet.position.set(0, wristY, 0.002);
      fore.add(bracelet);

      /* Lugs: the two horns the case hangs between. Deep enough to bridge from
       * inside the sleeve out to the caseback, so the watch is joined to the
       * arm rather than hovering off it. */
      for (const ly of [-0.019, 0.019]) {
        fore.add(box({
          name: 'person.watch.lug',
          size: [0.030, 0.010, 0.016],
          pos: [0, wristY + ly, faceZ - 0.006],
          mat: watchMetal,
        }));
      }
      // The case, then a bezel standing proud of it.
      const dial = cylinder({
        r: caseR, h: 0.011, pos: [0, wristY, faceZ], rotX: Math.PI / 2, mat: watchMetal,
      });
      dial.name = 'person.watch.dial';
      fore.add(dial);
      const bezel = new THREE.Mesh(
        new THREE.TorusGeometry(0.0225, 0.0042, 6, 20),
        watchMetal,
      );
      bezel.name = 'person.watch.bezel';
      bezel.position.set(0, wristY, faceZ + 0.007);
      /* No rotation. A torus already lies in XY with its axis on +Z, which is
       * the way the dial faces -- the PI/2 that used to be here tipped the
       * bezel onto its side, so it was a hoop passing THROUGH the watch rather
       * than a ring around it. It was invisible while the whole case was
       * buried in the sleeve; it is not invisible now. */
      fore.add(bezel);
      // The face, dark and slightly glossy so it reads as glass over a dial.
      const faceMat = mat({
        color: silverWatch ? 0x141821 : 0x1a1208, roughness: 0.14, metalness: 0.4,
      });
      const dialFace = cylinder({
        r: 0.0195, h: 0.004, pos: [0, wristY, faceZ + 0.0072], rotX: Math.PI / 2, mat: faceMat,
      });
      dialFace.name = 'person.watch.face';
      fore.add(dialFace);
      // Four markers at the quarters, and the hands at ten past ten.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        fore.add(box({
          name: 'person.watch.marker',
          size: [0.0035, 0.0055, 0.002],
          pos: [Math.sin(a) * 0.0148, wristY + Math.cos(a) * 0.0148, faceZ + 0.0095],
          mat: watchMetal,
        }));
      }
      for (const [len, ang, name] of [[0.0125, -1.05, 'hour'], [0.0165, 0.52, 'minute']]) {
        const hand = box({
          name: `person.watch.hand.${name}`,
          size: [0.0022, len, 0.0016],
          pos: [Math.sin(ang) * len * 0.5, wristY + Math.cos(ang) * len * 0.5, faceZ + 0.0102],
          mat: watchMetal,
        });
        hand.rotation.z = -ang;
        fore.add(hand);
      }
      /* The crown, on the right of the case as worn -- pushed out past the
       * arm's own half-width as well as past its front, or on a heavy build it
       * is a stub inside a sleeve beside a watch. */
      const crown = cylinder({
        r: 0.0042, h: 0.007, seg: 8,
        pos: [Math.max(caseR + 0.003, armHalfX + 0.004), wristY, faceZ + 0.002],
        rotZ: Math.PI / 2, mat: watchMetal,
      });
      crown.name = 'person.watch.crown';
      fore.add(crown);
      // A stable name for the whole assembly, for tests and for the ledger.
      const braceletName = silverWatch ? 'person.watch.band.silver' : 'person.watch.band.gold';
      bracelet.name = braceletName;
    }
    if (bracelet && side < 0) {
      /* ---- the other wrist ----
       *
       * A gold ID bracelet, and it goes on the hand the watch is not on. That
       * is the only rule it needs: two heavy gold things on one forearm is a
       * man wearing a watch twice, and keeping them on opposite sides is also
       * what lets both be named, found and measured independently.
       *
       * Same construction as the watch band -- links tangent to a ring wider
       * than the arm -- with a flat plate across the front of the wrist, which
       * is the whole difference between an ID bracelet and a watch strap that
       * lost its watch.
       */
      const silverBand = bracelet === 'silver';
      const bandMetal = mat({
        color: silverBand ? 0xdce2e8 : 0xe0b94f, roughness: 0.16, metalness: 0.97,
      });
      const ring = armHalfX + 0.006;
      const bandY = -0.222;
      const links = group(silverBand ? 'person.bracelet.silver' : 'person.bracelet.gold');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
        if (Math.cos(a) > 0.80) continue;         // behind the plate
        const link = box({
          name: 'person.bracelet.link',
          size: [0.0138, 0.0142, 0.0082],
          pos: [Math.sin(a) * ring, 0, Math.cos(a) * ring * 1.06],
          mat: bandMetal,
        });
        link.rotation.y = a;
        links.add(link);
      }
      links.position.set(0, bandY, 0.002);
      fore.add(links);
      fore.add(box({
        name: 'person.bracelet.plate',
        size: [0.030, 0.019, 0.007],
        pos: [0, bandY, armFrontZ + 0.005], mat: bandMetal,
      }));
    }
    pivot.add(fore);
    pivot.userData.fore = fore;
    pivot.userData.hand = hand;
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
    build,
    gut: gutOn,
    curveScale: performerCurveScale,
    swimStyle: showgirl ? normalizedSwimStyle : false,
    swimAccent: showgirl ? swimAccent : null,
    neckline: neckline || 'crew',
    tie: !!tie,
    tuxedo: !!tuxedo,
    bowtie: !!bowtie,
    barefoot: !!barefoot,
    luxury: !!luxury,
    watch: watch || false,
    bracelet: bracelet || false,
    chainStyle: chain ? chainStyle : false,
    pendantStyle: chain && pendant ? pendantStyle : false,
    hat: hat || false,
    pinstripe: !!pinstripe,
    threePiece: !!threePiece,
    knickers: !!knickers,
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
   * Breathing did exactly that, and the club filled up with pale boxes.
   *
   * `torso` itself no longer needs a captured base: breathing now scales
   * `torsoWrap` (a plain, always-neutral Group) by a true multiplier instead
   * of scaling the ribcage mesh's own SIZE every frame -- see the note over
   * `torso`'s construction and `update()` below. `mouth` still uses this
   * pattern directly, because nothing hangs off the mouth the way a shirt
   * panel hangs off the chest. */
  mouth.userData.base = mouth.scale.clone();

  return {
    group: g, body, head, eyes, mouth, torso, torsoWrap, torsoStructureRig, waist, hips, curves,
    profile: g.userData.profile,
    heightScale, gownOcclusion,
    armL, armR, legL, legR,
    foreL: armL.userData.fore, foreR: armR.userData.fore,
    /* Hand sockets. `foreL`/`foreR` stay exactly what they were -- half the
     * game poses arms through them and the Siege, the golfers' clubs and the
     * Silvercase revolvers all hang off the forearm on purpose. `handL`/`handR`
     * are the addition: an unscaled attach point at the middle of the fist for
     * anything that is meant to be HELD. */
    handL: armL.userData.hand, handR: armR.userData.hand,
    shinL: legL.children.find((c) => c.name === 'shin'),
    shinR: legR.children.find((c) => c.name === 'shin'),
  };
}

/* ------------------------------------------------------------------ */
/* Behaviour                                                           */
/* ------------------------------------------------------------------ */

const _v = new THREE.Vector3();
const CURVY_REST_ARM_SPLAY = 0.18;
const CURVY_DANCE_ARM_SPLAY = 0.32;

/**
 * THE BADA BING'S ADULT PERFORMER ROSTER.
 *
 * Authored rather than rolled -- "four random dancers" gave the stage four of
 * the same woman in different colours. Three are fair and the fourth is not;
 * the hair runs blonde, brunette and black across the line so no two read the
 * same from the floor. The blonde holds the last slot because the last slot is
 * the runway, and the owner's ruling is that the blonde works the front.
 *
 * The renderer-free identities live in `performers.js`. The first four work
 * this story night's three poles and runway; the remaining roster is off shift
 * here and can still appear at the Mansion without turning one woman into two
 * simultaneous bodies. The garment remains a scene decision.
 */

/** A `job` says what somebody is doing; the marker wants to know who they are. */
const ACTOR_ROLE_FOR_JOB = Object.freeze({
  patrol: 'guard',
  deal: 'bystander',
  work: 'bystander',
});

/* One counter per scene, so a room full of people called 'somebody' still
 * gets stable, distinguishable ids. Keyed weakly: a scene that goes away
 * takes its numbering with it rather than leaking into the next build. */
const ACTOR_ORDINALS = new WeakMap();

function uniqueActorId(scene, name) {
  const base = (name || 'somebody').trim() || 'somebody';
  if (!scene || typeof scene !== 'object') return base;
  if (!ACTOR_ORDINALS.has(scene)) ACTOR_ORDINALS.set(scene, new Map());
  const seen = ACTOR_ORDINALS.get(scene);
  const ordinal = seen.get(base) ?? 0;
  seen.set(base, ordinal + 1);
  return ordinal === 0 ? base : `${base}-${ordinal + 1}`;
}

export class Npc {
  /**
   * @param {object} o
   *   name, tier ('hero' | 'ambient' | 'background')
   *   x, z, yaw, y
   *   job: 'stand' | 'sit' | 'lean' | 'work' | 'deal' | 'dance' | 'sway' | 'patrol' | 'drink'
   */
  constructor(scene, o = {}) {
    const {
      name = 'somebody', tier = 'ambient', x = 0, z = 0, yaw = 0, y = 0,
      job = 'stand', look = true, route = null, model = {}, colliders = null,
      navBlockers = null, routine = 0, pole = false, speed = 1.1,
      voiceProfile = null,
    } = o;
    this.name = name;
    this.tier = tier;
    this.job = job;
    this.look = look;
    this.voiceProfile = voiceProfile;
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
      voiceProfile,
      ...this.parts.profile,
    };
    /* And the shared actor marker, so the staging gate can ask which way this
     * body is pointed without knowing that the Bing's Npc is also the Special
     * Meeting's cast and half the mansion's. docs/STAGING-GATE.md.
     *
     * Ids come from the name where the name is unique -- 'Seff', 'Lag' -- and
     * fall back to a per-scene ordinal for the crowds, where forty people are
     * all called 'somebody' and none of them will ever appear in an allowlist
     * on their own. */
    /* THE HEIGHTS ARE THIS RIG'S, NOT THE MARKER'S DEFAULTS.
     *
     * `markActor` defaults to 2.30 m eyes and 1.16 m hips, which are
     * `core/person.js`'s Sasquatch. `makePerson` is a 1.78 m human scaled by
     * `heightScale`. Left to the defaults, every body built here declared an
     * eye 2.30 m up while its irises were between 1.51 and 1.84 -- measured on
     * thirty bodies in the bank lobby, where the TALLEST skull in the room
     * topped out at 1.958. Both the staging gate and the framing gate were
     * reasoning about a point in the air above every head: casting sightlines
     * from it, asking whether it was inside a wall, framing shots on it.
     *
     * 1.66 and 1.15 are the rig's own head and hip heights on its 1.78 m
     * frame, so scaling them by `heightScale` gives this body's real ones. */
    const rigScale = this.parts.heightScale ?? 1;
    markActor(this.group, {
      id: o.actorId ?? uniqueActorId(scene, name),
      role: ACTOR_ROLE_FOR_JOB[job] ?? coarseActorRole(model.role),
      posture: job === 'sit' ? 'sit' : 'stand',
      eyeHeight: 1.66 * rigScale,
      hipHeight: 1.15 * rigScale,
      ...(o.seat ? { seat: o.seat } : {}),
    });
    /* A gutted figure rests its arms differently -- see sit() and the 'sit'
     * and default cases in update() -- because the rest angles every other
     * figure uses were tuned for a flat front and bring the forearm straight
     * through where a real belly now sits. */
    this.gutted = (this.parts.profile.gut ?? 0) > 0;
    this.curvy = this.parts.profile.bodyShape === 'curvy';
    this.homeYaw = yaw;
    this.baseY = y;
    /* Where a mover belongs. The dance walks the floor around a pole and has
     * to come back to the same spot every bar rather than drifting off the
     * stage over the course of an evening. */
    this.homeX = x;
    this.homeZ = z;
    this.routine = routine;
    this.pole = pole;
    /* Walking pace in m/s. The default is the unhurried club walk everybody
     * has always used; a man sent across the room on a thirty-second clock
     * can be told to hustle. */
    this.speed = speed;
    scene.add(this.group);

    this.t = rand(0, 10);
    this.phase = rand(0, 6.28);
    this.gaze = 0;
    this.speaking = 0;
    /* The mouth, driven by the voice rather than by a clock — one shared
     * implementation for the whole cast (src/core/mouth.js). `openScale`
     * reproduces the old `1 + |sin| * 2.6` opening exactly, so nobody's face
     * changes shape; only what decides WHEN it opens has moved. */
    this.voiceMouth = new Mouth(this.parts, { openScale: 2.6 });
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
    setActorPosture(this.group, 'sit');
    this._neutralPose();
    this.seated = true;
    this.parts.legL.position.y = SEATED_LEG_ROOT_Y;
    this.parts.legR.position.y = SEATED_LEG_ROOT_Y;
    this.parts.legL.rotation.x = -1.45;
    this.parts.legR.rotation.x = -1.45;
    this.parts.shinL.rotation.x = 1.4;
    this.parts.shinR.rotation.x = 1.4;
    if (this.gutted) {
      /* The ordinary seated rest angle below pitches the whole arm forward,
       * which is exactly the space a real belly now occupies -- it is how a
       * flat-fronted figure rests its hands in its lap. A gutted figure
       * rests its hands beside it instead: less forward pitch, elbows
       * splayed outward (rotation.z), same job a big man's arms actually do
       * in a chair. */
      this.parts.armL.rotation.set(-0.3, 0, -0.38);
      this.parts.armR.rotation.set(-0.3, 0, 0.38);
      this.parts.foreL.rotation.x = -0.55;
      this.parts.foreR.rotation.x = -0.55;
    } else {
      this.parts.armL.rotation.x = -0.5;
      this.parts.armR.rotation.x = -0.5;
      this.parts.foreL.rotation.x = -0.5;
      this.parts.foreR.rotation.x = -0.5;
    }
    this._splayCurvyArms();
    this.group.position.y = this.baseY - 0.42 * this.parts.heightScale;
    this._syncGownOcclusion(true);
  }

  stand() {
    setActorPosture(this.group, 'stand');
    this._neutralPose();
    this.parts.legL.position.y = STANDING_LEG_ROOT_Y;
    this.parts.legR.position.y = STANDING_LEG_ROOT_Y;
    this._splayCurvyArms();
    this.seated = false;
    this.group.position.y = this.baseY;
    this._syncGownOcclusion(false);
  }

  _syncGownOcclusion(seated) {
    const occlusion = this.parts.gownOcclusion;
    if (!occlusion) return;
    /* A dining chair drops the skirt to the floor: the hem below picks
     * `diningHem` whenever the figure is seated at floor level, which is the
     * same condition that hides the shin. The shoes have to go with it.
     *
     * Owner, 2026-08-24: *"on the mansion playthrough, the girls sitting in
     * the chairs their legs were detached."* They were, and this is how: the
     * thigh and knee are always hidden under a gown, the shin is hidden when
     * seated so it cannot poke through a floor-length skirt -- and the shoes
     * were pinned visible in every pose. Seated, that leaves a pair of shoes
     * under the hem with nothing above them and nothing joining them to her.
     * Standing, the shin is back and the leg reads skirt to shin to shoe, so
     * the fault only ever appeared in a chair.
     *
     * A raised stool keeps its shoes, because there the skirt breaks over the
     * knees and the feet are genuinely below the hem on a brass rail -- which
     * is the case `visibleBelowHem` was named for. */
    const perched = seated && this.baseY > 0.1;
    for (const mesh of occlusion.always) mesh.visible = false;
    for (const mesh of occlusion.seated) mesh.visible = !seated;
    for (const mesh of occlusion.visibleBelowHem) mesh.visible = !seated || perched;
    /* Sitting lowers the entire figure by 0.42 model metres. A standing
     * skirt left at its 0.23 local hem therefore entered a dining-room floor
     * by roughly 18cm even while both shoes remained correctly planted. On a
     * dining chair, shorten the skirt to a 0.42 local hem so it meets the
     * floor at the same datum as the seated rig. A raised stool uses the
     * established 0.36 local break over the knees and brass footrest. The top
     * edge stays registered under the bodice in every pose. */
    const skirt = this.group.getObjectByName('gown.skirt');
    if (skirt) {
      const top = 1.16;
      const standHem = 0.23;
      const diningHem = 0.42;
      const perchedHem = 0.36;
      const hem = !seated
        ? standHem
        : this.baseY > 0.1 ? perchedHem : diningHem;
      skirt.scale.y = (top - hem) / (top - standHem);
      skirt.position.y = top - (top - standHem) * skirt.scale.y / 2;
    }
  }

  _splayCurvyArms(minimum = CURVY_REST_ARM_SPLAY) {
    if (!this.curvy) return;
    this.parts.armL.rotation.z = Math.min(this.parts.armL.rotation.z, -minimum);
    this.parts.armR.rotation.z = Math.max(this.parts.armR.rotation.z, minimum);
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

  /**
   * Say something: the head moves, one hand comes up, and the mouth runs on
   * the take.
   *
   * @param {number} secs how long the gesture holds — and, when there is no
   *   recording, how long the mouth keeps working (the subtitle's own length).
   * @param {object} [take] the voice this line is being spoken with:
   *   `{ audio, source }` from `AudioEngine.play()`. Omit it and the mouth
   *   falls back to a synthesised syllable envelope for `secs`, which is what
   *   the several hundred still-unrecorded lines in this game get.
   */
  say(secs = 2, take = null) {
    this.speaking = secs;
    this.voiceMouth.speak({ seconds: secs, ...(take || {}) });
  }

  /** Cut the line: the mouth shuts, whatever the subtitle is still doing. */
  hush() {
    this.speaking = 0;
    this.voiceMouth.stop();
  }

  /**
   * Turn to face a point on the floor.
   *
   * `snap` is the whole difference between ambience and direction. Without it
   * the figure is given a target and `update()` eases toward it a bit every
   * frame; with it the figure is ON that heading now, because a scripted beat
   * cannot wait a second and a half for a man to notice a knife.
   *
   * A SNAP THEREFORE CLEARS THE SMOOTH TARGET, and it must keep doing so.
   * `targetYaw` used to be write-only: nothing ever cleared it, so the first
   * ambient `faceToward(x, z)` any chatter system made -- one line of small
   * talk was enough -- pinned that NPC's heading forever. A later
   * `faceToward(..., true)` won for exactly one frame and was then dragged
   * back to the stale target by `update()`, which is why Ape spent the Billy
   * HotDog murder facing the wrong way while stabbing the right man.
   */
  faceToward(x, z, snap = false) {
    const yaw = Math.atan2(x - this.group.position.x, z - this.group.position.z);
    if (snap) {
      this.group.rotation.y = yaw;
      this.targetYaw = undefined;
    } else {
      this.targetYaw = yaw;
    }
    return yaw;
  }

  update(dt, playerPos) {
    /* A head can be rebuilt under a live figure -- `restyleMargoHead` clears
     * the head group and hands back a NEW mouth mesh -- so the mouth driver
     * has to notice rather than keep animating a mesh that left the scene.
     * One reference comparison a frame, and it is self-healing for any future
     * restyle rather than a line somebody has to remember to add. */
    if (this.voiceMouth.mouth !== this.parts.mouth) this.voiceMouth.bind(this.parts);
    this._syncJob();
    if (this._every > 0) {
      this._acc += dt;
      if (this._acc < this._every) return;
      dt = this._acc;
      this._acc = 0;
    }
    this.t += dt;
    const t = this.t + this.phase;

    /* Breathing, always. It is most of what separates a person from a prop.
     *
     * Scales `torsoWrap`, not `torso`. `torso` is a box() mesh whose own
     * `.scale` already carries its SIZE, so it keeps that scale fixed at
     * build time and never touches it again; `torsoWrap` is the plain,
     * always-neutral Group `torso` sits inside, and every shirt panel
     * (`frontPanel()`, in the torso's own construction note above) is
     * parented there too. Scaling the wrap by a true ~2% multiplier moves
     * the chest AND every panel resting on it together, so a shirt can no
     * longer separate from the body breathing under it. */
    const breathe = 1 + Math.sin(t * 1.5) * 0.02;
    this.parts.torsoWrap.scale.set(breathe, 1, breathe);
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
      case 'pourShot': {
        /* Booski's booked shot. The bartender stays behind the bar, squarely
         * in front of Tony, and reaches over the rail with both hands. The
         * bottle and glass are real scene props owned by main.js; this is the
         * matching body pose. */
        this.parts.armR.rotation.set(-0.82, 0, 0.10);
        this.parts.foreR.rotation.set(-1.30, 0, 0.04);
        this.parts.armL.rotation.set(-0.56, 0, -0.10);
        this.parts.foreL.rotation.set(-1.02, 0, -0.04);
        this.parts.body.rotation.x = 0.08;
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
          /* Hip circles, hands tracing up and out overhead. Every arm swing in
           * this routine works OUTWARD (negative z on the left arm, positive
           * on the right): the old inward sweeps drove the upper arms through
           * the chest, which is the exact clipping the owner flagged. */
          this.parts.armL.rotation.z = -(0.7 + Math.sin(b) * 0.7);
          this.parts.armR.rotation.z = 0.7 + Math.sin(b + 1) * 0.7;
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
           * it -- `node tools/shots-cast.mjs probe` reports the margin.
           * The grip arm goes up on the OUTSIDE (the pole is the thing she
           * leans away from); swung inward it crossed through her own head. */
          this.parts.armR.rotation.z = 2.2;
          this.parts.armR.rotation.x = -0.15;
          this.parts.foreR.rotation.x = -0.28;
          this.parts.armL.rotation.z = -(0.5 + Math.sin(b) * 0.5);
          this.parts.armL.rotation.x = -0.35;
          this.parts.foreL.rotation.x = -0.8;
          this.parts.body.rotation.z = -0.3 * ease + Math.sin(b) * 0.08;
          bend = 0.2 * ease;
        } else if (bar === 1) {
          // No pole on the runway: a long slow walk down it and back
          const walk = Math.sin(b * 0.32);
          pz = this.homeZ + walk * 0.55 * ease;
          yaw = this.homeYaw + (walk > 0 ? 0.25 : -0.25);
          this.parts.armL.rotation.z = -(0.8 + Math.sin(b) * 0.35);
          this.parts.armR.rotation.z = 0.8 + Math.sin(b + 1) * 0.35;
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
          this.parts.armL.rotation.z = -0.95 * drop;
          this.parts.armR.rotation.z = 0.95 * drop;
          this.parts.armL.rotation.x = -0.9 * drop;
          this.parts.armR.rotation.x = -0.9 * drop;
          this.parts.foreL.rotation.x = -0.5;
          this.parts.foreR.rotation.x = -0.5;
          this.parts.body.rotation.z = Math.sin(b) * 0.08;
        } else {
          // Shoulder shimmy, back arched, chin up, arms flung up and out
          const fast = Math.sin(b * 2.6);
          this.parts.body.rotation.z = fast * 0.16;
          this.parts.armL.rotation.z = -(1.15 + fast * 0.3);
          this.parts.armR.rotation.z = 1.15 + fast * 0.3;
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
            const speed = this.speed;
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
            // Stride cadence follows pace, so a hustle reads as hustling
            // rather than the standard walk cycle sliding over the floor.
            const cadence = 5.2 * Math.sqrt(this.speed / 1.1);
            const gait = Math.sin(t * cadence) * 0.42;
            this.parts.legL.rotation.x = gait;
            this.parts.legR.rotation.x = -gait;
            this.parts.armL.rotation.x = -gait * 0.55;
            this.parts.armR.rotation.x = gait * 0.55;
            this.group.position.y = this.baseY + Math.abs(Math.sin(t * cadence)) * 0.012;
          }
        }
        break;
      }
      /* A couple's sway rather than the stage's own `dance` -- see the note
       * on the beat there. This is two people standing close, weight
       * shifting foot to foot, not a set. Used for the front table's dance
       * beat: "the dancing minigame is completely fucked" was two bugs, and
       * this is the other one -- the timing bar had a player standing bolt
       * upright judging four beats with nothing on screen that read as
       * dancing at all. */
      case 'sway': {
        const b = t * 1.7;
        this.parts.body.position.x = Math.sin(b) * 0.045;
        this.parts.body.rotation.z = Math.sin(b - 0.35) * 0.09;
        this.parts.head.rotation.z = Math.sin(b - 0.6) * 0.05;
        this.parts.legL.rotation.x = Math.sin(b) * 0.10;
        this.parts.legR.rotation.x = -Math.sin(b) * 0.10;
        // One hand out and up as though a hand were being held; the other low.
        this.parts.armL.rotation.set(-0.35 + Math.sin(b) * 0.05, 0, -0.22);
        this.parts.armR.rotation.set(-0.55 - Math.sin(b) * 0.03, 0.15, 0.55);
        this.parts.foreL.rotation.x = -0.45;
        this.parts.foreR.rotation.x = -0.65;
        this.group.position.y = this.baseY + Math.abs(Math.sin(b)) * 0.012;
        break;
      }
      case 'lean':
        this.parts.body.rotation.z = 0.05;
        this.parts.armR.rotation.x = -0.25;
        break;
      case 'sit':
        if (this.gutted) {
          this.parts.armL.rotation.x = -0.3 + Math.sin(t * 0.7) * 0.05;
          this.parts.armR.rotation.x = -0.3 + Math.sin(t * 0.6 + 1) * 0.05;
          this.parts.armL.rotation.z = -0.38;
          this.parts.armR.rotation.z = 0.38;
        } else {
          this.parts.armL.rotation.x = -0.5 + Math.sin(t * 0.7) * 0.05;
          this.parts.armR.rotation.x = -0.5 + Math.sin(t * 0.6 + 1) * 0.05;
        }
        break;
      default: {
        this.parts.body.rotation.z = Math.sin(t * 0.4) * 0.018;
        if (this.folded && this.gutted) {
          /* Open guard stance. The old crossed-arm fold aimed both upper arms
           * toward the sternum, so wide figures carried their elbows inside
           * their own chest. A big man opens farther and rests his hands in
           * front of the belly instead. */
          this.parts.armL.rotation.set(-0.62, 0, -0.5);
          this.parts.armR.rotation.set(-0.62, 0, 0.5);
          this.parts.foreL.rotation.set(-0.72, 0, 0);
          this.parts.foreR.rotation.set(-0.72, 0, 0);
        } else if (this.folded) {
          // Elbows out, hands forward: authoritative for guards and members
          // standing around the room. Nothing crosses through the shirt.
          this.parts.armL.rotation.set(-0.48, 0, -0.34);
          this.parts.armR.rotation.set(-0.48, 0, 0.34);
          this.parts.foreL.rotation.set(-0.72, 0, 0);
          this.parts.foreR.rotation.set(-0.72, 0, 0);
        } else {
          this.parts.armL.rotation.x = Math.sin(t * 0.5) * 0.045;
          this.parts.armR.rotation.x = Math.sin(t * 0.5 + 1) * 0.045;
        }
      }
    }

    /* One authored bar beat needs hands that match the prop instead of the
     * generic stand/patrol cycle. These flags are set only on the bartender:
     * first the right hand tips the bottle while the left steadies the glass,
     * then both forearms stay level under the tray while the patrol route
     * carries it to Booski. */
    if (this.pouringShot) {
      this.parts.armR.rotation.x = -0.88;
      this.parts.foreR.rotation.x = -1.22;
      this.parts.armR.rotation.z = 0.28;
      this.parts.armL.rotation.x = -0.64;
      this.parts.foreL.rotation.x = -1.05;
      this.parts.armL.rotation.z = -0.2;
    } else if (this.carryingShot) {
      this.parts.armR.rotation.x = -0.58;
      this.parts.foreR.rotation.x = -1.22;
      this.parts.armR.rotation.z = 0.18;
      this.parts.armL.rotation.x = -0.58;
      this.parts.foreL.rotation.x = -1.22;
      this.parts.armL.rotation.z = -0.18;
    } else if (this.filming) {
      /* Eric's camcorder at the party. Owner, 2026-08-31: "Eric's camera is,
       * like, through his body. So we can refine the camera and make sure
       * he's holding it properly and is facing the right way." Same contract
       * as the bartender's two flags above: a held prop needs hands that
       * match it every frame, or the idle sway walks the arms away from the
       * thing they are supposedly holding. Right hand up to the viewfinder
       * at the face, left forearm bracing under the body of the camera. */
      this.parts.armR.rotation.x = -1.15;
      this.parts.foreR.rotation.x = -1.35;
      this.parts.armR.rotation.z = 0.10;
      this.parts.armL.rotation.x = -0.98;
      this.parts.foreL.rotation.x = -1.5;
      this.parts.armL.rotation.z = -0.14;
    }

    /* Talking: the mouth works, the head nods, one hand does the explaining.
     *
     * The mouth is no longer part of this block. It used to be
     * `1 + |sin(t * 11)| * 2.6` held open for a guessed number of seconds,
     * which flapped at a fixed cadence and kept flapping after the recording
     * had finished. It is now driven by the take (src/core/mouth.js) and
     * closes when the take does, including when the line is cut mid-word.
     * The hand turns OUT while it explains -- swung inward it crossed the
     * sternum and the forearm ran through the speaker's own chest. */
    const talk = this.voiceMouth.update(dt);
    if (this.speaking > 0 || this.voiceMouth.speaking) {
      this.parts.head.rotation.x = Math.sin(t * 6) * 0.05;
      /* A PHOTOGRAPH CANNOT OPEN ITS MOUTH. Big Uncle Lou and the rest of the
       * photographed cast have a real face on the front of the skull and a
       * hidden placeholder behind it, so their syllables go into the head
       * instead -- which is what actually reads on a photo at conversational
       * distance, and it is the SAME envelope everybody else's jaw is on. */
      if (this.voiceMouth.photo) this.parts.head.rotation.x -= talk * 0.085;
      /* During Booski's delivery the bartender talks while his two hands are
       * committed to the tray. Keep the lips and head alive but do not let a
       * generic talking gesture pull his hand through the glass — or through
       * Eric's camcorder. */
      if (!this.pouringShot && !this.carryingShot && !this.filming) {
        this.parts.armR.rotation.x = -0.35 + Math.sin(t * 4.5) * 0.14;
        this.parts.armR.rotation.z = 0.16;
        this.parts.foreR.rotation.x = -1.0 + Math.sin(t * 4.5 + 1) * 0.35;
      }
    }

    /* Curvy hips are wider than the hanging forearm line. Keep authored arm
     * motion, but reserve a small outward angle so a hand never gets there by
     * passing through the wearer's own hip or shirt. This is a pose limit,
     * not a body-shape change: the skeleton, socket and limb dimensions stay
     * exactly where the wardrobe authored them. */
    if (this.job === 'dance') {
      /* The costume-covered forms can grow by at most eighteen percent. Add
       * only the clearance that identity needs: baseline choreography stays
       * exactly where it was, while the fullest roster body gets roughly six
       * extra degrees between forearm and costume. */
      const curveExtra = Math.max(0, (this.parts.profile.curveScale ?? 1) - 1) * 0.56;
      this._splayCurvyArms(CURVY_DANCE_ARM_SPLAY + curveExtra);
    } else if (this.job === 'stand' || this.job === 'sit' || this.job === 'drink'
      || this.job === 'lean' || this.job === 'work') {
      this._splayCurvyArms();
    }

    /* Last line of defence for every pose above and any future one: an upper
     * arm may only cross toward the sternum when it has been lifted well
     * forward first (a fold, a reach), because that is the only way a real
     * shoulder does it without passing through the ribcage. */
    for (const [arm, side] of [[this.parts.armL, -1], [this.parts.armR, 1]]) {
      const inward = -side * arm.rotation.z;
      if (inward > 0.45 && arm.rotation.x > -0.55) arm.rotation.z = -side * 0.45;
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
/**
 * The man across the felt.
 *
 * Was typed inline in `populate()` and nowhere else, which was fine until the
 * closed party needed a dealer too -- and a second inline model would have
 * been a second man doing the same job at the same table on a different
 * night. Same rule as `BADA_BING_BARTENDER` in core/wardrobe.js: the body
 * moves out, both places spread it, and there is one dealer. He stays here
 * rather than in the wardrobe because he is a JOB in this building, not a
 * person on the campaign roster -- the wardrobe is keyed by character id and
 * the dealer has never had one.
 */
export const BING_BLACKJACK_DEALER = Object.freeze({
  height: 1.76,
  build: 0.95,
  dress: 'waistcoat',
  shirt: 0xe6e2da,
  hair: 'short',
  hairColour: 0x9a9a9a,
  glasses: true,
});

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

  /* Lou: the chalk-stripe three-piece, the hat, and the man's own face off the
   * Initiation's photo set. He is a named founder, and the character bible is
   * explicit that named Circle members wear their supplied photographs rather
   * than a procedural approximation of them.
   *
   * The jacket is OPEN over the waistcoat, and that is the outfit's whole
   * argument: it is what puts the corno somewhere the player can see it from
   * the other side of a desk. Closed, he is a man in a dark rectangle with a
   * gold chain hidden inside it.
   *
   * The clothes come from `core/wardrobe.js` rather than being typed out here.
   * They used to be typed out here, which is exactly how the Bing ended up
   * with a 1.80m Lou in a knit while the boat had a 1.83m Lou in a suit.
   *
   * No bandana. Half the crew in here wear the club's colours on their heads
   * and Lou is deliberately not one of them -- he runs the place from an
   * office, and the man who owns the building does not need the uniform. */
  add('lou', new Npc(scene, {
    name: 'Lou', tier: 'hero', job: 'sit',
    x: a.louSeat.x, z: a.louSeat.z, yaw: 0,
    model: {
      ...BIG_UNCLE_LOU_BING,
      face: 'assets/faces/lou.png', bandana: false,
    },
  }));

  /* Facing the DOOR. A model's face is its +z and the front door is at +z
   * from his post under the heater, so yaw 0 is a doorman looking at whoever
   * is coming in off the lot. He used to stand at yaw PI, which pointed him
   * at the club he is guarding and put the back of his head on every arrival
   * -- and then greeted them without turning round. */
  add('bouncer', new Npc(scene, {
    name: 'the bouncer', tier: 'hero', job: 'stand',
    x: a.bouncerPost.x, z: a.bouncerPost.z, yaw: 0,
    model: { height: 1.94, build: 1.45, dress: 'tee', shirt: 0x14141a, hair: 'bald', beard: true },
  }));
  by.bouncer.folded = true;

  /* His body is canon and lives in src/core/wardrobe.js, because Lou's
   * mansion borrows him for the night and there is only one of him. Spread,
   * never restated — same rule as the rest of the Family. */
  add('bartender', new Npc(scene, {
    name: 'the bartender', tier: 'hero', job: 'work',
    x: a.bartender.x, z: a.bartender.z, yaw: Math.PI / 2,
    model: { ...BADA_BING_BARTENDER },
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
    model: { ...BING_BLACKJACK_DEALER },
  }));

  /* The man on the office door is crew, not a doorman in a tracksuit: dark
   * suit, open collar, gold on the neck -- the same language DeathMegatron
   * and Seff wear at the bar. Human, like everybody in this club is human
   * until the Initiation says otherwise. He has no name yet; he should. */
  add('hallGuard', new Npc(scene, {
    name: 'the guard', tier: 'hero', job: 'sit',
    x: a.hallGuard.x, z: a.hallGuard.z, yaw: -Math.PI / 2,
    model: {
      height: 1.82, build: 1.2, dress: 'suit', shirt: 0x2a2f3a,
      hair: 'crop', hairColour: 0x14100e, beard: true, chain: true, bandana: false,
    },
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

  // In the corner by the DJ, clear of the east booth run that now starts at
  // z -8.5 (he used to stand exactly where booth zero's bench is)
  add('security2', new Npc(scene, {
    name: 'security', tier: 'ambient', job: 'stand',
    x: 4.5, z: -10.35, yaw: -0.8,
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
   * nobody else in either scene.
   *
   * Order matters: the list is dealt poles-first and the RUNWAY -- the front
   * of the house, the one the whole room faces -- comes last. The owner's
   * ruling is that the blonde works the front, so she holds the last slot. */
  const PERFORMERS = BADA_BING_PERFORMERS.slice(0, BADA_BING_CORE_STAGE_COUNT);
  /* Which way each woman is squared up before her routine starts.
   *
   * They were all on yaw 0, and three women on three poles pointed at the
   * same spot to nine decimal places is a chorus line, not a floor show --
   * the staging gate calls it FACING_UNIFORM and it is right to. These are
   * AUTHORED CONSTANTS and not a roll: a random yaw would move the geometry
   * gate's recorded buckets on every build, which trades one gate for
   * another. Small, because each of them still works the room in front of
   * her; the runway takes the last slot, as it does everywhere else here. */
  const STAGE_FACING = [0.17, -0.11, 0.28, -0.05];
  [...a.poles, a.runway].forEach((p, i) => {
    const look = PERFORMERS[i % PERFORMERS.length];
    add(`performer${i}`, new Npc(scene, {
      name: 'a dancer', tier: i === 3 ? 'ambient' : 'background', job: 'dance',
      x: p.x, z: p.z, y: p.y, yaw: STAGE_FACING[i] ?? 0, look: false,
      routine: i, pole: i < a.poles.length,
      model: {
        role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
        ...look, dress: 'bikini', swimStyle: 'classic',
      },
    }));
  });

  /* ---- the table ---- */
  const seats = a.blackjackSeats;
  add('contractor', new Npc(scene, {
    name: 'the contractor', tier: 'ambient', job: 'sit',
    voiceProfile: 'npc-reserve-2',
    x: seats[0].x, z: seats[0].z, yaw: seats[0].faceYaw,
    model: { height: 1.79, build: 1.12, dress: 'shirt', shirt: 0x3a3320, hair: 'short', beard: true },
  }));
  add('regular', new Npc(scene, {
    name: 'the regular', tier: 'ambient', job: 'sit',
    voiceProfile: 'npc-reserve-2',
    x: seats[4].x, z: seats[4].z, yaw: seats[4].faceYaw,
    model: { height: 1.72, dress: 'tracksuit', shirt: pick(TRACKSUITS), hair: 'receding', glasses: true },
  }));

  /* ---- the floor ----
   * Seated patrons sit ON the benches. The lateral offset runs ALONG the
   * bench -- z for the east run, x for the north run -- and the north sitters
   * are pushed back onto the cushion. The old code added every offset to x,
   * which put one man inside his own table and left the north row hovering a
   * step in front of their seats. */
  const seatedSpots = [
    [a.booths[0], 0.6, 0], [a.booths[1], -0.4, 1], [a.booths[3], 0.2, 3],
    [a.booths[5], 0.1, 5], [a.booths[6], -0.2, 6], [a.booths[7], 0.4, 7],
  ];
  /* How far off square each of them has settled, in radians, in the order of
   * the spots above -- three down the east run, three along the north bench.
   *
   * Nobody sits square to a booth back. Every one of these men was on the
   * exact same yaw as the men either side of him, which the staging gate
   * reports as FACING_UNIFORM: six strangers agreeing to nine decimal places
   * about where the room is. Authored constants, not Math.random, because a
   * yaw that moves every build moves the geometry gate's recorded buckets
   * with it. Nothing here is more than about twelve degrees, so every man is
   * still turned out of his booth at the floor he came to watch. */
  const SEATED_SETTLE = [0.13, -0.09, 0.19, 0.12, -0.14, 0.08];
  seatedSpots.forEach(([spot, off, booth], i) => {
    const eastRun = spot.x > 0;
    add(`patron${i}`, new Npc(scene, {
      name: 'a regular', tier: i < 3 ? 'ambient' : 'background', job: i % 2 ? 'drink' : 'sit',
      voiceProfile: i === 1 ? 'npc-reserve-1' : 'npc-male',
      /* The booth's collider assembly id, read back out of the club rather
       * than spelled out here, for the same reason the z is read off the
       * anchor: the run has been renumbered once already. The staging gate
       * skips the solid an actor names as his seat, because a booth is one
       * box from the floor to the top of its back and a seated head is inside
       * it by construction -- these six each reported facing a wall at zero
       * metres, and the wall was the booth they were sitting in. */
      ...(a.boothAssembly?.[booth] ? { seat: a.boothAssembly[booth] } : {}),
      x: eastRun ? 4.55 : spot.x + off,
      /* Read off the seat anchor rather than written out again: the north run
       * moved south out of the front wall it had been pushed into, and a
       * hard-coded 10.95 left three regulars sitting in the brick after the
       * bench they are sitting on had gone. The anchor is 0.6 in front of the
       * bench centre; a sitter is 0.05 in front of it. */
      z: eastRun ? spot.z + off : spot.z + 0.55,
      yaw: (eastRun ? -Math.PI / 2 : Math.PI) + SEATED_SETTLE[i],
      model: {
        height: rand(1.66, 1.9), build: rand(0.95, 1.3),
        dress: pick(['shirt', 'tracksuit', 'suit']),
        hair: pick(['short', 'crop', 'receding', 'long', 'tied']),
        bandana: Math.random() < 0.2,
      },
    }));
  });
  /* Same argument as the benches: three men at three separate tables were on
   * yaw 1.2 to the last decimal, which reads as a firing squad rather than
   * three strangers watching the same stage. Authored offsets. */
  const TABLE_LEAN = [0.09, -0.13, 0.2];
  a.tables.slice(0, 3).forEach((t, i) => {
    add(`tabler${i}`, new Npc(scene, {
      name: 'a regular', tier: 'background', job: 'drink',
      x: t.x - 0.85, z: t.z + 0.2, yaw: 1.2 + TABLE_LEAN[i],
      model: { height: rand(1.66, 1.84), dress: pick(['shirt', 'tracksuit']), hair: pick(['short', 'crop', 'tied']) },
    }));
  });

  // Keep the middle leaner between stools 5 and 6. At z=4.4 their lowered
  // hand clipped stool 5 even though the performer was visibly standing.
  const standing = [[-18.4, 0.6], [-18.4, 4.6], [-17.6, 7.4]];
  /* A man leaning on a bar leans his own way. These three plus the four
   * Family on the stools were all dead on -PI/2, seven people down one wall
   * agreeing exactly; the offsets here and the ones in family.js are picked
   * together so no two people within six metres of each other come within
   * the gate's two degrees. Authored, for the reason given at STAGE_FACING.
   *
   * The SIGNS are measured, not decorative: the middle leaner stands 0.6 m
   * off Seff's stool, and when the two of them were turned towards each
   * other their forearms overlapped by 7 cm and the geometry gate said so.
   * Where two people are within arm's length down this bar they lean APART. */
  const BAR_LEAN = [-0.05, -0.19, 0.24];
  standing.forEach(([sx, sz], i) => {
    add(`stander${i}`, new Npc(scene, {
      name: 'a regular', tier: i === 0 ? 'ambient' : 'background', job: 'lean',
      x: sx, z: sz, yaw: -Math.PI / 2 + BAR_LEAN[i],
      model: {
        height: rand(1.68, 1.88), build: rand(1, 1.3),
        dress: pick(['shirt', 'tracksuit']), hair: pick(['short', 'crop', 'bald']),
      },
    }));
  });

  add('waiter1', new Npc(scene, {
    name: 'a waitress', tier: 'ambient', job: 'patrol',
    voiceProfile: 'performer',
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
  /* No separate cleaner. The man with the mop by the men's room is Snow, and
   * Snow is Family -- one id, one face, one voice, seated by populateFamily
   * with everybody else. Two figures in one job was how the club ended up
   * with two of him. */
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
      y: STOOL_SIT,
      model: {
        /* A narrower frame and a lower build than the roll gives, because
         * the point of her is that she is a person and not a patron. Her
         * head comes from the Silver Room builder below. */
        height: 1.69, build: 0.96, dress: 'shirt', shirt: 0x24303a, hair: 'tied',
        hairColour: 0x2a1c14, skin: 0xd8a878,
        gender: 'female', bodyShape: 'curvy',
      },
    }));
    by.margo.characterId = CHARACTER_IDS.MARGO;
    by.margo.group.userData.npc.characterId = CHARACTER_IDS.MARGO;
    restyleMargoHead(by.margo.parts, { skin: 0xd8a878, hairColour: 0x2a1c14 });
    by.margo.seated = true;
  }

  // Two by the coat check with opinions about the butcher union
  add('gossip1', new Npc(scene, {
    name: 'a regular', tier: 'ambient', job: 'stand',
    voiceProfile: 'npc-male',
    x: -1.2, z: 9.4, yaw: 1.9,
    model: { height: 1.81, build: 1.15, dress: 'tracksuit', shirt: pick(TRACKSUITS), hair: 'crop', bandana: true },
  }));
  add('gossip2', new Npc(scene, {
    name: 'a regular', tier: 'ambient', job: 'stand',
    voiceProfile: 'npc-reserve-1',
    x: -0.2, z: 8.6, yaw: -1.2,
    model: { height: 1.74, dress: 'shirt', hair: 'receding', beard: true },
  }));

  return { all, byName: by };
}

/**
 * Which way the associate is stood while he is parked at the hall mouth.
 *
 * He used to be on yaw 0, which is +z, which from (6.7, 3.6) is the blind
 * end wall of the back hallway 0.79 m from his nose -- the staging gate's
 * FACING_INTO_SOLID, and the first thing the player sees of him when the
 * mission reveals him on this spot. -PI/2 turns him -x, out through the
 * archway the east booth run stops short of, which is the way he then walks
 * and the way the man he has come to fetch is sitting.
 */
const HALL_MOUTH_FACING = -Math.PI / 2;

/**
 * Lou's associate: sent out to fetch the prospect when he has been playing
 * cards too long. He is not in the room until he is needed.
 */
export function makeAssociate(scene, from, colliders = null, navBlockers = null) {
  const npc = new Npc(scene, {
    name: "Lou's associate", tier: 'hero', job: 'patrol',
    x: from.x, z: from.z, yaw: HALL_MOUTH_FACING,
    colliders, navBlockers,
    model: { height: 1.84, build: 1.22, dress: 'tracksuit', shirt: 0x1c2f4a, hair: 'crop', bandana: true },
  });
  npc.group.visible = false;
  return npc;
}

export { BANDANA };
