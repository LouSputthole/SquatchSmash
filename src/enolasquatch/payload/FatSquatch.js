/**
 * The Fat Squatch — the payload. "Visually ridiculous and memorable" per the
 * brief, built out of the same primitives idiom as everything else here: an
 * egg/bomb-shaped casing from a non-uniformly scaled `THREE.SphereGeometry`
 * (the simplest correct approach for a rounded, tapered casing — see
 * `src/beefrun/cargo.js`'s crates for the project's usual "boxes and
 * cylinders" register; this needed something rounder, and a scaled sphere is
 * that same register's rounded primitive), silver/purple paint, the club's
 * crest on both shoulders, the depot's FAT SQUATCH label, and a scattering of
 * individually-applied sticker decals, each its own small canvas texture so
 * they read as stuck on rather than printed as one wrap.
 *
 * This is a prop, not a physics body: `release()` detaches it from whatever
 * it was parented to (the aeroplane's `payloadMount` anchor, normally — see
 * `src/enolasquatch/scenes/EnolaSquatch.js`) and hands it a believable
 * ballistic fall, cheap enough that it doesn't need Beef Run's
 * `AircraftPhysics` or any rigid-body engine. A later mission-wiring phase
 * drives `update()` every frame and decides, from `position`/`impacted`,
 * when and where to trigger the explosion.
 */
import * as THREE from 'three';
import {
  mat, solid, boxGeo, cylGeo, sphereGeo,
  mesh, flatMesh, group, rng, clamp,
} from '../../beefrun/util.js';
import { crestPlaceholderTexture, applyCrest } from '../livery.js';

const G = 9.81;
const NOSE_AXIS = new THREE.Vector3(0, 0, 1);
const DOWN_AXIS = new THREE.Vector3(0, -1, 0);
/**
 * The tip-over, on the simulated clock (owner playtest, 2026-08-18: "I want
 * the bomb to point down as it drops out, it should happen rather quickly
 * when it comes out of the bay").
 *
 * For `TIP_DELAY_SECONDS` the casing rides its release attitude — the time it
 * takes to drop clear of the bay doors, during which the nose is still lying
 * along the aeroplane's own flight path. Then the tail catches the airstream
 * and the nose sweeps to straight down across `TIP_SECONDS`, so the whole
 * tip-over is finished about 0.65 s after release — crisp, and independent of
 * frame rate because it is keyed to `fallTime`, never to wall time. From
 * there it falls nose-first. Only the ATTITUDE obeys these numbers; the
 * ballistic arc in `update()` is untouched by them.
 */
const TIP_DELAY_SECONDS = 0.15;
const TIP_SECONDS = 0.5;
const _flightPath = new THREE.Vector3();
const _noseTarget = new THREE.Vector3();
const _desiredWorldAttitude = new THREE.Quaternion();
const _desiredLocalAttitude = new THREE.Quaternion();
const _parentWorldAttitude = new THREE.Quaternion();

const SILVER = 0xb8bcc6;
const SILVER_DARK = 0x8a8e98;
const PURPLE = 0x4a2f8f;
const PURPLE_LIGHT = 0x8a6fd9;

const BODY_LEN = 2.6;       // half-length scale on the main ellipsoid
const BODY_R = 0.95;        // half-width/height scale

/* ------------------------------------------------------------------ */
/* Where a decal can actually go on this thing.                        */
/* ------------------------------------------------------------------ */

