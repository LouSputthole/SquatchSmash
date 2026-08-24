/**
 * Shared ground-combat audio selection and enemy footstep cadence.
 *
 * The audio engine owns decoding and playback. This Module owns only the
 * reusable event-to-cue rules, so scene Adapters hand it mechanical truth
 * (`CombatActor` results, material labels and actual movement) instead of
 * reimplementing those rules or inspecting scene objects here.
 */

const NEW_PRODUCTION_CUES = Object.freeze([
  'combat.bullet.impact.flesh',
  'combat.bullet.impact.flesh.heavy',
  'combat.bullet.impact.head',
  'combat.bullet.impact.armor',
  'combat.bullet.impact.armor.heavy',
  'combat.armor.break',
  'combat.armor.plate.drop',
  'combat.player.hit.flesh',
  'combat.takedown.quiet',
  'combat.triage.bandage',
  'combat.bullet.impact.wood',
  'combat.bullet.impact.metal',
  'combat.bullet.impact.glass',
  'combat.bullet.impact.dirt',
  'combat.bullet.whiz.pistol',
  'combat.bullet.whiz.heavy',
  'combat.body.fall.gravel',
  'combat.body.fall.grass',
  'combat.shell.floor.wood',
  'weapon.shotgun.fire',
  'weapon.shotgun.reload.out',
  'weapon.shotgun.reload.in',
  'weapon.shotgun.empty',
  'weapon.shotgun.mag.floor',
  'weapon.shotgun.cycle',
]);

/*
 * Pain. The half of a hit the player actually reads.
 *
 * Everything above is a physical impact -- fabric, plate, bone -- and a man
 * shot by all of it made no sound at all, which is why hits registered and
 * still felt like nothing happened. These are the reactions: non-verbal vocal
 * effort, sorted by how badly the round hurt.
 *
 * They are PROMPT-based effect cues, not cast `say`/`voice` dialogue, on
 * purpose. A grunt is not a line: text-to-speech pronounces "ugh" instead of
 * making the sound, and casting a profile would make every hostile in two
 * missions the same performer. They are still generated audio and still
 * appear in `docs/audio/RECORD-THIS.*` as effect rows, so the booth sheet
 * can see them.
 */
const VOCAL_PRODUCTION_CUES = Object.freeze([
  'combat.pain.grunt.a',
  'combat.pain.grunt.b',
  'combat.pain.cry',
  'combat.pain.death',
  'combat.player.pain',
]);

const REUSED_CUES = Object.freeze([
  'heist.bullet.whiz',
  'heist.bullet.impact',
  'gun.impact',
  'heist.player.hit',
  'ammo.take',
  'heist.armor.strap',
  'heist.body.marble',
  'silent.body.concrete',
  'drunk.collapse',
  'silent.shell.concrete',
  'footstep.wood.a',
  'footstep.wood.b',
  'footstep.rug',
  'footstep.tile',
  'footstep.concrete',
  'footstep.gravel',
  'footstep.metal',
  'footstep.grass',
  'footstep.dirt',
]);

/** Exact preload bank: new production queue first, approved reuse second. */
export const GROUND_COMBAT_AUDIO_CUES = Object.freeze([
  ...NEW_PRODUCTION_CUES,
  ...VOCAL_PRODUCTION_CUES,
  ...REUSED_CUES,
]);

/** Light hits alternate, so a man taking a burst does not repeat one sample. */
const PAIN_LIGHT_CUES = Object.freeze(['combat.pain.grunt.a', 'combat.pain.grunt.b']);
const PAIN_HEAVY_CUE = 'combat.pain.cry';
const PAIN_FATAL_CUE = 'combat.pain.death';
const PLAYER_PAIN_CUE = 'combat.player.pain';

/**
 * A round is "heavy" when it takes a quarter of a healthy man's hundred
 * points in one hit; a head hit is heavy whatever the number says.
 */
const PAIN_HEAVY_DAMAGE = 24;

/**
 * One man, one voice. A shotgun puts eight pellets into a chest inside a
 * single frame and both scenes present each of them, so without a per-source
 * throttle one trigger pull is eight screams from one body.
 */
const PAIN_VOICE_INTERVAL = 0.4;

