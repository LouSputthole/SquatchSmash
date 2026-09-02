/** Optional Bada Bing performer beat built over the shared dress-help Module. */
import { createDressHelpSequence, DRESS_HELP_CUES } from '../world/dress-help.js';
import { createDressHelpFocus } from '../world/dress-help-focus.js';
import {
  createDressHelpActorStaging,
  placeDressHelpActor,
} from '../world/dress-help-staging.js';

export const BING_PERFORMER_BATHROOM_TIPS_REQUIRED = 3;
export const BING_PERFORMER_BATHROOM_CUES = Object.freeze([
  ...DRESS_HELP_CUES,
  'ui.select',
  'door.bathroom.close',
  /* The glue. Owner, 2026-09-01: "I want the glue to go on the back like we
   * had." The application rides the shared seven-hit rhythm through the rig
   * callbacks below — pickup at the start, a squeeze under every hit, the
   * tube giving at the finish. Same recorded cues the flat's frame gag owns. */
  'glue.pickup',
  'glue.squeeze',
  'glue.burst',
]);

const marker = (x, y, z, yaw = 0) => Object.freeze({ x, y, z, yaw });

/** Clear route from the runway, through the public arch and men's-room door. */
export const BING_PERFORMER_BATHROOM_ROUTE = Object.freeze([
  marker(-12, 0, -2.1),
  marker(-7.5, 0, -1.8),
  marker(-2.5, 0, 1.8),
  marker(3.8, 0, 3.3),
  marker(6.65, 0, 3.25, Math.PI),
  marker(6.65, 0, 0.7, Math.PI),
  marker(9, 0, 0.7, -Math.PI / 2),
  marker(10.65, 0, 1.72, -Math.PI / 2),
]);

export const BING_PERFORMER_BATHROOM_ACTOR_MARKER =
  BING_PERFORMER_BATHROOM_ROUTE.at(-1);
export const BING_PERFORMER_BATHROOM_PLAYER_MARKER =
  marker(9.1, 1.66, 1.72, -Math.PI / 2);

export function bingPerformerBathroomStageAction({
  tips = 0,
  state = 'locked',
  secondVisit = false,
} = {}) {
  return !secondVisit && state === 'locked' && tips >= BING_PERFORMER_BATHROOM_TIPS_REQUIRED
    ? 'invite'
    : 'tip';
}

/** Exact pose shared by browser play and the geometry gate. */
export function stageBingBathroomPerformer(actor) {
  const root = actor?.group ?? actor;
  if (!root?.position || !root?.rotation) {
    throw new TypeError('stageBingBathroomPerformer requires an actor root');
  }
  actor.job = 'stand';
  actor.baseY = BING_PERFORMER_BATHROOM_ACTOR_MARKER.y;
  actor.homeX = BING_PERFORMER_BATHROOM_ACTOR_MARKER.x;
  actor.homeZ = BING_PERFORMER_BATHROOM_ACTOR_MARKER.z;
  actor.route = null;
  actor.routeAt = 0;
  actor.look = false;
  actor.stand?.();
  if (!placeDressHelpActor(actor, BING_PERFORMER_BATHROOM_ACTOR_MARKER)) {
    throw new Error('Could not stage the Bing bathroom performer');
  }
  return actor;
}

function captureActor(actor) {
  return {
    x: actor.group.position.x, y: actor.group.position.y, z: actor.group.position.z,
    yaw: actor.group.rotation.y, job: actor.job, baseY: actor.baseY,
    homeX: actor.homeX, homeZ: actor.homeZ, route: actor.route,
    routeAt: actor.routeAt, look: actor.look, targetYaw: actor.targetYaw,
  };
}

function restoreActor(actor, prior) {
  actor.group.position.set(prior.x, prior.y, prior.z);
  actor.group.rotation.y = prior.yaw;
  Object.assign(actor, {
    job: prior.job, baseY: prior.baseY, homeX: prior.homeX, homeZ: prior.homeZ,
    route: prior.route, routeAt: prior.routeAt, look: prior.look, targetYaw: prior.targetYaw,
  });
  actor._syncJob?.(true);
}

function applyWalkPose(actor, seconds) {
  const swing = Math.sin(seconds * 8) * 0.42;
  if (actor.parts?.legL?.rotation) actor.parts.legL.rotation.x = swing;
  if (actor.parts?.legR?.rotation) actor.parts.legR.rotation.x = -swing;
  if (actor.parts?.armL?.rotation) actor.parts.armL.rotation.x = -swing * 0.65;
  if (actor.parts?.armR?.rotation) actor.parts.armR.rotation.x = swing * 0.65;
}

/**
 * All fours, facing away from the player at the door. Owner, 2026-09-01:
 * "She should get on in all fours and face away from you. And I want the
 * glue to go on the back."
 *
 * The rig has no waist joint, so the quadruped read is composed: the whole
 * figure pitches forward, drops toward the floor, the legs fold into a kneel
 * against the pitch, and the arms run straight down to stand on. `progress`
 * settles her slightly as the seam takes the glue.
 */