/**
 * Owner playtest, 2026-08-06: "Fat squatch sing needs to be fitted better.
 * Covering logo on bomb" and "Opposite side has an old graphic on it need the
 * squatch logo."
 *
 * Both notes are the same defect seen from two sides, and the photographs in
 * `docs/validation/2026-08-06/livery/` are what made it legible. Every decal
 * on the casing was a FLAT `PlaneGeometry` parked at a constant |x| — which is
 * three separate mistakes on an egg:
 *
 *  1. IT FLOATS. The casing is an ellipsoid whose radius falls away as
 *     `0.95 * sqrt(1 - (z/2.6)^2)`. The FAT SQUATCH placard was 1.15 m long at
 *     a constant x of 0.9595, and the casing under its forward edge is only
 *     0.767 across — so that corner stood 0.19 m out in mid-air, past the
 *     casing's own silhouette. A 1.15 m flat chord on a 0.9 m radius has a
 *     0.15 m sagitta and there is no way to hide it.
 *  2. IT SAT WHERE NOBODY CAN SEE IT. The bomb hangs 0.25 m under a belly at
 *     y -1.7, so on the mounted aeroplane only the casing BELOW its own local
 *     y +0.25 is outside the fuselage. The placard's middle was at y +0.06 and
 *     the two crest badges at y +0.475 — the crests were entirely inside the
 *     aeroplane, and of the placard the player could read the bottom two lines
 *     and never the words "FAT SQUATCH".
 *  3. IT COVERED THE BADGE. The placard spanned z 0.375..1.525 at x -0.9595
 *     and the port crest z 0.79..1.89 at x -0.817 — overlapping in z, with the
 *     placard 0.14 m OUTBOARD. Exactly the owner's "covering logo on bomb".
 *
 * `casingDecal()` is the fix for all three at once: a patch cut out of the
 * SAME sphere the casing is, scaled by the SAME three factors, so it lies on
 * the paint by construction and cannot float, cannot z-fight and cannot break
 * the silhouette however long it is. `DECAL_ANGLE` then puts the artwork in
 * the band that is actually outside the aeroplane, and the three placements
 * below are struck clear of each other and of the girth band.
 */

/** How far proud of the casing a decal sits: 1.5 cm at the girth. */
const DECAL_LIFT = 1.015;

/**
 * Down the casing's side, in radians from the top.
 *
 * pi/2 is the equator. 1.83 rad is 105 degrees — far enough below the belly
 * line (y +0.25, i.e. 74.7 degrees) that a 0.66 m badge centred here still has
 * its top edge 0.17 m clear of the fuselage, and tilted 15 degrees down, which
 * is about the angle a man on the tarmac three metres away is looking at it
 * from anyway.
 */
const DECAL_ANGLE = 1.83;

/** The purple girth band's z span — decals go forward or aft of it, never through. */
const BAND_Z0 = 0.15;
const BAND_Z1 = 0.65;

/**
 * A decal that lies ON the casing.
 *
 * The body is `SphereGeometry(1)` scaled `(BODY_R, BODY_R, BODY_LEN)`, so a
 * patch of that same sphere over a limited phi/theta range, scaled by the same
 * three numbers and a hair more, IS the casing's surface. Sizes are given in
 * metres of skin and converted here, because "0.4 radians of azimuth" is not a
 * number anybody can check against a photograph.
 *
 * WHICH WAY THE TEXT RUNS, and why there is no mirroring anywhere in it.
 * Three.js lays a sphere out as
 *   `x = -cos(phi)sin(theta), y = cos(theta), z = sin(phi)sin(theta)`
 * with u rising along phi. On the -X flank (phi near 0) z rises with phi, and
 * a viewer stood off -X has +Z on his right — so u runs to his right. On the
 * +X flank (phi near pi) z FALLS with phi, and that viewer has -Z on his right
 * — so u runs to his right there too. Both flanks read left-to-right off the
 * same texture with nothing flipped: no mirrored UVs, no negative scale.
 *
 * @param {object} o
 *   side      -1 or +1: which flank
 *   angle     radians from the top of the casing (pi/2 is the equator)
 *   z         the decal's centre station along the casing
 *   w,h       its size on the skin, in metres
 *   material  its own material (each decal is its own texture)
 *   name
 * @returns {THREE.Mesh}
 */
function casingDecal({ side, angle, z, w, h, material, name = 'casing-decal' }) {
  const sinT = Math.sin(angle);
  /* How far along z this station is, as an angle, and how many metres of z one
   * radian of azimuth buys HERE — the casing tapers, so it is not a constant. */
  const reach = BODY_LEN * sinT;
  const alpha = Math.asin(Math.max(-1, Math.min(1, z / reach)));
  const perRadian = reach * Math.cos(alpha);
  const phiLength = w / perRadian;
  const thetaLength = h / BODY_R;
  // -X is phi = alpha; +X is its reflection through pi. Neither is a mirror of
  // the geometry — they are two different arcs of one sphere.
  const phiCentre = side > 0 ? Math.PI - alpha : alpha;
  const geo = new THREE.SphereGeometry(
    1,
    Math.max(8, Math.round(phiLength * 26)),
    Math.max(6, Math.round(thetaLength * 18)),
    phiCentre - phiLength / 2, phiLength,
    angle - thetaLength / 2, thetaLength,
  );
  const m = flatMesh(geo, material, 0, 0, 0);
  m.scale.set(BODY_R * DECAL_LIFT, BODY_R * DECAL_LIFT, BODY_LEN * DECAL_LIFT);
  m.name = name;
  return m;
}

