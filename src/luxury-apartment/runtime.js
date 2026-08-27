/**
 * Scene-local runtime seams for the standalone luxury-apartment preview.
 *
 * world.js deliberately owns geometry and exposes handles instead of owning
 * gameplay. main.js consumes this contract:
 *
 * - colliders/floorZones/groundAt(x,z,currentY) for the shared Player;
 * - spawns plus poses shaped as { position, yaw, pitch, exit };
 * - screens { pc, tv, arcade, console } and gameStations keyed by stable id;
 * - doors.front/elevator, setLights(zone,on,options), setCityTime(minutes);
 * - inventory, phoneProp, radioPos, showerHead and showerStand;
 * - update(dt,elapsed,playerPosition) and dispose().
 *
 * Keeping the assumptions here makes contract drift fail close without
 * assigning this developer preview a campaign scene or touching either home.
 */
import * as THREE from 'three';

import { ITEMS } from '../core/inventory.js';
import { PeeSystem } from '../core/pee-system.js';
import {
  BallisticProjectile,
  ThrowCharge,
  composeThrowVelocity,
  segmentPlaneImpact,
} from '../core/throwable.js';
import { TimingBar } from '../core/timingbar.js';
import { BulletHoles } from '../world/bullets.js';
import { makeMaterials } from '../world/materials.js';
import {
  makeHeldCigarette,
  makeHeldDrinks,
  makeHeldSlice,
  makePhone,
  makeRevolver,
  poseHeldDrink,
} from '../world/props.js';
import { StreamSystem } from '../world/stream.js';

export const LUXURY_WORLD_CONTRACT = Object.freeze({
  spawns: Object.freeze(['arrival', 'main', 'loft', 'bed', 'arcade']),
  poses: Object.freeze([
    'bed', 'couch', 'desk', 'tv', 'radio', 'kitchen',
    'shower', 'wardrobe', 'arcade', 'poker', 'darts', 'console',
  ]),
  screens: Object.freeze(['pc', 'tv', 'arcade', 'console']),
  stations: Object.freeze(['pc', 'arcade', 'poker', 'darts', 'console']),
  utilities: Object.freeze([
    'frontDoor', 'elevator', 'bathroomDoor', 'bed', 'couch', 'desk', 'tv', 'radio', 'phone',
    'fridge', 'kitchen', 'cigarettes', 'shower', 'wardrobe', 'toilet',
    'mainLights', 'loftLights', 'cityGlass', 'shades', 'answeringMachine',
    'revolver', 'ammo', 'bong', 'shrooms', 'whiteLine', 'crookedArt',
  ]),
});

function smoothstep(value) {
  const k = THREE.MathUtils.clamp(value, 0, 1);
  return k * k * (3 - 2 * k);
}

export function validateLuxuryWorld(world) {
  if (!world?.root || !Array.isArray(world.colliders) || !Array.isArray(world.floorZones)) {
    throw new TypeError('Luxury world must expose root, colliders, and floorZones');
  }
  if (typeof world.groundAt !== 'function' || typeof world.update !== 'function') {
    throw new TypeError('Luxury world must expose groundAt() and update()');
  }
  for (const [group, keys] of Object.entries(LUXURY_WORLD_CONTRACT)) {
    if (group === 'utilities') continue;
    const surface = group === 'stations' ? world.gameStations : world[group];
    for (const key of keys) {
      if (!surface?.[key]) throw new Error(`Luxury world is missing ${group}.${key}`);
    }
  }
  for (const key of LUXURY_WORLD_CONTRACT.utilities) {
    if (!world.utilityTargets?.[key]) throw new Error(`Luxury world is missing utilityTargets.${key}`);
  }
  if (!world.inventory || !world.doors?.front || !world.doors?.elevator || !world.doors?.bathroom) {
    throw new Error('Luxury world must expose inventory, canonical elevator, sealed service door, and bathroom door');
  }
  for (const key of [
    'toiletBowl', 'toiletBowlRadius', 'toiletWaterY', 'toiletSeat',
    'toiletStand', 'toiletLid', 'toiletSeatPivot', 'toiletCollider', 'toiletFloorY',
    'answeringMachine', 'revolver', 'ammo', 'bong', 'shrooms', 'whiteLine', 'crookedArt',
  ]) {
    if (world[key] === undefined || world[key] === null) throw new Error(`Luxury world is missing ${key}`);
  }
  if (typeof world.crookedArt.setCrookedness !== 'function' || typeof world.setShades !== 'function') {
    throw new Error('Luxury world must expose crooked-art and shade controls');
  }
  return world;
}

/**
 * Core Player asks groundAt(x,z) without a floor hint. Close over the live
 * player Y so the overlapping two-storey home resolves the current floor.
 */
export function createFloorAwarePlayerWorld(world, playerRef) {
  return {
    colliders: world.colliders,
    floorZones: world.floorZones,
    groundAt: (x, z) => world.groundAt(x, z, playerRef()?.position?.y ?? 0),
  };
}

/** Player.standFrom hardcodes ground-floor eye height; this exit is loft-safe. */
export function restoreWalkingPose(player, exit, groundAt) {
  if (!player || !exit) return false;
  const floor = groundAt(exit.x, exit.z, player.position.y);
  player._tween = null;
  player.mode = 'walk';
  player.position.set(exit.x, floor + 1.66, exit.z);
  player.velocity.set(0, 0, 0);
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.10, 0.85);
  player.pitchMin = -Math.PI / 2 + 0.05;
  player.pitchMax = Math.PI / 2 - 0.05;
  player.yawCenter = null;
  player.yawRange = Math.PI;
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.clearKeys();
  return true;
}

export function teleportToSpawn(player, world, id = 'main') {
  const spawn = world?.spawns?.[id];
  if (!player || !spawn?.position) return false;
  player._tween = null;
  player.position.copy(spawn.position);
  player.yaw = Number.isFinite(spawn.yaw) ? spawn.yaw : player.yaw;
  player.pitch = Number.isFinite(spawn.pitch) ? spawn.pitch : -0.06;
  player.mode = 'walk';
  player.yawCenter = null;
  player.pitchMin = -Math.PI / 2 + 0.05;
  player.pitchMax = Math.PI / 2 - 0.05;
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.velocity.set(0, 0, 0);
  player.clearKeys();
  return true;
}

export function paintLuxuryGamePanel(panel, {
  visible = true,
  title = 'PRIVATE GAME',
  primary = 'READY',
  secondary = '',
  hint = '',
} = {}) {
  if (!panel) return;
  panel.classList.toggle('hidden', !visible);
  panel.querySelector('[data-game-title]').textContent = title;
  panel.querySelector('[data-game-primary]').textContent = primary;
  panel.querySelector('[data-game-secondary]').textContent = secondary;
  panel.querySelector('[data-game-hint]').textContent = hint;
}

