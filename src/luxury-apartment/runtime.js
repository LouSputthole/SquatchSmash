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
    'frontDoor', 'elevator', 'bed', 'couch', 'desk', 'tv', 'radio', 'phone',
    'fridge', 'kitchen', 'shower', 'wardrobe', 'toilet',
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
  if (!world.inventory || !world.doors?.front || !world.doors?.elevator) {
    throw new Error('Luxury world must expose inventory and both public doors');
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

/**
 * The repository has no reusable darts minigame. This small 301 controller is
 * intentionally scene-local; the physical board and throw pose stay in the
 * world builder, while this class only owns scoring and HUD feedback.
 */
export class LuxuryDarts {
  constructor({ hud, audio, panel } = {}) {
    this.hud = hud;
    this.audio = audio;
    this.panel = panel;
    this.active = false;
    this.remaining = 301;
    this.turnStart = 301;
    this.dart = 0;
    this.throws = 0;
    this.last = 'Three darts. Double out if you want to be serious.';
  }

  enter() {
    this.active = true;
    this.turnStart = this.remaining;
    this.dart = 0;
    this.repaint();
  }

  leave() {
    this.active = false;
    paintLuxuryGamePanel(this.panel, { visible: false });
  }

  reset() {
    this.remaining = 301;
    this.turnStart = 301;
    this.dart = 0;
    this.throws = 0;
    this.last = 'Fresh leg. 301.';
    this.repaint();
  }

  throwDart(now = performance.now() / 1000) {
    if (!this.active) return null;
    if (this.remaining === 0) {
      this.repaint();
      return null;
    }
    if (this.dart === 0) this.turnStart = this.remaining;

    const phase = now * 5.73 + this.throws * 2.17;
    const accuracy = 1 - Math.abs(Math.sin(phase)) * 0.86;
    const wedges = [20, 19, 18, 17, 16, 15, 14, 13];
    const wedge = wedges[Math.abs(Math.floor(phase * 3.1)) % wedges.length];
    const multiplier = accuracy > 0.86 ? 3 : accuracy > 0.55 ? 2 : 1;
    const score = accuracy > 0.965 ? 50 : wedge * multiplier;
    const label = score === 50 ? 'BULL' : `${multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : ''}${wedge}`;
    const next = this.remaining - score;
    this.dart += 1;
    this.throws += 1;
    /* There is no darts bank; the existing card flip is a short, dry thwip. */
    this.audio?.play('card.flip', { volume: 0.42 });

    if (next === 0 && (multiplier === 2 || score === 50)) {
      this.remaining = 0;
      this.last = `${label}. Leg won in ${this.throws} darts.`;
      this.hud?.toast('Darts leg won', 'good');
      this.repaint();
      return { score, label, won: true, remaining: 0 };
    }
    if (next <= 1) {
      this.remaining = this.turnStart;
      this.last = `${label}. Bust — back to ${this.remaining}.`;
      this.dart = 0;
      this.repaint();
      return { score, label, bust: true, remaining: this.remaining };
    }

    this.remaining = next;
    this.last = `${label} · ${score} scored`;
    if (this.dart >= 3) {
      this.dart = 0;
      this.last += ` · ${this.remaining} left`;
    }
    this.repaint();
    return { score, label, remaining: this.remaining };
  }

  repaint() {
    paintLuxuryGamePanel(this.panel, {
      visible: this.active,
      title: 'DARTS · 301',
      primary: this.remaining === 0 ? 'LEG WON' : `${this.remaining}`,
      secondary: this.last,
      hint: this.remaining === 0 ? '[R] new leg · [Q] step away' : '[E] throw · [R] reset · [Q] step away',
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
