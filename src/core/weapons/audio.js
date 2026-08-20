/**
 * The weapon system's sound: thirty delivered canonical cues, with proven
 * legacy recordings retained only as a partial-bank safety net.
 *
 * THIS FILE ADDS NOTHING TO `assets/sfx/manifest.json`. Cues are generated
 * centrally; what a scene can do is write down exactly what it needs and play
 * something real in the meantime. That contract already exists in this
 * project twice — `src/bing/license-to-grill-runtime.js` for the store room
 * and `src/core/signature-music.js` for the two records — and this is the same
 * shape:
 *
 *   - `WEAPON_SFX` names the canonical delivered bank. Nothing here plays one
 *     unless `audio.hasSample()` says that recording really decoded.
 *   - every stand-in is written out as its own literal play call, by name.
 *     `tools/check.mjs` scans for exactly that shape and fails the build for a
 *     cue that is not in the manifest, so each stand-in below is verified to
 *     be a real recording rather than quietly falling through to the
 *     synthesiser. A stand-in with no file is not a stand-in.
 *
 * WHY EACH WEAPON GETS ITS OWN EVENTS. A SAW and a .45 sharing one `gun.shot`
 * is the thing that makes a rack of seven guns read as one gun with seven
 * models on it. The common five slots are the events a player can actually hear the
 * difference in: the shot, the magazine coming out, the magazine going in,
 * the dry click, and the discarded magazine hitting the floor. The pump adds
 * its mechanically distinct cycle.
 */
import { WEAPON_ORDER, weaponCue, weaponCueSlots, weaponMix } from './catalog.js';

/** Every cue this system wants recorded, keyed `weapon.<id>.<slot>`. */
export const WEAPON_SFX = Object.freeze(Object.fromEntries(
  WEAPON_ORDER.flatMap((id) => weaponCueSlots(id).map((slot) => [`${id}.${slot}`, weaponCue(id, slot)])),
));

/**
 * Proven fallbacks for an old, partial, or failed-to-decode audio bank.
 *
 * Listed here as data purely so a scene can PRELOAD them (see
 * `weaponStandInCueNames`) and so a test can assert every wanted cue has one.
 * The actual playing is the literal switch below — this table is never used to
 * choose a cue at run time, because a name chosen from a table is a name
 * `check.mjs` cannot see.
 */
export const WEAPON_SFX_STANDINS = Object.freeze({
  'revolver.fire': 'gun.shot',
  'revolver.reload.out': 'gun.reload',
  'revolver.reload.in': 'heist.weapon.check',
  'revolver.empty': 'gun.dry',
  'revolver.mag.floor': 'ice.drop',

  'shotgun.fire': 'gun.shot',
  'shotgun.reload.out': 'heist.weapon.reload',
  'shotgun.reload.in': 'heist.weapon.check',
  'shotgun.empty': 'gun.dry',
  'shotgun.mag.floor': 'ice.drop',
  'shotgun.cycle': 'heist.weapon.check',

  'pistol9.fire': 'boat.gunshot.deck',
  'pistol9.reload.out': 'heist.swap.weapons',
  'pistol9.reload.in': 'heist.weapon.check',
  'pistol9.empty': 'heist.weapon.empty',
  'pistol9.mag.floor': 'heist.guard.weapon.drop',

  'carbine.fire': 'heist.weapon.carbine.indoor',
  'carbine.reload.out': 'heist.weapon.reload',
  'carbine.reload.in': 'heist.weapon.check',
  'carbine.empty': 'heist.weapon.empty',
  'carbine.mag.floor': 'heist.guard.weapon.drop',

  'ak47.fire': 'heist.weapon.carbine',
  'ak47.reload.out': 'heist.weapon.reload',
  'ak47.reload.in': 'heist.weapon.down',
  'ak47.empty': 'heist.weapon.empty',
  'ak47.mag.floor': 'footstep.metal',

  'saw.fire': 'heist.police.gunshot',
  'saw.reload.out': 'heist.swap.weapons',
  'saw.reload.in': 'heist.weapon.down',
  'saw.empty': 'heist.weapon.empty',
  'saw.mag.floor': 'heist.cash.drop',

  'barrett.fire': 'gun.shot',
  'barrett.reload.out': 'heist.weapon.reload',
  'barrett.reload.in': 'heist.weapon.down',
  'barrett.empty': 'gun.dry',
  'barrett.mag.floor': 'heist.guard.weapon.drop',
});