/**
 * THE POKER TABLE IS FURNITURE. Owner playtest note, 2026-08-26:
 *
 *   "Just leave the poker table for clearly fun when people are over and
 *    remove the poker mini game or give the player the option but just hint
 *    they have no one to play with when they select it and dont let them
 *    play."
 *
 * So the prompt stays -- `Play poker` is still on the table target, and he
 * still walks up to it and presses E -- and the answer is one flat line in
 * the flat's own refusal idiom, the same shape the deadbolted service door
 * uses: a toast naming the fact, then a sentence he says to himself. Nothing
 * winks (docs/TONE-AND-PARODY.md); he has just moved into the second rung of
 * the Home Ladder and noticed what is missing from his own front room.
 */
export const LUXURY_POKER_REFUSAL = Object.freeze({
  toast: 'Nobody to deal in',
  line: 'Four chairs and a stack of chips nobody has touched. <em>He has not had anybody up here yet.</em>',
  durationMs: 4200,
});

/**
 * Refuse the poker table out loud. Returns FALSE, always: the caller uses it
 * as the station's return value, so nothing sits down and no game opens.
 */
export function refuseLuxuryPoker(hud) {
  hud?.toast?.(LUXURY_POKER_REFUSAL.toast);
  hud?.say?.(LUXURY_POKER_REFUSAL.line, LUXURY_POKER_REFUSAL.durationMs);
  return false;
}

const TOILET_PUSH_KEYS = Object.freeze(['W', 'A', 'S', 'D']);
const TOILET_PUSH_SEQUENCE = Object.freeze(['W', 'A', 'S', 'D', 'D', 'W', 'S', 'A']);
const TOILET_PUSH_WINDOW = 1.5;
const TOILET_PUSH_GAP = 0.55;
const TOILET_PUSH_DRAIN = 0.115;

/**
 * Both apartment toilet activities behind one deterministic controller:
 * standing free-aim uses the shared PeeSystem/StreamSystem, while sitting
 * turns W/A/S/D into the familiar push rhythm. Geometry remains world-owned.
 */
export class LuxuryToiletRuntime {
  constructor({
    scene,
    camera,
    player,
    world,
    interaction,
    hud,
    audio,
    onMode = null,
    requestPointerLock = null,
    isPointerLocked = () => false,
  } = {}) {
    if (!scene || !camera || !player || !world || !interaction || !hud) {
      throw new TypeError('LuxuryToiletRuntime requires scene, camera, player, world, interaction, and hud');
    }
    this.camera = camera;
    this.player = player;
    this.world = world;
    this.interaction = interaction;
    this.hud = hud;
    this.audio = audio;
    this.onMode = onMode;
    this.requestPointerLock = requestPointerLock;
    this.isPointerLocked = isPointerLocked;
    this.mode = null;
    this.bowel = 1;
    this.sequenceIndex = 0;
    this.pushTime = 0;
    this.pushFlash = null;
    this.pushFlashTime = 0;
    this.pushStats = { attempts: 0, hits: 0, misses: 0 };
    this.seatedTime = 0;
    this.seatedPee = false;
    this.seatedVolume = 0;
    this.lastPeeReport = null;

    this.stream = new StreamSystem(scene);
    this.pee = new PeeSystem({
      camera,
      stream: this.stream,
      audio,
      colliders: world.colliders,
      bladder: 1,
    });
  }

  get active() { return this.mode !== null; }
  get pushing() { return this.mode === 'seat'; }
  get aiming() { return this.mode === 'aim'; }
  get nextPush() { return TOILET_PUSH_SEQUENCE[this.sequenceIndex % TOILET_PUSH_SEQUENCE.length]; }

  _setMode(mode) {
    this.mode = mode;
    this.onMode?.(mode);
  }

  _toiletDescriptor() {
    return {
      id: 'luxury-toilet',
      bowl: this.world.toiletBowl,
      radius: this.world.toiletBowlRadius,
      waterY: this.world.toiletWaterY,
      collider: this.world.toiletCollider,
      lidPivot: this.world.toiletLid,
      seatPivot: this.world.toiletSeatPivot,
      floorY: this.world.toiletFloorY,
    };
  }

  _restoreWalking() {
    restoreWalkingPose(this.player, this.world.toiletStand, this.world.groundAt);
    this.interaction.setPaused(false);
    this.player.enabled = this.isPointerLocked();
    this.requestPointerLock?.();
  }

  startAim() {
    if (this.active || this.pee.bladder <= 0.01) {
      if (this.pee.bladder <= 0.01) this.hud.say('Nothing left in the tank.', 2200);
      return false;
    }
    restoreWalkingPose(this.player, this.world.toiletStand, this.world.groundAt);
    /* Player.handleMouseMove deliberately ignores `frozen`; a scene-local
     * non-walk mode pins movement while preserving the actual aiming input. */
    this.player.mode = 'aim';
    this.player.yaw = 0;
    this.player.pitch = -0.42;
    this.player.yawCenter = null;
    this.player.yawRange = Math.PI;
    this.player.clearKeys();
    this.player.enabled = true;
    this.interaction.setPaused(true);
    if (!this.pee.start(this._toiletDescriptor())) {
      this._restoreWalking();
      return false;
    }
    this._setMode('aim');
    this.hud.setPosture('stop');
    this.hud.say('Aim with the mouse. <em>The marble is not a target.</em>', 3600);
    this.requestPointerLock?.();
    return true;
  }

  stopAim({ quiet = false } = {}) {
    if (this.mode !== 'aim') return false;
    this.pee.stop();
    this.lastPeeReport = this.pee.report();
    this.hud.setPosture(null);
    this._setMode(null);
    this._restoreWalking();
    if (!quiet && this.lastPeeReport.total > 12) {
      const pct = Math.round(this.lastPeeReport.accuracy * 100);
      this.hud.toast(`${pct}% on target`, pct >= 70 ? 'good' : 'bad');
    }
    return this.lastPeeReport;
  }

  startSeat() {
    if (this.active || !this.world.toiletSeat) return false;
    this.player.clearKeys();
    this.player.enabled = false;
    this.interaction.setPaused(true);
    this.world.toiletLid.rotation.x = -1.92;
    this.audio?.play?.('chair.sit', { volume: 0.48 });
    this._setMode('seat-transition');
    this.player.sitAt({
      position: this.world.toiletSeat.clone(),
      yaw: Math.PI,
      pitch: -0.15,
      yawRange: 0.85,
    }, () => {
      this.seatedTime = 0;
      this.seatedPee = this.pee.bladder > 0.04;
      this.seatedVolume = 0;
      this.resetPushes({ preserveStats: true });
      if (this.seatedPee) this.audio?.startLoop?.('luxury.toilet.pee', { name: 'pee.stream', volume: 0, fade: 0.25 });
      this.hud.setMode('seated');
      this.hud.setPosture('get up');
      this.hud.say('Relief. Follow the W A S D rhythm.', 3200);
      this._setMode('seat');
    });
    return true;
  }

