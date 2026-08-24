/**
 * The shared weapon runtime: one of these per scene, seven guns behind it.
 *
 * A scene hands over a camera, a parent for world objects, an AudioEngine and
 * a way to ask where the floor is; it gets back something it can hold a gun
 * with. Everything the owner listed lives here — tracers, magazine ejections,
 * bullet counts, the empty click, and the five sounds per weapon:
 *
 *   equip(id) / stow()      what is in the player's hands
 *   setTrigger(down)        auto weapons keep firing while it is down
 *   reload()                two-phase: out, the magazine falls, in
 *   update(dt)              drives all of it
 *   hud()                   {name, rounds, capacity, reserve, state}
 *
 * WHAT THIS DOES NOT DO, ON PURPOSE. It resolves nothing about people. A shot
 * produces a tracer, a muzzle flash, a noise and an impact point against
 * WORLD GEOMETRY, and stops there. A multi-projectile trigger publishes one
 * immutable path per pellet while still spending one shell and emitting one
 * weapon event. Any scene that wants a round to hurt somebody supplies its
 * own `onImpact` and decides that itself, with its own
 * roster in front of it — which is also the only way the standing rule that
 * **Snow never enters player-hostile targeting or damage logic** can be kept
 * by a system that has never heard of Snow. There is no actor list in this
 * file and there must not be one.
 *
 * TRACERS come from `core/combat/tracers.js` — one InstancedMesh for every
 * round in the air, lifted out of The Enola Squatch, whose raid is the reason
 * that class exists. A hundred-round belt out of the SAW is a hundred rounds
 * and one draw call.
 */
import * as THREE from 'three';
import { resolveMaterialPath } from '../combat/ballistics.js';
import { CombatProjectilePattern } from '../combat/projectile-pattern.js';
import { TracerPool } from '../combat/tracers.js';
import { EjectaPool } from './Ejecta.js';
import { Firearm } from './Firearm.js';
import { buildWeaponModel } from './models.js';
import { WEAPON_CATALOG, weaponCue, weaponDef } from './catalog.js';
import { playWeaponCue, playWeaponPickup, playWeaponStow } from './audio.js';

/* Where each class of gun sits in front of the camera. Distances are chosen
 * against a ~70 degree field: at half a metre the frame is about 0.7 m tall,
 * so a 0.2 m pistol reads as a fifth of the screen and a 1.36 m Barrett as a
 * diagonal across the bottom right — held, not pressed against the lens. */
const HOLD = {
  revolver: { position: [0.19, -0.20, -0.40], rotation: [0.03, 0.09, 0] },
  pistol: { position: [0.18, -0.19, -0.42], rotation: [0.03, 0.08, 0] },
  rifle: { position: [0.20, -0.20, -0.50], rotation: [0.04, 0.10, 0] },
  lmg: { position: [0.23, -0.24, -0.56], rotation: [0.05, 0.11, 0] },
  sniper: { position: [0.22, -0.20, -0.62], rotation: [0.03, 0.09, 0] },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

function worldHitNormal(hit, fallbackDirection) {
  let normal = fallbackDirection.clone().negate();
  if (hit?.face?.normal?.isVector3 && hit.object?.matrixWorld) {
    normal = hit.face.normal.clone().applyNormalMatrix(
      new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld),
    );
  }
  if (normal.lengthSq() <= 1e-12) normal.copy(fallbackDirection).negate();
  return normal.normalize();
}

/**
 * A tracer may arrive after its target has moved. Preserve the contact in the
 * local space of every current ancestor so CombatImpactResolver can select its
 * authored body anchor later without re-projecting an old world point through
 * the target's new transform.
 */
function captureLocalContacts(object, point, normal) {
  if (!object?.isObject3D || !point?.isVector3) return Object.freeze([]);
  const contacts = [];
  let anchor = object;
  while (anchor?.isObject3D) {
    anchor.updateWorldMatrix?.(true, false);
    const localPoint = anchor.worldToLocal(point.clone());
    let localNormal = null;
    if (normal?.isVector3 && anchor.matrixWorld) {
      localNormal = normal.clone().applyMatrix3(
        new THREE.Matrix3().setFromMatrix4(anchor.matrixWorld).transpose(),
      ).normalize();
    }
    contacts.push(Object.freeze({
      anchor,
      point: Object.freeze(localPoint),
      normal: localNormal ? Object.freeze(localNormal) : null,
    }));
    anchor = anchor.parent ?? null;
  }
  return Object.freeze(contacts);
}

/** Three's raycaster does not treat `visible = false` as non-collidable. */
function isWorldVisible(object) {
  let node = object;
  while (node) {
    if (node.visible === false) return false;
    node = node.parent;
  }
  return true;
}

function taggedAncestor(object, key) {
  let node = object ?? null;
  while (node) {
    const value = node.userData?.[key] ?? node[key];
    if (value != null) return { node, value };
    node = node.parent ?? null;
  }
  return null;
}

