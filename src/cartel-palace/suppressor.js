/**
 * THE CAN.
 *
 * Owner, 2026-08-20 playtest: *"the player's gun in this mission should have
 * a suppressor: suppressor model on the barrel, suppressed muzzle flash,
 * dedicated suppressed firing audio, mechanical action still audible,
 * impacts still clear"* — and, in the same breath, *"do NOT make it a tiny
 * Hollywood 'pfft'. It keeps a sharp mechanical crack, just substantially
 * muted versus unsuppressed."*
 *
 * That last sentence is the whole design brief, and it is why this is four
 * separate things rather than one volume slider:
 *
 *   MODEL      A real can on the barrel — tube, mount collar, end cap,
 *              machined grooves — and the weapon's `userData.muzzle` moved
 *              to its END, so the flash, the shot origin and the ejected
 *              tracer all start where the gas actually leaves. Every other
 *              system in the game reads that one Vector3, so moving it is
 *              the whole of "the gun is longer now".
 *   FLASH      The shared WeaponSystem writes its flash opacity and light
 *              intensity from a fixed curve every frame. This scales what it
 *              wrote, immediately after, rather than reaching into core: a
 *              small, dull, red-shifted bloom at the can's mouth instead of
 *              a yellow star.
 *   REPORT     A dedicated `weapon.suppressed.<id>.fire` cue, played in place
 *              of the unsuppressed one — and if that take has not landed yet,
 *              the unsuppressed recording muffled and dropped, never
 *              silenced. Substantially quieter, still a crack.
 *   ACTION     `weapon.suppressed.action` is layered ON TOP at close to full
 *              level: the bolt, the slide, the brass. A suppressed gun is
 *              mostly mechanism, and this is the half of it the can cannot
 *              touch.
 *
 * Impacts are deliberately untouched: they run through the scene's own
 * ballistic and combat-audio paths at full presence, which is what makes a
 * quiet gun read as HITTING things.
 *
 * The shared weapon audio layer owns the named `suppressed` profile; this
 * mission's adapter merely selects that profile when a fitted gun is in hand.
 * Model decoration, flash treatment and guard hearing remain Palace concerns.
 */
import * as THREE from 'three';

import { WEAPON_IDS } from '../core/weapons/catalog.js';
import {
  WEAPON_AUDIO_PROFILE_IDS, WEAPON_AUDIO_PROFILES, weaponProfileCue,
} from '../core/weapons/audio.js';

/**
 * Which of the final-raid guns can take a can.
 *
 * A revolver leaks at the cylinder gap, a pump gun's shot column is not
 * something you thread a tube onto, and nobody suppresses a .50. Those three
 * fire loud, and the mission's stealth budget is the player's problem.
 */
export const SUPPRESSED_WEAPON_IDS = Object.freeze([
  WEAPON_IDS.PISTOL9,
  WEAPON_IDS.CARBINE,
  WEAPON_IDS.AK47,
]);

/**
 * How far a shot carries to a guard's ear, in metres.
 *
 * `unsuppressed` is Infinity because that is what `PalaceSecurity` has always
 * done with a gunshot and what an unsuppressed rifle in a walled stucco
 * compound genuinely does. `suppressed` is 9 m — inside a room, not across
 * one — and `PalaceSecurity.noteGunshot` still hands the position to anyone
 * within 2.1x that as something to walk over and look at. A can buys the
 * player a room, not the mission.
 */
export const GUNSHOT_HEARING = Object.freeze({
  suppressed: 9,
  unsuppressed: Infinity,
});

/** The recording a suppressed shot asks for. */
export const suppressedFireCue = (id) => weaponProfileCue(
  id,
  'fire',
  WEAPON_AUDIO_PROFILE_IDS.SUPPRESSED,
);

/** The mechanical layer every suppressed shot puts on top of the report. */
export const SUPPRESSED_ACTION_CUE = WEAPON_AUDIO_PROFILES.suppressed.actionCue;

/* Per-weapon can dimensions, in metres. A 9 mm pistol can is short and fat;
 * a rifle can is longer and slimmer. Both are sized off the real barrel. */
