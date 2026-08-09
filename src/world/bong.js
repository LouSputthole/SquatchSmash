/**
 * One bong, wherever the set dresser puts it.
 *
 * Geometry, the invisible interaction volume and the actual smoke/high
 * behaviour used to be three unrelated call-site conventions. The apartment
 * owned all three while the Mansion LAN room only borrowed the glass model,
 * leaving a prop that looked usable and did nothing. This module is the small
 * shared seam: both scenes build the same named object, register the same hold
 * interaction, and run the same audio/smoke/intoxication sequence.
 */
import * as THREE from 'three';
import { box } from './build.js';
import { makeBong } from './props.js';

export const BONG_OBJECT_NAMES = Object.freeze({
  root: 'bong.interactive',
  bowl: 'bong.interactive.bowl',
  target: 'bong.interactive.target',
});

/** Build the shared visible prop and its raycastable interaction target. */
export function buildInteractiveBong(M, { x, y, z, rotY = 0 } = {}) {
  const built = makeBong(M, { x, y, z, rotY });
  built.group.name = BONG_OBJECT_NAMES.root;
  built.bowl.name = BONG_OBJECT_NAMES.bowl;

  const target = box({
    size: [0.20, 0.42, 0.20],
    pos: [x, y + 0.20, z],
    mat: new THREE.MeshBasicMaterial({ visible: false }),
    cast: false,
    receive: false,
  });
  target.name = BONG_OBJECT_NAMES.target;
  target.userData.bongRoot = built.group;
  return { ...built, target, hit: target };
}

/** Give a built bong the apartment's exact hold-to-pack interaction. */
export function registerInteractiveBong(interaction, bong, {
  onUse,
  enabled = () => true,
} = {}) {
  if (!interaction?.register || !bong?.target) return null;
  const descriptor = {
    label: () => 'Pack a <b>bowl</b>',
    hold: 0.9,
    holdLabel: () => 'Hold it…',
    enabled,
    onUse: () => onUse?.() === true,
  };
  interaction.register(bong.target, descriptor);
  return descriptor;
}

/**
 * The apartment's functioning-bong behaviour, dependency-injected so a
 * second scene can use it without importing the apartment composition root.
 */
export function createBongBehavior({
  blocked = () => false,
  audio = null,
  highs = null,
  smoke = null,
  origin = null,
  direction = null,
  hud = null,
  onUsed = null,
} = {}) {
  let uses = 0;

  function use() {
    if (blocked?.() === true) return false;
    audio?.play?.('cig.light', { volume: 0.6 });
    audio?.play?.('bong.bubble', { volume: 0.8, delay: 0.5 });
    audio?.play?.('cig.exhale', { volume: 0.6, delay: 2.6 });
    audio?.say?.('bong', { chance: 0.8, delay: 3.4 });
    highs?.smokeBong?.();

    const at = origin?.();
    const forward = direction?.();
    if (at && forward) {
      smoke?.emit?.(at, forward, { count: 14, spread: 0.5, speed: 0.7 });
    }

    uses += 1;
    hud?.toast?.('That is going to take a minute', 'good');
    hud?.say?.((highs?.weed ?? 0) > 0.6
      ? 'Everything has slowed down and you are fine with it.'
      : 'The room gets softer at the edges.', 5200);
    onUsed?.({ uses, weed: highs?.weed ?? 0 });
    return true;
  }

  return {
    use,
    get uses() { return uses; },
    get weed() { return highs?.weed ?? 0; },
  };
}
