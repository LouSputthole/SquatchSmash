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
  ...REUSED_CUES,
]);

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
    case 'marble':
    case 'stone':
    case 'tile':
      return 'heist.body.marble';
    case 'wood':
    case 'wood_thin':
    case 'hardwood':
    case 'timber':
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
  constructor({ audio } = {}) {
    this.audio = audio ?? null;
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

  impact({ target = 'enemy', zone = 'body', caliber = 'rifle', position = null, result = {} } = {}) {
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

    if (result.armorBroken === true) {
      cues.push('combat.armor.break', 'combat.armor.plate.drop');
    }
    for (const cue of cues) this._play(cue, { position });
    return cues;
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

  /** CombatAudio owns no playback handles; this keeps scene reset uniform. */
  reset() {
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