/** Throttle cell for a hit with no actor id: about one body wide. */
const PAIN_POSITION_CELL = 0.75;

/*
 * The player's own voice, and why it is rationed.
 *
 * Owner's requirement, verbatim: a vocal on every bullet turns the Prospect
 * into "a Prospect percussion instrument". Incoming fire lands far faster
 * than a man reacts to it, so his voice is gated twice and both gates are
 * explicit:
 *
 *   - PLAYER_VOCAL_COOLDOWN is a hard floor. No second vocal inside it, ever,
 *     however many rounds arrive.
 *   - PLAYER_VOCAL_CHANCE is rolled on the hits that DO clear the cooldown, so
 *     the vocal is not a metronome either -- most eligible hits stay silent
 *     and the one that speaks is not predictable.
 *
 * Under sustained fire that is one vocal per ~4 s at the very most, and in
 * practice noticeably less. A losing roll deliberately does NOT stamp the
 * clock: it costs the hit its voice, not the next four seconds of them.
 *
 * A killing hit skips the dice but not the cooldown -- the last sound a man
 * makes is not left to a coin toss.
 */
const PLAYER_VOCAL_COOLDOWN = 4;
const PLAYER_VOCAL_CHANCE = 0.34;

const defaultClock = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;

const HEAVY_CALIBERS = new Set([
  'heavy', '.50', '50', '50cal', '50-cal', 'anti-materiel', 'antimateriel', 'lmg',
]);
const PISTOL_CALIBERS = new Set([
  'pistol', 'handgun', 'sidearm', '9mm', '.45', '45', 'revolver',
]);

function token(value, fallback = '') {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || fallback;
}

