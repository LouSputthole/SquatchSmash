import * as THREE from 'three';

export const FIRST_PERSON_BODY_LAYER = 1;
export const PLAYER_APPEARANCE_STORAGE_KEY = 'squatchsmash.player-appearance.v1';
export const DEFAULT_PLAYER_OUTFIT = 'charcoal_suit';

function safeOutfitId(value, fallback = DEFAULT_PLAYER_OUTFIT) {
  if (typeof value !== 'string') return fallback;
  const id = value.trim();
  return id && id.length <= 80 && /^[a-z0-9][a-z0-9._-]*$/i.test(id) ? id : fallback;
}

/**
 * The player's chosen clothes outlive a page, without growing the campaign's
 * story schema for presentation-only state. A scene maps the stable outfit id
 * onto its own authored model literal when it builds the reflection body.
 */
export function createPlayerAppearanceStore({
  storage,
  key = PLAYER_APPEARANCE_STORAGE_KEY,
  fallback = DEFAULT_PLAYER_OUTFIT,
} = {}) {
  const defaultId = safeOutfitId(fallback);
  /* Merely reading `globalThis.localStorage` can throw in privacy-restricted
   * frames. Resolve it under the same guard as getItem/setItem so a mirror is
   * never what prevents a scene from booting. An explicitly supplied null is
   * still respected by tests and non-persistent previews. */
  let resolvedStorage = storage;
  if (storage === undefined) {
    try { resolvedStorage = globalThis.localStorage ?? null; } catch { resolvedStorage = null; }
  }
  const read = () => {
    try {
      const raw = resolvedStorage?.getItem?.(key);
      if (!raw) return defaultId;
      const parsed = JSON.parse(raw);
      return safeOutfitId(parsed?.outfitId, defaultId);
    } catch {
      return defaultId;
    }
  };
  const write = (outfitId) => {
    const normalized = safeOutfitId(outfitId, defaultId);
    try {
      resolvedStorage?.setItem?.(key, JSON.stringify({ version: 1, outfitId: normalized }));
    } catch { /* A private/blocked storage still gets a working in-scene body. */ }
    return normalized;
  };
  return Object.freeze({ key, read, write });
}

const POSE_PARTS = Object.freeze([
  'body', 'head', 'legL', 'legR', 'shinL', 'shinR',
  'armL', 'armR', 'foreL', 'foreR',
]);

function bodyResult(value) {
  if (value?.isObject3D) return { group: value, parts: {} };
  if (value?.group?.isObject3D) return { group: value.group, parts: value };
  throw new TypeError('FirstPersonBody factory must return an Object3D or { group, ...parts }');
}

/**
 * One full player body for first-person scenes and their mirrors.
 *
 * The body lives on reflection layer 1 by default, so the ordinary camera does
 * not look down through its own head and chest. PlanarMirror already enables
 * that layer. Scenes provide their existing figure factory; this Module owns
 * visibility, pose, movement sync, outfit replacement, and held attachments.
 */
export class FirstPersonBody {
  constructor(scene, {
    factory,
    store = createPlayerAppearanceStore(),
    outfitId = null,
    reflectionLayer = FIRST_PERSON_BODY_LAYER,
    eyeHeight = 1.76,
    facingOffset = Math.PI,
  } = {}) {
    if (!scene?.isScene || typeof factory !== 'function') {
      throw new TypeError('FirstPersonBody requires a THREE.Scene and figure factory');
    }
    this.scene = scene;
    this.factory = factory;
    this.store = store;
    this.reflectionLayer = reflectionLayer;
    this.eyeHeight = eyeHeight;
    this.facingOffset = facingOffset;
    this.outfitId = safeOutfitId(outfitId ?? store.read());
    this.reflectionVisible = true;
    this.firstPersonVisible = false;
    this.weapon = null;
    this.weaponVisible = false;
    this.pose = null;
    this.walkTime = 0;
    this._mount(this.outfitId);
  }

  _mount(outfitId) {
    const built = bodyResult(this.factory(outfitId));
    this.group = built.group;
    this.parts = built.parts;
    this.group.userData.firstPersonBody = Object.freeze({
      schema: 'squatchsmash.first-person-body.v1',
      outfitId,
      reflectionLayer: this.reflectionLayer,
    });
    this.group.traverse((object) => {
      object.layers.set(this.reflectionLayer);
      if (object.isMesh) object.castShadow = false;
    });
    this.group.userData.geometryGate = {
      ...(this.group.userData.geometryGate ?? {}),
      assemblyId: 'player.reflection-body',
      checkSupport: false,
    };
    this.scene.add(this.group);
    this._captureRestPose();
    if (this.weapon) this._attachWeapon();
    /* Attachments must join the same reflection-only layer policy as the body.
     * Applying visibility after the socket move prevents a scene-owned weapon
     * from remaining on layer 0 and duplicating its ordinary view-model. */
    this._applyVisibility();
  }

  _captureRestPose() {
    this.rest = new Map();
    for (const key of POSE_PARTS) {
      const part = this.parts[key];
      if (!part?.isObject3D) continue;
      this.rest.set(key, {
        position: part.position.clone(),
        rotation: part.rotation.clone(),
      });
    }
  }

  _restorePose() {
    for (const [key, transform] of this.rest) {
      const part = this.parts[key];
      part.position.copy(transform.position);
      part.rotation.copy(transform.rotation);
    }
  }

