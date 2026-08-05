/**
 * The player's side of a firefight, assembled.
 *
 * PlayerCombat binds the pieces that already exist — the shared `Player`
 * controller, the shared `WeaponSystem`, a `Vitals`, the `ShotResolver`,
 * the effects layer — into one object a scene updates. It owns:
 *
 *   - stance-true accuracy: the spread the round uses IS the spread the
 *     crosshair shows, from the same stanceSpreadScale call
 *   - camera recoil the player fights and learns (RecoilController)
 *   - aim-down-sights FOV and the aim state
 *   - fire gating: no shots while sprinting, dead, frozen, or interacting
 *   - incoming damage: directional record, camera flinch, feedback state
 *     for the HUD, configurable regen, checkpoint restore
 *
 * It never draws anything. `feedback()` is the one readout a HUD needs.
 */
import { Vitals } from './vitals.js';
import { RecoilController, stanceSpreadScale } from './recoil.js';
import { COMBAT_TUNING } from './config.js';

export class PlayerCombat {
  /**
   * @param {object} o
   * @param {object} o.player     core Player
   * @param {object} o.camera     THREE camera (fov handled here)
   * @param {object} o.weapons    WeaponSystem
   * @param {object} o.resolver   ShotResolver
   * @param {()=>Array} o.targets combined hitbox+world targets for player rays
   * @param {object} [o.effects]  ImpactEffects
   * @param {object} [o.vitals]   supply to share; default built from tuning
   * @param {object} [o.difficulty]
   * @param {object} [o.tuning]   COMBAT_TUNING.player overrides
   * @param {Function} [o.onKill] ({combatant, headshot})
   * @param {Function} [o.onHitConfirm] ({fatal, headshot, helmetSaved})
   * @param {()=>Array} [o.combatants] everyone who can be suppressed by my fire
   */
  constructor({
    player, camera, weapons, resolver, targets,
    effects = null, vitals = null, difficulty = null, tuning = {},
    onKill = null, onHitConfirm = null, combatants = null,
  }) {
    this.player = player;
    this.camera = camera;
    this.weapons = weapons;
    this.resolver = resolver;
    this.targets = targets;
    this.effects = effects;
    this.difficulty = difficulty;
    this.onKill = onKill;
    this.onHitConfirm = onHitConfirm;
    this.combatants = combatants;

    const t = { ...COMBAT_TUNING.player, ...tuning };
    this.tuning = t;
    this.vitals = vitals ?? new Vitals({
      maxHealth: t.maxHealth * (difficulty?.playerHealthScale ?? 1),
      regen: { mode: t.regenMode, ceiling: t.regenCeiling, delay: t.regenDelay, rate: t.regenRate },
      spawnInvuln: t.spawnInvulnSeconds,
    });
    this.recoil = new RecoilController({});
    this.baseFov = camera.fov;
    this.infiniteAmmo = false; // debug only
    this._pendingIndicators = []; // {bearing, age} for the HUD
    this._hitFlash = 0;
    this._sprintHeld = false;

    /* The shot pipeline: WeaponSystem asks, the resolver answers, effects
     * dress every surface, kills come back to the mission. */
    weapons.getSpreadScale = () => this._spreadScale();
    weapons.resolveShot = ({ origin, dir, def }) => this._resolve(origin, dir, def);
    const prevOnEvent = weapons.onEvent;
    weapons.onEvent = (e) => {
      prevOnEvent?.(e);
      if (e.type === 'fire') this._onFired();
    };
  }

  /* ---------------- input ------------------------------------------- */

  get blocked() {
    return this.vitals.dead
      || this.player.mode !== 'walk'
      || (this.player.sprinting && !this._weaponAllowsSprintFire());
  }

  _weaponAllowsSprintFire() { return false; }

  setTrigger(down) {
    if (down && this.blocked) { this.weapons.setTrigger(false); return; }
    /* A shell-loading shotgun lets the trigger interrupt the top-up. */
    if (down && this.weapons.current) {
      const f = this.weapons.firearm(this.weapons.current);
      if (f.def.loadStyle === 'shells' && f.reloading && f.rounds > 0) f.cancelReload();
    }
    this.weapons.setTrigger(down);
  }

  triggerPress() {
    if (this.blocked) return null;
    return this.weapons.triggerPress();
  }

  reload() {
    if (this.vitals.dead) return false;
    return this.weapons.reload();
  }

  setAim(down) {
    if (this.vitals.dead) down = false;
    this.weapons.setAim(down);
  }

  /* ---------------- the shot ----------------------------------------- */

  _spreadScale() {
    const def = this.weapons.current
      ? this.weapons.firearm(this.weapons.current).def : null;
    return stanceSpreadScale({
      weapon: def,
      moving: this.player.velocity.lengthSq() > 0.3,
      sprinting: this.player.sprinting,
      crouched: this.player.crouching,
      airborne: !this.player.grounded,
      injury: 1 - this.vitals.fraction,
      skill: 1,
    });
  }