const CANS = Object.freeze({
  [WEAPON_IDS.PISTOL9]: Object.freeze({ radius: 0.021, length: 0.17, collar: 0.026 }),
  [WEAPON_IDS.CARBINE]: Object.freeze({ radius: 0.023, length: 0.2, collar: 0.028 }),
  [WEAPON_IDS.AK47]: Object.freeze({ radius: 0.026, length: 0.22, collar: 0.031 }),
});

const CAN_STEEL = new THREE.MeshStandardMaterial({
  color: 0x1b1e20, roughness: 0.52, metalness: 0.68,
});
const CAN_COLLAR = new THREE.MeshStandardMaterial({
  color: 0x2a2e31, roughness: 0.38, metalness: 0.82,
});

/**
 * Bolt a can onto one built weapon model and move its muzzle to the end.
 *
 * Idempotent per model: the WeaponSystem builds each model once and keeps
 * it, and `equip` can fire many times over a mission.
 *
 * @returns {boolean} whether this call fitted a suppressor.
 */
export function fitSuppressor(model, id) {
  if (!model || model.userData?.suppressed) return false;
  const can = CANS[id];
  const muzzle = model.userData?.muzzle;
  if (!can || !muzzle?.isVector3) return false;

  const group = new THREE.Group();
  group.name = `${id}-suppressor`;
  /* The catalog's bore convention is local -Z (models.js, "POSITIVE z — the
   * butt falls back"), so the can grows forward along -Z from the muzzle. */
  group.position.set(muzzle.x, muzzle.y, muzzle.z);

  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(can.radius, can.radius, can.length, 14),
    CAN_STEEL,
  );
  tube.name = `${id}-suppressor-tube`;
  tube.rotation.x = Math.PI / 2;
  tube.position.z = -can.length / 2;
  tube.castShadow = true;
  group.add(tube);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(can.collar, can.collar, 0.022, 14),
    CAN_COLLAR,
  );
  collar.name = `${id}-suppressor-mount`;
  collar.rotation.x = Math.PI / 2;
  collar.position.z = -0.012;
  group.add(collar);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(can.radius * 0.98, can.radius * 0.86, 0.016, 14),
    CAN_COLLAR,
  );
  cap.name = `${id}-suppressor-cap`;
  cap.rotation.x = Math.PI / 2;
  cap.position.z = -can.length + 0.008;
  group.add(cap);

  // Machined grooves: what stops a black cylinder reading as a black cylinder.
  for (let index = 0; index < 5; index++) {
    const groove = new THREE.Mesh(
      new THREE.CylinderGeometry(can.radius * 1.06, can.radius * 1.06, 0.006, 14),
      CAN_COLLAR,
    );
    groove.name = `${id}-suppressor-groove`;
    groove.rotation.x = Math.PI / 2;
    groove.position.z = -0.045 - index * (can.length - 0.08) / 5;
    group.add(groove);
  }

  model.add(group);
  /* THE MUZZLE MOVES. Flash placement, shot origin, tracer start and the
   * NPC bore sampler all read this one vector; a can whose end is 17 cm
   * ahead of it would spit fire out of its own middle. */
  model.userData.muzzleUnsuppressed = muzzle.clone();
  model.userData.muzzle = new THREE.Vector3(muzzle.x, muzzle.y, muzzle.z - can.length + 0.01);
  model.userData.suppressed = true;
  model.userData.suppressor = group;
  return true;
}

/**
 * The mission's suppressor: fits cans, damps the flash, and routes the
 * report.
 *
 * @param {object} options
 * @param {object} options.audio the scene's AudioEngine
 * @param {(id: string) => boolean} [options.canSuppress] override for which
 *   weapon ids take a can — the default is SUPPRESSED_WEAPON_IDS.
 */
export class PalaceSuppressor {
  constructor({ audio, canSuppress = null } = {}) {
    this.audio = audio ?? null;
    this.canSuppress = typeof canSuppress === 'function'
      ? canSuppress
      : (id) => SUPPRESSED_WEAPON_IDS.includes(id);
    /** The weapon currently in the player's hands, for the profile adapter. */
    this.equipped = null;
    this.stats = { fitted: [], suppressedShots: 0, loudShots: 0 };
  }