  _applyPose(pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this._restorePose();
    if (pose === 'seated') {
      for (const leg of [this.parts.legL, this.parts.legR]) {
        if (leg) leg.rotation.x = -1.42;
      }
      for (const shin of [this.parts.shinL, this.parts.shinR]) {
        if (shin) shin.rotation.x = 1.36;
      }
      for (const arm of [this.parts.armL, this.parts.armR]) {
        if (arm) arm.rotation.x = -0.46;
      }
      for (const fore of [this.parts.foreL, this.parts.foreR]) {
        if (fore) fore.rotation.x = -0.58;
      }
    } else if (pose === 'bed') {
      if (this.parts.body) this.parts.body.rotation.x = -0.08;
      for (const arm of [this.parts.armL, this.parts.armR]) {
        if (arm) arm.rotation.z = arm === this.parts.armL ? -0.18 : 0.18;
      }
    }
  }

  _applyVisibility() {
    this.group.visible = this.reflectionVisible || this.firstPersonVisible;
    this.group.traverse((object) => {
      if (this.reflectionVisible) object.layers.enable(this.reflectionLayer);
      else object.layers.disable(this.reflectionLayer);
      if (this.firstPersonVisible) object.layers.enable(0);
      else object.layers.disable(0);
    });
  }

  setReflectionVisible(visible) {
    this.reflectionVisible = Boolean(visible);
    this._applyVisibility();
  }

  setFirstPersonVisible(visible) {
    this.firstPersonVisible = Boolean(visible);
    this._applyVisibility();
  }

  setOutfit(outfitId) {
    const next = safeOutfitId(outfitId, this.outfitId);
    if (next === this.outfitId) return false;
    this.outfitId = this.store.write(next);
    const previous = this.group;
    previous.removeFromParent();
    this._mount(this.outfitId);
    return true;
  }

  /** Attach a scene-owned weapon/model to the reflected right hand. */
  setWeapon(object = null, { visible = true } = {}) {
    this.weapon?.removeFromParent?.();
    this.weapon = object?.isObject3D ? object : null;
    this.weaponVisible = Boolean(this.weapon && visible);
    if (this.weapon) {
      this.weapon.visible = this.weaponVisible;
      this._attachWeapon();
      this._applyVisibility();
    }
  }

  _attachWeapon() {
    const socket = this.parts.handR ?? this.parts.foreR ?? this.group;
    socket.add(this.weapon);
  }

  setWeaponVisible(visible) {
    this.weaponVisible = Boolean(this.weapon && visible);
    if (this.weapon) this.weapon.visible = this.weaponVisible;
  }

  /**
   * Follow the canonical Player or another controller with position/yaw.
   * `groundY` is explicit for stairs and scripted poses; otherwise Player's
   * resolved ground is used, with eye-height fallback for small adapters.
   */
  update(dt, player, { groundY = null, pose = null, visible = true } = {}) {
    if (!player?.position && !player?.pos) return false;
    const position = player.position ?? player.pos;
    const yaw = Number.isFinite(player.yaw) ? player.yaw : 0;
    const mode = pose ?? (player.mode === 'seated' ? 'seated'
      : player.mode === 'bed' ? 'bed' : 'standing');
    this._applyPose(mode);

    const floor = Number.isFinite(groundY)
      ? groundY
      : Number.isFinite(player.ground) ? player.ground
        : position.y - (Number.isFinite(player.eyeHeight) ? player.eyeHeight : this.eyeHeight);
    const rigScale = Number.isFinite(this.parts.heightScale) ? this.parts.heightScale : 1;
    const poseDrop = mode === 'seated' ? 0.42 * rigScale : 0;
    this.group.position.set(position.x, floor - poseDrop, position.z);
    this.group.rotation.set(0, yaw + this.facingOffset, mode === 'bed' ? Math.PI / 2 : 0);
    this.group.visible = (this.reflectionVisible || this.firstPersonVisible) && visible;

    if (mode === 'standing') {
      const velocity = player.velocity ?? player.vel;
      const speed = velocity?.length?.() ?? 0;
      this.walkTime += Math.max(0, dt) * speed * 3.1;
      const gait = Math.sin(this.walkTime) * Math.min(0.7, speed * 0.22);
      if (this.parts.legL) this.parts.legL.rotation.x = this.rest.get('legL')?.rotation.x + gait;
      if (this.parts.legR) this.parts.legR.rotation.x = this.rest.get('legR')?.rotation.x - gait;
      if (this.parts.armL) this.parts.armL.rotation.x = this.rest.get('armL')?.rotation.x - gait * 0.55;
      if (this.parts.armR) this.parts.armR.rotation.x = this.rest.get('armR')?.rotation.x + gait * 0.55;
      if (this.parts.foreR) {
        this.parts.foreR.rotation.x = this.rest.get('foreR')?.rotation.x ?? 0;
      }
      /* A reflected firearm cannot stay glued to a relaxed hand at thigh
       * height. Use only joints the supplied figure exposes, retaining the
       * same rest-pose-relative contract as the gait and seated poses. */
      if (this.weaponVisible) {
        if (this.parts.armR) {
          this.parts.armR.rotation.x = (this.rest.get('armR')?.rotation.x ?? 0) - 1.08;
        }
        if (this.parts.foreR) {
          this.parts.foreR.rotation.x = (this.rest.get('foreR')?.rotation.x ?? 0) - 0.54;
        }
      }
    }
    return true;
  }

  dispose() {
    this.weapon?.removeFromParent?.();
    this.group?.removeFromParent?.();
  }
}