/**
 * The main side placard.
 *
 * Owner playtest, 2026-08-04: "Lets shrink the sign of the This way towards
 * Ops banner on the fat Squatch and make it look like a sticker attached to
 * it."
 *
 * It was a banner. A 2.2 x 0.92 m opaque slab hung on a casing 1.9 m across —
 * so it wrapped most of the side of the bomb, its square corners stood proud
 * of a round object, and the purple girth band came straight through the
 * middle of it because the band sits at 1.02 of the body radius and the
 * placard sat at 0.99.
 *
 * Now it is drawn like the little `stickerTexture()` labels beside it, only
 * bigger and printed properly: a rounded, die-cut label on a transparent
 * canvas with a peeled corner and a purple keyline. Everything outside the
 * label is clear, so the casing shows through and the thing reads as
 * something the depot stuck on rather than a hoarding bolted to the side.
 *
 * 2026-08-06: the three lines and the arrow came up 14 px. Their ink spanned
 * y 78..268 inside a die cut running 26..294, so the block sat 14 px low in
 * its own label and the headline crowded the top edge — which is the one line
 * the owner reads first and the one the fuselage used to cut off.
 */
function mainPlacardTexture() {
  const W = 640;
  const H = 320;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // The die-cut label itself: rounded corners, inset from the canvas edge so
  // the alpha has somewhere to be transparent.
  const m = 26;
  ctx.fillStyle = '#e6e0ee';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(m, m, W - m * 2, H - m * 2, 34);
  else ctx.rect(m, m, W - m * 2, H - m * 2);
  ctx.fill();
  // Print wear, clipped to the label.
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, Math.random() * 26, Math.random() * 4);
  }
  ctx.restore();
  // Keyline, inside the die cut, the way a printed label has one.
  ctx.strokeStyle = '#4a2f8f';
  ctx.lineWidth = 7;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(m + 12, m + 12, W - m * 2 - 24, H - m * 2 - 24, 24);
  else ctx.rect(m + 12, m + 12, W - m * 2 - 24, H - m * 2 - 24);
  ctx.stroke();

  ctx.fillStyle = '#241a3a';
  ctx.textAlign = 'center';
  ctx.font = '900 68px Trebuchet MS, sans-serif';
  ctx.fillText('FAT SQUATCH', W / 2, 114);
  ctx.font = '700 34px Trebuchet MS, sans-serif';
  ctx.fillStyle = '#8a2020';
  ctx.fillText('HANDLE WITH RESPECT', W / 2, 170);
  ctx.fillStyle = '#241a3a';
  ctx.font = '700 30px Trebuchet MS, sans-serif';
  ctx.fillText('THIS SIDE TOWARD THE OPS', W / 2, 218);
  // An arrow, so the instruction is unambiguous even if the reading is not.
  ctx.strokeStyle = '#241a3a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(196, 238); ctx.lineTo(444, 238);
  ctx.moveTo(412, 222); ctx.lineTo(444, 238); ctx.lineTo(412, 254);
  ctx.stroke();

  // One corner lifting, which is the whole difference between a sticker and
  // a sign. Drawn as a lighter triangle of backing paper folded up.
  ctx.fillStyle = '#f4f1f8';
  ctx.beginPath();
  ctx.moveTo(W - m - 62, H - m);
  ctx.lineTo(W - m, H - m);
  ctx.lineTo(W - m, H - m - 62);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(36,26,58,0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W - m - 62, H - m);
  ctx.lineTo(W - m, H - m - 62);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * One small individually-applied sticker — its own canvas, its own patch of
 * casing.
 *
 * The type is SET TO THE LABEL, not typed at a fixed size and hoped for. It
 * used to be a flat `800 34px`, which is about 300 px of "No Smoking, Booski"
 * inside a 256 px canvas: every sticker on the bomb longer than about twelve
 * characters had its ends cut off by the canvas edge, and the walkaround
 * photographs of 2026-08-06 show them reading "Smoking, Boos", "Gratin Appro"
 * and "bly Stable". Measuring and scaling down to fit is four lines and it
 * cannot be wrong for a label somebody adds later either.
 */