  /** True when the gun in the player's hands is wearing a can. */
  get active() { return Boolean(this.equipped) && this.canSuppress(this.equipped); }

  /** How far the CURRENT weapon's report carries, for PalaceSecurity. */
  get hearingRadius() {
    return this.active ? GUNSHOT_HEARING.suppressed : GUNSHOT_HEARING.unsuppressed;
  }

  /** How far a NAMED weapon's report carries. */
  hearingRadiusFor(id) {
    return this.canSuppress(id) ? GUNSHOT_HEARING.suppressed : GUNSHOT_HEARING.unsuppressed;
  }

  /**
   * Fit every gun the player is carrying, and remember what is in hand.
   *
   * Call this on boot and on every `equip` event: `WeaponSystem.modelFor`
   * builds models lazily, so a gun swapped to for the first time twenty
   * minutes in is only buildable — and therefore only fittable — right then.
   */
  sync(weapons) {
    if (!weapons) return this;
    this.equipped = weapons.equipped ?? null;
    for (const [id, model] of weapons.models ?? []) {
      if (!this.canSuppress(id)) continue;
      if (fitSuppressor(model, id)) this.stats.fitted.push(id);
    }
    /* One dull, small flash card for the whole rig. WeaponSystem creates the
     * card and its light once in its constructor and reuses them for every
     * weapon, so this is set once and stays set. */
    if (weapons.flash?.material) {
      weapons.flash.material.color.setHex(0xff9a4e);
      weapons.flash.scale.setScalar(0.42);
    }
    if (weapons.flashLight) weapons.flashLight.color.setHex(0xff8a44);
    return this;
  }

  /**
   * Damp the flash the shared system just wrote.
   *
   * `WeaponSystem.update` assigns `flash.material.opacity` and
   * `flashLight.intensity` from its own decay curve every frame. Rather than
   * fork that, this runs immediately afterwards and scales what it wrote —
   * so a suppressed shot still flashes, at roughly a quarter of the light
   * and a third of the card, and an unsuppressed shot is untouched.
   */
  afterWeaponUpdate(weapons) {
    if (!weapons || !this.active) return;
    if (weapons.flash?.material) weapons.flash.material.opacity *= 0.34;
    if (weapons.flashLight) weapons.flashLight.intensity *= 0.24;
  }

  /**
   * The audio adapter to hand `WeaponSystem`.
   *
   * This is an explicit, data-driven opt-in: the shared `playWeaponCue`
   * resolves `weaponAudioProfile({ id, slot })`, and this adapter answers
   * `suppressed` only for a live fire event from the fitted gun. It delegates
   * sample lookup and playback unchanged, so the shared layer—not a fragile
   * name-rewriting wrapper—owns dedicated takes, fallback muffling and the
   * mechanical action layer.
   *
   * `suppress` remains the Palace's contact filter: its Adapter presents the
   * truthful material impact instead of the WeaponSystem's legacy generic
   * contact cue.
   */
  playback({ suppress = () => false } = {}) {
    const audio = this.audio;
    return {
      weaponAudioProfile: ({ id, slot } = {}) => (
        slot === 'fire' && id === this.equipped && this.canSuppress(id)
          ? WEAPON_AUDIO_PROFILE_IDS.SUPPRESSED
          : WEAPON_AUDIO_PROFILE_IDS.STANDARD
      ),
      onWeaponAudioProfile: ({ slot, profile } = {}) => {
        if (slot !== 'fire') return;
        if (profile === WEAPON_AUDIO_PROFILE_IDS.SUPPRESSED) this.stats.suppressedShots++;
        else this.stats.loudShots++;
      },
      hasSample: (name) => audio?.hasSample?.(name) ?? false,
      play: (name, options) => {
        if (suppress(name)) return null;
        return audio?.play(name, options);
      },
    };
  }

  /** JSON-safe view for tests and the verifier. */
  report() {
    return Object.freeze({
      equipped: this.equipped,
      active: this.active,
      hearingRadius: this.hearingRadius,
      fitted: [...new Set(this.stats.fitted)].sort(),
      suppressedShots: this.stats.suppressedShots,
    });
  }
}
