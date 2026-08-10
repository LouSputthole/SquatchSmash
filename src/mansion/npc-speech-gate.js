/**
 * One hearing rule for every person in Lou's house.
 *
 * Mansion speech used to have two unrelated proximity systems. The cast
 * measured the player against a body, but ignored walls; PROJECT SILENT
 * SQUATCH measured the player against a room anchor, but ignored the body.
 * Both also played dry voice takes without a position. This small service is
 * the shared boundary: callers ask whether a real speaker is audible, commit
 * only after they actually put a line on the floor, and use `position(id)` for
 * the panner.
 *
 * The module deliberately knows no THREE classes. Production passes Box3-like
 * colliders and Vector3-like points; Node tests pass plain objects.
 */

const DEFAULT_RANGE = 5;
const DEFAULT_VERTICAL_TOLERANCE = 2.4;
const DEFAULT_COOLDOWN = 12;
const DEFAULT_EAR_HEIGHT = 1.42;
const DEFAULT_ENDPOINT_PADDING = 0.24;
const EPSILON = 1e-8;

function finitePoint(value) {
  const point = value?.group?.position ?? value?.position ?? value;
  return Number.isFinite(point?.x) && Number.isFinite(point?.y) && Number.isFinite(point?.z)
    ? point
    : null;
}

function resolved(provider, ...args) {
  return typeof provider === 'function' ? provider(...args) : provider;
}

function validBox(box) {
  return finitePoint(box?.min) && finitePoint(box?.max);
}

/** Whether the padded open segment between two ear points crosses an AABB. */
function segmentCrossesBox(from, to, box, padding) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  if (length <= EPSILON) return false;

  /* Leave a short open interval at both ends. A door jamb touching the
   * listener, or the furniture directly under a speaker, is not a wall
   * between them. */
  let enter = Math.min(0.49, Math.max(0, padding) / length);
  let leave = 1 - enter;
  const axes = [
    [from.x, dx, box.min.x, box.max.x],
    [from.y, dy, box.min.y, box.max.y],
    [from.z, dz, box.min.z, box.max.z],
  ];

  for (const [origin, direction, rawMin, rawMax] of axes) {
    const min = Math.min(rawMin, rawMax);
    const max = Math.max(rawMin, rawMax);
    if (Math.abs(direction) <= EPSILON) {
      if (origin < min || origin > max) return false;
      continue;
    }
    let a = (min - origin) / direction;
    let b = (max - origin) / direction;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a);
    leave = Math.min(leave, b);
    if (enter > leave) return false;
  }
  return enter <= leave;
}

export function createNpcSpeechGate({
  listener = null,
  speaker = null,
  blockers = null,
  range = DEFAULT_RANGE,
  verticalTolerance = DEFAULT_VERTICAL_TOLERANCE,
  cooldown = DEFAULT_COOLDOWN,
  earHeight = DEFAULT_EAR_HEIGHT,
  endpointPadding = DEFAULT_ENDPOINT_PADDING,
} = {}) {
  let elapsed = 0;
  const lastSpokenAt = new Map();

  function position(id) {
    return finitePoint(resolved(speaker, id));
  }

  function inspect(id, options = {}) {
    const listenerAt = finitePoint(options.listenerPosition ?? resolved(listener));
    const speakerAt = finitePoint(options.speakerPosition ?? position(id));
    if (!listenerAt || !speakerAt) {
      return Object.freeze({ allowed: false, reason: 'missing', distance: Infinity, vertical: Infinity });
    }

    const distance = Math.hypot(listenerAt.x - speakerAt.x, listenerAt.z - speakerAt.z);
    const hearingRange = Number.isFinite(options.range) ? Math.max(0, options.range) : range;
    if (distance > hearingRange) {
      return Object.freeze({ allowed: false, reason: 'distance', distance, vertical: Math.abs(listenerAt.y - speakerAt.y) });
    }

    const vertical = Math.abs(listenerAt.y - speakerAt.y);
    const floorTolerance = Number.isFinite(options.verticalTolerance)
      ? Math.max(0, options.verticalTolerance)
      : verticalTolerance;
    if (vertical > floorTolerance) {
      return Object.freeze({ allowed: false, reason: 'floor', distance, vertical });
    }

    if (options.occlusion !== false) {
      const from = { x: listenerAt.x, y: listenerAt.y + earHeight, z: listenerAt.z };
      const to = { x: speakerAt.x, y: speakerAt.y + earHeight, z: speakerAt.z };
      const boxes = resolved(options.blockers ?? blockers) ?? [];
      /* A speaker can stand inside an authored fixture (the driveway booth)
       * without that fixture swallowing every line. Exceptions are exact
       * Box3 identities, never dimensions or a global LOS toggle, so every
       * unrelated wall/floor remains authoritative. */
      const ignored = options.ignoreBlockers ?? null;
      for (const box of boxes) {
        if (!validBox(box)) continue;
        if (ignored?.has?.(box) || (Array.isArray(ignored) && ignored.includes(box))) continue;
        if (segmentCrossesBox(from, to, box, endpointPadding)) {
          return Object.freeze({ allowed: false, reason: 'occluded', distance, vertical });
        }
      }
    }

    if (options.cooldown !== false) {
      const last = lastSpokenAt.get(id);
      const wait = Number.isFinite(options.cooldownSeconds)
        ? Math.max(0, options.cooldownSeconds)
        : cooldown;
      if (last !== undefined && elapsed - last < wait) {
        return Object.freeze({
          allowed: false,
          reason: 'cooldown',
          distance,
          vertical,
          remaining: wait - (elapsed - last),
        });
      }
    }

    return Object.freeze({ allowed: true, reason: 'audible', distance, vertical, remaining: 0 });
  }

  return Object.freeze({
    inspect,
    canSpeak: (id, options) => inspect(id, options).allowed,
    position,
    commit(id) {
      if (typeof id !== 'string' || id.length === 0) return false;
      lastSpokenAt.set(id, elapsed);
      return true;
    },
    update(dt) {
      if (Number.isFinite(dt) && dt > 0) elapsed += dt;
      return elapsed;
    },
    reset(id = null) {
      if (id === null) lastSpokenAt.clear();
      else lastSpokenAt.delete(id);
    },
    debug: {
      get elapsed() { return elapsed; },
      heard(id) { return lastSpokenAt.has(id); },
      remaining(id) {
        const last = lastSpokenAt.get(id);
        return last === undefined ? 0 : Math.max(0, cooldown - (elapsed - last));
      },
    },
  });
}
