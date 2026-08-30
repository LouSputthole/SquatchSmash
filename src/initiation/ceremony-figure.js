/**
 * Initiation ceremony figure Adapter.
 *
 * The Initiation used to render every attendee with `core/person.js`, a
 * one-joint block rig that cannot kneel without lowering its whole root into
 * the ground. This Adapter keeps the scene-facing Interface small while its
 * Implementation is the articulated `bing/cast.js` person: canonical body,
 * formal scene clothes, real hand sockets and separate thigh/shin joints.
 */
import * as THREE from 'three';

import { makePerson } from '../bing/cast.js';
import { FAMILY } from '../bing/family.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { beginDeathTransition, restoreDeathTransition } from '../core/death-transition.js';
import { formalMeetingModel } from '../core/formal-appearance.js';
import { wardrobeFor } from '../core/wardrobe.js';

const ZERO = new THREE.Vector3();
const FLOOR_BOX = new THREE.Box3();
const WORLD_SCALE = new THREE.Vector3();

/** Stable local identities for the anonymous prospects in this ceremony. */
export const INITIATION_PROSPECT_IDS = Object.freeze({
  ONE: 'initiation.prospect.one',
  THREE: 'initiation.prospect.three',
  FOUR: 'initiation.prospect.four',
  FIVE: 'initiation.prospect.five',
});

/**
 * Tony has no third-person campaign body elsewhere. These fields preserve
 * the established Initiation palette on the shared articulated proportions.
 */
export const TONY_PROSPECT_MODEL = Object.freeze({
  height: 1.79,
  build: 1.05,
  dress: 'shirt',
  shirt: 0x6b7a4a,
  skin: 0xe8b88a,
  hair: 'short',
  hairColour: 0x3a2a1a,
  belt: 'leather',
});

const ANONYMOUS_PROSPECT_MODELS = Object.freeze({
  [INITIATION_PROSPECT_IDS.ONE]: Object.freeze({
    height: 1.76, build: 1.02, dress: 'shirt', shirt: 0xb0533a,
    skin: 0xc98d5f, hair: 'short', hairColour: 0x11100c, belt: 'leather',
  }),
  [INITIATION_PROSPECT_IDS.THREE]: Object.freeze({
    height: 1.82, build: 0.98, dress: 'shirt', shirt: 0x4a7a72,
    skin: 0xf0d0b0, hair: 'short', hairColour: 0x4a331c, belt: 'leather',
  }),
  [INITIATION_PROSPECT_IDS.FOUR]: Object.freeze({
    height: 1.78, build: 1.10, dress: 'shirt', shirt: 0x8a7a4a,
    skin: 0x8d5a3b, hair: 'crop', hairColour: 0x1e1c22, belt: 'leather',
  }),
  [INITIATION_PROSPECT_IDS.FIVE]: Object.freeze({
    height: 1.74, build: 0.96, dress: 'shirt', shirt: 0x6a5a7a,
    skin: 0xe8b88a, hair: 'receding', hairColour: 0x6e6659, belt: 'leather',
  }),
});

const FAMILY_MODELS = new Map(FAMILY.map((member) => [member.id, member.model]));

const IDENTITY_ALIASES = Object.freeze({
  TONY: CHARACTER_IDS.PROSPECT,
  'PROSPECT TWO': CHARACTER_IDS.PROSPECT,
  BOOSKIBRO: CHARACTER_IDS.BOOSKI,
  LOU: CHARACTER_IDS.LOU,
  'BIG UNCLE LOU SPUTTHOLE': CHARACTER_IDS.LOU,
  SASOLE: CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
  'CAPTAIN LOU SASOLE': CHARACTER_IDS.CAPTAIN_LOU_SASOLE,
  APE: CHARACTER_IDS.APE,
  LAG: CHARACTER_IDS.LAG,
  GRATIN: CHARACTER_IDS.GRATIN,
  ERIC: CHARACTER_IDS.ERIC,
  HOGMAMA: CHARACTER_IDS.HOG_MAMA,
  'HOG MAMA': CHARACTER_IDS.HOG_MAMA,
  DEATHMEGATRON: CHARACTER_IDS.DEATHMEGATRON,
  IRISH: CHARACTER_IDS.IRISH,
  SNOW: CHARACTER_IDS.SNOW,
  RIPPINFLOW: CHARACTER_IDS.RIPPINFLOW,
  SEFF: CHARACTER_IDS.SEFF,
  SHUBENATOR: CHARACTER_IDS.SHUBENATOR,
  'THE SHUBENATOR': CHARACTER_IDS.SHUBENATOR,
  NUMBSKULL: CHARACTER_IDS.NUMBSKULL,
  KITTENBOSS: CHARACTER_IDS.KITTENBOSS,
  'PROSPECT ONE': INITIATION_PROSPECT_IDS.ONE,
  'PROSPECT THREE': INITIATION_PROSPECT_IDS.THREE,
  'PROSPECT FOUR': INITIATION_PROSPECT_IDS.FOUR,
  'PROSPECT FIVE': INITIATION_PROSPECT_IDS.FIVE,
});