/** Cues a scene must preload for the stand-ins to be audible. */
export function weaponStandInCueNames() {
  return [...new Set(Object.values(WEAPON_SFX_STANDINS))];
}

/** Every canonical weapon recording, for a scene's preload list. */
export function weaponWantedCueNames() {
  return Object.values(WEAPON_SFX);
}

/** Both lists — what a scene hands to `audio.loadManifest({ names })`. */
export function weaponCueNames() {
  return [...weaponWantedCueNames(), ...weaponStandInCueNames()];
}

/**
 * Default distance falloff for a gunshot placed in the world.
 *
 * `AudioEngine.play` defaults to ref 1.4 / maxDist 18, which are the numbers
 * for a domestic prop — a fridge door, a bottle on a counter. A rifle heard
 * across a courtyard on those numbers is inaudible past about four rooms, and
 * that is exactly what happened: the mansion siege discovered it and tuned its
 * own calls to ref 3 / maxDist 55-60, while the cartel palace passed a
 * position and nothing else and its guards' guns went silent at 18 metres in
 * an open compound.
 *
 * So the sensible falloff for a gun belongs to the gun layer, not to each
 * scene that remembers. These are the siege's proven values. A caller that
 * passes its own ref or maxDist still wins — nothing here overrides a scene
 * that has actually thought about it.
 */
export const WEAPON_POSITIONAL_DEFAULTS = Object.freeze({ ref: 3, maxDist: 55 });

/**
 * The options one weapon cue is actually played with.
 *
 * Two things happen here and nowhere else, so that every call site — the
 * player's own gun, the palace's guards, the siege's attackers and the family
 * — gets both without asking:
 *
 *   1. the catalog's per-weapon mix SCALES the caller's volume. Multiplying
 *      rather than replacing is what keeps every existing call working: a
 *      scene still says how present an event is, the catalog says which gun.
 *   2. a positional call with no falloff of its own gets a gunshot's falloff
 *      instead of a prop's.
 *
 * Exported because it is the whole contract, and a contract a test can read
 * is a contract that stays true.
 */
export function weaponCueOptions(id, slot, opts = {}) {
  const out = { ...opts, volume: (opts.volume ?? 1) * weaponMix(id, slot) };
  if (opts.position) {
    if (opts.ref === undefined) out.ref = WEAPON_POSITIONAL_DEFAULTS.ref;
    if (opts.maxDist === undefined) out.maxDist = WEAPON_POSITIONAL_DEFAULTS.maxDist;
  }
  return out;
}

/**
 * Play one weapon cue: the real recording if it has landed, else the stand-in.
 *
 * @param {object} audio  an `AudioEngine`
 * @param {string} id     catalog id, e.g. 'saw'
 * @param {string} slot   one of WEAPON_CUE_SLOTS
 * @param {object} [opts] passed to `AudioEngine.play` after `weaponCueOptions`
 *                        has scaled `volume` by the catalog mix and filled in
 *                        a gunshot's distance falloff for a positional call
 */