function contactOwner(object, materialTag) {
  if (materialTag?.node) return materialTag.node;
  return taggedAncestor(object, 'combatant')?.node
    ?? taggedAncestor(object, 'combatActor')?.node
    ?? object;
}

function contactId(owner, order) {
  const id = owner?.userData?.combatId ?? owner?.userData?.combatant?.id
    ?? owner?.userData?.combatActor?.id ?? owner?.combatId
    ?? owner?.name ?? owner?.uuid;
  return id == null || id === '' ? `~${String(order).padStart(10, '0')}` : String(id);
}

function rayObjectInterval(object, origin, direction, range) {
  const explicit = Number(
    object?.userData?.combatThickness ?? object?.combatThickness,
  );
  if (Number.isFinite(explicit) && explicit >= 0) {
    return { thickness: explicit, exitDistance: null };
  }
  object?.updateWorldMatrix?.(true, true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return { thickness: 0, exitDistance: null };
  let near = 0;
  let far = Math.max(0, Number(range) || 0);
  for (const axis of ['x', 'y', 'z']) {
    const component = direction[axis];
    if (Math.abs(component) <= 1e-9) {
      if (origin[axis] < bounds.min[axis] || origin[axis] > bounds.max[axis]) {
        return { thickness: 0, exitDistance: null };
      }
      continue;
    }
    let entry = (bounds.min[axis] - origin[axis]) / component;
    let exit = (bounds.max[axis] - origin[axis]) / component;
    if (entry > exit) [entry, exit] = [exit, entry];
    near = Math.max(near, entry);
    far = Math.min(far, exit);
    if (near > far) return { thickness: 0, exitDistance: null };
  }
  return {
    thickness: Math.max(0, far - near),
    exitDistance: Math.max(0, far),
  };
}

function orderedRayContacts(hits, origin, direction, range) {
  const contacts = [];
  const seen = new Set();
  const ordered = [...hits].sort((a, b) => a.distance - b.distance);
  for (const [order, hit] of ordered.entries()) {
    const materialTag = taggedAncestor(hit.object, 'combatMaterial');
    const owner = contactOwner(hit.object, materialTag);
    if (seen.has(owner)) continue;
    seen.add(owner);
    const interval = rayObjectInterval(owner, origin, direction, range);
    const distance = Math.max(0, Number(hit.distance) || origin.distanceTo(hit.point));
    const exitDistance = interval.exitDistance == null
      ? distance + interval.thickness
      : Math.max(distance, interval.exitDistance);
    const normal = worldHitNormal(hit, direction);
    contacts.push({
      hit,
      box: owner,
      object: hit.object,
      id: contactId(owner, order),
      distance,
      exitDistance,
      thickness: Math.max(0, exitDistance - distance),
      point: hit.point.clone(),
      exitPoint: origin.clone().addScaledVector(direction, exitDistance),
      normal,
      material: typeof materialTag?.value === 'string' && materialTag.value.trim()
        ? materialTag.value.trim()
        : null,
      localContacts: captureLocalContacts(hit.object, hit.point, normal),
    });
  }
  return contacts;
}

function immutableVector(value) {
  return value?.isVector3 ? Object.freeze(value.clone()) : null;
}

export class WeaponSystem {
  /**
   * @param {object} o
   * @param {THREE.Camera} o.camera        the player's camera; the held gun
   *   parents to it.
   * @param {THREE.Object3D} o.world       parent for tracers and dropped
   *   magazines — scene root, normally.
   * @param {object} [o.audio]             an AudioEngine.
   * @param {(x:number,z:number)=>number} [o.groundAt] floor height, for ejecta.
   * @param {THREE.Object3D[]} [o.hitTargets] geometry a round can stop on. A
   *   round that hits nothing simply runs to `range`.
   * @param {number} [o.range]             metres a round travels unobstructed.
   * @param {Function} [o.onImpact]        Receives one complete immutable
   *   contact per ordered surface reached by the shot: `{point, normal,
   *   origin, direction, distance, object, weapon, damage, penetration,
   *   material, penetrated, stopped, remainingEnergy, remainingPenetration,
   *   localContacts}`. Damage is the energy arriving at that contact, after
   *   any declared thin material in front of it. The ray vectors are frozen
   *   world-space copies; `localContacts` is frozen fire-time transport
   *   metadata for ancestor/body-anchor attachment. Mapping a contact to a
   *   Combatant remains the scene Adapter's responsibility.
   * @param {Function} [o.onEvent]         ({type, ...}) for HUD/telemetry.
   *   The existing `fire` event includes an immediate frozen `shot` record,
   *   including empty-air rounds; impact callbacks remain tracer-delayed.
   */
  constructor({
    camera, world, audio = null, groundAt = () => 0,
    hitTargets = [], range = 60, onImpact = null, onEvent = null,
  }) {
    this.camera = camera;
    this.world = world;
    this.audio = audio;
    this.groundAt = groundAt;
    this.hitTargets = hitTargets;
    this.range = range;
    this.onImpact = onImpact;
    this.onEvent = onEvent;

    this.tracers = new TracerPool(world, 160, { minLength: 0.9 });
    this.ejecta = new EjectaPool(world, { groundAt, capacity: 24 });
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = range;

    /** Ammunition survives being put back on the rack, per weapon id. */
    this.firearms = new Map();

    /** The rig every held gun parents to. */
    this.rig = new THREE.Group();
    this.rig.name = 'weapons.viewmodel';
    camera.add(this.rig);

    this.models = new Map();
    this.current = null;
    this.model = null;

    /* Muzzle flash: one small unlit card and one point light, reused. The
     * light is created once and dimmed to zero rather than hidden, because
     * three.js recompiles every material in the scene when the number of
     * VISIBLE lights changes — the mansion's own light rig has the same note
     * on it and learned it the hard way. */
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({
        color: 0xffd487, transparent: true, opacity: 0, toneMapped: false, depthWrite: false,
      }),
    );
    this.flash.name = 'weapons.muzzleflash';
    this.rig.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffce80, 0, 7, 2);
    this.rig.add(this.flashLight);
    this._flashTime = 0;

    this.recoilKick = 0;
    this.swap = 0;
    this.sway = 0;
    this.enabled = true;
    this.aimed = false;
    this.aimBlend = 0;
    this.suppression = 0;
    this.aimStability = 1;
    this._baseFov = Number.isFinite(Number(camera?.fov)) ? Number(camera.fov) : null;
    this._managingFov = false;

    /** Counters a verifier can read without watching pixels. */
    this.stats = { shots: 0, dryClicks: 0, reloads: 0, ejections: 0, impacts: 0 };
    /* Which cue this system ASKED for, most recent last, bounded. A verifier
     * cannot hear a gunshot, but it can prove the gun asked for
     * `weapon.saw.fire` and that a decoded recording exists to answer with —
     * which together is the whole claim "the sound is wired". */
    this.cueLog = [];
    /** Cues that fell through to a stand-in recording. See `_cue`. */
    this.standInCues = [];
  }

  /* ---------------------------------------------------------------- */
  /* Inventory                                                          */
  /* ---------------------------------------------------------------- */

  /** The Firearm for an id, minted on first use and kept afterwards. */
  firearm(id) {
    let f = this.firearms.get(id);
    if (!f) { f = new Firearm(id); this.firearms.set(id, f); }
    return f;
  }

  /** The model for an id, built on first use and kept afterwards. */
  modelFor(id) {
    let m = this.models.get(id);
    if (!m) {
      m = buildWeaponModel(id);
      m.visible = false;
      const def = weaponDef(id);
      const hold = HOLD[def.kind] || HOLD.rifle;
      m.position.fromArray(hold.position);
      m.rotation.fromArray(hold.rotation);
      m.userData.hold = hold;
      this.rig.add(m);
      this.models.set(id, m);
    }
    return m;
  }

  get equipped() { return this.current; }

  /**
   * Put a gun in the player's hands.
   * @returns {boolean} whether anything changed.
   */
  equip(id) {
    if (!WEAPON_CATALOG[id]) return false;
    if (this.current === id) return false;
    this.stow({ silent: true });
    this.current = id;
    this.model = this.modelFor(id);
    this.model.visible = true;
    this.swap = 1;
    this.firearm(id).setTrigger(false);
    playWeaponPickup(this.audio, { volume: 0.5 });
    this._emit({ type: 'equip', id });
    return true;
  }

  /** Take it out of the player's hands. Ammunition is kept. */
  stow({ silent = false } = {}) {
    if (!this.current) return false;
    const id = this.current;
    this.firearm(id).setTrigger(false);
    this.firearm(id).cancelReload();
    if (this.model) this.model.visible = false;
    this.current = null;
    this.model = null;
    this.aimed = false;
    this.aimBlend = 0;
    this._restoreBaseFov();
    this._flashTime = 0;
    if (!silent) playWeaponStow(this.audio, { volume: 0.45 });
    this._emit({ type: 'stow', id });
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Trigger and reload                                                 */
  /* ---------------------------------------------------------------- */

  /** Enter or leave aim-down-sights. The visual transition is driven by update(). */
  setAimed(value) {
    const next = value === true;
    if (next && !this.aimed && this.aimBlend <= 0.001
      && Number.isFinite(Number(this.camera?.fov))) {
      // Respect a scene-selected field of view at the moment ADS begins.
      this._baseFov = Number(this.camera.fov);
      this._managingFov = true;
    }
    this.aimed = next;
    return this.aimed;
  }

  /**
   * Feed the shared suppression model into weapon handling.
   * Accepts a 0..1 suppression value, a SuppressionModel-like object, or an
   * explicit second aim-stability value for adapters that already computed it.
   */
  setSuppression(value = 0, aimStability = null) {
    let level = value;
    let stability = aimStability;
    if (value && typeof value === 'object') {
      level = value.value;
      stability = value.aimStability;
      if (!Number.isFinite(Number(level)) && Number.isFinite(Number(stability))) {
        level = (1 - Number(stability)) / 0.38;
      }
    }
    this.suppression = Math.max(0, Math.min(1, Number(level) || 0));
    this.aimStability = Number.isFinite(Number(stability))
      ? Math.max(0, Math.min(1, Number(stability)))
      : 1 - this.suppression * 0.38;
    return this.suppression;
  }

  setTrigger(down) {
    if (!this.current) return;
    this.firearm(this.current).setTrigger(down);
    if (down) this._pullTrigger();
  }

  /**
   * Cancel rounds whose visual flight has not reached its recorded impact.
   * Checkpoint rewinds must call this before restoring actors, or an old
   * tracer's delayed callback can damage the newly restored timeline.
   */
  cancelPendingImpacts() {
    const cancelled = this.tracers.live;
    this.tracers.clear();
    this._flashTime = 0;
    this.flash.visible = false;
    this.flashLight.intensity = 0;
    return cancelled;
  }

  /** One deliberate shot — a click, or a verifier asking for exactly one. */
  triggerPress() {
    if (!this.current) return null;
    const f = this.firearm(this.current);
    f.setTrigger(true);
    const r = this._pullTrigger();
    f.setTrigger(false);
    return r;
  }

  reload() {
    if (!this.current) return false;
    const started = this.firearm(this.current).reload();
    if (started) {
      this.stats.reloads++;
      this._emit({ type: 'reload-start', id: this.current });
      this._cue('reload.out', { volume: 0.55 });
    }
    return started;
  }

  _pullTrigger() {
    if (!this.enabled || !this.current) return null;
    const f = this.firearm(this.current);
    const shot = f.fire({ aimed: this.aimed, aimStability: this.aimStability });
    if (shot.fired) { this._onShot(f, shot); return shot; }
    if (shot.reason === 'empty') {
      /* The dry click, and only on the transition. `fire()` returns 'semi'
       * for every later frame the trigger is still down, so an emptied
       * automatic clicks once rather than thirteen times a second. */
      this.stats.dryClicks++;
      this._cue('empty', { volume: 0.6 });
      this._emit({ type: 'empty', id: this.current });
    }
    return shot;
  }

  /* ---------------------------------------------------------------- */
  /* One round                                                          */
  /* ---------------------------------------------------------------- */
  _onShot(firearm, shot) {
    this.stats.shots++;
    const def = firearm.def;
    const model = this.model;
    const triggerId = this.stats.shots;

    /* Muzzle, in world space, off the model's own userData. This is where the
     * TRACER leaves from and where the flash is drawn. It is deliberately not
     * where the round starts: see below. */
    const muzzleLocal = model?.userData?.muzzle ?? _v.set(0, 0, -0.3);
    const muzzle = (model
      ? model.localToWorld(_v.copy(muzzleLocal))
      : this.camera.getWorldPosition(_v)).clone();

    /* THE ROUND STARTS AT THE EYE, NOT AT THE BARREL.
     *
     * The direction has always been the camera's, because a player who aims
     * at a light switch expects to hit the light switch. The ORIGIN used to
     * be the muzzle, and those two together are a parallel offset: the held
     * model sits 0.2 m right and 0.2 m below the eye so it does not cover the
     * screen, so the shot travelled down a line 0.2 m right and 0.2 m below
     * the one the crosshair is on -- and stayed there, at every range,
     * because the two lines never converge.
     *
     * Owner, 2026-08-24, on the Siege: *"there is also room for the decals to
     * be more accurate on the target where you hit it."* That is this. Aim at
     * a man's head at five metres and the hole appears on his shoulder; aim
     * at the edge of a doorway and the round goes through the frame. It was
     * never the decal system, which places a mark exactly where it is told --
     * it was being told a point on the wrong line.
     *
     * So the ballistic ray is the SIGHT ray, eye to crosshair, and the muzzle
     * is demoted to what it always should have been: the visual start of the
     * tracer, which converges on the impact the way a real barrel does.
     * Spread is applied about the sight ray. */
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    this.camera.getWorldDirection(_dir).normalize();
    _right.set(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(_q));
    _up.set(0, 1, 0).applyQuaternion(_q);
    const spread = shot.spread ?? def.spread;
    const projectileCount = Math.max(1, Math.trunc(Number(shot.projectiles) || 1));
    let projectileRays;
    if (projectileCount > 1) {
      projectileRays = new CombatProjectilePattern({ random: Math.random }).sample({
        origin,
        direction: _dir.clone(),
        right: _right.clone(),
        up: _up.clone(),
        count: projectileCount,
        spread,
        range: this.range,
      });
    } else {
      const direction = _dir.clone();
      if (spread > 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        direction.addScaledVector(_right, Math.cos(a) * r)
          .addScaledVector(_up, Math.sin(a) * r).normalize();
      }
      projectileRays = [{
        index: 0,
        origin: origin.clone(),
        direction,
        end: origin.clone().addScaledVector(direction, this.range),
      }];
    }

    const pelletTruths = [];
    for (const projectile of projectileRays) {
      const direction = projectile.direction.clone().normalize();
      let end = projectile.end.clone();
      let materialPath = resolveMaterialPath([], {
        penetration: def.penetration,
        energy: def.damage,
      });
      if (this.hitTargets.length) {
        this.raycaster.set(origin, direction);
        this.raycaster.far = this.range;
        /* Glass panes and pooled actors are hidden rather than removed. Three's
         * raycaster still returns their child meshes, so filter the complete
         * ancestor chain before choosing what actually stops the round. */
        const hits = this.raycaster.intersectObjects(this.hitTargets, true)
          .filter((candidate) => isWorldVisible(candidate.object));
        materialPath = resolveMaterialPath(
          orderedRayContacts(hits, origin, direction, this.range),
          { penetration: def.penetration, energy: def.damage },
        );
        if (materialPath.blocked && materialPath.end?.isVector3) {
          end = materialPath.end.clone();
        }
      }

      /* Tracers arrive later. Freeze one fire-time transport record per
       * projectile/contact rather than closing over scratch vectors or moving
       * scene transforms. */
      const impactPlan = Object.freeze(materialPath.contacts.map((contact) => Object.freeze({
        hit: contact.hit,
        damage: contact.energyBefore,
        material: contact.material,
        penetrated: contact.penetrated === true,
        stopped: contact.stopped === true,
        remainingEnergy: contact.energyAfter,
        remainingPenetration: contact.penetrationAfter,
        projectileIndex: projectile.index,
        projectiles: projectileCount,
        triggerId,
        triggerDamageCap: Number(def.triggerDamageCap) || def.damage * projectileCount,
        ray: Object.freeze({
          point: immutableVector(contact.point),
          origin: immutableVector(origin),
          direction: immutableVector(direction),
          distance: contact.distance,
          normal: immutableVector(contact.normal),
          localContacts: contact.localContacts ?? Object.freeze([]),
        }),
      })));
      const shotContacts = Object.freeze(materialPath.contacts.map((contact) => Object.freeze({
        id: contact.id ?? null,
        object: contact.object ?? contact.hit?.object ?? null,
        point: immutableVector(contact.point),
        normal: immutableVector(contact.normal),
        distance: Math.max(0, Number(contact.distance) || 0),
        thickness: Math.max(0, Number(contact.thickness) || 0),
        material: contact.material ?? null,
        penetrated: contact.penetrated === true,
        stopped: contact.stopped === true,
        damage: Math.max(0, Number(contact.energyBefore) || 0),
        remainingEnergy: Math.max(0, Number(contact.energyAfter) || 0),
        remainingPenetration: Math.max(0, Number(contact.penetrationAfter) || 0),
      })));
      const pelletTruth = Object.freeze({
        fired: true,
        projectileIndex: projectile.index,
        projectiles: projectileCount,
        triggerId,
        origin: immutableVector(origin),
        direction: immutableVector(direction),
        end: immutableVector(end),
        distance: origin.distanceTo(end),
        contacts: shotContacts,
        blocked: materialPath.blocked,
        stopped: materialPath.blocked,
        weapon: def.id,
        damage: def.damage,
        penetration: def.penetration,
        remainingEnergy: materialPath.remainingEnergy,
        remainingPenetration: materialPath.remainingPenetration,
      });
      pelletTruths.push(pelletTruth);

      const arrive = impactPlan.length ? () => {
        for (const planned of impactPlan) this._impact(planned.hit, def, planned.ray, planned);
      } : null;
      if (shot.tracer) {
        /* The streak leaves the barrel and converges on the impact. Where the
         * contact is nearer than the muzzle is far forward -- a man at arm's
         * length, a wall the player is pressed against -- the muzzle is past
         * the end of the round's travel, and a streak drawn from there would
         * run backwards. Start those at the eye. */
        const muzzleAhead = _v2.copy(muzzle).sub(origin).dot(direction);
        this.tracers.fire({
          from: origin.distanceTo(end) > muzzleAhead ? muzzle : origin,
          to: end,
          speed: def.tracer.speed,
          colour: def.tracer.colour,
          width: def.tracer.width,
          onArrive: arrive,
        });
      } else if (arrive) {
        arrive();
      }
    }

    const pellets = Object.freeze(pelletTruths);
    const primary = pellets[0];
    const shotTruth = Object.freeze({
      ...primary,
      projectiles: projectileCount,
      triggerDamageCap: Number(def.triggerDamageCap) || def.damage * projectileCount,
      pellets,
    });

    // Flash, kick, brass.
    this._flashTime = 0.055;
    this.flash.position.copy(model ? _v.copy(muzzleLocal).applyMatrix4(model.matrix) : _v.set(0, 0, -0.3));
    this.flashLight.position.copy(this.flash.position);
    this.recoilKick = Math.min(1.4, this.recoilKick + 0.55 + def.recoil * 3);
    if (!def.cycleEject) this._ejectCase(firearm);

    this._cue('fire', { volume: 0.75 });
    this._emit({
      type: 'fire', id: firearm.id, rounds: firearm.rounds, reserve: firearm.reserve,
      tracer: shot.tracer, shot: shotTruth,
    });
  }

  _impact(hit, def, ray = null, contact = null) {
    this.stats.impacts++;
    const point = ray?.point?.isVector3 ? ray.point.clone() : hit.point.clone();
    const direction = ray?.direction?.isVector3
      ? ray.direction.clone().normalize()
      : this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    const rayDistance = Number.isFinite(Number(ray?.distance))
      ? Math.max(0, Number(ray.distance))
      : Math.max(0, Number(hit.distance) || 0);
    const origin = ray?.origin?.isVector3
      ? ray.origin.clone()
      : point.clone().addScaledVector(direction, -rayDistance);
    const distance = rayDistance > 0 ? rayDistance : origin.distanceTo(point);
    const normal = ray?.normal?.isVector3
      ? ray.normal.clone().normalize()
      : worldHitNormal(hit, direction);
    // An existing, recorded cue. Nothing new is asked for here.
    this.audio?.play('heist.bullet.impact', { volume: 0.32, position: point });
    const impact = Object.freeze({
      point: immutableVector(point),
      normal: immutableVector(normal),
      origin: immutableVector(origin),
      direction: immutableVector(direction),
      distance,
      object: hit.object,
      weapon: def.id,
      damage: Number.isFinite(Number(contact?.damage)) ? Number(contact.damage) : def.damage,
      penetration: def.penetration,
      material: contact?.material ?? null,
      penetrated: contact?.penetrated === true,
      stopped: contact?.stopped !== false,
      remainingEnergy: Number.isFinite(Number(contact?.remainingEnergy))
        ? Number(contact.remainingEnergy)
        : def.damage,
      remainingPenetration: Number.isFinite(Number(contact?.remainingPenetration))
        ? Number(contact.remainingPenetration)
        : def.penetration,
      projectileIndex: Math.max(0, Math.trunc(Number(contact?.projectileIndex) || 0)),
      projectiles: Math.max(1, Math.trunc(Number(contact?.projectiles) || 1)),
      triggerId: contact?.triggerId ?? null,
      triggerDamageCap: Number.isFinite(Number(contact?.triggerDamageCap))
        ? Math.max(0, Number(contact.triggerDamageCap))
        : def.damage,
      localContacts: ray?.localContacts ?? Object.freeze([]),
    });
    this.onImpact?.(impact);
  }

  /** One spent case out of the ejection port, for the guns that throw brass. */
  _ejectCase(firearm, { onLand = null } = {}) {
    const model = this.model;
    if (!model?.userData?.makeCase || !model.userData.ejectPort) return;
    // A revolver holds its brass until the ejector rod dumps it.
    if (firearm.def.eject === 'cases') return;
    const at = model.localToWorld(_v.copy(model.userData.ejectPort)).clone();
    model.getWorldQuaternion(_q);
    _right.set(1, 0, 0).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    const vel = _right.clone().multiplyScalar(1.7 + Math.random() * 0.9)
      .addScaledVector(_up, 1.5 + Math.random() * 0.6);
    this.ejecta.drop(model.userData.makeCase(), {
      position: at, velocity: vel, spin: 22, radius: 0.008, onLand,
    });
  }

  _onCycle(firearm, event) {
    this.stats.ejections++;
    this._ejectCase(firearm, {
      onLand: () => this._cue('mag.floor', { volume: 0.48 }),
    });
    this._cue('cycle', { volume: 0.68 });
    this._emit({
      type: 'cycle', id: firearm.id, kind: event.kind, rounds: event.rounds,
      ammunition: firearm.rounds, reserve: firearm.reserve,
    });
  }

  /* ---------------------------------------------------------------- */
  /* The reload, in two halves                                          */
  /* ---------------------------------------------------------------- */
  _onEject(firearm, event) {
    const model = this.model;
    this.stats.ejections++;

    /* THE MAGAZINE ITSELF. Not a copy of it, not a puff of dust where it was:
     * the object that has been hanging in the magwell since the gun was built
     * is taken off the gun, handed to the ejecta pool at the world transform
     * it already had, and thrown. A fresh one is seated when the reload
     * finishes. On the revolver there is no magazine, so what leaves is the
     * spent brass, one case per round fired. */
    if (model && firearm.def.eject === 'cases') {
      const at = model.localToWorld(_v.copy(model.userData.ejectPort)).clone();
      const n = Math.max(1, event.rounds | 0);
      for (let i = 0; i < n; i++) {
        const vel = new THREE.Vector3(
          (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2,
        );
        this.ejecta.drop(model.userData.makeCase(), {
          position: at.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.04,
          )),
          velocity: vel,
          spin: 14,
          radius: 0.01,
          onLand: i === 0 ? () => this._cue('mag.floor', { volume: 0.5 }) : null,
        });
      }
      // Six rounds of .45 also make a noise standing in the cylinder.
      if (model.userData.moving?.rounds) {
        for (const r of model.userData.moving.rounds) r.visible = false;
      }
    } else if (model?.userData?.magazine) {
      const mag = model.userData.magazine;
      const at = mag.getWorldPosition(new THREE.Vector3());
      const rot = mag.getWorldQuaternion(new THREE.Quaternion());
      model.getWorldQuaternion(_q);
      _up.set(0, 1, 0).applyQuaternion(_q);
      _dir.set(0, 0, 1).applyQuaternion(_q);
      const vel = _up.clone().multiplyScalar(-0.6)
        .addScaledVector(_dir, 0.35 + Math.random() * 0.3);
      model.userData.magazine = null;
      this.ejecta.drop(mag, {
        position: at,
        quaternion: rot,
        velocity: vel,
        spin: 5,
        radius: 0.05,
        onLand: () => this._cue('mag.floor', { volume: 0.55, position: mag.position.clone() }),
      });
    }

    this._cue('reload.in', { volume: 0.5, delay: 0.12 });
    this._emit({ type: 'eject', id: firearm.id, rounds: event.rounds, kind: event.kind });
  }

  _onLoaded(firearm, event) {
    const model = this.model;
    if (model) {
      const rest = model.userData.magazineRest;
      if (rest && model.userData.makeMagazine) {
        const fresh = model.userData.makeMagazine();
        if (fresh) {
          fresh.position.copy(rest.position);
          fresh.rotation.copy(rest.rotation);
          model.add(fresh);
          model.userData.magazine = fresh;
        }
      }
      if (model.userData.moving?.rounds) {
        for (const r of model.userData.moving.rounds) r.visible = true;
      }
    }
    this._emit({
      type: 'loaded', id: firearm.id, loaded: event.loaded, rounds: firearm.rounds, reserve: firearm.reserve,
    });
  }

  /* ---------------------------------------------------------------- */
  /* Per frame                                                          */
  /* ---------------------------------------------------------------- */
  update(dt, { speed = 0 } = {}) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    this.tracers.update(step);
    this.ejecta.update(step);

    const id = this.current;
    if (id) {
      const f = this.firearm(id);
      for (const event of f.update(step)) {
        if (event.type === 'eject') this._onEject(f, event);
        else if (event.type === 'loaded') this._onLoaded(f, event);
        else if (event.type === 'cycle') this._onCycle(f, event);
      }
      // Automatics keep going while the trigger is held.
      if (f.def.auto && f.triggerHeld) this._pullTrigger();
    }

    // Muzzle flash decay.
    if (this._flashTime > 0) {
      this._flashTime = Math.max(0, this._flashTime - step);
      const k = this._flashTime / 0.055;
      this.flash.material.opacity = k * 0.9;
      this.flashLight.intensity = k * 9;
    } else if (this.flashLight.intensity !== 0) {
      this.flash.material.opacity = 0;
      this.flashLight.intensity = 0;
    }

    // Hold pose: swap dip, recoil kick, walking sway.
    this.swap = Math.max(0, this.swap - step * 3.6);
    this.recoilKick = Math.max(0, this.recoilKick - step * 7);
    this.sway += step * (1.5 + Math.min(4, speed));
    const aimTarget = this.aimed && this.current ? 1 : 0;
    const aimEase = 1 - Math.exp(-step * 12);
    this.aimBlend += (aimTarget - this.aimBlend) * aimEase;
    if (Math.abs(aimTarget - this.aimBlend) < 0.001) this.aimBlend = aimTarget;
    this._applyAimFov();
    const model = this.model;
    if (!model) return;
    const pump = model.userData.moving?.pump;
    if (pump) {
      if (!Number.isFinite(pump.userData.combatRestZ)) {
        pump.userData.combatRestZ = pump.position.z;
      }
      const firearm = this.firearm(id);
      const cycle = Math.max(0, Number(firearm.def.cycleSeconds) || 0);
      const elapsed = cycle > 0 && firearm._cyclePending
        ? 1 - THREE.MathUtils.clamp(firearm._cycleTimer / cycle, 0, 1)
        : 0;
      pump.position.z = pump.userData.combatRestZ + Math.sin(elapsed * Math.PI) * 0.15;
    }
    const hold = model.userData.hold;
    const bob = Math.min(1, speed / 4);
    const reloadDip = this.firearm(id).reloading ? 0.09 : 0;
    const hipX = hold.position[0] + Math.sin(this.sway) * 0.006 * bob;
    const hipY = hold.position[1] + Math.abs(Math.cos(this.sway)) * 0.007 * bob
      - this.swap * 0.18 - reloadDip + this.recoilKick * 0.008;
    const hipZ = hold.position[2] + this.recoilKick * 0.03;
    model.position.set(
      THREE.MathUtils.lerp(hipX, 0, this.aimBlend),
      THREE.MathUtils.lerp(hipY, -0.135 + this.recoilKick * 0.004, this.aimBlend),
      THREE.MathUtils.lerp(hipZ, hold.position[2] + 0.08 + this.recoilKick * 0.018, this.aimBlend),
    );
    const hipRotX = hold.rotation[0] - this.recoilKick * 0.10 + this.swap * 0.32 + reloadDip * 2.4;
    const hipRotY = hold.rotation[1] + Math.sin(this.sway * 0.6) * 0.008 * bob;
    const hipRotZ = hold.rotation[2] - this.swap * 0.38;
    model.rotation.set(
      THREE.MathUtils.lerp(hipRotX, -this.recoilKick * 0.055, this.aimBlend),
      THREE.MathUtils.lerp(hipRotY, 0, this.aimBlend),
      THREE.MathUtils.lerp(hipRotZ, 0, this.aimBlend),
    );
  }

  /* ---------------------------------------------------------------- */
  /* Reporting                                                          */
  /* ---------------------------------------------------------------- */

  /** What the ammunition counter should say, or null with empty hands. */
  hud() {
    if (!this.current) return null;
    return this.firearm(this.current).snapshot();
  }

  /** Stable reticle/HUD feedback independent of Three.js presentation nodes. */
  feedback() {
    const firearm = this.current ? this.firearm(this.current) : null;
    if (!firearm) {
      return {
        aimed: this.aimed,
        aimBlend: this.aimBlend,
        spread: 0,
        bloom: 0,
        suppression: this.suppression,
      };
    }
    const spread = firearm.spreadNow({
      aimed: this.aimed,
      aimStability: this.aimStability,
    });
    const settled = firearm.def.spread * (this.aimed ? 0.48 : 1);
    return {
      aimed: this.aimed,
      aimBlend: this.aimBlend,
      spread,
      bloom: Math.max(0, spread - settled),
      suppression: this.suppression,
    };
  }

  _applyAimFov() {
    if (!this._managingFov
      || this._baseFov === null
      || !Number.isFinite(Number(this.camera?.fov))) return;
    const fov = this._baseFov * (1 - this.aimBlend * 0.16);
    if (Math.abs(Number(this.camera.fov) - fov) > 1e-5) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix?.();
    }
    if (!this.aimed && this.aimBlend === 0) this._managingFov = false;
  }

  _restoreBaseFov() {
    if (!this._managingFov
      || this._baseFov === null
      || !Number.isFinite(Number(this.camera?.fov))) return;
    if (Math.abs(Number(this.camera.fov) - this._baseFov) > 1e-5) {
      this.camera.fov = this._baseFov;
      this.camera.updateProjectionMatrix?.();
    }
    this._managingFov = false;
  }

  _cue(slot, opts) {
    if (!this.current) return;
    const wanted = weaponCue(this.current, slot);
    this.cueLog.push(wanted);
    if (this.cueLog.length > 120) this.cueLog.splice(0, this.cueLog.length - 120);
    /* AND SEPARATELY, WHETHER THAT IS WHAT CAME OUT OF THE SPEAKER.
     *
     * `playWeaponCue` prefers the weapon's own recording and falls through to
     * a verified stand-in when the page has not decoded it -- so a gun that
     * sounds right and a gun whose five recordings were never in this scene's
     * preload scope leave IDENTICAL cue logs. That is not hypothetical: four
     * owner-delivered Enola bomb clips sat on disk, in the manifest and in the
     * index, outside the bank the page loaded, and nothing said so.
     *
     * A SECOND list rather than a marker inside the first, because `cueLog`
     * means "cues this gun asked for" to everything that already reads it, and
     * a log that quietly changes meaning is the same species of problem. Same
     * predicate `playWeaponCue` uses, so the two cannot disagree. */
    if (this.audio?.hasSample?.(wanted) !== true) {
      this.standInCues.push(wanted);
      if (this.standInCues.length > 120) this.standInCues.splice(0, this.standInCues.length - 120);
    }
    playWeaponCue(this.audio, this.current, slot, opts);
  }

  _emit(event) { try { this.onEvent?.(event); } catch { /* a listener must not break a gun */ } }

  dispose() {
    this.stow({ silent: true });
    this.aimed = false;
    this.aimBlend = 0;
    this._restoreBaseFov();
    this.tracers.dispose();
    this.ejecta.dispose();
    this.rig.parent?.remove(this.rig);
  }
}
