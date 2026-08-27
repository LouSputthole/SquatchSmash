import * as THREE from 'three';

import { PlanarMirror } from '../core/planar-mirror.js';
import {
  RADIO_HUD_AUDIBLE_DISTANCE,
  radioHudWithinRange,
} from '../core/radio.js';

export const CABIN_RADIO_AUDIBLE_DISTANCE = RADIO_HUD_AUDIBLE_DISTANCE;
export const CABIN_RANGE_RESULT_SECONDS = 4.5;
export const CABIN_RANGE_ACTIVITY_RADIUS = 8;
export const CABIN_CREEK_LISTEN_MOVE_METRES = 0.18;
export const CABIN_CREEK_LISTEN_INPUT_GRACE_SECONDS = 0.25;

const FINISH_CHAPTER = /finish(?: the)? cabin chapter/i;
const ANSWER_LOU = /answer lou(?:['\u2019]s)? call/i;

/**
 * Cabin-owned projection of the story plan.
 *
 * The story decides the durable phase. Presentation decides whether an
 * immediate instruction is yet true in the room: a call that has not started
 * ringing is anticipation, not an interactable objective.
 */
export function cabinObjectivePresentation(plan = {}, {
  phoneRinging = false,
  phoneConnected = false,
} = {}) {
  let label = String(plan.label || 'Lay low at the cabin');
  let step = String(plan.step || 'Keep your phone close');

  // Old restored saves can carry the former QA-facing fallback. Never expose
  // that internal chapter language as player copy.
  if (FINISH_CHAPTER.test(label)) label = 'Lay low at the cabin';
  if (FINISH_CHAPTER.test(step)) step = 'Keep your phone close';

  const expectsLou = ANSWER_LOU.test(label) || ANSWER_LOU.test(step);
  if (phoneConnected) {
    label = 'Hear Lou out';
    step = 'Stay on the line';
  } else if (phoneRinging) {
    label = 'Answer Lou\u2019s call';
    step = 'Pick up the phone';
  } else if (expectsLou) {
    label = 'Lay low at the cabin';
    step = 'Keep your phone close';
  }

  return Object.freeze({ label, step });
}

/** The active card belongs to the firing line, not the entire property. */
export function cabinRangeActivityContains(position, firingLine, radius = CABIN_RANGE_ACTIVITY_RADIUS) {
  if (!position || !firingLine) return false;
  const x = Number(position.x);
  const z = Number(position.z);
  const lineX = Number(firingLine.x);
  const z0 = Number(firingLine.z0);
  const z1 = Number(firingLine.z1);
  const r = Number(radius);
  if (![x, z, lineX, z0, z1, r].every(Number.isFinite) || r < 0) return false;
  const low = Math.min(z0, z1);
  const high = Math.max(z0, z1);
  const closestZ = THREE.MathUtils.clamp(z, low, high);
  return Math.hypot(x - lineX, z - closestZ) <= r;
}

/** A completed practice card is a receipt, not permanent mission HUD. */
export function cabinRangeHudPresentation(snapshot, {
  now = 0,
  completeUntil = 0,
} = {}) {
  if (!snapshot) return Object.freeze({ visible: false, score: '', best: '' });
  const active = snapshot.active === true;
  const visible = active || (snapshot.complete === true && now < completeUntil);
  const score = active
    ? `${snapshot.currentScore} PTS \u00b7 ${snapshot.shotsRemaining} SHOTS \u00b7 ${Number(snapshot.timeRemaining || 0).toFixed(1)}s`
    : `${snapshot.lastScore} PTS \u00b7 ${snapshot.hits} HITS`;
  return Object.freeze({
    visible,
    score,
    best: `BEST ${snapshot.bestScore}`,
  });
}

/** The station card follows the same physical reach as the audible receiver. */
export function cabinRadioHudVisible(listener, receiver, maxDistance = CABIN_RADIO_AUDIBLE_DISTANCE) {
  return radioHudWithinRange(listener, receiver, maxDistance);
}

/**
 * Optional creek focus mode. The positional creek is always audible nearby;
 * holding the landmark interaction temporarily raises it over the forest bed.
 * The scene forwards movement and post-activation input into this small policy
 * object so listening never becomes a modal trap.
 */
export function createCabinCreekListeningMode({
  audio,
  moveDistance = CABIN_CREEK_LISTEN_MOVE_METRES,
  inputGrace = CABIN_CREEK_LISTEN_INPUT_GRACE_SECONDS,
  onChange = null,
} = {}) {
  let active = false;
  let startedAt = -Infinity;
  const anchor = { x: 0, z: 0 };

  const applyMix = (focused) => {
    audio?.setLoopVolume?.('cabin.creek', focused ? 0.30 : 0.12, focused ? 0.55 : 0.45);
    audio?.setLoopVolume?.('cabin.forest', focused ? 0.055 : 0.21, focused ? 0.55 : 0.70);
    audio?.setLoopVolume?.('cabin.firepit', focused ? 0.05 : 0.15, 0.55);
  };
  const snapshot = () => Object.freeze({
    active,
    startedAt,
    anchor: Object.freeze({ ...anchor }),
  });
  const finish = (reason) => {
    if (!active) return null;
    active = false;
    applyMix(false);
    try { onChange?.(false, reason, snapshot()); } catch { /* audio policy is authoritative */ }
    return reason;
  };

  return Object.freeze({
    begin(position, now = 0) {
      if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.z))) {
        return false;
      }
      anchor.x = Number(position.x);
      anchor.z = Number(position.z);
      startedAt = Number.isFinite(Number(now)) ? Number(now) : 0;
      active = true;
      applyMix(true);
      try { onChange?.(true, 'begin', snapshot()); } catch { /* audio policy is authoritative */ }
      return true;
    },
    stop(reason = 'cancelled') { return finish(reason); },
    handleInput(now = 0) {
      const at = Number(now);
      if (!active || !Number.isFinite(at) || at - startedAt < inputGrace) return null;
      return finish('input');
    },
    update(position) {
      if (!active || !position) return null;
      const dx = Number(position.x) - anchor.x;
      const dz = Number(position.z) - anchor.z;
      if (![dx, dz].every(Number.isFinite) || Math.hypot(dx, dz) < moveDistance) return null;
      return finish('movement');
    },
    snapshot,
  });
}

