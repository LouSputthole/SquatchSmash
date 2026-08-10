/**
 * Actor placement shared by Margo's proven dress-help pose and scene adapters.
 *
 * Margo's `setPose('kneeling')` established the important ordering: first put
 * the actor at one authored world marker and orientation, then articulate the
 * pose that reaches the fastening. This module extracts only that transform
 * operation. It does not know Margo's proportions, a pool lounger, or any
 * animation; those remain with their rigs.
 */

const finite = (value) => Number.isFinite(Number(value));

function resolvedMarker(value) {
  const marker = typeof value === 'function' ? value() : value;
  if (!finite(marker?.x) || !finite(marker?.y) || !finite(marker?.z)) return null;
  const rotation = marker.rotation ?? {};
  return {
    x: Number(marker.x),
    y: Number(marker.y),
    z: Number(marker.z),
    pitch: finite(marker.pitch) ? Number(marker.pitch)
      : finite(rotation.x) ? Number(rotation.x) : 0,
    yaw: finite(marker.yaw) ? Number(marker.yaw)
      : finite(rotation.y) ? Number(rotation.y) : 0,
    roll: finite(marker.roll) ? Number(marker.roll)
      : finite(rotation.z) ? Number(rotation.z) : 0,
  };
}
function actorRoot(actor) {
  return actor?.group ?? actor ?? null;
}

function setVector(target, x, y, z) {
  if (!target) return false;
  if (typeof target.set === 'function') target.set(x, y, z);
  else {
    target.x = x;
    target.y = y;
    target.z = z;
  }
  return true;
}

function angularDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/** Place an actor at one exact world marker before its rig applies a pose. */
export function placeDressHelpActor(actor, marker) {
  const root = actorRoot(actor);
  const at = resolvedMarker(marker);
  if (!root?.position || !root?.rotation || !at) return false;
  setVector(root.position, at.x, at.y, at.z);
  setVector(root.rotation, at.pitch, at.yaw, at.roll);
  /* Npc.update eases toward targetYaw after a scene adapter has placed it.
   * Pin the same authored orientation so the shared NPC loop cannot unwind
   * the dress staging on its next frame. Margo has no targetYaw and is left
   * untouched. */
  if (actor && Object.hasOwn(actor, 'targetYaw')) actor.targetYaw = at.yaw;
  return true;
}

/**
 * Reversible fixture adapter around `placeDressHelpActor`.
 *
 * The sequence begins at its authored marker and Q/completion hand the actor
 * back at precisely the transform it occupied before the interaction.
 */
export function createDressHelpActorStaging({ actor, marker } = {}) {
  let active = false;
  let prior = null;
  let lastMarker = null;

  const capture = () => {
    const root = actorRoot(actor);
    if (!root?.position || !root?.rotation) return null;
    return {
      x: root.position.x,
      y: root.position.y,
      z: root.position.z,
      pitch: root.rotation.x,
      yaw: root.rotation.y,
      roll: root.rotation.z,
      targetYaw: actor?.targetYaw,
    };
  };

  const apply = () => {
    const at = resolvedMarker(marker);
    if (!at || !placeDressHelpActor(actor, at)) return false;
    lastMarker = at;
    return true;
  };

  const restore = () => {
    const root = actorRoot(actor);
    if (!prior || !root?.position || !root?.rotation) return false;
    setVector(root.position, prior.x, prior.y, prior.z);
    setVector(root.rotation, prior.pitch, prior.yaw, prior.roll);
    if (actor && Object.hasOwn(actor, 'targetYaw')) actor.targetYaw = prior.targetYaw;
    return true;
  };

  return Object.freeze({
    begin() {
      if (active) return false;
      prior = capture();
      if (!prior || !apply()) {
        prior = null;
        return false;
      }
      active = true;
      return true;
    },
    apply,
    end() {
      if (!active) return false;
      active = false;
      const restored = restore();
      prior = null;
      return restored;
    },
    get active() { return active; },
    get debug() {
      const root = actorRoot(actor);
      const at = lastMarker ?? resolvedMarker(marker);
      const markerDistance = root?.position && at
        ? Math.hypot(root.position.x - at.x, root.position.y - at.y, root.position.z - at.z)
        : null;
      const yawError = root?.rotation && at
        ? angularDistance(root.rotation.y, at.yaw)
        : null;
      return {
        active,
        marker: at ? {
          x: at.x, y: at.y, z: at.z,
          pitch: at.pitch, yaw: at.yaw, roll: at.roll,
        } : null,
        markerDistance,
        yawError,
      };
    },
  });
}