  _resolve(origin, dir, def) {
    const result = this.resolver.resolve({
      origin, dir,
      weapon: def,
      attacker: {
        id: 'player', faction: 'crew', isPlayer: true, combatant: null,
        x: origin.x, z: origin.z,
      },
      targets: this.targets(),
      scale: 1,
    });
    for (const s of result.surfaces) {
      if (s.kind === 'world') {
        this.effects?.worldImpact(s);
      } else if (s.kind === 'body') {
        const part = s.combatant?.npc?.parts?.body ?? null;
        this.effects?.bodyImpact(s, part);
        s.combatant?.noteShotResult?.(s.record);
        if (s.record?.applied) {
          this.onHitConfirm?.({
            fatal: s.record.fatal,
            headshot: s.record.headshotDamage === true,
            helmetSaved: s.record.helmetSaved === true,
            friendly: s.friendly === true,
          });
          if (s.record.fatal && s.record.headshotDamage) this.effects?.headshotConfirm();
          if (s.record.fatal && !s.record.protectedCore) {
            this.onKill?.({ combatant: s.combatant, headshot: s.record.headshotDamage === true });
          }
        }
      }
    }
    // Everyone near the flight path flinches, learns, and ducks.
    if (this.combatants) {
      this.resolver.notifyNearMisses({
        origin, end: result.end,
        combatants: this.combatants(),
        weapon: def,
        radius: COMBAT_TUNING.suppressionRadius,
      });
    }
    return { end: result.end };
  }

  _onFired() {
    const id = this.weapons.current;
    if (!id) return;
    const f = this.weapons.firearm(id);
    if (this.infiniteAmmo) f.reserve = Math.max(f.reserve, f.capacity * 4);
    const kick = this.recoil.kick(f.def.combat?.recoil);
    /* Real climb: the aim itself moves. ADS steadies it a little. */
    const adsSteady = 1 - this.weapons.aim * 0.25;
    const crouchSteady = this.player.crouching ? 0.8 : 1;
    this.player.pitch += kick.pitch * adsSteady * crouchSteady;
    this.player.yaw += kick.yaw * adsSteady * crouchSteady;
  }

  /* ---------------- damage in ---------------------------------------- */

  /**
   * The resolver hands the player's vitals record here (the scene wires the
   * player's own hitbox — or NPC rays call takeHit directly with a record).
   */
  takeHit(record) {
    if (!record?.applied) return;
    /* Feedback, clamped by config so an ordinary hit never blinds. */
    const f = COMBAT_TUNING.feedback;
    this._hitFlash = Math.min(f.maxHitVignette, this._hitFlash + 0.22
      + Math.min(0.2, (record.damage ?? 0) / 120));
    if (record.direction) {
      const bearing = Math.atan2(record.direction.x, record.direction.z);
      this._pendingIndicators.push({ bearing, age: 0 });
      if (this._pendingIndicators.length > 4) this._pendingIndicators.shift();
    }
    // The camera takes the hit too — a flinch, not a blackout.
    const impulse = Math.min(f.maxCameraImpulse, (record.damage ?? 10) / 900);
    this.player.pitch += (Math.random() - 0.4) * impulse * 2;
    this.player.yaw += (Math.random() - 0.5) * impulse * 2;
  }

  /* ---------------- per frame ----------------------------------------- */

  update(dt) {
    this.vitals.update(dt);

    // Recoil recovery pulls the aim back toward where the player left it.
    const def = this.weapons.current
      ? this.weapons.firearm(this.weapons.current).def : null;
    const rec = this.recoil.update(dt, def?.combat?.recoil);
    this.player.pitch -= rec.pitch;
    this.player.yaw -= rec.yaw;

    // Sprinting is a decision against shooting.
    if (this.player.sprinting && this.weapons.current) {
      this.weapons.setTrigger(false);
      this.weapons.setAim(false);
    }

    // ADS field of view.
    const zoom = def?.combat?.ads?.zoom ?? 1.3;
    const targetFov = this.baseFov / (1 + (zoom - 1) * this.weapons.aim);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }

    for (let i = this._pendingIndicators.length - 1; i >= 0; i--) {
      const ind = this._pendingIndicators[i];
      ind.age += dt;
      if (ind.age > 2.2) this._pendingIndicators.splice(i, 1);
    }
    this._hitFlash = Math.max(0, this._hitFlash - dt * 0.9);
  }

  /** Everything a HUD needs, one call. */
  feedback() {
    const f = COMBAT_TUNING.feedback;
    return {
      health: this.vitals.health,
      maxHealth: this.vitals.maxHealth,
      lowHealth: this.vitals.lowHealth,
      dead: this.vitals.dead,
      vignette: Math.min(f.maxHitVignette,
        this._hitFlash + (this.vitals.lowHealth ? 0.18 : 0)),
      indicators: this._pendingIndicators.map((i) => ({
        bearing: i.bearing - this.player.yaw, age: i.age,
      })),
      aim: this.weapons.aim,
      obstructed: this.weapons.obstructed,
      spreadScale: this._spreadScale(),
      hud: this.weapons.hud(),
    };
  }

  /* ---------------- checkpoints --------------------------------------- */

  capture() {
    const weapons = {};
    for (const [id, f] of this.weapons.firearms) {
      weapons[id] = { rounds: f.rounds, reserve: f.reserve };
    }
    return {
      vitals: this.vitals.snapshot(),
      equipped: this.weapons.current,
      weapons,
    };
  }

  restore(snap) {
    if (!snap) return;
    this.vitals.restore(snap.vitals, { invuln: this.tuning.spawnInvulnSeconds });
    const floor = this.difficulty?.checkpointHealFloor ?? 0;
    if (this.vitals.health < this.vitals.maxHealth * floor) {
      this.vitals.health = this.vitals.maxHealth * floor;
      this.vitals.dead = false;
    }
    for (const [id, ammo] of Object.entries(snap.weapons ?? {})) {
      const f = this.weapons.firearm(id);
      f.rounds = Math.max(0, Math.min(f.capacity, ammo.rounds ?? f.capacity));
      f.reserve = Math.max(0, ammo.reserve ?? f.reserve);
      f.cancelReload();
    }
    if (snap.equipped && snap.equipped !== this.weapons.current) {
      this.weapons.equip(snap.equipped);
    }
    this.recoil.reset();
    this._pendingIndicators.length = 0;
    this._hitFlash = 0;
  }

}
