/**
 * The Fat Squatch — the payload. "Visually ridiculous and memorable" per the
 * brief, built out of the same primitives idiom as everything else here: an
 * egg/bomb-shaped casing from a non-uniformly scaled `THREE.SphereGeometry`
 * (the simplest correct approach for a rounded, tapered casing — see
 * `src/beefrun/cargo.js`'s crates for the project's usual "boxes and
 * cylinders" register; this needed something rounder, and a scaled sphere is
 * that same register's rounded primitive), silver/purple paint, a smiling
 * Sasquatch face decal, and a scattering of individually-applied sticker
 * decals, each its own small canvas texture so they read as stuck on rather
 * than printed as one wrap.
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
  mat, solid, boxGeo, cylGeo, sphereGeo, planeGeo,
  mesh, flatMesh, group, rng,
} from '../../beefrun/util.js';
import { crestPlaceholderTexture, applyCrest } from '../livery.js';

const G = 9.81;

const SILVER = 0xb8bcc6;
const SILVER_DARK = 0x8a8e98;
const PURPLE = 0x4a2f8f;
const PURPLE_LIGHT = 0x8a6fd9;

const BODY_LEN = 2.6;       // half-length scale on the main ellipsoid
const BODY_R = 0.95;        // half-width/height scale

/** The smiling face, painted on the casing's side. */
function faceTexture() {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 320, 320);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 320, 320);

  const fur = '#d8d2de';
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(160, 168, 108, 118, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b9b2c4';
  ctx.beginPath();
  ctx.ellipse(160, 118, 98, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1c1824';
  for (const ex of [-36, 36]) {
    ctx.beginPath();
    ctx.ellipse(160 + ex, 148, 17, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#eee6d8';
  for (const ex of [-40, 32]) {
    ctx.beginPath();
    ctx.arc(160 + ex, 142, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e6d9b8';
  ctx.beginPath();
  ctx.ellipse(160, 208, 52, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#241c14';
  ctx.beginPath();
  ctx.ellipse(148, 198, 6, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(172, 198, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // A wide, genuinely happy grin — this one is delighted to be here.
  ctx.strokeStyle = '#2a2018';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(118, 224);
  ctx.quadraticCurveTo(160, 258, 202, 224);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(128, 226);
  ctx.quadraticCurveTo(160, 246, 192, 226);
  ctx.quadraticCurveTo(160, 240, 128, 226);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  ctx.fillText('FAT SQUATCH', W / 2, 128);
  ctx.font = '700 34px Trebuchet MS, sans-serif';
  ctx.fillStyle = '#8a2020';
  ctx.fillText('HANDLE WITH RESPECT', W / 2, 184);
  ctx.fillStyle = '#241a3a';
  ctx.font = '700 30px Trebuchet MS, sans-serif';
  ctx.fillText('THIS SIDE TOWARD THE OPS', W / 2, 232);
  // An arrow, so the instruction is unambiguous even if the reading is not.
  ctx.strokeStyle = '#241a3a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(196, 252); ctx.lineTo(444, 252);
  ctx.moveTo(412, 236); ctx.lineTo(444, 252); ctx.lineTo(412, 268);
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

/** One small individually-applied sticker — its own canvas, its own plane. */
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
  const size = lines.length > 1 ? 30 : 34;
  ctx.font = `800 ${size}px Trebuchet MS, sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, 128, 64 + (i - (lines.length - 1) / 2) * (size + 4));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const STICKERS = [
  { text: 'Gratin Approved', theta: 0.6, z: 1.1 },
  { text: 'Do Not Roll', theta: -0.9, z: 0.2 },
  { text: 'Probably Stable', theta: 2.4, z: -0.6 },
  { text: 'Property of Lou', theta: -2.1, z: -1.3 },
  { text: 'No Smoking, Booski', theta: 1.8, z: 0.7 },
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
    this.angularVelocity = new THREE.Vector3(0.4, 0.15, 0.6);
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
    const band = mesh(cylGeo(BODY_R * 1.02, BODY_R * 1.02, 0.5, 20), purple, 0, 0, 0.4);
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

    // ---- The smiling face, on the side everyone will actually see ----
    const faceMat = mat({ map: faceTexture(), roughness: 0.7, transparent: true, alphaTest: 0.04, unique: true });
    const face = flatMesh(planeGeo(1.35, 1.35), faceMat, BODY_R * 0.99, 0, 0.55);
    face.rotation.y = Math.PI / 2;
    g.add(face);
    this.parts.face = face;

    /* ---- Main placard, opposite the face ----
     *
     * Half the size it was (2.2 x 0.92 m down to 1.15 x 0.58) and stuck on
     * rather than bolted on: transparent surround, `alphaTest` so the clear
     * corners really are clear, and a couple of degrees of roll because
     * nobody at the depot lines a label up with anything.
     *
     * Moved forward to z 0.95 as well, clear of the purple girth band at
     * z 0.4 — the band stands 1.02 of the body radius out and the placard sat
     * at 0.99, so the band used to run straight through the middle of it. */
    const placardMat = mat({
      map: mainPlacardTexture(), roughness: 0.75, transparent: true, alphaTest: 0.05, unique: true,
    });
    const placard = flatMesh(planeGeo(1.15, 0.58), placardMat, -BODY_R * 1.01, 0.06, 0.95);
    placard.rotation.y = -Math.PI / 2;
    placard.rotation.z = 0.06;
    placard.name = 'fat-squatch-ops-sticker';
    g.add(placard);
    this.parts.placard = placard;

    // ---- Small individual stickers, scattered around the casing ----
    // Each is its OWN canvas texture on its OWN plane, tangent to the body
    // at its own angle, so they read as things somebody stuck on one at a
    // time rather than a single wraparound decal sheet.
    this.parts.stickers = [];
    for (const s of STICKERS) {
      const stickerMat = mat({ map: stickerTexture(s.text), roughness: 0.8, transparent: true, unique: true });
      const plane = flatMesh(planeGeo(0.62, 0.32), stickerMat, 0, 0, 0);
      const r = BODY_R * 1.005;
      plane.position.set(Math.sin(s.theta) * r, Math.cos(s.theta) * r, s.z);
      // Face outward, tangent to the casing at this angle.
      plane.rotation.z = -s.theta;
      plane.rotation.y = Math.PI / 2;
      g.add(plane);
      this.parts.stickers.push(plane);
    }

    /* ---- The Silver Sasquatches crest, stencilled on the casing ----
     *
     * Owner playtest, 2026-08-04: "Squatch logo on the bomb too." Same
     * artwork and the same mechanism as the aeroplane's three badges — see
     * `../livery.js`. Two of them, one on each shoulder of the casing forward
     * of the girth band, where they are visible from the tarmac with the bay
     * open (which is exactly when the player is stood under this thing doing
     * the restraints check) and from the chase camera on the way down.
     */
    this.parts.clubLogo = [];
    for (const sx of [-1, 1]) {
      const badge = flatMesh(
        planeGeo(0.78, 0.78),
        mat({ map: crestPlaceholderTexture(), roughness: 0.72, transparent: true, alphaTest: 0.02, unique: true }),
        sx * BODY_R * 0.86, BODY_R * 0.5, 1.34,
      );
      badge.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      badge.rotation.z = sx * -0.5;
      badge.name = 'fat-squatch-crest';
      g.add(badge);
      this.parts.clubLogo.push(badge);
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
    this.group.rotation.x += this.angularVelocity.x * dt;
    this.group.rotation.y += this.angularVelocity.y * dt;
    this.group.rotation.z += this.angularVelocity.z * dt;

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