export function playWeaponCue(audio, id, slot, opts = {}) {
  if (!audio) return false;
  const wanted = weaponCue(id, slot);
  /* Every `audio.play` below is handed THIS, not the caller's raw options.
   * The literal cue names stay literal so `tools/check.mjs` can still read
   * them out of the source; only the options are computed. */
  opts = weaponCueOptions(id, slot, opts);
  if (audio.hasSample?.(wanted)) { audio.play(wanted, opts); return true; }

  switch (`${id}.${slot}`) {
    /* ---- the .45. `gun.shot` IS a revolver fired indoors and `gun.dry` IS
     * its hammer on a spent chamber, so two of these five are already the
     * right event; the other three are the nearest handling noises. ---- */
    case 'revolver.fire': audio.play('gun.shot', opts); return true;
    case 'revolver.reload.out': audio.play('gun.reload', opts); return true;
    case 'revolver.reload.in': audio.play('heist.weapon.check', opts); return true;
    case 'revolver.empty': audio.play('gun.dry', opts); return true;
    // Brass on concrete, standing in as a bright small metallic clink.
    case 'revolver.mag.floor': audio.play('ice.drop', { ...opts, rate: 1.5 }); return true;

    /* ---- the 12-gauge pump: one action sound in addition to the common five ---- */
    case 'shotgun.fire': audio.play('gun.shot', { ...opts, rate: 0.76 }); return true;
    case 'shotgun.reload.out': audio.play('heist.weapon.reload', { ...opts, rate: 0.9 }); return true;
    case 'shotgun.reload.in': audio.play('heist.weapon.check', { ...opts, rate: 0.82 }); return true;
    case 'shotgun.empty': audio.play('gun.dry', { ...opts, rate: 0.85 }); return true;
    case 'shotgun.mag.floor': audio.play('ice.drop', { ...opts, rate: 0.75 }); return true;
    case 'shotgun.cycle': audio.play('heist.weapon.check', { ...opts, rate: 0.72 }); return true;

    /* ---- the 9mm ---- */
    case 'pistol9.fire': audio.play('boat.gunshot.deck', opts); return true;
    case 'pistol9.reload.out': audio.play('heist.swap.weapons', opts); return true;
    case 'pistol9.reload.in': audio.play('heist.weapon.check', opts); return true;
    case 'pistol9.empty': audio.play('heist.weapon.empty', opts); return true;
    // A steel pistol magazine on a hard floor is exactly this recording.
    case 'pistol9.mag.floor': audio.play('heist.guard.weapon.drop', opts); return true;

    /* ---- the carbine: THE TAKE recorded all five of these for itself ---- */
    case 'carbine.fire': audio.play('heist.weapon.carbine.indoor', opts); return true;
    case 'carbine.reload.out': audio.play('heist.weapon.reload', opts); return true;
    case 'carbine.reload.in': audio.play('heist.weapon.check', opts); return true;
    case 'carbine.empty': audio.play('heist.weapon.empty', opts); return true;
    case 'carbine.mag.floor': audio.play('heist.guard.weapon.drop', opts); return true;

    /* ---- the AK: same family, pitched down, because a 7.62 is not a 5.56 --- */
    case 'ak47.fire': audio.play('heist.weapon.carbine', { ...opts, rate: 0.86 }); return true;
    case 'ak47.reload.out': audio.play('heist.weapon.reload', { ...opts, rate: 0.9 }); return true;
    case 'ak47.reload.in': audio.play('heist.weapon.down', opts); return true;
    case 'ak47.empty': audio.play('heist.weapon.empty', { ...opts, rate: 0.88 }); return true;
    // Stamped steel on concrete: a boot on fire-escape grating has the ring.
    case 'ak47.mag.floor': audio.play('footstep.metal', { ...opts, rate: 0.8 }); return true;

    /* ---- the SAW ---- */
    case 'saw.fire': audio.play('heist.police.gunshot', { ...opts, rate: 1.08 }); return true;
    case 'saw.reload.out': audio.play('heist.swap.weapons', opts); return true;
    case 'saw.reload.in': audio.play('heist.weapon.down', opts); return true;
    case 'saw.empty': audio.play('heist.weapon.empty', { ...opts, rate: 0.8 }); return true;
    // A loaded plastic box hitting a floor: a dense padded thump.
    case 'saw.mag.floor': audio.play('heist.cash.drop', opts); return true;

    /* ---- the Barrett. The heaviest thing in the building, played down a
     * major third so it is not the revolver again. ---- */
    case 'barrett.fire': audio.play('gun.shot', { ...opts, rate: 0.7 }); return true;
    case 'barrett.reload.out': audio.play('heist.weapon.reload', { ...opts, rate: 0.78 }); return true;
    case 'barrett.reload.in': audio.play('heist.weapon.down', { ...opts, rate: 0.8 }); return true;
    case 'barrett.empty': audio.play('gun.dry', { ...opts, rate: 0.72 }); return true;
    case 'barrett.mag.floor': audio.play('heist.guard.weapon.drop', { ...opts, rate: 0.75 }); return true;

    default: return false;
  }
}

/** Taking one off the rack. An existing cue; nothing new is wanted for it. */
export function playWeaponPickup(audio, opts = {}) {
  if (!audio) return false;
  audio.play('gun.pickup', opts);
  return true;
}

/** Putting one back on the rack. */
export function playWeaponStow(audio, opts = {}) {
  if (!audio) return false;
  audio.play('heist.weapon.down', opts);
  return true;
}