function applyAllFoursPose(actor, progress = 0) {
  const settle = Math.min(1, progress) * 0.05;
  actor.group.rotation.x = 0.82;
  actor.group.position.y = 0.34 - settle;
  actor.parts?.legL?.rotation?.set?.(-1.42, 0, 0);
  actor.parts?.legR?.rotation?.set?.(-1.42, 0, 0);
  actor.parts?.armL?.rotation?.set?.(-1.58, 0, -0.12);
  actor.parts?.armR?.rotation?.set?.(-1.58, 0, 0.12);
  actor.parts?.foreL?.rotation?.set?.(0, 0, 0);
  actor.parts?.foreR?.rotation?.set?.(0, 0, 0);
}

/** Undo the composed pose so a walk or a stand starts from neutral. */
function clearAllFoursPose(actor) {
  actor.group.rotation.x = 0;
  for (const part of ['legL', 'legR', 'armL', 'armR', 'foreL', 'foreR']) {
    actor.parts?.[part]?.rotation?.set?.(0, 0, 0);
  }
  actor.stand?.();
}

export function createBingPerformerBathroom({
  actor, door, player, interaction, audio, hud, timingBar,
  onDoorOpen, onReady, onComplete,
} = {}) {
  if (!actor?.group || !actor?.parts) throw new TypeError('Bing performer bathroom requires an actor');
  if (!door?.toggle) throw new TypeError('Bing performer bathroom requires the men’s-room door');
  if (!player || !interaction) throw new TypeError('Bing performer bathroom requires player and interaction');
  if (!audio?.play || !audio?.startLoop || !audio?.stopLoop) {
    throw new TypeError('Bing performer bathroom requires the scene audio Interface');
  }
  if (typeof timingBar !== 'function') throw new TypeError('Bing performer bathroom requires TimingBar');

  const origin = captureActor(actor);
  let state = 'locked';
  let routeAt = 0;
  let walkSeconds = 0;
  let progress = 0;
  let completion = null;
  const staging = createDressHelpActorStaging({
    actor,
    marker: BING_PERFORMER_BATHROOM_ACTOR_MARKER,
  });
  const focus = createDressHelpFocus({
    player,
    interaction,
    marker: BING_PERFORMER_BATHROOM_PLAYER_MARKER,
    target: () => ({
      x: actor.group.position.x,
      y: actor.group.position.y + 1.08,
      z: actor.group.position.z,
    }),
  });
  const sequence = createDressHelpSequence({
    timingBar,
    audio: {
      position: () => actor.group.position,
      play: (name, options) => audio.play(name, options),
      startLoop: (key, options) => audio.startLoop(key, options),
      stopLoop: (key, fade) => audio.stopLoop(key, fade),
    },
    rig: {
      begin() {
        staging.begin();
        actor.job = 'stand';
        actor.stand?.();
        focus.begin();
        /* Facing AWAY from the player at the door — the glue goes on the
         * back, so the back is what he gets. The player marker is due west
         * of hers; +PI/2 points her east. */
        actor.group.rotation.y = Math.PI / 2;
        actor.targetYaw = Math.PI / 2;
        applyAllFoursPose(actor);
        audio.play('glue.pickup', { volume: 0.5, position: actor.group.position });
        audio.play('glue.squeeze', {
          volume: 0.45, rate: 0.94, delay: 0.4, position: actor.group.position,
        });
        hud?.hidePrompt?.();
        hud?.setPosture?.('gluing the seam');
      },
      onHit({ index, total }) {
        progress = index / total;
        applyAllFoursPose(actor, progress);
        /* A squeeze under every pass, harder as the tube empties — the same
         * escalation the flat's frame gag authored for these recordings. */
        audio.play('glue.squeeze', {
          volume: 0.5 + progress * 0.38,
          rate: 1.0 - progress * 0.2,
          position: actor.group.position,
        });
        if (index !== total) hud?.toast?.(`${index}/${total}`, index >= total - 1 ? 'good' : '');
      },
      finish() {
        hud?.setTiming?.(null);
        hud?.setPosture?.(null);
        focus.end();
        staging.end();
        clearAllFoursPose(actor);
        stageBingBathroomPerformer(actor);
      },
      reset() {
        progress = 0;
        hud?.setTiming?.(null);
        hud?.setPosture?.(null);
        clearAllFoursPose(actor);
        focus.end();
      },
    },
    onProgress: ({ progress: next }) => { progress = next; },
    onComplete: (event) => {
      completion = { ...event };
      audio.play('glue.burst', {
        volume: 0.7, delay: 0.15, position: actor.group.position,
      });
      hud?.toast?.('Seam glued', 'good');
      hud?.say?.('Seven passes down the seam and the tube finally gives. She checks the hem in the mirror, nods, and heads back to work.', 5200);
      /* And back to the stage — she has a shift on. Owner, 2026-09-01:
       * "after, she needs to return back to the stage." The walk out takes
       * the authored route in reverse; arrival restores her captured stage
       * job, so she picks up exactly the life she left. */
      state = 'returning';
      routeAt = BING_PERFORMER_BATHROOM_ROUTE.length - 1;
      walkSeconds = 0;
      openDoorForRoute();
      onComplete?.(completion);
    },
    onAbandon: () => {
      state = 'ready';
      hud?.say?.('She holds the hem where it was. <em>Try again when you’re ready.</em>', 3600);
    },
  });

  function openDoorForRoute() {
    if (door.open) return true;
    const opened = door.toggle();
    if (opened) onDoorOpen?.(door);
    return opened;
  }

  function arrive() {
    stageBingBathroomPerformer(actor);
    state = 'ready';
    onReady?.();
    hud?.say?.('She checks the loose hem in the mirror and presses a tube of glue into your hand.<br><em>“Down the back seam, sweetheart. All of it.”</em>', 5200);
  }

  function updateFollowing(dt) {
    let travel = Math.max(0, dt) * 1.35;
    walkSeconds += Math.max(0, dt);
    while (travel > 0 && state === 'following') {
      if (routeAt >= BING_PERFORMER_BATHROOM_ROUTE.length) return arrive();
      if (routeAt >= 6 && !openDoorForRoute()) return;
      const target = BING_PERFORMER_BATHROOM_ROUTE[routeAt];
      const dx = target.x - actor.group.position.x;
      const dy = target.y - actor.group.position.y;
      const dz = target.z - actor.group.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance <= 0.035) {
        actor.group.position.set(target.x, target.y, target.z);
        routeAt++;
        continue;
      }
      const step = Math.min(distance, travel);
      actor.group.position.x += dx / distance * step;
      actor.group.position.y += dy / distance * step;
      actor.group.position.z += dz / distance * step;
      const yaw = Math.atan2(dx, dz);
      actor.group.rotation.y = yaw;
      actor.targetYaw = yaw;
      travel -= step;
    }
    applyWalkPose(actor, walkSeconds);
  }

  /* The same authored route, walked back out to the runway. Arrival restores
   * the actor snapshot captured at construction, so she resumes the exact
   * stage job, mark and idle she was pulled from. */
  function updateReturning(dt) {
    let travel = Math.max(0, dt) * 1.35;
    walkSeconds += Math.max(0, dt);
    while (travel > 0 && state === 'returning') {
      if (routeAt < 0) {
        restoreActor(actor, origin);
        state = 'complete';
        return;
      }
      const target = BING_PERFORMER_BATHROOM_ROUTE[routeAt];
      const dx = target.x - actor.group.position.x;
      const dy = target.y - actor.group.position.y;
      const dz = target.z - actor.group.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance <= 0.035) {
        actor.group.position.set(target.x, target.y, target.z);
        routeAt--;
        continue;
      }
      const step = Math.min(distance, travel);
      actor.group.position.x += dx / distance * step;
      actor.group.position.y += dy / distance * step;
      actor.group.position.z += dz / distance * step;
      const yaw = Math.atan2(dx, dz);
      actor.group.rotation.y = yaw;
      actor.targetYaw = yaw;
      travel -= step;
    }
    applyWalkPose(actor, walkSeconds);
  }

  return Object.freeze({
    invite(tips) {
      if (state !== 'locked' || tips < BING_PERFORMER_BATHROOM_TIPS_REQUIRED) return false;
      state = 'following';
      routeAt = 0;
      actor.job = 'stand';
      actor.look = false;
      actor._syncJob?.(true);
      audio.play('ui.select', { volume: 0.36, rate: 1.04 });
      hud?.say?.('She pockets the third twenty.<br><em>“Men’s room. Walk ahead.”</em>', 4600);
      return true;
    },
    start() {
      if (state !== 'ready') return false;
      state = 'active';
      if (!sequence.start()) { state = 'ready'; return false; }
      if (door.open && door.toggle()) {
        audio.play('door.bathroom.close', {
          volume: 0.52,
          position: door.pivot?.position ?? door.position ?? null,
        });
      }
      hud?.say?.('The nozzle has gone half solid. <em>Time it and squeeze.</em>', 4200);
      return true;
    },
    press: () => state === 'active' && sequence.press(),
    abandon: () => state === 'active' && sequence.abandon(),
    update(dt) {
      if (state === 'following') updateFollowing(dt);
      if (state === 'returning') updateReturning(dt);
      if (state === 'active') {
        hud?.setTiming?.(sequence.update(dt));
        applyAllFoursPose(actor, progress);
      }
      return state;
    },
    reset() {
      if (sequence.active) sequence.abandon();
      sequence.reset();
      restoreActor(actor, origin);
      state = 'locked';
      routeAt = 0;
      walkSeconds = 0;
      progress = 0;
      completion = null;
      return true;
    },
    stageAction(tips, secondVisit = false) {
      return bingPerformerBathroomStageAction({ tips, secondVisit, state });
    },
    get state() { return state; },
    get ready() { return state === 'ready'; },
    get active() { return state === 'active'; },
    /* Earned the moment the seam is glued: the walk back to the stage is
     * presentation, and no objective should wait on her commute. */
    get complete() { return state === 'complete' || state === 'returning'; },
    get debug() {
      return {
        state, routeAt, progress,
        completion: completion ? { ...completion } : null,
        focus: focus.debug, staging: staging.debug, sequence: sequence.debug,
      };
    },
  });
}