  stopSeat() {
    if (this.mode !== 'seat') return false;
    this.resetPushes({ preserveStats: true });
    if (this.seatedPee) this.audio?.stopLoop?.('luxury.toilet.pee', 0.25);
    this.seatedPee = false;
    this.world.toiletLid.rotation.x = 0;
    this.hud.setMode('walk');
    this.hud.setPosture(null);
    this.audio?.play?.('pee.zip', { volume: 0.5 });
    this._setMode(null);
    this._restoreWalking();
    return true;
  }

  stop(options) {
    if (this.mode === 'aim') return this.stopAim(options);
    if (this.mode === 'seat') return this.stopSeat();
    return false;
  }

  resetPushes({ preserveStats = false } = {}) {
    this.sequenceIndex = 0;
    this.pushTime = 0;
    this.pushFlash = null;
    this.pushFlashTime = 0;
    if (!preserveStats) this.pushStats = { attempts: 0, hits: 0, misses: 0 };
    this.hud.setPushes(null);
  }

  _advancePush() {
    this.sequenceIndex = (this.sequenceIndex + 1) % TOILET_PUSH_SEQUENCE.length;
    this.pushTime = -TOILET_PUSH_GAP;
  }

  _missPush() {
    this.pushStats.attempts += 1;
    this.pushStats.misses += 1;
    this.pushFlash = 'miss';
    this.pushFlashTime = 0.28;
    this._advancePush();
    this.audio?.play?.('poop.strain', { volume: 0.48 });
  }

  tryPush(code) {
    if (this.mode !== 'seat' || this.bowel <= 0.02 || this.pushTime < 0) return false;
    if (!/^Key[WASD]$/.test(code)) return false;
    const wanted = `Key${this.nextPush}`;
    if (code !== wanted) {
      this._missPush();
      return true;
    }
    this.pushStats.attempts += 1;
    this.pushStats.hits += 1;
    this.bowel = Math.max(0, this.bowel - TOILET_PUSH_DRAIN);
    this.pushFlash = 'hit';
    this.pushFlashTime = 0.28;
    this._advancePush();
    const cue = this.pushStats.hits % 3 === 0 ? 'toilet.plop' : `poop.${(this.pushStats.hits % 4) + 1}`;
    this.audio?.play?.(cue, { volume: 0.68, rate: 0.92 + (this.pushStats.hits % 3) * 0.07 });
    if (this.bowel <= 0.02) this.hud.toast('That is that dealt with', 'good');
    return true;
  }

  handleKey(code) {
    if (this.mode === 'aim') {
      if (['KeyQ', 'KeyE', 'KeyF'].includes(code)) {
        this.stopAim();
        return true;
      }
      return /^Key[WASD]$/.test(code);
    }
    if (this.mode === 'seat') {
      if (code === 'KeyQ' || code === 'KeyE') {
        this.stopSeat();
        return true;
      }
      return this.tryPush(code);
    }
    return this.mode === 'seat-transition';
  }

  update(dt) {
    const wasPeeing = this.pee.active;
    this.pee.update(dt);
    if (this.mode === 'aim' && wasPeeing && !this.pee.active) {
      this.stopAim();
    }

    if (this.mode === 'seat') {
      this.seatedTime += dt;
      this.bowel = Math.max(0, this.bowel - dt * 0.006);
      if (this.seatedPee) {
        const before = this.pee.bladder;
        this.pee.bladder = Math.max(0, this.pee.bladder - dt * 0.075);
        this.seatedVolume += before - this.pee.bladder;
        const power = Math.min(1, 0.25 + this.pee.bladder * 2.2);
        this.audio?.setLoopVolume?.('luxury.toilet.pee', 0.10 + power * 0.20, 0.15);
        if (this.pee.bladder <= 0.001) {
          this.seatedPee = false;
          this.audio?.stopLoop?.('luxury.toilet.pee', 0.5);
        }
      }

      if (this.bowel > 0.02) {
        if (this.pushFlash) {
          this.pushFlashTime -= dt;
          if (this.pushFlashTime <= 0) this.pushFlash = null;
        }
        this.pushTime += dt;
        if (this.pushTime > TOILET_PUSH_WINDOW) this._missPush();
        const live = this.pushTime >= 0;
        this.hud.setPushes(TOILET_PUSH_KEYS.map((key) => ({
          key,
          state: key === this.nextPush ? (this.pushFlash || (live ? 'live' : '')) : '',
        })));
      } else {
        this.hud.setPushes(null);
      }
    }

    const draining = this.pee.active || this.seatedPee || this.mode === 'seat';
    if (this.bowel > this.pee.bladder) this.hud.setBladder(this.bowel, this.mode === 'seat', 'urgency');
    else this.hud.setBladder(this.pee.bladder, draining, 'bladder');
  }

  setBladder(value) {
    this.pee.bladder = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
    return this.pee.bladder;
  }

  setBowel(value) {
    this.bowel = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
    return this.bowel;
  }

  solvePushes() {
    if (this.mode !== 'seat') return false;
    let guard = 24;
    while (this.bowel > 0.02 && guard-- > 0) {
      this.pushTime = 0;
      this.tryPush(`Key${this.nextPush}`);
    }
    return this.bowel <= 0.02;
  }

  report() {
    const attempts = this.pushStats.attempts;
    return {
      mode: this.mode,
      bladder: this.pee.bladder,
      bowel: this.bowel,
      progress: 1 - this.bowel,
      nextPush: this.nextPush,
      pee: this.pee.report(),
      lastPee: this.lastPeeReport,
      pushes: {
        ...this.pushStats,
        accuracy: attempts ? this.pushStats.hits / attempts : 1,
      },
    };
  }
}

/** Shared TimingBar used to straighten the intentionally crooked hero frame. */
export class LuxuryCrookedArtRuntime {
  constructor({ art = null, interaction, hud, audio, onMode = null } = {}) {
    if (!interaction || !hud) throw new TypeError('LuxuryCrookedArtRuntime requires interaction and hud');
    this.art = art;
    this.interaction = interaction;
    this.hud = hud;
    this.audio = audio;
    this.onMode = onMode;
    this.completed = false;
    this.attempts = 0;
    this.misses = 0;
    this.bar = new TimingBar({
      hits: 8,
      window: [0.74, 0.87],
      speed: 0.80,
      ramp: 1.17,
      onHit: (hits, total) => {
        this.attempts += 1;
        this.audio?.play?.('ui.select', { volume: 0.30 + (hits / total) * 0.25 });
        this.hud.toast(`${hits}/${total}`, hits >= total - 1 ? 'good' : '');
      },
      onMiss: () => {
        this.attempts += 1;
        this.misses += 1;
        this.audio?.play?.('glue.slip', { volume: 0.42 });
      },
      onDone: () => this.finish(),
    });
  }

