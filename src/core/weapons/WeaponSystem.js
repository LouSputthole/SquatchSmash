/**
 * The shared weapon runtime: one of these per scene, six guns behind it.
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
 * WORLD GEOMETRY, and stops there. Any scene that wants a round to hurt
 * somebody supplies its own `onImpact` and decides that itself, with its own
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
   * @param {Function} [o.onImpact]        ({point, normal, object, weapon}) —
   *   the scene's own business. See the note above about actors.
   * @param {Function} [o.onEvent]         ({type, ...}) for HUD/telemetry.
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

    /** Counters a verifier can read without watching pixels. */
    this.stats = { shots: 0, dryClicks: 0, reloads: 0, ejections: 0, impacts: 0 };
    /* Which cue this system ASKED for, most recent last, bounded. A verifier
     * cannot hear a gunshot, but it can prove the gun asked for
     * `weapon.saw.fire` and that a decoded recording exists to answer with —
     * which together is the whole claim "the sound is wired". */
    this.cueLog = [];
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
    this._flashTime = 0;
    if (!silent) playWeaponStow(this.audio, { volume: 0.45 });
    this._emit({ type: 'stow', id });
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Trigger and reload                                                 */
  /* ---------------------------------------------------------------- */

  setTrigger(down) {
    if (!this.current) return;
    this.firearm(this.current).setTrigger(down);
    if (down) this._pullTrigger();
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
    const shot = f.fire();
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

    // Muzzle, in world space, off the model's own userData.
    const muzzleLocal = model?.userData?.muzzle ?? _v.set(0, 0, -0.3);
    const from = model ? model.localToWorld(_v.copy(muzzleLocal)) : this.camera.getWorldPosition(_v);
    const origin = from.clone();

    /* The round goes where the camera is looking, not where the held model
     * is pointing — the model sits low and right of the eye so it does not
     * cover the screen, and a player who aims at a light switch expects to
     * hit the light switch. Spread is applied about that ray. */
    this.camera.getWorldDirection(_dir);
    _right.set(1, 0, 0).applyQuaternion(this.camera.getWorldQuaternion(_q));
    _up.set(0, 1, 0).applyQuaternion(_q);
    const spread = shot.spread ?? def.spread;
    if (spread > 0) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    }

    // Where it stops.
    let end = _v2.copy(origin).addScaledVector(_dir, this.range).clone();
    let hit = null;
    if (this.hitTargets.length) {
      this.raycaster.set(origin, _dir);
      this.raycaster.far = this.range;
      const hits = this.raycaster.intersectObjects(this.hitTargets, true);
      if (hits.length) { hit = hits[0]; end = hit.point.clone(); }
    }

    if (shot.tracer) {
      this.tracers.fire({
        from: origin,
        to: end,
        speed: def.tracer.speed,
        colour: def.tracer.colour,
        width: def.tracer.width,
        onArrive: hit ? () => this._impact(hit, def) : null,
      });
    } else if (hit) {
      this._impact(hit, def);
    }

    // Flash, kick, brass.
    this._flashTime = 0.055;
    this.flash.position.copy(model ? _v.copy(muzzleLocal).applyMatrix4(model.matrix) : _v.set(0, 0, -0.3));
    this.flashLight.position.copy(this.flash.position);
    this.recoilKick = Math.min(1.4, this.recoilKick + 0.55 + def.recoil * 3);
    this._ejectCase(firearm);

    this._cue('fire', { volume: 0.75 });
    this._emit({
      type: 'fire', id: firearm.id, rounds: firearm.rounds, reserve: firearm.reserve, tracer: shot.tracer,
    });
  }

  _impact(hit, def) {
    this.stats.impacts++;
    // An existing, recorded cue. Nothing new is asked for here.
    this.audio?.play('heist.bullet.impact', { volume: 0.32, position: hit.point });
    this.onImpact?.({
      point: hit.point.clone(), normal: hit.face?.normal ?? null, object: hit.object, weapon: def.id,
    });
  }

  /** One spent case out of the ejection port, for the guns that throw brass. */
  _ejectCase(firearm) {
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
      position: at, velocity: vel, spin: 22, radius: 0.008,
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
    const model = this.model;
    if (!model) return;
    const hold = model.userData.hold;
    const bob = Math.min(1, speed / 4);
    const reloadDip = this.firearm(id).reloading ? 0.09 : 0;
    model.position.set(
      hold.position[0] + Math.sin(this.sway) * 0.006 * bob,
      hold.position[1] + Math.abs(Math.cos(this.sway)) * 0.007 * bob
        - this.swap * 0.18 - reloadDip + this.recoilKick * 0.008,
      hold.position[2] + this.recoilKick * 0.03,
    );
    model.rotation.set(
      hold.rotation[0] - this.recoilKick * 0.10 + this.swap * 0.32 + reloadDip * 2.4,
      hold.rotation[1] + Math.sin(this.sway * 0.6) * 0.008 * bob,
      hold.rotation[2] - this.swap * 0.38,
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

  _cue(slot, opts) {
    if (!this.current) return;
    this.cueLog.push(weaponCue(this.current, slot));
    if (this.cueLog.length > 120) this.cueLog.splice(0, this.cueLog.length - 120);
    playWeaponCue(this.audio, this.current, slot, opts);
  }

  _emit(event) { try { this.onEvent?.(event); } catch { /* a listener must not break a gun */ } }

  dispose() {
    this.stow({ silent: true });
    this.tracers.dispose();
    this.ejecta.dispose();
    this.rig.parent?.remove(this.rig);
  }
}