/** Convert script/layout labels into the stable identity used by the game. */
export function initiationFigureIdentity(identity) {
  const key = String(identity ?? '').trim();
  return IDENTITY_ALIASES[key.toUpperCase()] ?? key;
}

/**
 * Return the exact canonical model object, not a restatement of it.
 * Circle members therefore retain the same height, build, hair, skin, body
 * shape and jewellery they have everywhere else in Squatch Life.
 */
export function canonicalInitiationModel(identity) {
  const id = initiationFigureIdentity(identity);
  if (id === CHARACTER_IDS.PROSPECT) return TONY_PROSPECT_MODEL;
  if (ANONYMOUS_PROSPECT_MODELS[id]) return ANONYMOUS_PROSPECT_MODELS[id];
  return wardrobeFor(id) ?? FAMILY_MODELS.get(id) ?? null;
}

/** Formal scene clothes over an established body; never a new identity. */
export function initiationFormalModel(identity, { model = null, face = null } = {}) {
  const id = initiationFigureIdentity(identity);
  const canonical = model ?? canonicalInitiationModel(id);
  if (!canonical) throw new Error(`No canonical Initiation model for ${identity}`);
  const dressed = face ? { ...canonical, face } : canonical;
  return formalMeetingModel(id, dressed);
}

function copyTransform(node) {
  return {
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone(),
  };
}

function restoreTransform(node, transform) {
  node.position.copy(transform.position);
  node.quaternion.copy(transform.quaternion);
  node.scale.copy(transform.scale);
}

function poseNodes(figure) {
  return [
    figure.rig, figure.body, figure.torsoWrap, figure.head,
    figure.armL, figure.armR, figure.foreL, figure.foreR,
    figure.legL, figure.legR, figure.shinL, figure.shinR,
  ].filter(Boolean);
}

function applyMark(figure, mark, { floor = true } = {}) {
  if (!mark) return;
  if (Number.isFinite(mark.x)) figure.group.position.x = mark.x;
  if (Number.isFinite(mark.z)) figure.group.position.z = mark.z;
  if (floor) figure.group.position.y = Number.isFinite(mark.y) ? mark.y : 0;
  if (Number.isFinite(mark.heading)) figure.heading = mark.heading;
}

/**
 * Compatibility wrapper around the articulated shared person.
 *
 * Public fields intentionally mirror the old Initiation Person. `parts` is
 * also exposed for modern consumers: `attachToHand` uses `parts.handL/R`, and
 * the shared character weapon mount uses `parts.foreL/R` plus those sockets.
 */
/* The slam's three marks, in seconds on the figure's own clock. The values
 * are core/person.js's (WINDUP_END / IMPACT_T / SMASH_END) verbatim, so the
 * two rigs throw the same punch. */
const SMASH_WINDUP_END = 0.18;
const SMASH_IMPACT_T = 0.26;
const SMASH_END = 0.5;

export class InitiationCeremonyFigure {
  constructor({
    identity,
    model = null,
    face = null,
    appearance = null,
    castShadow = true,
    name = null,
  } = {}) {
    this.characterId = initiationFigureIdentity(identity);
    this.identityModel = model ?? canonicalInitiationModel(this.characterId);
    if (!this.identityModel) throw new Error(`No canonical Initiation model for ${identity}`);
    this.formalModel = initiationFormalModel(this.characterId, { model: this.identityModel, face });
    this.model = appearance
      ? Object.freeze({ ...this.formalModel, ...appearance })
      : this.formalModel;
    this.parts = makePerson({ ...this.model, castShadow });

    this.group = new THREE.Group();
    this.group.name = name ?? `initiation.ceremony.${this.characterId}`;
    this.group.userData.characterId = this.characterId;
    this.group.userData.identityModel = this.identityModel;
    this.group.userData.formalModel = this.formalModel;
    this.group.userData.appearanceModel = this.model;
    this.rig = this.parts.group;
    this.rig.name = `${this.group.name}.rig`;
    this.group.add(this.rig);

    for (const key of [
      'body', 'head', 'torso', 'torsoWrap', 'hips',
      'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR',
      'legL', 'legR', 'shinL', 'shinR',
    ]) this[key] = this.parts[key] ?? null;

    this._heading = 0;
    this.walkT = 0;
    this.breatheT = 0;
    this.swing = 0;
    this.lastStepSign = 0;
    this.stepSide = 1;
    this._pose = 'standing';
    /* The slam clock, mirrored from core/person.js so a scene can hand a
     * ceremony figure the same gesture it hands Tony: -1 is idle, and the
     * clock runs windup, impact, recover on the same three marks. Booskibro's
     * speech opens on one -- `line.gesture === 'slam'` in the scene -- and
     * asking a figure that cannot swing crashed the whole first act. */
    this.smashT = -1;
    this.impactFired = false;
    this._rest = new Map(poseNodes(this).map((node) => [node, copyTransform(node)]));
  }