/**
 * Reuse the shared mirror once per mounted surface and fail back to the
 * authored silver material. A reflection allocation must never abort Cabin
 * boot on a browser/adapter that cannot supply it.
 */
export function createCabinPlanarMirror(scene, mirrorMesh, options = {}, {
  MirrorClass = PlanarMirror,
  onError = null,
} = {}) {
  if (!scene?.isScene || !mirrorMesh?.isMesh) return null;
  const existing = mirrorMesh.userData?.cabinPlanarMirror;
  if (existing?.render) return existing;

  const fallbackMaterial = mirrorMesh.material;
  try {
    const mirror = new MirrorClass(scene, mirrorMesh, options);
    mirrorMesh.userData.cabinPlanarMirror = mirror;
    mirrorMesh.userData.planarMirrorFallback = false;
    return mirror;
  } catch (error) {
    mirrorMesh.material = fallbackMaterial;
    mirrorMesh.userData.planarMirrorFallback = true;
    try { onError?.(error); } catch { /* presentation reporting is optional */ }
    return null;
  }
}

function lerpedHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), THREE.MathUtils.clamp(t, 0, 1)).getHex();
}

/** Stable colour policy used by both the dome and the scene fog. */
export function cabinSkyPalette(time = {}) {
  const hour = Number(time.hour);
  const h = Number.isFinite(hour) ? hour : 12;
  const dark = time.isDark === true || h < 5.5 || h >= 20.5;
  if (dark) {
    return Object.freeze({ zenith: 0x101a27, horizon: 0x35453f, fog: 0x263730 });
  }

  // Warm the last two hours without turning the whole property back into the
  // former muddy green solid-colour sky.
  const dusk = THREE.MathUtils.clamp((h - 17.2) / 2.8, 0, 1);
  return Object.freeze({
    zenith: lerpedHex(0x79a9c6, 0x496a82, dusk),
    horizon: lerpedHex(0xd4ddc9, 0xd7a275, dusk),
    fog: lerpedHex(0x91a89b, 0x6d766b, dusk),
  });
}