  start(art = this.art) {
    if (this.completed || this.bar.active || !art?.setCrookedness) {
      if (this.completed) this.hud.say('It is level. Leave it alone.', 2200);
      return false;
    }
    this.art = art;
    this.bar.start();
    this.interaction.setPaused(true);
    this.hud.setPosture('give up');
    this.hud.say('Time the marker and nudge the frame level.', 3400);
    this.onMode?.('crooked-art');
    return true;
  }

  press() { return this.bar.press(); }

  abort() {
    if (!this.bar.active) return false;
    this.bar.stop();
    this.hud.setTiming(null);
    this.hud.setPosture(null);
    this.interaction.setPaused(false);
    this.onMode?.(null);
    this.hud.say('It can stay crooked for another night.', 2800);
    return true;
  }

  finish() {
    if (this.completed) return false;
    this.completed = true;
    this.art?.setCrookedness?.(0);
    this.hud.setTiming(null);
    this.hud.setPosture(null);
    this.interaction.setPaused(false);
    this.onMode?.(null);
    this.hud.toast('Photograph straightened', 'good');
    return true;
  }

  handleKey(code) {
    if (!this.bar.active) return false;
    if (code === 'KeyE' || code === 'Space') {
      this.press();
      return true;
    }
    if (code === 'KeyQ') return this.abort();
    return true;
  }

  update(dt) {
    this.bar.update(dt);
    this.hud.setTiming(this.bar.view);
  }

  solve() {
    if (!this.bar.active && !this.start()) return this.completed;
    let guard = this.bar.total + 2;
    while (this.bar.active && guard-- > 0) {
      this.bar.pos = (this.bar.window[0] + this.bar.window[1]) / 2;
      this.bar.press();
    }
    return this.completed;
  }

  report() {
    return {
      active: this.bar.active,
      completed: this.completed,
      hits: this.bar.hits,
      total: this.bar.total,
      attempts: this.attempts,
      misses: this.misses,
      accuracy: this.attempts ? (this.attempts - this.misses) / this.attempts : 1,
      view: this.bar.view,
    };
  }
}

const LUXURY_MESSAGES = Object.freeze([
  Object.freeze({ from: 'Margo', at: '8:12 PM', text: 'An answering machine in a smart apartment. You are impossible.' }),
  Object.freeze({ from: 'Building desk', at: '8:47 PM', text: 'The private elevator inspection cleared. Your key remains active.' }),
]);

/** Standalone message playback: flavor only, with no campaign mutation. */
export class LuxuryAnsweringMachineRuntime {
  constructor({ world, hud, audio, messages = LUXURY_MESSAGES } = {}) {
    this.world = world;
    this.hud = hud;
    this.audio = audio;
    this.messages = [...messages];
    this.playing = false;
    this.heard = false;
    this.waiting = this.messages.length;
    this.index = 0;
    this.lineTime = 0;
    world?.setMessagesWaiting?.(this.waiting);
  }

  _showCurrent() {
    const message = this.messages[this.index];
    if (!message) return this.finish();
    this.lineTime = Math.max(2.4, Math.min(5.2, message.text.length * 0.047));
    this.hud?.say?.(`<em>${message.from} · ${message.at}</em><br>${message.text}`, Math.round(this.lineTime * 1000));
    this.audio?.play?.('ui.select', { volume: 0.34 });
    return message;
  }

  toggle(next = !this.playing) {
    if (!next) return this.stop();
    if (this.playing) return true;
    if (this.heard) {
      this.hud?.say?.('No new messages.', 2200);
      return false;
    }
    this.playing = true;
    this.world.state.answeringMachinePlaying = true;
    this.index = 0;
    this.waiting = 0;
    this.world?.setMessagesWaiting?.(0);
    this._showCurrent();
    return true;
  }

  stop() {
    if (!this.playing) return false;
    this.playing = false;
    this.world.state.answeringMachinePlaying = false;
    return true;
  }

  advance() {
    if (!this.playing) return false;
    this.index += 1;
    if (this.index >= this.messages.length) return this.finish();
    this._showCurrent();
    return true;
  }

  finish() {
    this.playing = false;
    this.heard = true;
    this.world.state.answeringMachinePlaying = false;
    this.hud?.toast?.('Messages heard', 'good');
    return true;
  }

  update(dt) {
    if (!this.playing) return;
    this.lineTime -= dt;
    if (this.lineTime <= 0) this.advance();
  }

  reset() {
    this.playing = false;
    this.heard = false;
    this.waiting = this.messages.length;
    this.index = 0;
    this.world.state.answeringMachinePlaying = false;
    this.world?.setMessagesWaiting?.(this.waiting);
  }

  report() {
    return {
      playing: this.playing,
      heard: this.heard,
      waiting: this.waiting,
      index: this.index,
      transcript: this.messages.map((message) => ({ ...message })),
    };
  }
}

/** Pick-up, held model, firing, impacts, and reloads for the apartment gun. */
export class LuxuryRevolverRuntime {
  constructor({ scene, camera, world, inventoryRuntime, inventory, hud, audio, state = {} } = {}) {
    if (!scene || !camera || !world || !inventoryRuntime || !inventory || !hud) {
      throw new TypeError('LuxuryRevolverRuntime requires scene, camera, world, inventoryRuntime, inventory, and hud');
    }
    this.camera = camera;
    this.world = world;
    this.inventoryRuntime = inventoryRuntime;
    this.inventory = inventory;
    this.hud = hud;
    this.audio = audio;
    this.state = state;
    this.state.rounds ??= 6;
    this.state.spareRounds ??= 0;
    this.kick = 0;
    this.shots = 0;
    this.hits = 0;
    this.ray = new THREE.Raycaster();
    this.aim = new THREE.Vector2();
    this.muzzleWorld = new THREE.Vector3();
    this.bullets = new BulletHoles(scene, 'hole', { capacity: 24 });
    this.held = makeRevolver(makeMaterials(), { x: 0, y: 0, z: 0, rotY: 0 });
    this.held.group.position.set(0.20, -0.24, -0.30);
    this.held.group.rotation.set(0.06, -0.16, 0);
    this.held.group.scale.setScalar(1.15);
    this.held.group.visible = false;
    camera.add(this.held.group);

    const priorChange = inventory.onChange;
    inventory.onChange = (next) => {
      priorChange?.(next);
      this.sync(next);
    };
    this.sync(inventory);
  }

  pickup() {
    if (!this.inventoryRuntime.give('gun')) return false;
    this.state.revolverTaken = true;
    this.audio?.play?.('gun.pickup', { volume: 0.58 });
    this.sync();
    this.hud.toast('Took the revolver', 'good');
    return true;
  }

  takeAmmo(count = 12) {
    const rounds = Math.max(0, Number(count) | 0);
    if (!rounds) return false;
    this.state.spareRounds += rounds;
    this.state.ammoTaken = true;
    this.audio?.play?.('ammo.take', { volume: 0.52 });
    this.sync();
    this.hud.toast(`Picked up ${rounds} rounds`, 'good');
    return true;
  }