  get position() { return this.group.position; }

  get heading() { return this._heading; }

  set heading(value) {
    if (!Number.isFinite(value)) return;
    this._heading = value;
    this.group.rotation.y = value;
  }

  get pose() { return this._pose; }

  facing(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** Restore the authored rig before applying a different ceremony pose. */
  resetArticulation() {
    for (const [node, transform] of this._rest) restoreTransform(node, transform);
    this.swing = 0;
    this._pose = 'standing';
    delete this.group.userData.cabinPose;
    this.group.userData.ceremonyPose = 'standing';
    return this;
  }

  /** Keep rendered anatomy on or above the floor without moving the root. */
  alignRigToFloor(floorY = this.group.position.y) {
    this.group.updateMatrixWorld(true);
    FLOOR_BOX.setFromObject(this.rig, true);
    if (!Number.isFinite(FLOOR_BOX.min.y)) return this;
    this.group.getWorldScale(WORLD_SCALE);
    const scaleY = Math.abs(WORLD_SCALE.y) > 1e-6 ? Math.abs(WORLD_SCALE.y) : 1;
    this.rig.position.y += (floorY - FLOOR_BOX.min.y) / scaleY;
    this.group.updateMatrixWorld(true);
    return this;
  }

  /**
   * Legacy update Interface: dt, floor-space move vector, speed, sprint flag,
   * optional footstep callback. Scripted poses remain intact when ticked.
   */
  startSmash() {
    if (this.smashT >= 0) return false;
    this.smashT = 0;
    this.impactFired = false;
    return true;
  }

  /** True exactly once per swing, the moment the fist lands. */
  consumeImpact() {
    if (this.smashT >= SMASH_IMPACT_T && !this.impactFired) {
      this.impactFired = true;
      return true;
    }
    return false;
  }

  get smashing() {
    return this.smashT >= 0;
  }

  update(dt, moveVec = ZERO, speed = 0, sprinting = false, onStep = null) {
    const delta = Math.max(0, Number(dt) || 0);
    this.breatheT += delta;
    const breathe = 1 + Math.sin(this.breatheT * 1.5) * 0.015;
    if (this.torsoWrap) {
      const rest = this._rest.get(this.torsoWrap);
      this.torsoWrap.scale.set(rest.scale.x * breathe, rest.scale.y, rest.scale.z * breathe);
    }
    if (this._pose !== 'standing') return this;

    const moving = (moveVec?.x ?? 0) ** 2 + (moveVec?.z ?? 0) ** 2 > 0.0001;
    if (moving) {
      const target = Math.atan2(moveVec.x, moveVec.z);
      const diff = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
      this.heading += diff * Math.min(1, 14 * delta);
      this.group.position.x += moveVec.x * speed * delta;
      this.group.position.z += moveVec.z * speed * delta;
      this.walkT += delta * speed * 1.1;
      this.swing = Math.min(1, this.swing + delta * 6);
    } else {
      this.swing = Math.max(0, this.swing - delta * 6);
    }

    const gait = Math.sin(this.walkT) * 0.7 * this.swing;
    this.legL.rotation.x = gait;
    this.legR.rotation.x = -gait;
    this.armL.rotation.x = gait * 0.7;
    this.armR.rotation.x = -gait * 0.7;

    /* The haymaker rides over the gait arms: wind the right arm back, swing
     * it through, recover -- the same keys and marks as core/person.js, so
     * the slam reads identically whoever throws it. */
    if (this.smashT >= 0) {
      this.smashT += delta;
      let armR;
      let armL;
      if (this.smashT < SMASH_WINDUP_END) {
        const k = this.smashT / SMASH_WINDUP_END;
        armR = THREE.MathUtils.lerp(0, -2.0, k);
        armL = THREE.MathUtils.lerp(0, 0.5, k);
      } else if (this.smashT < SMASH_IMPACT_T) {
        const k = (this.smashT - SMASH_WINDUP_END) / (SMASH_IMPACT_T - SMASH_WINDUP_END);
        armR = THREE.MathUtils.lerp(-2.0, 1.35, k);
        armL = THREE.MathUtils.lerp(0.5, -0.4, k);
      } else if (this.smashT < SMASH_END) {
        const k = (this.smashT - SMASH_IMPACT_T) / (SMASH_END - SMASH_IMPACT_T);
        armR = THREE.MathUtils.lerp(1.35, 0, k);
        armL = THREE.MathUtils.lerp(-0.4, 0, k);
      } else {
        armR = 0;
        armL = 0;
        this.smashT = -1;
      }
      this.armR.rotation.x = armR;
      this.armL.rotation.x = armL;
      this.head.rotation.x = armR * 0.08;
    }
    this.rig.position.y = this._rest.get(this.rig).position.y
      + Math.abs(Math.sin(this.walkT)) * 0.045 * this.swing;
    this.body.rotation.x = sprinting && moving ? 0.12 : 0;

    const stepSign = Math.sign(Math.sin(this.walkT));
    if (moving && stepSign && stepSign !== this.lastStepSign) {
      this.lastStepSign = stepSign;
      this.stepSide *= -1;
      onStep?.(this.stepSide);
    }
    return this;
  }
}

/** Build a formal, articulated figure from a script or campaign identity. */
export function makeInitiationCeremonyFigure(identity, options = {}) {
  return new InitiationCeremonyFigure({ identity, ...options });
}

const KNEEL = Object.freeze({
  /** Thighs stay almost vertical; knees move slightly in front of the hips. */
  thighPitch: -0.18,
  /** Relative shin fold; the shoe clears the floor behind the real knee. */
  shinPitch: 2.24,
  hipY: 0.505,
  bodyDrop: 0.417,
  bodyPitch: 0.10,
});

/** Return a ceremony figure to a true standing pose at an optional mark. */
export function poseStanding(figure, mark = null) {
  if (!(figure instanceof InitiationCeremonyFigure)) return figure;
  restoreDeathTransition(figure.group.userData.deathTransitionReceipt);
  figure.resetArticulation();
  applyMark(figure, mark);
  figure.group.rotation.x = 0;
  figure.group.rotation.z = 0;
  figure.group.userData.cabinPose = 'standing';
  figure.alignRigToFloor(figure.group.position.y);
  return figure;
}

/**
 * Put both real knee joints on the floor while the root remains on the floor.
 * Pelvis, torso and head are lowered through articulated nodes, never by
 * burying `group.position.y` below zero.
 */
export function poseKneeling(figure, mark = null) {
  if (!(figure instanceof InitiationCeremonyFigure)) return figure;
  figure.resetArticulation();
  applyMark(figure, mark);
  figure.group.rotation.x = 0;
  figure.group.rotation.z = 0;
  figure.body.position.y -= KNEEL.bodyDrop;
  figure.body.rotation.x = KNEEL.bodyPitch;
  for (const leg of [figure.legL, figure.legR]) {
    leg.position.y = KNEEL.hipY;
    leg.rotation.x = KNEEL.thighPitch;
  }
  for (const shin of [figure.shinL, figure.shinR]) shin.rotation.x = KNEEL.shinPitch;
  figure.armL.rotation.x = -0.14;
  figure.armR.rotation.x = -0.14;
  figure.foreL.rotation.x = -0.20;
  figure.foreR.rotation.x = -0.20;
  figure.walkT = 0;
  figure.swing = 0;
  figure._pose = 'kneeling';
  figure.group.userData.ceremonyPose = 'kneeling';
  figure.group.userData.cabinPose = 'kneeling';
  figure.alignRigToFloor(figure.group.position.y);
  return figure;
}

/** One restrained recoil while already kneeling; the death pose resets it. */
export function poseKneelingPanic(figure, mark = null, { retreat = 0.14 } = {}) {
  if (!(figure instanceof InitiationCeremonyFigure)) return figure;
  poseKneeling(figure, mark);
  const heading = typeof mark?.heading === 'number' ? mark.heading : figure.heading;
  figure.group.position.x -= Math.sin(heading) * retreat;
  figure.group.position.z -= Math.cos(heading) * retreat;
  figure.head.rotation.set(-0.18, 0.22, -0.08);
  figure.armL.rotation.set(-0.76, 0, -0.48);
  figure.armR.rotation.set(-0.70, 0, 0.48);
  figure.foreL.rotation.set(-1.02, 0, 0);
  figure.foreR.rotation.set(-1.02, 0, 0);
  figure.group.userData.executionReaction = 'panic';
  return figure;
}

/**
 * Fold a kneeling figure forward. The articulated rig is grounded after the
 * local fall, so a slow interpolation cannot sweep a torso through the mud.
 */
export function poseFallen(figure, mark = null, k = 1) {
  if (!(figure instanceof InitiationCeremonyFigure)) return figure;
  const t = THREE.MathUtils.clamp(Number(k) || 0, 0, 1);
  poseKneeling(figure, mark);
  beginDeathTransition(figure.group, { mode: 'scripted_execution' });
  figure.rig.rotation.x = 1.30 * t;
  figure.body.rotation.x = THREE.MathUtils.lerp(KNEEL.bodyPitch, 0.04, t);
  figure.armL.rotation.x = THREE.MathUtils.lerp(-0.14, -0.58, t);
  figure.armR.rotation.x = THREE.MathUtils.lerp(-0.14, -0.40, t);
  figure.legL.rotation.x = THREE.MathUtils.lerp(KNEEL.thighPitch, 0.12, t);
  figure.legR.rotation.x = THREE.MathUtils.lerp(KNEEL.thighPitch, 0.23, t);
  figure._pose = t >= 1 ? 'fallen' : 'falling';
  figure.group.userData.ceremonyPose = figure._pose;
  figure.group.userData.cabinPose = figure._pose;
  figure.alignRigToFloor(figure.group.position.y);
  return figure;
}

/** Ground a standing fall from rendered bounds instead of a guessed root. */
export function poseStandingFallen(figure, mark = null, k = 1, { floorY = 0 } = {}) {
  if (!(figure instanceof InitiationCeremonyFigure)) return figure;
  const t = THREE.MathUtils.clamp(Number(k) || 0, 0, 1);
  figure.resetArticulation();
  applyMark(figure, { ...mark, y: floorY });
  beginDeathTransition(figure.group, { mode: 'scripted_execution' });
  /* Keep the world root upright. alignRigToFloor corrects along rig-local Y;
   * rotating the parent first made that axis diagonal and let intermediate
   * poses penetrate the floor. The rig is the single connected anatomy root,
   * so rotating it still topples torso, pelvis and both legs together. */
  figure.group.rotation.x = 0;
  figure.group.rotation.z = 0;
  figure.rig.rotation.x = -Math.PI * 0.5 * t;
  figure._pose = t >= 1 ? 'fallen' : 'falling';
  figure.group.userData.ceremonyPose = figure._pose;
  figure.group.userData.cabinPose = figure._pose;
  delete figure.group.userData.executionReaction;
  figure.alignRigToFloor(floorY);
  return figure;
}

/**
 * Cabin-chair compatibility for Lou. It is the shared rig's measured seated
 * articulation, applied to the inner rig so the scene root remains on its
 * floor datum just like every other ceremony figure.
 */
export function poseSeated(figure, seat, floorY = 0) {
  if (!(figure instanceof InitiationCeremonyFigure) || !seat) return figure;
  figure.resetArticulation();
  applyMark(figure, { ...seat, y: floorY });
  const heightScale = figure.parts.heightScale ?? 1;
  figure.rig.position.y = (seat.cushion ?? 0.53) - 0.53 - 0.42 * heightScale;
  for (const leg of [figure.legL, figure.legR]) {
    leg.position.y = 0.960;
    leg.rotation.x = -1.45;
  }
  for (const shin of [figure.shinL, figure.shinR]) shin.rotation.x = 1.4;
  figure.armL.rotation.x = -0.5;
  figure.armR.rotation.x = -0.5;
  figure.foreL.rotation.x = -0.5;
  figure.foreR.rotation.x = -0.5;
  figure._pose = 'seated';
  figure.group.userData.ceremonyPose = 'seated';
  figure.group.userData.cabinPose = 'seated';
  return figure;
}

/** Legacy staging name: clear any authored pose without moving the mark. */
export function clearPose(figure) {
  return poseStanding(figure);
}

/** The pose query used by a scene update loop to avoid overwriting staging. */
export function isCeremonyPosed(figure) {
  return figure?.pose === 'kneeling' || figure?.pose === 'falling'
    || figure?.pose === 'fallen' || figure?.pose === 'seated';
}

/** Legacy staging name retained for a one-import-path migration in main.js. */
export const isPosed = isCeremonyPosed;