/** A cheap camera-centred gradient with a visible sun and drifting cloud banks. */
export function createCabinSky(scene, { radius = 205 } = {}) {
  if (!scene?.isScene) return null;
  const uniforms = {
    uZenith: { value: new THREE.Color(0x79a9c6) },
    uHorizon: { value: new THREE.Color(0xd4ddc9) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      varying vec3 vDirection;
      void main() {
        float lift = smoothstep(-0.06, 0.72, max(-0.06, vDirection.y));
        gl_FragColor = vec4(mix(uHorizon, uZenith, lift), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 18), material);
  mesh.name = 'cabin-pleasant-sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.userData.geometryGate = {
    overlap: false,
    checkSupport: false,
    checkWallEmbed: false,
  };
  const root = new THREE.Group();
  root.name = 'cabin-sky-presentation';
  root.add(mesh);

  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xffedb5,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.017, 14, 10), sunMaterial);
  sun.name = 'cabin-sky-sun';
  sun.renderOrder = -999;
  sun.userData.geometryGate = { overlap: false, checkSupport: false, checkWallEmbed: false };
  root.add(sun);

  const cloudGeometry = new THREE.SphereGeometry(1, 10, 6);
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xf4f1dc,
    transparent: true,
    opacity: 0.20,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const clouds = new THREE.Group();
  clouds.name = 'cabin-sky-clouds';
  const banks = [
    [-0.62, 0.29, -0.55, 1.00],
    [-0.18, 0.39, -0.74, 0.72],
    [0.34, 0.31, -0.68, 0.92],
    [0.70, 0.22, -0.46, 0.66],
    [0.12, 0.20, 0.78, 0.82],
    [-0.48, 0.17, 0.72, 0.58],
  ];
  for (let bankIndex = 0; bankIndex < banks.length; bankIndex += 1) {
    const [x, y, z, scale] = banks[bankIndex];
    const bank = new THREE.Group();
    bank.name = `cabin-sky-cloud-bank-${bankIndex}`;
    bank.position.set(x * radius * 0.72, y * radius, z * radius * 0.72);
    for (let puff = 0; puff < 3; puff += 1) {
      const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
      cloud.position.set((puff - 1) * radius * 0.035, puff === 1 ? radius * 0.008 : 0, 0);
      cloud.scale.set(radius * 0.050 * scale, radius * 0.0085 * scale, radius * 0.020 * scale);
      cloud.renderOrder = -998;
      cloud.userData.geometryGate = { overlap: false, checkSupport: false, checkWallEmbed: false };
      bank.add(cloud);
    }
    clouds.add(bank);
  }
  root.add(clouds);
  scene.add(root);

  return Object.freeze({
    root,
    mesh,
    sun,
    clouds,
    update(time, cameraPosition = null) {
      const palette = cabinSkyPalette(time);
      uniforms.uZenith.value.setHex(palette.zenith);
      uniforms.uHorizon.value.setHex(palette.horizon);
      if (cameraPosition) root.position.copy(cameraPosition);
      const hour = Number.isFinite(Number(time?.hour)) ? Number(time.hour) : 12;
      const authoredSun = time?.sunPos;
      if (authoredSun?.isVector3 && authoredSun.lengthSq() > 0.0001) {
        sun.position.copy(authoredSun).normalize().multiplyScalar(radius * 0.78);
      } else {
        const angle = ((hour - 6) / 12) * Math.PI;
        sun.position.set(
          Math.cos(angle) * radius * 0.62,
          Math.max(0.06, Math.sin(angle)) * radius * 0.62,
          -radius * 0.48,
        ).normalize().multiplyScalar(radius * 0.78);
      }
      const dark = time?.isDark === true || hour < 5.5 || hour >= 20.5;
      sunMaterial.opacity = dark ? 0 : 0.90;
      sun.visible = !dark;
      cloudMaterial.opacity = dark ? 0.09 : 0.20;
      const drift = Number(time?.elapsedReal ?? time?.elapsed ?? 0);
      clouds.rotation.y = Number.isFinite(drift) ? drift * 0.0007 : 0;
      return palette;
    },
    dispose() {
      root.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
      sun.geometry.dispose();
      sunMaterial.dispose();
      cloudGeometry.dispose();
      cloudMaterial.dispose();
    },
  });
}