  fire({ spread = 0.085, random = Math.random } = {}) {
    if (this.inventory.held !== 'gun') return false;
    if (this.state.rounds <= 0) {
      this.audio?.play?.('gun.dry', { volume: 0.60 });
      this.hud.toast('Empty cylinder', 'bad');
      this.sync();
      return { fired: false, empty: true, ...this.report() };
    }

    this.state.rounds -= 1;
    this.shots += 1;
    this.kick = 0.34;
    this.audio?.play?.('gun.shot', { volume: 1.0 });
    this.held.group.getWorldPosition(this.muzzleWorld);
    this.bullets.muzzle(this.muzzleWorld);
    this.aim.set((random() - 0.5) * spread, (random() - 0.5) * spread);
    this.ray.setFromCamera(this.aim, this.camera);
    this.ray.far = 40;
    const hit = this.ray.intersectObject(this.world.root, true)
      .find((candidate) => candidate.face && candidate.object.visible);
    if (hit) {
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      this.bullets.punch(hit.point, normal);
      this.hits += 1;
      this.audio?.play?.('gun.impact', {
        volume: 0.68,
        position: hit.point,
        delay: Math.min(0.12, hit.distance / 340),
      });
    }
    this.sync();
    return { fired: true, hit: Boolean(hit), ...this.report() };
  }

  reload() {
    if (this.inventory.held !== 'gun') return false;
    const room = 6 - this.state.rounds;
    if (room <= 0) {
      this.hud.toast('Already full');
      return false;
    }
    const loaded = Math.min(room, this.state.spareRounds);
    if (!loaded) {
      this.audio?.play?.('gun.dry', { volume: 0.45 });
      this.hud.toast('Nothing to load it with', 'bad');
      return false;
    }
    this.state.rounds += loaded;
    this.state.spareRounds -= loaded;
    this.audio?.play?.('gun.reload', { volume: 0.70 });
    this.hud.toast(`Loaded ${loaded} · ${this.state.spareRounds} spare`, 'good');
    this.sync();
    return loaded;
  }

  setAmmo(rounds = this.state.rounds, spareRounds = this.state.spareRounds) {
    this.state.rounds = THREE.MathUtils.clamp(Number(rounds) | 0, 0, 6);
    this.state.spareRounds = Math.max(0, Number(spareRounds) | 0);
    this.sync();
    return this.report();
  }

  sync(inventory = this.inventory) {
    const held = inventory.held === 'gun';
    this.held.group.visible = held;
    if (held) {
      const spare = this.state.spareRounds;
      this.hud.setHand({
        ...ITEMS.gun,
        name: `The revolver (${this.state.rounds}/6${spare ? ` · ${spare} spare` : ''})`,
        hint: this.state.rounds || spare ? ITEMS.gun.hint : 'Empty. Find more rounds.',
      });
    }
  }

  update(dt) {
    this.bullets.update(dt);
    if (this.kick > 0) this.kick = Math.max(0, this.kick - dt * 2.6);
    this.held.group.rotation.x = 0.06 + this.kick;
    this.held.group.position.z = -0.30 + this.kick * 0.10;
    this.held.group.visible = this.inventory.held === 'gun';
  }

  report() {
    return {
      owned: this.inventory.has('gun'),
      held: this.inventory.held === 'gun',
      rounds: this.state.rounds,
      spareRounds: this.state.spareRounds,
      shots: this.shots,
      hits: this.hits,
    };
  }
}

const DART_FORWARD = new THREE.Vector3(0, 0, -1);
const DART_WEDGES = Object.freeze([20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]);

function makePhysicalDart(name = 'luxury-physical-dart') {
  const root = new THREE.Group();
  root.name = name;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.28, metalness: 0.78 });
  const barrel = new THREE.MeshStandardMaterial({ color: 0x3b4249, roughness: 0.42, metalness: 0.45 });
  const flight = new THREE.MeshStandardMaterial({ color: 0xb93d4c, roughness: 0.62, side: THREE.DoubleSide });
  const point = new THREE.Mesh(new THREE.ConeGeometry(0.010, 0.075, 8), steel);
  point.rotation.x = -Math.PI / 2;
  point.position.z = -0.155;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.20, 8), steel);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.02;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.013, 0.08, 10), barrel);
  grip.rotation.x = Math.PI / 2;
  grip.position.z = -0.055;
  const finA = new THREE.Mesh(new THREE.PlaneGeometry(0.060, 0.075), flight);
  finA.position.z = 0.105;
  finA.rotation.y = Math.PI / 2;
  const finB = finA.clone();
  finB.rotation.y = 0;
  root.add(point, shaft, grip, finA, finB);
  root.userData.tipOffset = 0.192;
  return root;
}

/** Physical 301. Core owns generic charge/flight/collision; this owns darts scoring and presentation. */
export class LuxuryDarts {
  constructor({ hud, audio, panel, scene = null, camera = null, station = null } = {}) {
    this.hud = hud;
    this.audio = audio;
    this.panel = panel;
    this.scene = scene;
    this.camera = camera;
    this.station = station?.board ?? station ?? {};
    this.board = {
      mesh: this.station.board ?? null,
      impactRoot: this.station.impactRoot ?? scene,
      center: this.station.center?.clone?.() ?? new THREE.Vector3(0, 1.72, 0),
      normal: this.station.normal?.clone?.().normalize() ?? new THREE.Vector3(0, 0, 1),
      right: this.station.right?.clone?.().normalize() ?? new THREE.Vector3(1, 0, 0),
      up: this.station.up?.clone?.().normalize() ?? new THREE.Vector3(0, 1, 0),
      radius: Number(this.station.radius) || 0.43,
    };
    this.charge = new ThrowCharge({ minPower: 7.5, maxPower: 16.5, chargeSeconds: 1.05 });
    this.gravity = new THREE.Vector3(0, -5.4, 0);
    this.active = false;
    this.remaining = 301;
    this.turnStart = 301;
    this.dart = 0;
    this.throws = 0;
    this.last = 'Three darts. Hold, aim, and release.';
    this.lastImpact = null;
    this.inFlight = null;
    this.projectiles = [];
    this.flash = 0;
    this.boardBaseEmissive = this.board.mesh?.material?.emissive?.clone?.() ?? new THREE.Color(0x000000);
    this.held = makePhysicalDart('luxury-held-dart');
    this.held.position.set(0.19, -0.15, -0.43);
    this.held.rotation.set(-0.08, 0.10, -0.22);
    this.held.visible = false;
    this.camera?.add?.(this.held);
  }

  enter() {
    this.active = true;
    this.turnStart = this.remaining;
    this.dart = 0;
    this.held.visible = this.remaining > 0;
    this.repaint();
    return true;
  }

  leave() {
    this.active = false;
    this.charge.cancel();
    this.held.visible = false;
    if (this.inFlight) {
      this.inFlight.body.stop();
      this.inFlight.mesh.removeFromParent();
      this.inFlight = null;
    }
    paintLuxuryGamePanel(this.panel, { visible: false });
    return true;
  }

