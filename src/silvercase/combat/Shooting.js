import * as THREE from 'three';
import { BulletHoles } from '../../world/bullets.js';

/**
 * Where the bullet actually went, and what it left behind.
 *
 * This module exists because of one playtest note: *"you should also actually
 * have to shoot where you are aiming. I just clicked on the guy in the chair
 * and it killed the bathroom guy."* Every beat in this mission used to resolve
 * a left click by script — `firePressed` meant "the ordered man dies", wherever
 * the crosshair happened to be pointing. `ShotResolver` replaces that with a
 * real ray down the middle of the screen; the mission's beats then decide what
 * hitting (or missing) their man means.
 *
 * Nothing here is new technology. The ray is the one `src/main.js`'s `fireGun`
 * casts from the camera rather than from the held model — the held gun sits low
 * and right, and firing from the barrel would put the hole beside everything
 * you aimed at. The decals are `src/world/bullets.js`'s pooled `BulletHoles`,
 * the same system the Squatchfather's restaurant and NO WAKE's deck use, in its
 * two flavours: plaster holes for the room and wounds for people.
 */

/** Dead centre of the screen — the reticle in silvercase.html is drawn there. */
const CENTER = new THREE.Vector2(0, 0);

/** Nothing in this flat is more than twelve metres away. */
const RANGE = 30;

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * A mesh the ray must ignore. Interaction proxies (the front door's and the
 * case's hit boxes) are real geometry with an invisible material sitting
 * proud of the thing they stand for, so a bullet that stopped on one would
 * stop half a metre short of the door it was aimed at.
 */
function isPhantom(object) {
  const m = object.material;
  if (!m) return true;
  if (Array.isArray(m)) return m.every((one) => one.visible === false);
  return m.visible === false;
}

export class ShotResolver {
  /**
   * @param {THREE.Camera} camera
   * @param {object} o
   * @param {THREE.Object3D} o.root the world the ray is allowed to hit; the
   *   cast is parented into it, so people and plaster are one list and the
   *   nearest hit wins the way it should.
   */
  constructor(camera, { root, far = RANGE } = {}) {
    this.camera = camera;
    this.root = root;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = far;
    /** figure group -> Actor, for resolving a hit mesh back to a person. */
    this.actors = new Map();
  }

  /** Make an actor's whole figure hittable and identifiable. */
  registerActor(actor) {
    this.actors.set(actor.group, actor);
    actor.group.userData.silvercaseActor = actor;
    return actor;
  }

  /** Walk up from a hit mesh to the figure that owns it, if any. */
  actorOf(object) {
    let node = object;
    while (node) {
      const actor = this.actors.get(node) || node.userData?.silvercaseActor;
      if (actor) return actor;
      node = node.parent;
    }
    return null;
  }

  /**
   * What the crosshair is on right now. Pure: no audio, no decals, no state —
   * safe to call every frame for the HUD's target callout, and called again by
   * the trigger for the shot itself.
   *
   * @returns {{actor: Actor|null, point: THREE.Vector3, normal: THREE.Vector3,
   *   distance: number, object: THREE.Object3D}|null}
   */
  trace() {
    this.raycaster.setFromCamera(CENTER, this.camera);
    return this._resolve();
  }

  /**
   * The same ray, from somewhere that is not the player's eye — Ape's muzzle
   * when he fires alongside Tony. Taking the impact point off a real ray rather
   * than guessing at a chest height is what keeps his hits on the body.
   */
  traceFrom(origin, direction) {
    this.raycaster.set(origin, _dir.copy(direction).normalize());
    return this._resolve();
  }

  _resolve() {
    if (!this.root) return null;
    const hits = this.raycaster.intersectObject(this.root, true);
    for (const hit of hits) {
      if (!hit.face || !hit.object.visible || isPhantom(hit.object)) continue;
      const normal = hit.face.normal.clone()
        .transformDirection(hit.object.matrixWorld)
        .normalize();
      return {
        actor: this.actorOf(hit.object),
        object: hit.object,
        point: hit.point.clone(),
        normal,
        distance: hit.distance,
      };
    }
    return null;
  }
}

/**
 * The marks a shot leaves.
 *
 * Three pools rather than one, because `BulletHoles` is deliberately sized to
 * a revolver's cylinder (eight quads) and recycles past that: holes in the room
 * and wounds on people are different materials anyway, and splitting the wound
 * pool in two — the entry mark and the spatter thrown with it — means the four
 * men who can be shot in this mission never push each other's blood off screen.
 */
/** Every decal stuck to a person answers to this name. */
export const MARK_NAME = 'silvercase.mark';

export class ImpactKit {
  constructor(scene) {
    this.scene = scene;
    this.holes = new BulletHoles(scene);
    this.wounds = new BulletHoles(scene, 'blood');
    this.spatter = new BulletHoles(scene, 'blood');
    /** Actor -> the decals stuck to him, so a checkpoint retry can wipe them. */
    this._onActors = new Map();
  }

  /** Light the room from the muzzle for the length of the flash. */
  muzzle(at) {
    this.holes.muzzle(at);
  }

  /** A hole in whatever was behind him. */
  surface(point, normal) {
    return this.holes.punch(point, normal);
  }

  /**
   * A wound, on the man, that travels with him as he goes down.
   *
   * Attached to the limb GROUP rather than to the mesh the ray hit: the
   * figure builder encodes a slab's size in its scale (see `makePerson`'s note
   * on `torso.userData.base`), and a decal parented to a non-uniformly scaled
   * mesh comes out sheared. `head` and `body` are plain groups under the
   * figure's own uniform height scale, which is exactly what a decal wants.
   */
  body(actor, point, towardShooter, { spatter = true } = {}) {
    const parts = actor.parts;
    // The head GROUP's origin is the base of the neck (`makePerson` puts it at
    // body-local y=1.50 and hangs the neck box off it), so "above the collar"
    // is a few centimetres above that origin rather than at it.
    const onHead = point.y > parts.head.getWorldPosition(_v).y + 0.06;
    const anchor = onHead ? parts.head : parts.body;
    const marks = this._onActors.get(actor) || [];
    const wound = this.wounds.punchAttached(anchor, point, towardShooter);
    // Named so anything measuring a figure — the verify script's own bounding
    // boxes, for one — can tell the man from what was done to him. A 31 cm
    // quad stuck on a body that then topples reaches outside its silhouette.
    wound.name = MARK_NAME;
    marks.push(wound);
    if (spatter) {
      const low = point.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.22, -0.26 - Math.random() * 0.12, (Math.random() - 0.5) * 0.22,
      ));
      const thrown = this.spatter.punchAttached(parts.body, low, towardShooter);
      thrown.name = MARK_NAME;
      marks.push(thrown);
    }
    this._onActors.set(actor, marks);
    return marks;
  }

  /** The marks currently stuck to this man. */
  marksFor(actor) {
    return (this._onActors.get(actor) || []).filter((mark) => mark.visible);
  }

  /** How many marks are currently stuck to this man. */
  marksOn(actor) {
    return this.marksFor(actor).length;
  }

  /** Take the blood back off a man the checkpoint has just put back on his feet. */
  clearActor(actor) {
    const marks = this._onActors.get(actor);
    if (!marks) return;
    for (const mark of marks) {
      if (mark.parent !== this.scene) this.scene.attach(mark);
      mark.visible = false;
    }
    this._onActors.delete(actor);
  }

  update(dt) {
    this.holes.update(dt);
    this.wounds.update(dt);
    this.spatter.update(dt);
  }

  reset() {
    this.holes.reset();
    this.wounds.reset();
    this.spatter.reset();
    this._onActors.clear();
  }
}