function stickerTexture(text, opts = {}) {
  const { bg = '#e8e2d0', fg = '#1c1a17', accent = '#4a2f8f' } = opts;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(4, 4, 248, 120, 14) : ctx.rect(4, 4, 248, 120);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = Array.isArray(text) ? text : [text];
  const INNER = 216;                             // the die cut, less its margin
  let size = lines.length > 1 ? 30 : 34;
  ctx.font = `800 ${size}px Trebuchet MS, sans-serif`;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
  if (widest > INNER) {
    size = Math.max(14, Math.floor(size * (INNER / widest)));
    ctx.font = `800 ${size}px Trebuchet MS, sans-serif`;
  }
  lines.forEach((line, i) => {
    ctx.fillText(line, 128, 64 + (i - (lines.length - 1) / 2) * (size + 4));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The five little ones, `side` / `angle` down the casing / `z` station — the
 * same three numbers `casingDecal()` takes, so where they go can be checked
 * against the photographs.
 *
 * They used to be `theta`/`z` pairs on flat planes, and the flat plane was the
 * same defect the placard had, only smaller: `rotation.z` spun each label in
 * its own plane and `rotation.y = PI/2` then aimed every one of them at dead
 * abeam, so the ones round the bottom of the casing went THROUGH it and hung
 * out the far side. ("Probably Stable" is the one in the photographs, standing
 * out of the underside like a fin.)
 *
 * All five are now clear of the girth band and of the two big decals, and
 * scattered aft where there is casing to spare rather than fighting the crest
 * for the same square foot.
 */
const STICKERS = [
  { text: 'Gratin Approved', side: 1, angle: 1.60, z: -0.50 },
  { text: 'Property of Lou', side: 1, angle: 2.10, z: -0.55 },
  { text: 'Do Not Roll', side: 1, angle: 2.10, z: -1.55 },
  { text: 'Probably Stable', side: -1, angle: 2.10, z: -1.62 },
  { text: 'No Smoking, Booski', side: -1, angle: 1.60, z: -1.62 },
];

export class FatSquatch {
  constructor() {
    this.group = group('fat-squatch');
    this.parts = {};
    this.straps = [];

    this.released = false;
    this.impacted = false;
    this.impactPoint = null;
    this.velocity = new THREE.Vector3();
    this.fallTime = 0;

    /** Called once, from `update()`, the frame `impacted` first becomes true. */
    this.onImpact = null;

    this.build();
  }

  build() {
    const silver = solid(SILVER, { roughness: 0.32, metalness: 0.75 });
    const silverDark = solid(SILVER_DARK, { roughness: 0.4, metalness: 0.6 });
    const purple = solid(PURPLE, { roughness: 0.45, metalness: 0.2 });
    const purpleLight = solid(PURPLE_LIGHT, { roughness: 0.45, metalness: 0.15 });
    const strapMat = solid(0xd8a13a, { roughness: 0.85 });

    const g = this.group;

    // ---- Casing: an egg/bomb-shaped body from a scaled sphere ----
    const body = mesh(sphereGeo(1, 20, 16), silver, 0, 0, 0);
    body.scale.set(BODY_R, BODY_R, BODY_LEN);
    g.add(body);
    this.parts.body = body;

    // A shorter, slightly larger-radius cap blends the nose taper without
    // needing a lathe geometry — two scaled spheres read as one tapered egg
    // from any distance a player actually gets to this prop from.
    const nose = mesh(sphereGeo(1, 16, 12), silverDark, 0, 0, BODY_LEN * 0.92);
    nose.scale.set(BODY_R * 0.62, BODY_R * 0.62, BODY_R * 0.85);
    g.add(nose);

    // Tail taper and stabiliser fins, so it reads as ordnance and not a
    // beach ball.
    const tail = mesh(sphereGeo(1, 16, 12), silverDark, 0, 0, -BODY_LEN * 0.95);
    tail.scale.set(BODY_R * 0.55, BODY_R * 0.55, BODY_R * 0.7);
    g.add(tail);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const fin = mesh(boxGeo(0.9, 0.05, 0.62), purple, 0, 0, -BODY_LEN * 1.05);
      fin.position.x = Math.sin(ang) * 0.02;
      fin.rotation.z = ang;
      fin.position.y += Math.cos(ang) * 0.55;
      fin.position.x += Math.sin(ang) * 0.55;
      g.add(fin);
    }

    // Purple accent band around the girth, and a purple nose tip — "silver
    // and purple" per the brief, not silver alone.
    /* The band stands 1.02 of the body radius out — outboard of every decal,
     * which is why `BAND_Z0`/`BAND_Z1` are a no-go zone for the artwork rather
     * than something a decal can be laid over. */
    const band = mesh(cylGeo(BODY_R * 1.02, BODY_R * 1.02, BAND_Z1 - BAND_Z0, 20), purple,
      0, 0, (BAND_Z0 + BAND_Z1) / 2);
    band.rotation.x = Math.PI / 2;
    g.add(band);
    const noseTip = mesh(sphereGeo(1, 12, 10), purpleLight, 0, 0, BODY_LEN * 1.02);
    noseTip.scale.setScalar(BODY_R * 0.28);
    g.add(noseTip);

    // Two carrying lugs on top, where a real bomb's suspension lugs go —
    // also exactly where the restraint straps anchor.
    this.parts.lugs = [];
    for (const z of [0.75, -0.55]) {
      const lug = mesh(boxGeo(0.18, 0.22, 0.14), solid(0x2a2c30, { roughness: 0.6, metalness: 0.6 }), 0, BODY_R * 0.98, z);
      g.add(lug);
      this.parts.lugs.push(lug);
    }

    /* ---- The Silver Sasquatches crest, on BOTH flanks of the casing ----
     *
     * Owner playtest, 2026-08-04: "Squatch logo on the bomb too."
     * Owner playtest, 2026-08-06: "Opposite side has an old graphic on it need
     * the squatch logo."
     *
     * THE OLD GRAPHIC was a drawn-from-scratch smiling Sasquatch face on its
     * own 320x320 canvas — a 1.35 m plane at x +0.94, i.e. the whole starboard
     * flank of the casing. It is gone, and the club's real artwork stands
     * where it stood. This is the same call, on the same grounds, as the one
     * the aeroplane's nose took on 2026-08-04 ("The squatch head on towards
     * the front of the plane — lets use the Squatch logo"): a second, weaker
     * piece of club artwork drawn by hand next to the real one, on the one
     * object in the mission the player is guaranteed to stand under.
     *
     * The face also had the crest badge's own problem — it was 1.35 m of flat
     * plane on a casing 1.9 m across, so its corners floated 0.44 m off the
     * paint, and its top two thirds were inside the fuselage.
     *
     * Both badges are the same size at the same station now, forward of the
     * girth band and low enough on the casing to be outside the aeroplane, so
     * the bomb reads the same from either side of the hardstand — which is
     * what the walkaround actually does, since the restraints check is on the
     * centreline and can be approached from either flank.
     */
    this.parts.clubLogo = [];
    const CREST_Z = 1.15;                       // spans z 0.82..1.48
    const CREST_SIZE = 0.66;
    for (const side of [-1, 1]) {
      const badge = casingDecal({
        side,
        angle: DECAL_ANGLE,
        z: CREST_Z,
        w: CREST_SIZE,
        h: CREST_SIZE,
        material: mat({
          map: crestPlaceholderTexture(), roughness: 0.72, transparent: true, alphaTest: 0.02, unique: true,
        }),
        name: 'fat-squatch-crest',
      });
      g.add(badge);
      this.parts.clubLogo.push(badge);
    }

    /* ---- Main placard, aft of the band on the port flank ----
     *
     * Owner playtest, 2026-08-06: "Fat squatch sing needs to be fitted better.
     * Covering logo on bomb."
     *
     * 1.10 x 0.55 m of skin (the label art is 2:1, so it neither stretches nor
     * letterboxes), cut out of the casing itself by `casingDecal()` so it lies
     * on the paint instead of standing 0.19 m off it, and moved down to
     * `DECAL_ANGLE` so the whole label — headline included — hangs below the
     * fuselage where it can be read.
     *
     * WHERE IT IS, AND WHAT IT NO LONGER TOUCHES. It spans z -1.15..-0.05.
     * The girth band is z 0.15..0.65 and stands 1.02 of the body radius proud,
     * which is outboard of any decal, so the placard is struck 0.20 m aft of
     * it rather than through it. The crest is z 0.82..1.48, a further 0.17 m
     * forward of the band. Nothing overlaps anything: on this flank you read
     * the badge, then the band, then the label, nose to tail.
     */
    const placard = casingDecal({
      side: -1,
      angle: DECAL_ANGLE,
      z: -0.60,
      w: 1.10,
      h: 0.55,
      material: mat({
        map: mainPlacardTexture(), roughness: 0.75, transparent: true, alphaTest: 0.05, unique: true,
      }),
      name: 'fat-squatch-ops-sticker',
    });
    g.add(placard);
    this.parts.placard = placard;

    // ---- Small individual stickers, scattered around the casing ----
    // Each is its OWN canvas texture on its OWN patch of casing, so they read
    // as things somebody stuck on one at a time rather than a single
    // wraparound decal sheet. See `STICKERS` for why they moved.
    this.parts.stickers = [];
    for (const s of STICKERS) {
      const label = casingDecal({
        side: s.side,
        angle: s.angle,
        z: s.z,
        w: 0.62,
        h: 0.31,                                // the sticker art is 256x128
        material: mat({ map: stickerTexture(s.text), roughness: 0.8, transparent: true, unique: true }),
        name: 'fat-squatch-sticker',
      });
      g.add(label);
      this.parts.stickers.push(label);
    }

    // ---- Restraint straps: barely secured, visibly under tension in some
    // places and slack in others ----
    this.parts.strapMeshes = [];
    const strapSpecs = [
      { z: 0.85, slackSide: 1 },
      { z: -0.35, slackSide: -1 },
    ];
    for (const spec of strapSpecs) {
      const strap = group('restraint-strap');
      // Tight half: a straight band over the top.
      const tight = mesh(boxGeo(0.12, 0.04, BODY_R * 2.3), strapMat, 0, BODY_R * 1.02, spec.z);
      tight.rotation.x = 0;
      strap.add(tight);
      // Slack half: canted, so it visibly is not pulled taut — "barely
      // secured" rather than cargo-strapped.
      const slack = mesh(boxGeo(0.12, 0.04, BODY_R * 1.6), strapMat, spec.slackSide * 0.35, BODY_R * 0.55, spec.z + spec.slackSide * 0.5);
      slack.rotation.z = spec.slackSide * 0.5;
      strap.add(slack);
      g.add(strap);
      this.parts.strapMeshes.push(strap);
    }
  }

  /**
   * Cosmetic first step: loosen/drop the restraint straps. Kept distinct
   * from `release()` so a mission can play "the straps let go" as its own
   * beat (a half-second before the mount actually lets the payload fall),
   * matching the brief's `open()`/`release()` pair.
   */
  open() {
    for (const strap of this.parts.strapMeshes) {
      strap.visible = false;
    }
  }

  /**
   * Paint the club's real crest onto the two casing badges — see
   * `../livery.js`. Called by the composition root when `resolveGear` settles;
   * until then they wear the drawn crest.
   *
   * @param {?THREE.Texture} texture
   * @returns {number} badges repainted
   */
  applyClubLogo(texture) {
    return applyCrest(this.parts.clubLogo, texture);
  }

  /**
   * Detach from whatever parent it currently has (normally the aeroplane's
   * `payloadMount` anchor) and begin a simple ballistic fall. Call once.
   *
   * @param {THREE.Object3D} [worldParent] where to reparent the group so it
   *   keeps rendering after the aeroplane flies on — typically the mission's
   *   scene root. If omitted, the group is reparented to whatever its
   *   current parent's parent is, which is usually good enough; passing the
   *   scene explicitly is the safer choice for mission code.
   * @param {THREE.Vector3} [carrierVelocity] the aeroplane's velocity at the
   *   moment of release, so the bomb keeps the aircraft's forward speed
   *   instead of starting the fall from a dead stop.
   */
  release(worldParent = null, carrierVelocity = null) {
    if (this.released) return;
    this.released = true;
    this.open();

    const parent = this.group.parent;
    if (parent) {
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      this.group.matrixWorld.decompose(worldPos, worldQuat, worldScale);
      const target = worldParent || parent.parent || parent;
      target.add(this.group);
      this.group.position.copy(worldPos);
      this.group.quaternion.copy(worldQuat);
      this.group.scale.copy(worldScale);
    }

    this.velocity.copy(carrierVelocity || new THREE.Vector3());
    this.fallTime = 0;
    this.impacted = false;
    this.impactPoint = null;
  }

  /**
   * Put it back on the mount. The undo for `release()`.
   *
   * THE UNWINNABLE RESTART (owner playtest, 2026-08-04: "I had to restart
   * after I dropped the bomb and the area was already dentonated and the bomb
   * was gone.")
   *
   * `release()` is a one-way door — `if (this.released) return;` — which is
   * correct for a bomb and wrong for a checkpoint. Restoring the `preRelease`
   * checkpoint put `payloadReleased` back to false on the MISSION, but the
   * prop itself was still detached, still flagged `released` and `impacted`,
   * and still lying in the crater where it went off. The second run's release
   * sequence therefore called `release()`, got the early return, and nothing
   * ever left the aeroplane: no fall, no `onImpact`, no detonation, and a
   * mission parked in its `explosion` phase forever with an empty bomb bay.
   *
   * This is the honest inverse: back onto the mount at the local pose it was
   * built with, straps done up again, every fall-state field cleared. Called
   * by `MissionController.rearmPayload()`.
   *
   * @param {THREE.Object3D} mount normally `aircraft.anchors.payloadMount`
   * @returns {boolean} whether anything had to be put back
   */
  rearm(mount) {
    const wasGone = this.released;
    this.released = false;
    this.impacted = false;
    this.impactPoint = null;
    this.fallTime = 0;
    this.velocity.set(0, 0, 0);
    // The straps `open()` hid, done up again.
    for (const strap of this.parts.strapMeshes) strap.visible = true;
    if (mount && this.group.parent !== mount) mount.add(this.group);
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.group.quaternion.identity();
    this.group.visible = true;
    return wasGone;
  }

  /**
   * Advance the fall. Simple ballistic arc — gravity plus a light tumble —
   * which is all a released bomb prop needs; there is nothing here for it
   * to collide with except the ground.
   *
   * @param {number} dt
   * @param {(x:number, z:number) => number} [getHeight] optional terrain
   *   height sampler. If given, `impacted` flips true (once) the frame the
   *   casing reaches that height, `impactPoint` is recorded, and `onImpact`
   *   fires — the hook a later phase uses to trigger the explosion.
   */
  update(dt, getHeight = null) {
    if (!this.released || this.impacted) return;
    this.fallTime += dt;
    this.velocity.y -= G * dt;
    this.group.position.addScaledVector(this.velocity, dt);

    /* The nose. Out of the doors it lies along the flight path; then the
     * quick tip-over — see TIP_DELAY_SECONDS / TIP_SECONDS — takes it to
     * straight down, where it stays for the rest of the fall. The target
     * direction is a smoothstepped blend from the current flight path to
     * world-down, so neither end of the sweep snaps, and the slerp toward it
     * is fast enough (τ ≈ 0.11 s) that the casing tracks the sweep rather
     * than trailing seconds behind it. Scratch vectors are module-level:
     * nothing here allocates per frame. */
    if (this.velocity.lengthSq() > 0.01) {
      _flightPath.copy(this.velocity).normalize();
      const tip = clamp((this.fallTime - TIP_DELAY_SECONDS) / TIP_SECONDS, 0, 1);
      const eased = tip * tip * (3 - 2 * tip);
      _noseTarget.copy(_flightPath).lerp(DOWN_AXIS, eased).normalize();
      _desiredWorldAttitude.setFromUnitVectors(NOSE_AXIS, _noseTarget);
      if (this.group.parent) {
        this.group.parent.getWorldQuaternion(_parentWorldAttitude).invert();
        _desiredLocalAttitude.copy(_parentWorldAttitude).multiply(_desiredWorldAttitude);
      } else {
        _desiredLocalAttitude.copy(_desiredWorldAttitude);
      }
      this.group.quaternion.slerp(_desiredLocalAttitude, 1 - Math.exp(-9 * dt));
    }

    if (getHeight) {
      const ground = getHeight(this.group.position.x, this.group.position.z);
      if (this.group.position.y <= ground) {
        this.group.position.y = ground;
        this.impacted = true;
        this.impactPoint = this.group.position.clone();
        this.onImpact?.(this.impactPoint);
      }
    }
  }

  get worldPosition() {
    const out = new THREE.Vector3();
    this.group.getWorldPosition(out);
    return out;
  }
}

/** Deterministic prop-placement helper, exported for anything that wants to
 * scatter more than one Fat Squatch (spares in a hangar diorama, say)
 * without every copy landing in an identical pose. */
export function scatterSeed(index) {
  return rng(0xfa75 + index * 91);
}