  reset() {
    this.remaining = 301;
    this.turnStart = 301;
    this.dart = 0;
    this.throws = 0;
    this.lastImpact = null;
    this.last = 'Fresh leg. Hold, aim, and release.';
    this.charge.cancel();
    this.inFlight = null;
    for (const record of this.projectiles) record.mesh.removeFromParent();
    this.projectiles.length = 0;
    this.held.visible = this.active;
    this.repaint();
    return true;
  }

  beginCharge() {
    if (!this.active || this.remaining === 0 || this.inFlight) return false;
    const began = this.charge.begin();
    if (began) {
      this.held.visible = true;
      this.last = 'Charging throw…';
      this.repaint();
    }
    return began;
  }

  _aim(options = {}) {
    const direction = options.direction?.clone?.() ?? new THREE.Vector3();
    const origin = options.origin?.clone?.() ?? new THREE.Vector3();
    if (!options.direction && this.camera?.getWorldDirection) this.camera.getWorldDirection(direction);
    if (!options.origin && this.camera?.getWorldPosition) this.camera.getWorldPosition(origin);
    if (direction.lengthSq() <= 1e-8) {
      origin.copy(this.board.center).addScaledVector(this.board.normal, 2.55);
      direction.copy(this.board.center).sub(origin).normalize();
    }
    if (!options.origin) origin.addScaledVector(direction, 0.26);
    return { origin, direction: direction.normalize() };
  }

  release(options = {}) {
    if (!this.active || this.inFlight) return null;
    const charged = this.charge.release();
    if (!charged) return null;
    if (this.dart === 0) this.turnStart = this.remaining;
    const { origin, direction } = this._aim(options);
    const power = Number.isFinite(options.power) ? options.power : charged.power;
    const velocity = options.velocity?.clone?.()
      ?? composeThrowVelocity(direction, power, { upwardBias: 0.025 });
    const body = new BallisticProjectile({
      gravity: this.gravity,
      radius: 0.006,
      maxLifetime: 3,
      maxStep: 1 / 180,
    }).launch(origin, velocity);
    const mesh = makePhysicalDart(`luxury-thrown-dart-${this.throws + 1}`);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(DART_FORWARD, velocity.clone().normalize());
    (this.scene ?? this.board.impactRoot)?.add?.(mesh);
    const record = { body, mesh, score: null };
    this.projectiles.push(record);
    this.inFlight = record;
    this.dart += 1;
    this.throws += 1;
    this.held.visible = false;
    this.last = `Dart ${this.dart} in flight…`;
    this.repaint();
    return { launched: true, charge: charged, power, origin: origin.clone(), velocity: velocity.clone() };
  }

  /** Deterministic convenience for verification; it still runs the real ballistic body. */
  throwDart(options = {}) {
    const config = typeof options === 'number' ? { chargeSeconds: options } : options;
    if (!this.beginCharge()) return null;
    this.charge.update(Number.isFinite(config.chargeSeconds) ? config.chargeSeconds : 0.55);
    return this.release(config);
  }

  throwAtBoard({ x = 0, y = 0, power = 12, origin = null } = {}) {
    const target = this.board.center.clone()
      .addScaledVector(this.board.right, x)
      .addScaledVector(this.board.up, y);
    const start = origin?.clone?.() ?? target.clone().addScaledVector(this.board.normal, 2.55);
    const distance = start.distanceTo(target);
    const time = Math.max(0.12, distance / Math.max(1, power));
    const velocity = target.clone().sub(start).addScaledVector(this.gravity, -0.5 * time * time).divideScalar(time);
    return this.throwDart({ origin: start, direction: target.clone().sub(start), velocity, power, chargeSeconds: 0.55 });
  }

  scoreImpact(point) {
    const offset = point.clone().sub(this.board.center);
    const horizontal = offset.dot(this.board.right);
    const vertical = offset.dot(this.board.up);
    const radial = Math.hypot(horizontal, vertical);
    if (radial > this.board.radius) return { score: 0, label: 'MISS', multiplier: 0, radial };
    const normalized = radial / this.board.radius;
    if (normalized <= 0.045) return { score: 50, label: 'BULL', multiplier: 2, radial };
    if (normalized <= 0.095) return { score: 25, label: '25', multiplier: 1, radial };
    const angle = (Math.atan2(horizontal, vertical) + Math.PI * 2) % (Math.PI * 2);
    const wedgeIndex = Math.round(angle / (Math.PI * 2 / DART_WEDGES.length)) % DART_WEDGES.length;
    const wedge = DART_WEDGES[wedgeIndex];
    const multiplier = normalized >= 0.90 ? 2 : normalized >= 0.53 && normalized <= 0.63 ? 3 : 1;
    const score = wedge * multiplier;
    return {
      score,
      wedge,
      multiplier,
      label: `${multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : ''}${wedge}`,
      radial,
    };
  }

  _applyScore(result) {
    const next = this.remaining - result.score;
    if (result.score > 0 && next === 0 && (result.multiplier === 2 || result.score === 50)) {
      this.remaining = 0;
      this.last = `${result.label}. Leg won in ${this.throws} darts.`;
      this.hud?.toast?.('Darts leg won', 'good');
      return { ...result, won: true, remaining: 0 };
    }
    if (result.score > 0 && next <= 1) {
      this.remaining = this.turnStart;
      this.last = `${result.label}. Bust — back to ${this.remaining}.`;
      this.dart = 0;
      return { ...result, bust: true, remaining: this.remaining };
    }
    this.remaining = next;
    this.last = result.score ? `${result.label} · ${result.score} scored` : 'Missed the board';
    if (this.dart >= 3) {
      this.dart = 0;
      this.last += ` · ${this.remaining} left`;
    }
    return { ...result, remaining: this.remaining };
  }

  _impact(record, impact) {
    const boardHit = impact.target === 'dartboard';
    const scored = boardHit ? this.scoreImpact(impact.contactPoint) : {
      score: 0,
      label: 'MISS',
      multiplier: 0,
      radial: Infinity,
    };
    record.mesh.position.copy(impact.contactPoint).addScaledVector(impact.normal, 0.006);
    record.mesh.quaternion.setFromUnitVectors(DART_FORWARD, impact.velocity.clone().normalize());
    record.score = this._applyScore(scored);
    this.lastImpact = Object.freeze({
      ...record.score,
      point: impact.contactPoint.clone(),
      velocity: impact.velocity.clone(),
      age: impact.age,
      target: impact.target,
    });
    this.audio?.play?.('card.flip', { volume: boardHit ? 0.52 : 0.30, position: impact.contactPoint });
    if (record.score.score >= 25) this.audio?.play?.('ui.select', { volume: 0.28 });
    this.flash = boardHit ? 0.18 : 0;
    this.inFlight = null;
    this.held.visible = this.active && this.remaining > 0;
    this.repaint();
    return this.lastImpact;
  }