function positive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function pointOf(position) {
  if (!position) return null;
  const x = Number(position.x);
  const y = Number(position.y);
  const z = Number(position.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function isHeavy(caliber) {
  return HEAVY_CALIBERS.has(token(caliber));
}

function isPistol(caliber) {
  return PISTOL_CALIBERS.has(token(caliber));
}

function worldCue(material) {
  switch (token(material, 'concrete')) {
    case 'plaster':
    case 'drywall':
    case 'sheetrock':
      return 'gun.impact';
    case 'wood':
    case 'wood_thin':
    case 'hardwood':
    case 'timber':
      return 'combat.bullet.impact.wood';
    case 'metal':
    case 'steel':
    case 'iron':
    case 'rail':
      return 'combat.bullet.impact.metal';
    case 'glass':
    case 'window':
      return 'combat.bullet.impact.glass';
    case 'dirt':
    case 'soil':
    case 'earth':
    case 'sand':
      return 'combat.bullet.impact.dirt';
    case 'brick':
    case 'concrete':
    case 'marble':
    case 'masonry':
    case 'stone':
    case 'stucco':
    default:
      return 'heist.bullet.impact';
  }
}

function bodyFallCue(surface) {
  switch (token(surface, 'concrete')) {
    /* `heist.body.marble` is recorded as a body landing "onto polished marble
     * ... with short LOBBY REVERB". That is the bank in the Heist and the hall
     * of Lou's mansion, and it is not a terracotta floor in a stucco villa.
     * The Palace was the only caller passing `tile` and it was getting a
     * marble lobby; a hard floor without the ring is the concrete take. */
    case 'marble':
    case 'stone':
      return 'heist.body.marble';
    case 'tile':
    case 'ceramic':
      return 'silent.body.concrete';
    case 'wood':
    case 'wood_thin':
    case 'hardwood':
    case 'timber':
      return 'drunk.collapse';
    /* A man going down on a rug is the softest fall in the game, and the
     * softest recording is the one made on floorboards -- `silent.body.concrete`
     * carries "the flat knock of a skull following a fraction later", which is
     * the one thing a rug is there to stop. */
    case 'rug':
    case 'carpet':
      return 'drunk.collapse';
    case 'gravel':
      return 'combat.body.fall.gravel';
    case 'grass':
    case 'lawn':
      return 'combat.body.fall.grass';
    case 'concrete':
    case 'plaster':
    default:
      return 'silent.body.concrete';
  }
}

function stepCue(surface, foot = 0) {
  switch (token(surface, 'concrete')) {
    case 'wood':
    case 'wood_thin':
    case 'hardwood':
    case 'timber':
      return Number(foot) % 2 === 0 ? 'footstep.wood.a' : 'footstep.wood.b';
    case 'rug':
    case 'carpet':
      return 'footstep.rug';
    case 'tile':
    case 'marble':
    case 'stone':
      return 'footstep.tile';
    case 'gravel':
      return 'footstep.gravel';
    case 'metal':
    case 'steel':
    case 'iron':
      return 'footstep.metal';
    case 'grass':
    case 'lawn':
      return 'footstep.grass';
    case 'dirt':
    case 'soil':
    case 'earth':
      return 'footstep.dirt';
    case 'concrete':
    default:
      return 'footstep.concrete';
  }
}

/**
 * Translate shared combat result data into one physical audio event (plus an
 * explicit armor-break layer when the result says a plate actually broke).
 */
export class CombatAudio {
  constructor({ audio, random = Math.random, now = defaultClock } = {}) {
    this.audio = audio ?? null;
    /* Injected so the player's rationed voice is testable and so a scene can
     * make it deterministic; both default to the real world. */
    this.random = typeof random === 'function' ? random : Math.random;
    this.now = typeof now === 'function' ? now : defaultClock;
    this._painAt = new Map();
    this._painVariant = 0;
    this._playerVocalAt = -Infinity;
  }

  _clock() {
    const value = Number(this.now());
    return Number.isFinite(value) ? value : 0;
  }

  _play(cue, { position = null, volume, rate } = {}) {
    if (!cue || typeof this.audio?.play !== 'function') return false;
    const options = {};
    if (position) options.position = position;
    if (Number.isFinite(Number(volume))) options.volume = Number(volume);
    if (Number.isFinite(Number(rate))) options.rate = Number(rate);
    this.audio.play(cue, options);
    return true;
  }

  /**
   * Every applied hit also gets its vocal reaction, because the physical layer
   * alone is what made a landed round read as nothing. Pass `vocal: false` for
   * a presentation pass that only wants the impact (a re-presented pellet, a
   * silent takedown), and `id` so the per-actor throttle keys on the man
   * rather than on the spot he was standing in.
   */
  impact({
    target = 'enemy', zone = 'body', caliber = 'rifle', position = null,
    result = {}, id = null, vocal = true, armorTier = 'heavy',
  } = {}) {
    if (result?.applied !== true) return [];
    const cues = [];
    const absorbed = positive(result.absorbed);
    const player = token(target) === 'player';

    if (player) {
      cues.push(absorbed > 0 ? 'heist.player.hit' : 'combat.player.hit.flesh');
    } else if (token(zone) === 'head') {
      cues.push('combat.bullet.impact.head');
    } else if (absorbed > 0) {
      cues.push(isHeavy(caliber)
        ? 'combat.bullet.impact.armor.heavy'
        : 'combat.bullet.impact.armor');
    } else {
      cues.push(isHeavy(caliber)
        ? 'combat.bullet.impact.flesh.heavy'
        : 'combat.bullet.impact.flesh');
    }

    /* WHAT BREAKING ARMOUR SOUNDS LIKE DEPENDS ON WHAT THE ARMOUR IS.
     *
     * Both of these cues are ceramic: `combat.armor.break` is "a final ceramic
     * ballistic plate fracture" and `combat.armor.plate.drop` is "a broken
     * armor plate and several ceramic fragments dropping from a carrier onto a
     * hard floor". They are right for a man in a plate carrier and wrong for a
     * man in a light vest, who has no plate to shatter or drop.
     *
     * Owner, 2026-08-24, on the Palace: metallic scraping death sounds. Every
     * guard on that estate carries armour, so every guard's armour broke
     * during the burst that killed him, so a ceramic crack and a handful of
     * fragments settling played over almost every kill in the mission -- and a
     * clack followed by grit is exactly "metallic scraping".
     *
     * `CombatArmorPresentation` has known the tier since it was written. It is
     * passed in now, and light armour gets NEITHER -- not a substitute cue,
     * because there is no recording of a soft vest giving out and inventing
     * one out of the nearest sample is how the ceramic pair ended up here in
     * the first place. The read is still there without them: the next round
     * into that man stops sounding like armour and starts sounding like
     * flesh, which is the thing that actually changed. */
    if (result.armorBroken === true && token(armorTier) === 'heavy') {
      cues.push('combat.armor.break', 'combat.armor.plate.drop');
    }
    for (const cue of cues) this._play(cue, { position });
    if (vocal !== false) {
      const voice = this.pain({ target, id, zone, position, result });
      if (voice) cues.push(voice);
    }
    return cues;
  }

  /**
   * The reaction, from the man who was hit. Positional, so it comes out of the
   * body rather than out of the HUD, and throttled per source so one burst is
   * one reaction. Returns the cue it played, or null when the throttle, the
   * cooldown or the dice ate it.
   */
  pain({
    target = 'enemy', id = null, zone = 'body', position = null,
    result = {}, fatal = null,
  } = {}) {
    if (result?.applied === false) return null;
    const mortal = fatal === true || result?.fatal === true;
    if (token(target) === 'player') return this.playerVocal({ position, fatal: mortal });

    const keys = this._painKeys(id, position);
    const now = this._clock();
    for (const key of keys) {
      const last = this._painAt.get(key);
      if (last != null && now - last < PAIN_VOICE_INTERVAL) return null;
    }

    let cue = null;
    let volume = 0.62;
    if (mortal) {
      cue = PAIN_FATAL_CUE;
      volume = 0.9;
    } else if (token(zone) === 'head' || positive(result?.damage) >= PAIN_HEAVY_DAMAGE) {
      cue = PAIN_HEAVY_CUE;
      volume = 0.8;
    } else {
      cue = PAIN_LIGHT_CUES[this._painVariant % PAIN_LIGHT_CUES.length];
      this._painVariant++;
    }
    if (!this._play(cue, { position, volume })) return null;
    for (const key of keys) this._painAt.set(key, now);
    /* A long fight must not grow one throttle entry per hostile per corpse. */
    if (this._painAt.size > 64) {
      for (const [key, at] of this._painAt) {
        if (now - at >= PAIN_VOICE_INTERVAL) this._painAt.delete(key);
      }
    }
    return cue;
  }

  /**
   * The player's own grunt, behind the cooldown and the dice above. `force`
   * exists for a scripted beat that must be heard; ordinary combat never
   * passes it.
   */
  playerVocal({ position = null, fatal = false, force = false } = {}) {
    const now = this._clock();
    if (!force && now - this._playerVocalAt < PLAYER_VOCAL_COOLDOWN) return null;
    if (!force && fatal !== true && Number(this.random()) >= PLAYER_VOCAL_CHANCE) return null;
    if (!this._play(PLAYER_PAIN_CUE, { position, volume: fatal === true ? 0.95 : 0.8 })) {
      return null;
    }
    this._playerVocalAt = now;
    return PLAYER_PAIN_CUE;
  }

  /** Actor id when the scene knows it, plus the body-sized cell it stood in,
   * so the same hit presented twice (director and scene root both speaking)
   * still costs one voice. */
  _painKeys(id, position) {
    const keys = [];
    const key = String(id ?? '').trim();
    if (key) keys.push(`id:${key}`);
    const point = pointOf(position);
    if (point) {
      keys.push(`at:${Math.round(point.x / PAIN_POSITION_CELL)}`
        + `,${Math.round(point.y / PAIN_POSITION_CELL)}`
        + `,${Math.round(point.z / PAIN_POSITION_CELL)}`);
    }
    return keys.length ? keys : ['at:unknown'];
  }

  whiz({ caliber = 'rifle', position = null } = {}) {
    const cue = isHeavy(caliber)
      ? 'combat.bullet.whiz.heavy'
      : isPistol(caliber) ? 'combat.bullet.whiz.pistol' : 'heist.bullet.whiz';
    this._play(cue, { position });
    return cue;
  }

  worldImpact({ material = 'concrete', position = null } = {}) {
    const cue = worldCue(material);
    this._play(cue, { position });
    return cue;
  }

  triage({ position = null } = {}) {
    this._play('combat.triage.bandage', { position });
    return 'combat.triage.bandage';
  }

  resupply({ ammunition = 0, armor = 0, position = null } = {}) {
    const cues = [];
    if (positive(ammunition) > 0) cues.push('ammo.take');
    if (positive(armor) > 0) cues.push('heist.armor.strap');
    for (const cue of cues) this._play(cue, { position });
    return cues;
  }

  bodyFall({ surface = 'concrete', position = null } = {}) {
    const cue = bodyFallCue(surface);
    this._play(cue, { position });
    return cue;
  }

  ejecta({ kind = 'case', surface = 'concrete', position = null } = {}) {
    const normalizedKind = token(kind, 'case');
    let cue = null;
    if (normalizedKind === 'shotgun-shell') cue = 'weapon.shotgun.mag.floor';
    else if (normalizedKind === 'case' || normalizedKind === 'shell') {
      cue = ['wood', 'hardwood', 'timber'].includes(token(surface))
        ? 'combat.shell.floor.wood' : 'silent.shell.concrete';
    }
    if (cue) this._play(cue, { position });
    return cue;
  }

  takedown({ position = null } = {}) {
    this._play('combat.takedown.quiet', { position });
    return 'combat.takedown.quiet';
  }

  step({ surface = 'concrete', foot = 0, position = null, intensity = 1 } = {}) {
    const cue = stepCue(surface, foot);
    this._play(cue, {
      position,
      volume: 0.3 * Math.max(0, Number(intensity) || 0),
    });
    return cue;
  }

  /** CombatAudio owns no playback handles, but it does own the vocal clocks:
   * a checkpoint restore must not carry a dead man's throttle into the retry. */
  reset() {
    this._painAt.clear();
    this._painVariant = 0;
    this._playerVocalAt = -Infinity;
    return false;
  }
}

/**
 * Distance-based enemy step scheduler. Each actor owns an independent stride
 * accumulator and interval, so a crowd neither shares the player's global
 * footstep throttle nor emits steps while standing still. Large discontinuous
 * moves are treated as teleports/checkpoint restores and only re-anchor.
 */
export class CombatStepCadence {
  constructor({
    audio,
    stride = 1.35,
    minInterval = 0.16,
    teleportDistance = 5,
    maxPerSecond = 18,
    now = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000,
  } = {}) {
    this.audio = audio ?? null;
    this.stride = Math.max(0.1, Number(stride) || 1.35);
    this.minInterval = Math.max(0, Number(minInterval) || 0);
    this.teleportDistance = Math.max(this.stride, Number(teleportDistance) || 5);
    this.maxPerSecond = Math.max(1, Math.trunc(Number(maxPerSecond) || 18));
    this.now = typeof now === 'function' ? now : () => Date.now() / 1000;
    this._actors = new Map();
    this._playedAt = [];
  }

  update({ id, dt = 0, position, surface = 'concrete', intensity = 1, moving = true } = {}) {
    const key = String(id ?? '').trim();
    const point = pointOf(position);
    if (!key || !point) return false;

    let state = this._actors.get(key);
    if (!state) {
      state = { point, distance: 0, elapsed: 0, foot: 0 };
      this._actors.set(key, state);
      return false;
    }

    state.elapsed += Math.max(0, Number(dt) || 0);
    const dx = point.x - state.point.x;
    const dy = point.y - state.point.y;
    const dz = point.z - state.point.z;
    const distance = Math.hypot(dx, dy, dz);
    state.point = point;

    if (distance > this.teleportDistance) {
      state.distance = 0;
      state.elapsed = 0;
      return false;
    }
    if (moving === false || distance <= Number.EPSILON) return false;

    state.distance += distance;
    if (state.distance + Number.EPSILON < this.stride || state.elapsed < this.minInterval) return false;

    const now = Number(this.now());
    const clock = Number.isFinite(now) ? now : 0;
    this._playedAt = this._playedAt.filter((playedAt) => clock - playedAt < 1);
    if (this._playedAt.length >= this.maxPerSecond) return false;

    state.distance %= this.stride;
    state.elapsed = 0;
    const played = this.audio?.step?.({
      id: key,
      surface,
      foot: state.foot,
      position,
      intensity,
    });
    state.foot = (state.foot + 1) % 2;
    const accepted = played !== false && played != null;
    if (accepted) this._playedAt.push(clock);
    return accepted;
  }

  reset(id = null) {
    if (id == null) {
      const changed = this._actors.size > 0;
      this._actors.clear();
      this._playedAt.length = 0;
      return changed;
    }
    return this._actors.delete(String(id));
  }
}