  update(dt) {
    if (this.charge.active) {
      this.charge.update(dt);
      this.last = `Power ${Math.round(this.charge.amount * 100)}% · release to throw`;
      this.repaint();
    }
    if (this.inFlight) {
      const boardCollider = ({ from, to, radius }) => segmentPlaneImpact({
        from,
        to,
        radius,
        planePoint: this.board.center,
        planeNormal: this.board.normal,
        maxRadius: this.board.radius,
        target: 'dartboard',
        oneSided: true,
      });
      const backingCollider = ({ from, to, radius }) => segmentPlaneImpact({
        from,
        to,
        radius,
        planePoint: this.board.center,
        planeNormal: this.board.normal,
        maxRadius: this.board.radius * 1.28,
        target: 'backing',
        oneSided: true,
      });
      const floorCollider = ({ from, to, radius }) => segmentPlaneImpact({
        from,
        to,
        radius,
        planePoint: new THREE.Vector3(0, 0.02, 0),
        planeNormal: new THREE.Vector3(0, 1, 0),
        target: 'floor',
        oneSided: true,
      });
      const receipt = this.inFlight.body.update(dt, [boardCollider, backingCollider, floorCollider]);
      this.inFlight.mesh.position.copy(this.inFlight.body.position);
      if (this.inFlight.body.velocity.lengthSq() > 1e-8) {
        this.inFlight.mesh.quaternion.setFromUnitVectors(
          DART_FORWARD,
          this.inFlight.body.velocity.clone().normalize(),
        );
      }
      if (receipt.impact) this._impact(this.inFlight, receipt.impact);
      else if (receipt.expired) {
        const missed = this.inFlight;
        this.inFlight = null;
        missed.mesh.removeFromParent();
        this.lastImpact = this._applyScore({ score: 0, label: 'MISS', multiplier: 0, radial: Infinity });
        this.held.visible = this.active;
        this.repaint();
      }
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - Math.max(0, Number(dt) || 0));
      if (this.board.mesh?.material?.emissive) {
        this.board.mesh.material.emissive.set(this.flash > 0 ? 0x7a321e : this.boardBaseEmissive);
        this.board.mesh.material.emissiveIntensity = this.flash > 0 ? 0.9 : 0;
      }
    }
  }

  report() {
    return {
      active: this.active,
      charging: this.charge.active,
      charge: this.charge.amount,
      inFlight: Boolean(this.inFlight),
      remaining: this.remaining,
      dart: this.dart,
      throws: this.throws,
      impacts: this.projectiles.filter(({ score }) => score).length,
      lastImpact: this.lastImpact,
    };
  }

  repaint() {
    paintLuxuryGamePanel(this.panel, {
      visible: this.active,
      title: 'DARTS · 301',
      primary: this.remaining === 0 ? 'LEG WON' : `${this.remaining}`,
      secondary: this.last,
      hint: this.remaining === 0
        ? '[R] new leg · [Q] step away'
        : '[E/Mouse] hold + aim, release to throw · [R] reset · [Q] step away',
    });
  }
}

const USE = Object.freeze({
  beer: Object.freeze({ seconds: 2.0, label: 'Drinking…' }),
  whiskey: Object.freeze({ seconds: 1.7, label: 'Taking a pull…' }),
  cigs: Object.freeze({ seconds: 2.4, label: 'Smoking…' }),
  slice: Object.freeze({ seconds: 2.1, label: 'Eating…' }),
});

/** Shared apartment inventory vocabulary and held models, scoped to this hub. */
export class LuxuryInventoryRuntime {
  constructor({ camera, inventory, hud, audio, phone, phoneProp = null, state = {} } = {}) {
    if (!camera || !inventory || !hud || !phone) {
      throw new TypeError('LuxuryInventoryRuntime requires camera, inventory, hud, and phone');
    }
    this.camera = camera;
    this.inventory = inventory;
    this.hud = hud;
    this.audio = audio;
    this.phone = phone;
    this.phoneProp = phoneProp;
    this.state = state;
    this.elapsed = 0;
    this.useTime = 0;
    this.useItem = null;
    this.consumeLatch = false;
    this.counts = { whiskey: 4, cigs: 6 };

    const materials = makeMaterials();
    this.heldPhone = makePhone(materials, { x: 0, y: 0, z: 0, w: 0.072 });
    this.heldPhone.group.position.set(0.07, -0.10, -0.32);
    this.heldPhone.group.rotation.set(1.20, -0.10, 0.03);
    this.heldPhone.group.scale.setScalar(1.58);
    this.heldPhone.group.visible = false;
    this.phoneTexture = new THREE.CanvasTexture(phone.canvas);
    this.phoneTexture.colorSpace = THREE.SRGBColorSpace;
    this.heldPhone.screen.material = new THREE.MeshBasicMaterial({
      map: this.phoneTexture,
      toneMapped: false,
    });

    this.heldDrinks = makeHeldDrinks(materials);
    this.heldDrinks.group.position.set(0.26, -0.30, -0.42);
    this.heldSlice = makeHeldSlice();
    this.heldSlice.group.position.set(0.235, -0.235, -0.36);
    this.heldSlice.group.rotation.set(0.16, 0, -0.20);
    this.heldSlice.group.visible = false;
    this.heldCig = makeHeldCigarette();
    this.heldCig.group.position.set(0.055, -0.062, -0.10);
    this.heldCig.group.rotation.set(0.06, 0.13, 0);
    this.heldCig.group.scale.setScalar(1.25);
    this.heldCig.group.visible = false;
    camera.add(
      this.heldPhone.group,
      this.heldDrinks.group,
      this.heldSlice.group,
      this.heldCig.group,
    );

    const priorChange = inventory.onChange;
    inventory.onChange = (next) => {
      priorChange?.(next);
      this.sync(next);
    };
    this.sync(inventory);
  }

  seed() {
    for (const id of ['phone', 'cigs', 'whiskey']) {
      if (!this.inventory.has(id) && !this.inventory.full) this.inventory.add(id);
    }
    const empty = this.inventory.items.indexOf(null);
    if (empty >= 0) this.inventory.select(empty);
    this.sync(this.inventory);
  }

  setPhoneProp(phoneProp) {
    this.phoneProp = phoneProp;
    this.sync(this.inventory);
  }

  give(id) {
    if (this.inventory.has(id)) {
      const slot = this.inventory.items.indexOf(id);
      if (slot >= 0) this.inventory.select(slot);
      return true;
    }
    if (this.inventory.full) {
      this.hud.toast('No free pocket');
      return false;
    }
    return this.inventory.add(id);
  }

  status(id) {
    const count = Math.max(0, Number(this.counts[id]) || 0);
    const max = id === 'cigs' ? 12 : Infinity;
    return Object.freeze({
      id,
      owned: this.inventory.has(id),
      count,
      max,
      full: this.inventory.has(id) && count >= max,
    });
  }

  replenish(id, { amount = 1, max = id === 'cigs' ? 12 : Infinity } = {}) {
    const prior = Math.max(0, Number(this.counts[id]) || 0);
    if (!this.inventory.has(id) && !this.give(id)) {
      const result = Object.freeze({ ...this.status(id), added: 0, reason: 'inventory-full' });
      this.hud.toast('No free pocket for the pack');
      return result;
    }
    const next = Math.min(Math.max(0, Number(max) || Infinity), prior + Math.max(0, Number(amount) || 0));
    this.counts[id] = next;
    const added = next - prior;
    if (id === 'cigs') {
      this.audio?.play?.('zyn.pack', { volume: added ? 0.42 : 0.25 });
      this.hud.toast(added ? `Smokes replenished · ${next}` : 'You already have a full pack', added ? 'good' : undefined);
    }
    this.sync(this.inventory);
    return Object.freeze({ ...this.status(id), added, reason: added ? 'replenished' : 'already-full' });
  }

  takePhone() {
    if (!this.give('phone')) return false;
    this.state.phoneTaken = true;
    this.sync(this.inventory);
    this.audio?.play('phone.pickup', { volume: 0.36 });
    return true;
  }

  pocket() {
    const held = this.inventory.held;
    if (!held) return false;
    if (held === 'phone') this.phone.screen = 'home';
    const empty = this.inventory.items.indexOf(null);
    if (empty < 0) {
      this.hud.toast('No empty pocket to free your hand');
      return false;
    }
    this.inventory.select(empty);
    this.hud.toast(`${ITEMS[held]?.name ?? 'Item'} pocketed`);
    return true;
  }

  sync(inventory = this.inventory) {
    this.hud.setInventory(inventory, ITEMS);
    const held = inventory.held;
    this.heldPhone.group.visible = held === 'phone';
    poseHeldDrink(this.heldDrinks, held === 'beer' ? 'can' : held === 'whiskey' ? 'bottle' : null, 0);
    this.heldSlice.group.visible = held === 'slice';
    if (held !== 'cigs' || this.useTime <= 0) this.heldCig.group.visible = false;
    if (this.phoneProp?.group) this.phoneProp.group.visible = !inventory.has('phone');
    else if (this.phoneProp) this.phoneProp.visible = !inventory.has('phone');

    let item = held ? ITEMS[held] : null;
    if (held === 'cigs') item = { ...item, name: `Smokes (${this.counts.cigs})` };
    if (held === 'whiskey') item = { ...item, name: `Jack & Daniel's (${this.counts.whiskey})` };
    this.hud.setHand(item);
  }

  resetUse() {
    this.useTime = 0;
    this.useItem = null;
    this.hud.setHold(null);
    this.heldCig.group.visible = false;
    this.poseSlice(0);
    this.sync(this.inventory);
  }

  poseSlice(progress) {
    const eased = smoothstep(progress);
    this.heldSlice.group.position.set(
      0.235 - 0.150 * eased,
      -0.235 + 0.185 * eased,
      -0.36 + 0.10 * eased,
    );
    this.heldSlice.group.rotation.set(
      0.16 + 0.70 * eased,
      -0.30 * eased,
      -0.20 - 0.24 * eased,
    );
  }

  finish(item) {
    const slot = this.inventory.selected;
    this.consumeLatch = true;
    this.useTime = 0;
    this.useItem = null;
    this.hud.setHold(null);
    this.hud.hidePrompt();
    this.heldCig.group.visible = false;
    this.poseSlice(0);

    if (item === 'beer') {
      this.inventory.removeAt(slot, 'beer');
      this.state.beersDrunk = (this.state.beersDrunk ?? 0) + 1;
      this.audio?.play('can.sip', { volume: 0.45 });
      this.audio?.play('can.crush', { volume: 0.40, delay: 0.24 });
      this.hud.toast('Finished a cold beer', 'good');
    } else if (item === 'whiskey') {
      this.counts.whiskey = Math.max(0, this.counts.whiskey - 1);
      this.state.whiskeyDrunk = (this.state.whiskeyDrunk ?? 0) + 1;
      this.audio?.play('whiskey.swig', { volume: 0.52 });
      this.audio?.play('whiskey.gasp', { volume: 0.46, delay: 0.28 });
      if (this.counts.whiskey === 0) this.inventory.removeAt(slot, 'whiskey');
      else this.sync(this.inventory);
      this.hud.toast(this.counts.whiskey ? 'One pull' : 'Bottle empty');
    } else if (item === 'cigs') {
      this.counts.cigs = Math.max(0, this.counts.cigs - 1);
      this.state.cigarettesSmoked = (this.state.cigarettesSmoked ?? 0) + 1;
      this.audio?.play('cig.exhale', { volume: 0.55 });
      this.audio?.play('cig.stub', { volume: 0.36, delay: 0.65 });
      if (this.counts.cigs === 0) this.inventory.removeAt(slot, 'cigs');
      else this.sync(this.inventory);
      this.hud.toast(this.counts.cigs ? 'Smoke break' : 'Pack empty');
    } else if (item === 'slice') {
      this.state.fed = true;
      this.inventory.removeAt(slot, 'slice');
      this.audio?.play('egg.eat', { volume: 0.45 });
      this.hud.toast('Ate the kitchen slice', 'good');
    }
  }

  update(dt, { active = true, holding = false, elapsed = 0 } = {}) {
    this.elapsed = elapsed;
    this.phoneTexture.needsUpdate = this.heldPhone.group.visible;
    const item = this.inventory.held;
    const spec = USE[item];

    if (!active || !holding) {
      this.consumeLatch = false;
      if (this.useItem) this.resetUse();
      return;
    }
    if (!spec || this.consumeLatch) return;

    if (this.useItem !== item) {
      if (this.useItem) this.resetUse();
      this.useItem = item;
      if (item === 'beer') this.audio?.play('can.crack', { volume: 0.60 });
      else if (item === 'whiskey') this.audio?.play('whiskey.pour', { volume: 0.55 });
      else if (item === 'cigs') this.audio?.play('cig.light', { volume: 0.56 });
    }

    this.useTime += dt;
    const progress = Math.min(1, this.useTime / spec.seconds);
    this.hud.showPrompt(spec.label, 'F');
    this.hud.setHold(progress);
    if (item === 'beer') poseHeldDrink(this.heldDrinks, 'can', progress);
    else if (item === 'whiskey') poseHeldDrink(this.heldDrinks, 'bottle', progress);
    else if (item === 'slice') this.poseSlice(progress);
    else if (item === 'cigs') {
      this.heldCig.group.visible = progress > 0.12;
      this.heldCig.ember.material.emissiveIntensity = 2.2 + Math.sin(elapsed * 20) * 0.55;
    }
    if (progress >= 1) this.finish(item);
  }
}
